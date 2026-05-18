# A11y Audit & Contrast Refactor — Implementation Plan (SP9)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Lighthouse a11y ≥ 95 on every page of respawn.kz (~27 pages), enforce WCAG AA contrast, and pass two keyboard-only end-to-end flow tests — without breaking customer or admin journeys.

**Architecture:** Hybrid audit. Add Lighthouse CLI as a dev script that runs against the built site and emits a JSON report. Drive most of the score via fixes in shared components (`BaseLayout`, `Header`, `Footer`, `Modal`, `RatingStars`, `ClubCard`, `DashboardNav`, forms, cookie banner). Refactor contrast tokens so the brand violet stops being used as body text. Verify with one full Lighthouse sweep + two manual keyboard flow tests.

**Tech Stack:** Astro 4.16, TypeScript, Lighthouse CLI (new devDep), Supabase JS (existing), Chrome DevTools (manual). No new framework or runtime.

**Spec:** [docs/superpowers/specs/2026-05-18-respawn-kz-a11y-audit-and-contrast-design.md](../specs/2026-05-18-respawn-kz-a11y-audit-and-contrast-design.md)

**Note on TDD:** A11y work doesn't fit classic unit-test TDD — most assertions are visual/behavioral (contrast, keyboard nav, screen reader semantics). Lighthouse runs are our automated test. Each fix task ends with a verification step: either Lighthouse re-run, dev-server preview, or visual inspection.

**Branch:** `feat/a11y-audit`

---

## Task 1: Add Lighthouse CLI + audit script

**Files:**
- Modify: `package.json` (devDeps + script)
- Create: `scripts/audit-a11y.mjs`
- Create: `docs/audit/a11y-baseline.md` (results)

- [ ] **Step 1: Install lighthouse + chrome-launcher as devDeps**

```bash
npm install --save-dev lighthouse chrome-launcher
```

Expected: `package.json` `devDependencies` gains `lighthouse` and `chrome-launcher` entries.

- [ ] **Step 2: Add audit script that visits a list of URLs and writes JSON results**

Create `scripts/audit-a11y.mjs`:

```javascript
#!/usr/bin/env node
// Lighthouse a11y audit runner for respawn.kz.
// Usage: node scripts/audit-a11y.mjs [baseUrl]
//   defaults to http://localhost:4321
// Prints a markdown table of {url, score} and writes JSON to docs/audit/a11y-latest.json

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseUrl = process.argv[2] ?? 'http://localhost:4321';

// Public + auth-gated pages. Auth-gated pages will get partial scores (login redirect)
// — for those, run Lighthouse manually in an authenticated browser session.
const PATHS = [
  '/',
  '/about/',
  '/for-clubs/',
  '/privacy/',
  '/terms/',
  '/clubs/',
  '/clubs/cyberzone/',
  // Other club slugs auto-discovered via sitemap at runtime would be ideal,
  // but for baseline we audit one representative club page. Add more slugs
  // here after confirming they exist via `curl https://respawn.kz/sitemap-0.xml`.
  '/login/',
  '/reviews/new/',
  '/me/',
  '/admin/',
  '/admin/reviews/',
  '/admin/applications/',
  '/admin/users/',
  '/admin/owners/',
  '/dashboard/',
  '/dashboard/bookings/',
  '/dashboard/applications/',
  '/dashboard/register/',
  '/dashboard/club/edit/',
  '/404/',
];

async function runAudit(url, chromePort) {
  const result = await lighthouse(url, {
    port: chromePort,
    output: 'json',
    onlyCategories: ['accessibility'],
    logLevel: 'error',
  });
  const score = Math.round((result.lhr.categories.accessibility.score ?? 0) * 100);
  const audits = result.lhr.audits;
  const failures = Object.values(audits)
    .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode !== 'notApplicable')
    .map((a) => ({ id: a.id, title: a.title, score: a.score }));
  return { url, score, failures };
}

const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
const results = [];
for (const path of PATHS) {
  const url = `${baseUrl}${path}`;
  try {
    const r = await runAudit(url, chrome.port);
    results.push(r);
    console.log(`${r.score >= 95 ? '✅' : '⚠️ '} ${path} — ${r.score}`);
  } catch (e) {
    results.push({ url, score: 0, failures: [{ id: 'error', title: e.message }] });
    console.log(`❌ ${path} — ERROR: ${e.message}`);
  }
}
await chrome.kill();

const outDir = join(__dirname, '..', 'docs', 'audit');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'a11y-latest.json'), JSON.stringify(results, null, 2));

const avg = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
const passing = results.filter((r) => r.score >= 95).length;
console.log(`\nSummary: ${passing}/${results.length} ≥95, avg ${avg}`);
console.log(`Full report: docs/audit/a11y-latest.json`);
```

- [ ] **Step 3: Add npm script alias in package.json**

Modify `package.json` scripts block:

```json
"scripts": {
  "dev": "astro dev --port 4321",
  "build": "astro build",
  "preview": "astro preview",
  "astro": "astro",
  "optimize-images": "node scripts/optimize-images.mjs",
  "audit-a11y": "node scripts/audit-a11y.mjs",
  "deploy": "npm run build && wrangler pages deploy dist --project-name respawn-kz --branch main --commit-dirty=true"
}
```

- [ ] **Step 4: Commit**

```bash
git checkout -b feat/a11y-audit
git add package.json package-lock.json scripts/audit-a11y.mjs
git commit -m "chore: add Lighthouse a11y audit script + npm dep"
```

---

## Task 2: Capture baseline scores

**Files:**
- Create: `docs/audit/a11y-baseline.md`

- [ ] **Step 1: Start dev server in background**

```bash
npm run dev
```

Expected: Astro dev server boots on `http://localhost:4321`. Wait until "ready" line appears.

- [ ] **Step 2: Run the audit (public pages only — auth-gated pages will hit login redirect)**

```bash
npm run audit-a11y
```

Expected: prints per-page score, summary line. Most pages likely score 80-95 based on current state. JSON written to `docs/audit/a11y-latest.json`.

- [ ] **Step 3: Save baseline as markdown table for spec record**

Read `docs/audit/a11y-latest.json` and create `docs/audit/a11y-baseline.md`:

```markdown
# A11y baseline (before SP9)

**Captured:** YYYY-MM-DD via `npm run audit-a11y` against `http://localhost:4321`.

| Page | Score | Top failures |
|---|---|---|
| /  | NN | violation-id-1, violation-id-2 |
| /clubs/cyberzone/ | NN | ... |

(populate from the JSON file)

**Avg:** NN — **Passing (≥95):** N/23
```

- [ ] **Step 4: Stop dev server**

```bash
# Kill the background dev server (PID from earlier or use ctrl+c in its tab)
```

- [ ] **Step 5: Commit**

```bash
git add docs/audit/a11y-baseline.md docs/audit/a11y-latest.json
git commit -m "docs: capture a11y baseline before SP9 fixes"
```

---

## Task 3: BaseLayout — noscript fallback + meta sanity

**Files:**
- Modify: `src/layouts/BaseLayout.astro`

- [ ] **Step 1: Add `<noscript>` fallback inside `<body>`**

In `src/layouts/BaseLayout.astro`, after `<a href="#main-content" class="skip-link">` (line ~75), add:

```astro
    <noscript>
      <div class="noscript-banner" role="alert">
        Для бронирования и личного кабинета требуется включить JavaScript.
      </div>
    </noscript>
```

Add minimal CSS for `.noscript-banner` to `src/styles/global.css` (find a top-banner section or add at end):

```css
.noscript-banner {
  background: var(--warning);
  color: var(--bg-base);
  padding: var(--space-3) var(--space-4);
  text-align: center;
  font-weight: 600;
}
```

- [ ] **Step 2: Verify dev preview renders noscript banner only when JS off**

Boot dev server, open `http://localhost:4321/`, view source — confirm `<noscript>` block present and not rendered visually with JS on.

- [ ] **Step 3: Commit**

```bash
git add src/layouts/BaseLayout.astro src/styles/global.css
git commit -m "a11y: add noscript fallback banner to BaseLayout"
```

---

## Task 4: Header — nav aria-label + aria-current + hamburger aria-expanded

**Files:**
- Modify: `src/components/Header.astro`
- Modify: `src/scripts/init.ts` (or wherever hamburger toggle lives — verify first)

- [ ] **Step 1: Locate hamburger toggle JS**

```bash
grep -rn "hamburger" src/scripts/
```

Expected: identify the file where `#hamburger` click handler lives. If none, mobile menu may not be implemented yet — note in commit message.

- [ ] **Step 2: Edit Header.astro — add nav aria-label, aria-current on active link, aria-expanded init on hamburger**

Replace `src/components/Header.astro` content with:

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
    <nav class="nav" id="nav" aria-label="Главная навигация">
      {navItems.map((item) => {
        const isActive = activeRoute === item.key;
        return (
          <a
            href={item.href}
            class:list={['nav__link', { 'nav__link--active': isActive }]}
            aria-current={isActive ? 'page' : undefined}
          >
            {item.label}
          </a>
        );
      })}
      <!-- Role-aware nav slots, populated by setupAuthButton in auth.ts -->
      <a href="/dashboard/" class="nav__link nav__link--cabinet" id="nav-cabinet" hidden>Кабинет</a>
      <a href="/admin/" class="nav__link nav__link--admin" id="nav-admin" hidden>Админка</a>
    </nav>
    <div class="header__actions">
      <div class="header__auth" id="header-auth">
        <a href="/login/" class="btn btn--ghost">Войти</a>
      </div>
      <button
        class="hamburger"
        id="hamburger"
        aria-label="Меню"
        aria-expanded="false"
        aria-controls="nav"
        type="button"
      >
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</header>
```

- [ ] **Step 3: Update hamburger toggle JS to flip aria-expanded**

In the file identified in Step 1 (likely `src/scripts/init.ts`), find the hamburger click handler. Update so it toggles `aria-expanded` in sync with menu visibility:

```typescript
const hamburger = document.getElementById('hamburger');
const nav = document.getElementById('nav');
hamburger?.addEventListener('click', () => {
  const isOpen = nav?.classList.toggle('nav--open') ?? false;
  hamburger.setAttribute('aria-expanded', String(isOpen));
});
```

(Adapt to match existing handler style — if it's already toggling a class, just add the aria-expanded setattr line.)

- [ ] **Step 4: Verify in preview**

Boot dev server, open `/`, tab through nav — active link should announce as "current page" (DevTools accessibility panel shows aria-current=page). Click hamburger on mobile viewport — aria-expanded flips.

- [ ] **Step 5: Commit**

```bash
git add src/components/Header.astro src/scripts/init.ts
git commit -m "a11y(header): nav aria-label, aria-current on active, hamburger aria-expanded"
```

---

## Task 5: Footer — landmark label + link audit

**Files:**
- Modify: `src/components/Footer.astro`

- [ ] **Step 1: Read current Footer to identify any bare-link text**

```bash
cat src/components/Footer.astro
```

- [ ] **Step 2: Add aria-label and verify link text**

In `src/components/Footer.astro`, change `<footer ...>` opening tag to:

```astro
<footer class="footer" aria-label="Подвал сайта">
```

Audit any link text inside — if there's a "тут" / "сюда" / "подробнее" without context, replace with descriptive text or add aria-label.

- [ ] **Step 3: Commit**

```bash
git add src/components/Footer.astro
git commit -m "a11y(footer): landmark aria-label"
```

---

## Task 6: Modal — focus trap + ESC + focus restore + inert background

**Files:**
- Modify: `src/components/Modal.astro` (no change needed — already has role+aria-modal+aria-labelledby)
- Create: `src/scripts/modal-a11y.ts`
- Modify: `src/scripts/init.ts` (wire up modal-a11y)
- Modify: `src/scripts/booking-form.ts` (call modal-a11y on open)

- [ ] **Step 1: Read current modal open/close mechanism**

```bash
grep -rn "modal" src/scripts/ | head -30
```

Identify: which script opens the modal (sets `hidden=false` on `#modal`)? Which closes it? Likely `booking-form.ts` shows it, and `data-modal-close` handlers (currently in Modal.astro markup) hide it.

- [ ] **Step 2: Create modal-a11y.ts with trap + ESC + restore**

Create `src/scripts/modal-a11y.ts`:

```typescript
// Modal accessibility: focus trap, ESC to close, focus restore, inert background.
// Call setupModalA11y() once at app boot. It listens for modal hidden→visible transitions
// via MutationObserver and applies the patterns.

let lastFocused: HTMLElement | null = null;
let trapHandler: ((e: KeyboardEvent) => void) | null = null;

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('hidden') && el.offsetParent !== null);
}

function activateTrap(modal: HTMLElement) {
  lastFocused = document.activeElement as HTMLElement;
  const focusables = getFocusable(modal);
  (focusables[0] ?? modal).focus();

  trapHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      deactivateTrap(modal);
      modal.hidden = true;
      return;
    }
    if (e.key !== 'Tab') return;
    const list = getFocusable(modal);
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement as HTMLElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', trapHandler);

  // Make background inert while modal is open
  document.querySelectorAll('main, footer, header').forEach((el) => {
    (el as HTMLElement).setAttribute('inert', '');
  });
}

function deactivateTrap(_modal: HTMLElement) {
  if (trapHandler) document.removeEventListener('keydown', trapHandler);
  trapHandler = null;
  document.querySelectorAll('main, footer, header').forEach((el) => {
    (el as HTMLElement).removeAttribute('inert');
  });
  lastFocused?.focus();
  lastFocused = null;
}

export function setupModalA11y() {
  const modal = document.getElementById('modal');
  if (!modal) return;
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'hidden') {
        if (modal.hidden) deactivateTrap(modal);
        else activateTrap(modal);
      }
    }
  });
  observer.observe(modal, { attributes: true, attributeFilter: ['hidden'] });
}
```

- [ ] **Step 3: Wire up in init.ts**

Open `src/scripts/init.ts`. Add import + call:

```typescript
import { setupModalA11y } from './modal-a11y';
// ... in the init function
setupModalA11y();
```

- [ ] **Step 4: Verify with preview**

Boot dev server, open `/clubs/cyberzone/`, click "Забронировать" — modal opens. Focus should be on first focusable (probably the date input or close button). Tab repeatedly — focus cycles inside modal, never goes to header/main. Press ESC — modal closes, focus returns to "Забронировать" button. Inspect — `<main>`, `<header>`, `<footer>` have `inert` attribute while modal open.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/modal-a11y.ts src/scripts/init.ts
git commit -m "a11y(modal): focus trap, ESC handler, focus restore, inert background"
```

---

## Task 7: RatingStars — true radiogroup keyboard nav

**Files:**
- Modify: `src/components/RatingStars.astro`
- Modify: `src/scripts/reviews-form.ts` (rating picker logic)

- [ ] **Step 1: Read current rating picker JS**

```bash
grep -n "rating-stars" src/scripts/reviews-form.ts
```

Identify: how is selected state currently tracked? Probably button click → set hidden input value + visual class.

- [ ] **Step 2: Replace RatingStars.astro with radiogroup pattern**

Replace `src/components/RatingStars.astro` content with:

```astro
---
interface Props {
  value: number;          // 0..5; may be float for display (e.g., 3.7)
  interactive?: boolean;  // true → renders radio-like buttons with arrow key nav
  size?: 'sm' | 'md' | 'lg';
}
const { value, interactive = false, size = 'md' } = Astro.props;
const cls = `rating-stars rating-stars--${size}${interactive ? ' rating-stars--interactive' : ''}`;
const wholeValue = Math.round(value);
---
{interactive ? (
  <div
    class={cls}
    data-value={value}
    role="radiogroup"
    aria-label="Оценка от 1 до 5"
  >
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        type="button"
        class="rating-stars__btn"
        data-rating-value={n}
        role="radio"
        aria-checked={n === wholeValue ? 'true' : 'false'}
        tabindex={n === (wholeValue || 1) ? 0 : -1}
        aria-label={`${n} ${n === 1 ? 'звезда' : n < 5 ? 'звезды' : 'звёзд'}`}
      >★</button>
    ))}
  </div>
) : (
  <span class={cls} aria-label={`Рейтинг ${value} из 5`} role="img">
    {[1, 2, 3, 4, 5].map((n) => (
      <span class:list={['rating-stars__star', { 'is-filled': n <= wholeValue }]} aria-hidden="true">★</span>
    ))}
  </span>
)}
```

- [ ] **Step 3: Update reviews-form.ts to handle arrow keys + tabindex rotation**

Open `src/scripts/reviews-form.ts`. Find the rating-stars click handler section. Add a keydown handler:

```typescript
function setupRatingStarsKeyboard(group: HTMLElement, onChange: (n: number) => void) {
  const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  group.addEventListener('keydown', (e) => {
    const current = document.activeElement as HTMLButtonElement;
    const idx = buttons.indexOf(current);
    if (idx === -1) return;
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % buttons.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + buttons.length) % buttons.length;
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const n = Number(current.dataset.ratingValue);
      onChange(n);
      return;
    } else return;
    e.preventDefault();
    buttons.forEach((b, i) => b.setAttribute('tabindex', i === next ? '0' : '-1'));
    buttons[next].focus();
    const n = Number(buttons[next].dataset.ratingValue);
    onChange(n);
  });
}

function updateRatingStarsState(group: HTMLElement, n: number) {
  group.querySelectorAll<HTMLButtonElement>('[role="radio"]').forEach((b, i) => {
    const v = i + 1;
    b.setAttribute('aria-checked', v === n ? 'true' : 'false');
    b.setAttribute('tabindex', v === n ? '0' : '-1');
    b.classList.toggle('is-active', v <= n);
  });
}
```

Call `setupRatingStarsKeyboard` once in the form setup function, and call `updateRatingStarsState` from both the click handler and the keyboard onChange callback. The existing click handler should also use `updateRatingStarsState` instead of ad-hoc class toggling.

- [ ] **Step 4: Verify in preview**

Open `/reviews/new/` (requires logged-in + completed booking — use a synthetic or take from `/me`). Tab to rating-stars group — focus lands on currently-selected star (default star 1 since value is 0). Press →/↓ — focus moves to next star, aria-checked updates, visual state updates. Shift+Tab leaves the group entirely (doesn't cycle through all 5 stars when leaving). Submit form — selected value persists.

- [ ] **Step 5: Commit**

```bash
git add src/components/RatingStars.astro src/scripts/reviews-form.ts
git commit -m "a11y(rating): true radiogroup with arrow key nav, tabindex rotation"
```

---

## Task 8: Forms — labels, error linking, aria-live banners

**Files:**
- Modify: `src/pages/login.astro`
- Modify: `src/pages/reviews/new.astro`
- Modify: `src/pages/dashboard/register.astro`
- Modify: `src/pages/dashboard/club/edit.astro`
- Modify: `src/pages/admin/applications.astro`
- Modify: `src/scripts/booking-form.ts` (modal form fields)

For each file, apply this pattern:

- [ ] **Step 1: Audit one form at a time. Start with `/login`**

Open `src/pages/login.astro`. For the email input:
- Ensure `<label for="login-email">` precedes the input
- Input has `id="login-email"`, `aria-describedby="login-error"`, `aria-invalid` toggled on error
- Status banner has `aria-live="polite"` and `role="status"`

Expected change pattern:

```astro
<form>
  <label for="login-email">Email</label>
  <input
    type="email"
    id="login-email"
    name="email"
    required
    aria-describedby="login-error login-success"
    aria-invalid="false"
  />
  <div id="login-error" class="form-error" aria-live="polite" hidden></div>
  <div id="login-success" class="form-success" aria-live="polite" role="status" hidden></div>
  <button type="submit">Получить ссылку</button>
</form>
```

In the corresponding script that handles submit, set `aria-invalid` on error and clear it on success.

- [ ] **Step 2: Apply same pattern to `/reviews/new`**

Already partly correct (textarea has char counter). Add aria-live to the success/error container; aria-describedby on textarea pointing to char counter + error region.

- [ ] **Step 3: Apply same pattern to `/dashboard/register`**

This is the B2B registration form — multiple inputs. Add labels (or aria-label), aria-describedby, aria-live status banner.

- [ ] **Step 4: Apply same pattern to `/dashboard/club/edit`**

Long form. Group fields with `<fieldset>` + `<legend>`:

```astro
<fieldset>
  <legend>Контакты</legend>
  <label for="club-phone">Телефон</label>
  <input id="club-phone" type="tel" ... />
  <label for="club-address">Адрес</label>
  <input id="club-address" type="text" ... />
</fieldset>

<fieldset>
  <legend>Цены</legend>
  ...
</fieldset>
```

- [ ] **Step 5: Apply to `/admin/applications` reject-with-reason modal form**

The reason textarea needs a label.

- [ ] **Step 6: Apply to booking form (modal)**

In `src/scripts/booking-form.ts` — the form is generated dynamically. Ensure the date/time/hours inputs each get labels, the conflict-error region has aria-live.

- [ ] **Step 7: Verify all forms in preview**

For each form: tab through, verify focus visible, each input announces its label, submit with empty fields → error appears + announced via aria-live, submit valid → success appears + announced.

- [ ] **Step 8: Commit (one big commit covering all form fixes)**

```bash
git add src/pages/login.astro src/pages/reviews/new.astro src/pages/dashboard/register.astro src/pages/dashboard/club/edit.astro src/pages/admin/applications.astro src/scripts/booking-form.ts
git commit -m "a11y(forms): labels, aria-describedby errors, aria-live status banners"
```

---

## Task 9: Icon-only buttons — aria-label sweep

**Files:**
- Find via: `grep -rn "<button" src/components src/pages` filtered to ones without visible text

- [ ] **Step 1: Identify icon-only buttons**

```bash
grep -rEn '<button[^>]*>[^<]*[★✕✓×→←↑↓⚙][^<]*</button>' src/
```

And inspect any button with only an SVG child or a `data-action` icon class. Modal close `✕` is already labeled (verified in Task 6).

Likely candidates:
- Sort/filter toggles in `/clubs/`
- "Скрыть" / "Показать" buttons in `/admin/reviews/`
- Cancel/edit buttons on bookings in `/me/`

- [ ] **Step 2: Add aria-label to each icon-only button**

For each match, ensure `aria-label="<verb> <object>"`. Examples:
- `<button aria-label="Сортировка">⚙</button>`
- `<button aria-label="Скрыть отзыв">скрыть</button>` (if visible text is too short to be clear standalone, still add aria-label for SR users)

- [ ] **Step 3: Verify in preview**

Inspect each button in DevTools accessibility panel — name field should be populated and meaningful.

- [ ] **Step 4: Commit**

```bash
git add <files modified>
git commit -m "a11y: aria-label sweep on icon-only buttons"
```

---

## Task 10: Status pills — aria-label for state

**Files:**
- Modify: `src/scripts/me-page.ts` (renders pending/confirmed/cancelled pills)
- Modify: `src/scripts/dashboard-bookings.ts` (admin view of same)
- Modify: `src/scripts/admin-reviews.ts` (review status pills)
- Modify: `src/scripts/admin-applications.ts` (application status pills)
- Modify: `src/components/ClubCard.astro` (rating pill)

- [ ] **Step 1: Update me-page.ts pill rendering**

Find where the pill HTML is built. Add aria-label spelling out the status:

```typescript
const STATUS_LABEL = {
  pending: 'Статус: ожидает подтверждения',
  confirmed: 'Статус: подтверждено',
  cancelled: 'Статус: отменено',
  completed: 'Статус: завершено',
};

// in the render function:
`<span class="pill pill--${status}" aria-label="${STATUS_LABEL[status]}">${displayText}</span>`;
```

- [ ] **Step 2: Apply same pattern to dashboard-bookings.ts, admin-reviews.ts, admin-applications.ts**

Define the relevant STATUS_LABEL map per page and use it in the render.

- [ ] **Step 3: ClubCard.astro rating pill**

Modify the rating pill markup:

```astro
<span class="pill pill--rating" aria-label={`Рейтинг ${club.rating.toFixed(1)} из 5`}>
  <span aria-hidden="true">★</span> {club.rating.toFixed(1)}
</span>
```

- [ ] **Step 4: Verify in preview**

Open `/me`, `/admin/reviews`, `/admin/applications`, `/clubs/` — inspect a status pill / rating pill in DevTools accessibility panel — name should spell out the status, not just the visual character.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/me-page.ts src/scripts/dashboard-bookings.ts src/scripts/admin-reviews.ts src/scripts/admin-applications.ts src/components/ClubCard.astro
git commit -m "a11y(pills): aria-label spelling out status, not color alone"
```

---

## Task 11: AmbientBackground — aria-hidden

**Files:**
- Modify: `src/components/AmbientBackground.astro`

- [ ] **Step 1: Read current AmbientBackground**

```bash
cat src/components/AmbientBackground.astro
```

- [ ] **Step 2: Add aria-hidden to root element**

In `src/components/AmbientBackground.astro`, find the root element (likely `<div class="ambient-background">` or similar). Add `aria-hidden="true"`:

```astro
<div class="ambient-background" aria-hidden="true">
  ...
</div>
```

- [ ] **Step 3: Verify prefers-reduced-motion respected**

Open `src/styles/global.css`, grep for `prefers-reduced-motion`:

```bash
grep -n "prefers-reduced-motion" src/styles/global.css
```

If the rule that disables ambient animations is missing, restore:

```css
@media (prefers-reduced-motion: reduce) {
  .ambient-background,
  .ambient-background * {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/AmbientBackground.astro src/styles/global.css
git commit -m "a11y(ambient): aria-hidden + verify reduced-motion"
```

---

## Task 12: DashboardNav — nav landmark + aria-current

**Files:**
- Modify: `src/components/DashboardNav.astro`

- [ ] **Step 1: Read current DashboardNav**

```bash
cat src/components/DashboardNav.astro
```

- [ ] **Step 2: Wrap in nav + add aria-current**

Modify root element to `<nav aria-label="Кабинет">`. For each link, add `aria-current={isActive ? 'page' : undefined}` where `isActive` is computed from the current pathname or an `activeRoute` prop similar to Header.

- [ ] **Step 3: Verify in preview**

Open `/me/`, `/admin/`, `/dashboard/` — check that the active sidebar item has `aria-current="page"` in DOM.

- [ ] **Step 4: Commit**

```bash
git add src/components/DashboardNav.astro
git commit -m "a11y(dashboard-nav): nav landmark + aria-current on active item"
```

---

## Task 13: ClubCard — link semantics

**Files:**
- Modify: `src/components/ClubCard.astro`

- [ ] **Step 1: Read current ClubCard**

```bash
cat src/components/ClubCard.astro
```

- [ ] **Step 2: Decide pattern based on current state**

If the card already has a "Подробнее" link or the whole card is a single `<a>`, leave structure. If the title is the only link but the entire card is clickable via JS — refactor:

**Option A (preferred if HTML is simple):** wrap entire card in single `<a href="/clubs/<slug>/">`:

```astro
<a href={`/clubs/${club.slug}/`} class="club-card" aria-labelledby={`club-${club.slug}-title`}>
  ...
  <h3 id={`club-${club.slug}-title`}>{club.name}</h3>
  ...
</a>
```

(remove any duplicate nested `<a>` to the same URL — nested links are invalid HTML)

**Option B (if card has multiple action targets):** keep separate links with descriptive text or aria-label.

- [ ] **Step 3: Verify in preview**

Open `/clubs/`, tab through — focus moves card-by-card (Option A) or per-link (Option B). Screen reader announces each card's name as the link target.

- [ ] **Step 4: Commit**

```bash
git add src/components/ClubCard.astro
git commit -m "a11y(club-card): link semantics, aria-labelledby for card-wide link"
```

---

## Task 14: Cookie banner — region role + focus management

**Files:**
- Modify: `src/scripts/cookie-banner.ts`

- [ ] **Step 1: Read current cookie banner**

```bash
cat src/scripts/cookie-banner.ts
```

- [ ] **Step 2: Add role + aria-label to banner element creation**

Find where the banner DOM is created (likely `document.createElement('div')` or template string). Add attributes:

```typescript
banner.setAttribute('role', 'region');
banner.setAttribute('aria-label', 'Согласие на использование cookies');
```

- [ ] **Step 3: Move focus to accept button when banner appears**

After appending to body:

```typescript
const acceptBtn = banner.querySelector<HTMLButtonElement>('[data-cookie-accept]');
acceptBtn?.focus();
```

- [ ] **Step 4: Verify in preview**

Clear localStorage `respawn.cookies.consent`, reload page. Banner should appear and focus should be on accept button (visible focus ring). Tab cycles between accept/decline within the banner if possible; dismissing the banner returns focus to body (or wherever it was).

- [ ] **Step 5: Commit**

```bash
git add src/scripts/cookie-banner.ts
git commit -m "a11y(cookies): region role, focus to accept button on appearance"
```

---

## Task 15: Contrast refactor — global.css and component CSS

**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: Identify all violet-as-text usages**

```bash
grep -n "color:.*var(--c-violet-[3-6]" src/styles/global.css
grep -n "color:.*var(--accent)" src/styles/global.css
grep -rn "color:.*var(--c-violet-[3-6]" src/components src/pages
grep -rn "color:.*var(--accent)" src/components src/pages
```

- [ ] **Step 2: For each occurrence, classify**

For each hit, decide:
- **Keep:** font-size ≥ 24px AND font-weight ≥ 600 (large-text WCAG exemption — passes 3:1) → leave as `--c-violet-300/500`
- **Migrate to text-primary:** body text that is critical (headings of any size for AA, links, paragraphs) → change to `var(--text-primary)`
- **Migrate to text-secondary:** non-critical labels/captions → change to `var(--text-secondary)`
- **Use violet-300 if must keep purple feel:** `var(--c-violet-300)` is `#c4b5fd` (~7.5:1) which passes AA for body text → safe replacement when keeping purple identity matters

Examples expected from earlier grep:
- `global.css:442` `color: var(--c-violet-500, #8b5cf6);` — fails AA. Audit context: what is this selector? Migrate or upgrade to violet-300.
- `global.css:3105`, `3308`, `3422` — similar audit.
- `global.css:340`, `1061` `color: var(--c-violet-300)` — likely passes; verify.

- [ ] **Step 3: Apply migrations**

Edit `src/styles/global.css` per the classification. Sample diff:

```css
/* Before */
.club-card__name {
  color: var(--c-violet-500, #8b5cf6);
}

/* After (assuming it's a heading-large) */
.club-card__name {
  color: var(--text-primary);  /* was var(--c-violet-500), fails WCAG AA body */
}
```

- [ ] **Step 4: Verify with Chrome DevTools contrast checker**

Boot dev server. Open `/clubs/`, inspect club name in DevTools → Accessibility tab → Contrast — should show ≥ 4.5 ratio. Repeat on `/clubs/cyberzone/` for any other migrated element.

- [ ] **Step 5: Run a11y audit to see contrast violations clearing**

```bash
npm run audit-a11y
```

Check `color-contrast` failures in `docs/audit/a11y-latest.json` — should be empty or near-empty.

- [ ] **Step 6: Commit**

```bash
git add src/styles/global.css src/components src/pages
git commit -m "a11y(contrast): migrate violet-as-text to text-primary/secondary; keep violet as accent"
```

---

## Task 16: Page-specific patches — clubs/[slug]

**Files:**
- Modify: `src/pages/clubs/[slug].astro`

- [ ] **Step 1: Gallery alt text**

Find the gallery section. Each `<img>` should have meaningful alt:

```astro
{club.gallery.map((src, i) => (
  <img src={src} alt={`${club.name} — фото ${i + 1}`} loading="lazy" />
))}
```

- [ ] **Step 2: Breadcrumbs aria-label**

If breadcrumbs exist:

```astro
<nav class="breadcrumb" aria-label="Хлебные крошки">
  <a href="/">Главная</a> / <a href="/clubs/">Клубы</a> / <span aria-current="page">{club.name}</span>
</nav>
```

If they don't exist, skip — out of scope.

- [ ] **Step 3: Reviews "Показать ещё" button aria-controls**

In the reviews section, the button:

```astro
<button data-show-more-reviews aria-controls="reviews-list" aria-expanded="false">Показать ещё</button>
```

(`aria-controls` value is the list container's id; `aria-expanded` toggled by `src/scripts/club-reviews.ts` — verify and add toggling line.)

- [ ] **Step 4: Verify in preview + commit**

```bash
git add src/pages/clubs/[slug].astro src/scripts/club-reviews.ts
git commit -m "a11y(clubs/[slug]): gallery alt, breadcrumbs label, show-more aria-controls"
```

---

## Task 17: Page-specific patches — me + admin pages

**Files:**
- Modify: `src/pages/me.astro` + `src/scripts/me-page.ts`
- Modify: `src/pages/admin/reviews.astro` + `src/scripts/admin-reviews.ts`
- Modify: `src/pages/admin/applications.astro` + `src/scripts/admin-applications.ts`

- [ ] **Step 1: /me — list semantics + action button aria-label**

In `src/scripts/me-page.ts`, change the booking-list container from `<div>` to `<ul>`, each booking from `<div>` to `<li>`. Action buttons get aria-label including booking identifier:

```typescript
const aria = `Бронь в ${booking.club_name} ${booking.date} ${booking.time_slot}`;
`<button data-cancel="${booking.id}" aria-label="Отменить ${aria}">Отменить</button>`;
`<button data-edit="${booking.id}" aria-label="Изменить ${aria}">Изменить</button>`;
`<a href="/reviews/new?booking_id=${booking.id}" aria-label="Оставить отзыв на ${aria}">Оставить отзыв</a>`;
```

- [ ] **Step 2: /admin/reviews — filter label + row action aria-label**

In `src/pages/admin/reviews.astro`, the status filter `<select>`:

```astro
<label for="status-filter">Фильтр по статусу</label>
<select id="status-filter">...</select>
```

In `src/scripts/admin-reviews.ts`, hide/unhide buttons:

```typescript
const aria = `отзыв ${review.text.slice(0, 30)}…`;
`<button data-hide="${review.id}" aria-label="Скрыть ${aria}">Скрыть</button>`;
`<button data-unhide="${review.id}" aria-label="Показать ${aria}">Показать</button>`;
```

- [ ] **Step 3: /admin/applications — same pattern**

Filter label, approve/reject buttons aria-label with applicant identifier.

- [ ] **Step 4: Verify + commit**

```bash
git add src/pages/me.astro src/scripts/me-page.ts src/pages/admin/reviews.astro src/scripts/admin-reviews.ts src/pages/admin/applications.astro src/scripts/admin-applications.ts
git commit -m "a11y(me+admin): list semantics, aria-label on row actions, filter labels"
```

---

## Task 18: Full Lighthouse sweep + results table

**Files:**
- Modify: `docs/audit/a11y-baseline.md` (append "after" table)

- [ ] **Step 1: Boot dev server**

```bash
npm run dev
```

- [ ] **Step 2: Run audit**

```bash
npm run audit-a11y
```

- [ ] **Step 3: Read JSON results, build "after" table**

Read `docs/audit/a11y-latest.json`. Append to `docs/audit/a11y-baseline.md`:

```markdown
## After SP9 fixes (YYYY-MM-DD)

| Page | Score | Δ vs baseline |
|---|---|---|
| / | NN | +NN |
| ... |

**Avg:** NN — **Passing (≥95):** N/23
```

- [ ] **Step 4: Identify any page still <95**

For each page below 95, inspect the `failures` array in JSON. Note which audit ids fail (e.g., `color-contrast`, `aria-allowed-attr`, `link-name`). Decide: add a follow-up task in this plan OR add to spec's "out-of-band cleanup" section if minor.

- [ ] **Step 5: Commit**

```bash
git add docs/audit/a11y-baseline.md docs/audit/a11y-latest.json
git commit -m "docs(a11y): post-SP9 audit results — score table"
```

---

## Task 19: Targeted fixes for pages still <95

**Files:** Vary by findings — typically the page-specific `.astro` or its companion script in `src/scripts/`. Expect 0-3 source files to touch in this task; if zero (already at ≥95 across the board), skip steps 1-2 and just record "no targeted fixes needed" in the audit doc.

- [ ] **Step 1: For each page still <95, fix the specific failing audits**

Pattern: read JSON, see what's failing, apply fix to the specific page or shared component.

Common remaining failures and fixes:
- `link-name`: add aria-label or text to link
- `image-alt`: add alt attribute
- `tabindex`: remove `tabindex="0"` from non-interactive elements
- `aria-required-children`: nested ARIA structure broken — fix nesting
- `target-size`: increase tap target to ≥ 24x24px (Lighthouse threshold)

- [ ] **Step 2: Re-run audit until all pages ≥95**

```bash
npm run audit-a11y
```

- [ ] **Step 3: Update results table + commit**

```bash
git add <files> docs/audit/a11y-baseline.md docs/audit/a11y-latest.json
git commit -m "a11y: targeted fixes to reach ≥95 on all pages"
```

---

## Task 20: Keyboard nav manual test — customer flow

**Files:**
- Create: `docs/audit/keyboard-test-customer.md`

- [ ] **Step 1: Disconnect mouse / disable trackpad. Boot prod-like preview**

```bash
npm run build && npm run preview
```

Open `http://localhost:4321/` in browser. Use only keyboard.

- [ ] **Step 2: Execute the customer flow**

Steps (note any failure or unfocusable element):
1. Tab from address bar into page — first focus should be the skip-link
2. Enter on skip-link — focus jumps to `<main>`
3. Shift+Tab to header — Tab through Logo, nav items, login button
4. Tab to "Каталог" link → Enter → /clubs
5. Tab to first ClubCard → Enter → /clubs/<slug>
6. Tab to "Забронировать" → Enter → modal opens
7. Verify focus inside modal, Tab cycles, ESC closes
8. Re-open modal, fill in fields with keyboard, submit
9. Magic link flow: navigate to /login, fill email, submit
10. After callback, navigate to /me, Tab through bookings list
11. Find a completed booking with no review, Tab to "Оставить отзыв" → Enter → /reviews/new
12. Tab to rating-stars group, arrow keys to set rating, Tab to textarea, type, Tab to submit
13. Back to /me, Tab to "Изменить" on a pending booking → Enter → reschedule modal
14. Logout via user menu

- [ ] **Step 3: Write findings**

Create `docs/audit/keyboard-test-customer.md`:

```markdown
# Keyboard nav test — customer flow

**Date:** YYYY-MM-DD
**Build:** dist commit <SHA>

| # | Step | Result | Notes |
|---|---|---|---|
| 1 | Tab to skip-link | ✅ | visible focus |
| 2 | Enter on skip-link | ✅ | focus jumps to main |
| ... |

## Issues found
- (none) OR
- Step N: ...

## Resolution
All issues fixed in commit <SHA>.
```

- [ ] **Step 4: Fix any issues found, re-test**

If anything fails, fix in source, rebuild, repeat the failing step. Update results table.

- [ ] **Step 5: Commit**

```bash
git add docs/audit/keyboard-test-customer.md <any source fixes>
git commit -m "test(a11y): customer keyboard nav flow verified"
```

---

## Task 21: Keyboard nav manual test — admin flow

**Files:**
- Create: `docs/audit/keyboard-test-admin.md`

- [ ] **Step 1: Login as super_admin (existing test user)**

Use the existing super_admin user (zhandos397@gmail.com) — magic link via keyboard from /login.

- [ ] **Step 2: Execute admin flow**

Steps:
1. After auth, navigate via user menu → "Админка"
2. Tab through DashboardNav sidebar — active item announces aria-current=page
3. Navigate to /admin/reviews
4. Tab to status filter (`<select>`), use arrow keys to filter to "Опубликованные"
5. Tab to first row "Скрыть" button — focus visible, aria-label includes review snippet
6. Enter on "Скрыть" — reason modal opens, focus inside, Tab through, submit
7. Verify list updates, hidden review now has "Показать" button
8. Navigate to /admin/applications
9. Tab through list, Enter on "Одобрить" or "Отклонить"
10. Reject modal has reason textarea — Tab to it, fill, submit

- [ ] **Step 3: Document findings**

Create `docs/audit/keyboard-test-admin.md` with same structure as Task 20.

- [ ] **Step 4: Fix + commit**

```bash
git add docs/audit/keyboard-test-admin.md <any source fixes>
git commit -m "test(a11y): admin keyboard nav flow verified"
```

---

## Task 22: Build + final smoke + merge prep

**Files:**
- Modify: `HANDOFF.md` (if present and applicable)
- Update: Obsidian — append session to `08 Sessions/2026-05-18.md`, append decision to `decisions.md`, mark items resolved in `open-questions.md`

- [ ] **Step 1: Type-check + build**

```bash
npm run astro check
npm run build
```

Expected: type-check passes, build emits `dist/` without errors.

- [ ] **Step 2: Local preview smoke**

```bash
npm run preview
```

Visit 5 representative pages, click through booking flow, login flow.

- [ ] **Step 3: Production deploy**

```bash
npm run deploy
```

Expected: Cloudflare Pages deploy completes, https://respawn.kz updated.

- [ ] **Step 4: Production smoke**

Manually visit `https://respawn.kz/`, `/clubs/`, `/clubs/cyberzone/`, `/login/`, `/me/` (logged in), `/admin/reviews/` — confirm no console errors, focus visible, modals open correctly.

- [ ] **Step 5: Re-run audit against prod**

```bash
npm run audit-a11y https://respawn.kz
```

Expected: scores match local. Append production-audit results to `docs/audit/a11y-baseline.md` for the record.

- [ ] **Step 6: Update Obsidian docs**

Append to `07 Dev Projects/almaty-gg/decisions.md`:

```markdown
## 2026-05-18 — A11y audit & contrast refactor (SP9) SHIPPED

Lighthouse a11y ≥ 95 on all 23 public + auth-gated pages. Violet accent migrated out of body-text contexts; cyan stays as success-state and brand accent in non-text uses. Shared-component fixes covered most pages — modal focus trap, RatingStars true radiogroup with arrow nav, form labels + aria-live banners, nav landmarks with aria-current, status pills with aria-label spelling out state. Two keyboard-only flow tests (customer + admin) pass without mouse.

Files changed: 17. New devDep: lighthouse + chrome-launcher. New scripts: scripts/audit-a11y.mjs, docs/audit/* (baseline + keyboard test logs).

Deferred from Block 5: 5.4 per-page og:image, 5.7 Service Worker, 5.9 loading states + error boundaries.
```

Append to `08 Sessions/2026-05-18.md` using the journal template.

Mark `## 2026-05-18 — SEO + a11y baseline` resolved in `open-questions.md` (or add a new section noting Block 5.8 closed).

- [ ] **Step 7: Merge branch to main**

```bash
git checkout main
git merge --ff-only feat/a11y-audit
git push origin main
git branch -d feat/a11y-audit
```

- [ ] **Step 8: Final commit on main (Obsidian docs)**

(Obsidian edits land in the vault, not the repo — no commit needed.)

---

## Definition of Done

- [ ] Lighthouse a11y ≥ 95 on every page in the audit list (verified twice: local dev + prod)
- [ ] Results table committed to `docs/audit/a11y-baseline.md` (before + after)
- [ ] Two keyboard test logs committed (`docs/audit/keyboard-test-customer.md`, `keyboard-test-admin.md`)
- [ ] No new TypeScript or Astro build errors (`npm run astro check && npm run build` clean)
- [ ] Production deploy live at https://respawn.kz with no console errors
- [ ] Obsidian decisions.md + sessions journal updated
- [ ] Branch merged FF to main, pushed, branch deleted
