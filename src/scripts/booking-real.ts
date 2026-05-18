import { supabase } from '../lib/supabase';
import { type ClubRow, type NewBooking } from '../data/supabase-types';
import { saveReturnUrl, getCurrentUser } from './auth';
import { openBookingFormModal } from './booking-form';

function parseClubData(btn: HTMLElement): ClubRow | null {
  const raw = btn.getAttribute('data-club');
  if (!raw) {
    console.error('[booking] missing data-club on button', btn);
    return null;
  }
  try {
    return JSON.parse(raw) as ClubRow;
  } catch (err) {
    console.error('[booking] invalid data-club JSON', err);
    return null;
  }
}

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}

async function handleBookingClick(btn: HTMLElement): Promise<void> {
  const club = parseClubData(btn);
  if (!club) return;

  const user = await getCurrentUser();
  if (!user) {
    saveReturnUrl(window.location.pathname + window.location.search);
    window.location.href = `/login/?return=${encodeURIComponent(window.location.pathname)}`;
    return;
  }

  await openBookingFormModal({
    club,
    mode: 'create',
    title: `Забронировать — ${club.name}`,
    intro: `<strong>${club.name}</strong> · ${club.district ?? ''} · ${club.address}`,
    submitLabel: 'Забронировать',
    successTitle: 'Бронь сохранена!',
    successBody: (d) => `
      <p>Запись о брони добавлена.</p>
      <p style="margin-top:12px">Клуб <strong>${club.name}</strong>, дата <span class="modal__highlight">${d.date}</span>, время <span class="modal__highlight">${d.time_slot}</span>, <span class="modal__highlight">${d.hours} ч</span> · итого <span class="modal__highlight">${formatPrice(d.total_price)} ₸</span>.</p>
      <p style="margin-top:12px;color:var(--text-secondary)">Статус: ожидает подтверждения. Управление: <a href="/me/" style="color:var(--neon-cyan)">личный кабинет</a>.</p>
    `,
    onSubmit: async (d) => {
      const payload: NewBooking = {
        user_id: user.id,
        club_slug: club.slug,
        club_name: club.name,
        city_id: club.city,
        date: d.date,
        time_slot: d.time_slot,
        hours: d.hours,
        price_per_hour: club.price_per_hour,
        total_price: d.total_price,
      };
      const { error } = await supabase.from('bookings').insert(payload);
      return { ok: !error, error: error?.message };
    },
  });
}

export function setupBookingButtons(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('[data-book]') as HTMLElement | null;
    if (!btn) return;
    e.preventDefault();
    handleBookingClick(btn);
  });
}
