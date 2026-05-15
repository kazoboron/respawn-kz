import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = !!(url && key);

if (!supabaseConfigured) {
  console.info(
    '[respawn.kz] Запущен в DEMO-режиме (localStorage). Чтобы переключить на реальный Supabase, заполни .env (см. .env.example).'
  );
}

// =====================================================================
// localStorage-стаб с тем же API что у Supabase v2 клиента.
// Активируется автоматически если PUBLIC_SUPABASE_URL/KEY отсутствуют.
// =====================================================================

interface DemoUser {
  id: string;
  email: string;
}

interface DemoBooking {
  id: string;
  user_id: string;
  club_slug: string;
  club_name: string;
  city_id: string;
  date: string;
  time_slot: string;
  hours: number;
  price_per_hour: number;
  total_price: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  created_at: string;
}

const KEY_USER = 'respawn.demo.user';
const KEY_BOOKINGS = 'respawn.demo.bookings';

function safeGet<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function safeRemove(key: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {}
}

type AuthListener = (event: string, session: { user: DemoUser } | null) => void;
const authListeners: AuthListener[] = [];

function notifyAuth(): void {
  const user = safeGet<DemoUser | null>(KEY_USER, null);
  const session = user ? { user } : null;
  authListeners.forEach((l) => l(user ? 'SIGNED_IN' : 'SIGNED_OUT', session));
}

function makeDemoClient() {
  return {
    auth: {
      async getUser() {
        const user = safeGet<DemoUser | null>(KEY_USER, null);
        return { data: { user }, error: null };
      },
      async getSession() {
        const user = safeGet<DemoUser | null>(KEY_USER, null);
        return {
          data: { session: user ? { user } : null },
          error: null,
        };
      },
      async signInWithOtp({ email }: { email: string; options?: unknown }) {
        // В демо: мгновенный логин без письма.
        const cleanEmail = email.trim().toLowerCase();
        const user: DemoUser = { id: `demo-${cleanEmail}`, email: cleanEmail };
        safeSet(KEY_USER, user);
        notifyAuth();
        return { data: { user, session: { user } }, error: null };
      },
      async signOut() {
        safeRemove(KEY_USER);
        notifyAuth();
        return { error: null };
      },
      onAuthStateChange(callback: AuthListener) {
        authListeners.push(callback);
        return {
          data: {
            subscription: {
              unsubscribe() {
                const idx = authListeners.indexOf(callback);
                if (idx >= 0) authListeners.splice(idx, 1);
              },
            },
          },
        };
      },
    },
    from(table: string) {
      if (table !== 'bookings') {
        return makeUnsupportedTable();
      }
      return makeBookingsQuery();
    },
  };
}

function makeUnsupportedTable() {
  const reject = async () => ({
    data: null,
    error: { message: `Demo backend: table not supported` },
  });
  return {
    insert: reject,
    select: () => ({ order: reject, eq: reject }),
    update: () => ({ eq: reject }),
  };
}

function makeBookingsQuery() {
  return {
    async insert(row: Partial<DemoBooking>) {
      const user = safeGet<DemoUser | null>(KEY_USER, null);
      if (!user) {
        return { data: null, error: { message: 'Not authenticated' } };
      }
      const all = safeGet<DemoBooking[]>(KEY_BOOKINGS, []);
      const created = new Date().toISOString();
      const newRow: DemoBooking = {
        id: cryptoRandomId(),
        user_id: user.id,
        status: 'pending',
        created_at: created,
        club_slug: row.club_slug ?? '',
        club_name: row.club_name ?? '',
        city_id: row.city_id ?? '',
        date: row.date ?? '',
        time_slot: row.time_slot ?? '',
        hours: row.hours ?? 1,
        price_per_hour: row.price_per_hour ?? 0,
        total_price: row.total_price ?? 0,
      };
      all.push(newRow);
      safeSet(KEY_BOOKINGS, all);
      return { data: newRow, error: null };
    },
    select(_cols?: string) {
      return {
        async order(col: keyof DemoBooking, opts?: { ascending?: boolean }) {
          const user = safeGet<DemoUser | null>(KEY_USER, null);
          if (!user) return { data: [], error: null };
          const all = safeGet<DemoBooking[]>(KEY_BOOKINGS, [])
            .filter((r) => r.user_id === user.id);
          const asc = opts?.ascending ?? true;
          all.sort((a, b) => {
            const av = a[col] as string;
            const bv = b[col] as string;
            if (av === bv) return 0;
            return asc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
          });
          return { data: all, error: null };
        },
      };
    },
    update(patch: Partial<DemoBooking>) {
      return {
        async eq(col: keyof DemoBooking, value: string) {
          const user = safeGet<DemoUser | null>(KEY_USER, null);
          if (!user) return { data: null, error: { message: 'Not authenticated' } };
          const all = safeGet<DemoBooking[]>(KEY_BOOKINGS, []);
          let modified = false;
          const updated = all.map((row) => {
            if (row.user_id !== user.id) return row;
            if ((row[col] as string) === value) {
              modified = true;
              return { ...row, ...patch };
            }
            return row;
          });
          if (modified) safeSet(KEY_BOOKINGS, updated);
          return { data: null, error: null };
        },
      };
    },
  };
}

function cryptoRandomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return 'demo-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

// =====================================================================
// Экспорт: реальный клиент если есть env, иначе демо-стаб с тем же API.
// =====================================================================

export const supabase: SupabaseClient = supabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : (makeDemoClient() as unknown as SupabaseClient);
