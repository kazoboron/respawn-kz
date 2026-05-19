import { supabase } from '../lib/supabase';
import { type ClubRow, type NewBooking } from '../data/supabase-types';
import { saveReturnUrl, getCurrentUser } from './auth';
import { openBookingFormModal } from './booking-form';

function parseClubData(btn: HTMLElement): ClubRow | null {
  const raw = btn.getAttribute('data-club');
  if (!raw) return null;
  // If data-club is just a slug (set on ClubCard), this won't be valid JSON.
  // The caller falls back to a Supabase fetch via slug in that case.
  if (!raw.startsWith('{')) return null;
  try {
    return JSON.parse(raw) as ClubRow;
  } catch (err) {
    console.error('[booking] invalid data-club JSON', err);
    return null;
  }
}

/**
 * Find the slug to use for a booking click:
 * - Prefer button's own data-book attribute (set on every booking button)
 * - Fall back to data-club on an ancestor (ClubCard wraps article with data-club=slug)
 */
function findClubSlug(btn: HTMLElement): string | null {
  const direct = btn.getAttribute('data-book');
  if (direct) return direct;
  const ancestor = btn.closest('[data-club]') as HTMLElement | null;
  const fromAncestor = ancestor?.getAttribute('data-club');
  // Skip if ancestor's data-club is the inline JSON used on club detail page
  if (fromAncestor && !fromAncestor.startsWith('{')) return fromAncestor;
  return null;
}

async function loadClubBySlug(slug: string): Promise<ClubRow | null> {
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  if (error || !data) {
    console.error('[booking] loadClubBySlug failed', slug, error);
    return null;
  }
  return data as ClubRow;
}

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}

async function loadLoyaltyBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('loyalty_balance')
    .select('hours_balance')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return 0; // soft-fail if migration 0018 not applied yet
  return Number(data.hours_balance ?? 0);
}

async function handleBookingClick(btn: HTMLElement): Promise<void> {
  // First try to read full club JSON embedded on the button (club detail page pattern).
  // If absent (ClubCard pattern — button only has data-book=slug), fetch the row from
  // Supabase by slug before opening the modal.
  let club = parseClubData(btn);
  if (!club) {
    const slug = findClubSlug(btn);
    if (!slug) {
      console.error('[booking] no slug found on button', btn);
      return;
    }
    club = await loadClubBySlug(slug);
    if (!club) {
      alert('Не удалось загрузить данные клуба. Попробуй обновить страницу.');
      return;
    }
  }

  const user = await getCurrentUser();
  if (!user) {
    saveReturnUrl(window.location.pathname + window.location.search);
    window.location.href = `/login/?return=${encodeURIComponent(window.location.pathname)}`;
    return;
  }

  const loyaltyBalance = await loadLoyaltyBalance(user.id);

  await openBookingFormModal({
    club,
    mode: 'create',
    loyaltyBalance,
    title: `Забронировать — ${club.name}`,
    intro: `<strong>${club.name}</strong> · ${club.district ?? ''} · ${club.address}`,
    submitLabel: 'Забронировать',
    successTitle: 'Бронь сохранена!',
    successBody: (d) => `
      <p>Запись о брони добавлена.</p>
      <p style="margin-top:12px">Клуб <strong>${club.name}</strong>, дата <span class="modal__highlight">${d.date}</span>, время <span class="modal__highlight">${d.time_slot}</span>, <span class="modal__highlight">${d.hours} ч</span> · итого <span class="modal__highlight">${formatPrice(d.total_price)} ₸</span>${d.redeem_hours > 0 ? ` · кэшбэк <span class="modal__highlight">${d.redeem_hours.toFixed(2)} ч</span>` : ''}.</p>
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
      // Only include redeem_hours when > 0. Keeps INSERT compatible with
      // pre-migration-0019 schemas where the column doesn't exist yet.
      if (d.redeem_hours > 0) payload.redeem_hours = d.redeem_hours;
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
