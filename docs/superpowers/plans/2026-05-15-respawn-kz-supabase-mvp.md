# respawn.kz Backend MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить к существующему Astro-сайту respawn.kz реальный backend через Supabase: magic-link аутентификация для игроков, сохранение броней в Postgres, страница `/me` с историей броней.

**Architecture:** Astro остаётся 100% SSG. На клиенте подключается `@supabase/supabase-js` v2. Безопасность данных через Supabase Row Level Security (RLS). Новые страницы `/login/`, `/me/`, `/auth/callback/`. Заменяется демо-логика бронирования на реальный insert в Postgres. Header становится auth-aware.

**Tech Stack:** Astro 4 (static), Supabase (Postgres + Auth), `@supabase/supabase-js` v2, TypeScript strict, vanilla TS на клиенте.

**Spec:** [docs/superpowers/specs/2026-05-15-respawn-kz-supabase-mvp-design.md](../specs/2026-05-15-respawn-kz-supabase-mvp-design.md)

---

## Important environment notes

- Node.js v22.11.0 в `C:\Users\Lenovo\node\node-v22.11.0-win-x64\`. Текущие shell-сессии Claude Code **не видят PATH** — префиксуй `export PATH="$PATH:/c/Users/Lenovo/node/node-v22.11.0-win-x64" && ...` для каждой npm/node команды.
- После перезапуска Claude Code префикс не нужен (новые shells получат User PATH).
- **Task 2 — выполняется человеком вручную через UI supabase.com.** Без него последующие задачи технически работают (код пишется), но `npm run dev` падает с ошибкой missing env vars пока `.env` не заполнен.

## Phase overview

- **Phase 1: Setup** (T1–T3) — npm-зависимости, migration файл, .env.example, Supabase setup user-side
- **Phase 2: Supabase client** (T4–T5) — singleton client, типы, базовый auth.ts
- **Phase 3: Auth pages** (T6–T8) — /login, /auth/callback, header update
- **Phase 4: Bookings** (T9–T11) — booking-real.ts, /me, cancel
- **Phase 5: Verify** (T12–T13) — build + manual smoke test

---

## Task 1: Install Supabase JS client and update .env handling

**Files:**
- Modify: `C:\ClaudeCode\package.json` (новая зависимость)
- Create: `C:\ClaudeCode\.env.example`
- Modify: `C:\ClaudeCode\.gitignore` (если `.env` ещё не там — добавить)

- [ ] **Step 1: Install @supabase/supabase-js**

```bash
export PATH="$PATH:/c/Users/Lenovo/node/node-v22.11.0-win-x64" && npm install @supabase/supabase-js@^2.45.0 --no-fund --no-audit
```

Expected: `added N packages`, `@supabase/supabase-js` появляется в `dependencies` в `package.json`.

- [ ] **Step 2: Create .env.example**

Создать `C:\ClaudeCode\.env.example`:

```
# Supabase
# Get these from supabase.com → Project Settings → API
PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key-here
```

- [ ] **Step 3: Verify .gitignore excludes .env**

```bash
grep -E "^\.env$|^\.env\.local$" .gitignore
```

Expected: оба совпадения. Если нет — добавить в `.gitignore`. Гитигнор от Task 2 Phase 1 Уровня 2 уже содержит `.env` и `.env.local` — это должно показать совпадение.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: install @supabase/supabase-js and add .env.example"
```

---

## Task 2: Create database migration file

**Files:**
- Create: `C:\ClaudeCode\supabase\migrations\0001_bookings.sql`

- [ ] **Step 1: Create supabase migrations directory and file**

```bash
mkdir -p supabase/migrations
```

Создать `supabase/migrations/0001_bookings.sql`:

```sql
-- Migration 0001: create bookings table with RLS

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

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0001_bookings.sql && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add bookings table migration with Row Level Security"
```

---

## Task 3: Supabase project setup (USER action — manual)

Этот шаг выполняется человеком через браузер на supabase.com. Код продолжать писать можно, но `npm run dev` будет падать до создания `.env`.

**Files:**
- Create: `C:\ClaudeCode\.env` (НЕ коммитится)

- [ ] **Step 1: Open supabase.com and sign up**

Открыть https://supabase.com → «Start your project» → войти через Google или email. Бесплатно, без карты.

- [ ] **Step 2: Create new project**

- Кнопка «New project»
- Organization: оставить default или создать
- Name: `respawn-kz`
- Database Password: придумать и сохранить (не понадобится сейчас, но потом для миграций)
- Region: **Frankfurt (eu-central-1)** или **Singapore (ap-southeast-1)** — ближе к Казахстану
- Plan: Free
- Submit → ждать ~2 минуты пока provisioning

- [ ] **Step 3: Apply database migration**

В UI проекта (после готовности):
- Левое меню → SQL Editor → New query
- Скопировать содержимое `supabase/migrations/0001_bookings.sql` (см. Task 2)
- Paste в редактор → Run (Ctrl+Enter)
- Expected: «Success. No rows returned»
- Проверка: левое меню → Table Editor → видна таблица `bookings` с RLS-индикатором

- [ ] **Step 4: Configure auth providers**

- Левое меню → Authentication → Providers
- Email: **должен быть включён** (по умолчанию — да). Если нет — toggle on.
- Magic link: **включён** автоматически с Email provider

- [ ] **Step 5: Configure auth URLs**

- Левое меню → Authentication → URL Configuration
- **Site URL**: `http://localhost:4321`
- **Redirect URLs**: добавить `http://localhost:4321/auth/callback/` (с trailing slash — у нас `trailingSlash: 'always'`)
- Save changes

- [ ] **Step 6: Copy credentials and create .env**

- Левое меню → Project Settings (внизу) → API
- Скопировать **Project URL** и **`anon` `public` key**
- Создать файл `C:\ClaudeCode\.env`:

```
PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.long-token-here
```

(Подставить свои значения)

- [ ] **Step 7: Verify .env is not committed**

```bash
git status
```

Expected: `.env` НЕ появляется в untracked (он в .gitignore). Если появляется — добавить в .gitignore.

- [ ] **Step 8: Verify dev server starts with new env**

```bash
export PATH="$PATH:/c/Users/Lenovo/node/node-v22.11.0-win-x64" && npm run dev > /tmp/astro-dev.log 2>&1 &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:4321/
echo ""
pkill -f "astro dev" 2>/dev/null
```

Expected: HTTP 200 (текущий лендинг работает как и раньше).

No commit (содержимое .env приватное).

---

## Task 4: Supabase client singleton

**Files:**
- Create: `C:\ClaudeCode\src\lib\supabase.ts`

- [ ] **Step 1: Create lib directory and supabase.ts**

```bash
mkdir -p src/lib
```

Создать `src/lib/supabase.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  // В dev — кидаем понятную ошибку. В prod — будет сборка-ошибка через build.
  console.error('[supabase] Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY in .env. See .env.example.');
  throw new Error('Supabase credentials missing — check .env');
}

export const supabase: SupabaseClient = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/supabase.ts && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add Supabase client singleton with session persistence"
```

---

## Task 5: Booking types

**Files:**
- Create: `C:\ClaudeCode\src\data\supabase-types.ts`

- [ ] **Step 1: Create supabase-types.ts**

```ts
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
  status: 'pending' | 'confirmed' | 'cancelled';
  created_at: string;
}

export type NewBooking = Omit<Booking, 'id' | 'user_id' | 'status' | 'created_at'>;

export const STATUS_LABELS: Record<Booking['status'], string> = {
  pending: 'Ожидает подтверждения',
  confirmed: 'Подтверждена',
  cancelled: 'Отменена',
};
```

- [ ] **Step 2: Commit**

```bash
git add src/data/supabase-types.ts && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add Booking and NewBooking types with status labels"
```

---

## Task 6: Auth core script (session detect + header update)

**Files:**
- Create: `C:\ClaudeCode\src\scripts\auth.ts`

- [ ] **Step 1: Create auth.ts**

```ts
import { supabase } from '../lib/supabase';

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  window.location.href = '/';
}

export function setupAuthButton(): void {
  const root = document.getElementById('header-auth');
  if (!root) return;

  function render(loggedIn: boolean) {
    if (loggedIn) {
      root!.innerHTML = `
        <a href="/me/" class="btn btn--ghost">Личный кабинет</a>
        <button class="btn btn--ghost" type="button" id="logout-btn">Выйти</button>
      `;
      document.getElementById('logout-btn')?.addEventListener('click', signOut);
    } else {
      root!.innerHTML = `<a href="/login/" class="btn btn--ghost">Войти</a>`;
    }
  }

  // Первичный рендер
  getCurrentUser().then((user) => render(!!user));

  // Реагируем на изменения сессии
  supabase.auth.onAuthStateChange((_event, session) => {
    render(!!session?.user);
  });
}

export function saveReturnUrl(url: string): void {
  try {
    localStorage.setItem('auth.return', url);
  } catch {}
}

export function popReturnUrl(): string | null {
  try {
    const url = localStorage.getItem('auth.return');
    if (url) localStorage.removeItem('auth.return');
    return url;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/scripts/auth.ts && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add auth.ts with session detection and header rendering"
```

---

## Task 7: Update Header.astro to be auth-aware

**Files:**
- Modify: `C:\ClaudeCode\src\components\Header.astro`

- [ ] **Step 1: Replace header__actions block**

Найти в `src/components/Header.astro` блок:

```astro
    <div class="header__actions">
      <button class="btn btn--ghost" type="button">Войти</button>
      <button class="hamburger" id="hamburger" aria-label="Меню" type="button">
        <span></span><span></span><span></span>
      </button>
    </div>
```

Заменить на:

```astro
    <div class="header__actions">
      <div class="header__auth" id="header-auth">
        <a href="/login/" class="btn btn--ghost">Войти</a>
      </div>
      <button class="hamburger" id="hamburger" aria-label="Меню" type="button">
        <span></span><span></span><span></span>
      </button>
    </div>
```

(`<div id="header-auth">` с дефолтным «Войти» — fallback на случай если JS не выполнился; auth.ts перерендерит при загрузке.)

- [ ] **Step 2: Update init.ts to call setupAuthButton on every page**

Заменить содержимое `src/scripts/init.ts`:

```ts
import { setupGeolocation } from './geolocation';
import { setupModal } from './modal';
import { setupMobileMenu } from './menu';
import { setupHeaderScroll } from './header-scroll';
import { setupSearchForm, setupTimeSelect, setupDateDefault } from './search';
import { setupBookingButtons } from './booking';
import { setupGlitch } from './glitch';
import { setupClubApplication } from './club-application';
import { setupCatalogFilters } from './filters';
import { setupAuthButton } from './auth';

function init(): void {
  setupHeaderScroll();
  setupMobileMenu();
  setupModal();
  setupBookingButtons();
  setupAuthButton();
  if (document.getElementById('search-form')) {
    setupTimeSelect();
    setupDateDefault();
    setupSearchForm();
    setupGeolocation();
  }
  if (document.querySelector('.glitch')) {
    setupGlitch();
  }
  if (document.getElementById('club-application-form')) {
    setupClubApplication();
  }
  if (document.getElementById('catalog-grid')) {
    setupCatalogFilters();
    setupGeolocation();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

- [ ] **Step 3: Add small CSS for header__auth flex layout**

Дописать в конец `src/styles/global.css`:

```css
.header__auth {
  display: flex;
  align-items: center;
  gap: 8px;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Header.astro src/scripts/init.ts src/styles/global.css && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: make Header auth-aware with logout button"
```

---

## Task 8: /login page

**Files:**
- Create: `C:\ClaudeCode\src\pages\login.astro`
- Create: `C:\ClaudeCode\src\scripts\login-page.ts`

- [ ] **Step 1: Create login-page.ts**

```ts
import { supabase } from '../lib/supabase';
import { saveReturnUrl } from './auth';

export function setupLoginPage(): void {
  const form = document.getElementById('login-form') as HTMLFormElement | null;
  const successEl = document.getElementById('login-success');
  const errorEl = document.getElementById('login-error');
  if (!form) return;

  // Если есть ?return= — сохраняем
  const params = new URLSearchParams(window.location.search);
  const returnUrl = params.get('return');
  if (returnUrl) saveReturnUrl(returnUrl);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const email = (data.get('email') as string).trim();
    if (!email) return;

    if (successEl) successEl.hidden = true;
    if (errorEl) errorEl.hidden = true;
    const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Отправляем…';

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback/`,
      },
    });

    btn.disabled = false;
    btn.textContent = 'Получить ссылку';

    if (error) {
      if (errorEl) {
        errorEl.textContent = `Ошибка: ${error.message}`;
        errorEl.hidden = false;
      }
      return;
    }

    if (successEl) {
      successEl.querySelector('[data-email]')!.textContent = email;
      successEl.hidden = false;
    }
    form.reset();
  });
}
```

- [ ] **Step 2: Update init.ts to call setupLoginPage**

Дописать в `init.ts` импорт:

```ts
import { setupLoginPage } from './login-page';
```

Добавить в функцию `init()`:

```ts
  if (document.getElementById('login-form')) {
    setupLoginPage();
  }
```

(вставить рядом с другими `if`-блоками)

- [ ] **Step 3: Create login.astro**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---

<BaseLayout
  title="Войти — respawn.kz"
  description="Войди в respawn.kz через magic link"
>
  <section class="auth-page">
    <div class="container">
      <div class="auth-card">
        <h1 class="auth-card__title">Войти</h1>
        <p class="auth-card__subtitle">Введи email — мы отправим ссылку. Кликнешь — войдёшь. Без пароля.</p>

        <form class="auth-form" id="login-form">
          <label class="auth-field">
            <span class="auth-label">Email</span>
            <input type="email" name="email" required class="auth-input" placeholder="you@example.com" autocomplete="email" />
          </label>
          <button type="submit" class="btn btn--primary btn--large auth-submit">Получить ссылку</button>
        </form>

        <div class="auth-success" id="login-success" hidden>
          <p>📨 Письмо отправлено на <strong data-email></strong></p>
          <p style="margin-top:8px">Проверь почту (включая спам) — кликни по ссылке.</p>
        </div>

        <div class="auth-error" id="login-error" hidden></div>

        <p class="auth-footnote">Регистрация автоматическая — если входишь впервые, аккаунт создастся.</p>
      </div>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 4: Add auth-page styles to global.css**

Дописать в конец `src/styles/global.css`:

```css
/* ============================================
   AUTH pages (/login, /me empty state)
   ============================================ */
.auth-page {
  padding: 140px 0 80px;
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.auth-card {
  max-width: 480px;
  width: 100%;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 40px;
  box-shadow: var(--glow-cyan);
}

.auth-card__title {
  font-size: 32px;
  margin-bottom: 8px;
  text-align: center;
}

.auth-card__subtitle {
  color: var(--text-secondary);
  font-size: 15px;
  margin-bottom: 32px;
  text-align: center;
  line-height: 1.6;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.auth-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.auth-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  padding-left: 14px;
}

.auth-input {
  background: var(--bg-elevated);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  font-size: 15px;
  color: var(--text-primary);
  font-family: inherit;
  transition: border-color var(--t-fast);
}

.auth-input:hover,
.auth-input:focus {
  border-color: var(--border-hover);
  outline: none;
}

.auth-submit {
  margin-top: 8px;
}

.auth-success {
  margin-top: 24px;
  padding: 16px;
  background: rgba(0, 240, 255, 0.08);
  border: 1px solid rgba(0, 240, 255, 0.2);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.6;
}

.auth-success strong {
  color: var(--neon-cyan);
  font-family: "JetBrains Mono", monospace;
}

.auth-error {
  margin-top: 16px;
  padding: 12px 16px;
  background: rgba(255, 46, 154, 0.08);
  border: 1px solid rgba(255, 46, 154, 0.2);
  border-radius: var(--radius-md);
  color: var(--neon-magenta);
  font-size: 14px;
}

.auth-footnote {
  margin-top: 24px;
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}
```

- [ ] **Step 5: Verify dev server compiles**

```bash
export PATH="$PATH:/c/Users/Lenovo/node/node-v22.11.0-win-x64" && npm run dev > /tmp/astro-dev.log 2>&1 &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:4321/login/
echo ""
pkill -f "astro dev" 2>/dev/null
```

Expected: `200`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/login.astro src/scripts/login-page.ts src/scripts/init.ts src/styles/global.css && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add /login page with magic link form"
```

---

## Task 9: /auth/callback page

**Files:**
- Create: `C:\ClaudeCode\src\pages\auth\callback.astro`
- Create: `C:\ClaudeCode\src\scripts\auth-callback.ts`

- [ ] **Step 1: Create auth-callback.ts**

```ts
import { supabase } from '../lib/supabase';
import { popReturnUrl } from './auth';

export function setupAuthCallback(): void {
  if (!document.getElementById('auth-callback-root')) return;

  // Supabase JS детектит hash params автоматически через detectSessionInUrl
  // Дожидаемся события auth-state-change или прямого getSession.
  (async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      showError(`Ошибка авторизации: ${error.message}`);
      return;
    }
    if (!data.session) {
      // Подождать чуть, иногда detectSessionInUrl ещё в процессе
      setTimeout(async () => {
        const recheck = await supabase.auth.getSession();
        if (recheck.data.session) {
          redirect();
        } else {
          showError('Не удалось завершить вход. Попробуй ещё раз.');
        }
      }, 800);
      return;
    }
    redirect();
  })();

  function redirect(): void {
    const returnUrl = popReturnUrl() || '/me/';
    window.location.replace(returnUrl);
  }

  function showError(msg: string): void {
    const el = document.getElementById('callback-error');
    const loadingEl = document.getElementById('callback-loading');
    if (loadingEl) loadingEl.hidden = true;
    if (el) {
      el.textContent = msg;
      el.hidden = false;
    }
  }
}
```

- [ ] **Step 2: Update init.ts**

Добавить импорт:

```ts
import { setupAuthCallback } from './auth-callback';
```

В функции `init()`:

```ts
  if (document.getElementById('auth-callback-root')) {
    setupAuthCallback();
  }
```

- [ ] **Step 3: Create callback.astro**

```bash
mkdir -p src/pages/auth
```

Создать `src/pages/auth/callback.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
---

<BaseLayout title="Входим… — respawn.kz">
  <section class="auth-page" id="auth-callback-root">
    <div class="container">
      <div class="auth-card" style="text-align:center">
        <div id="callback-loading">
          <h1 class="auth-card__title">Входим…</h1>
          <p class="auth-card__subtitle">Подожди секунду, проверяем твою ссылку.</p>
        </div>
        <div class="auth-error" id="callback-error" hidden style="margin-top:0"></div>
        <p class="auth-footnote">
          Не сработало? <a href="/login/" style="color:var(--neon-cyan)">Попробовать снова</a>
        </p>
      </div>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 4: Verify**

```bash
export PATH="$PATH:/c/Users/Lenovo/node/node-v22.11.0-win-x64" && npm run dev > /tmp/astro-dev.log 2>&1 &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:4321/auth/callback/
echo ""
pkill -f "astro dev" 2>/dev/null
```

Expected: `200`.

- [ ] **Step 5: Commit**

```bash
git add "src/pages/auth/callback.astro" src/scripts/auth-callback.ts src/scripts/init.ts && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add /auth/callback page for magic link redirect"
```

---

## Task 10: Replace demo booking with real booking flow

**Files:**
- Delete: `C:\ClaudeCode\src\scripts\booking.ts`
- Create: `C:\ClaudeCode\src\scripts\booking-real.ts`
- Modify: `C:\ClaudeCode\src\scripts\init.ts`

- [ ] **Step 1: Create booking-real.ts**

```ts
import { supabase } from '../lib/supabase';
import { CLUBS, type Club } from '../data/clubs';
import type { NewBooking } from '../data/supabase-types';
import { openModal, closeModal } from './modal';
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

async function submitBooking(club: Club, data: NewBooking): Promise<{ ok: boolean; error?: string }> {
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

  // Wire up form
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

    const result = await submitBooking(club, newBooking);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Забронировать';

    if (!result.ok) {
      if (errorEl) {
        errorEl.textContent = `Не удалось сохранить: ${result.error}`;
        errorEl.hidden = false;
      }
      return;
    }

    // Заменяем содержимое модалки на success
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
```

- [ ] **Step 2: Delete old booking.ts**

```bash
rm src/scripts/booking.ts
```

- [ ] **Step 3: Update init.ts to import from booking-real instead**

В `src/scripts/init.ts` заменить:

```ts
import { setupBookingButtons } from './booking';
```

на:

```ts
import { setupBookingButtons } from './booking-real';
```

- [ ] **Step 4: Add booking form styles to global.css**

Дописать в конец `src/styles/global.css`:

```css
/* ============================================
   BOOKING FORM (in modal)
   ============================================ */
.booking-form__row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 0.8fr;
  gap: 12px;
  margin-bottom: 16px;
}

.booking-form__total {
  text-align: center;
  font-size: 18px;
  margin-bottom: 16px;
  color: var(--text-secondary);
}

.booking-form__total strong {
  color: var(--neon-cyan);
  font-family: "JetBrains Mono", monospace;
}

@media (max-width: 600px) {
  .booking-form__row {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Verify build still passes**

```bash
export PATH="$PATH:/c/Users/Lenovo/node/node-v22.11.0-win-x64" && npm run build 2>&1 | tail -5
```

Expected: `[build] 17 page(s) built` (16 старых + /login/ + /auth/callback/, минус удалённых — итого зависит, но не должно падать с ошибкой).

Точное число: 16 + login + auth/callback = 18 страниц. Так как /me/ ещё нет, на этом этапе ожидается 18.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/booking-real.ts src/scripts/init.ts src/styles/global.css && git rm src/scripts/booking.ts && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: replace demo booking with real Supabase booking flow"
```

---

## Task 11: /me dashboard page

**Files:**
- Create: `C:\ClaudeCode\src\pages\me.astro`
- Create: `C:\ClaudeCode\src\scripts\me-page.ts`

- [ ] **Step 1: Create me-page.ts**

```ts
import { supabase } from '../lib/supabase';
import { getCurrentUser } from './auth';
import { type Booking, STATUS_LABELS } from '../data/supabase-types';
import { CITY_LABELS } from '../data/cities';

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function renderBookingCard(b: Booking): string {
  const cityLabel = CITY_LABELS[b.city_id] ?? b.city_id;
  const canCancel = b.status === 'pending';
  const statusClass = `me-booking__status me-booking__status--${b.status}`;
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
        ${canCancel ? `<button class="btn btn--ghost me-booking__cancel" data-cancel="${b.id}">Отменить</button>` : ''}
      </div>
    </article>
  `;
}

async function loadBookings(): Promise<Booking[] | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[me] failed to load bookings', error);
    return null;
  }
  return data as Booking[];
}

async function cancelBooking(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', id);
  return !error;
}

export async function setupMePage(): Promise<void> {
  const root = document.getElementById('me-root');
  const listEl = document.getElementById('me-bookings');
  const emptyEl = document.getElementById('me-empty');
  const emailEl = document.getElementById('me-email');
  const loadingEl = document.getElementById('me-loading');
  if (!root || !listEl || !emptyEl) return;

  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/login/?return=/me/';
    return;
  }

  if (emailEl) emailEl.textContent = user.email ?? '';

  const bookings = await loadBookings();
  if (loadingEl) loadingEl.hidden = true;

  if (!bookings || bookings.length === 0) {
    emptyEl.hidden = false;
    return;
  }

  listEl.innerHTML = bookings.map(renderBookingCard).join('');
  listEl.hidden = false;

  listEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('[data-cancel]') as HTMLElement | null;
    if (!btn) return;
    const id = btn.getAttribute('data-cancel');
    if (!id) return;

    if (!window.confirm('Точно отменить бронь?')) return;

    btn.setAttribute('disabled', '');
    btn.textContent = 'Отменяем…';
    const ok = await cancelBooking(id);
    if (!ok) {
      btn.removeAttribute('disabled');
      btn.textContent = 'Отменить';
      alert('Не удалось отменить. Попробуй ещё раз.');
      return;
    }

    // Обновить карточку in-place
    const card = btn.closest('[data-booking-id]') as HTMLElement;
    const statusEl = card.querySelector('.me-booking__status') as HTMLElement;
    statusEl.className = 'me-booking__status me-booking__status--cancelled';
    statusEl.textContent = STATUS_LABELS.cancelled;
    btn.remove();
  });
}
```

- [ ] **Step 2: Update init.ts**

Добавить импорт:

```ts
import { setupMePage } from './me-page';
```

В функцию `init()`:

```ts
  if (document.getElementById('me-root')) {
    setupMePage();
  }
```

- [ ] **Step 3: Create me.astro**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---

<BaseLayout title="Личный кабинет — respawn.kz">
  <section class="me-page" id="me-root">
    <div class="container">
      <header class="me-page__header">
        <h1 class="me-page__title">Мои брони</h1>
        <p class="me-page__email">Аккаунт: <strong id="me-email"></strong></p>
      </header>

      <div class="me-loading" id="me-loading">
        <p style="text-align:center;color:var(--text-muted)">Загружаем брони…</p>
      </div>

      <div class="me-bookings__list" id="me-bookings" hidden></div>

      <div class="me-empty" id="me-empty" hidden>
        <p>У тебя пока нет броней.</p>
        <a href="/clubs/" class="btn btn--primary" style="margin-top:16px">К каталогу клубов</a>
      </div>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 4: Add /me styles to global.css**

Дописать в конец `src/styles/global.css`:

```css
/* ============================================
   /me dashboard page
   ============================================ */
.me-page {
  padding: 120px 0 80px;
  min-height: 100vh;
}

.me-page__header {
  margin-bottom: 32px;
}

.me-page__title {
  font-size: clamp(28px, 4vw, 40px);
  margin-bottom: 8px;
}

.me-page__email {
  color: var(--text-secondary);
  font-size: 14px;
}

.me-page__email strong {
  font-family: "JetBrains Mono", monospace;
  color: var(--neon-cyan);
}

.me-loading {
  padding: 60px 20px;
}

.me-bookings__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.me-booking {
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  transition: border-color var(--t-base);
}

.me-booking:hover {
  border-color: var(--border-hover);
}

.me-booking__main {
  flex: 1;
}

.me-booking__name {
  font-family: "JetBrains Mono", monospace;
  font-size: 18px;
  margin-bottom: 6px;
}

.me-booking__name a {
  color: inherit;
  text-decoration: none;
}

.me-booking__name a:hover {
  color: var(--neon-cyan);
}

.me-booking__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  color: var(--text-secondary);
  font-size: 14px;
}

.me-booking__side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.me-booking__price {
  font-family: "JetBrains Mono", monospace;
  font-size: 18px;
  font-weight: 600;
  color: var(--neon-cyan);
}

.me-booking__status {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 100px;
  font-family: "JetBrains Mono", monospace;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.me-booking__status--pending {
  background: rgba(254, 243, 0, 0.1);
  color: var(--neon-yellow);
  border: 1px solid rgba(254, 243, 0, 0.2);
}

.me-booking__status--confirmed {
  background: rgba(0, 240, 255, 0.1);
  color: var(--neon-cyan);
  border: 1px solid rgba(0, 240, 255, 0.2);
}

.me-booking__status--cancelled {
  background: rgba(255, 46, 154, 0.06);
  color: var(--neon-magenta);
  border: 1px solid rgba(255, 46, 154, 0.15);
}

.me-booking__cancel {
  padding: 6px 14px;
  font-size: 12px;
}

.me-empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
  background: var(--bg-surface);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
}

@media (max-width: 768px) {
  .me-booking {
    flex-direction: column;
    align-items: flex-start;
  }
  .me-booking__side {
    align-items: flex-start;
    flex-direction: row;
    flex-wrap: wrap;
    width: 100%;
  }
}
```

- [ ] **Step 5: Verify build**

```bash
export PATH="$PATH:/c/Users/Lenovo/node/node-v22.11.0-win-x64" && npm run build 2>&1 | tail -5
```

Expected: `19 page(s) built` (16 + login + auth/callback + me).

- [ ] **Step 6: Commit**

```bash
git add src/pages/me.astro src/scripts/me-page.ts src/scripts/init.ts src/styles/global.css && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add /me dashboard with bookings list and cancel"
```

---

## Task 12: npm run build full verification

**Files:** (no edits, validation only)

- [ ] **Step 1: Run full build**

```bash
export PATH="$PATH:/c/Users/Lenovo/node/node-v22.11.0-win-x64" && npm run build 2>&1 | tail -10
```

Expected: «19 page(s) built» (или больше), no errors.

- [ ] **Step 2: Verify new pages exist in dist**

```bash
ls dist/login dist/me dist/auth/callback 2>&1
```

Expected: каждая директория содержит `index.html`.

- [ ] **Step 3: Total HTML count**

```bash
find dist -name "*.html" | wc -l
```

Expected: `19` (16 старых + login + me + auth/callback).

- [ ] **Step 4: Verify env vars are interpolated correctly**

```bash
grep -l "PUBLIC_SUPABASE_URL" dist/_astro/*.js 2>/dev/null && echo "WARN: env var leaked to client unprocessed"
echo "If no WARN above, Vite inlined the values correctly."
```

Expected: ни одного `PUBLIC_SUPABASE_URL` буквально в собранных JS (Vite заменил на актуальные значения из `.env`).

---

## Task 13: Manual smoke test (USER + agent)

**Files:** (no edits)

Запустить dev-сервер и пройти все потоки руками.

- [ ] **Step 1: Start dev server**

```bash
export PATH="$PATH:/c/Users/Lenovo/node/node-v22.11.0-win-x64" && npm run dev > /tmp/astro-dev.log 2>&1 &
sleep 6
echo "Server up?"
curl -s -o /dev/null -w "%{http_code}" http://localhost:4321/
```

Expected: `200`.

- [ ] **Step 2: Verify auth-button is rendered on landing**

```bash
curl -s http://localhost:4321/ | grep -E "(header-auth|Войти|Личный кабинет)" | head -3
```

Expected: видим `<div class="header__auth" id="header-auth">` с дефолтным «Войти».

- [ ] **Step 3: Verify /login renders**

```bash
curl -s http://localhost:4321/login/ | grep -cE "(login-form|Войти|Получить ссылку)"
```

Expected: ≥3.

- [ ] **Step 4: Verify /me renders (will redirect on client)**

```bash
curl -s http://localhost:4321/me/ | grep -cE "(me-root|Мои брони|me-loading)"
```

Expected: ≥3 (на стороне сервера всё рендерится, JS потом проверит сессию и редиректнет).

- [ ] **Step 5: Manual end-to-end test (USER)**

Открыть в браузере http://localhost:4321/ и пройти:

5.1. Нажать «Войти» в header → попадаем на /login
5.2. Ввести свой реальный email, submit → success-баннер
5.3. Открыть почту → найти письмо «Magic link for respawn.kz» → клик
5.4. Браузер открывает /auth/callback/ → быстро редиректит на /me/
5.5. Видим заголовок «Мои брони» + email в подзаголовке + empty-state «У тебя пока нет броней»
5.6. Клик «К каталогу клубов» → /clubs/
5.7. Открыть любой клуб → клик «Забронировать слот»
5.8. Откроется модалка с формой → выбрать дату, время, часов → submit
5.9. Модалка превращается в «Бронь сохранена!»
5.10. Перейти на /me/ → видим карточку только что созданной брони со статусом «Ожидает подтверждения»
5.11. Кликнуть «Отменить» → подтвердить → статус становится «Отменена», кнопка пропадает
5.12. Header справа: видим «Личный кабинет» и «Выйти». Клик «Выйти» → возврат на «/», header теперь снова показывает «Войти»

- [ ] **Step 6: Verify RLS by trying to read others' bookings**

В Supabase SQL Editor выполнить (от роли service_role):

```sql
select count(*) from public.bookings;
```

Должно быть как минимум 1 запись (твоя из Step 5).

Теперь в браузерной DevTools консоли на /me/ выполнить:

```js
(async () => {
  const { data } = await window._supa_anon_test?.from('bookings').select('*') ?? { data: 'no_anon' };
  console.log('Anon visible:', data);
})()
```

(Этот шаг проверочный — не критичен. Главное что в обычной работе ты видишь только свои брони, что гарантирует RLS.)

- [ ] **Step 7: Stop dev server**

```bash
pkill -f "astro dev" 2>/dev/null
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|------------------|------|
| Install @supabase/supabase-js | T1 |
| .env / .env.example | T1, T3 |
| Database migration | T2, T3 (apply) |
| Supabase project setup | T3 (user-action) |
| Supabase client singleton | T4 |
| Booking types | T5 |
| Auth core (session detect, logout, return URL) | T6 |
| Auth-aware Header | T7 |
| /login page + magic link | T8 |
| /auth/callback page | T9 |
| Real booking flow (with auth check) | T10 |
| /me dashboard + cancel | T11 |
| Build verification | T12 |
| Smoke test all flows | T13 |
| Out of scope (B2B, payment, slot conflict, notifications) | not implemented ✓ |

All 11 acceptance criteria из спека покрыты через T8, T9, T10, T11, T13.

**Placeholder scan:** все шаги содержат конкретный код, нет TBD/TODO. Task 3 целиком вручную (UI-actions), но шаги пронумерованы и проверяемы.

**Type consistency:**
- `Booking`, `NewBooking`, `STATUS_LABELS` — определены в T5, используются в T10 (booking-real) и T11 (me-page) согласованно
- `getCurrentUser`, `signOut`, `saveReturnUrl`, `popReturnUrl`, `setupAuthButton` — определены в T6 (auth.ts), используются везде
- `supabase` import path `'../lib/supabase'` — одинаковый во всех скриптах
- `data-book` атрибут — совпадает между ClubCard.astro (Уровень 2) и booking-real.ts (Уровень 3)
- DOM ID-якоря согласованы между .astro и .ts файлами: `login-form`, `me-root`, `me-bookings`, `header-auth`, `auth-callback-root`, `booking-form`

**Готов к исполнению.**
