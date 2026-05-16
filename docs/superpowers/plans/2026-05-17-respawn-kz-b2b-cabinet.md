# respawn.kz B2B Cabinet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать B2B-кабинет для владельцев клубов на respawn.kz: подача заявок на регистрацию клуба, очередь ревью для super-admin'а, привязка владельцев к существующим 12 клубам, управление входящими бронями с расширенным lifecycle.

**Architecture:** 5 новых Supabase миграций (super_admins, club_admins, club_applications, bookings status расширение, bookings transition trigger). 4 эффективные роли (Anonymous/User/ClubAdmin/SuperAdmin), определяемые наличием строк в таблицах. 8 новых Astro-страниц (/dashboard/* и /admin/*) с client-side гейтингом + RLS как основной защитой.

**Tech Stack:** Astro 4.16 SSG, TypeScript strict, Supabase (Postgres + Auth + RLS), vanilla CSS (BEM-like в global.css), wrangler для деплоя на Cloudflare Pages.

**Reference spec:** `docs/superpowers/specs/2026-05-16-respawn-kz-b2b-cabinet-design.md`

**Important context for the implementer:**
- Проект **не имеет тестового фреймворка** (нет vitest/playwright). Верификация — через ручные шаги в Supabase Dashboard и браузере. Каждая task имеет explicit "What should happen" сценарии.
- Каждая страница использует паттерн: HTML с `id="some-root"` → script проверяет наличие этого id в `init.ts` → вызывает `setupXxx()`. См. `src/scripts/me-page.ts` как канонический пример.
- Демо-режим (когда нет PUBLIC_SUPABASE_URL) **не поддерживается** для новых функций — кабинет работает только с реальным Supabase. Это допустимо: демо-режим только для офлайн-разработки бронирований.
- Миграции применяются вручную через Supabase SQL editor: содержимое .sql файла копируется и выполняется. Локального supabase CLI в проекте нет.

---

## File Structure

### Создаваемые файлы (24)

**Migrations (5):**
- `supabase/migrations/0002_super_admins.sql`
- `supabase/migrations/0003_club_admins.sql`
- `supabase/migrations/0004_club_applications.sql`
- `supabase/migrations/0005_bookings_status_expand.sql`
- `supabase/migrations/0006_bookings_status_trigger.sql`

**Library (3):**
- `src/lib/roles.ts` — getRoles() helper + sessionStorage cache
- `src/lib/notifications.ts` — notify() stub для будущего Resend
- `src/lib/route-guards.ts` — клиентский гейтинг (requireClubAdmin, requireSuperAdmin)

**Pages (8):**
- `src/pages/dashboard/index.astro`
- `src/pages/dashboard/register.astro`
- `src/pages/dashboard/bookings.astro`
- `src/pages/dashboard/applications.astro`
- `src/pages/admin/index.astro`
- `src/pages/admin/applications.astro`
- `src/pages/admin/owners.astro`
- `src/pages/admin/users.astro`

**Scripts (7):**
- `src/scripts/dashboard.ts`
- `src/scripts/dashboard-register.ts`
- `src/scripts/dashboard-bookings.ts`
- `src/scripts/dashboard-applications.ts`
- `src/scripts/admin-applications.ts`
- `src/scripts/admin-owners.ts`
- `src/scripts/admin-users.ts`

**Components (1):**
- `src/components/DashboardNav.astro` — навигация для /dashboard/ и /admin/

### Изменяемые файлы (4)

- `src/data/supabase-types.ts` — расширить статусы Booking, добавить ClubApplication/ClubAdmin/SuperAdmin types
- `src/components/Header.astro` — показывать "Кабинет" / "Админка" по ролям
- `src/scripts/init.ts` — wire up новые setup-функции
- `src/scripts/auth.ts` — invalidate roles cache на signOut
- `src/styles/global.css` — добавить стили `.dashboard-*` и `.admin-*` (BEM-стиль как существующие)

---

## Task 1: Migration 0002 — super_admins table

**Files:**
- Create: `supabase/migrations/0002_super_admins.sql`

**Goal:** Создать таблицу `super_admins` с RLS-политикой "super-admin читает super-admins" (chicken-and-egg solved через seed с service_role).

- [ ] **Step 1: Create migration file**

Создай файл `supabase/migrations/0002_super_admins.sql`:

```sql
-- Migration 0002: super_admins table
-- Source of truth for super-admin role. Seeded once via service_role through Supabase Dashboard.

create table public.super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz default now(),
  added_by uuid references auth.users(id)
);

alter table public.super_admins enable row level security;

-- Only existing super-admins can read this table.
-- First row must be inserted via service_role (Supabase Dashboard SQL editor as postgres user).
create policy "super_admins read by super_admins" on public.super_admins
  for select using (auth.uid() in (select user_id from public.super_admins));

-- Super-admins can grant/revoke super-admin role
create policy "super_admins manage super_admins" on public.super_admins
  for all using (auth.uid() in (select user_id from public.super_admins));
```

- [ ] **Step 2: Apply migration in Supabase Dashboard**

1. Открой https://app.supabase.com/project/qfuhtvtietnldeqklxdo/sql/new
2. Скопируй содержимое `supabase/migrations/0002_super_admins.sql` в редактор
3. Нажми "Run"
4. Должно показать "Success. No rows returned"

- [ ] **Step 3: Seed first super-admin**

Сначала узнай свой auth UID:

```sql
select id, email from auth.users where email = 'zhandos397@gmail.com';
```

Затем (подставив свой UID):

```sql
insert into super_admins (user_id) 
values ('<твой-uid-сюда>');
```

Должно вернуть `INSERT 0 1`.

- [ ] **Step 4: Verify**

В Supabase SQL editor:

```sql
select sa.user_id, u.email, sa.added_at
from super_admins sa
join auth.users u on u.id = sa.user_id;
```

Должно вернуть одну строку с твоим email.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_super_admins.sql
git commit -m "feat(db): add super_admins table with RLS

Foundation for B2B cabinet. First super-admin seeded manually via
Supabase Dashboard with service_role to bypass chicken-and-egg
of self-referential RLS policy."
```

---

## Task 2: Migration 0003 — club_admins table

**Files:**
- Create: `supabase/migrations/0003_club_admins.sql`

**Goal:** Таблица маппинга `(user_id, club_slug)` — кто владеет каким клубом. Multi-club: один user может быть admin'ом нескольких клубов.

- [ ] **Step 1: Create migration file**

Создай файл `supabase/migrations/0003_club_admins.sql`:

```sql
-- Migration 0003: club_admins table
-- Maps users to clubs they manage. One user can administrate multiple clubs.

create table public.club_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  club_slug text not null,
  created_at timestamptz default now(),
  granted_by uuid references auth.users(id),
  unique (user_id, club_slug)
);

create index club_admins_user_id_idx on public.club_admins (user_id);
create index club_admins_slug_idx on public.club_admins (club_slug);

alter table public.club_admins enable row level security;

-- Club admin reads only own rows; super-admin reads all
create policy "club_admins read own" on public.club_admins
  for select using (
    auth.uid() = user_id 
    or auth.uid() in (select user_id from public.super_admins)
  );

-- Only super-admin can insert/update/delete (grants/revokes ownership)
create policy "super_admin manages club_admins" on public.club_admins
  for all using (auth.uid() in (select user_id from public.super_admins));
```

- [ ] **Step 2: Apply migration in Supabase Dashboard**

Скопируй содержимое в SQL editor, выполни. Ожидаемый результат: "Success. No rows returned".

- [ ] **Step 3: Verify table exists with RLS**

```sql
select tablename, rowsecurity 
from pg_tables 
where schemaname = 'public' and tablename = 'club_admins';
```

Должно вернуть строку с `rowsecurity = true`.

- [ ] **Step 4: Verify policies**

```sql
select policyname, cmd from pg_policies 
where schemaname = 'public' and tablename = 'club_admins';
```

Должно вернуть 2 политики: "club_admins read own" (SELECT) и "super_admin manages club_admins" (ALL).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_club_admins.sql
git commit -m "feat(db): add club_admins table with multi-club support

Maps users to clubs they manage. Unique constraint on (user_id,
club_slug) prevents duplicate grants. Only super-admins can modify."
```

---

## Task 3: Migration 0004 — club_applications table

**Files:**
- Create: `supabase/migrations/0004_club_applications.sql`

**Goal:** Таблица заявок на регистрацию клуба. Любой залогиненный user вставляет свою заявку; super-admin ревьюет.

- [ ] **Step 1: Create migration file**

Создай файл `supabase/migrations/0004_club_applications.sql`:

```sql
-- Migration 0004: club_applications table
-- Incoming registration requests from prospective club owners.

create table public.club_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid references auth.users(id) on delete set null,
  applicant_name text not null,
  applicant_email text not null,
  applicant_phone text,
  club_name text not null,
  city text not null,
  district text,
  address text not null,
  working_hours text,
  equipment_note text,
  photo_url text,
  description text,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz default now()
);

create index club_applications_status_idx on public.club_applications (status, created_at desc);
create index club_applications_user_idx on public.club_applications (applicant_user_id);

alter table public.club_applications enable row level security;

-- Any logged-in user can insert their own application
create policy "anyone inserts own application" on public.club_applications
  for insert with check (auth.uid() = applicant_user_id);

-- Applicant reads own; super-admin reads all
create policy "applicant reads own" on public.club_applications
  for select using (
    auth.uid() = applicant_user_id
    or auth.uid() in (select user_id from public.super_admins)
  );

-- Only super-admin updates (approve/reject + review_note)
create policy "super_admin updates applications" on public.club_applications
  for update using (auth.uid() in (select user_id from public.super_admins));
```

- [ ] **Step 2: Apply migration**

Скопируй в Supabase SQL editor, выполни.

- [ ] **Step 3: Verify with test insert**

В SQL editor (под своим залогиненным юзером — невозможно из dashboard, проверим в Task 8 через UI). Просто проверь что таблица создана:

```sql
select column_name, data_type 
from information_schema.columns 
where table_schema = 'public' and table_name = 'club_applications'
order by ordinal_position;
```

Должно вернуть 17 колонок.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_club_applications.sql
git commit -m "feat(db): add club_applications table with status workflow

Captures registration requests. RLS: applicant inserts/reads own,
super-admin reads all and transitions status (pending→approved/rejected
with review_note)."
```

---

## Task 4: Migration 0005 — bookings status expand

**Files:**
- Create: `supabase/migrations/0005_bookings_status_expand.sql`

**Goal:** Расширить enum статусов в `bookings` с 3 (pending/confirmed/cancelled) до 5 (+ completed/no_show), добавить audit-поля, дать club_admin'ам и super-admin'ам доступ к бронированиям своих клубов.

- [ ] **Step 1: Create migration file**

Создай файл `supabase/migrations/0005_bookings_status_expand.sql`:

```sql
-- Migration 0005: extend bookings status enum and add audit fields
-- Adds 'completed' and 'no_show' statuses. Adds club_admin and super_admin RLS policies.

-- Replace status CHECK constraint with extended enum
alter table public.bookings drop constraint bookings_status_check;
alter table public.bookings add constraint bookings_status_check 
  check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show'));

-- Audit columns: who and when last changed the status
alter table public.bookings add column status_changed_at timestamptz default now();
alter table public.bookings add column status_changed_by uuid references auth.users(id);

-- Club admin reads/updates bookings of their club
create policy "club_admins read club bookings" on public.bookings
  for select using (
    exists (
      select 1 from public.club_admins 
      where user_id = auth.uid() and club_slug = bookings.club_slug
    )
  );

create policy "club_admins update club bookings" on public.bookings
  for update using (
    exists (
      select 1 from public.club_admins 
      where user_id = auth.uid() and club_slug = bookings.club_slug
    )
  );

-- Super-admin full access to bookings
create policy "super_admins read all bookings" on public.bookings
  for select using (auth.uid() in (select user_id from public.super_admins));

create policy "super_admins update all bookings" on public.bookings
  for update using (auth.uid() in (select user_id from public.super_admins));
```

- [ ] **Step 2: Apply migration**

Скопируй в Supabase SQL editor, выполни.

- [ ] **Step 3: Verify CHECK constraint**

```sql
select consrc, conname 
from pg_constraint 
where conrelid = 'public.bookings'::regclass 
  and contype = 'c';
```

Должна быть строка с `'pending', 'confirmed', 'completed', 'cancelled', 'no_show'` (или похожим — версия Postgres может выводить по-разному).

- [ ] **Step 4: Verify new columns**

```sql
select column_name, data_type 
from information_schema.columns 
where table_schema = 'public' 
  and table_name = 'bookings'
  and column_name in ('status_changed_at', 'status_changed_by');
```

Должно вернуть 2 строки.

- [ ] **Step 5: Verify policies count**

```sql
select count(*) from pg_policies 
where schemaname = 'public' and tablename = 'bookings';
```

Должно быть 7 политик: 3 старых из 0001 (users read/insert/update own) + 4 новых (club_admins read/update + super_admins read/update).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0005_bookings_status_expand.sql
git commit -m "feat(db): expand bookings status enum + add club/super-admin RLS

Adds 'completed' and 'no_show' to status enum. Adds audit columns
status_changed_at/by. New RLS policies let club_admins read+update
bookings of their clubs and super-admins access all bookings."
```

---

## Task 5: Migration 0006 — bookings status transition trigger

**Files:**
- Create: `supabase/migrations/0006_bookings_status_trigger.sql`

**Goal:** Postgres trigger, который enforce'ит правила перехода статусов: terminal-статусы immutable, customer может только cancel свою бронь до даты, audit-поля автоматически проставляются.

- [ ] **Step 1: Create migration file**

Создай файл `supabase/migrations/0006_bookings_status_trigger.sql`:

```sql
-- Migration 0006: enforce booking status transition rules via trigger
-- Defense-in-depth: UI also checks, but trigger is the source of truth.

create or replace function check_booking_status_transition()
returns trigger as $$
begin
  -- Terminal statuses are immutable
  if OLD.status in ('cancelled', 'completed', 'no_show') 
     and NEW.status != OLD.status then
    raise exception 'Cannot change booking from terminal status %', OLD.status;
  end if;

  -- Customer (not club_admin/super_admin) can only transition to 'cancelled'
  if auth.uid() = OLD.user_id 
     and NEW.status != OLD.status 
     and NEW.status != 'cancelled' then
    if not exists (
      select 1 from public.club_admins 
      where user_id = auth.uid() and club_slug = OLD.club_slug
    ) and not exists (
      select 1 from public.super_admins where user_id = auth.uid()
    ) then
      raise exception 'Customers can only cancel own bookings';
    end if;
  end if;

  -- Customer cannot cancel bookings whose date is already in the past
  if auth.uid() = OLD.user_id 
     and NEW.status = 'cancelled' 
     and OLD.date < current_date then
    if not exists (
      select 1 from public.club_admins 
      where user_id = auth.uid() and club_slug = OLD.club_slug
    ) and not exists (
      select 1 from public.super_admins where user_id = auth.uid()
    ) then
      raise exception 'Cannot cancel bookings from past dates';
    end if;
  end if;

  -- Auto-stamp audit fields on any status change
  NEW.status_changed_at := now();
  NEW.status_changed_by := auth.uid();

  return NEW;
end;
$$ language plpgsql security definer;

create trigger bookings_status_transition_check
  before update of status on public.bookings
  for each row execute function check_booking_status_transition();
```

- [ ] **Step 2: Apply migration**

Скопируй в Supabase SQL editor, выполни.

- [ ] **Step 3: Verify trigger exists**

```sql
select trigger_name, event_manipulation, action_timing 
from information_schema.triggers 
where event_object_table = 'bookings';
```

Должно вернуть строку `bookings_status_transition_check` / `UPDATE` / `BEFORE`.

- [ ] **Step 4: Test trigger logic with a manual scenario**

Создай тестовую бронь (заменив `<твой-uid>`):

```sql
insert into bookings (user_id, club_slug, club_name, city_id, date, time_slot, hours, price_per_hour, total_price)
values ('<твой-uid>', 'test-club', 'Test', 'almaty', current_date + 1, '12:00', 2, 1000, 2000)
returning id;
```

Сохрани вернувшийся UUID. Теперь:

```sql
-- Customer пытается перевести в confirmed (должно failed)
update bookings set status = 'confirmed' where id = '<uuid>';
-- ОЖИДАНИЕ: exception "Customers can only cancel own bookings"

-- Customer cancel — должно сработать
update bookings set status = 'cancelled' where id = '<uuid>';
-- ОЖИДАНИЕ: UPDATE 1

-- Попытка перевести из cancelled во что угодно — должно failed
update bookings set status = 'pending' where id = '<uuid>';
-- ОЖИДАНИЕ: exception "Cannot change booking from terminal status cancelled"

-- Удали тестовую бронь
delete from bookings where id = '<uuid>';
```

Все три ожидания должны выполниться. Если нет — почини trigger.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_bookings_status_trigger.sql
git commit -m "feat(db): add booking status transition trigger

Enforces: terminal statuses (cancelled/completed/no_show) are
immutable; customers can only cancel own bookings; cannot cancel
past-dated bookings (admins exempt). Auto-stamps audit fields
on every status change."
```

---

## Task 6: Extend supabase-types.ts

**Files:**
- Modify: `src/data/supabase-types.ts`

**Goal:** Добавить TypeScript типы для новых таблиц + расширить Booking.status enum и STATUS_LABELS.

- [ ] **Step 1: Replace file contents**

Замени всё содержимое `src/data/supabase-types.ts` на:

```ts
// =====================================================================
// Booking
// =====================================================================

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export interface Booking {
  id: string;
  user_id: string;
  club_slug: string;
  club_name: string;
  city_id: string;
  date: string;
  time_slot: string;
  hours: number;
  price_per_hour: number;
  total_price: number;
  status: BookingStatus;
  status_changed_at: string;
  status_changed_by: string | null;
  created_at: string;
}

export type NewBooking = Omit<Booking, 'id' | 'status' | 'status_changed_at' | 'status_changed_by' | 'created_at'>;

export const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Ожидает подтверждения',
  confirmed: 'Подтверждена',
  completed: 'Завершена',
  cancelled: 'Отменена',
  no_show: 'Не пришёл',
};

export const STATUS_COLORS: Record<BookingStatus, string> = {
  pending: 'pill--pending',
  confirmed: 'pill--confirmed',
  completed: 'pill--completed',
  cancelled: 'pill--cancelled',
  no_show: 'pill--no-show',
};

// Terminal statuses cannot be transitioned away from (enforced by DB trigger)
export const TERMINAL_STATUSES: BookingStatus[] = ['cancelled', 'completed', 'no_show'];

export function isTerminalStatus(s: BookingStatus): boolean {
  return TERMINAL_STATUSES.includes(s);
}

// =====================================================================
// Club application
// =====================================================================

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface ClubApplication {
  id: string;
  applicant_user_id: string | null;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string | null;
  club_name: string;
  city: string;
  district: string | null;
  address: string;
  working_hours: string | null;
  equipment_note: string | null;
  photo_url: string | null;
  description: string | null;
  status: ApplicationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

export type NewClubApplication = Omit<
  ClubApplication,
  'id' | 'status' | 'reviewed_by' | 'reviewed_at' | 'review_note' | 'created_at'
>;

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: 'Ожидает рассмотрения',
  approved: 'Одобрена',
  rejected: 'Отклонена',
};

// =====================================================================
// Club admin / Super admin
// =====================================================================

export interface ClubAdmin {
  id: string;
  user_id: string;
  club_slug: string;
  created_at: string;
  granted_by: string | null;
}

export interface SuperAdmin {
  user_id: string;
  added_at: string;
  added_by: string | null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx astro check
```

Ожидание: "0 errors, 0 warnings". Если есть ошибки в существующих файлах из-за нового `status_changed_at` / `status_changed_by` в Booking — это нормально, починим в следующих tasks (особенно в `me-page.ts` который читает `select('*')` и ему всё равно).

- [ ] **Step 3: Commit**

```bash
git add src/data/supabase-types.ts
git commit -m "feat(types): extend Booking status enum + add Application/Admin types

Booking adds 'completed'/'no_show' statuses + audit fields. New types
for ClubApplication, ClubAdmin, SuperAdmin with their status labels
and helper isTerminalStatus()."
```

---

## Task 7: Create roles.ts helper

**Files:**
- Create: `src/lib/roles.ts`

**Goal:** Helper `getRoles()` который возвращает `{ user, isSuperAdmin, clubSlugs }` для текущего юзера. Кеш в `sessionStorage` на 60 секунд для избежания дублирующих запросов.

- [ ] **Step 1: Create file**

Создай `src/lib/roles.ts`:

```ts
import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';

export interface RoleSnapshot {
  user: User | null;
  isSuperAdmin: boolean;
  clubSlugs: string[];
}

const CACHE_KEY = 'respawn.roles';
const CACHE_TTL_MS = 60_000; // 1 minute

interface CacheEntry {
  fetchedAt: number;
  snapshot: RoleSnapshot;
}

function readCache(): RoleSnapshot | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
    return entry.snapshot;
  } catch {
    return null;
  }
}

function writeCache(snapshot: RoleSnapshot): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const entry: CacheEntry = { fetchedAt: Date.now(), snapshot };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {}
}

export function clearRolesCache(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {}
}

export async function getRoles(forceRefresh = false): Promise<RoleSnapshot> {
  if (!forceRefresh) {
    const cached = readCache();
    if (cached) return cached;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const empty: RoleSnapshot = { user: null, isSuperAdmin: false, clubSlugs: [] };
    writeCache(empty);
    return empty;
  }

  const [{ data: superRow }, { data: adminRows }] = await Promise.all([
    supabase.from('super_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('club_admins').select('club_slug').eq('user_id', user.id),
  ]);

  const snapshot: RoleSnapshot = {
    user,
    isSuperAdmin: !!superRow,
    clubSlugs: (adminRows ?? []).map((r: { club_slug: string }) => r.club_slug),
  };
  writeCache(snapshot);
  return snapshot;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx astro check
```

Ожидание: "0 errors".

- [ ] **Step 3: Commit**

```bash
git add src/lib/roles.ts
git commit -m "feat(lib): add getRoles() helper with sessionStorage cache

Returns { user, isSuperAdmin, clubSlugs } based on super_admins and
club_admins table membership. Cached for 60s to avoid duplicate
queries on multi-script pages. clearRolesCache() invalidates."
```

---

## Task 8: Wire roles cache invalidation in auth.ts

**Files:**
- Modify: `src/scripts/auth.ts`

**Goal:** Очищать кеш ролей при signOut и при изменении сессии (signin/signout events).

- [ ] **Step 1: Edit auth.ts**

Открой `src/scripts/auth.ts`. В начале файла добавь импорт:

```ts
import { clearRolesCache } from '../lib/roles';
```

Найди функцию `signOut`:

```ts
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  window.location.href = '/';
}
```

Замени на:

```ts
export async function signOut(): Promise<void> {
  clearRolesCache();
  await supabase.auth.signOut();
  window.location.href = '/';
}
```

Найди в `setupAuthButton()` подписку на `onAuthStateChange`:

```ts
supabase.auth.onAuthStateChange((_event, session) => {
  render(!!session?.user);
});
```

Замени на:

```ts
supabase.auth.onAuthStateChange((_event, session) => {
  clearRolesCache();
  render(!!session?.user);
});
```

- [ ] **Step 2: Verify TS compiles**

```bash
npx astro check
```

Ожидание: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/scripts/auth.ts
git commit -m "feat(auth): clear roles cache on signout and auth state changes

Prevents stale role data after user signs in or out — otherwise the
dashboard might show wrong navigation or fail RLS checks."
```

---

## Task 9: Create notifications.ts stub

**Files:**
- Create: `src/lib/notifications.ts`

**Goal:** Stub-функция notify() для всех уведомлений. Сейчас просто console.log; будущая Resend-интеграция будет внутри без изменения call-sites.

- [ ] **Step 1: Create file**

Создай `src/lib/notifications.ts`:

```ts
/**
 * Notification stub for B2B cabinet events.
 *
 * MVP: just console.log. Hook for future Resend integration —
 * all call sites already pass through here, no refactoring needed
 * to swap in real email sending.
 */

export type NotifyEvent =
  | { type: 'application_submitted'; applicationId: string; applicantEmail: string }
  | { type: 'application_approved'; applicationId: string; applicantEmail: string }
  | { type: 'application_rejected'; applicationId: string; applicantEmail: string; reason: string }
  | { type: 'booking_created'; bookingId: string; clubSlug: string; ownerEmails: string[] }
  | { type: 'booking_confirmed'; bookingId: string; customerEmail: string }
  | { type: 'booking_cancelled'; bookingId: string; recipientEmails: string[] }
  | { type: 'booking_completed'; bookingId: string; customerEmail: string }
  | { type: 'booking_no_show'; bookingId: string; customerEmail: string };

export async function notify(event: NotifyEvent): Promise<void> {
  // MVP: log to console for debugging.
  console.info('[notify]', event.type, event);

  // Future: 
  // if (import.meta.env.RESEND_API_KEY) {
  //   await sendViaResend(event);
  // }
}
```

- [ ] **Step 2: Verify TS compiles**

```bash
npx astro check
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/notifications.ts
git commit -m "feat(lib): add notify() stub for cabinet events

Discriminated union of event types covering application lifecycle
and booking transitions. MVP just console.log — future Resend
integration drops in without touching call sites."
```

---

## Task 10: Create route-guards.ts

**Files:**
- Create: `src/lib/route-guards.ts`

**Goal:** Helper-функции для клиентского гейтинга страниц. Перенаправляют на login/dashboard register если роль не подходит.

- [ ] **Step 1: Create file**

Создай `src/lib/route-guards.ts`:

```ts
import { getRoles, type RoleSnapshot } from './roles';

function redirectToLogin(returnPath?: string): never {
  const target = returnPath ?? window.location.pathname + window.location.search;
  window.location.href = `/login/?return=${encodeURIComponent(target)}`;
  // never returns
  throw new Error('redirecting to /login/');
}

function redirectTo(path: string): never {
  window.location.href = path;
  throw new Error(`redirecting to ${path}`);
}

/**
 * Require any logged-in user. Redirects to /login/ otherwise.
 */
export async function requireLogin(): Promise<RoleSnapshot> {
  const snapshot = await getRoles();
  if (!snapshot.user) redirectToLogin();
  return snapshot;
}

/**
 * Require club_admin or super_admin role. 
 * - No user → /login/
 * - Logged-in but not admin → /dashboard/register/ (suggest applying)
 */
export async function requireClubAdmin(): Promise<RoleSnapshot> {
  const snapshot = await getRoles();
  if (!snapshot.user) redirectToLogin();
  if (snapshot.clubSlugs.length === 0 && !snapshot.isSuperAdmin) {
    redirectTo('/dashboard/register/');
  }
  return snapshot;
}

/**
 * Require super_admin role.
 * - No user → /login/
 * - Not super-admin → / (home)
 */
export async function requireSuperAdmin(): Promise<RoleSnapshot> {
  const snapshot = await getRoles();
  if (!snapshot.user) redirectToLogin();
  if (!snapshot.isSuperAdmin) redirectTo('/');
  return snapshot;
}
```

- [ ] **Step 2: Verify TS compiles**

```bash
npx astro check
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/route-guards.ts
git commit -m "feat(lib): add route guards for cabinet pages

requireLogin / requireClubAdmin / requireSuperAdmin — client-side
gates that redirect users without the right role. RLS remains the
source of truth for data access; these are UX-level redirects."
```

---

## Task 11: Update Header with role-aware navigation

**Files:**
- Modify: `src/components/Header.astro`

**Goal:** Header показывает "Кабинет" club_admin'ам и "Админка" super-admin'ам после загрузки роли. Использует тот же inline-script подход что и `setupAuthButton`.

- [ ] **Step 1: Read current Header.astro structure**

(Уже прочитан в exploration phase). Содержимое:

```astro
<header class="header" id="header">
  <div class="container header__inner">
    <Logo size="md" />
    <nav class="nav" id="nav">
      {navItems.map((item) => (...))}
    </nav>
    <div class="header__actions">
      <div class="header__auth" id="header-auth">
        <a href="/login/" class="btn btn--ghost">Войти</a>
      </div>
      ...
    </div>
  </div>
</header>
```

- [ ] **Step 2: Add role-aware nav slots**

Замени всё содержимое `src/components/Header.astro` на:

```astro
---
import Logo from './Logo.astro';

interface Props {
  activeRoute?: 'index' | 'clubs' | 'for-clubs' | 'about';
}

const { activeRoute } = Astro.props;

const navItems = [
  { href: '/clubs/', label: 'Клубы', key: 'clubs' },
  { href: '/#how', label: 'Как это работает', key: null },
  { href: '/#benefits', label: 'Преимущества', key: null },
  { href: '/for-clubs/', label: 'Для клубов', key: 'for-clubs' },
  { href: '/about/', label: 'О нас', key: 'about' },
];
---

<header class="header" id="header">
  <div class="container header__inner">
    <Logo size="md" />
    <nav class="nav" id="nav">
      {navItems.map((item) => (
        <a
          href={item.href}
          class:list={['nav__link', { 'nav__link--active': activeRoute === item.key }]}
        >
          {item.label}
        </a>
      ))}
      <!-- Role-aware nav slots, populated by setupAuthButton in auth.ts -->
      <a href="/dashboard/" class="nav__link nav__link--cabinet" id="nav-cabinet" hidden>Кабинет</a>
      <a href="/admin/" class="nav__link nav__link--admin" id="nav-admin" hidden>Админка</a>
    </nav>
    <div class="header__actions">
      <div class="header__auth" id="header-auth">
        <a href="/login/" class="btn btn--ghost">Войти</a>
      </div>
      <button class="hamburger" id="hamburger" aria-label="Меню" type="button">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</header>
```

- [ ] **Step 3: Update auth.ts to populate role-aware links**

Открой `src/scripts/auth.ts`. После `import { clearRolesCache } from '../lib/roles';` (добавленного в Task 8) добавь:

```ts
import { getRoles } from '../lib/roles';
```

Замени функцию `render(loggedIn: boolean)` внутри `setupAuthButton()`:

```ts
function render(loggedIn: boolean) {
  if (loggedIn) {
    root!.innerHTML = `
      <a href="/me/" class="btn btn--ghost">Личный кабинет</a>
      <button class="btn btn--ghost" type="button" id="logout-btn">Выйти</button>
    `;
    document.getElementById('logout-btn')?.addEventListener('click', signOut);
    // Populate role-aware nav after auth render
    updateRoleNav();
  } else {
    root!.innerHTML = `<a href="/login/" class="btn btn--ghost">Войти</a>`;
    hideRoleNav();
  }
}
```

В конец файла (после `popReturnUrl`) добавь:

```ts
async function updateRoleNav(): Promise<void> {
  const cabinetLink = document.getElementById('nav-cabinet');
  const adminLink = document.getElementById('nav-admin');
  if (!cabinetLink && !adminLink) return;

  try {
    const { isSuperAdmin, clubSlugs } = await getRoles();
    if (cabinetLink) {
      cabinetLink.hidden = clubSlugs.length === 0 && !isSuperAdmin;
    }
    if (adminLink) {
      adminLink.hidden = !isSuperAdmin;
    }
  } catch (err) {
    console.warn('[auth] failed to load roles for nav', err);
  }
}

function hideRoleNav(): void {
  const cabinetLink = document.getElementById('nav-cabinet');
  const adminLink = document.getElementById('nav-admin');
  if (cabinetLink) cabinetLink.hidden = true;
  if (adminLink) adminLink.hidden = true;
}
```

- [ ] **Step 4: Add basic CSS for role nav slots**

Открой `src/styles/global.css`. Найди селектор `.nav__link` (используй Grep). Сразу после него добавь:

```css
.nav__link--cabinet,
.nav__link--admin {
  position: relative;
  font-weight: 600;
}
.nav__link--cabinet::before {
  content: '◆ ';
  color: var(--c-violet-500);
}
.nav__link--admin::before {
  content: '★ ';
  color: var(--c-pink-500);
}
```

(Если переменных `--c-violet-500` / `--c-pink-500` нет — используй существующие из проекта, типа `var(--accent)` для cabinet и `var(--accent-2)` если есть, иначе hardcoded `#8b5cf6` / `#ec4899`.)

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Ожидание: успешная сборка, нет TS-ошибок.

- [ ] **Step 6: Smoke test in dev**

```bash
npm run dev
```

Открой http://localhost:4321/. Header показывает "Войти" слева от меню. Логинься через /login/ — после auth state change Header должен показать "Личный кабинет" и "Выйти". Линки "Кабинет"/"Админка" пока скрыты (нет club_admins/super_admins строк для твоего account'а кроме того что засеяли в Task 1 — если ты был засеян super-admin'ом, должен увидеть "Админка").

- [ ] **Step 7: Commit**

```bash
git add src/components/Header.astro src/scripts/auth.ts src/styles/global.css
git commit -m "feat(header): role-aware nav links for cabinet and admin

Adds hidden 'Кабинет' and 'Админка' links populated by getRoles()
after auth state changes. Super-admin sees both; club_admins see
'Кабинет' only. Hidden for everyone else."
```

---

## Task 12: Create /dashboard/register page (HTML)

**Files:**
- Create: `src/pages/dashboard/register.astro`

**Goal:** Astro page с формой регистрации клуба. Гейтинг: только залогиненные. Если уже есть pending заявка — показать её статус, форма disabled.

- [ ] **Step 1: Create page**

Создай `src/pages/dashboard/register.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import { CITIES } from '../../data/cities';
---

<BaseLayout
  title="Зарегистрировать клуб — respawn.kz"
  description="Подайте заявку на регистрацию вашего компьютерного клуба в каталоге respawn.kz"
>
  <section class="dashboard-page" id="register-root">
    <div class="container">
      <nav class="breadcrumb">
        <a href="/">Главная</a>
        <span class="breadcrumb__sep">/</span>
        <a href="/for-clubs/">Для клубов</a>
        <span class="breadcrumb__sep">/</span>
        <span class="breadcrumb__current">Регистрация</span>
      </nav>

      <header class="dashboard-page__header">
        <h1 class="dashboard-page__title">Зарегистрировать клуб</h1>
        <p class="dashboard-page__subtitle">
          Заявка попадает в очередь модерации. После одобрения суперадмин свяжется с тобой
          и привяжет твой аккаунт к клубу.
        </p>
      </header>

      <div class="dashboard-loading" id="register-loading">
        <p style="text-align:center;color:var(--text-muted)">Загружаем форму…</p>
      </div>

      <div class="dashboard-existing" id="register-existing" hidden>
        <!-- Если у юзера есть pending заявка — покажем её -->
      </div>

      <form id="register-form" class="dashboard-form" hidden>
        <div class="dashboard-form__row">
          <label class="auth-field">
            <span class="auth-label">Имя контактного лица *</span>
            <input type="text" name="applicant_name" class="auth-input" required maxlength="120" />
          </label>
          <label class="auth-field">
            <span class="auth-label">Email *</span>
            <input type="email" name="applicant_email" class="auth-input" required readonly />
          </label>
        </div>

        <div class="dashboard-form__row">
          <label class="auth-field">
            <span class="auth-label">Телефон *</span>
            <input type="tel" name="applicant_phone" class="auth-input" required 
                   placeholder="+7 (727) 123-45-67" pattern="[+\d\s()\-]{10,}" />
          </label>
          <label class="auth-field">
            <span class="auth-label">Название клуба *</span>
            <input type="text" name="club_name" class="auth-input" required maxlength="120" />
          </label>
        </div>

        <div class="dashboard-form__row">
          <label class="auth-field">
            <span class="auth-label">Город *</span>
            <select name="city" class="auth-input" required>
              <option value="">Выбери город</option>
              {CITIES.map((c) => <option value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label class="auth-field">
            <span class="auth-label">Район</span>
            <input type="text" name="district" class="auth-input" maxlength="120" 
                   placeholder="Например: Алмалинский р-н" />
          </label>
        </div>

        <label class="auth-field">
          <span class="auth-label">Адрес *</span>
          <input type="text" name="address" class="auth-input" required maxlength="200" 
                 placeholder="ул. Абая, 150" />
        </label>

        <div class="dashboard-form__row">
          <label class="auth-field">
            <span class="auth-label">Часы работы</span>
            <input type="text" name="working_hours" class="auth-input" maxlength="80" 
                   placeholder="10:00–02:00 или Круглосуточно" />
          </label>
          <label class="auth-field">
            <span class="auth-label">Фото (ссылка)</span>
            <input type="url" name="photo_url" class="auth-input" maxlength="500" 
                   placeholder="Google Drive / Imgur / Яндекс.Диск" />
          </label>
        </div>

        <label class="auth-field">
          <span class="auth-label">Оборудование</span>
          <textarea name="equipment_note" class="auth-input" rows="3" maxlength="500" 
                    placeholder="Кол-во PC, тип, периферия, VR…"></textarea>
        </label>

        <label class="auth-field">
          <span class="auth-label">Краткое описание</span>
          <textarea name="description" class="auth-input" rows="3" maxlength="500" 
                    placeholder="Что отличает твой клуб"></textarea>
        </label>

        <div class="auth-error" id="register-error" hidden></div>

        <button type="submit" class="btn btn--primary btn--large dashboard-form__submit">
          Отправить заявку
        </button>
      </form>

      <div class="dashboard-success" id="register-success" hidden>
        <h2>Заявка отправлена!</h2>
        <p>Статус увидишь в <a href="/dashboard/applications/">Моих заявках</a>.</p>
      </div>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Ожидание: успешно. Файл будет доступен по `/dashboard/register/`.

- [ ] **Step 3: Smoke test in dev**

```bash
npm run dev
```

Открой http://localhost:4321/dashboard/register/. Должна рендериться форма (без JS-логики пока).

- [ ] **Step 4: Commit**

```bash
git add src/pages/dashboard/register.astro
git commit -m "feat(pages): add /dashboard/register/ application form page

HTML structure for club registration form: contact info, club info,
working hours, equipment, photo URL, description. Required fields
marked with *. Script logic comes next."
```

---

## Task 13: Wire dashboard-register.ts script

**Files:**
- Create: `src/scripts/dashboard-register.ts`
- Modify: `src/scripts/init.ts`

**Goal:** Загрузка существующих заявок юзера, отображение текущей pending (если есть), INSERT новой при submit, вызов notify(). Гейтинг через requireLogin().

- [ ] **Step 1: Create dashboard-register.ts**

Создай `src/scripts/dashboard-register.ts`:

```ts
import { supabase } from '../lib/supabase';
import { requireLogin } from '../lib/route-guards';
import { notify } from '../lib/notifications';
import { type ClubApplication, type NewClubApplication, APPLICATION_STATUS_LABELS } from '../data/supabase-types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function renderExistingApplication(app: ClubApplication): string {
  return `
    <div class="dashboard-existing__card">
      <h3>У тебя уже есть заявка</h3>
      <p><strong>${app.club_name}</strong> — ${app.address}</p>
      <p>Статус: <span class="pill pill--${app.status}">${APPLICATION_STATUS_LABELS[app.status]}</span></p>
      <p>Подана: ${formatDate(app.created_at)}</p>
      ${app.review_note ? `<p>Комментарий модератора: ${app.review_note}</p>` : ''}
      <p style="margin-top:16px">
        <a href="/dashboard/applications/" class="btn btn--ghost">Все мои заявки</a>
        <button type="button" class="btn btn--primary" id="register-new">Подать ещё заявку</button>
      </p>
    </div>
  `;
}

async function loadExistingApplications(userId: string): Promise<ClubApplication[]> {
  const { data, error } = await supabase
    .from('club_applications')
    .select('*')
    .eq('applicant_user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[register] failed to load applications', error);
    return [];
  }
  return (data ?? []) as ClubApplication[];
}

export async function setupDashboardRegister(): Promise<void> {
  const root = document.getElementById('register-root');
  if (!root) return;

  const loadingEl = document.getElementById('register-loading');
  const existingEl = document.getElementById('register-existing');
  const formEl = document.getElementById('register-form') as HTMLFormElement | null;
  const successEl = document.getElementById('register-success');
  const errorEl = document.getElementById('register-error');
  if (!loadingEl || !existingEl || !formEl || !successEl || !errorEl) return;

  // Gate: require login
  const { user } = await requireLogin();
  if (!user) return; // redirected

  // Pre-fill email
  const emailInput = formEl.querySelector('input[name="applicant_email"]') as HTMLInputElement;
  if (emailInput) emailInput.value = user.email ?? '';

  // Check for existing pending application
  const existing = await loadExistingApplications(user.id);
  loadingEl.hidden = true;

  const pending = existing.find((a) => a.status === 'pending');
  if (pending) {
    existingEl.innerHTML = renderExistingApplication(pending);
    existingEl.hidden = false;
    document.getElementById('register-new')?.addEventListener('click', () => {
      existingEl.hidden = true;
      formEl.hidden = false;
    });
  } else {
    formEl.hidden = false;
  }

  // Handle submit
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const fd = new FormData(formEl);
    const newApp: NewClubApplication = {
      applicant_user_id: user.id,
      applicant_name: String(fd.get('applicant_name') ?? '').trim(),
      applicant_email: String(fd.get('applicant_email') ?? '').trim(),
      applicant_phone: String(fd.get('applicant_phone') ?? '').trim() || null,
      club_name: String(fd.get('club_name') ?? '').trim(),
      city: String(fd.get('city') ?? '').trim(),
      district: String(fd.get('district') ?? '').trim() || null,
      address: String(fd.get('address') ?? '').trim(),
      working_hours: String(fd.get('working_hours') ?? '').trim() || null,
      equipment_note: String(fd.get('equipment_note') ?? '').trim() || null,
      photo_url: String(fd.get('photo_url') ?? '').trim() || null,
      description: String(fd.get('description') ?? '').trim() || null,
    };

    const submitBtn = formEl.querySelector('button[type="submit"]') as HTMLButtonElement;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправляем…';

    const { data, error } = await supabase
      .from('club_applications')
      .insert(newApp)
      .select()
      .single();

    if (error || !data) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Отправить заявку';
      errorEl.textContent = `Не удалось отправить: ${error?.message ?? 'неизвестная ошибка'}`;
      errorEl.hidden = false;
      return;
    }

    await notify({
      type: 'application_submitted',
      applicationId: data.id,
      applicantEmail: newApp.applicant_email,
    });

    formEl.hidden = true;
    existingEl.hidden = true;
    successEl.hidden = false;
  });
}
```

- [ ] **Step 2: Wire into init.ts**

Открой `src/scripts/init.ts`. В начало после других импортов добавь:

```ts
import { setupDashboardRegister } from './dashboard-register';
```

Внутри `init()` функции после блока `if (document.getElementById('me-root')) {...}` добавь:

```ts
if (document.getElementById('register-root')) {
  setupDashboardRegister();
}
```

- [ ] **Step 3: Add basic CSS for dashboard pages**

Открой `src/styles/global.css`. В конец файла (или после `.me-page` стилей) добавь:

```css
/* ============================================================
   Dashboard / Admin pages — common
   ============================================================ */
.dashboard-page {
  padding: 48px 0 96px;
  min-height: 60vh;
}

.dashboard-page__header {
  margin-bottom: 32px;
}

.dashboard-page__title {
  font-family: var(--font-display, 'Inter Tight'), system-ui, sans-serif;
  font-size: clamp(28px, 4vw, 44px);
  font-weight: 700;
  line-height: 1.1;
  margin: 0 0 12px;
}

.dashboard-page__subtitle {
  color: var(--text-secondary);
  max-width: 600px;
  line-height: 1.6;
}

.dashboard-loading {
  padding: 64px 0;
}

/* Form */
.dashboard-form {
  display: grid;
  gap: 16px;
  max-width: 800px;
}

.dashboard-form__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 640px) {
  .dashboard-form__row {
    grid-template-columns: 1fr;
  }
}

.dashboard-form__submit {
  justify-self: start;
  margin-top: 8px;
}

/* Existing application card */
.dashboard-existing__card {
  background: var(--glass-bg, rgba(255,255,255,0.03));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  backdrop-filter: blur(20px);
  border-radius: 16px;
  padding: 24px;
  max-width: 600px;
}

.dashboard-existing__card h3 {
  margin: 0 0 12px;
  font-size: 20px;
}

/* Success state */
.dashboard-success {
  background: var(--glass-bg, rgba(255,255,255,0.03));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  border-radius: 16px;
  padding: 32px;
  max-width: 600px;
  text-align: center;
}

.dashboard-success h2 {
  color: var(--c-violet-400, #a78bfa);
  margin: 0 0 12px;
}

/* Status pills for applications */
.pill--approved {
  background: rgba(34, 197, 94, 0.15);
  color: rgb(74, 222, 128);
  border: 1px solid rgba(34, 197, 94, 0.3);
}
.pill--rejected {
  background: rgba(239, 68, 68, 0.15);
  color: rgb(248, 113, 113);
  border: 1px solid rgba(239, 68, 68, 0.3);
}
.pill--completed {
  background: rgba(99, 102, 241, 0.15);
  color: rgb(129, 140, 248);
  border: 1px solid rgba(99, 102, 241, 0.3);
}
.pill--no-show {
  background: rgba(120, 113, 108, 0.15);
  color: rgb(168, 162, 158);
  border: 1px solid rgba(120, 113, 108, 0.3);
}
```

- [ ] **Step 4: Build and smoke test**

```bash
npm run build
```

Ожидание: успешно.

```bash
npm run dev
```

1. Залогинься на http://localhost:4321/login/
2. Открой http://localhost:4321/dashboard/register/
3. Должна показаться форма с pre-filled email
4. Заполни обязательные поля, submit
5. Должен показаться success-блок
6. В Supabase Dashboard проверь:

```sql
select id, club_name, city, status, created_at 
from club_applications 
order by created_at desc 
limit 1;
```

Должна быть твоя заявка со статусом 'pending'.

7. Перезагрузи страницу `/dashboard/register/` — должен показаться existing-block с pending заявкой.
8. В консоли браузера должна быть строка `[notify] application_submitted {...}`.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/dashboard-register.ts src/scripts/init.ts src/styles/global.css
git commit -m "feat(scripts): wire /dashboard/register/ form submission

Loads existing applications for user, shows pending one if exists,
INSERTs new ClubApplication on submit, calls notify() stub. Adds
dashboard-page CSS scaffolding and status pill colors."
```

---

## Task 14: Create DashboardNav component

**Files:**
- Create: `src/components/DashboardNav.astro`

**Goal:** Универсальная навигация для /dashboard/* и /admin/* — sidebar или таб-навигация.

- [ ] **Step 1: Create component**

Создай `src/components/DashboardNav.astro`:

```astro
---
interface NavItem {
  href: string;
  label: string;
  icon?: string;
}

interface Props {
  variant: 'dashboard' | 'admin';
  active?: string;
}

const { variant, active } = Astro.props;

const items: NavItem[] = variant === 'dashboard'
  ? [
      { href: '/dashboard/', label: 'Обзор', icon: '◇' },
      { href: '/dashboard/bookings/', label: 'Брони', icon: '◆' },
      { href: '/dashboard/applications/', label: 'Мои заявки', icon: '◉' },
      { href: '/dashboard/register/', label: 'Новый клуб', icon: '✚' },
    ]
  : [
      { href: '/admin/', label: 'Обзор', icon: '★' },
      { href: '/admin/applications/', label: 'Заявки', icon: '◉' },
      { href: '/admin/owners/', label: 'Владельцы', icon: '◆' },
      { href: '/admin/users/', label: 'Пользователи', icon: '◇' },
    ];
---

<nav class="dash-nav" data-variant={variant}>
  {items.map((item) => (
    <a 
      href={item.href} 
      class:list={['dash-nav__link', { 'dash-nav__link--active': active === item.href }]}
    >
      {item.icon && <span class="dash-nav__icon">{item.icon}</span>}
      <span>{item.label}</span>
    </a>
  ))}
</nav>
```

- [ ] **Step 2: Add CSS for DashboardNav**

В `src/styles/global.css` добавь после `.dashboard-form__submit`:

```css
/* DashboardNav */
.dash-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  background: var(--glass-bg, rgba(255,255,255,0.03));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  backdrop-filter: blur(20px);
  border-radius: 100px;
  margin-bottom: 32px;
  max-width: max-content;
}

.dash-nav__link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 100px;
  text-decoration: none;
  color: var(--text-secondary);
  font-weight: 500;
  transition: background 0.2s, color 0.2s;
}

.dash-nav__link:hover {
  background: rgba(255,255,255,0.05);
  color: var(--text-primary, #fff);
}

.dash-nav__link--active {
  background: linear-gradient(135deg, var(--c-violet-500, #8b5cf6), var(--c-pink-500, #ec4899));
  color: #fff;
}

.dash-nav__icon {
  font-size: 14px;
  opacity: 0.7;
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/DashboardNav.astro src/styles/global.css
git commit -m "feat(components): add DashboardNav for /dashboard and /admin

Pill-style tab navigation with active state. Two variants: 'dashboard'
(for club admins: Обзор, Брони, Мои заявки, Новый клуб) and 'admin'
(for super-admin: Обзор, Заявки, Владельцы, Пользователи)."
```

---

## Task 15: Create /dashboard/index.astro (overview)

**Files:**
- Create: `src/pages/dashboard/index.astro`
- Create: `src/scripts/dashboard.ts`
- Modify: `src/scripts/init.ts`

**Goal:** Главная dashboard'a: статистика бронирований клубов юзера (сегодня + ожидают подтверждения) + список последних 10 броней. Гейтинг requireClubAdmin.

- [ ] **Step 1: Create page**

Создай `src/pages/dashboard/index.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import DashboardNav from '../../components/DashboardNav.astro';
---

<BaseLayout title="Кабинет — respawn.kz">
  <section class="dashboard-page" id="dashboard-root">
    <div class="container">
      <header class="dashboard-page__header">
        <h1 class="dashboard-page__title">Кабинет клуба</h1>
        <p class="dashboard-page__subtitle">Обзор активности твоих клубов</p>
      </header>

      <DashboardNav variant="dashboard" active="/dashboard/" />

      <div class="dashboard-loading" id="dashboard-loading">
        <p style="text-align:center;color:var(--text-muted)">Загружаем…</p>
      </div>

      <div class="dashboard-stats" id="dashboard-stats" hidden>
        <div class="stat-card">
          <div class="stat-card__label">Брони сегодня</div>
          <div class="stat-card__value" id="stat-today">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">Ожидают подтверждения</div>
          <div class="stat-card__value" id="stat-pending">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">Всего клубов</div>
          <div class="stat-card__value" id="stat-clubs">—</div>
        </div>
      </div>

      <div class="dashboard-recent" id="dashboard-recent" hidden>
        <h2>Последние брони</h2>
        <div class="dashboard-recent__list" id="dashboard-recent-list"></div>
        <p style="margin-top:16px"><a href="/dashboard/bookings/" class="btn btn--ghost">Все брони →</a></p>
      </div>

      <div class="dashboard-empty" id="dashboard-empty" hidden>
        <p>У тебя пока нет привязанных клубов.</p>
        <p>Если хочешь добавить новый — <a href="/dashboard/register/">подай заявку</a>.</p>
        <p>Если ты владелец существующего клуба из каталога — напиши на zhandos397@gmail.com, привяжу.</p>
      </div>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 2: Create dashboard.ts script**

Создай `src/scripts/dashboard.ts`:

```ts
import { supabase } from '../lib/supabase';
import { requireClubAdmin } from '../lib/route-guards';
import { type Booking, STATUS_LABELS, STATUS_COLORS } from '../data/supabase-types';
import { CLUBS } from '../data/clubs';

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getClubName(slug: string): string {
  return CLUBS.find((c) => c.slug === slug)?.name ?? slug;
}

function renderRecentRow(b: Booking): string {
  return `
    <article class="dashboard-recent__item">
      <div class="dashboard-recent__main">
        <strong>${getClubName(b.club_slug)}</strong>
        <span class="dashboard-recent__meta">${formatDate(b.date)} · ${b.time_slot} · ${b.hours}ч</span>
      </div>
      <div class="dashboard-recent__side">
        <span>${formatPrice(b.total_price)} ₸</span>
        <span class="pill ${STATUS_COLORS[b.status]}">${STATUS_LABELS[b.status]}</span>
      </div>
    </article>
  `;
}

export async function setupDashboard(): Promise<void> {
  const root = document.getElementById('dashboard-root');
  if (!root) return;

  const loadingEl = document.getElementById('dashboard-loading');
  const statsEl = document.getElementById('dashboard-stats');
  const recentEl = document.getElementById('dashboard-recent');
  const recentListEl = document.getElementById('dashboard-recent-list');
  const emptyEl = document.getElementById('dashboard-empty');
  if (!loadingEl || !statsEl || !recentEl || !recentListEl || !emptyEl) return;

  // Gate: require club_admin or super_admin
  const { clubSlugs, isSuperAdmin } = await requireClubAdmin();

  if (clubSlugs.length === 0 && !isSuperAdmin) {
    loadingEl.hidden = true;
    emptyEl.hidden = false;
    return;
  }

  // Load bookings of user's clubs
  let query = supabase.from('bookings').select('*').order('created_at', { ascending: false });
  if (!isSuperAdmin && clubSlugs.length > 0) {
    query = query.in('club_slug', clubSlugs);
  }
  const { data, error } = await query.limit(50);

  loadingEl.hidden = true;

  if (error) {
    console.error('[dashboard] failed to load bookings', error);
    emptyEl.innerHTML = `<p>Ошибка загрузки: ${error.message}</p>`;
    emptyEl.hidden = false;
    return;
  }

  const bookings = (data ?? []) as Booking[];

  // Compute stats
  const today = todayISO();
  const todayCount = bookings.filter((b) => b.date === today).length;
  const pendingCount = bookings.filter((b) => b.status === 'pending').length;
  const clubsCount = isSuperAdmin ? 'все' : String(clubSlugs.length);

  document.getElementById('stat-today')!.textContent = String(todayCount);
  document.getElementById('stat-pending')!.textContent = String(pendingCount);
  document.getElementById('stat-clubs')!.textContent = clubsCount;
  statsEl.hidden = false;

  // Recent bookings (last 10)
  const recent = bookings.slice(0, 10);
  if (recent.length === 0) {
    recentListEl.innerHTML = '<p style="color:var(--text-muted)">Пока нет броней</p>';
  } else {
    recentListEl.innerHTML = recent.map(renderRecentRow).join('');
  }
  recentEl.hidden = false;
}
```

- [ ] **Step 3: Wire into init.ts**

Открой `src/scripts/init.ts`. Добавь импорт:

```ts
import { setupDashboard } from './dashboard';
```

Внутри `init()` после блока с `register-root`:

```ts
if (document.getElementById('dashboard-root')) {
  setupDashboard();
}
```

- [ ] **Step 4: Add CSS for stats and recent**

В `src/styles/global.css` после `.dash-nav__icon`:

```css
/* Stats cards */
.dashboard-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 48px;
}

.stat-card {
  background: var(--glass-bg, rgba(255,255,255,0.03));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  backdrop-filter: blur(20px);
  border-radius: 16px;
  padding: 24px;
}

.stat-card__label {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 8px;
}

.stat-card__value {
  font-family: var(--font-mono, 'JetBrains Mono'), monospace;
  font-size: 36px;
  font-weight: 600;
}

/* Recent bookings */
.dashboard-recent h2 {
  margin: 0 0 16px;
  font-size: 22px;
}

.dashboard-recent__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dashboard-recent__item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--glass-bg, rgba(255,255,255,0.02));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.06));
  border-radius: 12px;
  padding: 12px 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.dashboard-recent__main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dashboard-recent__meta {
  color: var(--text-secondary);
  font-size: 13px;
}

.dashboard-recent__side {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dashboard-empty {
  background: var(--glass-bg, rgba(255,255,255,0.03));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  border-radius: 16px;
  padding: 32px;
  max-width: 600px;
  text-align: center;
}

.dashboard-empty p {
  margin: 0 0 8px;
  color: var(--text-secondary);
}
```

- [ ] **Step 5: Build and smoke test**

```bash
npm run build && npm run dev
```

1. Залогинься как super-admin (то, что засеяли в Task 1). Открой http://localhost:4321/dashboard/. Должны показаться stats (все нули если нет броней).
2. Если у тебя нет привязки и ты не super-admin → редирект на /dashboard/register/.
3. Создай тестовую бронь через каталог (или вручную в SQL), перезагрузи /dashboard/ — она появится в "Последние брони".

- [ ] **Step 6: Commit**

```bash
git add src/pages/dashboard/index.astro src/scripts/dashboard.ts src/scripts/init.ts src/styles/global.css
git commit -m "feat(pages): add /dashboard/ overview with stats and recent bookings

Shows 3 stat cards (today, pending, total clubs) and last 10 bookings.
Gated by requireClubAdmin. Super-admin sees all bookings; club_admin
sees only their clubs. Empty state for users with no club mappings."
```

---

## Task 16: Create /dashboard/bookings page with state machine

**Files:**
- Create: `src/pages/dashboard/bookings.astro`
- Create: `src/scripts/dashboard-bookings.ts`
- Modify: `src/scripts/init.ts`

**Goal:** Полный список броней с фильтрами (клуб, дата, статус) + кнопки переходов статусов согласно state machine.

- [ ] **Step 1: Create page**

Создай `src/pages/dashboard/bookings.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import DashboardNav from '../../components/DashboardNav.astro';
---

<BaseLayout title="Брони — Кабинет — respawn.kz">
  <section class="dashboard-page" id="bookings-root">
    <div class="container">
      <header class="dashboard-page__header">
        <h1 class="dashboard-page__title">Брони</h1>
      </header>

      <DashboardNav variant="dashboard" active="/dashboard/bookings/" />

      <div class="dashboard-filters" id="bookings-filters" hidden>
        <label class="filter">
          <span class="filter__label">Клуб</span>
          <select id="filter-club" class="filter__input">
            <option value="">Все клубы</option>
          </select>
        </label>
        <label class="filter">
          <span class="filter__label">Статус</span>
          <select id="filter-status" class="filter__input">
            <option value="">Все статусы</option>
            <option value="pending">Ожидает</option>
            <option value="confirmed">Подтверждена</option>
            <option value="completed">Завершена</option>
            <option value="cancelled">Отменена</option>
            <option value="no_show">Не пришёл</option>
          </select>
        </label>
        <label class="filter">
          <span class="filter__label">Дата от</span>
          <input type="date" id="filter-date-from" class="filter__input" />
        </label>
        <button type="button" class="btn btn--ghost" id="filter-reset">Сбросить</button>
      </div>

      <div class="dashboard-loading" id="bookings-loading">
        <p style="text-align:center;color:var(--text-muted)">Загружаем…</p>
      </div>

      <div class="bookings-list" id="bookings-list" hidden></div>

      <div class="bookings-empty" id="bookings-empty" hidden>
        <p>Бронирований не найдено</p>
      </div>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 2: Create dashboard-bookings.ts**

Создай `src/scripts/dashboard-bookings.ts`:

```ts
import { supabase } from '../lib/supabase';
import { requireClubAdmin } from '../lib/route-guards';
import { 
  type Booking, 
  type BookingStatus,
  STATUS_LABELS, 
  STATUS_COLORS,
  isTerminalStatus,
} from '../data/supabase-types';
import { notify } from '../lib/notifications';
import { CLUBS } from '../data/clubs';

interface Filters {
  club: string;
  status: string;
  dateFrom: string;
}

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function getClubName(slug: string): string {
  return CLUBS.find((c) => c.slug === slug)?.name ?? slug;
}

// Available transitions for a given booking status (admin perspective)
function availableTransitions(current: BookingStatus): BookingStatus[] {
  switch (current) {
    case 'pending':
      return ['confirmed', 'cancelled'];
    case 'confirmed':
      return ['completed', 'no_show', 'cancelled'];
    default:
      return []; // terminal: no transitions
  }
}

function transitionLabel(to: BookingStatus): string {
  switch (to) {
    case 'confirmed': return 'Подтвердить';
    case 'completed': return 'Завершить';
    case 'no_show': return 'Не пришёл';
    case 'cancelled': return 'Отменить';
    default: return STATUS_LABELS[to];
  }
}

function transitionClass(to: BookingStatus): string {
  if (to === 'cancelled' || to === 'no_show') return 'btn btn--ghost btn--sm';
  return 'btn btn--primary btn--sm';
}

function renderBookingCard(b: Booking): string {
  const transitions = availableTransitions(b.status);
  const buttons = transitions.map((to) => 
    `<button type="button" class="${transitionClass(to)}" data-transition="${to}" data-id="${b.id}">${transitionLabel(to)}</button>`
  ).join('');

  return `
    <article class="booking-card" data-booking-id="${b.id}">
      <div class="booking-card__main">
        <h3 class="booking-card__title">${getClubName(b.club_slug)}</h3>
        <div class="booking-card__meta">
          <span>${formatDate(b.date)}</span>
          <span class="club-card__meta-sep">·</span>
          <span>${b.time_slot}, ${b.hours}ч</span>
          <span class="club-card__meta-sep">·</span>
          <span>${formatPrice(b.total_price)} ₸</span>
        </div>
      </div>
      <div class="booking-card__side">
        <span class="pill ${STATUS_COLORS[b.status]}">${STATUS_LABELS[b.status]}</span>
        ${buttons ? `<div class="booking-card__actions">${buttons}</div>` : ''}
      </div>
    </article>
  `;
}

async function loadBookings(clubSlugs: string[], isSuperAdmin: boolean, filters: Filters): Promise<Booking[]> {
  let query = supabase.from('bookings').select('*').order('date', { ascending: false });

  if (!isSuperAdmin && clubSlugs.length > 0) {
    query = query.in('club_slug', clubSlugs);
  }

  if (filters.club) query = query.eq('club_slug', filters.club);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.dateFrom) query = query.gte('date', filters.dateFrom);

  const { data, error } = await query.limit(200);
  if (error) {
    console.error('[bookings] load failed', error);
    return [];
  }
  return (data ?? []) as Booking[];
}

async function transitionBooking(id: string, newStatus: BookingStatus): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: newStatus })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function fireNotificationForTransition(b: Booking, newStatus: BookingStatus, customerEmail: string): Promise<void> {
  switch (newStatus) {
    case 'confirmed':
      await notify({ type: 'booking_confirmed', bookingId: b.id, customerEmail });
      break;
    case 'cancelled':
      await notify({ type: 'booking_cancelled', bookingId: b.id, recipientEmails: [customerEmail] });
      break;
    case 'completed':
      await notify({ type: 'booking_completed', bookingId: b.id, customerEmail });
      break;
    case 'no_show':
      await notify({ type: 'booking_no_show', bookingId: b.id, customerEmail });
      break;
  }
}

export async function setupDashboardBookings(): Promise<void> {
  const root = document.getElementById('bookings-root');
  if (!root) return;

  const loadingEl = document.getElementById('bookings-loading');
  const filtersEl = document.getElementById('bookings-filters');
  const listEl = document.getElementById('bookings-list');
  const emptyEl = document.getElementById('bookings-empty');
  if (!loadingEl || !filtersEl || !listEl || !emptyEl) return;

  // Gate
  const { clubSlugs, isSuperAdmin } = await requireClubAdmin();

  // Populate club filter
  const clubSelect = document.getElementById('filter-club') as HTMLSelectElement;
  const allowedClubs = isSuperAdmin
    ? CLUBS
    : CLUBS.filter((c) => clubSlugs.includes(c.slug));
  allowedClubs.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.slug;
    opt.textContent = c.name;
    clubSelect.appendChild(opt);
  });

  filtersEl.hidden = false;

  // Reactive load
  const filters: Filters = { club: '', status: '', dateFrom: '' };

  // Cache user emails by user_id to enable notification firing
  const userEmailCache = new Map<string, string>();
  async function getCustomerEmail(userId: string): Promise<string> {
    if (userEmailCache.has(userId)) return userEmailCache.get(userId)!;
    // Note: we cannot directly query auth.users from client. For MVP, we use
    // a placeholder email and let notify() stub log it. When Resend is wired,
    // an Edge Function will resolve the email server-side.
    const placeholder = `user-${userId.slice(0, 8)}@unknown`;
    userEmailCache.set(userId, placeholder);
    return placeholder;
  }

  async function refresh() {
    loadingEl.hidden = false;
    listEl.hidden = true;
    emptyEl.hidden = true;

    const bookings = await loadBookings(clubSlugs, isSuperAdmin, filters);
    loadingEl.hidden = true;

    if (bookings.length === 0) {
      emptyEl.hidden = false;
      return;
    }

    listEl.innerHTML = bookings.map(renderBookingCard).join('');
    listEl.hidden = false;
  }

  // Filter handlers
  clubSelect.addEventListener('change', () => { filters.club = clubSelect.value; refresh(); });
  (document.getElementById('filter-status') as HTMLSelectElement).addEventListener('change', (e) => {
    filters.status = (e.target as HTMLSelectElement).value;
    refresh();
  });
  (document.getElementById('filter-date-from') as HTMLInputElement).addEventListener('change', (e) => {
    filters.dateFrom = (e.target as HTMLInputElement).value;
    refresh();
  });
  document.getElementById('filter-reset')?.addEventListener('click', () => {
    filters.club = ''; filters.status = ''; filters.dateFrom = '';
    clubSelect.value = '';
    (document.getElementById('filter-status') as HTMLSelectElement).value = '';
    (document.getElementById('filter-date-from') as HTMLInputElement).value = '';
    refresh();
  });

  // Transition button handler (event delegation)
  listEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('[data-transition]') as HTMLButtonElement | null;
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const to = btn.getAttribute('data-transition') as BookingStatus | null;
    if (!id || !to) return;

    if (!window.confirm(`Перевести в статус "${STATUS_LABELS[to]}"?`)) return;

    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = 'Сохраняем…';

    const result = await transitionBooking(id, to);
    if (!result.ok) {
      btn.disabled = false;
      btn.textContent = oldText;
      alert(`Не удалось: ${result.error}`);
      return;
    }

    // Find the booking record to fire notification
    const card = btn.closest('[data-booking-id]') as HTMLElement;
    const bookingId = card.getAttribute('data-booking-id')!;
    // Re-fetch the booking for accurate state and customer email is not available client-side
    const { data: updated } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
    if (updated) {
      const customerEmail = await getCustomerEmail(updated.user_id);
      await fireNotificationForTransition(updated as Booking, to, customerEmail);
    }

    // Refresh full list to update buttons and pills
    refresh();
  });

  // Initial load
  await refresh();
}
```

- [ ] **Step 3: Wire into init.ts**

Открой `src/scripts/init.ts`. Добавь импорт:

```ts
import { setupDashboardBookings } from './dashboard-bookings';
```

Внутри `init()`:

```ts
if (document.getElementById('bookings-root')) {
  setupDashboardBookings();
}
```

- [ ] **Step 4: Add CSS for booking cards and filters**

В `src/styles/global.css` после `.dashboard-empty p`:

```css
/* Dashboard filters */
.dashboard-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
  margin-bottom: 24px;
  padding: 16px;
  background: var(--glass-bg, rgba(255,255,255,0.03));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  border-radius: 12px;
}

/* Booking cards in dashboard */
.bookings-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.booking-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--glass-bg, rgba(255,255,255,0.03));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  border-radius: 16px;
  padding: 20px;
  flex-wrap: wrap;
  gap: 16px;
}

.booking-card__title {
  margin: 0 0 6px;
  font-size: 18px;
}

.booking-card__meta {
  color: var(--text-secondary);
  font-size: 14px;
}

.booking-card__side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}

.booking-card__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.bookings-empty {
  text-align: center;
  padding: 64px 0;
  color: var(--text-muted);
}
```

- [ ] **Step 5: Build and smoke test**

```bash
npm run build && npm run dev
```

1. Залогинься как super-admin
2. В Supabase SQL editor создай тестовую бронь:

```sql
insert into bookings (user_id, club_slug, club_name, city_id, date, time_slot, hours, price_per_hour, total_price)
values ('<твой-uid>', 'cyberzone', 'Cyberzone', 'almaty', current_date, '14:00', 2, 1200, 2400)
returning id;
```

3. Открой http://localhost:4321/dashboard/bookings/
4. Должна показаться бронь с pill "Ожидает подтверждения" и кнопками "Подтвердить" / "Отменить"
5. Нажми "Подтвердить" → confirm dialog → должно стать "Подтверждена" + кнопки "Завершить" / "Не пришёл" / "Отменить"
6. Нажми "Завершить" → должно стать "Завершена" без кнопок (terminal)
7. Попробуй фильтры — должны работать

В консоли браузера должны быть `[notify] booking_confirmed`, `[notify] booking_completed`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/dashboard/bookings.astro src/scripts/dashboard-bookings.ts src/scripts/init.ts src/styles/global.css
git commit -m "feat(pages): add /dashboard/bookings/ with state machine

Full list with filters (club/status/date). Transition buttons follow
state machine: pending→confirmed/cancelled, confirmed→completed/
no_show/cancelled. Terminal statuses show no buttons. Each transition
fires notify() stub call."
```

---

## Task 17: Create /dashboard/applications page

**Files:**
- Create: `src/pages/dashboard/applications.astro`
- Create: `src/scripts/dashboard-applications.ts`
- Modify: `src/scripts/init.ts`

**Goal:** Список ВСЕХ заявок текущего user'а с их статусами + комментариями ревью.

- [ ] **Step 1: Create page**

Создай `src/pages/dashboard/applications.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import DashboardNav from '../../components/DashboardNav.astro';
---

<BaseLayout title="Мои заявки — Кабинет — respawn.kz">
  <section class="dashboard-page" id="my-apps-root">
    <div class="container">
      <header class="dashboard-page__header">
        <h1 class="dashboard-page__title">Мои заявки</h1>
      </header>

      <DashboardNav variant="dashboard" active="/dashboard/applications/" />

      <div class="dashboard-loading" id="my-apps-loading">
        <p style="text-align:center;color:var(--text-muted)">Загружаем…</p>
      </div>

      <div class="apps-list" id="my-apps-list" hidden></div>

      <div class="apps-empty" id="my-apps-empty" hidden>
        <p>У тебя ещё нет поданных заявок.</p>
        <a href="/dashboard/register/" class="btn btn--primary" style="margin-top:16px">Подать заявку</a>
      </div>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 2: Create dashboard-applications.ts**

Создай `src/scripts/dashboard-applications.ts`:

```ts
import { supabase } from '../lib/supabase';
import { requireLogin } from '../lib/route-guards';
import { type ClubApplication, APPLICATION_STATUS_LABELS } from '../data/supabase-types';
import { CITY_LABELS } from '../data/cities';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function renderAppCard(app: ClubApplication): string {
  const cityLabel = CITY_LABELS[app.city] ?? app.city;
  return `
    <article class="app-card">
      <div class="app-card__header">
        <h3 class="app-card__title">${app.club_name}</h3>
        <span class="pill pill--${app.status}">${APPLICATION_STATUS_LABELS[app.status]}</span>
      </div>
      <div class="app-card__meta">
        <span>${cityLabel}</span>
        ${app.district ? `<span class="club-card__meta-sep">·</span><span>${app.district}</span>` : ''}
        <span class="club-card__meta-sep">·</span>
        <span>${app.address}</span>
      </div>
      ${app.description ? `<p class="app-card__desc">${app.description}</p>` : ''}
      <div class="app-card__footer">
        <span>Подана: ${formatDate(app.created_at)}</span>
        ${app.reviewed_at ? `<span>Рассмотрена: ${formatDate(app.reviewed_at)}</span>` : ''}
      </div>
      ${app.review_note ? `
        <div class="app-card__review">
          <strong>Комментарий модератора:</strong>
          <p>${app.review_note}</p>
        </div>
      ` : ''}
    </article>
  `;
}

export async function setupDashboardApplications(): Promise<void> {
  const root = document.getElementById('my-apps-root');
  if (!root) return;

  const loadingEl = document.getElementById('my-apps-loading');
  const listEl = document.getElementById('my-apps-list');
  const emptyEl = document.getElementById('my-apps-empty');
  if (!loadingEl || !listEl || !emptyEl) return;

  const { user } = await requireLogin();
  if (!user) return;

  const { data, error } = await supabase
    .from('club_applications')
    .select('*')
    .eq('applicant_user_id', user.id)
    .order('created_at', { ascending: false });

  loadingEl.hidden = true;

  if (error) {
    listEl.innerHTML = `<p>Ошибка: ${error.message}</p>`;
    listEl.hidden = false;
    return;
  }

  const apps = (data ?? []) as ClubApplication[];
  if (apps.length === 0) {
    emptyEl.hidden = false;
    return;
  }

  listEl.innerHTML = apps.map(renderAppCard).join('');
  listEl.hidden = false;
}
```

- [ ] **Step 3: Wire into init.ts**

Открой `src/scripts/init.ts`:

```ts
import { setupDashboardApplications } from './dashboard-applications';
```

```ts
if (document.getElementById('my-apps-root')) {
  setupDashboardApplications();
}
```

- [ ] **Step 4: Add CSS for app cards**

В `src/styles/global.css`:

```css
/* Application cards */
.apps-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.app-card {
  background: var(--glass-bg, rgba(255,255,255,0.03));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  border-radius: 16px;
  padding: 24px;
}

.app-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.app-card__title {
  margin: 0;
  font-size: 20px;
}

.app-card__meta {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 12px;
}

.app-card__desc {
  color: var(--text-secondary);
  margin: 0 0 12px;
  line-height: 1.6;
}

.app-card__footer {
  display: flex;
  gap: 24px;
  color: var(--text-muted);
  font-size: 13px;
  flex-wrap: wrap;
}

.app-card__review {
  margin-top: 16px;
  padding: 16px;
  background: rgba(99, 102, 241, 0.08);
  border-left: 3px solid var(--c-violet-500, #8b5cf6);
  border-radius: 8px;
}

.app-card__review strong {
  display: block;
  margin-bottom: 8px;
  color: var(--text-primary, #fff);
}

.app-card__review p {
  margin: 0;
  color: var(--text-secondary);
}

.apps-empty {
  text-align: center;
  padding: 48px;
  background: var(--glass-bg, rgba(255,255,255,0.03));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  border-radius: 16px;
}
```

- [ ] **Step 5: Build and smoke test**

```bash
npm run build && npm run dev
```

1. Открой http://localhost:4321/dashboard/applications/
2. Если ты подал заявку в Task 13 — она должна показаться
3. Если ещё нет — должен показаться empty state

- [ ] **Step 6: Commit**

```bash
git add src/pages/dashboard/applications.astro src/scripts/dashboard-applications.ts src/scripts/init.ts src/styles/global.css
git commit -m "feat(pages): add /dashboard/applications/ for user's own applications

Lists all ClubApplications user has submitted with status pills,
review_note from moderator, and timestamps. Empty state suggests
submitting an application."
```

---

## Task 18: Create /admin/index.astro (overview)

**Files:**
- Create: `src/pages/admin/index.astro`
- Modify: `src/scripts/init.ts`

**Goal:** Главная админки: количество pending заявок + ссылки на разделы.

- [ ] **Step 1: Create page**

Создай `src/pages/admin/index.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import DashboardNav from '../../components/DashboardNav.astro';
---

<BaseLayout title="Админка — respawn.kz">
  <section class="dashboard-page" id="admin-root">
    <div class="container">
      <header class="dashboard-page__header">
        <h1 class="dashboard-page__title">Админка</h1>
        <p class="dashboard-page__subtitle">Управление платформой respawn.kz</p>
      </header>

      <DashboardNav variant="admin" active="/admin/" />

      <div class="dashboard-loading" id="admin-loading">
        <p style="text-align:center;color:var(--text-muted)">Загружаем…</p>
      </div>

      <div class="dashboard-stats" id="admin-stats" hidden>
        <div class="stat-card">
          <div class="stat-card__label">Заявки в очереди</div>
          <div class="stat-card__value" id="admin-stat-pending">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">Всего одобрено</div>
          <div class="stat-card__value" id="admin-stat-approved">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">Всего отклонено</div>
          <div class="stat-card__value" id="admin-stat-rejected">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">Активных владельцев</div>
          <div class="stat-card__value" id="admin-stat-admins">—</div>
        </div>
      </div>

      <div class="admin-shortcuts" id="admin-shortcuts" hidden>
        <h2>Быстрые действия</h2>
        <div class="admin-shortcuts__grid">
          <a href="/admin/applications/" class="admin-shortcut">
            <span class="admin-shortcut__icon">◉</span>
            <strong>Заявки</strong>
            <span>Очередь регистраций клубов</span>
          </a>
          <a href="/admin/owners/" class="admin-shortcut">
            <span class="admin-shortcut__icon">◆</span>
            <strong>Владельцы</strong>
            <span>Привязка email → club_slug</span>
          </a>
          <a href="/admin/users/" class="admin-shortcut">
            <span class="admin-shortcut__icon">◇</span>
            <strong>Пользователи</strong>
            <span>Поиск и просмотр ролей</span>
          </a>
        </div>
      </div>
    </div>
  </section>
</BaseLayout>

<script>
  import { supabase } from '../../lib/supabase';
  import { requireSuperAdmin } from '../../lib/route-guards';

  async function setupAdminOverview() {
    const root = document.getElementById('admin-root');
    if (!root) return;

    await requireSuperAdmin();

    const [pending, approved, rejected, admins] = await Promise.all([
      supabase.from('club_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('club_applications').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('club_applications').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
      supabase.from('club_admins').select('id', { count: 'exact', head: true }),
    ]);

    document.getElementById('admin-stat-pending')!.textContent = String(pending.count ?? 0);
    document.getElementById('admin-stat-approved')!.textContent = String(approved.count ?? 0);
    document.getElementById('admin-stat-rejected')!.textContent = String(rejected.count ?? 0);
    document.getElementById('admin-stat-admins')!.textContent = String(admins.count ?? 0);

    document.getElementById('admin-loading')!.hidden = true;
    document.getElementById('admin-stats')!.hidden = false;
    document.getElementById('admin-shortcuts')!.hidden = false;
  }

  setupAdminOverview();
</script>
```

(Inline script вместо отдельного scripts/* файла — для admin index достаточно простой логики, без интеграции в init.ts. Init.ts всё равно будет работать через DOMContentLoaded.)

Wait, проблема — Astro inline `<script>` исполняется внутри bundled chunk, и `await` на верхнем уровне работает только если script указан `type="module"` (по умолчанию для Astro inline scripts это так). OK работает.

- [ ] **Step 2: Add CSS for admin shortcuts**

В `src/styles/global.css`:

```css
/* Admin shortcuts grid */
.admin-shortcuts {
  margin-top: 48px;
}

.admin-shortcuts h2 {
  margin: 0 0 16px;
  font-size: 22px;
}

.admin-shortcuts__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.admin-shortcut {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 24px;
  background: var(--glass-bg, rgba(255,255,255,0.03));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  border-radius: 16px;
  text-decoration: none;
  color: var(--text-primary, #fff);
  transition: border-color 0.2s, background 0.2s;
}

.admin-shortcut:hover {
  border-color: var(--c-violet-500, #8b5cf6);
  background: rgba(139, 92, 246, 0.06);
}

.admin-shortcut__icon {
  font-size: 32px;
  color: var(--c-violet-400, #a78bfa);
  margin-bottom: 8px;
}

.admin-shortcut strong {
  font-size: 18px;
}

.admin-shortcut span:last-child {
  color: var(--text-secondary);
  font-size: 14px;
}
```

- [ ] **Step 3: Build and smoke test**

```bash
npm run build && npm run dev
```

1. Залогинься как super-admin
2. Открой http://localhost:4321/admin/
3. Должна показаться статистика (1 pending если ты подал заявку в Task 13, 0/0/0 если БД чистая) + 3 карточки shortcuts
4. Если залогинен как не-super-admin → редирект на /

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/index.astro src/styles/global.css
git commit -m "feat(pages): add /admin/ overview for super-admins

4 stat cards (pending/approved/rejected applications + total
club_admins) and 3 shortcut cards to admin sub-pages. Inline script
gated by requireSuperAdmin."
```

---

## Task 19: Create /admin/applications page

**Files:**
- Create: `src/pages/admin/applications.astro`
- Create: `src/scripts/admin-applications.ts`
- Modify: `src/scripts/init.ts`

**Goal:** Очередь pending заявок с кнопками Approve/Reject + поле review_note. После approval суперадмин видит инструкцию что делать дальше (добавить клуб в clubs.ts + привязать через /admin/owners/).

- [ ] **Step 1: Create page**

Создай `src/pages/admin/applications.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import DashboardNav from '../../components/DashboardNav.astro';
---

<BaseLayout title="Заявки — Админка — respawn.kz">
  <section class="dashboard-page" id="admin-apps-root">
    <div class="container">
      <header class="dashboard-page__header">
        <h1 class="dashboard-page__title">Очередь заявок</h1>
      </header>

      <DashboardNav variant="admin" active="/admin/applications/" />

      <div class="admin-apps-filters" id="admin-apps-filters" hidden>
        <label class="filter">
          <span class="filter__label">Показать</span>
          <select id="admin-apps-status" class="filter__input">
            <option value="pending">Только в очереди</option>
            <option value="approved">Одобренные</option>
            <option value="rejected">Отклонённые</option>
            <option value="">Все</option>
          </select>
        </label>
      </div>

      <div class="dashboard-loading" id="admin-apps-loading">
        <p style="text-align:center;color:var(--text-muted)">Загружаем…</p>
      </div>

      <div class="admin-apps-list" id="admin-apps-list" hidden></div>

      <div class="apps-empty" id="admin-apps-empty" hidden>
        <p>Нет заявок в этой категории</p>
      </div>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 2: Create admin-applications.ts**

Создай `src/scripts/admin-applications.ts`:

```ts
import { supabase } from '../lib/supabase';
import { requireSuperAdmin } from '../lib/route-guards';
import { type ClubApplication, type ApplicationStatus, APPLICATION_STATUS_LABELS } from '../data/supabase-types';
import { notify } from '../lib/notifications';
import { CITY_LABELS } from '../data/cities';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function renderAdminAppCard(app: ClubApplication): string {
  const cityLabel = CITY_LABELS[app.city] ?? app.city;
  const isPending = app.status === 'pending';

  return `
    <article class="admin-app-card" data-app-id="${app.id}">
      <div class="admin-app-card__header">
        <div>
          <h3 class="admin-app-card__title">${app.club_name}</h3>
          <div class="admin-app-card__contact">
            ${app.applicant_name} · ${app.applicant_email} ${app.applicant_phone ? `· ${app.applicant_phone}` : ''}
          </div>
        </div>
        <span class="pill pill--${app.status}">${APPLICATION_STATUS_LABELS[app.status]}</span>
      </div>

      <div class="admin-app-card__body">
        <div class="info-grid">
          <div><div class="info-label">Город</div><div class="info-value">${cityLabel}</div></div>
          <div><div class="info-label">Район</div><div class="info-value">${app.district ?? '—'}</div></div>
          <div><div class="info-label">Адрес</div><div class="info-value">${app.address}</div></div>
          <div><div class="info-label">Часы</div><div class="info-value">${app.working_hours ?? '—'}</div></div>
        </div>
        ${app.equipment_note ? `<div><div class="info-label">Оборудование</div><div class="info-value">${app.equipment_note}</div></div>` : ''}
        ${app.description ? `<div><div class="info-label">Описание</div><div class="info-value">${app.description}</div></div>` : ''}
        ${app.photo_url ? `<div><div class="info-label">Фото</div><div class="info-value"><a href="${app.photo_url}" target="_blank" rel="noopener">Открыть ссылку →</a></div></div>` : ''}
      </div>

      <div class="admin-app-card__footer">
        <span>Подана: ${formatDate(app.created_at)}</span>
        ${app.reviewed_at ? `<span>Рассмотрена: ${formatDate(app.reviewed_at)}</span>` : ''}
      </div>

      ${app.review_note ? `
        <div class="app-card__review">
          <strong>Твой комментарий:</strong>
          <p>${app.review_note}</p>
        </div>
      ` : ''}

      ${isPending ? `
        <div class="admin-app-card__actions">
          <textarea class="auth-input" data-note="${app.id}" placeholder="Комментарий (опционально)" rows="2" style="margin-bottom:12px"></textarea>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn btn--primary btn--sm" data-action="approve" data-id="${app.id}">Одобрить</button>
            <button type="button" class="btn btn--ghost btn--sm" data-action="reject" data-id="${app.id}">Отклонить</button>
          </div>
        </div>
      ` : ''}
    </article>
  `;
}

async function loadApplications(statusFilter: string): Promise<ClubApplication[]> {
  let query = supabase.from('club_applications').select('*').order('created_at', { ascending: false });
  if (statusFilter) query = query.eq('status', statusFilter);
  const { data, error } = await query.limit(100);
  if (error) {
    console.error('[admin-apps] load failed', error);
    return [];
  }
  return (data ?? []) as ClubApplication[];
}

async function updateApplicationStatus(
  id: string,
  newStatus: ApplicationStatus,
  reviewNote: string,
  reviewerId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('club_applications')
    .update({
      status: newStatus,
      review_note: reviewNote || null,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setupAdminApplications(): Promise<void> {
  const root = document.getElementById('admin-apps-root');
  if (!root) return;

  const loadingEl = document.getElementById('admin-apps-loading');
  const filtersEl = document.getElementById('admin-apps-filters');
  const listEl = document.getElementById('admin-apps-list');
  const emptyEl = document.getElementById('admin-apps-empty');
  if (!loadingEl || !filtersEl || !listEl || !emptyEl) return;

  const { user } = await requireSuperAdmin();
  if (!user) return;

  let currentStatus = 'pending';

  async function refresh() {
    loadingEl.hidden = false;
    listEl.hidden = true;
    emptyEl.hidden = true;

    const apps = await loadApplications(currentStatus);
    loadingEl.hidden = true;

    if (apps.length === 0) {
      emptyEl.hidden = false;
      return;
    }

    listEl.innerHTML = apps.map(renderAdminAppCard).join('');
    listEl.hidden = false;
  }

  filtersEl.hidden = false;
  (document.getElementById('admin-apps-status') as HTMLSelectElement).addEventListener('change', (e) => {
    currentStatus = (e.target as HTMLSelectElement).value;
    refresh();
  });

  listEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('[data-action]') as HTMLButtonElement | null;
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    if (!action || !id) return;

    const noteEl = document.querySelector(`textarea[data-note="${id}"]`) as HTMLTextAreaElement | null;
    const note = noteEl?.value.trim() ?? '';

    const newStatus: ApplicationStatus = action === 'approve' ? 'approved' : 'rejected';

    if (action === 'reject' && !note) {
      if (!window.confirm('Отклонить без комментария? Заявителю будет полезно знать причину.')) return;
    }

    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = 'Сохраняем…';

    const result = await updateApplicationStatus(id, newStatus, note, user.id);
    if (!result.ok) {
      btn.disabled = false;
      btn.textContent = oldText;
      alert(`Ошибка: ${result.error}`);
      return;
    }

    // Fire notification
    const card = btn.closest('[data-app-id]') as HTMLElement;
    const cardEmail = card.querySelector('.admin-app-card__contact')?.textContent?.match(/[\w.-]+@[\w.-]+/)?.[0] ?? '';

    if (newStatus === 'approved') {
      await notify({ type: 'application_approved', applicationId: id, applicantEmail: cardEmail });
      alert(`Одобрено!\n\nЧто делать дальше:\n1. Добавь клуб в src/data/clubs.ts (slug, name, address, и т.д.)\n2. Сделай commit + deploy\n3. Открой /admin/owners/ и привяжи email "${cardEmail}" к новому slug`);
    } else {
      await notify({ type: 'application_rejected', applicationId: id, applicantEmail: cardEmail, reason: note });
    }

    refresh();
  });

  await refresh();
}
```

- [ ] **Step 3: Wire into init.ts**

Открой `src/scripts/init.ts`:

```ts
import { setupAdminApplications } from './admin-applications';
```

```ts
if (document.getElementById('admin-apps-root')) {
  setupAdminApplications();
}
```

- [ ] **Step 4: Add CSS for admin app cards**

В `src/styles/global.css`:

```css
/* Admin application cards */
.admin-apps-filters {
  margin-bottom: 24px;
  display: flex;
  gap: 16px;
}

.admin-apps-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.admin-app-card {
  background: var(--glass-bg, rgba(255,255,255,0.03));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  border-radius: 16px;
  padding: 24px;
}

.admin-app-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.admin-app-card__title {
  margin: 0 0 6px;
  font-size: 22px;
}

.admin-app-card__contact {
  color: var(--text-secondary);
  font-size: 14px;
}

.admin-app-card__body {
  margin: 16px 0;
}

.admin-app-card__body .info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.admin-app-card__footer {
  display: flex;
  gap: 24px;
  color: var(--text-muted);
  font-size: 13px;
  flex-wrap: wrap;
  margin-top: 16px;
}

.admin-app-card__actions {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--glass-border, rgba(255,255,255,0.08));
}
```

- [ ] **Step 5: Build and smoke test**

```bash
npm run build && npm run dev
```

1. Как super-admin открой http://localhost:4321/admin/applications/
2. Должна показаться pending заявка из Task 13
3. Введи комментарий "тест" в textarea
4. Нажми "Одобрить" → confirm → должно показать alert с инструкцией + статус заявки изменится на "Одобрена"
5. Переключи фильтр на "Одобренные" → должна показаться твоя заявка с комментарием

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/applications.astro src/scripts/admin-applications.ts src/scripts/init.ts src/styles/global.css
git commit -m "feat(pages): add /admin/applications/ review queue

Lists pending applications by default (filter for approved/rejected).
Each card shows full details + textarea for review_note + Approve/
Reject buttons. After approval, shows alert with next steps:
add club to clubs.ts then bind email via /admin/owners/."
```

---

## Task 20: Create /admin/owners page

**Files:**
- Create: `src/pages/admin/owners.astro`
- Create: `src/scripts/admin-owners.ts`
- Modify: `src/scripts/init.ts`

**Goal:** Список 12 статических клубов из clubs.ts. Для каждого — поле "Привязать email" + текущие владельцы (из club_admins). При вводе email → найти user'а по auth.users → INSERT в club_admins.

⚠️ **Важно:** клиент не может напрямую запросить `auth.users` (RLS блокирует). Решение для MVP: добавляем view `public.user_lookup` в миграции 0007, которая возвращает только `id, email` для super-admin. ИЛИ суперадмин узнаёт UID вручную и вставляет через UI (вводит UID, не email). Я выберу второй вариант для MVP — меньше DB-изменений. UI попросит UID; найти UID можно в Supabase Dashboard или в /admin/users/ (Task 22).

- [ ] **Step 1: Create page**

Создай `src/pages/admin/owners.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import DashboardNav from '../../components/DashboardNav.astro';
import { CLUBS } from '../../data/clubs';
import { CITY_LABELS } from '../../data/cities';
---

<BaseLayout title="Владельцы — Админка — respawn.kz">
  <section class="dashboard-page" id="admin-owners-root">
    <div class="container">
      <header class="dashboard-page__header">
        <h1 class="dashboard-page__title">Владельцы клубов</h1>
        <p class="dashboard-page__subtitle">
          Привязка user_id (UUID из auth.users) к слугу клуба. Найти UID можно
          в <a href="/admin/users/">Пользователях</a> или в Supabase Dashboard.
        </p>
      </header>

      <DashboardNav variant="admin" active="/admin/owners/" />

      <div class="dashboard-loading" id="owners-loading">
        <p style="text-align:center;color:var(--text-muted)">Загружаем…</p>
      </div>

      <div class="owners-list" id="owners-list" hidden>
        {CLUBS.map((club) => (
          <article class="owner-card" data-club-slug={club.slug}>
            <div class="owner-card__header">
              <div>
                <h3 class="owner-card__title">{club.name}</h3>
                <div class="owner-card__meta">{CITY_LABELS[club.city] ?? club.city} · {club.address}</div>
              </div>
              <code class="owner-card__slug">{club.slug}</code>
            </div>

            <div class="owner-card__current" data-current-for={club.slug}>
              <span style="color:var(--text-muted)">Загружаем владельцев…</span>
            </div>

            <div class="owner-card__form">
              <input 
                type="text" 
                class="auth-input" 
                data-uid-input={club.slug} 
                placeholder="UUID пользователя из auth.users" 
                style="font-family:var(--font-mono,monospace);font-size:13px"
              />
              <button type="button" class="btn btn--primary btn--sm" data-grant={club.slug}>
                Привязать
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 2: Create admin-owners.ts**

Создай `src/scripts/admin-owners.ts`:

```ts
import { supabase } from '../lib/supabase';
import { requireSuperAdmin } from '../lib/route-guards';
import { type ClubAdmin } from '../data/supabase-types';

interface OwnerRow extends ClubAdmin {
  email?: string;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

async function loadAllAdmins(): Promise<ClubAdmin[]> {
  const { data, error } = await supabase.from('club_admins').select('*');
  if (error) {
    console.error('[admin-owners] load failed', error);
    return [];
  }
  return (data ?? []) as ClubAdmin[];
}

async function grantOwnership(userId: string, clubSlug: string, grantedBy: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('club_admins').insert({
    user_id: userId,
    club_slug: clubSlug,
    granted_by: grantedBy,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function revokeOwnership(rowId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('club_admins').delete().eq('id', rowId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function renderCurrent(admins: ClubAdmin[]): string {
  if (admins.length === 0) {
    return '<span style="color:var(--text-muted)">Нет привязанных владельцев</span>';
  }
  return `
    <ul class="owner-card__list">
      ${admins.map((a) => `
        <li>
          <code style="font-size:12px">${a.user_id}</code>
          <button type="button" class="btn btn--ghost btn--sm" data-revoke="${a.id}">Отвязать</button>
        </li>
      `).join('')}
    </ul>
  `;
}

export async function setupAdminOwners(): Promise<void> {
  const root = document.getElementById('admin-owners-root');
  if (!root) return;

  const loadingEl = document.getElementById('owners-loading');
  const listEl = document.getElementById('owners-list');
  if (!loadingEl || !listEl) return;

  const { user } = await requireSuperAdmin();
  if (!user) return;

  async function refresh() {
    const admins = await loadAllAdmins();
    const bySlug = new Map<string, ClubAdmin[]>();
    admins.forEach((a) => {
      const arr = bySlug.get(a.club_slug) ?? [];
      arr.push(a);
      bySlug.set(a.club_slug, arr);
    });

    document.querySelectorAll<HTMLElement>('[data-current-for]').forEach((el) => {
      const slug = el.getAttribute('data-current-for')!;
      el.innerHTML = renderCurrent(bySlug.get(slug) ?? []);
    });
  }

  await refresh();
  loadingEl.hidden = true;
  listEl.hidden = false;

  // Grant button handler
  listEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    const grantBtn = target.closest('[data-grant]') as HTMLButtonElement | null;
    if (grantBtn) {
      const slug = grantBtn.getAttribute('data-grant')!;
      const input = document.querySelector(`[data-uid-input="${slug}"]`) as HTMLInputElement;
      const uid = input.value.trim();
      if (!isUuid(uid)) {
        alert('Введи валидный UUID (формат: 8-4-4-4-12 hex)');
        return;
      }
      grantBtn.disabled = true;
      grantBtn.textContent = 'Сохраняем…';
      const result = await grantOwnership(uid, slug, user.id);
      if (!result.ok) {
        alert(`Ошибка: ${result.error}`);
        grantBtn.disabled = false;
        grantBtn.textContent = 'Привязать';
        return;
      }
      input.value = '';
      grantBtn.disabled = false;
      grantBtn.textContent = 'Привязать';
      await refresh();
      return;
    }

    const revokeBtn = target.closest('[data-revoke]') as HTMLButtonElement | null;
    if (revokeBtn) {
      const id = revokeBtn.getAttribute('data-revoke')!;
      if (!window.confirm('Отвязать этого владельца?')) return;
      revokeBtn.disabled = true;
      revokeBtn.textContent = '…';
      const result = await revokeOwnership(id);
      if (!result.ok) {
        alert(`Ошибка: ${result.error}`);
        revokeBtn.disabled = false;
        revokeBtn.textContent = 'Отвязать';
        return;
      }
      await refresh();
    }
  });
}
```

- [ ] **Step 3: Wire into init.ts**

```ts
import { setupAdminOwners } from './admin-owners';
```

```ts
if (document.getElementById('admin-owners-root')) {
  setupAdminOwners();
}
```

- [ ] **Step 4: Add CSS for owner cards**

В `src/styles/global.css`:

```css
/* Admin owners */
.owners-list {
  display: grid;
  gap: 16px;
}

.owner-card {
  background: var(--glass-bg, rgba(255,255,255,0.03));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  border-radius: 16px;
  padding: 20px;
}

.owner-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;
}

.owner-card__title {
  margin: 0 0 4px;
  font-size: 18px;
}

.owner-card__meta {
  color: var(--text-secondary);
  font-size: 13px;
}

.owner-card__slug {
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.3);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--c-violet-400, #a78bfa);
}

.owner-card__current {
  margin: 12px 0;
  font-size: 14px;
}

.owner-card__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.owner-card__list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 8px;
  background: rgba(255,255,255,0.02);
  border-radius: 8px;
}

.owner-card__form {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.owner-card__form input {
  flex: 1;
  min-width: 280px;
}
```

- [ ] **Step 5: Build and smoke test**

```bash
npm run build && npm run dev
```

1. Открой http://localhost:4321/admin/owners/
2. Должны показаться все 12 клубов с slug справа в коде
3. Возьми свой UID (из Task 1 seed) и привяжи к "cyberzone": введи UUID, нажми "Привязать"
4. Должен появиться в "Текущие владельцы" с кнопкой "Отвязать"
5. Открой http://localhost:4321/dashboard/ — теперь "Всего клубов" должно быть 1
6. Открой http://localhost:4321/dashboard/bookings/ — увидишь брони cyberzone
7. Отвяжи себя обратно (если не хочешь быть owner'ом cyberzone постоянно)

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/owners.astro src/scripts/admin-owners.ts src/scripts/init.ts src/styles/global.css
git commit -m "feat(pages): add /admin/owners/ for binding users to clubs

Lists all 12 static clubs from clubs.ts. Each card shows current
admins (with revoke buttons) and a UUID input + grant button.
UUID validation via regex; if invalid format, shows alert."
```

---

## Task 21: Create /admin/users page

**Files:**
- Create: `src/pages/admin/users.astro`
- Create: `src/scripts/admin-users.ts`
- Modify: `src/scripts/init.ts`

**Goal:** Поиск пользователей по email или UID + просмотр их ролей (super_admin? клубы где admin?). Помогает суперадмину найти UID для /admin/owners/.

⚠️ **Технический ограничитель:** клиент не может запросить `auth.users` напрямую. Для MVP делаем reverse lookup через `club_applications.applicant_email/applicant_user_id` (если user когда-то подал заявку, email→uid известен). Иначе суперадмин копирует UID из Supabase Dashboard вручную.

- [ ] **Step 1: Create page**

Создай `src/pages/admin/users.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import DashboardNav from '../../components/DashboardNav.astro';
---

<BaseLayout title="Пользователи — Админка — respawn.kz">
  <section class="dashboard-page" id="admin-users-root">
    <div class="container">
      <header class="dashboard-page__header">
        <h1 class="dashboard-page__title">Пользователи</h1>
        <p class="dashboard-page__subtitle">
          Поиск по email (через таблицу club_applications) или прямой ввод UUID.
          Для пользователей, которые никогда не подавали заявку, UID нужно взять в Supabase Dashboard
          (Authentication → Users → нажми на user → скопируй ID).
        </p>
      </header>

      <DashboardNav variant="admin" active="/admin/users/" />

      <div class="users-search">
        <input 
          type="text" 
          id="users-query" 
          class="auth-input" 
          placeholder="Email или UUID" 
          autocomplete="off"
        />
        <button type="button" class="btn btn--primary" id="users-search-btn">Найти</button>
      </div>

      <div id="users-result" class="users-result"></div>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 2: Create admin-users.ts**

Создай `src/scripts/admin-users.ts`:

```ts
import { supabase } from '../lib/supabase';
import { requireSuperAdmin } from '../lib/route-guards';
import { type ClubAdmin, type ClubApplication } from '../data/supabase-types';

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

interface UserSearchResult {
  user_id: string;
  email: string | null;
  applications: ClubApplication[];
  clubAdmin: ClubAdmin[];
  isSuperAdmin: boolean;
}

async function lookupByEmail(email: string): Promise<UserSearchResult | null> {
  // Find via club_applications (only known source of email→uid mapping client-side)
  const { data: apps } = await supabase
    .from('club_applications')
    .select('*')
    .eq('applicant_email', email);
  
  if (!apps || apps.length === 0) {
    return null;
  }

  const userId = (apps[0] as ClubApplication).applicant_user_id;
  if (!userId) return null;

  return enrichUserData(userId, email);
}

async function lookupByUid(uid: string): Promise<UserSearchResult | null> {
  // Try to find email via club_applications
  const { data: apps } = await supabase
    .from('club_applications')
    .select('*')
    .eq('applicant_user_id', uid);
  
  const email = apps && apps.length > 0 ? (apps[0] as ClubApplication).applicant_email : null;
  return enrichUserData(uid, email);
}

async function enrichUserData(userId: string, email: string | null): Promise<UserSearchResult> {
  const [{ data: apps }, { data: admins }, { data: superRow }] = await Promise.all([
    supabase.from('club_applications').select('*').eq('applicant_user_id', userId),
    supabase.from('club_admins').select('*').eq('user_id', userId),
    supabase.from('super_admins').select('user_id').eq('user_id', userId).maybeSingle(),
  ]);

  return {
    user_id: userId,
    email,
    applications: (apps ?? []) as ClubApplication[],
    clubAdmin: (admins ?? []) as ClubAdmin[],
    isSuperAdmin: !!superRow,
  };
}

function renderResult(r: UserSearchResult): string {
  return `
    <article class="user-result-card">
      <div class="user-result-card__header">
        <h3>Пользователь</h3>
        ${r.isSuperAdmin ? '<span class="pill pill--admin">Super Admin</span>' : ''}
      </div>
      <div class="info-grid">
        <div><div class="info-label">UID</div><div class="info-value"><code style="font-size:12px">${r.user_id}</code></div></div>
        <div><div class="info-label">Email</div><div class="info-value">${r.email ?? '<span style="color:var(--text-muted)">не известен</span>'}</div></div>
      </div>

      <h4 style="margin-top:24px">Владелец клубов (${r.clubAdmin.length})</h4>
      ${r.clubAdmin.length === 0 ? '<p style="color:var(--text-muted)">Нет привязок</p>' : `
        <ul class="user-result-card__list">
          ${r.clubAdmin.map((a) => `<li><code>${a.club_slug}</code> (с ${new Date(a.created_at).toLocaleDateString('ru-RU')})</li>`).join('')}
        </ul>
      `}

      <h4 style="margin-top:24px">Заявки (${r.applications.length})</h4>
      ${r.applications.length === 0 ? '<p style="color:var(--text-muted)">Нет заявок</p>' : `
        <ul class="user-result-card__list">
          ${r.applications.map((a) => `<li>${a.club_name} — <span class="pill pill--${a.status}">${a.status}</span></li>`).join('')}
        </ul>
      `}

      <div style="margin-top:16px">
        <button type="button" class="btn btn--ghost btn--sm" data-copy-uid="${r.user_id}">Скопировать UID</button>
        <a href="/admin/owners/" class="btn btn--ghost btn--sm">→ Owners</a>
      </div>
    </article>
  `;
}

export async function setupAdminUsers(): Promise<void> {
  const root = document.getElementById('admin-users-root');
  if (!root) return;

  await requireSuperAdmin();

  const queryEl = document.getElementById('users-query') as HTMLInputElement;
  const searchBtn = document.getElementById('users-search-btn') as HTMLButtonElement;
  const resultEl = document.getElementById('users-result')!;

  async function doSearch() {
    const q = queryEl.value.trim();
    if (!q) {
      resultEl.innerHTML = '';
      return;
    }

    resultEl.innerHTML = '<p style="color:var(--text-muted)">Ищем…</p>';

    let result: UserSearchResult | null = null;
    if (isUuid(q)) {
      result = await lookupByUid(q);
    } else if (isEmail(q)) {
      result = await lookupByEmail(q.toLowerCase());
    } else {
      resultEl.innerHTML = '<p style="color:rgb(248, 113, 113)">Введи email или UUID</p>';
      return;
    }

    if (!result) {
      resultEl.innerHTML = `
        <p style="color:var(--text-muted)">
          Пользователь не найден через таблицу заявок. Если ты уверен что он существует — 
          возьми UID в Supabase Dashboard (Authentication → Users) и введи здесь напрямую.
        </p>
      `;
      return;
    }

    resultEl.innerHTML = renderResult(result);
  }

  searchBtn.addEventListener('click', doSearch);
  queryEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  // Copy UID button (event delegation)
  resultEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('[data-copy-uid]') as HTMLButtonElement | null;
    if (!btn) return;
    const uid = btn.getAttribute('data-copy-uid')!;
    try {
      await navigator.clipboard.writeText(uid);
      const oldText = btn.textContent;
      btn.textContent = 'Скопировано!';
      setTimeout(() => { btn.textContent = oldText; }, 1500);
    } catch {
      alert(`UID: ${uid}`);
    }
  });
}
```

- [ ] **Step 3: Wire into init.ts**

```ts
import { setupAdminUsers } from './admin-users';
```

```ts
if (document.getElementById('admin-users-root')) {
  setupAdminUsers();
}
```

- [ ] **Step 4: Add CSS**

В `src/styles/global.css`:

```css
/* Admin users */
.users-search {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  max-width: 600px;
}

.users-search input {
  flex: 1;
}

.users-result {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.user-result-card {
  background: var(--glass-bg, rgba(255,255,255,0.03));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  border-radius: 16px;
  padding: 24px;
  max-width: 700px;
}

.user-result-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.user-result-card__header h3 {
  margin: 0;
  font-size: 20px;
}

.user-result-card__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.user-result-card__list li {
  padding: 8px 12px;
  background: rgba(255,255,255,0.02);
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.pill--admin {
  background: rgba(236, 72, 153, 0.15);
  color: rgb(244, 114, 182);
  border: 1px solid rgba(236, 72, 153, 0.3);
}
```

- [ ] **Step 5: Build and smoke test**

```bash
npm run build && npm run dev
```

1. Открой http://localhost:4321/admin/users/
2. Введи свой email → должна показаться карточка с UID, ролью super_admin (если применимо), любыми заявками и привязками
3. Скопируй UID
4. Введи случайный email/UUID, которого нет → должно показать "Пользователь не найден"

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/users.astro src/scripts/admin-users.ts src/scripts/init.ts src/styles/global.css
git commit -m "feat(pages): add /admin/users/ for searching and viewing user roles

Search by email (via club_applications email→uid mapping) or by UUID
directly. Shows applications, club_admin bindings, super_admin status,
with one-click UID copy for use in /admin/owners/."
```

---

## Task 22: Hook booking_created notification in booking-real.ts

**Files:**
- Modify: `src/scripts/booking-real.ts`

**Goal:** После INSERT новой брони в booking-real.ts вызывать notify() с типом booking_created, передав email'ы admin'ов клуба (из club_admins).

- [ ] **Step 1: Edit booking-real.ts**

Открой `src/scripts/booking-real.ts`. В начало добавь импорт:

```ts
import { notify } from '../lib/notifications';
```

Найди функцию `submitBooking`:

```ts
async function submitBooking(data: NewBooking): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('bookings').insert(data);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
```

Замени на:

```ts
async function submitBooking(data: NewBooking): Promise<{ ok: boolean; bookingId?: string; error?: string }> {
  const { data: inserted, error } = await supabase
    .from('bookings')
    .insert(data)
    .select('id')
    .single();
  if (error || !inserted) return { ok: false, error: error?.message ?? 'unknown error' };
  return { ok: true, bookingId: inserted.id };
}
```

Найди в `form.addEventListener('submit', ...)` где обрабатывается результат:

```ts
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
```

После строки `if (!result.ok) { ... return; }` и ПЕРЕД `const body = document.getElementById('modal-body');` добавь:

```ts
// Fire booking_created notification to club admins
if (result.bookingId) {
  const { data: admins } = await supabase
    .from('club_admins')
    .select('user_id')
    .eq('club_slug', club.slug);
  // We can't resolve user_id → email client-side; pass placeholders
  const ownerEmails = (admins ?? []).map((a: { user_id: string }) => `user-${a.user_id.slice(0, 8)}@unknown`);
  await notify({
    type: 'booking_created',
    bookingId: result.bookingId,
    clubSlug: club.slug,
    ownerEmails,
  });
}
```

- [ ] **Step 2: Verify TS compiles**

```bash
npm run build
```

Ожидание: успешно.

- [ ] **Step 3: Smoke test**

```bash
npm run dev
```

1. Залогинься как обычный user
2. Создай бронь на cyberzone через UI
3. Открой консоль браузера — должна быть строка `[notify] booking_created {...}`

- [ ] **Step 4: Commit**

```bash
git add src/scripts/booking-real.ts
git commit -m "feat(booking): fire booking_created notification after insert

Looks up club_admins for the booked club_slug and passes their
(placeholder) emails to notify(). When Resend is wired, Edge Function
will resolve real emails server-side."
```

---

## Task 23: Update /me/ page to handle extended booking statuses

**Files:**
- Modify: `src/scripts/me-page.ts`

**Goal:** `/me/` показывает брони с новыми статусами (completed, no_show), правильно прячет кнопку "Отменить" если статус terminal или дата прошла.

- [ ] **Step 1: Edit me-page.ts**

Открой `src/scripts/me-page.ts`. Найди:

```ts
import { type Booking, STATUS_LABELS } from '../data/supabase-types';
```

Замени на:

```ts
import { type Booking, STATUS_LABELS, STATUS_COLORS, isTerminalStatus } from '../data/supabase-types';
```

Найди функцию `renderBookingCard`. Замени её на:

```ts
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
```

Найди обработчик cancel в `listEl.addEventListener('click', async (e) => { ... })`. После строки 
```ts
statusEl.className = 'pill pill--cancelled';
statusEl.textContent = STATUS_LABELS.cancelled;
btn.remove();
```

Никаких изменений тут не нужно — старый код всё ещё работает потому что pill--cancelled остался в STATUS_COLORS.

- [ ] **Step 2: Build and smoke test**

```bash
npm run build && npm run dev
```

1. Открой /me/ как обычный user с бронями
2. Брони со статусом completed или no_show должны показывать соответствующий pill и НЕ должны иметь кнопку "Отменить"
3. Брони на прошлые даты тоже не должны иметь кнопку "Отменить"
4. Брони на будущие даты со статусом pending/confirmed — кнопка должна быть

- [ ] **Step 3: Commit**

```bash
git add src/scripts/me-page.ts
git commit -m "fix(me): hide cancel button for terminal or past bookings

Uses isTerminalStatus() and date comparison to gate the cancel button.
Customer-side mirror of the trigger logic in migration 0006."
```

---

## Task 24: End-to-end smoke test scenarios + deploy

**Files:** (none modified — just verification)

**Goal:** Полный E2E прогон всех сценариев на dev + опциональный деплой на прод.

- [ ] **Step 1: Reset Supabase test data (if needed)**

Если в БД накопились тестовые данные от предыдущих шагов:

```sql
-- Очисти тестовые брони (НЕ ТРОГАЙ настоящие)
delete from bookings where club_slug = 'test-club';
-- Опционально очисти все привязки кроме твоего super_admin'a
delete from club_admins where user_id != '<твой-uid>';
```

- [ ] **Step 2: Scenario 1 — application flow**

1. Залогинься как **новый пользователь** (другой email)
2. Открой /dashboard/register/
3. Заполни форму на регистрацию "TestClub" в Алматы
4. Submit → success
5. Открой /dashboard/applications/ → видишь заявку с pending
6. Логаут

7. Залогинься как super-admin
8. Открой /admin/applications/ → видишь заявку
9. Введи комментарий "Хорошая заявка, добавляем"
10. Нажми "Одобрить" → alert с инструкциями
11. Переключи фильтр на "Одобренные" → видишь заявку с твоим комментарием

12. Логаут, залогинься как заявитель
13. Открой /dashboard/applications/ → статус "Одобрена" + твой комментарий модератора

✅ **Прошло, если:** заявка прошла полный путь, заявитель видит комментарий

- [ ] **Step 3: Scenario 2 — owner mapping + booking management**

1. Залогинься как super-admin
2. Открой /admin/users/, введи email обычного user'а (которого назначаешь owner'ом)
3. Скопируй его UID (или возьми любой UID из Supabase Dashboard если этот user не подавал заявку)
4. Открой /admin/owners/, найди клуб (например cyberzone), вставь UID, "Привязать"
5. UID появляется в "Текущие владельцы"

6. Логаут, залогинься как этот пользователь (нужен другой браузер или incognito)
7. В header должна появиться ссылка "Кабинет"
8. Открой /dashboard/ → должны показаться stats (возможно 0/0/1)
9. Открой /dashboard/bookings/ → пусто (или существующие брони cyberzone)

10. Залогинься как ТРЕТИЙ пользователь (customer)
11. Открой /clubs/cyberzone/, нажми "Забронировать слот"
12. Заполни форму, submit → success modal
13. В консоли — `[notify] booking_created`

14. Логаут, залогинься как owner cyberzone
15. Открой /dashboard/bookings/ → видишь новую бронь с pending
16. Нажми "Подтвердить" → confirm → статус меняется на "Подтверждена"
17. Появляются кнопки "Завершить" / "Не пришёл" / "Отменить"
18. Нажми "Завершить" → confirm → статус "Завершена", кнопок больше нет

19. Логаут, залогинься как customer
20. Открой /me/ → бронь со статусом "Завершена" без кнопки "Отменить"

✅ **Прошло, если:** state machine работает корректно, RLS не пускает customer'а менять чужие брони, кнопки появляются/исчезают по правилам

- [ ] **Step 4: Scenario 3 — RLS edge cases**

1. Как обычный user (не admin, не super-admin) попробуй открыть:
   - /dashboard/ → redirect на /dashboard/register/
   - /dashboard/bookings/ → redirect на /dashboard/register/
   - /admin/ → redirect на /
   - /admin/applications/ → redirect на /
   - /admin/owners/ → redirect на /

2. Как club_admin (но не super-admin):
   - /admin/ → redirect на /
   - /dashboard/ → работает, видишь только свои клубы
   - В SQL editor (через supabase service_role) проверь что подзапрос вернёт пустой набор:
   ```sql
   set role authenticated;
   set request.jwt.claims to '{"sub":"<uid-of-club-admin>"}';
   select * from club_applications where status = 'pending'; -- должно вернуть [] если не applicant
   reset role;
   ```

3. Как customer пытайся отменить бронь от прошлой даты — должно вернуть ошибку RLS/trigger

✅ **Прошло, если:** все redirect'ы работают, RLS блокирует чужие данные

- [ ] **Step 5: Production deploy**

Если все сценарии прошли локально:

1. Применить миграции 0002-0006 на проде (Supabase SQL editor) — если не сделано
2. Засеять super_admin на проде (Task 1, Step 3)
3. Build + deploy:

```bash
npm run deploy
```

Это запустит `npm run build && wrangler pages deploy dist --project-name respawn-kz --branch main --commit-dirty=true`.

4. Открой https://respawn.kz/dashboard/register/ — должно работать
5. Smoke test тех же сценариев на проде с тестовыми пользователями

- [ ] **Step 6: Final commit (если были правки)**

Если по результатам E2E ты что-то правил:

```bash
git add -A
git commit -m "fix: address issues found in E2E smoke testing"
```

Если ничего не правил — просто финальный push:

```bash
git push origin main
```

---

## Self-Review Checklist (для имплементера)

После всех 24 tasks убедись:

- [ ] Все 5 миграций (0002-0006) применены в Supabase и видны в `pg_tables` / `pg_policies` / `information_schema.triggers`
- [ ] Первый super-admin засеян (можно проверить: `select * from super_admins`)
- [ ] `npx astro check` показывает 0 errors
- [ ] `npm run build` проходит без warnings
- [ ] Header показывает "Кабинет" / "Админка" правильно для каждой роли
- [ ] Все 8 новых страниц рендерятся:
  - /dashboard/, /dashboard/register/, /dashboard/bookings/, /dashboard/applications/
  - /admin/, /admin/applications/, /admin/owners/, /admin/users/
- [ ] Notification stub логирует events во всех call sites:
  - INSERT application → `application_submitted`
  - UPDATE application status → `application_approved` / `application_rejected`
  - INSERT booking → `booking_created`
  - UPDATE booking status → `booking_confirmed` / `booking_cancelled` / `booking_completed` / `booking_no_show`
- [ ] /me/ не сломан, существующие пользовательские брони видны и cancel работает по правилам
- [ ] /clubs/* и существующие страницы не изменены и работают

---

## Notes for Future Specs (clubs-in-DB, slot validation)

При имплементации следующих spec'ов учти что в этом мы:
- Используем `club_slug` как natural key (text). Когда добавим `clubs` table — `clubs.slug UNIQUE` останется, foreign keys из `club_admins` и `bookings` будут ссылаться на slug или на новый clubs.id.
- Размещаем все client-side notification triggers в одной функции `notify()` — Resend-интеграция должна попасть только внутрь этой функции.
- Имеем audit-поля `status_changed_at` / `status_changed_by` в `bookings` — слот-валидация может тоже использовать audit pattern.
- Имеем role helper `getRoles()` с sessionStorage кешем — slot-валидация может использовать ту же инфраструктуру для определения админа.
