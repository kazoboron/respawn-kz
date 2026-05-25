import { supabase } from '../lib/supabase';
import { type ClubRow } from '../data/supabase-types';
import { openModal } from './modal';

// =====================================================================
// Public API
// =====================================================================

export type BookingFormMode = 'create' | 'edit';

export interface BookingFormInitial {
  date: string;
  time_slot: string;
  hours: number;
  /**
   * Cashback hours already redeemed on this booking. Preserved across reschedule
   * (can't change redemption after creation). When set in 'edit' mode, the total
   * is calculated as (hours - redeem_hours) * price so it stays consistent with
   * the original booking's economics.
   */
  redeem_hours?: number;
}

export interface BookingFormSubmitData {
  date: string;
  time_slot: string;
  hours: number;
  total_price: number;
  redeem_hours: number;
}

export interface BookingFormSubmitResult {
  ok: boolean;
  error?: string;
}

export interface BookingFormOptions {
  club: ClubRow;
  mode: BookingFormMode;
  initial?: BookingFormInitial;
  excludeBookingId?: string;
  /**
   * User's current loyalty hours_balance. When > 0 AND mode='create', the form
   * shows a "use cashback" toggle that lets the customer redeem up to
   * min(balance, hours) hours from their cashback. Skipped in 'edit' mode
   * (redeem_hours is fixed at creation).
   */
  loyaltyBalance?: number;
  title: string;
  intro: string;
  submitLabel: string;
  successTitle: string;
  successBody: (data: BookingFormSubmitData) => string;
  onSubmit: (data: BookingFormSubmitData) => Promise<BookingFormSubmitResult>;
}

// =====================================================================
// Constants + small helpers
// =====================================================================

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

async function fetchBookedForDay(slug: string, dateStr: string, excludeId?: string): Promise<BookedSlot[]> {
  let q = supabase
    .from('bookings')
    .select('id, time_slot, hours')
    .eq('club_slug', slug)
    .eq('date', dateStr)
    .in('status', ['pending', 'confirmed']);
  const { data } = await q;
  const rows = (data ?? []) as Array<BookedSlot & { id: string }>;
  return rows.filter((r) => r.id !== excludeId);
}

function translateError(msg: string): string {
  if (/Cannot reschedule/i.test(msg)) return 'Эту бронь уже нельзя изменить.';
  if (/past dates/i.test(msg)) return 'Нельзя бронировать на прошедшие даты.';
  if (/Club closed on/i.test(msg)) return 'Клуб закрыт в выбранный день.';
  if (/outside working hours/i.test(msg)) return 'Время вне часов работы клуба.';
  if (/overlaps with existing booking/i.test(msg)) return 'Этот слот уже забронирован. Выбери другое время.';
  if (/does not exist or is not published/i.test(msg)) return 'Клуб временно недоступен для бронирования.';
  return `Не удалось сохранить: ${msg}`;
}

// =====================================================================
// Form render + reactive picker
// =====================================================================

function renderForm(
  club: ClubRow,
  initial: BookingFormInitial | undefined,
  submitLabel: string,
  mode: BookingFormMode,
  loyaltyBalance?: number,
): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;
  const max = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
  const maxStr = `${max.getFullYear()}-${String(max.getMonth() + 1).padStart(2, '0')}-${String(max.getDate()).padStart(2, '0')}`;

  const dateValue = initial?.date ?? todayStr;
  const hoursValue = initial?.hours ?? 2;
  const initialTotal = club.price_per_hour * hoursValue;

  const showRedeem = (loyaltyBalance ?? 0) > 0 && mode === 'create';
  const redeemBlock = showRedeem ? `
    <div class="booking-form__redeem">
      <label class="booking-form__redeem-toggle">
        <input type="checkbox" id="booking-redeem-toggle" />
        <span>
          Использовать кэшбэк
          (доступно: <strong>${(loyaltyBalance ?? 0).toFixed(2)} ч</strong>)
        </span>
      </label>
      <div class="booking-form__redeem-hint" id="booking-redeem-hint" hidden></div>
    </div>
  ` : '';

  return `
    <form id="booking-form" class="booking-form">
      <div class="booking-form__row">
        <label class="auth-field" for="booking-date">
          <span class="auth-label">Дата</span>
          <input type="date" id="booking-date" name="date" class="auth-input" required
                 min="${todayStr}" max="${maxStr}" value="${dateValue}"
                 aria-describedby="booking-notice booking-error" aria-invalid="false" />
        </label>
        <label class="auth-field" for="booking-time-slot">
          <span class="auth-label">Время</span>
          <select id="booking-time-slot" name="time_slot" class="auth-input" required
                  aria-describedby="booking-notice booking-error" aria-invalid="false">
            <option value="">— загрузка —</option>
          </select>
        </label>
        <label class="auth-field" for="booking-hours">
          <span class="auth-label">Часов</span>
          <div class="hours-stepper" role="group" aria-labelledby="booking-hours-label">
            <button type="button" class="hours-stepper__btn" data-hours-step="-1" aria-label="Меньше часов">−</button>
            <input type="number" id="booking-hours" name="hours" class="auth-input hours-stepper__input" required
                   inputmode="numeric"
                   min="1" max="12" value="${hoursValue}"
                   aria-describedby="booking-notice booking-error" aria-invalid="false" />
            <button type="button" class="hours-stepper__btn" data-hours-step="+1" aria-label="Больше часов">+</button>
          </div>
        </label>
      </div>
      ${redeemBlock}
      <div class="booking-form__notice" id="booking-notice" aria-live="polite" hidden></div>
      <div class="booking-form__total" id="booking-total">
        Итого: <strong>${formatPrice(initialTotal)} ₸</strong>
      </div>
      <button type="submit" class="btn btn--primary btn--large" style="width:100%">${submitLabel}</button>
      <div class="auth-error" id="booking-error" aria-live="polite" hidden></div>
    </form>
  `;
}

async function rebuildTimeSelect(
  club: ClubRow,
  dateStr: string,
  duration: number,
  timeSelect: HTMLSelectElement,
  noticeEl: HTMLElement,
  excludeBookingId: string | undefined,
  preferValue: string | undefined,
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

  // Show loading state while fetching booked slots
  timeSelect.innerHTML = '<option value="">— загрузка слотов —</option>';
  timeSelect.disabled = true;
  timeSelect.setAttribute('aria-busy', 'true');

  const booked = await fetchBookedForDay(club.slug, dateStr, excludeBookingId);

  timeSelect.removeAttribute('aria-busy');

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

  // Prefer the requested value if it's still allowed; otherwise first free.
  if (preferValue) {
    const target = Array.from(timeSelect.options).find((o) => o.value === preferValue && !o.disabled);
    if (target) {
      timeSelect.value = preferValue;
      noticeEl.hidden = true;
      return;
    }
  }
  if (!timeSelect.value || timeSelect.options[timeSelect.selectedIndex]?.disabled) {
    const firstFree = Array.from(timeSelect.options).find((o) => !o.disabled);
    if (firstFree) timeSelect.value = firstFree.value;
  }

  noticeEl.hidden = true;
}

// =====================================================================
// Entry point
// =====================================================================

export async function openBookingFormModal(opts: BookingFormOptions): Promise<void> {
  const { club, mode, initial, excludeBookingId, loyaltyBalance, title, intro, submitLabel, successTitle, successBody, onSubmit } = opts;

  openModal({
    title,
    body: `
      <p style="margin-bottom:16px">${intro}</p>
      <p style="margin-bottom:16px;color:var(--text-secondary)">Цена: <span class="modal__highlight">${formatPrice(club.price_per_hour)} ₸/час</span></p>
      ${renderForm(club, initial, submitLabel, mode, loyaltyBalance)}
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
  const redeemToggle = document.getElementById('booking-redeem-toggle') as HTMLInputElement | null;
  const redeemHintEl = document.getElementById('booking-redeem-hint') as HTMLElement | null;

  let preferredTime: string | undefined = initial?.time_slot;

  function effectiveRedeem(): number {
    // Edit mode: preserve the original redemption — toggle is hidden in that flow.
    if (opts.mode === 'edit') {
      const original = initial?.redeem_hours ?? 0;
      const h = Math.max(1, Math.min(12, Number(hoursInput.value) || 1));
      // Cap at new hours value so user reducing hours doesn't end up with negative paid hours.
      return Math.round(Math.min(original, h) * 100) / 100;
    }
    if (!redeemToggle?.checked) return 0;
    const h = Math.max(1, Math.min(12, Number(hoursInput.value) || 1));
    // Cap at min(balance, hours). Round to 2 decimals (DB column is numeric(10,2)).
    return Math.round(Math.min(loyaltyBalance ?? 0, h) * 100) / 100;
  }

  async function refreshSlots(): Promise<void> {
    const dur = Math.max(1, Math.min(12, Number(hoursInput.value) || 1));
    await rebuildTimeSelect(club, dateInput.value, dur, timeSelect, noticeEl!, excludeBookingId, preferredTime);
    preferredTime = undefined; // only honor on first paint
  }

  function updateTotal(): void {
    const h = Math.max(1, Math.min(12, Number(hoursInput.value) || 1));
    const redeem = effectiveRedeem();
    const paidHours = Math.max(0, h - redeem);
    const total = club.price_per_hour * paidHours;
    if (totalEl) {
      if (redeem > 0) {
        totalEl.innerHTML = `Итого: <strong>${formatPrice(total)} ₸</strong> <span style="color:var(--text-secondary);font-size:14px">(вместо ${formatPrice(club.price_per_hour * h)} ₸, кэшбэк ${redeem.toFixed(2)} ч)</span>`;
      } else {
        totalEl.innerHTML = `Итого: <strong>${formatPrice(total)} ₸</strong>`;
      }
    }
    if (redeemHintEl) {
      if (redeem > 0) {
        redeemHintEl.textContent = `Спишется ${redeem.toFixed(2)} часов с твоего кэшбэка.`;
        redeemHintEl.hidden = false;
      } else {
        redeemHintEl.hidden = true;
      }
    }
  }

  dateInput.addEventListener('change', refreshSlots);
  hoursInput.addEventListener('input', () => { updateTotal(); refreshSlots(); });
  redeemToggle?.addEventListener('change', updateTotal);

  // +/− stepper buttons next to the hours input (replaces native browser
  // spinner arrows which look ugly + caused odd "bar stretches" behavior).
  form.querySelectorAll<HTMLButtonElement>('[data-hours-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const step = Number(btn.getAttribute('data-hours-step')) || 0;
      const cur = Number(hoursInput.value) || 1;
      const next = Math.max(1, Math.min(12, cur + step));
      if (next === cur) return;
      hoursInput.value = String(next);
      // Bubble synthetic 'input' so the existing handler updates total + slots
      hoursInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  await refreshSlots();
  updateTotal();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const hours = Math.max(1, Math.min(12, Number(fd.get('hours') || 1)));
    const redeem = effectiveRedeem();
    const paidHours = Math.max(0, hours - redeem);
    const data: BookingFormSubmitData = {
      date: String(fd.get('date') ?? ''),
      time_slot: String(fd.get('time_slot') ?? ''),
      hours,
      total_price: club.price_per_hour * paidHours,
      redeem_hours: redeem,
    };

    if (!data.time_slot) {
      if (errorEl) { errorEl.textContent = 'Выбери время.'; errorEl.hidden = false; }
      timeSelect.setAttribute('aria-invalid', 'true');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    submitBtn.disabled = true;
    submitBtn.setAttribute('aria-busy', 'true');
    submitBtn.textContent = 'Бронируем…';
    if (errorEl) errorEl.hidden = true;
    form.querySelectorAll<HTMLElement>('[aria-invalid]').forEach((el) => el.setAttribute('aria-invalid', 'false'));

    const result = await onSubmit(data);

    submitBtn.disabled = false;
    submitBtn.removeAttribute('aria-busy');
    submitBtn.textContent = submitLabel;

    if (!result.ok) {
      if (errorEl) {
        errorEl.textContent = translateError(result.error ?? '');
        errorEl.hidden = false;
      }
      timeSelect.setAttribute('aria-invalid', 'true');
      await refreshSlots();
      return;
    }

    const body = document.getElementById('modal-body');
    const titleEl = document.getElementById('modal-title');
    if (titleEl) titleEl.textContent = successTitle;
    if (body) body.innerHTML = successBody(data);
  });
}
