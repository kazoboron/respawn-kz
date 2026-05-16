# respawn.kz — B2B Club Admin Cabinet (Spec 1 of Block 1)

**Status:** Draft, awaiting user review
**Date:** 2026-05-16
**Author:** Claude (with kazoboron)
**Approach:** B — Full lifecycle MVP (~8-10 days)

## Context

`respawn.kz` сейчас работает на полностью статическом каталоге из 12 клубов (`src/data/clubs.ts`),
с реальным Supabase-бэкендом для аутентификации и бронирования. У реальных владельцев клубов
нет способа зарегистрировать свой клуб или управлять входящими бронями.

Это первый из трёх sub-проектов "Блока 1" из roadmap'a:
1. **B2B Club Admin Cabinet (этот spec)** — даёт клубам интерфейс для регистрации и
   управления бронями
2. **Clubs in Supabase DB** — переносит 12 статических клубов в БД, разблокирует редактирование
3. **Slot validation + booking lifecycle automation** — production-grade правила бронирования

Этот spec намеренно ограничен: клубы остаются статическими, фото-аплоад через Storage не
делаем, реальных email'ов не шлём. Цель — минимальный полный ops-инструмент, который можно
дать первым real B2B-партнёрам.

## Goals

1. Любой посетитель сайта может подать заявку на регистрацию клуба
2. Super-admin (я) видит очередь заявок и одобряет/отклоняет
3. Super-admin может вручную привязать любого user'а (по email) к любому из 12 существующих
   клубов в роли admin'а
4. Club admin видит входящие брони своих клубов и управляет их lifecycle
5. Customer'ы видят актуальный статус своих броней в `/me/`
6. Существующий booking flow продолжает работать без регрессий

## Non-Goals (out of scope для этого spec'a)

- Редактирование инфо клуба (часы, цены, описание) — clubs-in-DB spec
- Загрузка фото через Supabase Storage — clubs-in-DB или отдельно
- Реальные email-уведомления через Resend — отдельно, когда нужно (есть stub-функция как hook)
- Slot validation (overlap-check, working_hours check) — следующий spec
- Авто-перевод confirmed→completed через cron — отдельно
- Аналитика для клубов (выручка, конверсия, графики) — отдельно
- Telegram-бот — отдельно
- Multi-language UI — отдельно
- Платёжная интеграция (Kaspi) — отдельно
- Self-claim form для существующих клубов — Flow B решает через manual handling super-admin'ом

## Architecture

### Database Schema

Пять новых миграций: 3 для новых таблиц + 1 для расширения `bookings` (статусы и
audit-поля) + 1 для status-transition trigger'a.

#### `supabase/migrations/0002_super_admins.sql`

```sql
create table public.super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz default now(),
  added_by uuid references auth.users(id)
);

alter table public.super_admins enable row level security;

create policy "super_admins read by super_admins" on public.super_admins
  for select using (auth.uid() in (select user_id from public.super_admins));
```

**Seed (вручную в Supabase Dashboard, один раз):**
```sql
insert into super_admins (user_id) 
values ('<my-auth-uid>');
```

**Решение chicken-and-egg:** первая строка засеивается через service_role (минуя RLS).
После seed обычные политики работают.

#### `supabase/migrations/0003_club_admins.sql`

```sql
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

create policy "club_admins read own" on public.club_admins
  for select using (
    auth.uid() = user_id 
    or auth.uid() in (select user_id from public.super_admins)
  );

create policy "super_admin manages club_admins" on public.club_admins
  for all using (auth.uid() in (select user_id from public.super_admins));
```

#### `supabase/migrations/0004_club_applications.sql`

```sql
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

create policy "anyone inserts own application" on public.club_applications
  for insert with check (auth.uid() = applicant_user_id);

create policy "applicant reads own" on public.club_applications
  for select using (
    auth.uid() = applicant_user_id
    or auth.uid() in (select user_id from public.super_admins)
  );

create policy "super_admin updates applications" on public.club_applications
  for update using (auth.uid() in (select user_id from public.super_admins));
```

#### `supabase/migrations/0005_bookings_status_expand.sql`

```sql
-- Расширяем lifecycle: добавляем completed и no_show
alter table public.bookings drop constraint bookings_status_check;
alter table public.bookings add constraint bookings_status_check 
  check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show'));

-- Audit поля: кто и когда менял статус
alter table public.bookings add column status_changed_at timestamptz default now();
alter table public.bookings add column status_changed_by uuid references auth.users(id);

-- Дополнительные RLS политики: club admin видит и меняет брони своего клуба
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

-- Super-admin полный доступ к бронированиям
create policy "super_admins read all bookings" on public.bookings
  for select using (auth.uid() in (select user_id from public.super_admins));

create policy "super_admins update all bookings" on public.bookings
  for update using (auth.uid() in (select user_id from public.super_admins));
```

#### `supabase/migrations/0006_bookings_status_trigger.sql`

```sql
create or replace function check_booking_status_transition()
returns trigger as $$
begin
  -- Terminal states immutable
  if OLD.status in ('cancelled', 'completed', 'no_show') 
     and NEW.status != OLD.status then
    raise exception 'Cannot change booking from terminal status %', OLD.status;
  end if;

  -- Customer (не admin) может только cancel свою бронь
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

  -- Customer не может cancel бронь после даты
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

  -- Audit stamp
  NEW.status_changed_at := now();
  NEW.status_changed_by := auth.uid();

  return NEW;
end;
$$ language plpgsql security definer;

create trigger bookings_status_transition_check
  before update of status on public.bookings
  for each row execute function check_booking_status_transition();
```

### Auth & Roles Model

Три эффективные роли, определяемые наличием строк в таблицах:

| Роль | Определение | Возможности |
|------|-------------|-------------|
| **Anonymous** | Нет сессии | Каталог, регистрация, логин |
| **User** | Залогинен, нет строк в `club_admins`/`super_admins` | + бронирование, заявка на регистрацию клуба, отмена своей брони |
| **Club admin** | Есть ≥1 строка в `club_admins` | + просмотр/управление бронями своих клубов |
| **Super admin** | Есть строка в `super_admins` | + ревью заявок, назначение овнеров |

**Multi-club support:** один user может быть club_admin'ом нескольких клубов (несколько строк
в `club_admins`). Dashboard показывает union бронирований всех клубов с фильтром.

**Helper-функция `src/lib/roles.ts`:**

```ts
import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';

export interface RoleSnapshot {
  user: User | null;
  isSuperAdmin: boolean;
  clubSlugs: string[];
}

export async function getRoles(): Promise<RoleSnapshot> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, isSuperAdmin: false, clubSlugs: [] };

  const [{ data: superRow }, { data: adminRows }] = await Promise.all([
    supabase.from('super_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('club_admins').select('club_slug').eq('user_id', user.id),
  ]);

  return {
    user,
    isSuperAdmin: !!superRow,
    clubSlugs: (adminRows ?? []).map(r => r.club_slug),
  };
}
```

**Кеширование:** в MVP — кешируем в `sessionStorage` на 60 секунд, чтобы избежать дублирующих
запросов на разных страницах. Inval при `signOut` и на `onAuthStateChange`.

### Route Protection

Каждая защищённая страница в Astro вставляет inline `<script>`:

```html
<script>
  import { getRoles } from '../lib/roles';
  const { user, isSuperAdmin, clubSlugs } = await getRoles();
  
  // Гейтинг (пример для /dashboard/)
  if (!user) {
    window.location.href = `/login/?return=${encodeURIComponent(location.pathname)}`;
  } else if (clubSlugs.length === 0 && !isSuperAdmin) {
    window.location.href = '/dashboard/register/';
  }
</script>
```

**Flash при загрузке** допустим в MVP (Astro SSG не имеет SSR-middleware без adapter'a).
Основная защита — RLS на DB. Клиентский gate — UX, не безопасность.

### RLS Edge Cases

1. **Club admin потерял доступ:** super-admin удаляет строку из `club_admins`. RLS сразу
   запрещает SELECT/UPDATE бронирований — кеш в браузере не помогает обойти.
2. **Customer отменяет confirmed бронь:** разрешено политикой "users update own bookings"
   из миграции 0001. Trigger 0006 проверяет дату.
3. **Super-admin = club_admin одновременно:** обе политики срабатывают (OR), работает.
4. **Orphaned application:** при `auth.users` DELETE, `applicant_user_id` становится NULL.
   Заявка остаётся в очереди.
5. **Дубликаты заявок от одного email:** не блокируем, super-admin видит обе.
6. **Гонка состояний (admin confirms + customer cancels):** Postgres row-level lock,
   последний выигрывает. OK для MVP.

## Pages & Flows

### Новые страницы (8)

**Для всех залогиненных:**
- `/dashboard/register/` — форма "подать заявку на регистрацию клуба"

**Для club_admin'ов (gated):**
- `/dashboard/` — главная: статистика дня + последние 10 броней
- `/dashboard/bookings/` — полный список с фильтрами (клуб, дата, статус) и действиями
- `/dashboard/applications/` — мои поданные заявки и их статус

**Для super_admin'ов (gated):**
- `/admin/` — главная: счётчик ожидающих заявок + статистика
- `/admin/applications/` — очередь заявок: approve/reject + review_note
- `/admin/owners/` — таблица 12 клубов из `clubs.ts`, кнопка "назначить email"
- `/admin/users/` — поиск по email, просмотр ролей пользователя

### Поля формы регистрации `/dashboard/register/`

| Поле | Required | UI |
|------|----------|-----|
| Имя контактного лица | ✅ | text input |
| Email | ✅ (autofill из auth) | email input, readonly |
| Телефон | ✅ | tel input, маска `+7 (xxx) xxx-xx-xx` |
| Название клуба | ✅ | text input |
| Город | ✅ | select из `cities.ts` |
| Район | ⬜ | text input |
| Адрес | ✅ | text input |
| Часы работы | ⬜ | text input, placeholder "10:00–02:00 или Круглосуточно" |
| Что есть (оборудование) | ⬜ | textarea, placeholder "Кол-во PC, тип, периферия..." |
| Фото (ссылка) | ⬜ | url input, placeholder "Google Drive / Imgur / Яндекс.Диск" |
| Краткое описание | ⬜ | textarea, max 500 символов |

После submit → toast "Заявка отправлена, статус увидишь в /dashboard/applications/"

### Главные user flows

#### Flow A: новый клуб регистрируется

1. Owner заходит на `/for-clubs/` → CTA "Зарегистрировать клуб"
2. Если не авторизован → `/login/` с `return_url=/dashboard/register/`
3. Заполняет форму → INSERT в `club_applications` (status=pending)
4. Видит свою заявку в `/dashboard/applications/` со статусом "Ожидает рассмотрения"
5. Super-admin рассматривает в `/admin/applications/`, нажимает Approve → status=approved
6. Super-admin вручную добавляет клуб в `src/data/clubs.ts`, коммитит, деплоится
   *(автоматизация — в clubs-in-DB spec)*
7. Super-admin идёт в `/admin/owners/`, привязывает email applicant'а к новому `club_slug`
8. Applicant логинится снова, видит `/dashboard/` с бронированиями своего клуба

#### Flow B: владелец существующего клуба заявляет себя

1. Owner Cyberzone'а заходит на `/for-clubs/` → "Зарегистрировать клуб"
2. Заполняет форму, в "название" пишет "Cyberzone"
3. Super-admin видит дубликат, в `/admin/owners/` напрямую привязывает его email
   к slug `cyberzone` (минуя approval — меняет статус заявки на rejected с note
   "Существующий клуб, привязан напрямую")

#### Flow C: club admin обрабатывает бронь

1. User бронирует Cyberzone → INSERT в `bookings` (status=pending)
2. Owner Cyberzone'а видит в `/dashboard/` карточку "Новая бронь: 2026-05-17 18:00, 2ч"
3. Кнопка [Подтвердить] → UPDATE status='confirmed' (trigger обновляет audit-поля)
4. User видит в `/me/` обновлённый статус
5. После прихода клиента — owner в `/dashboard/bookings/` ставит "Завершено"
6. Если не пришёл — "Не пришёл"

## Booking State Machine

```
                 ┌─── pending ───┐
                 │   (создаёт    │
                 │    customer)  │
                 │               │
        customer │               │ admin
        cancels  ↓               ↓ confirms
              cancelled      confirmed
              (terminal)         │
                 ▲    ┌──────────┼──────────┐
                 │    │          │          │
                 │ customer   admin     admin
                 │ cancels   completes  marks no-show
                 │    │          │          │
                 │    ↓          ↓          ↓
                 └─cancelled  completed  no_show
                              (terminal) (terminal)
```

**Transition rules** (enforced двумя слоями: UI + Postgres trigger):

| От | К | Кто может |
|----|---|-----------|
| pending | confirmed | club_admin, super_admin |
| pending | cancelled | customer (own), club_admin, super_admin |
| confirmed | cancelled | customer (own, до и включая день брони), club_admin, super_admin |
| confirmed | completed | club_admin, super_admin |
| confirmed | no_show | club_admin, super_admin |
| **любой terminal** | **любой** | **никто** (immutable, enforced trigger'ом) |

## Notification Stub

Stub-функция `src/lib/notifications.ts` — все notification call'ы проходят через неё.
Сейчас она просто логирует, в будущем подключим Resend без изменения call sites.

```ts
type NotifyEvent =
  | { type: 'application_submitted'; applicationId: string; applicantEmail: string }
  | { type: 'application_approved'; applicationId: string; applicantEmail: string }
  | { type: 'application_rejected'; applicationId: string; applicantEmail: string; reason: string }
  | { type: 'booking_created'; bookingId: string; clubSlug: string; ownerEmails: string[] }
  | { type: 'booking_confirmed'; bookingId: string; customerEmail: string }
  | { type: 'booking_cancelled'; bookingId: string; recipientEmails: string[] };

export async function notify(event: NotifyEvent): Promise<void> {
  console.info('[notify]', event.type, event);
  // Future: if (RESEND_API_KEY) await sendViaResend(event);
}
```

Call sites:
- После INSERT в `club_applications` → `application_submitted`
- После UPDATE статуса application → `application_approved` / `application_rejected`
- После INSERT в `bookings` → `booking_created` (с emails всех club_admins клуба)
- После UPDATE статуса booking → соответствующий event

## Acceptance Criteria

1. ✅ Любой залогиненный user может подать заявку через `/dashboard/register/`
2. ✅ Super-admin видит очередь заявок в `/admin/applications/`, одобряет/отклоняет
   с комментарием
3. ✅ Super-admin может назначить любого user'а (по email) admin'ом любого из 12 клубов
   из `clubs.ts` через `/admin/owners/`
4. ✅ Club admin видит брони только своих клубов (проверено через тестового user'а с одной
   привязкой)
5. ✅ Club admin может переводить брони: pending→confirmed, confirmed→completed/no_show/cancelled
6. ✅ Customer может отменить свою бронь до даты, не может — после (проверено через trigger)
7. ✅ Терминальные статусы (cancelled/completed/no_show) immutable (trigger выбрасывает
   exception)
8. ✅ Header показывает "Кабинет" club_admin'ам и "Админка" super-admin'ам
9. ✅ Защита роутов работает на двух уровнях: client-side gate + DB RLS
10. ✅ Старый booking-flow (`/me/`, бронирование, существующие брони) не сломан
11. ✅ Lighthouse score для `/dashboard/` и `/admin/applications/` ≥ 90

## Implementation Timeline (~8-10 рабочих дней)

| День | Задачи |
|------|--------|
| 1 | Миграции 0002-0006 + seed super-admin + smoke test через Supabase Studio |
| 2 | `src/lib/roles.ts` + Header адаптация + route gating template |
| 3 | `/dashboard/register/` форма + INSERT logic + redirect |
| 4-5 | `/dashboard/` + `/dashboard/bookings/` + UI state machine (кнопки + handlers) |
| 6 | `/dashboard/applications/` |
| 7-8 | `/admin/applications/` + `/admin/owners/` + `/admin/users/` |
| 9 | Notification stub + integration в call sites + E2E test |
| 10 | Polish, smoke tests на проде, deploy |

## Open Questions

Архитектурных открытых вопросов нет — все ключевые решения зафиксированы.

Implementation-time decisions (принимаем во время реализации, не блокируют утверждение spec'a):
- Точный UI-pattern для filter'ов в `/dashboard/bookings/` (chip-based vs select-based)
- Стилизация state machine кнопок (одна кнопка-меню vs веер кнопок)
- Pagination в `/dashboard/bookings/` (default page size, infinite scroll vs кнопка)
- Layout главной `/dashboard/` (карточки KPI vs таблица последних броней vs обе)

## Dependencies

- Supabase project уже настроен (`qfuhtvtietnldeqklxdo`)
- Существующие таблицы `auth.users` и `bookings` (миграция 0001)
- Существующий auth flow (magic link via `signInWithOtp`)
- `src/data/clubs.ts` остаётся источником истины для каталога

## Risks & Mitigations

| Риск | Митигация |
|------|-----------|
| Chicken-and-egg при seed первого super-admin | Документировано: seed через Supabase Dashboard SQL editor с service_role |
| Гонка между customer cancel и admin confirm | Postgres row-lock + UI идемпотентность |
| Flash при route gating | Skeleton state в pages, основная защита — RLS |
| Tech debt при clubs-in-DB миграции (club_admins ссылается на slug, который потом будет в clubs.id) | В clubs-in-DB spec'е делаем `clubs.slug UNIQUE`, держим slug как natural key, минимум переделок |
| RLS политика "super_admins read by super_admins" самоблокирует первый seed | Seed только через service_role, документировано |

## Migration Plan

Все 6 миграций deploy'ятся в одном PR:
1. `supabase db push` применяет миграции к remote DB
2. Seed первого super-admin через Supabase SQL editor
3. Deploy фронта через `wrangler pages deploy`
4. Smoke test основных flow'ов на проде

Откат: `supabase db reset` (только для dev). На проде — обратные миграции если нужно
(маловероятно, схема additive).
