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

function renderReviewFooter(b: Booking, r: Review | undefined, aria: string): string {
  if (b.status !== 'completed') return '';
  if (r) {
    const excerpt = r.text.length > 80 ? r.text.slice(0, 80) + '…' : r.text;
    return `
      <div class="me-booking__review">
        <span class="pill pill--rating" aria-label="Рейтинг ${r.rating} из 5"><span aria-hidden="true">★</span> ${r.rating}</span>
        <span class="me-review-excerpt">${escapeHtml(excerpt)}</span>
        <button class="btn btn--ghost btn--sm" data-delete-review="${r.id}" aria-label="Удалить отзыв на ${aria}">Удалить отзыв</button>
      </div>
    `;
  }
  return `
    <div class="me-booking__review">
      <a class="btn btn--sm btn--ghost" href="/reviews/new?booking_id=${b.id}" aria-label="Оставить отзыв на бронь в ${aria}">Оставить отзыв</a>
    </div>
  `;
}

function renderBookingCard(b: Booking, r: Review | undefined): string {
  const cityLabel = CITY_LABELS[b.city_id] ?? b.city_id;
  const today = new Date().toISOString().slice(0, 10);
  const canCancel = !isTerminalStatus(b.status) && b.date >= today;
  const canReschedule = b.status === 'pending' && b.date >= today;
  const statusClass = `pill ${STATUS_COLORS[b.status]}`;
  const aria = `${b.club_name} ${formatDate(b.date)} ${b.time_slot}`;
  return `
    <li class="me-booking" data-booking-id="${b.id}">
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
        <span class="${statusClass}" aria-label="Статус: ${STATUS_LABELS[b.status]}">${STATUS_LABELS[b.status]}</span>
        ${canReschedule ? `<button class="btn btn--ghost btn--sm" data-reschedule="${b.id}" aria-label="Изменить бронь в ${aria}">Изменить</button>` : ''}
        ${canCancel ? `<button class="btn btn--ghost btn--sm" data-cancel="${b.id}" aria-label="Отменить бронь в ${aria}">Отменить</button>` : ''}
      </div>
      ${renderReviewFooter(b, r, aria)}
    </li>
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

async function loadLoyaltyBalance(userId: string): Promise<{ balance: number; earned: number; redeemed: number } | null> {
  const { data, error } = await supabase
    .from('loyalty_balance')
    .select('hours_balance, hours_earned_lifetime, hours_redeemed_lifetime')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    // Migration 0018 not applied yet — column or table missing. Fail soft.
    console.warn('[loyalty] load failed (migration 0018 may not be applied)', error.message);
    return null;
  }
  if (!data) return { balance: 0, earned: 0, redeemed: 0 };
  return {
    balance: Number(data.hours_balance ?? 0),
    earned: Number(data.hours_earned_lifetime ?? 0),
    redeemed: Number(data.hours_redeemed_lifetime ?? 0),
  };
}

function renderLoyaltyCard(balance: number, earned: number, redeemed: number): void {
  const cardEl = document.getElementById('loyalty-card');
  const balanceEl = document.getElementById('loyalty-balance');
  const earnedEl = document.getElementById('loyalty-earned');
  const metaEl = document.getElementById('loyalty-meta');
  if (!cardEl || !balanceEl || !earnedEl || !metaEl) return;
  // Don't show the card for users with no completed bookings yet — avoids noise on day 1
  if (earned <= 0) {
    cardEl.hidden = true;
    return;
  }
  balanceEl.textContent = balance.toFixed(2);
  earnedEl.textContent = earned.toFixed(2);
  metaEl.innerHTML = redeemed > 0
    ? `Заработано всего: <span>${earned.toFixed(2)}</span> ч · Использовано: <span>${redeemed.toFixed(2)}</span> ч`
    : `Заработано всего: <span>${earned.toFixed(2)}</span> ч`;
  cardEl.hidden = false;
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

  // Loyalty balance — load in parallel with bookings (independent query)
  loadLoyaltyBalance(user.id).then((loyalty) => {
    if (loyalty) renderLoyaltyCard(loyalty.balance, loyalty.earned, loyalty.redeemed);
  });

  const bookings = await loadBookings();
  if (loadingEl) loadingEl.hidden = true;

  if (bookings === null) {
    const errorEl = document.getElementById('me-error');
    if (errorEl) {
      errorEl.hidden = false;
    } else {
      // Fallback if no dedicated error element exists
      emptyEl.innerHTML = '<p>Не удалось загрузить брони. <a href="" onclick="location.reload();return false;">Обновить страницу</a></p>';
      emptyEl.hidden = false;
    }
    return;
  }

  if (bookings.length === 0) {
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
      // The modal handles its own lifecycle; reload only after explicit success
      // signal (passed as callback so it fires when the user-visible success
      // screen has had time to display).
      await openRescheduleModal(booking, () => {
        setTimeout(() => window.location.reload(), 2500);
      });
      return;
    }

    const deleteReviewBtn = target.closest('[data-delete-review]') as HTMLElement | null;
    if (deleteReviewBtn) {
      const reviewId = deleteReviewBtn.getAttribute('data-delete-review');
      if (!reviewId) return;
      if (!window.confirm('Точно удалить отзыв?')) return;
      deleteReviewBtn.setAttribute('disabled', '');
      deleteReviewBtn.setAttribute('aria-busy', 'true');
      deleteReviewBtn.textContent = 'Удаляем…';
      const { error } = await supabase.from('reviews').delete().eq('id', reviewId);
      if (error) {
        deleteReviewBtn.removeAttribute('disabled');
        deleteReviewBtn.removeAttribute('aria-busy');
        deleteReviewBtn.textContent = 'Удалить отзыв';
        alert(`Не удалось: ${error.message}`);
        return;
      }
      // Replace the review block in this card with the "Оставить отзыв" CTA again
      const card = deleteReviewBtn.closest('[data-booking-id]') as HTMLElement;
      const bookingId = card.getAttribute('data-booking-id');
      const booking = bookings.find((b) => b.id === bookingId);
      const reviewBlock = card.querySelector('.me-booking__review') as HTMLElement | null;
      if (reviewBlock && booking) {
        const aria = `${booking.club_name} ${formatDate(booking.date)} ${booking.time_slot}`;
        reviewBlock.outerHTML = `
          <div class="me-booking__review">
            <a class="btn btn--sm btn--ghost" href="/reviews/new?booking_id=${booking.id}" aria-label="Оставить отзыв на бронь в ${aria}">Оставить отзыв</a>
          </div>
        `;
      }
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
    statusEl.setAttribute('aria-label', `Статус: ${STATUS_LABELS.cancelled}`);
    cancelBtn.remove();
  });
}
