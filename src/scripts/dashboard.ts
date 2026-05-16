import { supabase } from '../lib/supabase';
import { requireClubAdmin } from '../lib/route-guards';
import { type Booking, STATUS_LABELS, STATUS_COLORS } from '../data/supabase-types';
import { CLUBS } from '../data/clubs';

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getClubName(slug: string): string {
  return CLUBS.find((c) => c.slug === slug)?.name ?? slug;
}

function renderRecentRow(b: Booking): string {
  return `
    <article class="dashboard-recent__item">
      <div class="dashboard-recent__main">
        <strong>${getClubName(b.club_slug)}</strong>
        <span class="dashboard-recent__meta">${formatDate(b.date)} · ${b.time_slot} · ${b.hours}ч</span>
      </div>
      <div class="dashboard-recent__side">
        <span>${formatPrice(b.total_price)} ₸</span>
        <span class="pill ${STATUS_COLORS[b.status]}">${STATUS_LABELS[b.status]}</span>
      </div>
    </article>
  `;
}

export async function setupDashboard(): Promise<void> {
  const root = document.getElementById('dashboard-root');
  if (!root) return;

  const loadingEl = document.getElementById('dashboard-loading');
  const statsEl = document.getElementById('dashboard-stats');
  const recentEl = document.getElementById('dashboard-recent');
  const recentListEl = document.getElementById('dashboard-recent-list');
  const emptyEl = document.getElementById('dashboard-empty');
  if (!loadingEl || !statsEl || !recentEl || !recentListEl || !emptyEl) return;

  // Gate: require club_admin or super_admin
  const { clubSlugs, isSuperAdmin } = await requireClubAdmin();

  if (clubSlugs.length === 0 && !isSuperAdmin) {
    loadingEl.hidden = true;
    emptyEl.hidden = false;
    return;
  }

  // Load bookings of user's clubs
  let query = supabase.from('bookings').select('*').order('created_at', { ascending: false });
  if (!isSuperAdmin && clubSlugs.length > 0) {
    query = query.in('club_slug', clubSlugs);
  }
  const { data, error } = await query.limit(50);

  loadingEl.hidden = true;

  if (error) {
    console.error('[dashboard] failed to load bookings', error);
    emptyEl.innerHTML = `<p>Ошибка загрузки: ${error.message}</p>`;
    emptyEl.hidden = false;
    return;
  }

  const bookings = (data ?? []) as Booking[];

  // Compute stats
  const today = todayISO();
  const todayCount = bookings.filter((b) => b.date === today).length;
  const pendingCount = bookings.filter((b) => b.status === 'pending').length;
  const clubsCount = isSuperAdmin ? 'все' : String(clubSlugs.length);

  document.getElementById('stat-today')!.textContent = String(todayCount);
  document.getElementById('stat-pending')!.textContent = String(pendingCount);
  document.getElementById('stat-clubs')!.textContent = clubsCount;
  statsEl.hidden = false;

  // Recent bookings (last 10)
  const recent = bookings.slice(0, 10);
  if (recent.length === 0) {
    recentListEl.innerHTML = '<p style="color:var(--text-muted)">Пока нет броней</p>';
  } else {
    recentListEl.innerHTML = recent.map(renderRecentRow).join('');
  }
  recentEl.hidden = false;
}
