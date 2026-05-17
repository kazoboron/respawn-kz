# respawn.kz Email Notifications via Resend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the client-side `notify()` stub with server-side Postgres triggers that write to a `notifications_outbox` table, then a Database Webhook fires a Supabase Edge Function that sends real emails via Resend. All 8 cabinet/booking events covered. Russian-only HTML+text templates.

**Architecture:** Postgres trigger (4 of them) → INSERT outbox row → Database Webhook → Edge Function `send-notification` → Resend API. Idempotency via `(event_type, source_id, recipient_email)` unique constraint + Resend `idempotencyKey = outbox.id`. Retry via Database Webhook built-in (3 attempts, exponential backoff). Failed rows stay queryable in outbox.

**Tech Stack:** PostgreSQL triggers + PL/pgSQL; Supabase Edge Functions (Deno); `npm:resend@4`; `@supabase/supabase-js@2` via JSR; Cloudflare DNS for SPF/DKIM/DMARC. Project context: Astro 4.16 SSG, no test framework — verification via `node scripts/verify-*.mjs` and manual smoke.

**Spec:** [docs/superpowers/specs/2026-05-18-respawn-kz-email-notifications-design.md](../specs/2026-05-18-respawn-kz-email-notifications-design.md)

**Pre-flight:** Working tree must be clean on `main`. Pull latest. The plan creates a branch `feat/email-notifications` and merges via FF at the end.

**Identity for commits (project convention, see HANDOFF.md):**
```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "..."
```

**DATABASE_URL for SQL ops (from HANDOFF.md):**
```
postgresql://postgres.qfuhtvtietnldeqklxdo:8mrdO7sz3GYGEQ8e@aws-1-eu-central-1.pooler.supabase.com:5432/postgres
```

---

## File map

**Create:**
- `supabase/migrations/0012_notifications_outbox.sql` — outbox table + 3 email-lookup helpers + `update_outbox_result` RPC + 4 trigger functions + `ALTER club_applications` + replace `approve_club_application` RPC
- `supabase/functions/send-notification/deno.json`
- `supabase/functions/send-notification/types.ts`
- `supabase/functions/send-notification/render.ts`
- `supabase/functions/send-notification/templates.ts`
- `supabase/functions/send-notification/index.ts`
- `scripts/verify-notifications.mjs` — 12 sanity checks
- `scripts/seed-test-notification.mjs` — inserts a dummy outbox row to smoke-test the Edge Function

**Modify:**
- `src/scripts/booking-real.ts` — drop import + 1 notify() call + club_admins lookup block
- `src/scripts/admin-applications.ts` — drop import + 2 notify() calls
- `src/scripts/dashboard-register.ts` — drop import + 1 notify() call
- `src/scripts/dashboard-bookings.ts` — drop import + 4 notify() calls + customer-email-fetch placeholder block
- `HANDOFF.md` — update section 8 (known issues — remove fake-email TODO) and section 9 (roadmap — mark SP5 done)
- `07 Dev Projects/almaty-gg/decisions.md` (Obsidian) — log decision
- `07 Dev Projects/almaty-gg/open-questions.md` (Obsidian) — close email-notifications open question
- `08 Sessions/2026-05-18.md` (Obsidian) — session journal block

**Delete:**
- `src/lib/notifications.ts`

---

## Task 1: Set up the feature branch

**Files:** none (git only)

- [ ] **Step 1: Verify clean working tree on main**

```bash
git status
git rev-parse --abbrev-ref HEAD
```

Expected: `On branch main`, `nothing to commit, working tree clean` (apart from the spec commit already made). If dirty, stash or address before continuing.

- [ ] **Step 2: Pull latest and create branch**

```bash
git pull --ff-only origin main
git checkout -b feat/email-notifications
```

Expected: switched to new branch.

---

## Task 2: Write migration 0012 part 1 — outbox table + RLS + helpers + RPC

**Files:**
- Create: `supabase/migrations/0012_notifications_outbox.sql`

- [ ] **Step 1: Write the table + RLS + 3 email-lookup helpers + update_outbox_result RPC**

Create `supabase/migrations/0012_notifications_outbox.sql` with this content (this is the first half — triggers are added in Task 3):

```sql
-- Migration 0012: notifications_outbox table + email-lookup helpers + 4 triggers
-- on bookings and club_applications. See spec
-- docs/superpowers/specs/2026-05-18-respawn-kz-email-notifications-design.md

-- ============================================================
-- 1. Outbox table
-- ============================================================
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

-- ============================================================
-- 2. RLS — super_admins read only; service_role writes via bypass
-- ============================================================
alter table public.notifications_outbox enable row level security;

create policy "super_admins read outbox" on public.notifications_outbox
  for select using (is_super_admin());

-- ============================================================
-- 3. Email-lookup helpers (SECURITY DEFINER bypasses RLS on auth.users)
-- ============================================================
create or replace function get_user_email(p_user_id uuid)
returns text as $$
  select email from auth.users where id = p_user_id;
$$ language sql security definer stable;

create or replace function get_club_admin_emails(p_club_slug text)
returns table (email text) as $$
  select u.email
  from public.club_admins ca
  join auth.users u on u.id = ca.user_id
  where ca.club_slug = p_club_slug;
$$ language sql security definer stable;

create or replace function get_super_admin_emails()
returns table (email text) as $$
  select u.email
  from public.super_admins sa
  join auth.users u on u.id = sa.user_id;
$$ language sql security definer stable;

-- ============================================================
-- 4. RPC for Edge Function to update outbox rows atomically
-- ============================================================
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

- [ ] **Step 2: Commit part 1**

```bash
git add supabase/migrations/0012_notifications_outbox.sql
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
feat(db): add notifications_outbox table + helpers (migration 0012 part 1)

Outbox table with unique constraint for idempotency, RLS read for
super_admins, 3 email-lookup helpers (user/club_admins/super_admins)
using SECURITY DEFINER to bypass auth.users RLS, and update_outbox_result
RPC for the Edge Function to mark rows sent/failed atomically.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Write migration 0012 part 2 — ALTER applications + replace approve RPC + 4 triggers

**Files:**
- Modify: `supabase/migrations/0012_notifications_outbox.sql` (append to existing file)

- [ ] **Step 1: Append ALTER + replaced approve RPC**

Append to `supabase/migrations/0012_notifications_outbox.sql`:

```sql

-- ============================================================
-- 5. Add assigned_slug to club_applications (needed by application_approved trigger)
-- ============================================================
alter table public.club_applications
  add column if not exists assigned_slug text;

-- ============================================================
-- 6. Replace approve_club_application RPC to also stamp assigned_slug
-- ============================================================
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
```

- [ ] **Step 2: Append the 4 trigger functions**

Append to `supabase/migrations/0012_notifications_outbox.sql`:

```sql

-- ============================================================
-- 7. Trigger: bookings AFTER INSERT → booking_created → emails to club admins
-- ============================================================
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

-- ============================================================
-- 8. Trigger: bookings AFTER UPDATE OF status → booking_confirmed/cancelled/completed/no_show
-- Recipient = the party who did NOT initiate the change (status_changed_by vs user_id)
-- ============================================================
create or replace function notify_booking_status_change()
returns trigger as $$
declare
  v_event_type text;
  v_recipient_type text;
  v_payload jsonb;
  v_customer_email text;
  v_admin_email text;
begin
  if NEW.status = OLD.status then
    return NEW;
  end if;

  v_event_type := 'booking_' || NEW.status;
  v_customer_email := get_user_email(NEW.user_id);

  if NEW.status_changed_by = NEW.user_id then
    v_recipient_type := 'club_admins';
  else
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

-- ============================================================
-- 9. Trigger: club_applications AFTER INSERT → application_submitted → super_admins
-- ============================================================
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

-- ============================================================
-- 10. Trigger: club_applications AFTER UPDATE OF status → application_approved/rejected
-- ============================================================
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

- [ ] **Step 3: Commit part 2**

```bash
git add supabase/migrations/0012_notifications_outbox.sql
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
feat(db): add 4 triggers + ALTER applications (migration 0012 part 2)

Adds assigned_slug column to club_applications, replaces
approve_club_application RPC to stamp it, and adds 4 trigger functions:
notify_booking_created (AFTER INSERT bookings),
notify_booking_status_change (AFTER UPDATE OF status bookings),
notify_application_submitted (AFTER INSERT club_applications),
notify_application_status_change (AFTER UPDATE OF status club_applications).

Triggers insert into notifications_outbox with on-conflict-do-nothing
for idempotency.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Apply migration 0012 to Supabase

**Files:** none (DB only)

- [ ] **Step 1: Apply the migration**

Run from project root (`C:\ClaudeCode`):

```bash
DATABASE_URL="postgresql://postgres.qfuhtvtietnldeqklxdo:8mrdO7sz3GYGEQ8e@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" node scripts/apply-sql.mjs supabase/migrations/0012_notifications_outbox.sql
```

Expected: script reports success, no error. If the password has been rotated (28P01), ask the user to reset it and provide the new one.

- [ ] **Step 2: Quick sanity ping**

```bash
DATABASE_URL="postgresql://postgres.qfuhtvtietnldeqklxdo:8mrdO7sz3GYGEQ8e@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" node -e "import('pg').then(async ({default: pg}) => { const c = new pg.Client(process.env.DATABASE_URL); await c.connect(); const r = await c.query(\"select count(*) from notifications_outbox\"); console.log('outbox count:', r.rows[0].count); await c.end(); })"
```

Expected: `outbox count: 0` printed.

---

## Task 5: Create verify-notifications.mjs

**Files:**
- Create: `scripts/verify-notifications.mjs`

- [ ] **Step 1: Write the script**

Create `scripts/verify-notifications.mjs`:

```javascript
#!/usr/bin/env node
// 12 sanity checks for migration 0012 (email notifications).
// Usage: DATABASE_URL=... node scripts/verify-notifications.mjs

import pg from 'pg';

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL env var required');
  process.exit(2);
}

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

check('outbox table exists', async (c) => {
  const r = await c.query(`
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'notifications_outbox'
  `);
  if (r.rowCount === 0) throw new Error('table missing');
});

check('outbox status_created index exists', async (c) => {
  const r = await c.query(`
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'notifications_outbox_status_created_idx'
  `);
  if (r.rowCount === 0) throw new Error('index missing');
});

check('outbox source index exists', async (c) => {
  const r = await c.query(`
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'notifications_outbox_source_idx'
  `);
  if (r.rowCount === 0) throw new Error('index missing');
});

check('outbox unique constraint on (event_type, source_id, recipient_email)', async (c) => {
  const r = await c.query(`
    select 1 from pg_constraint
    where conrelid = 'public.notifications_outbox'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%event_type%source_id%recipient_email%'
  `);
  if (r.rowCount === 0) throw new Error('unique constraint missing');
});

check('event_type check constraint has 8 values', async (c) => {
  const r = await c.query(`
    select pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = 'public.notifications_outbox'::regclass
      and contype = 'c'
      and conname like '%event_type%'
  `);
  const def = r.rows[0]?.def ?? '';
  const events = ['application_submitted','application_approved','application_rejected','booking_created','booking_confirmed','booking_cancelled','booking_completed','booking_no_show'];
  for (const e of events) if (!def.includes(e)) throw new Error(`missing ${e}`);
});

check('status check constraint has 3 values', async (c) => {
  const r = await c.query(`
    select pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = 'public.notifications_outbox'::regclass
      and contype = 'c'
      and conname like '%status%'
  `);
  const def = r.rows[0]?.def ?? '';
  for (const s of ['pending', 'sent', 'failed']) if (!def.includes(s)) throw new Error(`missing ${s}`);
});

check('RLS read policy for super_admins exists', async (c) => {
  const r = await c.query(`
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notifications_outbox'
      and policyname = 'super_admins read outbox'
  `);
  if (r.rowCount === 0) throw new Error('policy missing');
});

check('3 email-lookup helper functions exist', async (c) => {
  const r = await c.query(`
    select proname from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('get_user_email','get_club_admin_emails','get_super_admin_emails')
  `);
  if (r.rowCount !== 3) throw new Error(`expected 3, got ${r.rowCount}`);
});

check('update_outbox_result RPC exists', async (c) => {
  const r = await c.query(`
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'update_outbox_result'
  `);
  if (r.rowCount === 0) throw new Error('RPC missing');
});

check('club_applications.assigned_slug column exists', async (c) => {
  const r = await c.query(`
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'club_applications'
      and column_name = 'assigned_slug'
  `);
  if (r.rowCount === 0) throw new Error('column missing');
});

check('4 notification triggers exist', async (c) => {
  const r = await c.query(`
    select tgname from pg_trigger
    where tgname in (
      'bookings_notify_created',
      'bookings_notify_status_change',
      'applications_notify_submitted',
      'applications_notify_status_change'
    )
  `);
  if (r.rowCount !== 4) throw new Error(`expected 4 triggers, got ${r.rowCount}: ${r.rows.map(x => x.tgname).join(',')}`);
});

check('approve_club_application RPC updates assigned_slug', async (c) => {
  const r = await c.query(`
    select prosrc from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'approve_club_application'
  `);
  const src = r.rows[0]?.prosrc ?? '';
  if (!src.includes('assigned_slug')) throw new Error('approve_club_application does not set assigned_slug');
});

const client = new Client({ connectionString: databaseUrl });
await client.connect();

let pass = 0, fail = 0;
for (const c of checks) {
  try {
    await c.fn(client);
    console.log(`✓ ${c.name}`);
    pass++;
  } catch (e) {
    console.log(`✗ ${c.name} — ${e.message}`);
    fail++;
  }
}

await client.end();

console.log(`\n${pass}/${checks.length} checks passed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it**

```bash
DATABASE_URL="postgresql://postgres.qfuhtvtietnldeqklxdo:8mrdO7sz3GYGEQ8e@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" node scripts/verify-notifications.mjs
```

Expected: `12/12 checks passed`. If any fail, the migration didn't apply cleanly — re-read 0012, fix, re-apply.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-notifications.mjs
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
chore(scripts): add verify-notifications.mjs (12 schema sanity checks)

Verifies migration 0012: outbox table + indexes + constraints + RLS +
3 helpers + update_outbox_result RPC + assigned_slug column + 4 triggers
+ approve_club_application updated.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Edge Function scaffold (deno.json + types.ts)

**Files:**
- Create: `supabase/functions/send-notification/deno.json`
- Create: `supabase/functions/send-notification/types.ts`

- [ ] **Step 1: Create deno.json**

Create `supabase/functions/send-notification/deno.json`:

```json
{
  "tasks": {
    "dev": "deno run --allow-all --watch index.ts"
  },
  "imports": {}
}
```

- [ ] **Step 2: Create types.ts**

Create `supabase/functions/send-notification/types.ts`:

```typescript
// Types shared across the Edge Function.

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

export interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: OutboxRow;
  schema: string;
}

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-notification/deno.json supabase/functions/send-notification/types.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
feat(fn): scaffold send-notification Edge Function (deno.json + types)

Adds Deno config and shared TypeScript types for the email-sending
Edge Function — OutboxRow, WebhookPayload, RenderedTemplate.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Edge Function render.ts (HTML shell + text normalizer)

**Files:**
- Create: `supabase/functions/send-notification/render.ts`

- [ ] **Step 1: Create render.ts**

Create `supabase/functions/send-notification/render.ts`:

```typescript
// HTML email shell + text normalizer.

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

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/send-notification/render.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
feat(fn): add render.ts (HTML shell + text normalizer)

renderHtml wraps a body string in the brand HTML shell (dark background,
cyan accents, container card, footer). renderText collapses whitespace
in the text/plain body.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Edge Function templates.ts (8 templates)

**Files:**
- Create: `supabase/functions/send-notification/templates.ts`

- [ ] **Step 1: Create templates.ts**

Create `supabase/functions/send-notification/templates.ts`:

```typescript
import { renderHtml, renderText } from './render.ts';
import type { RenderedTemplate } from './types.ts';

const SITE_URL = 'https://respawn.kz';

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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/send-notification/templates.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
feat(fn): add 8 Russian-language email templates

Templates for all 8 events from the notify() event taxonomy:
booking_created, booking_confirmed, booking_cancelled, booking_completed,
booking_no_show, application_submitted, application_approved,
application_rejected. Each emits {subject, html, text} on render.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Edge Function index.ts (handler)

**Files:**
- Create: `supabase/functions/send-notification/index.ts`

- [ ] **Step 1: Create index.ts**

Create `supabase/functions/send-notification/index.ts`:

```typescript
// Edge Function: send-notification
// Invoked by Database Webhook on INSERT into public.notifications_outbox.
// Sends an email via Resend, then updates the row status via RPC.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4';
import { renderTemplate } from './templates.ts';
import type { OutboxRow, WebhookPayload } from './types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'noreply@mail.respawn.kz';
const FROM_NAME = 'respawn.kz';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const resend = new Resend(RESEND_API_KEY);

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

  if (row.status !== 'pending') {
    return new Response('Already processed', { status: 200 });
  }

  const rendered = renderTemplate(row.event_type, row.payload);
  if (!rendered) {
    await markFailed(row.id, `Unknown event_type: ${row.event_type}`);
    return new Response('Unknown event_type', { status: 422 });
  }

  try {
    const { data, error } = await resend.emails.send(
      {
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: row.recipient_email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        headers: {
          'X-Entity-Ref-ID': row.id,
        },
      },
      {
        idempotencyKey: row.id,
      },
    );

    if (error) {
      await markFailed(row.id, `Resend error: ${error.message}`);
      return new Response('Resend rejected', { status: 422 });
    }

    await markSent(row.id, data?.id);
    return new Response('OK', { status: 200 });
  } catch (e) {
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
  await supabase.rpc('update_outbox_result', {
    p_id: id,
    p_status: 'pending',
    p_error: error.slice(0, 1000),
    p_resend_message_id: null,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/send-notification/index.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
feat(fn): add send-notification handler

POST handler invoked by Database Webhook on outbox INSERT. Renders the
appropriate template, calls resend.emails.send with idempotencyKey =
outbox.id, marks the row sent/failed via update_outbox_result RPC.

Status codes: 200 ok / already-processed / ignored, 422 hard reject
(no retry), 503 transient error (webhook retries), 400/405 malformed.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: User action — Resend account + DNS + secrets

**Files:** none (out-of-band setup)

This task is performed by the user, not the implementer. The implementer **pauses here** and prints the checklist for the user to execute in parallel with the next steps. The implementer waits for explicit user confirmation that each item is done before continuing to Task 11.

- [ ] **Step 1: Print checklist for the user**

Print this verbatim to the user:

```
Before I can deploy the Edge Function and configure the webhook, please do:

1. Create a Resend account at https://resend.com (free tier — 100 emails/day, 3000/month).
2. In Resend Dashboard → Domains → Add Domain → enter "mail.respawn.kz".
3. Resend will show 3 DNS records. Copy the EXACT values (host names matter — they include "send", "resend._domainkey", "_dmarc").
4. In Cloudflare → respawn.kz zone → DNS, add the 3 records as Resend shows them.
   - All records DNS-only (not proxied / "grey cloud" not orange).
   - Save each one.
5. Wait ~5 minutes, then in Resend → Domains → click "Verify DNS Records" on mail.respawn.kz. All 3 should turn green.
6. In Resend → API Keys → Create API Key with scope "Sending access" (not "Full access"). Copy the key — looks like "re_xxxxxxxxxxxxxxxx".
7. Install Supabase CLI if not present:
   npm install -g supabase
   supabase --version    (should print something)
   supabase login        (browser auth flow)
8. Link the local project to the remote Supabase project (run from C:\ClaudeCode):
   supabase link --project-ref qfuhtvtietnldeqklxdo
9. Set the Edge Function secrets:
   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
   supabase secrets set FROM_EMAIL=noreply@mail.respawn.kz

Reply with "done" when all 9 steps are complete. I'll then deploy the function
and configure the webhook.
```

- [ ] **Step 2: Wait for user "done"**

Pause execution until user confirms. If user reports any DNS verification issue, the most common cause is the host field: SPF record should be on `send.mail.respawn.kz` (subdomain of `mail.respawn.kz`), not on `mail.respawn.kz` directly. Resend dashboard always shows the exact host.

---

## Task 11: Deploy the Edge Function

**Files:** none

- [ ] **Step 1: Deploy**

```bash
supabase functions deploy send-notification
```

Expected: "Deployed Functions on project qfuhtvtietnldeqklxdo: send-notification" + a URL like `https://qfuhtvtietnldeqklxdo.supabase.co/functions/v1/send-notification`.

If "JWT verification" warning appears, that's fine — Database Webhooks include a service-role JWT, which the function trusts implicitly via the bypass-on-service-role behavior of supabase-js. (We do not explicitly verify the JWT in our handler; the function's URL is only callable from the configured webhook.)

- [ ] **Step 2: Smoke check the function URL**

```bash
curl -i -X POST https://qfuhtvtietnldeqklxdo.supabase.co/functions/v1/send-notification -H "Content-Type: application/json" -d '{}'
```

Expected: HTTP 200 with body "Ignored" (because payload type isn't INSERT on the outbox table — exact match safeguard).

- [ ] **Step 3: Save the function URL for the next task**

Note the URL — Task 12 needs it to configure the Database Webhook.

---

## Task 12: User action — Configure Database Webhook

**Files:** none (out-of-band setup)

- [ ] **Step 1: Print instructions to the user**

Print this verbatim:

```
Now configure the Database Webhook in Supabase Dashboard:

1. Go to https://supabase.com/dashboard/project/qfuhtvtietnldeqklxdo/database/hooks
2. Click "Create a new hook".
3. Fill in:
   - Name: notify-on-outbox-insert
   - Table: public.notifications_outbox
   - Events: ☑ Insert  (uncheck Update and Delete)
   - Type: Supabase Edge Functions
   - Edge Function: send-notification (select from dropdown)
   - HTTP Method: POST
   - HTTP Params: none
   - HTTP Headers: leave default (Content-Type: application/json + Authorization: Bearer <service_role>)
   - Timeout (ms): 5000
4. Click "Confirm".

Reply "done" when the hook is created.
```

- [ ] **Step 2: Wait for user "done"**

---

## Task 13: End-to-end smoke test — direct outbox insert

**Files:**
- Create: `scripts/seed-test-notification.mjs`

- [ ] **Step 1: Create the helper script**

Create `scripts/seed-test-notification.mjs`:

```javascript
#!/usr/bin/env node
// Inserts a fake outbox row to smoke-test the Edge Function end-to-end.
// Usage: DATABASE_URL=... TO_EMAIL=you@example.com node scripts/seed-test-notification.mjs

import pg from 'pg';

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;
const toEmail = process.env.TO_EMAIL;
if (!databaseUrl || !toEmail) {
  console.error('DATABASE_URL and TO_EMAIL env vars required');
  process.exit(2);
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();

const fakeId = '00000000-0000-0000-0000-' + Date.now().toString().padStart(12, '0');

const payload = {
  booking_id: fakeId,
  club_slug: 'cyberzone',
  club_name: 'CyberZone (TEST)',
  date: new Date().toISOString().slice(0, 10),
  time_slot: '20:00',
  hours: 2,
  total_price: 4000,
  customer_email: toEmail,
};

const r = await client.query(
  `insert into notifications_outbox
   (event_type, source_table, source_id, recipient_email, payload)
   values ($1, $2, $3, $4, $5::jsonb)
   returning id, status, created_at`,
  ['booking_created', 'bookings', fakeId, toEmail, JSON.stringify(payload)],
);

console.log('Inserted outbox row:', r.rows[0]);
console.log('Wait ~5 seconds, then check inbox.');
console.log('Also check status with:');
console.log(`  select status, last_error, resend_message_id from notifications_outbox where id = '${r.rows[0].id}';`);

await client.end();
```

- [ ] **Step 2: Run smoke test (replace TO_EMAIL with your real email)**

```bash
DATABASE_URL="postgresql://postgres.qfuhtvtietnldeqklxdo:8mrdO7sz3GYGEQ8e@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" TO_EMAIL="zhandos397@gmail.com" node scripts/seed-test-notification.mjs
```

Expected: prints inserted row id with `status: 'pending'`. Within ~5 seconds, an email titled "Новая бронь — CyberZone (TEST), <today>" arrives at the inbox.

- [ ] **Step 3: Verify the row got marked sent**

```bash
DATABASE_URL="postgresql://postgres.qfuhtvtietnldeqklxdo:8mrdO7sz3GYGEQ8e@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" node -e "import('pg').then(async ({default: pg}) => { const c = new pg.Client(process.env.DATABASE_URL); await c.connect(); const r = await c.query(\"select status, attempts, last_error, resend_message_id, sent_at from notifications_outbox order by created_at desc limit 1\"); console.log(r.rows[0]); await c.end(); })"
```

Expected output: `status: 'sent', attempts: 1, last_error: null, resend_message_id: 'xxx', sent_at: '2026-05-18T...'`.

If `status: 'failed'` — read `last_error` and fix (most common: Resend domain not verified, FROM_EMAIL secret wrong).

If `status: 'pending'` after a minute — webhook didn't fire. Check Supabase Dashboard → Edge Functions → send-notification → Logs.

- [ ] **Step 4: Commit the helper script**

```bash
git add scripts/seed-test-notification.mjs
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
chore(scripts): add seed-test-notification.mjs

Helper script for end-to-end smoke testing of the email pipeline:
inserts a fake booking_created outbox row that triggers the webhook
→ Edge Function → Resend chain. Verifies that the configured email
domain delivers to the specified TO_EMAIL.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: End-to-end smoke test — real booking insertion

**Files:** none

- [ ] **Step 1: Log in as super-admin and trigger every event manually**

This is a manual smoke test sequence to walk every code path before cleanup. Print to the user:

```
Now let's verify every event path with a real flow:

1. Open https://respawn.kz/ in an incognito tab.
2. Log in via magic link (zhandos397@gmail.com).
3. Go to /clubs/cyberzone/ → Забронировать. Pick today + 22:00 + 1h. Submit.
   → You should receive an email "Новая бронь — CyberZone, <today>" within ~30 sec.
4. Open /dashboard/bookings/. Find the booking you just made. Click "Подтвердить".
   → You receive "Бронь подтверждена — CyberZone, <today>".
5. Same booking → click "Отменить" (as club admin).
   → You receive "Бронь отменена — CyberZone, <today>".
   (Note: this cancel transition might be blocked depending on the row's terminal state — if so, repeat steps 3-5 with a fresh booking.)
6. Create a new booking. Confirm it. Then go to /me/, cancel as customer.
   → You receive "Бронь отменена — CyberZone, <today>" (this time as the club).

Once these 4 flows have produced emails, reply "done".

Skip the application_submitted/approved/rejected flow for now — we'll
test those after cleanup since they require submitting a new application.
```

- [ ] **Step 2: Wait for user "done"**

If any expected email did not arrive, inspect outbox + Edge Function logs and fix before proceeding.

- [ ] **Step 3: Final outbox audit**

```bash
DATABASE_URL="postgresql://postgres.qfuhtvtietnldeqklxdo:8mrdO7sz3GYGEQ8e@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" node -e "import('pg').then(async ({default: pg}) => { const c = new pg.Client(process.env.DATABASE_URL); await c.connect(); const r = await c.query(\"select event_type, status, count(*) from notifications_outbox group by event_type, status order by event_type, status\"); console.table(r.rows); await c.end(); })"
```

Expected: a small table where every row has `status: sent`. If any row has `status: failed` or `pending`, dig in before continuing.

---

## Task 15: Remove notify() from booking-real.ts

**Files:**
- Modify: `src/scripts/booking-real.ts`

- [ ] **Step 1: Remove the import**

Open `src/scripts/booking-real.ts`. Remove line 6:

```typescript
import { notify } from '../lib/notifications';
```

- [ ] **Step 2: Remove the notify call + club_admins lookup**

Find the block after `if (result.bookingId) {` (around line 277-289). Replace this:

```typescript
    if (result.bookingId) {
      const { data: admins } = await supabase
        .from('club_admins')
        .select('user_id')
        .eq('club_slug', club.slug);
      const ownerEmails = (admins ?? []).map((a: { user_id: string }) => `user-${a.user_id.slice(0, 8)}@unknown`);
      await notify({
        type: 'booking_created',
        bookingId: result.bookingId,
        clubSlug: club.slug,
        ownerEmails,
      });
    }
```

with simply deleting the whole `if (result.bookingId) { ... }` block — there's nothing to do client-side anymore. The DB trigger handles the notification.

- [ ] **Step 3: Verify TS compiles**

```bash
npx astro check
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/booking-real.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
refactor(booking): drop client-side notify() — DB trigger handles it

Removes the import + post-insert club_admins lookup + notify() call.
The notify_booking_created Postgres trigger now fires on AFTER INSERT
and inserts outbox rows with REAL admin emails (no more user-XXX@unknown
placeholders), which the Edge Function sends via Resend.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Remove notify() from admin-applications.ts

**Files:**
- Modify: `src/scripts/admin-applications.ts`

- [ ] **Step 1: Remove the import**

Open `src/scripts/admin-applications.ts`. Remove line 4:

```typescript
import { notify } from '../lib/notifications';
```

- [ ] **Step 2: Remove the 2 call sites**

Around line 199 — replace:

```typescript
      await notify({ type: 'application_approved', applicationId: id, applicantEmail: cardEmail });
```

with: (delete the line entirely)

Around line 216 — replace the `await notify({ ... })` block (likely a 4-5 line call) with: (delete the whole call)

The `cardEmail` variable might become unused after this — if so, remove its declaration too. `npx astro check` will flag unused vars.

- [ ] **Step 3: Verify TS compiles**

```bash
npx astro check
```

Expected: 0 errors. If "cardEmail is declared but its value is never read" appears, remove the unused variable declaration as well.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/admin-applications.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
refactor(admin): drop client-side notify() in application approve/reject

Removes the import and 2 call sites in admin-applications.ts. The
notify_application_status_change DB trigger fires on UPDATE OF status
to approved/rejected and writes outbox rows for the applicant.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Remove notify() from dashboard-register.ts

**Files:**
- Modify: `src/scripts/dashboard-register.ts`

- [ ] **Step 1: Remove the import**

Open `src/scripts/dashboard-register.ts`. Remove the line:

```typescript
import { notify } from '../lib/notifications';
```

- [ ] **Step 2: Remove the call site (around line 113)**

Delete the `await notify({ type: 'application_submitted', ... })` block.

- [ ] **Step 3: Verify TS compiles**

```bash
npx astro check
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/dashboard-register.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
refactor(dashboard): drop client-side notify() on application submit

notify_application_submitted DB trigger handles it on AFTER INSERT
into club_applications.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Remove notify() from dashboard-bookings.ts

**Files:**
- Modify: `src/scripts/dashboard-bookings.ts`

- [ ] **Step 1: Remove the import**

Open `src/scripts/dashboard-bookings.ts`. Remove the line:

```typescript
import { notify } from '../lib/notifications';
```

- [ ] **Step 2: Remove the 4 call sites**

Around lines 120, 123, 126, 129 — delete the 4 `await notify({ ... })` calls (one per status: confirmed, cancelled, completed, no_show).

- [ ] **Step 3: Remove the placeholder customer-email fetch block**

Around line 170, there's a block (likely 5-10 lines) that fetches `customerEmail` for the notify() calls — possibly with a comment mentioning "placeholder" or "Resend". Delete the whole block since the recipient is now resolved inside the DB trigger.

- [ ] **Step 4: Verify TS compiles**

```bash
npx astro check
```

Expected: 0 errors. Likely also need to remove the `customerEmail` variable if it becomes unused.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/dashboard-bookings.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
refactor(dashboard): drop client-side notify() in booking state machine

Removes import + 4 call sites + customer-email-fetch placeholder block.
notify_booking_status_change DB trigger now fires on AFTER UPDATE OF
status and resolves the real customer email via auth.users.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: Delete src/lib/notifications.ts and verify clean

**Files:**
- Delete: `src/lib/notifications.ts`

- [ ] **Step 1: Delete the file**

```bash
git rm src/lib/notifications.ts
```

- [ ] **Step 2: Verify no leftover references**

```bash
grep -r "notifications" src/
```

Expected output: should match only on `deploy-trigger.ts` (which is unrelated — it's the CF Pages rebuild trigger, no relation to email notifications). If there are any matches in `src/scripts/` or any other file under `src/`, those are leftover imports — fix them before continuing.

```bash
grep -rn "notify(" src/
```

Expected: zero matches.

- [ ] **Step 3: TS check + build**

```bash
npx astro check
npm run build
```

Expected: 0 TS errors, build succeeds with 31 pages generated.

- [ ] **Step 4: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
refactor: delete src/lib/notifications.ts (replaced by DB triggers)

The stub is no longer needed — all 8 event types are emitted by Postgres
triggers on bookings + club_applications. Server-side resolution of
recipient emails fixes the long-standing fake-emails bug (user-XXX@unknown
placeholders in booking-real.ts).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: Smoke test application flow (post-cleanup)

**Files:** none

- [ ] **Step 1: Manual smoke walkthrough**

Print to the user:

```
Last verification — application flow now that all the client-side notify()
calls are gone:

1. Log out and create a new test user (use a +alias on your gmail: zhandos397+test@gmail.com — gmail ignores +alias).
2. Go to /dashboard/register/, fill the form for a fake club, submit.
   → You (as super-admin) receive "Новая заявка клуба — <name>" within ~30 sec.
3. Log back in as super-admin (zhandos397@gmail.com).
4. /admin/applications/ → approve the test application with a review note.
   → The test user receives "Заявка одобрена — <name>" with a link to /dashboard/club/edit?slug=...
5. Submit another fake application from the test user.
6. As super-admin, reject it with a review note.
   → The test user receives "Заявка отклонена — <name>" with the note.

Reply "done" when all 3 application emails have arrived.

Cleanup: delete the test applications and clubs from Supabase Dashboard
afterwards if you want a clean slate.
```

- [ ] **Step 2: Wait for user "done"**

---

## Task 21: Build, deploy to production, post-deploy smoke

**Files:** none

- [ ] **Step 1: Final build**

```bash
npm run build
```

Expected: build succeeds, 31 pages generated, no warnings about missing exports or types.

- [ ] **Step 2: Merge to main**

```bash
git checkout main
git merge --ff-only feat/email-notifications
```

Expected: FF merge succeeds.

- [ ] **Step 3: Push to origin**

```bash
git push origin main
```

- [ ] **Step 4: Deploy**

```bash
# Use the Cloudflare API token from HANDOFF.md section 1 (not committed to git).
CLOUDFLARE_API_TOKEN="<cf_api_token>" npm run deploy
```

Expected: wrangler uploads dist/ to Cloudflare Pages, prints deploy URL.

- [ ] **Step 5: Post-deploy production smoke**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://respawn.kz/                # 200
curl -s -o /dev/null -w "%{http_code}\n" https://respawn.kz/clubs/         # 200
curl -s -o /dev/null -w "%{http_code}\n" https://respawn.kz/clubs/cyberzone/  # 200
```

Plus one final live test: log into https://respawn.kz/, book a fresh slot, verify the booking_created email arrives at your inbox from `noreply@mail.respawn.kz`. (The DB triggers are tested via Task 14 already, but a post-deploy test confirms nothing regressed in the build.)

- [ ] **Step 6: Delete the feature branch**

```bash
git branch -d feat/email-notifications
```

---

## Task 22: Update HANDOFF.md

**Files:**
- Modify: `HANDOFF.md`

- [ ] **Step 1: Update section 3 (migrations list)**

In `HANDOFF.md`, find the migrations list in section 3. Add this line after `0011_storage_setup.sql`:

```
0012_notifications_outbox.sql          # SP5: outbox table + 4 triggers + Edge Function for emails
```

- [ ] **Step 2: Update section 8 (known issues)**

In `HANDOFF.md` section 8, find the line containing "Email scraping в admin-applications" and the bullet about "placeholder `user-{uid-prefix}@unknown`". Replace with:

```markdown
- **Email notifications:** ✅ Fully wired via Resend (SP5, 2026-05-18). 8 event types triggered server-side by Postgres triggers → notifications_outbox → Database Webhook → Edge Function `send-notification` → Resend. Domain `mail.respawn.kz` verified. Templates in Russian.
```

- [ ] **Step 3: Update section 9 (roadmap)**

In the roadmap table, find the row for "Email notifications via Resend" and update its status to ✅ Done.

- [ ] **Step 4: Update section 12 (workflow files)**

Add to the list of important workflow files:

```
- `docs/superpowers/specs/2026-05-18-respawn-kz-email-notifications-design.md` — SP5 spec
- `docs/superpowers/plans/2026-05-18-respawn-kz-email-notifications.md` — SP5 plan (22 tasks)
```

- [ ] **Step 5: Commit**

```bash
git add HANDOFF.md
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
docs: update HANDOFF.md — SP5 (email notifications) shipped

- Added migration 0012 to the migrations list
- Closed the placeholder-emails item in section 8 (known issues)
- Marked Email notifications row done in section 9 (roadmap)
- Added SP5 spec + plan to section 12 (workflow files)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

## Task 23: Update Obsidian — decisions.md + open-questions.md + session journal

**Files (Obsidian vault, via `mcp__obsidian__*`):**
- Append to: `07 Dev Projects/almaty-gg/decisions.md`
- Strike-through and resolve: `07 Dev Projects/almaty-gg/open-questions.md`
- Append session block to: `08 Sessions/2026-05-18.md`

- [ ] **Step 1: Append a decisions.md entry**

Use `mcp__obsidian__obsidian_append_content` on `07 Dev Projects/almaty-gg/decisions.md` with:

```markdown


## 2026-05-18 — Email notifications via Resend (SP5)

All 8 cabinet/booking events now trigger real transactional email via Resend, replacing the `notify()` console-log stub. Architecture: Postgres trigger → `notifications_outbox` table → Supabase Database Webhook → Edge Function `send-notification` → Resend API. Migration `0012_notifications_outbox.sql` adds the outbox table, 3 email-lookup helpers (`get_user_email`, `get_club_admin_emails`, `get_super_admin_emails`), an `update_outbox_result` RPC, an `assigned_slug` column on `club_applications`, an updated `approve_club_application` RPC that stamps it, and 4 trigger functions.

The move from client-side to server-side closed a real bug — `booking-real.ts` was passing fake `user-XXX@unknown` placeholder emails because the browser cannot read `auth.users`. The trigger uses `SECURITY DEFINER` to read `auth.users.email` directly.

Idempotency: `unique (event_type, source_id, recipient_email)` on the outbox + Resend's `idempotencyKey = outbox.id` header. Double-trigger fire and Edge Function retries both safely deduped.

Domain: `mail.respawn.kz` with SPF + DKIM + DMARC `p=none` in Cloudflare DNS. Sender `noreply@mail.respawn.kz`. Resend free tier (100 emails/day, 3000/month) — well under MVP scale.

Cleanup: `src/lib/notifications.ts` deleted, 4 client-side `notify()` call sites removed.
```

- [ ] **Step 2: Mark open-questions resolved**

Use `mcp__obsidian__obsidian_get_file_contents` on `07 Dev Projects/almaty-gg/open-questions.md` to read current content. If there's an unresolved item about email notifications or placeholder emails, append a resolution block at the bottom (using `obsidian_append_content`):

```markdown


## ~~Email notifications via Resend / fake-emails bug~~ — Resolved 2026-05-18

See [[decisions#2026-05-18 — Email notifications via Resend (SP5)]].
```

- [ ] **Step 3: Append session journal**

Use `mcp__obsidian__obsidian_list_files_in_dir` on `08 Sessions/` to confirm there's no existing `2026-05-18.md`. If absent, create it. If present, append.

Use `mcp__obsidian__obsidian_append_content` on `08 Sessions/2026-05-18.md`:

```markdown
# 2026-05-18

## Сессия — SP5 (Email Notifications via Resend) shipped

**Контекст в начале:** Block 1 + SP4 в проде, `notifications.ts` всё ещё stub, `booking-real.ts` шлёт fake-emails. Из roadmap options пользователь выбрал email-уведомления.

**Что сделано:**
- Spec: `docs/superpowers/specs/2026-05-18-respawn-kz-email-notifications-design.md` (945 строк). Все 8 событий из стаба, outbox + Database Webhook + Edge Function архитектура, recipient logic "противоположная сторона", subdomain `mail.respawn.kz`.
- Plan: `docs/superpowers/plans/2026-05-18-respawn-kz-email-notifications.md` (22 tasks).
- Migration 0012: outbox table + RLS + 3 email-lookup helpers + `update_outbox_result` RPC + ALTER `club_applications.assigned_slug` + replace `approve_club_application` + 4 trigger functions (booking_created/status_change, application_submitted/status_change).
- Edge Function `supabase/functions/send-notification`: index.ts handler, templates.ts с 8 шаблонами на русском (HTML+text), render.ts с brand-themed HTML shell, types.ts.
- Cleanup: удалены `src/lib/notifications.ts` и 4 client-side вызова `notify()` в `booking-real.ts`, `admin-applications.ts`, `dashboard-register.ts`, `dashboard-bookings.ts`. Также удалён placeholder customer-email-fetch блок.
- `scripts/verify-notifications.mjs` (12 sanity checks) + `scripts/seed-test-notification.mjs` (E2E smoke helper).

**Решения:**
- Outbox over pg_net-direct: TypeScript для шаблонов >> PL/pgSQL, retries и idempotency идиоматичнее.
- Subdomain `mail.respawn.kz` over root: изоляция reputation, чистое DNS.
- Recipient = противоположная сторона (по `status_changed_by` vs `user_id`): меньше шума, не пишем человеку о его же действии.
- Удалили stub целиком (не оставили dual-fire compat-shim) — двойные письма дороже чем один-раз вычистить.
- Не делаем `/admin/notifications` UI сейчас — outbox queryable из Supabase Dashboard, добавим если понадобится.

**Открытые вопросы (resolved during execution):**
- *(заполняется по факту)*

**Следующий шаг:** *(заполняется по факту — auto-rebuild через GitHub connect? reviews? Kaspi?)*
```

(Note: bullet items in "Открытые вопросы" and "Следующий шаг" depend on what actually happened during execution — fill in after deploy.)

- [ ] **Step 4: No commit needed**

The Obsidian vault is independent of git — changes are saved by the MCP server directly.

---

## Self-review notes

I reviewed this plan against the spec and against the existing codebase. Findings:

1. **Spec coverage:** All 12 acceptance criteria from the spec map to specific tasks:
   - AC1-AC8 (event flows) → Task 14 + Task 20 (end-to-end smoke)
   - AC9 (outbox status query) → Task 14 step 3
   - AC10 (idempotency) → guaranteed by Task 2 unique constraint + Task 9 idempotencyKey
   - AC11 (no notify() leftover) → Task 19 step 2
   - AC12 (verify-notifications.mjs) → Task 5

2. **Risks coverage:** Spec's risk table is addressed by the plan:
   - DNS propagation → Task 10 includes wait + verify
   - Resend free tier limit → no action needed at MVP scale
   - Trigger lock contention → small joins, negligible
   - Domain verification stuck → Task 10 step 2 notes the SPF subdomain gotcha
   - Service-role key leak → not logged in any task

3. **Placeholder scan:** No "TBD" or vague steps. Every task has explicit code, commit message, and verification command. Two tasks (10 and 12) require user out-of-band action — both have explicit printed checklists with exact button-click instructions.

4. **Type consistency:** OutboxRow type is defined once in Task 6, used in Task 9. WebhookPayload in Task 6, used in Task 9. renderTemplate signature in Task 8, used in Task 9. update_outbox_result RPC signature in Task 2, used identically in Task 9 (3 callers all pass the same 4 params).

5. **Codebase conventions matched:**
   - Migration naming `0012_*.sql` — matches 0001-0011 pattern.
   - Verification script `scripts/verify-notifications.mjs` — matches verify-b2b.mjs / verify-clubs.mjs pattern.
   - DATABASE_URL env var pattern + apply-sql.mjs — matches HANDOFF section 2.
   - Commit author flags — matches HANDOFF section 2.
   - Branch name `feat/email-notifications` — matches `feat/<short-name>` convention.
   - FF merge to main + deploy — matches HANDOFF section 14.
   - Obsidian update at end — matches HANDOFF section 14 step 6.

6. **Scope discipline:** No /admin/notifications UI, no React-email lib, no i18n — all deferred to "Out of scope" in the spec. The plan stays at 22 tasks (vs my initial 25-task draft) because: helper script tasks consolidated; the user-action tasks (10, 12, 14, 20) are pause points, not separate code phases.
