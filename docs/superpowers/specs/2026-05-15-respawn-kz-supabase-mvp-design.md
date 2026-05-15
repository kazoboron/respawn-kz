# respawn.kz Backend MVP — Supabase + Auth + Bookings

**Дата:** 2026-05-15
**Тип:** Дизайн-спецификация Backend MVP (Уровень 3, под-проект 1)
**Стек:** Astro 4 (SSG) + Supabase (Auth + Postgres) + vanilla TS на клиенте
**Локализация:** Русский (только)

## Контекст

Существует многостраничный каталог respawn.kz на Astro (Уровень 2, готов 2026-05-15):
лендинг, каталог, страницы клубов, /for-clubs, /about. Все CTA-кнопки бронирования
показывают демо-модалку без сохранения.

Этот документ описывает **первый под-проект Уровня 3** — переход от полностью статичного
сайта к работающему product MVP с **реальным сохранением броней** и **аутентификацией
игроков**.

Остальные части Уровня 3 (B2B-кабинет клуба, реальные платежи, уведомления, отзывы) —
**вне скоупа этого спека**, будут отдельными итерациями.

## Цели

1. Игрок регистрируется через magic link на email
2. Залогиненный игрок может «забронировать» клуб — указать дату, время, часы; бронь сохраняется в БД
3. Игрок видит свои брони на `/me` со статусом и может отменить
4. Безопасность: один игрок не видит броней другого (Row Level Security)
5. Сайт остаётся статичным (SSG) — деплой через любой статический хостинг
6. Подготовка к Уровню 3.2 (B2B-кабинет клуба) — данные броней уже в БД

## Целевая аудитория

**Игроки** — те же 16–30 лет, RU-speaking. После регистрации получают возможность
бронировать. Гости видят весь сайт, но кнопка «Забронировать» ведёт на /login.

## Технические решения

| Решение | Выбор | Причина |
|---------|-------|---------|
| Бэкенд | **Supabase** (managed Postgres + Auth) | Бесплатный tier, БД + Auth + Storage из коробки, нет инфраструктуры |
| Auth-метод | **Magic link на email** | Нет паролей → нет reset-flow, нет утечек |
| Рендеринг | **SSG (без SSR)** — Astro `output: 'static'` | Деплой = статика. Безопасность через Supabase RLS |
| Slot conflict | **Не делаем** — все брони как `pending` | YAGNI для MVP. Клубы потом подтверждают вручную |
| Клубы | **Остаются в `src/data/clubs.ts` (статика)** | YAGNI. БД содержит только брони |
| Клиентская lib | `@supabase/supabase-js` v2 (~30 KB gzipped) | Официальный SDK |
| Env vars | `PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_ANON_KEY` в `.env` | Astro поддерживает `PUBLIC_*` префикс для exposure в браузер |

## Архитектура

### Файлы

**Новые:**
```
src/
├── lib/
│   └── supabase.ts                # singleton Supabase-клиент
├── scripts/
│   ├── auth.ts                    # signIn / signOut / session listener / header update
│   ├── login-page.ts              # для /login: submit формы магической ссылки
│   ├── auth-callback.ts           # для /auth/callback: обмен hash → session
│   ├── booking-real.ts            # заменяет старый booking.ts: модалка с формой → INSERT
│   └── me-page.ts                 # для /me: fetch bookings, render, отмена
├── pages/
│   ├── login.astro
│   ├── me.astro
│   └── auth/
│       └── callback.astro
└── data/
    └── supabase-types.ts          # типы Booking, BookingRow (ручные, без gen)
```

**Изменяемые:**
```
src/
├── components/
│   └── Header.astro                # auth-aware: показывает Войти / Личный кабинет
├── scripts/
│   ├── init.ts                     # подключает auth + me + login + callback по селекторам
│   └── booking.ts                  # удаляется, его место занимает booking-real.ts
└── styles/global.css               # стили для /login, /me, header auth-button
```

**Конфиг:**
```
.env                                # gitignore
.env.example                        # коммитится, шаблон
```

### Database schema (Supabase SQL)

```sql
-- Auth tables создаются Supabase автоматически (auth.users)

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  club_slug text not null,
  club_name text not null,
  city_id text not null,
  date date not null,
  time_slot text not null,
  hours int not null check (hours > 0 and hours <= 12),
  price_per_hour int not null check (price_per_hour > 0),
  total_price int not null check (total_price > 0),
  status text default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz default now()
);

create index bookings_user_id_idx on public.bookings (user_id, created_at desc);

alter table public.bookings enable row level security;

create policy "users read own bookings" on public.bookings
  for select using (auth.uid() = user_id);

create policy "users insert own bookings" on public.bookings
  for insert with check (auth.uid() = user_id);

create policy "users update own bookings" on public.bookings
  for update using (auth.uid() = user_id);
```

**Денормализация**: `club_name`, `city_id`, `price_per_hour` сохраняются в момент брони.
Это намеренно — если клуб уйдёт с платформы или поменяет цену, исторические брони
не сломаются.

### Supabase client (`src/lib/supabase.ts`)

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error('Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY in .env');
}

export const supabase: SupabaseClient = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
```

### Booking record type (`src/data/supabase-types.ts`)

```ts
export interface Booking {
  id: string;
  user_id: string;
  club_slug: string;
  club_name: string;
  city_id: string;
  date: string;            // 'YYYY-MM-DD'
  time_slot: string;        // 'HH:00'
  hours: number;
  price_per_hour: number;
  total_price: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  created_at: string;
}

export type NewBooking = Omit<Booking, 'id' | 'user_id' | 'status' | 'created_at'>;
```

## Страницы

### `/login/`

- Header (адаптивный — без user-zone, если открыта эта страница)
- Hero-like центрированный контейнер:
  - H1 «Войти»
  - Подзаголовок «Мы отправим ссылку на email — кликни и войдёшь»
  - Форма: email-input, кнопка «Получить ссылку»
  - State после submit: success-баннер «Письмо отправлено на you@example.com — проверь почту»
  - Error: «Не удалось отправить. Попробуй ещё раз»
- Footer

После submit URL читается query param `?return=`. Если есть — сохраняем в
localStorage `auth.return`. После колбэка перенаправим туда.

### `/auth/callback/`

- Минимальная страница: показывает «Входим…» → spinner
- Скрипт `auth-callback.ts`:
  1. Supabase автоматически читает hash params (`access_token`, `refresh_token`)
  2. Создаёт сессию
  3. Читает `localStorage['auth.return']`
  4. Если есть — `window.location = return`; иначе — `/me/`

### `/me/`

- Header (auth-aware → показывает «Личный кабинет» как активную ссылку и «Выйти»)
- Hero: H1 «Мои брони» + кнопка «Выйти» в углу
- Список карточек бронирования (отсортированы по `created_at desc`):
  - Каждая карточка: имя клуба → ссылка на `/clubs/[slug]/`, дата, время, часы, total_price, status-чип, кнопка «Отменить» (если status='pending')
- Empty state: «Нет броней — найди клуб!» + кнопка «К каталогу»
- Footer

Если `supabase.auth.getUser()` вернул null → редирект на `/login?return=/me/`.

### Updated `/clubs/[slug]/`

Никаких изменений в HTML — только поведение кнопки «Забронировать слот» меняется.

### Updated Header

Auth-aware:
- При загрузке любой страницы `auth.ts` проверяет сессию через `supabase.auth.getUser()`
- Если есть user → подменяет кнопку «Войти» на «Личный кабинет» с дропдауном или прямой ссылкой
- Добавляется кнопка/линк «Выйти» → `supabase.auth.signOut()` + redirect на `/`
- На /login и /auth/callback `auth-button` скрывается полностью

Реализация: в `Header.astro` рендерим placeholder `<div class="header__auth" id="header-auth"></div>`. `auth.ts` заполняет его содержимым после determine session.

## Поведение / flows

### Login flow

```
1. Гость нажимает «Войти» в Header → /login
2. Вводит email, submit
3. supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: SITE_URL + '/auth/callback/' }})
4. Показываем "Письмо отправлено"
5. Игрок открывает почту → клик по magic-link
6. Браузер открывает /auth/callback#access_token=...
7. Supabase JS detect & store session
8. auth-callback.ts redirects к /me/ (или к saved `return`)
9. Header обновляется → видим «Личный кабинет»
```

### Booking flow

```
1. Гость на /clubs/cyberzone/ → клик «Забронировать слот»
2. booking-real.ts проверяет supabase.auth.getUser()
3. Нет user → localStorage['auth.return'] = '/clubs/cyberzone/'; redirect '/login?return=/clubs/cyberzone/'
4. После login → возврат на /clubs/cyberzone/
5. Снова клик «Забронировать слот»
6. Открывается модалка с формой: date (date input), time (select 00:00–23:00), hours (number 1-12)
7. Submit → supabase.from('bookings').insert({...}) с total_price = price * hours
8. Success → модалка превращается в «Бронь сохранена!» + ссылка на /me
9. Error → toast «Не удалось сохранить»
```

### Cancel booking flow

```
1. На /me/ юзер кликает «Отменить» на pending-карточке
2. confirm() диалог: «Точно отменить?»
3. supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId)
4. Карточка обновляется in-place (статус → 'cancelled', кнопка скрывается)
```

## Env vars

`.env.example` (коммитится):
```
PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

`.env` (gitignored): реальные значения.

## Setup checklist (user actions outside code)

Этот checklist в плане как Task 0 (prereq):

1. Зарегистрироваться на supabase.com (Google login OK)
2. Create project: name "respawn-kz", регион Frankfurt или Singapore (ближе к KZ)
3. Дождаться provisioning (~2 минуты)
4. Project Settings → API → copy URL и `anon public` key в `.env`
5. SQL Editor → запустить миграцию (из `supabase/migrations/0001_bookings.sql`)
6. Authentication → Providers → проверить что Email включён, magic link OK
7. Authentication → URL Configuration → Site URL: `http://localhost:4321` (для dev) и production URL
8. Authentication → URL Configuration → Redirect URLs: добавить `http://localhost:4321/auth/callback/`

## Acceptance criteria

После завершения плана:

1. ✅ `.env` есть, `.env.example` коммитится
2. ✅ Supabase project существует, миграция применена
3. ✅ `/login/` рендерится, email-форма работает, magic link приходит в почту
4. ✅ Клик по magic link → /auth/callback/ → перенаправление на /me/ или return
5. ✅ `/me/` показывает брони залогиненного юзера (или редирект на /login если гость)
6. ✅ Кнопка «Забронировать» на карточке клуба и на /clubs/[slug]/:
   - У гостя → редирект на /login с return
   - У залогиненного → модалка с формой → insert в Supabase → success-модалка
7. ✅ Отмена брони на /me/ работает (status → cancelled)
8. ✅ Header показывает корректное состояние на всех страницах:
   - Guest: «Войти»
   - User: «Личный кабинет» + «Выйти»
9. ✅ RLS работает: при попытке прочитать чужие брони — пусто
10. ✅ `npm run build` проходит без ошибок, статика генерится
11. ✅ Без логина деплой работает (только демо-функции из MVP пропадают)

## Out of scope (явно НЕ делаем в этом under-project)

- B2B-кабинет для клубов (отдельная итерация Уровня 3)
- Реальные платежи (Kaspi/Stripe)
- Slot conflict detection (можно забронить занятый слот, клубы подтверждают вручную)
- Email/SMS уведомления (помимо стандартных Supabase magic link писем)
- SMS-auth по телефону
- Отзывы и рейтинги от пользователей
- Бонусная программа (cashback в часах)
- QR-коды броней
- Профиль игрока (имя, аватар, телефон) — только email из Auth
- Astro SSR / server endpoints
- Локализация (kk, en)
- Реальные фото клубов
- Аналитика (GA4 и т.п.)

## Migration path для будущего

После этого под-проекта:
- **Под-проект 3.2 (B2B-кабинет)**: добавить `auth.users` flag `is_club_owner`, таблицу `club_owners` (mapping user → club_slug), панель `/club/dashboard/` с показом броней клуба
- **Под-проект 3.3 (Платежи)**: Kaspi integration, поле `payment_status` в bookings, callback URL для подтверждения
- **Под-проект 3.4 (Notifications)**: edge function в Supabase или внешний сервис (Resend для email)

Архитектура с RLS и static frontend позволяет всё это добавить инкрементально без переписывания.

## Сложность

~3-5 дней работы. План разбивает на ~15 задач. Все коммиты в `main` (одиночная разработка).

**Главная зависимость от пользователя**: Supabase project setup — пользователь делает руками через UI Supabase. После того как `.env` готов, остальное автоматизируется.
