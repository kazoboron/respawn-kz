import { supabase, supabaseConfigured } from '../lib/supabase';
import { getCurrentUser } from './auth';
import { type Booking, type Review, STATUS_LABELS, STATUS_COLORS, isTerminalStatus } from '../data/supabase-types';
import { CITY_LABELS } from '../data/cities';

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderReviewFooter(b: Booking, r: Review | undefined): string {
  if (b.status !== 'completed') return '';
  if (r) {
    const excerpt = r.text.length > 80 ? r.text.slice(0, 80) + '…' : r.text;
    return `
      <div class="me-booking__review">
        <span class="pill pill--rating">★ ${r.rating}</span>
        <span class="me-review-excerpt">${escapeHtml(excerpt)}</span>
      </div>
    `;
  }
  return `
    <div class="me-booking__review">
      <a class="btn btn--sm btn--ghost" href="/reviews/new?booking_id=${b.id}">Оставить отзыв</a>
    </div>
  `;
}

function renderBookingCard(b: Booking, r: Review | undefined): string {
  const cityLabel = CITY_LABELS[b.city_id] ?? b.city_id;
  const today = new Date().toISOString().slice(0, 10);
  const canCancel = !isTerminalStatus(b.status) && b.date >= today;
  const canReschedule = b.status === 'pending' && b.date >= today;
  const statusClass = `pill ${STATUS_COLORS[b.status]}`;
  return `
    <article class="me-booking" data-booking-id="${b.id}">
      <div class="me-booking__main">
        <h3 class="me-booking__name"><a href="/clubs/${b.club_slug}/">${b.club_name}</a></h3>
        <div class="me-booking__meta">
          <span>${cityLabel}</span>
          <span class="club-card__meta-sep">·</span>
          <span>${formatDate(b.date)}</span>
          <span class="club-card__meta-sep">·</span>
          <span>${b.time_slot}, ${b.hours} ч</span>
        </div>
      </div>
      <div class="me-booking__side">
        <div class="me-booking__price">${formatPrice(b.total_price)} ₸</div>
        <span class="${statusClass}">${STATUS_LABELS[b.status]}</span>
        ${canReschedule ? `<button class="btn btn--ghost btn--sm" data-reschedule="${b.id}">Изменить</button>` : ''}
        ${canCancel ? `<button class="btn btn--ghost btn--sm" data-cancel="${b.id}">Отменить</button>` : ''}
      </div>
      ${renderReviewFooter(b, r)}
    </article>
  `;
}

async function loadBookings(): Promise<Booking[] | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[me] failed to load bookings', error);
    return null;
  }
  return data as Booking[];
}

async function loadReviewsByBookingIds(ids: string[]): Promise<Map<string, Review>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .in('booking_id', ids);
  if (error) {
    console.error('[me] failed to load reviews', error);
    return new Map();
  }
  const map = new Map<string, Review>();
  for (const r of (data ?? []) as Review[]) map.set(r.booking_id, r);
  return map;
}

async function cancelBooking(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', id);
  return !error;
}

export async function setupMePage(): Promise<void> {
  const root = document.getElementById('me-root');
  const listEl = document.getElementById('me-bookings');
  const emptyEl = document.getElementById('me-empty');
  const emailEl = document.getElementById('me-email');
  const loadingEl = document.getElementById('me-loading');
  if (!root || !listEl || !emptyEl) return;

  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/login/?return=/me/';
    return;
  }

  if (emailEl) emailEl.textContent = user.email ?? '';

  if (!supabaseConfigured) {
    const banner = document.getElementById('me-demo-banner');
    if (banner) banner.hidden = false;
  }

  const bookings = await loadBookings();
  if (loadingEl) loadingEl.hidden = true;

  if (!bookings || bookings.length === 0) {
    emptyEl.hidden = false;
    return;
  }

  const completedIds = bookings.filter((b) => b.status === 'completed').map((b) => b.id);
  const reviewMap = await loadReviewsByBookingIds(completedIds);

  listEl.innerHTML = bookings.map((b) => renderBookingCard(b, reviewMap.get(b.id))).join('');
  listEl.hidden = false;

  listEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    const rescheduleBtn = target.closest('[data-reschedule]') as HTMLElement | null;
    if (rescheduleBtn) {
      const id = rescheduleBtn.getAttribute('data-reschedule');
      if (!id) return;
      const booking = bookings.find((b) => b.id === id);
      if (!booking) return;
      const { openRescheduleModal } = await import('./booking-reschedule');
      await openRescheduleModal(booking);
      // After modal closes, reload to reflect new state (cheap + safe for MVP).
      window.location.reload();
      return;
    }

    const cancelBtn = target.closest('[data-cancel]') as HTMLElement | null;
    if (!cancelBtn) return;
    const id = cancelBtn.getAttribute('data-cancel');
    if (!id) return;

    if (!window.confirm('Точно отменить бронь?')) return;

    cancelBtn.setAttribute('disabled', '');
    cancelBtn.textContent = 'Отменяем…';
    const ok = await cancelBooking(id);
    if (!ok) {
      cancelBtn.removeAttribute('disabled');
      cancelBtn.textContent = 'Отменить';
      alert('Не удалось отменить. Попробуй ещё раз.');
      return;
    }

    const card = cancelBtn.closest('[data-booking-id]') as HTMLElement;
    const statusEl = card.querySelector('.pill') as HTMLElement;
    statusEl.className = 'pill pill--cancelled';
    statusEl.textContent = STATUS_LABELS.cancelled;
    cancelBtn.remove();
  });
}
