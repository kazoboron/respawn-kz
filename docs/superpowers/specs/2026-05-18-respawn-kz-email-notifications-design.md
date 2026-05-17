# respawn.kz Email Notifications via Resend — Design Spec

**Date:** 2026-05-18
**Status:** Draft — awaiting user review
**Block 1 closed:** SP1 (B2B Cabinet) + SP2+3 (Clubs DB + Slot Validation) + SP4 (Photo Upload) — all in production
**This = Sub-project 5 (post-Block-1 enhancement, from roadmap option #2)**

## Goal

Wire real transactional email delivery (Resend) into all 8 cabinet/booking events that currently just `console.log` via the `notify()` stub. The event detection moves from client-side JS to server-side Postgres triggers, which:

1. Closes a real bug: `booking-real.ts:282` currently passes fake placeholder emails (`user-${uid-prefix}@unknown`) because the browser-side stub cannot read `auth.users.email`.
2. Eliminates the "user disabled JS → notification lost" failure mode.
3. Establishes a durable outbox pattern with idempotency and retries — solid foundation for any future event-driven feature.

User-visible outcome: when something happens that the other party needs to know about, they get a Russian-language HTML email within ~60 seconds.

## Scope

**In:**
- New migration `0012_notifications_outbox.sql` with:
  - `notifications_outbox` table (id, event_type, source_id, recipient_email, payload, status, attempts, sent_at, last_error, resend_message_id) with unique constraint for idempotency and RLS read for super-admins only.
  - `ALTER TABLE club_applications ADD COLUMN assigned_slug text` so the `application_approved` trigger can include the new club slug in the email payload.
  - Replace `approve_club_application` RPC to also set `assigned_slug = p_club_slug` on the application row.
  - Trigger functions on `bookings` (AFTER INSERT + AFTER UPDATE OF status) and `club_applications` (AFTER INSERT + AFTER UPDATE OF status) that resolve recipient emails via `auth.users` join and insert outbox rows.
  - Supabase Database Webhook configured to POST every outbox INSERT to the Edge Function.
- New Supabase Edge Function `send-notification`:
  - HTTP handler at `supabase/functions/send-notification/index.ts`.
  - `templates.ts` with 8 Russian-language `{subject, html, text}` templates.
  - Sends via `npm:resend@4.x`, marks outbox row sent/failed.
  - Uses outbox row id as Resend `idempotency_key`.
- DNS records for `mail.respawn.kz` (user action in Cloudflare DNS):
  - SPF TXT, DKIM CNAME, DMARC TXT — values provided by Resend dashboard.
- Resend account setup (user action): verify domain, generate API key.
- Edge Function secrets: `RESEND_API_KEY`, `FROM_EMAIL=noreply@mail.respawn.kz`.
- Cleanup: delete `src/lib/notifications.ts` and all 4 client-side `notify()` call sites (`booking-real.ts`, `admin-applications.ts`, `dashboard-register.ts`, `dashboard-bookings.ts`).
- Verification script `scripts/verify-notifications.mjs` — sanity checks for outbox schema, triggers exist, indexes present.

**Out (deferred):**
- `/admin/notifications` UI for browsing outbox / re-sending failed rows. Outbox is queryable from Supabase dashboard for now.
- i18n / English / Kazakh templates. Russian only.
- Email preferences per user (opt-out, digest mode).
- SMS, Telegram, push notifications.
- Marketing emails, unsubscribe footer (transactional under KZ law doesn't require it for a service the user signed up for).
- Tracking pixels, open/click analytics.
- React-email or other template libraries — plain string interpolation is enough for 8 small templates.
- Booking reminder emails (24h before, 1h before) — would need a scheduled function, separate sub-project.
- Welcome email on user signup (Supabase already sends magic-link emails; standalone welcome is overkill for MVP).
- HTML preview tool for templates — preview via "send to self" during dev.

## Architecture

### Event flow

```
[user|admin action]
        │
        ▼
[INSERT or UPDATE on bookings / club_applications]
        │
        ▼
[AFTER trigger in Postgres]
   │ resolves recipient(s) via auth.users join
   │ builds payload snapshot (club_name, date, time, total, etc.)
   ▼
[INSERT INTO notifications_outbox]
   (one row per recipient, idempotent via UNIQUE constraint)
        │
        ▼
[Supabase Database Webhook — auto-fires on outbox INSERT]
        │
        │ POST { type: 'INSERT', record: <outbox row> }
        ▼
[Edge Function: send-notification]
   │ 1. Match event_type → template
   │ 2. Interpolate payload into HTML + text
   │ 3. Call Resend API with idempotency_key = outbox.id
   │ 4. UPDATE outbox SET status='sent'|'failed', attempts, last_error, resend_message_id
   ▼
[Resend]
   │
   ▼
[Inbox of recipient]
```

### Why an outbox

Three reasons:
1. **Idempotency for free.** The unique constraint `(event_type, source_id, recipient_email)` prevents duplicate rows if a trigger ever fires twice (e.g., during a manual SQL replay). Resend's own `idempotency_key` header (set to outbox row id) prevents duplicate sends even if the Edge Function retries.
2. **Audit trail.** Every email attempt — successful or not — is a queryable row. Super-admin can inspect history.
3. **Decoupling.** The trigger's job ends at "row inserted." The Edge Function's job is independent — if Resend is down, retry logic doesn't block any DB transaction.

### Why server-side (not client)

The existing `notify()` calls live in browser JS. Three problems with keeping them there:
- The browser cannot read other users' emails from `auth.users` (RLS hides them). The current code generates fake `user-${uid}@unknown` placeholders for club admins.
- A user with JS disabled, or who closes the tab during the request, can skip notification entirely.
- Edge Function would still need to be called from the browser, meaning the client controls _whether_ to notify — making the trigger unreliable.

Moving to Postgres triggers means: every state change → guaranteed outbox row → guaranteed email attempt.

### Why Database Webhook (not pg_net direct)

`pg_net` can call Resend directly from a trigger. We pick Database Webhook + Edge Function because:
- Template rendering in TypeScript is way easier than concatenating HTML in PL/pgSQL.
- Resend SDK (`npm:resend`) handles auth headers, retries, idempotency_key formatting.
- Database Webhooks have built-in retry (3 attempts, exponential backoff) — equivalent to what we'd reinvent in PL/pgSQL.
- Edge Function logs are visible in Supabase dashboard; pg_net errors land in `net._http_response` table and are awkward to inspect.

## Data model

### Migration `0012_notifications_outbox.sql`

```sql
-- Migration 0012: notifications_outbox table + triggers on bookings + club_applications

-- 1. Outbox table
create table public.notifications_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'application_submitted',
    'application_approved',
    'application_rejected',
    'booking_created',
    'booking_confirmed',
    'booking_cancelled',
    'booking_completed',
    'booking_no_show'
  )),
  source_table text not null check (source_table in ('bookings', 'club_applications')),
  source_id uuid not null,
  recipient_email text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  last_error text,
  resend_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (event_type, source_id, recipient_email)
);

create index notifications_outbox_status_created_idx
  on public.notifications_outbox (status, created_at);

create index notifications_outbox_source_idx
  on public.notifications_outbox (source_table, source_id);

-- 2. RLS — super_admins read only, service_role bypass for Edge Function writes
alter table public.notifications_outbox enable row level security;

create policy "super_admins read outbox" on public.notifications_outbox
  for select using (is_super_admin());

-- No insert/update/delete policies → only service_role (bypasses RLS) can write.
-- Triggers also bypass RLS due to SECURITY DEFINER.

-- 3. Helper: resolve email by user_id (uses SECURITY DEFINER to bypass RLS on auth.users)
create or replace function get_user_email(p_user_id uuid)
returns text as $$
  select email from auth.users where id = p_user_id;
$$ language sql security definer stable;

-- 4. Helper: resolve all club_admin emails for a slug
create or replace function get_club_admin_emails(p_club_slug text)
returns table (email text) as $$
  select u.email
  from public.club_admins ca
  join auth.users u on u.id = ca.user_id
  where ca.club_slug = p_club_slug;
$$ language sql security definer stable;

-- 5. Helper: resolve all super_admin emails
create or replace function get_super_admin_emails()
returns table (email text) as $$
  select u.email
  from public.super_admins sa
  join auth.users u on u.id = sa.user_id;
$$ language sql security definer stable;
```

### Trigger functions

```sql
-- 6. Trigger: bookings AFTER INSERT → booking_created → emails to club admins
create or replace function notify_booking_created()
returns trigger as $$
declare
  v_payload jsonb;
  v_admin_email text;
begin
  v_payload := jsonb_build_object(
    'booking_id', NEW.id,
    'club_slug', NEW.club_slug,
    'club_name', NEW.club_name,
    'date', NEW.date::text,
    'time_slot', NEW.time_slot,
    'hours', NEW.hours,
    'total_price', NEW.total_price,
    'customer_email', get_user_email(NEW.user_id)
  );

  for v_admin_email in select email from get_club_admin_emails(NEW.club_slug) loop
    insert into public.notifications_outbox
      (event_type, source_table, source_id, recipient_email, payload)
    values
      ('booking_created', 'bookings', NEW.id, v_admin_email, v_payload)
    on conflict (event_type, source_id, recipient_email) do nothing;
  end loop;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger bookings_notify_created
  after insert on public.bookings
  for each row execute function notify_booking_created();

-- 7. Trigger: bookings AFTER UPDATE OF status → booking_confirmed/cancelled/completed/no_show
create or replace function notify_booking_status_change()
returns trigger as $$
declare
  v_event_type text;
  v_recipient_type text;     -- 'customer' or 'club_admins'
  v_payload jsonb;
  v_customer_email text;
  v_admin_email text;
begin
  -- Skip if status didn't change
  if NEW.status = OLD.status then
    return NEW;
  end if;

  v_event_type := 'booking_' || NEW.status;
  v_customer_email := get_user_email(NEW.user_id);

  -- Recipient logic: write to the party who did NOT initiate the change.
  -- status_changed_by is the user_id of whoever flipped the status (set by 0006 trigger).
  if NEW.status_changed_by = NEW.user_id then
    -- Customer initiated → notify club admins
    v_recipient_type := 'club_admins';
  else
    -- Club admin / super-admin initiated → notify customer
    v_recipient_type := 'customer';
  end if;

  v_payload := jsonb_build_object(
    'booking_id', NEW.id,
    'club_slug', NEW.club_slug,
    'club_name', NEW.club_name,
    'date', NEW.date::text,
    'time_slot', NEW.time_slot,
    'hours', NEW.hours,
    'total_price', NEW.total_price,
    'old_status', OLD.status,
    'new_status', NEW.status,
    'customer_email', v_customer_email
  );

  if v_recipient_type = 'customer' then
    insert into public.notifications_outbox
      (event_type, source_table, source_id, recipient_email, payload)
    values
      (v_event_type, 'bookings', NEW.id, v_customer_email, v_payload)
    on conflict (event_type, source_id, recipient_email) do nothing;
  else
    for v_admin_email in select email from get_club_admin_emails(NEW.club_slug) loop
      insert into public.notifications_outbox
        (event_type, source_table, source_id, recipient_email, payload)
      values
        (v_event_type, 'bookings', NEW.id, v_admin_email, v_payload)
      on conflict (event_type, source_id, recipient_email) do nothing;
    end loop;
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger bookings_notify_status_change
  after update of status on public.bookings
  for each row execute function notify_booking_status_change();

-- 8. Add assigned_slug column to club_applications (needed by application_approved trigger)
alter table public.club_applications
  add column if not exists assigned_slug text;

-- 9. Replace approve_club_application to also stamp assigned_slug
create or replace function approve_club_application(
  p_application_id uuid,
  p_club_slug text,
  p_review_note text default null
) returns text
language plpgsql
security invoker
as $$
declare v_app club_applications;
begin
  if not exists (select 1 from super_admins where user_id = auth.uid()) then
    raise exception 'Only super-admins can approve';
  end if;

  select * into v_app from club_applications where id = p_application_id;
  if not found then
    raise exception 'Application not found';
  end if;
  if v_app.status != 'pending' then
    raise exception 'Application already %', v_app.status;
  end if;

  insert into clubs (
    slug, name, city, district, address, phone, price_per_hour,
    working_hours, description, gradient, initial, is_published
  ) values (
    p_club_slug, v_app.club_name, v_app.city, v_app.district, v_app.address,
    v_app.applicant_phone, 1000,
    '{}'::jsonb,
    v_app.description,
    'linear-gradient(135deg, #8b5cf6, #ec4899)',
    upper(left(v_app.club_name, 1)),
    false
  );

  if v_app.applicant_user_id is not null then
    insert into club_admins (user_id, club_slug, granted_by)
    values (v_app.applicant_user_id, p_club_slug, auth.uid());
  end if;

  update club_applications set
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = p_review_note,
    assigned_slug = p_club_slug
  where id = p_application_id;

  return p_club_slug;
end;
$$;

-- 10. Trigger: club_applications AFTER INSERT → application_submitted → emails to super_admins
-- Note: club_applications has applicant_email and applicant_phone directly on the row,
-- and city (not city_id), description (not notes), applicant_user_id (not user_id).
create or replace function notify_application_submitted()
returns trigger as $$
declare
  v_payload jsonb;
  v_super_email text;
begin
  v_payload := jsonb_build_object(
    'application_id', NEW.id,
    'applicant_email', NEW.applicant_email,
    'applicant_name', NEW.applicant_name,
    'applicant_phone', NEW.applicant_phone,
    'club_name', NEW.club_name,
    'city', NEW.city,
    'address', NEW.address,
    'description', NEW.description
  );

  for v_super_email in select email from get_super_admin_emails() loop
    insert into public.notifications_outbox
      (event_type, source_table, source_id, recipient_email, payload)
    values
      ('application_submitted', 'club_applications', NEW.id, v_super_email, v_payload)
    on conflict (event_type, source_id, recipient_email) do nothing;
  end loop;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger applications_notify_submitted
  after insert on public.club_applications
  for each row execute function notify_application_submitted();

-- 11. Trigger: club_applications AFTER UPDATE OF status → application_approved/rejected → applicant
create or replace function notify_application_status_change()
returns trigger as $$
declare
  v_event_type text;
  v_payload jsonb;
begin
  if NEW.status = OLD.status then
    return NEW;
  end if;

  if NEW.status not in ('approved', 'rejected') then
    return NEW;
  end if;

  v_event_type := 'application_' || NEW.status;

  v_payload := jsonb_build_object(
    'application_id', NEW.id,
    'applicant_email', NEW.applicant_email,
    'applicant_name', NEW.applicant_name,
    'club_name', NEW.club_name,
    'club_slug', NEW.assigned_slug,
    'review_note', NEW.review_note,
    'new_status', NEW.status
  );

  insert into public.notifications_outbox
    (event_type, source_table, source_id, recipient_email, payload)
  values
    (v_event_type, 'club_applications', NEW.id, NEW.applicant_email, v_payload)
  on conflict (event_type, source_id, recipient_email) do nothing;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger applications_notify_status_change
  after update of status on public.club_applications
  for each row execute function notify_application_status_change();
```

### Database Webhook configuration (Supabase dashboard, manual step)

After applying migration 0012, in Supabase Dashboard → Database → Webhooks:

- **Name:** `notify-on-outbox-insert`
- **Table:** `public.notifications_outbox`
- **Events:** Insert
- **Type:** Supabase Edge Functions
- **Function:** `send-notification`
- **HTTP Method:** POST
- **Timeout:** 5000 ms
- **Retry config:** default (3 attempts, exponential backoff)

The webhook automatically POSTs `{ type: 'INSERT', table: 'notifications_outbox', record: {...}, schema: 'public' }` to the function URL with the service-role JWT.

## Edge Function

### File structure

```
supabase/functions/send-notification/
├── deno.json           # Deno deps lock
├── index.ts            # HTTP entry — parses webhook payload, dispatches
├── templates.ts        # 8 templates: subject + html + text per event_type
├── render.ts           # template interpolation (Mustache-like ${var} replace)
└── types.ts            # OutboxRow type definition
```

### `index.ts`

```typescript
// supabase/functions/send-notification/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4';
import { renderTemplate } from './templates.ts';
import type { OutboxRow } from './types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'noreply@mail.respawn.kz';
const FROM_NAME = 'respawn.kz';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const resend = new Resend(RESEND_API_KEY);

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: OutboxRow;
  schema: string;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (payload.type !== 'INSERT' || payload.table !== 'notifications_outbox') {
    return new Response('Ignored', { status: 200 });
  }

  const row = payload.record;

  // Skip if already processed (defense-in-depth — webhook should only fire on INSERT)
  if (row.status !== 'pending') {
    return new Response('Already processed', { status: 200 });
  }

  const rendered = renderTemplate(row.event_type, row.payload);
  if (!rendered) {
    await markFailed(row.id, `Unknown event_type: ${row.event_type}`);
    return new Response('Unknown event_type', { status: 422 }); // 4xx = don't retry
  }

  try {
    const { data, error } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: row.recipient_email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: {
        'X-Entity-Ref-ID': row.id,
      },
    }, {
      idempotencyKey: row.id,
    });

    if (error) {
      // Resend hard error (e.g., invalid email) — no retry
      await markFailed(row.id, `Resend error: ${error.message}`);
      return new Response('Resend rejected', { status: 422 });
    }

    await markSent(row.id, data?.id);
    return new Response('OK', { status: 200 });
  } catch (e) {
    // Network/transient — let webhook retry (5xx)
    const msg = e instanceof Error ? e.message : String(e);
    await incrementAttempts(row.id, msg);
    return new Response(`Transient error: ${msg}`, { status: 503 });
  }
});

async function markSent(id: string, resendMessageId: string | undefined) {
  await supabase.rpc('update_outbox_result', {
    p_id: id,
    p_status: 'sent',
    p_error: null,
    p_resend_message_id: resendMessageId ?? null,
  });
}

async function markFailed(id: string, error: string) {
  await supabase.rpc('update_outbox_result', {
    p_id: id,
    p_status: 'failed',
    p_error: error.slice(0, 1000),
    p_resend_message_id: null,
  });
}

async function incrementAttempts(id: string, error: string) {
  // Stay 'pending' but bump attempts so dashboard can spot retries
  await supabase.rpc('update_outbox_result', {
    p_id: id,
    p_status: 'pending',
    p_error: error.slice(0, 1000),
    p_resend_message_id: null,
  });
}
```

A single RPC handling all three outcomes (added to migration 0012):

```sql
create or replace function update_outbox_result(
  p_id uuid,
  p_status text,
  p_error text,
  p_resend_message_id text
) returns void as $$
  update public.notifications_outbox
  set status = p_status,
      attempts = attempts + 1,
      last_error = p_error,
      resend_message_id = coalesce(p_resend_message_id, resend_message_id),
      sent_at = case when p_status = 'sent' then now() else sent_at end
  where id = p_id;
$$ language sql security definer;
```

### `templates.ts`

```typescript
// supabase/functions/send-notification/templates.ts
import { renderHtml, renderText } from './render.ts';

type RenderedTemplate = { subject: string; html: string; text: string };

const SITE_URL = 'https://respawn.kz';

export function renderTemplate(
  eventType: string,
  payload: Record<string, unknown>,
): RenderedTemplate | null {
  const tpl = TEMPLATES[eventType];
  if (!tpl) return null;
  return {
    subject: tpl.subject(payload),
    html: renderHtml(tpl.bodyHtml(payload)),
    text: renderText(tpl.bodyText(payload)),
  };
}

type TemplateDef = {
  subject: (p: Record<string, unknown>) => string;
  bodyHtml: (p: Record<string, unknown>) => string;
  bodyText: (p: Record<string, unknown>) => string;
};

const TEMPLATES: Record<string, TemplateDef> = {
  booking_created: {
    subject: (p) => `Новая бронь — ${p.club_name}, ${p.date}`,
    bodyHtml: (p) => `
      <h1>Новая бронь</h1>
      <p>Получена новая бронь в клубе <strong>${p.club_name}</strong>.</p>
      <ul>
        <li>Дата: ${p.date}</li>
        <li>Время: ${p.time_slot} (${p.hours} ч)</li>
        <li>Сумма: ${p.total_price} ₸</li>
        <li>Клиент: ${p.customer_email}</li>
      </ul>
      <p><a href="${SITE_URL}/dashboard/bookings/">Открыть в кабинете</a> чтобы подтвердить или отклонить.</p>
    `,
    bodyText: (p) => `
Новая бронь в клубе ${p.club_name}.
Дата: ${p.date}
Время: ${p.time_slot} (${p.hours} ч)
Сумма: ${p.total_price} ₸
Клиент: ${p.customer_email}

Управление: ${SITE_URL}/dashboard/bookings/
    `,
  },

  booking_confirmed: {
    subject: (p) => `Бронь подтверждена — ${p.club_name}, ${p.date}`,
    bodyHtml: (p) => `
      <h1>Бронь подтверждена</h1>
      <p>Клуб <strong>${p.club_name}</strong> подтвердил твою бронь.</p>
      <ul>
        <li>Дата: ${p.date}</li>
        <li>Время: ${p.time_slot} (${p.hours} ч)</li>
        <li>Сумма: ${p.total_price} ₸</li>
      </ul>
      <p><a href="${SITE_URL}/me/">Открыть личный кабинет</a></p>
    `,
    bodyText: (p) => `
Клуб ${p.club_name} подтвердил твою бронь.
Дата: ${p.date}
Время: ${p.time_slot} (${p.hours} ч)
Сумма: ${p.total_price} ₸

Личный кабинет: ${SITE_URL}/me/
    `,
  },

  booking_cancelled: {
    subject: (p) => `Бронь отменена — ${p.club_name}, ${p.date}`,
    bodyHtml: (p) => `
      <h1>Бронь отменена</h1>
      <p>Бронь в клубе <strong>${p.club_name}</strong> на ${p.date} (${p.time_slot}) отменена.</p>
      <p><a href="${SITE_URL}/clubs/${p.club_slug}/">Открыть страницу клуба</a> чтобы забронировать другое время.</p>
    `,
    bodyText: (p) => `
Бронь в клубе ${p.club_name} на ${p.date} (${p.time_slot}) отменена.

Страница клуба: ${SITE_URL}/clubs/${p.club_slug}/
    `,
  },

  booking_completed: {
    subject: (p) => `Спасибо за визит — ${p.club_name}`,
    bodyHtml: (p) => `
      <h1>Спасибо за визит!</h1>
      <p>Бронь в клубе <strong>${p.club_name}</strong> на ${p.date} завершена.</p>
      <p>Будем рады видеть тебя снова — <a href="${SITE_URL}/clubs/${p.club_slug}/">забронировать ещё</a>.</p>
    `,
    bodyText: (p) => `
Спасибо за визит! Бронь в клубе ${p.club_name} на ${p.date} завершена.

Забронировать ещё: ${SITE_URL}/clubs/${p.club_slug}/
    `,
  },

  booking_no_show: {
    subject: (p) => `Бронь отмечена как no-show — ${p.club_name}`,
    bodyHtml: (p) => `
      <h1>Бронь отмечена как no-show</h1>
      <p>Клуб <strong>${p.club_name}</strong> отметил бронь на ${p.date} (${p.time_slot}) как несостоявшуюся.</p>
      <p>Если это ошибка — свяжись с клубом напрямую.</p>
    `,
    bodyText: (p) => `
Клуб ${p.club_name} отметил бронь на ${p.date} (${p.time_slot}) как несостоявшуюся.
Если это ошибка — свяжись с клубом напрямую.
    `,
  },

  application_submitted: {
    subject: (p) => `Новая заявка клуба — ${p.club_name}`,
    bodyHtml: (p) => `
      <h1>Новая заявка</h1>
      <p>Поступила заявка на регистрацию клуба <strong>${p.club_name}</strong>.</p>
      <ul>
        <li>Город: ${p.city}</li>
        <li>Адрес: ${p.address}</li>
        <li>Контакт: ${p.applicant_name}${p.applicant_phone ? `, ${p.applicant_phone}` : ''}</li>
        <li>Email: ${p.applicant_email}</li>
        ${p.description ? `<li>Описание: ${p.description}</li>` : ''}
      </ul>
      <p><a href="${SITE_URL}/admin/applications/">Открыть очередь модерации</a></p>
    `,
    bodyText: (p) => `
Новая заявка на регистрацию клуба ${p.club_name}.
Город: ${p.city}
Адрес: ${p.address}
Контакт: ${p.applicant_name}${p.applicant_phone ? `, ${p.applicant_phone}` : ''}
Email: ${p.applicant_email}
${p.description ? `Описание: ${p.description}\n` : ''}

Модерация: ${SITE_URL}/admin/applications/
    `,
  },

  application_approved: {
    subject: (p) => `Заявка одобрена — ${p.club_name}`,
    bodyHtml: (p) => `
      <h1>Заявка одобрена</h1>
      <p>Заявка на регистрацию клуба <strong>${p.club_name}</strong> одобрена.</p>
      <p>Теперь клуб доступен для редактирования в твоём кабинете.</p>
      ${p.review_note ? `<p>Комментарий модератора: ${p.review_note}</p>` : ''}
      <p><a href="${SITE_URL}/dashboard/club/edit?slug=${p.club_slug}">Открыть редактор клуба</a></p>
    `,
    bodyText: (p) => `
Заявка на регистрацию клуба ${p.club_name} одобрена.
Клуб доступен для редактирования в твоём кабинете.
${p.review_note ? `Комментарий модератора: ${p.review_note}\n` : ''}

Редактор: ${SITE_URL}/dashboard/club/edit?slug=${p.club_slug}
    `,
  },

  application_rejected: {
    subject: (p) => `Заявка отклонена — ${p.club_name}`,
    bodyHtml: (p) => `
      <h1>Заявка отклонена</h1>
      <p>К сожалению, заявка на регистрацию клуба <strong>${p.club_name}</strong> отклонена.</p>
      ${p.review_note ? `<p>Причина: ${p.review_note}</p>` : '<p>Свяжись с поддержкой для подробностей.</p>'}
      <p><a href="${SITE_URL}/dashboard/register/">Подать новую заявку</a></p>
    `,
    bodyText: (p) => `
Заявка на регистрацию клуба ${p.club_name} отклонена.
${p.review_note ? `Причина: ${p.review_note}\n` : 'Свяжись с поддержкой для подробностей.\n'}

Подать новую заявку: ${SITE_URL}/dashboard/register/
    `,
  },
};
```

### `render.ts`

```typescript
// supabase/functions/send-notification/render.ts

const BASE_HTML = (body: string) => `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0f; color: #e6e6e9; padding: 24px; line-height: 1.5; }
  .container { max-width: 560px; margin: 0 auto; background: #14141c; border-radius: 12px; padding: 32px; }
  h1 { font-size: 22px; margin: 0 0 16px; color: #00d4ff; }
  a { color: #00d4ff; }
  a.button { display: inline-block; background: #00d4ff; color: #001014; padding: 10px 20px; border-radius: 8px; text-decoration: none; margin-top: 16px; }
  .footer { margin-top: 32px; color: #6e6e7a; font-size: 12px; }
  ul { padding-left: 20px; }
  li { margin: 4px 0; }
</style>
</head>
<body>
  <div class="container">
    ${body}
    <div class="footer">
      respawn.kz · бронирование компьютерных клубов в Алматы<br>
      Если это письмо тебя не касается — игнорируй его.
    </div>
  </div>
</body>
</html>`;

export function renderHtml(body: string): string {
  return BASE_HTML(body.trim());
}

export function renderText(body: string): string {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}
```

### `types.ts`

```typescript
// supabase/functions/send-notification/types.ts
export interface OutboxRow {
  id: string;
  event_type: string;
  source_table: string;
  source_id: string;
  recipient_email: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  last_error: string | null;
  resend_message_id: string | null;
  created_at: string;
  sent_at: string | null;
}
```

### `deno.json`

```json
{
  "tasks": {
    "dev": "deno run --allow-all --watch index.ts"
  },
  "imports": {}
}
```

## Domain setup (user action)

In Resend Dashboard:

1. **Add domain:** `mail.respawn.kz`.
2. Resend shows 3 DNS records. Copy them.
3. In Cloudflare → DNS → `respawn.kz` zone, add (all proxied OFF — DNS-only):
   - **TXT** `send.mail.respawn.kz` → `v=spf1 include:_spf.resend.com ~all`
   - **CNAME** `resend._domainkey.mail.respawn.kz` → `resend._domainkey.resend.com`
   - **TXT** `_dmarc.mail.respawn.kz` → `v=DMARC1; p=none;`
4. Wait ~5 minutes, click Verify in Resend.
5. Generate API key in Resend dashboard → "Sending"-scoped key.

Then on the dev machine:

```bash
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set FROM_EMAIL=noreply@mail.respawn.kz
```

(Or via Supabase Dashboard → Edge Functions → Secrets.)

## Cleanup of existing client-side code

After triggers are live and verified, delete client-side `notify()` integration:

**Files to modify:**
- `src/scripts/booking-real.ts` — remove import + 1 call site (lines around 6, 282-289). The `club_admins` lookup query also goes since it's no longer needed.
- `src/scripts/admin-applications.ts` — remove import + 2 call sites (lines 199, 216).
- `src/scripts/dashboard-register.ts` — remove import + 1 call site (line 113).
- `src/scripts/dashboard-bookings.ts` — remove import + 4 call sites (lines 120, 123, 126, 129). The customer-email-fetch block (around line 170) also goes since it was a placeholder.

**Files to delete:**
- `src/lib/notifications.ts`

**Verification:** `grep -r "notify\(" src/` and `grep -r "notifications" src/` return zero hits (except the deploy-trigger.ts file which is unrelated).

## Failure handling

| Scenario | Behavior |
|---|---|
| Resend API returns 4xx (invalid email, etc.) | `status='failed'` immediately, no retry |
| Edge Function throws / Resend 5xx | Returns 503 → Database Webhook retries up to 3 times with exponential backoff (built-in) |
| After 3 failed retries | Webhook gives up. Row remains `status='pending'` until `attempts >= 3` → effectively dead-letter. Super-admin can manually re-trigger via SQL UPDATE. |
| Webhook itself fails to fire | Supabase will alert in dashboard. Row sits in `pending` indefinitely. Very rare. |
| Trigger fires twice (e.g., manual SQL replay) | Unique constraint blocks the duplicate INSERT, no duplicate email. |
| Same email sent twice from outbox (Edge Function rerun) | Resend's `idempotency_key = outbox.id` deduplicates server-side at Resend. |
| Recipient has no row in `auth.users` | `get_user_email()` returns NULL → INSERT with `recipient_email=NULL` fails the NOT NULL constraint → trigger raises exception → original DB operation fails. This is correct behavior: data integrity issue should be loud. |

## Observability

For MVP:
- Edge Function logs in Supabase Dashboard → Edge Functions → Logs.
- `notifications_outbox` queryable from SQL Editor: `select * from notifications_outbox where status != 'sent' order by created_at desc limit 50;`
- Resend Dashboard → Logs shows every successful send, bounces, etc.

Future (deferred):
- `/admin/notifications` page with filters.
- Slack/Telegram alert on `status='failed'`.

## Acceptance criteria

1. **AC1:** User books a club via `/clubs/<slug>/`. Within 60 seconds, every club_admin of that club receives an HTML email subject "Новая бронь — &lt;club&gt;, &lt;date&gt;" with the customer's real email visible.
2. **AC2:** Club admin clicks "Подтвердить" on a pending booking in `/dashboard/bookings/`. Customer receives email subject "Бронь подтверждена — &lt;club&gt;, &lt;date&gt;".
3. **AC3:** Customer cancels a booking via `/me/`. Every club_admin receives email subject "Бронь отменена — &lt;club&gt;, &lt;date&gt;".
4. **AC4:** Club admin cancels a booking. Customer receives the cancellation email.
5. **AC5:** Club admin marks a booking as completed or no-show. Customer receives the corresponding email.
6. **AC6:** User submits a club application via `/dashboard/register/`. Every super_admin receives email subject "Новая заявка клуба — &lt;club&gt;".
7. **AC7:** Super-admin approves an application via `/admin/applications/`. Applicant receives email subject "Заявка одобрена — &lt;club&gt;" with a link to `/dashboard/club/edit?slug=...`.
8. **AC8:** Super-admin rejects an application with a review note. Applicant receives email subject "Заявка отклонена — &lt;club&gt;" containing the note.
9. **AC9:** Query `select status, count(*) from notifications_outbox group by status` after a smoke test shows `sent` count matching the number of expected emails, and zero `failed` rows under normal conditions.
10. **AC10:** Running a booking insert twice with the same payload (e.g., manual SQL re-execution) produces only one `notifications_outbox` row per (event_type, source_id, recipient_email).
11. **AC11:** Running `grep -r "notify\(" src/` returns zero hits. File `src/lib/notifications.ts` does not exist.
12. **AC12:** `scripts/verify-notifications.mjs` returns "12/12 checks passed" covering: outbox table exists, indexes exist, unique constraint exists, 4 triggers exist (bookings × 2, applications × 2), 3 email-lookup helper functions exist (`get_user_email`, `get_club_admin_emails`, `get_super_admin_emails`), `update_outbox_result` RPC exists, `club_applications.assigned_slug` column exists, RLS read policy for super_admins exists, status check constraint matches the 3 values, event_type check constraint matches the 8 values.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| DNS propagation slow → emails go to spam | DMARC `p=none` initially so messages aren't dropped if SPF/DKIM partially fails during verification window. Tighten to `p=quarantine` after a week of clean sends. |
| Resend free tier limit (100 emails/day) | At MVP scale (10s of bookings/day) we're well under. Will exceed only at scale, then upgrade. |
| Trigger introduces lock contention on bookings inserts | Triggers do small read-only joins (1-3 rows) + 1-N small inserts. Negligible. |
| Edge Function cold start adds latency | Cold start ~500ms, warm ~50ms. Email is async — user doesn't wait. |
| Resend domain verification stuck | Common CF gotcha: SPF TXT must be on `send.mail.respawn.kz` (subdomain of subdomain), not `mail.respawn.kz`. Resend dashboard shows exact host. |
| Service-role key in Edge Function leaks via logs | `index.ts` never logs the key. Supabase auto-injects, doesn't expose. |
| Customer email address changes after notification queued | Outbox `recipient_email` is snapshotted at trigger time → email goes to old address. Acceptable: rare, and the user only just updated their address. |
| Super-admin (not customer, not club_admin) cancels a booking | Recipient logic notifies customer only (since `status_changed_by != user_id`). Club admin doesn't get a copy. Acceptable for MVP — super-admin actions are rare and they can manually notify the club if needed. Reconsider if super-admin intervention becomes common. |

## Migration sequence

1. Write & commit `supabase/migrations/0012_notifications_outbox.sql`.
2. Apply migration: `DATABASE_URL=... node scripts/apply-sql.mjs supabase/migrations/0012_notifications_outbox.sql`.
3. Write & commit Edge Function files.
4. Deploy Edge Function: `supabase functions deploy send-notification` (user action with Supabase CLI).
5. Set secrets: `supabase secrets set RESEND_API_KEY=re_xxx FROM_EMAIL=noreply@mail.respawn.kz` (user action).
6. User: configure DNS records in Cloudflare per Resend dashboard. Verify in Resend.
7. User: configure Database Webhook in Supabase Dashboard (per "Database Webhook configuration" section above).
8. Smoke test: insert test row directly into `notifications_outbox`, verify email arrives.
9. End-to-end smoke: book a club, verify email arrives at the admin.
10. Delete client-side `notify()` integration (file + 4 call sites).
11. Update `HANDOFF.md` and `07 Dev Projects/almaty-gg/decisions.md`.
12. Commit, build, deploy via `npm run deploy`.
13. Run `scripts/verify-notifications.mjs` against production DB.

## Open items requiring user action (one-time)

- [ ] Create Resend account, verify mail.respawn.kz domain via DNS records.
- [ ] Generate Resend API key, store securely.
- [ ] Run `supabase secrets set RESEND_API_KEY=... FROM_EMAIL=...`.
- [ ] Install Supabase CLI if not already (`npm install -g supabase`). Note: the project already uses `pg` directly for SQL, but Edge Functions need the CLI for `supabase functions deploy`.
- [ ] Configure Database Webhook in Supabase Dashboard once Edge Function is deployed.

These can happen in parallel with code work — DNS verification waits in the background while we write the function.
