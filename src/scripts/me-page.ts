import { supabase, supabaseConfigured } from '../lib/supabase';
import { getCurrentUser } from './auth';
import { type Booking, STATUS_LABELS, STATUS_COLORS, isTerminalStatus } from '../data/supabase-types';
import { CITY_LABELS } from '../data/cities';

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function renderBookingCard(b: Booking): string {
  const cityLabel = CITY_LABELS[b.city_id] ?? b.city_id;
  // Cancellable: pending always; confirmed only if booking date is today or future and not terminal
  const today = new Date().toISOString().slice(0, 10);
  const canCancel = !isTerminalStatus(b.status) && b.date >= today;
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
        ${canCancel ? `<button class="btn btn--ghost btn--sm" data-cancel="${b.id}">Отменить</button>` : ''}
      </div>
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

  // Demo-режим: показать индикатор
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

  listEl.innerHTML = bookings.map(renderBookingCard).join('');
  listEl.hidden = false;

  listEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('[data-cancel]') as HTMLElement | null;
    if (!btn) return;
    const id = btn.getAttribute('data-cancel');
    if (!id) return;

    if (!window.confirm('Точно отменить бронь?')) return;

    btn.setAttribute('disabled', '');
    btn.textContent = 'Отменяем…';
    const ok = await cancelBooking(id);
    if (!ok) {
      btn.removeAttribute('disabled');
      btn.textContent = 'Отменить';
      alert('Не удалось отменить. Попробуй ещё раз.');
      return;
    }

    const card = btn.closest('[data-booking-id]') as HTMLElement;
    const statusEl = card.querySelector('.pill') as HTMLElement;
    statusEl.className = 'pill pill--cancelled';
    statusEl.textContent = STATUS_LABELS.cancelled;
    btn.remove();
  });
}
