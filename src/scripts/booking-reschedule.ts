import { supabase } from '../lib/supabase';
import { type Booking, type ClubRow } from '../data/supabase-types';
import { openBookingFormModal } from './booking-form';

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}

async function loadClubRow(slug: string): Promise<ClubRow | null> {
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !data) {
    console.error('[reschedule] club load failed', error);
    return null;
  }
  return data as ClubRow;
}

export async function openRescheduleModal(b: Booking, onSuccess?: () => void): Promise<void> {
  const club = await loadClubRow(b.club_slug);
  if (!club) {
    alert('Не удалось загрузить данные клуба. Попробуй обновить страницу.');
    return;
  }

  await openBookingFormModal({
    club,
    mode: 'edit',
    initial: { date: b.date, time_slot: b.time_slot, hours: b.hours },
    excludeBookingId: b.id,
    title: `Изменить бронь — ${club.name}`,
    intro: `Текущая бронь: <span class="modal__highlight">${b.date}</span> · ${b.time_slot} · ${b.hours} ч`,
    submitLabel: 'Сохранить изменения',
    successTitle: 'Бронь обновлена!',
    successBody: (d) => `
      <p>Детали брони в <strong>${club.name}</strong> обновлены.</p>
      <p style="margin-top:12px">Новая дата <span class="modal__highlight">${d.date}</span>, время <span class="modal__highlight">${d.time_slot}</span>, <span class="modal__highlight">${d.hours} ч</span> · итого <span class="modal__highlight">${formatPrice(d.total_price)} ₸</span>.</p>
      <p style="margin-top:12px;color:var(--text-secondary)">Клуб получит уведомление и подтвердит бронь.</p>
    `,
    onSubmit: async (d) => {
      const { error } = await supabase
        .from('bookings')
        .update({
          date: d.date,
          time_slot: d.time_slot,
          hours: d.hours,
          total_price: d.total_price,
        })
        .eq('id', b.id);
      if (!error && onSuccess) onSuccess();
      return { ok: !error, error: error?.message };
    },
  });
}
