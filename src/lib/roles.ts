import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';

export interface RoleSnapshot {
  user: User | null;
  isSuperAdmin: boolean;
  clubSlugs: string[];
}

const CACHE_KEY = 'respawn.roles';
const CACHE_TTL_MS = 60_000; // 1 minute

interface CacheEntry {
  fetchedAt: number;
  snapshot: RoleSnapshot;
}

function readCache(): RoleSnapshot | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
    return entry.snapshot;
  } catch {
    return null;
  }
}

function writeCache(snapshot: RoleSnapshot): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const entry: CacheEntry = { fetchedAt: Date.now(), snapshot };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {}
}

export function clearRolesCache(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {}
}

export async function getRoles(forceRefresh = false): Promise<RoleSnapshot> {
  if (!forceRefresh) {
    const cached = readCache();
    if (cached) return cached;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const empty: RoleSnapshot = { user: null, isSuperAdmin: false, clubSlugs: [] };
    writeCache(empty);
    return empty;
  }

  const [{ data: superRow }, { data: adminRows }] = await Promise.all([
    supabase.from('super_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('club_admins').select('club_slug').eq('user_id', user.id),
  ]);

  const snapshot: RoleSnapshot = {
    user,
    isSuperAdmin: !!superRow,
    clubSlugs: (adminRows ?? []).map((r: { club_slug: string }) => r.club_slug),
  };
  writeCache(snapshot);
  return snapshot;
}
