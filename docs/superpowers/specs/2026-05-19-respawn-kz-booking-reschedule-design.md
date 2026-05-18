# respawn.kz Booking Reschedule (SP7) — Design Spec

**Date:** 2026-05-19
**Status:** Draft — awaiting user review
**Sub-project:** SP7 — customer-side reschedule of pending bookings
**Depends on:** SP5 (Email Notifications outbox) — extends event taxonomy with `booking_rescheduled`

## Goal

Let a customer change date / time_slot / hours on their **pending** booking from `/me` via a modal — instead of the current "cancel + book again" workaround. Reuses the existing smart time picker, conflict detection, and slot validation. Notifies the club via email so the admin sees the latest details before confirming.

User-visible outcome: on `/me`, each pending booking shows a new "Изменить" button alongside the existing "Отменить". Click opens the same modal used for booking creation, pre-filled with current values. Submit → DB validates the new slot → row updates → club admin gets "Бронь изменена" email within ~5 seconds.

## Scope

**In:**
- Migration `0015_bookings_rescheduled.sql`:
  - Drop+re-add `notifications_outbox.event_type` CHECK to add `booking_rescheduled` (10 values total).
  - New `check_booking_reschedule_allowed()` trigger function (BEFORE UPDATE OF date/time_slot/hours) — rejects reschedule of non-pending bookings by customers; club_admin and super_admin retain ability via existing RLS.
  - New `notify_booking_rescheduled()` trigger function (AFTER UPDATE OF date/time_slot/hours) — writes outbox rows for every club_admin of the affected club with old/new values in payload.
  - Both triggers attached to `public.bookings`.
- Edge Function `templates.ts` extension: add `booking_rescheduled` template (Russian, HTML + text). Redeploy.
- Refactor `src/scripts/booking-real.ts`:
  - Extract the modal + smart time picker + form logic into new module `src/scripts/booking-form.ts` (~200 lines) with a generic `openBookingFormModal(opts)` entry point.
  - `booking-real.ts` shrinks to ~100 lines that wires the create-flow on top of the shared module.
- New module `src/scripts/booking-reschedule.ts` (~80 lines) — uses `openBookingFormModal({mode: 'edit'})`, prefills current booking values, calls UPDATE, refreshes `/me` on success.
- Edit `src/scripts/me-page.ts`: render "Изменить" button on pending non-past bookings, wire click handler to `openRescheduleModal(booking)`.
- Edit `src/scripts/init.ts` if needed (existing me-page wiring stays).
- Verification script `scripts/verify-reschedule.mjs` with ~7 sanity checks.

**Out (deferred):**
- Reschedule for `confirmed` bookings — those go through "cancel + new booking" for v1. Adding it later requires a status-downgrade trigger and is a bigger semantic question (does the club re-confirm?).
- Audit / history table of original date/time. We overwrite. Audit columns (`status_changed_at` etc.) only cover status changes, not reschedule.
- Time limits (e.g., "no reschedule within 1 hour of original time") — slot validator already rejects past dates; finer limits add complexity for negligible value.
- Notification to customer when club_admin or super_admin reschedules. v1 limits reschedule UI to customer only; admin uses cancel + recreate.
- Bulk reschedule (move N bookings at once).
- Drag-drop or calendar UI — modal with pickers is fine for MVP.
- Reschedule attribution / changelog visible to club admin in `/dashboard/bookings/` (the email already shows the diff).

## Architecture

### Event flow

```
[/me] customer clicks "Изменить" on pending booking
    │
    ▼
modal opens with smart time picker (booking-form.ts in 'edit' mode)
    │ current values prefilled; conflict detection excludes self
    ▼
customer adjusts date/time/hours, clicks "Сохранить"
    │
    ▼
supabase.from('bookings').update({date, time_slot, hours, total_price}).eq('id', X)
    │
    ▼
┌────────────────────────────────────────────────────────────────┐
│ Postgres trigger chain (alphabetical order)                    │
│                                                                │
│ 1. bookings_reschedule_guard (BEFORE UPDATE OF d/t/h)          │
│    └─ rejects if customer + status != 'pending'                │
│                                                                │
│ 2. bookings_slot_validation (BEFORE UPDATE OF d/t/h)           │
│    └─ rejects past dates, club closed, outside hours, overlap  │
│       (already exists from migration 0008)                     │
│                                                                │
│ 3. UPDATE commits                                              │
│                                                                │
│ 4. bookings_notify_rescheduled (AFTER UPDATE OF d/t/h)         │
│    └─ inserts outbox rows for each club_admin                  │
└────────────────────────────────────────────────────────────────┘
    │
    ▼
SP5 webhook → Edge Function → Resend → "Бронь изменена" email to admin(s)
    │
    ▼
/me refreshes (or modal closes + locally patches the card)
```

### Why a trigger guard instead of RLS column filtering

Postgres RLS operates per-row, not per-column. We need: "customer can update date/time/hours only if status='pending', but can always update status (for cancel)". A trigger has full read-access to OLD and NEW, can compare changed columns to status, and raise meaningful Russian errors. The existing `check_booking_status_transition` trigger from migration 0006 follows the same pattern for status transitions; we're adding a sibling guard for date/time/hours.

### Why extract `booking-form.ts`

Both flows (create + reschedule) share:
- The smart time picker (`rebuildTimeSelect` from booking-real.ts)
- Working-hours-aware slot generation (24h support, overnight ranges)
- Conflict detection via `fetchBookedForDay`
- Date input bounds (today..+60d)
- Total-price calc on hours change
- Russian error translation for DB exceptions

Differences are small:
- Initial values (empty vs. current booking)
- Modal title and submit-button labels
- Submit action (INSERT vs. UPDATE)
- "Exclude self" in conflict check (only edit mode)

Extracting via parameters keeps booking-real.ts focused on "click Забронировать" wiring and lets reschedule reuse instead of copy-paste.

### Why a new event_type instead of reusing booking_created

`booking_created` ships on INSERT and the recipient is club_admin. Reusing it on UPDATE would either:
- Force the create-template to render both create-and-reschedule cases (messy)
- Or send two `booking_created` emails to the same admin (confusing)

A dedicated `booking_rescheduled` event makes the email content clean ("Было/Стало") and keeps the SP5 outbox audit trail honest about what actually happened.

## Data model

### Migration `0015_bookings_rescheduled.sql`

```sql
-- Migration 0015: customer reschedule of pending bookings.
-- Adds the 10th event type to notifications_outbox, a guard trigger
-- restricting reschedule to pending bookings by the customer, and a
-- notify trigger that emails club admins of the change.

-- 1. Extend event_type CHECK
alter table public.notifications_outbox
  drop constraint notifications_outbox_event_type_check;
alter table public.notifications_outbox
  add constraint notifications_outbox_event_type_check
  check (event_type in (
    'application_submitted',
    'application_approved',
    'application_rejected',
    'booking_created',
    'booking_confirmed',
    'booking_cancelled',
    'booking_completed',
    'booking_no_show',
    'review_created',
    'booking_rescheduled'
  ));

-- 2. Guard: restrict who can reschedule which bookings.
-- Customer (owner who is neither club_admin nor super_admin) may only
-- reschedule pending bookings. Club admins and super-admins are not
-- restricted here (they may have future internal use cases — but the
-- public UI only exposes customer-side reschedule).
create or replace function check_booking_reschedule_allowed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skip when no actual reschedule fields changed.
  if NEW.date = OLD.date
     and NEW.time_slot = OLD.time_slot
     and NEW.hours = OLD.hours then
    return NEW;
  end if;

  -- Customer (owner without admin powers) can only reschedule 'pending'.
  if auth.uid() = OLD.user_id
     and OLD.status != 'pending'
     and not exists (
       select 1 from public.club_admins
       where user_id = auth.uid() and club_slug = OLD.club_slug
     )
     and not is_super_admin() then
    raise exception 'Cannot reschedule % booking', OLD.status;
  end if;

  return NEW;
end;
$$;

revoke execute on function check_booking_reschedule_allowed()
  from public, anon, authenticated;

-- Postgres fires triggers alphabetically. We want the guard before the
-- slot validation (which is named bookings_slot_validation). Naming the
-- guard "bookings_reschedule_guard" puts it AFTER alphabetically — that's
-- fine because the guard is BEFORE UPDATE and so is slot validation; both
-- run before the row commits, and order between them doesn't affect
-- correctness (slot validation can run on a row the guard would reject,
-- but no commit happens until both pass). Use this naming.
create trigger bookings_reschedule_guard
  before update of date, time_slot, hours on public.bookings
  for each row execute function check_booking_reschedule_allowed();

-- 3. Notify trigger: emit booking_rescheduled outbox row per club_admin.
create or replace function notify_booking_rescheduled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_admin_email text;
  v_customer_email text;
begin
  -- Skip when no real reschedule (same guard as above).
  if NEW.date = OLD.date
     and NEW.time_slot = OLD.time_slot
     and NEW.hours = OLD.hours then
    return NEW;
  end if;

  v_customer_email := get_user_email(NEW.user_id);

  v_payload := jsonb_build_object(
    'booking_id', NEW.id,
    'club_slug', NEW.club_slug,
    'club_name', NEW.club_name,
    'old_date', OLD.date::text,
    'old_time_slot', OLD.time_slot,
    'old_hours', OLD.hours,
    'new_date', NEW.date::text,
    'new_time_slot', NEW.time_slot,
    'new_hours', NEW.hours,
    'total_price', NEW.total_price,
    'customer_email', v_customer_email
  );

  for v_admin_email in select email from get_club_admin_emails(NEW.club_slug) loop
    insert into public.notifications_outbox
      (event_type, source_table, source_id, recipient_email, payload)
    values
      ('booking_rescheduled', 'bookings', NEW.id, v_admin_email, v_payload)
    on conflict (event_type, source_id, recipient_email) do nothing;
  end loop;

  return NEW;
end;
$$;

create trigger bookings_notify_rescheduled
  after update of date, time_slot, hours on public.bookings
  for each row execute function notify_booking_rescheduled();
```

## Edge Function template

Edit `supabase/functions/send-notification/templates.ts`. Add to the `TEMPLATES` record (after the existing `review_created` entry):

```typescript
  booking_rescheduled: {
    subject: (p) => `Бронь изменена — ${p.club_name}`,
    bodyHtml: (p) => `
      <h1>Бронь изменена клиентом</h1>
      <p>Клиент изменил детали брони в клубе <strong>${p.club_name}</strong>.</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr style="color: #8a8a95;">
          <td style="padding: 4px 12px 4px 0;">Было:</td>
          <td><s>${p.old_date} · ${p.old_time_slot} · ${p.old_hours} ч</s></td>
        </tr>
        <tr>
          <td style="padding: 4px 12px 4px 0; color: #00d4ff;">Стало:</td>
          <td><strong>${p.new_date} · ${p.new_time_slot} · ${p.new_hours} ч</strong></td>
        </tr>
      </table>
      <ul>
        <li>Сумма: ${p.total_price} ₸</li>
        <li>Клиент: ${p.customer_email}</li>
      </ul>
      <p>Бронь ожидает подтверждения. <a href="${SITE_URL}/dashboard/bookings/">Открыть в кабинете</a></p>
    `,
    bodyText: (p) => `
Клиент изменил детали брони в клубе ${p.club_name}.

Было: ${p.old_date} · ${p.old_time_slot} · ${p.old_hours} ч
Стало: ${p.new_date} · ${p.new_time_slot} · ${p.new_hours} ч

Сумма: ${p.total_price} ₸
Клиент: ${p.customer_email}

Бронь ожидает подтверждения.
Кабинет: ${SITE_URL}/dashboard/bookings/
    `,
  },
```

The `TEMPLATES` record now has 10 entries.

## Refactor: `booking-form.ts`

### Extract from `booking-real.ts`

Current `src/scripts/booking-real.ts` has these helpers locally:
- `DAYS`, `DAY_LABELS_RU` constants
- `formatPrice`, `parseHour`, `formatHour`, `dayOfWeek`
- `generateSlots(open, close)` — handles overnight ranges
- `isStartBlocked(startHour, duration, booked, allowed)` — slot overlap
- `fetchBookedForDay(slug, dateStr)` — queries bookings for conflict check
- `renderBookingForm(club)` — HTML form template
- `rebuildTimeSelect(...)` — reactive picker rebuild
- `submitBooking(data)` — INSERT
- `parseClubData(btn)` — reads data-club attribute
- `translateError(msg)` — Russian error mapping
- `handleBookingClick(btn)` — click handler that opens modal

Move all the **non-INSERT-specific** ones to new file `src/scripts/booking-form.ts` and expose a single function:

```typescript
// src/scripts/booking-form.ts
import { supabase } from '../lib/supabase';
import { type ClubRow } from '../data/supabase-types';
import { openModal } from './modal';

export type BookingFormMode = 'create' | 'edit';

export interface BookingFormInitial {
  date: string;
  time_slot: string;
  hours: number;
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
  title: string;
  intro?: string;
  submitLabel: string;
  successTitle: string;
  successBody: (data: { date: string; time_slot: string; hours: number; total_price: number }) => string;
  onSubmit: (data: { date: string; time_slot: string; hours: number; total_price: number }) => Promise<BookingFormSubmitResult>;
}

export async function openBookingFormModal(opts: BookingFormOptions): Promise<void> {
  // Existing modal open + form render + smart picker + submit logic
  // Differences threaded via opts:
  //   - initial values prefill date/time/hours inputs
  //   - excludeBookingId is passed to fetchBookedForDay so conflict check skips self
  //   - onSubmit is called instead of inline supabase.insert; error string from result.error
}
```

### Updated `booking-real.ts`

Becomes a thin wrapper:

```typescript
import { type ClubRow, type NewBooking } from '../data/supabase-types';
import { supabase } from '../lib/supabase';
import { saveReturnUrl, getCurrentUser } from './auth';
import { openBookingFormModal } from './booking-form';

function parseClubData(btn: HTMLElement): ClubRow | null { /* same as today */ }

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
      <p>Клуб <strong>${club.name}</strong>, дата <span class="modal__highlight">${d.date}</span>, время <span class="modal__highlight">${d.time_slot}</span>, <span class="modal__highlight">${d.hours} ч</span> · итого <span class="modal__highlight">${d.total_price} ₸</span>.</p>
      <p>Статус: ожидает подтверждения. Управление: <a href="/me/" style="color:var(--neon-cyan)">личный кабинет</a>.</p>
    `,
    onSubmit: async (data) => {
      const payload: NewBooking = {
        user_id: user.id,
        club_slug: club.slug,
        club_name: club.name,
        city_id: club.city,
        ...data,
        price_per_hour: club.price_per_hour,
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
```

The behavior is identical to today's create flow — same UX, same validation, same submit path. Just routed through the shared module.

## New module: `booking-reschedule.ts`

```typescript
// src/scripts/booking-reschedule.ts
import { supabase } from '../lib/supabase';
import { type Booking, type ClubRow } from '../data/supabase-types';
import { openBookingFormModal } from './booking-form';

async function loadClub(slug: string): Promise<ClubRow | null> {
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !data) return null;
  return data as ClubRow;
}

export async function openRescheduleModal(b: Booking, onSuccess: () => void): Promise<void> {
  const club = await loadClub(b.club_slug);
  if (!club) {
    alert('Не удалось загрузить данные клуба.');
    return;
  }

  await openBookingFormModal({
    club,
    mode: 'edit',
    initial: { date: b.date, time_slot: b.time_slot, hours: b.hours },
    excludeBookingId: b.id,
    title: `Изменить бронь — ${club.name}`,
    intro: `Текущая бронь: ${b.date}, ${b.time_slot}, ${b.hours} ч`,
    submitLabel: 'Сохранить изменения',
    successTitle: 'Бронь обновлена!',
    successBody: (d) => `
      <p>Бронь в <strong>${club.name}</strong> изменена.</p>
      <p>Новая дата <span class="modal__highlight">${d.date}</span>, время <span class="modal__highlight">${d.time_slot}</span>, <span class="modal__highlight">${d.hours} ч</span> · итого <span class="modal__highlight">${d.total_price} ₸</span>.</p>
      <p>Клуб получит уведомление и подтвердит бронь.</p>
    `,
    onSubmit: async (data) => {
      const { error } = await supabase
        .from('bookings')
        .update({
          date: data.date,
          time_slot: data.time_slot,
          hours: data.hours,
          total_price: data.total_price,
        })
        .eq('id', b.id);
      return { ok: !error, error: error?.message };
    },
  });

  // Call onSuccess after the modal closes via its success path. The shared
  // module already calls modal close; we'd need to thread onSuccess through
  // BookingFormOptions or rely on the calling page to reload its list.
  // For v1: caller refreshes /me by re-running setupMePage() or window.location.reload().
}
```

## UI changes — `/me`

Edit `src/scripts/me-page.ts`:

1. Add "Изменить" button rendering. Conditions:
   - `b.status === 'pending'`
   - `b.date >= today`

2. Wire click handler. On submit success, reload the bookings list (simplest: `window.location.reload()`; better: re-fetch + re-render).

```typescript
// inside renderBookingCard, in the .me-booking__side block:
const canReschedule = b.status === 'pending' && b.date >= today;
// ...
${canReschedule ? `<button class="btn btn--ghost btn--sm" data-reschedule="${b.id}">Изменить</button>` : ''}
${canCancel ? `<button class="btn btn--ghost btn--sm" data-cancel="${b.id}">Отменить</button>` : ''}
```

And in the click handler:

```typescript
listEl.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;
  const rescheduleBtn = target.closest('[data-reschedule]') as HTMLElement | null;
  if (rescheduleBtn) {
    const id = rescheduleBtn.getAttribute('data-reschedule');
    const booking = bookings.find((b) => b.id === id);
    if (!booking) return;
    const { openRescheduleModal } = await import('./booking-reschedule');
    await openRescheduleModal(booking, () => window.location.reload());
    return;
  }
  const cancelBtn = target.closest('[data-cancel]') as HTMLElement | null;
  if (cancelBtn) { /* existing cancel logic */ }
});
```

Dynamic import keeps the bundle small — reschedule code only loads when the user clicks.

## Verification script

`scripts/verify-reschedule.mjs`, 7 checks:

1. `notifications_outbox.event_type` CHECK includes `booking_rescheduled`.
2. `check_booking_reschedule_allowed` function exists.
3. `bookings_reschedule_guard` trigger exists on `bookings`.
4. `notify_booking_rescheduled` function exists.
5. `bookings_notify_rescheduled` trigger exists on `bookings`.
6. `check_booking_reschedule_allowed` revoke from public/anon/authenticated.
7. Both triggers fire on `BEFORE UPDATE OF date, time_slot, hours` / `AFTER UPDATE OF date, time_slot, hours`.

## Failure handling

| Scenario | Behavior |
|---|---|
| Customer tries to reschedule confirmed booking via API | `check_booking_reschedule_allowed` raises "Cannot reschedule confirmed booking"; UI doesn't render the button so direct UI access shouldn't happen. |
| Customer tries to set past date in modal | `bookings_slot_validation` raises "Cannot book past dates"; UI's date input also has `min` attr. |
| Slot collides with another booking | `bookings_slot_validation` raises overlap error; client translates to friendly "Этот слот уже забронирован". |
| Customer submits form with same values | `notify_booking_rescheduled` skips (no diff); no email; UPDATE itself still commits (returns success). Acceptable. |
| Club admin tries to reschedule (out of scope UI) | Guard allows (auth.uid() IS club_admin or super_admin); slot validation runs as normal. v1 doesn't surface this in UI but the trigger is permissive. |
| Concurrent: customer A reschedules into slot, customer B tries same | Last commit wins; slot validation rejects the second based on the first's now-committed time. Standard Postgres serializability. |
| Booking row deleted between modal open and submit | UPDATE affects zero rows; client sees no DB error; UI thinks success but card is gone. Edge case, accept; reload page reveals state. |

## Acceptance criteria

1. **AC1:** On `/me`, every pending booking with `date >= today` shows an "Изменить" button.
2. **AC2:** Clicking "Изменить" opens the existing booking modal with title "Изменить бронь — {club}", current date/time/hours pre-filled.
3. **AC3:** Submitting unchanged values returns success and closes the modal (no email).
4. **AC4:** Submitting valid new date/time/hours commits the UPDATE; `/me` reflects the new values after reload.
5. **AC5:** Within ~5 seconds of a real change, every club_admin of the club receives the "Бронь изменена" email showing was/became.
6. **AC6:** Submitting a date in the past shows the friendly Russian error "Нельзя бронировать на прошедшие даты.".
7. **AC7:** Submitting a slot that conflicts with another booking shows "Этот слот уже забронирован. Выбери другое время.".
8. **AC8:** Direct API attempt to UPDATE a `confirmed` booking's date by the owner is rejected by `check_booking_reschedule_allowed` with "Cannot reschedule confirmed booking".
9. **AC9:** `scripts/verify-reschedule.mjs` returns 7/7 passed.
10. **AC10:** `npm run build` succeeds; no TS errors in `src/`.
11. **AC11:** Existing booking-creation flow (click "Забронировать" on `/clubs/<slug>/`) still works identically — same modal, same submit, same success message.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Refactor of `booking-real.ts` regresses the creation flow | AC11 plus manual smoke test of the creation flow (book a slot on cyberzone, verify form/picker/submit work exactly as before). |
| Customer reschedules into a slot that another customer is also trying to book (concurrency) | First write wins via Postgres MVCC + slot validation trigger. Second write sees the now-committed row and is rejected. UI shows the rejection. |
| Email spam if customer reschedules multiple times in a row | Each reschedule fires the trigger. For MVP this is fine — typically 1-2 reschedules per booking max. Future: 5-minute debounce in trigger if it becomes a problem. |
| Guard trigger blocks legitimate admin reschedule needs | Guard permits club_admin and super_admin. v1 UI doesn't expose admin reschedule but the path is open if needed. |
| `auth.uid()` is NULL in a SQL replay context (e.g., direct DB connection without JWT) | Guard runs as SECURITY DEFINER but reads `auth.uid()` from the request context. Direct postgres connections (e.g., `scripts/apply-sql.mjs`) bypass RLS but trigger logic still uses `auth.uid()` — returns NULL, so the customer-specific block doesn't trigger. Acceptable: direct DB access is admin-only. |
| Adding a new trigger fires unrelated UPDATE statements | `BEFORE/AFTER UPDATE OF date, time_slot, hours` only fires when those columns change. Status-only updates (cancel, confirm) won't trigger. Existing 0008 slot validation already uses this pattern. |

## Migration sequence

1. Write & commit `supabase/migrations/0015_bookings_rescheduled.sql`.
2. Apply: `DATABASE_URL=... node scripts/apply-sql.mjs supabase/migrations/0015_bookings_rescheduled.sql`.
3. Write & commit `scripts/verify-reschedule.mjs`; run; 7/7 passed.
4. Extend Edge Function `templates.ts` with `booking_rescheduled`; redeploy via `supabase functions deploy send-notification`.
5. Refactor `src/scripts/booking-real.ts`: extract `src/scripts/booking-form.ts`. Manual smoke booking creation locally / via dev server to confirm no regression.
6. Create `src/scripts/booking-reschedule.ts`.
7. Edit `src/scripts/me-page.ts`: render "Изменить" button + wire click handler.
8. `npm run build` + `npx astro check` → 0 errors in src/.
9. Synthetic SQL smoke: UPDATE a pending booking's date programmatically, verify trigger fires, outbox row created, no errors.
10. Merge feat → main, `npm run deploy`.
11. Manual user smoke: log in, create a pending booking, reschedule it, verify email arrives.
12. HANDOFF.md + Obsidian updates.

## Open items requiring user action

None up-front. The same Resend API key, Cloudflare config, and Supabase access token from SP5/SP6 are reused. After implementation, user does the AC1-AC8 manual smoke on production.
