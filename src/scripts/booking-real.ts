import { supabase } from '../lib/supabase';
import { CLUBS, type Club } from '../data/clubs';
import type { NewBooking } from '../data/supabase-types';
import { openModal } from './modal';
import { saveReturnUrl, getCurrentUser } from './auth';

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}

function renderBookingForm(club: Club): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  return `
    <form id="booking-form" class="booking-form">
      <div class="booking-form__row">
        <label class="auth-field">
          <span class="auth-label">Дата</span>
          <input type="date" name="date" class="auth-input" required min="${todayStr}" value="${todayStr}" />
        </label>
        <label class="auth-field">
          <span class="auth-label">Время</span>
          <select name="time_slot" class="auth-input" required>
            ${Array.from({ length: 24 }, (_, h) => {
              const v = `${String(h).padStart(2, '0')}:00`;
              return `<option value="${v}">${v}</option>`;
            }).join('')}
          </select>
        </label>
        <label class="auth-field">
          <span class="auth-label">Часов</span>
          <input type="number" name="hours" class="auth-input" required min="1" max="12" value="2" />
        </label>
      </div>
      <div class="booking-form__total" id="booking-total">
        Итого: <strong>${formatPrice(club.price * 2)} ₸</strong>
      </div>
      <button type="submit" class="btn btn--primary btn--large" style="width:100%">Забронировать</button>
      <div class="auth-error" id="booking-error" hidden></div>
    </form>
  `;
}

async function submitBooking(data: NewBooking): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('bookings').insert(data);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function handleBookingClick(slug: string): Promise<void> {
  const club = CLUBS.find((c) => c.slug === slug);
  if (!club) return;

  const user = await getCurrentUser();
  if (!user) {
    saveReturnUrl(window.location.pathname + window.location.search);
    window.location.href = `/login/?return=${encodeURIComponent(window.location.pathname)}`;
    return;
  }

  openModal({
    title: `Забронировать — ${club.name}`,
    body: `
      <p style="margin-bottom:16px"><strong>${club.name}</strong> · ${club.district} · ${club.address}</p>
      <p style="margin-bottom:16px;color:var(--text-secondary)">Цена: <span class="modal__highlight">${formatPrice(club.price)} ₸/час</span></p>
      ${renderBookingForm(club)}
    `,
  });

  const form = document.getElementById('booking-form') as HTMLFormElement | null;
  const totalEl = document.getElementById('booking-total');
  const errorEl = document.getElementById('booking-error');
  if (!form) return;

  const hoursInput = form.querySelector('input[name="hours"]') as HTMLInputElement;
  hoursInput.addEventListener('input', () => {
    const h = Math.max(1, Math.min(12, Number(hoursInput.value) || 1));
    if (totalEl) totalEl.innerHTML = `Итого: <strong>${formatPrice(club.price * h)} ₸</strong>`;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const hours = Number(fd.get('hours') || 1);
    const newBooking: NewBooking = {
      user_id: user.id,
      club_slug: club.slug,
      club_name: club.name,
      city_id: club.city,
      date: fd.get('date') as string,
      time_slot: fd.get('time_slot') as string,
      hours,
      price_per_hour: club.price,
      total_price: club.price * hours,
    };

    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Сохраняем…';
    if (errorEl) errorEl.hidden = true;

    const result = await submitBooking(newBooking);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Забронировать';

    if (!result.ok) {
      if (errorEl) {
        errorEl.textContent = `Не удалось сохранить: ${result.error}`;
        errorEl.hidden = false;
      }
      return;
    }

    const body = document.getElementById('modal-body');
    const title = document.getElementById('modal-title');
    if (title) title.textContent = 'Бронь сохранена!';
    if (body) {
      body.innerHTML = `
        <p>Запись о брони добавлена.</p>
        <p style="margin-top:12px">Клуб <strong>${club.name}</strong>, дата <span class="modal__highlight">${newBooking.date}</span>, время <span class="modal__highlight">${newBooking.time_slot}</span>, <span class="modal__highlight">${hours} ч</span> · итого <span class="modal__highlight">${formatPrice(newBooking.total_price)} ₸</span>.</p>
        <p style="margin-top:12px;color:var(--text-secondary)">Статус: ожидает подтверждения. Управление: <a href="/me/" style="color:var(--neon-cyan)">личный кабинет</a>.</p>
      `;
    }
  });
}

export function setupBookingButtons(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('[data-book]') as HTMLElement | null;
    if (!btn) return;
    e.preventDefault();
    const slug = btn.getAttribute('data-book');
    if (slug) handleBookingClick(slug);
  });
}
