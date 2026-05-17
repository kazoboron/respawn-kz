import { supabase } from '../lib/supabase';
import { requireClubAdmin } from '../lib/route-guards';
import {
  type Booking,
  type BookingStatus,
  STATUS_LABELS,
  STATUS_COLORS,
} from '../data/supabase-types';
import { notify } from '../lib/notifications';
interface Filters {
  club: string;
  status: string;
  dateFrom: string;
}

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

interface ClubLite { slug: string; name: string; }
let allClubs: ClubLite[] = [];

async function loadClubsLite(): Promise<void> {
  const { data } = await supabase.from('clubs').select('slug, name');
  allClubs = (data ?? []) as ClubLite[];
}

function getClubName(slug: string): string {
  return allClubs.find((c) => c.slug === slug)?.name ?? slug;
}

// Available transitions for a given booking status (admin perspective)
function availableTransitions(current: BookingStatus): BookingStatus[] {
  switch (current) {
    case 'pending':
      return ['confirmed', 'cancelled'];
    case 'confirmed':
      return ['completed', 'no_show', 'cancelled'];
    default:
      return []; // terminal: no transitions
  }
}

function transitionLabel(to: BookingStatus): string {
  switch (to) {
    case 'confirmed': return 'Подтвердить';
    case 'completed': return 'Завершить';
    case 'no_show': return 'Не пришёл';
    case 'cancelled': return 'Отменить';
    default: return STATUS_LABELS[to];
  }
}

function transitionClass(to: BookingStatus): string {
  if (to === 'cancelled' || to === 'no_show') return 'btn btn--ghost btn--sm';
  return 'btn btn--primary btn--sm';
}

function renderBookingCard(b: Booking): string {
  const transitions = availableTransitions(b.status);
  const buttons = transitions.map((to) =>
    `<button type="button" class="${transitionClass(to)}" data-transition="${to}" data-id="${b.id}">${transitionLabel(to)}</button>`
  ).join('');

  return `
    <article class="booking-card" data-booking-id="${b.id}">
      <div class="booking-card__main">
        <h3 class="booking-card__title">${getClubName(b.club_slug)}</h3>
        <div class="booking-card__meta">
          <span>${formatDate(b.date)}</span>
          <span class="club-card__meta-sep">·</span>
          <span>${b.time_slot}, ${b.hours}ч</span>
          <span class="club-card__meta-sep">·</span>
          <span>${formatPrice(b.total_price)} ₸</span>
        </div>
      </div>
      <div class="booking-card__side">
        <span class="pill ${STATUS_COLORS[b.status]}">${STATUS_LABELS[b.status]}</span>
        ${buttons ? `<div class="booking-card__actions">${buttons}</div>` : ''}
      </div>
    </article>
  `;
}

async function loadBookings(clubSlugs: string[], isSuperAdmin: boolean, filters: Filters): Promise<Booking[]> {
  let query = supabase.from('bookings').select('*').order('date', { ascending: false });

  if (!isSuperAdmin && clubSlugs.length > 0) {
    query = query.in('club_slug', clubSlugs);
  }

  if (filters.club) query = query.eq('club_slug', filters.club);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.dateFrom) query = query.gte('date', filters.dateFrom);

  const { data, error } = await query.limit(200);
  if (error) {
    console.error('[bookings] load failed', error);
    return [];
  }
  return (data ?? []) as Booking[];
}

async function transitionBooking(id: string, newStatus: BookingStatus): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: newStatus })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function fireNotificationForTransition(b: Booking, newStatus: BookingStatus, customerEmail: string): Promise<void> {
  switch (newStatus) {
    case 'confirmed':
      await notify({ type: 'booking_confirmed', bookingId: b.id, customerEmail });
      break;
    case 'cancelled':
      await notify({ type: 'booking_cancelled', bookingId: b.id, recipientEmails: [customerEmail] });
      break;
    case 'completed':
      await notify({ type: 'booking_completed', bookingId: b.id, customerEmail });
      break;
    case 'no_show':
      await notify({ type: 'booking_no_show', bookingId: b.id, customerEmail });
      break;
  }
}

export async function setupDashboardBookings(): Promise<void> {
  const root = document.getElementById('bookings-root');
  if (!root) return;

  const loadingEl = document.getElementById('bookings-loading');
  const filtersEl = document.getElementById('bookings-filters');
  const listEl = document.getElementById('bookings-list');
  const emptyEl = document.getElementById('bookings-empty');
  if (!loadingEl || !filtersEl || !listEl || !emptyEl) return;

  // Gate
  const { clubSlugs, isSuperAdmin } = await requireClubAdmin();
  await loadClubsLite();

  // Populate club filter
  const clubSelect = document.getElementById('filter-club') as HTMLSelectElement;
  const allowedClubs = isSuperAdmin
    ? allClubs
    : allClubs.filter((c) => clubSlugs.includes(c.slug));
  allowedClubs.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.slug;
    opt.textContent = c.name;
    clubSelect.appendChild(opt);
  });

  filtersEl.hidden = false;

  // Reactive load
  const filters: Filters = { club: '', status: '', dateFrom: '' };

  // Cache user emails by user_id to enable notification firing
  const userEmailCache = new Map<string, string>();
  async function getCustomerEmail(userId: string): Promise<string> {
    if (userEmailCache.has(userId)) return userEmailCache.get(userId)!;
    // Note: we cannot directly query auth.users from client. For MVP, we use
    // a placeholder email and let notify() stub log it. When Resend is wired,
    // an Edge Function will resolve the email server-side.
    const placeholder = `user-${userId.slice(0, 8)}@unknown`;
    userEmailCache.set(userId, placeholder);
    return placeholder;
  }

  async function refresh() {
    loadingEl!.hidden = false;
    listEl!.hidden = true;
    emptyEl!.hidden = true;

    const bookings = await loadBookings(clubSlugs, isSuperAdmin, filters);
    loadingEl!.hidden = true;

    if (bookings.length === 0) {
      emptyEl!.hidden = false;
      return;
    }

    listEl!.innerHTML = bookings.map(renderBookingCard).join('');
    listEl!.hidden = false;
  }

  // Filter handlers
  clubSelect.addEventListener('change', () => { filters.club = clubSelect.value; refresh(); });
  (document.getElementById('filter-status') as HTMLSelectElement).addEventListener('change', (e) => {
    filters.status = (e.target as HTMLSelectElement).value;
    refresh();
  });
  (document.getElementById('filter-date-from') as HTMLInputElement).addEventListener('change', (e) => {
    filters.dateFrom = (e.target as HTMLInputElement).value;
    refresh();
  });
  document.getElementById('filter-reset')?.addEventListener('click', () => {
    filters.club = ''; filters.status = ''; filters.dateFrom = '';
    clubSelect.value = '';
    (document.getElementById('filter-status') as HTMLSelectElement).value = '';
    (document.getElementById('filter-date-from') as HTMLInputElement).value = '';
    refresh();
  });

  // Transition button handler (event delegation)
  listEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('[data-transition]') as HTMLButtonElement | null;
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const to = btn.getAttribute('data-transition') as BookingStatus | null;
    if (!id || !to) return;

    if (!window.confirm(`Перевести в статус "${STATUS_LABELS[to]}"?`)) return;

    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = 'Сохраняем…';

    const result = await transitionBooking(id, to);
    if (!result.ok) {
      btn.disabled = false;
      btn.textContent = oldText;
      alert(`Не удалось: ${result.error}`);
      return;
    }

    // Find the booking record to fire notification
    const card = btn.closest('[data-booking-id]') as HTMLElement;
    const bookingId = card.getAttribute('data-booking-id')!;
    // Re-fetch the booking for accurate state; customer email not available client-side
    const { data: updated } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
    if (updated) {
      const customerEmail = await getCustomerEmail(updated.user_id);
      await fireNotificationForTransition(updated as Booking, to, customerEmail);
    }

    // Refresh full list to update buttons and pills
    refresh();
  });

  // Initial load
  await refresh();
}
