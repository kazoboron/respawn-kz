import { supabase } from '../lib/supabase';
import { type ClubRow } from '../data/supabase-types';
import type { NewBooking } from '../data/supabase-types';
import { openModal } from './modal';
import { saveReturnUrl, getCurrentUser } from './auth';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_LABELS_RU: Record<string, string> = {
  sun: 'воскресенье', mon: 'понедельник', tue: 'вторник', wed: 'среду',
  thu: 'четверг', fri: 'пятницу', sat: 'субботу',
};

interface BookedSlot { time_slot: string; hours: number; }

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}

function parseHour(t: string): number {
  return Number(t.split(':')[0]);
}

function formatHour(h: number): string {
  return String(h % 24).padStart(2, '0') + ':00';
}

function dayOfWeek(dateStr: string): string {
  return DAYS[new Date(dateStr + 'T00:00:00').getDay()];
}

function generateSlots(open: number, close: number): number[] {
  if (open === close) return [];
  const slots: number[] = [];
  if (close > open) {
    for (let h = open; h < close; h++) slots.push(h);
  } else {
    // overnight
    for (let h = open; h < 24; h++) slots.push(h);
    for (let h = 0; h < close; h++) slots.push(h);
  }
  return slots;
}

function isStartBlocked(startHour: number, duration: number, booked: BookedSlot[], allowed: number[]): boolean {
  const allowedSet = new Set(allowed);
  for (let i = 0; i < duration; i++) {
    const h = (startHour + i) % 24;
    if (!allowedSet.has(h)) return true;
    for (const b of booked) {
      const bStart = parseHour(b.time_slot);
      for (let j = 0; j < b.hours; j++) {
        if (((bStart + j) % 24) === h) return true;
      }
    }
  }
  return false;
}

async function fetchBookedForDay(slug: string, dateStr: string): Promise<BookedSlot[]> {
  const { data } = await supabase
    .from('bookings')
    .select('time_slot, hours')
    .eq('club_slug', slug)
    .eq('date', dateStr)
    .in('status', ['pending', 'confirmed']);
  return (data ?? []) as BookedSlot[];
}

function renderBookingForm(club: ClubRow): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;
  const max = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
  const maxStr = `${max.getFullYear()}-${String(max.getMonth() + 1).padStart(2, '0')}-${String(max.getDate()).padStart(2, '0')}`;

  return `
    <form id="booking-form" class="booking-form">
      <div class="booking-form__row">
        <label class="auth-field">
          <span class="auth-label">Дата</span>
          <input type="date" name="date" class="auth-input" required min="${todayStr}" max="${maxStr}" value="${todayStr}" />
        </label>
        <label class="auth-field">
          <span class="auth-label">Время</span>
          <select name="time_slot" class="auth-input" required>
            <option value="">— загрузка —</option>
          </select>
        </label>
        <label class="auth-field">
          <span class="auth-label">Часов</span>
          <input type="number" name="hours" class="auth-input" required min="1" max="12" value="2" />
        </label>
      </div>
      <div class="booking-form__notice" id="booking-notice" hidden></div>
      <div class="booking-form__total" id="booking-total">
        Итого: <strong>${formatPrice(club.price_per_hour * 2)} ₸</strong>
      </div>
      <button type="submit" class="btn btn--primary btn--large" style="width:100%">Забронировать</button>
      <div class="auth-error" id="booking-error" hidden></div>
    </form>
  `;
}

async function rebuildTimeSelect(
  club: ClubRow,
  dateStr: string,
  duration: number,
  timeSelect: HTMLSelectElement,
  noticeEl: HTMLElement,
): Promise<void> {
  const day = dayOfWeek(dateStr);
  const hours = club.working_hours?.[day];

  if (!hours) {
    timeSelect.innerHTML = '<option value="">— клуб закрыт —</option>';
    timeSelect.disabled = true;
    noticeEl.textContent = `Клуб не работает в ${DAY_LABELS_RU[day] ?? day}. Выбери другую дату.`;
    noticeEl.hidden = false;
    return;
  }

  const all24 = hours.open === '24h';
  const allowed = all24
    ? Array.from({ length: 24 }, (_, i) => i)
    : generateSlots(parseHour(hours.open), parseHour(hours.close));

  const booked = await fetchBookedForDay(club.slug, dateStr);

  const options = allowed.map((h) => {
    const blocked = isStartBlocked(h, duration, booked, allowed);
    const labelSuffix = blocked ? ' (занято)' : '';
    const disabledAttr = blocked ? ' disabled' : '';
    return `<option value="${formatHour(h)}"${disabledAttr}>${formatHour(h)}${labelSuffix}</option>`;
  });

  const allBlocked = allowed.every((h) => isStartBlocked(h, duration, booked, allowed));
  if (allowed.length === 0 || allBlocked) {
    timeSelect.innerHTML = '<option value="">— нет свободных слотов —</option>';
    timeSelect.disabled = true;
    noticeEl.textContent = 'На этот день нет свободных слотов с такой длительностью. Попробуй другую дату или меньше часов.';
    noticeEl.hidden = false;
    return;
  }

  timeSelect.innerHTML = options.join('');
  timeSelect.disabled = false;

  if (!timeSelect.value || timeSelect.options[timeSelect.selectedIndex]?.disabled) {
    const firstFree = Array.from(timeSelect.options).find((o) => !o.disabled);
    if (firstFree) timeSelect.value = firstFree.value;
  }

  noticeEl.hidden = true;
}

async function submitBooking(data: NewBooking): Promise<{ ok: boolean; bookingId?: string; error?: string }> {
  const { data: inserted, error } = await supabase
    .from('bookings')
    .insert(data)
    .select('id')
    .single();
  if (error || !inserted) return { ok: false, error: error?.message ?? 'unknown error' };
  return { ok: true, bookingId: inserted.id };
}

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

function translateError(msg: string): string {
  if (/past dates/i.test(msg)) return 'Нельзя бронировать на прошедшие даты.';
  if (/Club closed on/i.test(msg)) return 'Клуб закрыт в выбранный день.';
  if (/outside working hours/i.test(msg)) return 'Время вне часов работы клуба.';
  if (/overlaps with existing booking/i.test(msg)) return 'Этот слот уже забронирован. Выбери другое время.';
  if (/does not exist or is not published/i.test(msg)) return 'Клуб временно недоступен для бронирования.';
  return `Не удалось сохранить: ${msg}`;
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

  openModal({
    title: `Забронировать — ${club.name}`,
    body: `
      <p style="margin-bottom:16px"><strong>${club.name}</strong> · ${club.district ?? ''} · ${club.address}</p>
      <p style="margin-bottom:16px;color:var(--text-secondary)">Цена: <span class="modal__highlight">${formatPrice(club.price_per_hour)} ₸/час</span></p>
      ${renderBookingForm(club)}
    `,
  });

  const form = document.getElementById('booking-form') as HTMLFormElement | null;
  const totalEl = document.getElementById('booking-total');
  const errorEl = document.getElementById('booking-error');
  const noticeEl = document.getElementById('booking-notice') as HTMLElement | null;
  if (!form || !noticeEl) return;

  const dateInput = form.querySelector('input[name="date"]') as HTMLInputElement;
  const timeSelect = form.querySelector('select[name="time_slot"]') as HTMLSelectElement;
  const hoursInput = form.querySelector('input[name="hours"]') as HTMLInputElement;

  async function refreshSlots() {
    const dur = Math.max(1, Math.min(12, Number(hoursInput.value) || 1));
    await rebuildTimeSelect(club!, dateInput.value, dur, timeSelect, noticeEl!);
  }

  function updateTotal() {
    const h = Math.max(1, Math.min(12, Number(hoursInput.value) || 1));
    if (totalEl) totalEl.innerHTML = `Итого: <strong>${formatPrice(club!.price_per_hour * h)} ₸</strong>`;
  }

  dateInput.addEventListener('change', refreshSlots);
  hoursInput.addEventListener('input', () => { updateTotal(); refreshSlots(); });
  await refreshSlots();
  updateTotal();

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
      price_per_hour: club.price_per_hour,
      total_price: club.price_per_hour * hours,
    };

    if (!newBooking.time_slot) {
      if (errorEl) { errorEl.textContent = 'Выбери время.'; errorEl.hidden = false; }
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Сохраняем…';
    if (errorEl) errorEl.hidden = true;

    const result = await submitBooking(newBooking);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Забронировать';

    if (!result.ok) {
      if (errorEl) {
        errorEl.textContent = translateError(result.error ?? '');
        errorEl.hidden = false;
      }
      await refreshSlots();
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
    handleBookingClick(btn);
  });
}
