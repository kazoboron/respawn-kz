# respawn.kz — A11y audit & contrast refactor (SP9)

**Date:** 2026-05-18
**Author:** Claude (brainstormed with user)
**Status:** Design (pre-plan)
**Roadmap reference:** Block 5 — SEO + PWA + a11y, sub-item 5.8 (formal a11y audit + fixes)

## Context

Block 5 of the technical roadmap was largely shipped on 2026-05-16 in a single SEO/PWA/a11y baseline commit:

- ✅ `@astrojs/sitemap` integrated (`sitemap-index.xml` + `sitemap-0.xml`, 17 public URLs)
- ✅ `public/robots.txt` with explicit sitemap reference
- ✅ Schema.org `GameServer` JSON-LD on club pages (with `aggregateRating`, `PostalAddress`, `openingHoursSpecification`); enhanced in SP6 with `Review` array
- ✅ Open Graph + Twitter Card meta in `BaseLayout.astro` (uses generic `/img/club-hero.webp` per page)
- ✅ `manifest.webmanifest` with shortcuts to `/clubs/` and `/me/`
- ✅ Skip link to `#main-content`, `:focus-visible` outlines, `prefers-reduced-motion`, `.sr-only` utility

What was left deferred from Block 5:

- **5.4** Per-page `og:image` (currently shares one image)
- **5.7** Service Worker / offline cache via `@vite-pwa/astro`
- **5.8** Formal a11y audit + fixes (this spec)
- **5.9** Loading states + error boundaries on async calls

This spec covers **5.8 only**. 5.4, 5.7, 5.9 stay deferred — separate specs when picked up.

## Goal

Bring **Lighthouse a11y ≥ 95** on every page in `npm run build` output (~27 pages: 17 public + ~10 auth-gated) while keeping the existing brand identity intact. Achieve WCAG AA contrast across all text and UI components. Ship without breaking customer or admin flows.

## Non-goals

- Per-page `og:image` (deferred, separate spec)
- Service Worker / offline (deferred, separate spec)
- WCAG AAA strict (we target AA only)
- Screen-reader UX deep test (manual NVDA/VoiceOver pass) — Lighthouse + manual aria pass is sufficient for MVP scale
- Axe-core CI integration as a hard requirement — optional tooling deliverable, marked as nice-to-have
- Loading states / error boundaries on async calls (5.9, deferred)

## Strategy

Hybrid approach: shared-component fixes drive most of the score, validated by Lighthouse across all pages.

1. **Baseline audit** — Lighthouse a11y on 5 representative pages (`/`, `/clubs/cyberzone/`, `/me/`, `/admin/reviews/`, `/login/`) → pattern list
2. **Shared-component fixes** — apply systematic patterns in components that render on every page (`BaseLayout`, `Header`, `Footer`, `Modal`, `RatingStars`, `ClubCard`, `DashboardNav`, forms)
3. **Contrast refactor** — audit `--accent` (violet `#8b5cf6`) and `--text-muted` (`#837ba0`) usages; migrate text-as-accent to `--text-primary`/`--text-secondary`; keep violet as decorative (border/glow/gradient)
4. **Full Lighthouse sweep** — all ~27 pages, score ≥ 95 on each, documented in a results table
5. **Page-specific patches** — targeted fixes for remaining issues
6. **Keyboard nav manual test** — two end-to-end flows with keyboard only

Regression tooling (Lighthouse-CI, axe-core dev integration) is **not part of this round's deliverable**. Tracked as a follow-up spec if regressions appear post-ship.

## Contrast strategy — Option 4: restrict accent to non-text

The brand palette uses violet (`--c-violet-500: #8b5cf6`) as the primary accent. On the deep cosmic-indigo background (`--bg-base: #07061a`) violet text typically scores ~3.6:1, which **fails WCAG AA 4.5:1 for body text** but passes the 3:1 bar for large text (≥18pt regular or ≥14pt bold) and UI components.

Decision: violet stays as the brand color, but **only in non-text contexts**:
- Borders, dividers, focus rings
- Gradient anchors (paired with lighter stops for headings)
- Glow shadows on cards / buttons
- Decorative SVG strokes (logo, ambient background)
- Icon fills where adjacent text conveys meaning
- Large-text-only allowed (`font-size: ≥ 24px` and `font-weight: ≥ 600` — explicit per-usage check)

For body text and standalone numeric values currently using violet → migrate to `--text-primary` (`#f5f4ff`, ~17:1) or `--text-secondary` (`#c4bedb`, ~11:1). The `--text-muted` (`#837ba0`, ~5:1) passes AA for body text but tight — verify it isn't used for critical info.

Specific token migrations expected (from initial grep on `global.css`):

| Line | Current | Action |
|---|---|---|
| 340, 1061 | `color: var(--c-violet-300)` (#c4b5fd, passes AA) | Keep — light violet passes |
| 442, 854, 3105, 3308, 3422 | `color: var(--c-violet-500/400)` on body context | Migrate to `--text-secondary` or check large-text exemption |
| 3302, 3662 | `border-color: var(--c-violet-500)` | Keep — borders only need 3:1 |

Each occurrence audited in implementation phase, not blanket replace. The grep finds ~10 hits in `global.css`; component-level `.astro` files need parallel sweep.

## Shared-component fixes

### `BaseLayout.astro`
- Already: `<html lang="ru">`, skip link, `<main id="main-content" tabindex="-1">`, canonical, Open Graph
- Add: verify `title` prop is unique and meaningful per page (audit checklist, not a code change)
- Add: `<noscript>` fallback message for JS-dependent flows (booking, reviews, dashboard)

### `Header.astro`
- Add `aria-label="Главная навигация"` to `<nav>`
- Add `aria-current="page"` to active nav link (currently `activeRoute` drives styling but not semantics)
- Mobile burger menu: `aria-expanded` toggled, `aria-controls` pointing to menu ID, `aria-haspopup="true"`
- User-menu dropdown (avatar): same pattern
- Trap focus inside open mobile menu; ESC closes

### `Footer.astro`
- Wrap landmark in `<footer>` (verify)
- Add `aria-label="Подвал"` if multiple footers exist on dashboard pages
- Verify all link text is descriptive (no bare "сюда" or "тут")

### `Modal.astro`
- Add `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to modal title element
- Focus trap: on open, focus first focusable; on close, restore focus to element that opened it
- ESC key closes; backdrop click closes (verify both, add whichever is missing)
- Inert background content while open: apply `inert` attribute to `<main>` and `<footer>` while modal is open

### `RatingStars.astro`
- Interactive mode: container `role="radiogroup"` + `aria-label="Оценка от 1 до 5"`
- Each star: `role="radio"`, `aria-checked` reflects state, `tabindex` rotation (only one in tab order at a time)
- Keyboard: ←/→/↑/↓ navigate, Space/Enter select
- Read-only mode: render as plain text `<span aria-label="Оценка 5 из 5">★★★★★ 5.0</span>` — visual stars decorative

### `ClubCard.astro`
- Decide pattern: either the whole card is wrapped in `<a>` (single link), or only the title is the link with `aria-labelledby` to the card. Audit current state, pick one.
- Rating pill: text already says "5.0" — ensure `aria-label="Рейтинг 5.0 из 5"` since the visual ★ alone isn't readable
- Tags: `<ul role="list">` with `<li>` items (text-only tags don't need extra ARIA)

### `DashboardNav.astro`
- Wrap in `<nav aria-label="Кабинет">`
- Active item gets `aria-current="page"`
- Icon-only state on mobile: ensure each item has accessible text (sr-only or aria-label)

### Forms (`/login`, `/reviews/new`, `/dashboard/club/edit`, `/dashboard/register`, modal booking forms, `/admin/applications`)
- Every input has `<label for="X">` OR `aria-label`
- Errors linked via `aria-describedby="X-error"` and `aria-invalid="true"`
- Submit + success/error banners: `aria-live="polite"` on the banner container so screen readers announce changes
- Submit buttons: clear text (Войти / Забронировать / Опубликовать), not generic Submit
- Char counters (e.g. review textarea): `aria-live="polite"` + announce milestones, or hidden from AT if visual only

### Cookie banner (`src/scripts/cookie-banner.ts`)
- `role="region"` + `aria-label="Согласие на использование cookies"`
- Focus moves to banner accept button on first appearance
- After dismiss, focus returns to where it was (or body if it was an initial page-load banner)

### Pills & badges (`.pill`, `.pill--rating`, `.pill--pending|confirmed|cancelled`, `.tag`)
- Status pills convey state via color alone right now — add `aria-label` that spells out the status: "Статус брони: ожидает подтверждения"
- Rating pill: see RatingStars section
- Tags: plain text is fine, no extra ARIA

### Icon-only buttons (Modal close X, cancel buttons in dashboard tables, sort/filter toggles)
- Every icon-only button gets `aria-label`
- Loading-state buttons: `aria-busy="true"` toggled while in-flight

### `AmbientBackground.astro`
- `aria-hidden="true"` (decorative)
- Verify `prefers-reduced-motion` still respected (was added in earlier baseline); restore if regressed

## Page-specific expected fixes

Most pages will be covered by shared-component fixes. Expected page-level work (refined during audit):

- **`/`** (landing) — Hero CTA buttons clearly labeled; FAQ accordion needs `aria-expanded`/`aria-controls` if interactive
- **`/clubs/[slug]`** — Gallery `<img>` tags need real `alt` text from club data; section headings unique `<h2>`s; breadcrumb nav has `aria-label="Хлебные крошки"`; reviews "Показать ещё" button uses `aria-controls` pointing to list region
- **`/me`** — Empty state has heading + clear CTA; booking cards use `<ul>`/`<li>` semantic list; "Изменить" / "Отменить" / "Оставить отзыв" buttons get explicit text or aria-label including booking identifier ("Отменить бронь в Cyberzone 18 мая 14:00")
- **`/admin/reviews`** — Status filter is native `<select>` with `<label>`; per-row action buttons aria-label with review identifier
- **`/admin/applications`** — same pattern as reviews
- **`/dashboard/club/edit`** — Long form with multiple sections: use `<fieldset>`/`<legend>` for groups; gallery upload region announces uploads via aria-live
- **`/reviews/new`** — Already needs RatingStars fix; char-counter aria-live setup; submit feedback announcement

## Verification

### Lighthouse pass protocol
- Run Lighthouse a11y in Chrome DevTools (Desktop preset) against `https://respawn.kz` deployed prod build
- For auth-gated pages: log in, then run Lighthouse against that URL
- Capture score per page in a results table appended to this spec at end of round
- Acceptance: every page ≥ 95

### Keyboard navigation manual test
Two flows tested with keyboard only (Tab, Shift+Tab, Enter, Space, ESC, arrows where applicable):

**Customer flow:**
1. Home → Tab to header → focus visible on Logo, menu, login → Tab to "Каталог" → Enter
2. `/clubs` → Tab to first ClubCard → Enter → club detail page
3. Tab to "Забронировать" → Enter → modal opens, focus inside, ESC closes; reopen, Tab through date/time/hours, submit
4. Magic link / pre-auth: ESC modal, Tab to header login → Enter → magic link form → submit
5. After auth, Tab to `/me` link → Enter → Tab through bookings → Tab to "Отменить" → Enter → confirm → status changes
6. Tab to "Оставить отзыв" on completed booking → Enter → `/reviews/new` → rating stars keyboard nav → textarea → submit
7. Logout from user menu

**Admin flow:**
1. Login as super_admin → header user menu → "Админка"
2. Tab to `/admin/reviews` → status filter (native `<select>`, arrow keys to change) → focus visible per row
3. Tab to "Скрыть" on a review → Enter → reason modal opens → focus inside → submit
4. Tab to "Показать" on a hidden review → Enter → status changes

No keyboard traps. Focus indicator visible on every interactive element. ESC always returns from modal.

### Contrast verification
- Browser DevTools (Chrome → Inspect → Accessibility tab → Contrast ratio) on representative text combinations
- Spot-check: white-on-base, text-secondary-on-base, text-muted-on-base, violet-500-on-base (should fail), violet-300-on-base (should pass)
- Cookie banner, modal, dashboard nav, error banners — verify in their actual rendered context

## Files expected to change

- `src/styles/global.css` — contrast token usages, focus-visible polish
- `src/layouts/BaseLayout.astro` — minor (noscript, title sanity)
- `src/components/Header.astro` — nav aria-label, aria-current, mobile menu aria-expanded/controls
- `src/components/Footer.astro` — landmark aria-label
- `src/components/Modal.astro` — role, focus trap, inert background
- `src/components/RatingStars.astro` — radiogroup pattern, keyboard nav
- `src/components/ClubCard.astro` — link semantics, rating aria-label
- `src/components/DashboardNav.astro` — nav aria-label, aria-current
- `src/scripts/cookie-banner.ts` — region role, focus handling
- `src/scripts/booking-form.ts` — modal focus trap integration
- `src/scripts/reviews-form.ts` — RatingStars keyboard nav coordination
- `src/pages/clubs/[slug].astro` — gallery alt, breadcrumb aria-label
- `src/pages/me.astro` + `src/scripts/me-page.ts` — list semantics, action button aria-label
- `src/pages/admin/reviews.astro` + `src/scripts/admin-reviews.ts` — filter label, row action aria-label
- `src/pages/admin/applications.astro` + `src/scripts/admin-applications.ts` — same pattern
- `src/pages/dashboard/club/edit.astro` + scripts — fieldset/legend groups, aria-live regions
- `src/pages/reviews/new.astro` — RatingStars + form labels coordination

No new dependencies. No new migrations. No new env vars.

## Acceptance criteria

- [ ] Lighthouse a11y ≥ 95 on every page (~27 pages); results table committed
- [ ] WCAG AA contrast across text: 4.5:1 for body, 3:1 for large/UI components — DevTools-verified on representative pages
- [ ] All icon-only buttons have `aria-label`
- [ ] All form inputs have proper label association (`<label for>` or `aria-label`)
- [ ] Modal: `role=dialog` + `aria-modal` + focus trap + ESC + focus restore
- [ ] Header nav has `aria-label`, active item has `aria-current="page"`
- [ ] RatingStars: keyboard nav works in interactive mode, decorative + `aria-label` in read-only mode
- [ ] Status pills have `aria-label` spelling out status
- [ ] Both keyboard flow tests pass (customer + admin) without mouse
- [ ] No regressions in build / type-check / existing E2E smoke

## Risk & mitigation

- **Risk:** Violet accent migration breaks visual hierarchy — some text was violet specifically to draw eye
  - Mitigation: replace with `--text-primary` and add weight/size where the accent role is genuinely needed; keep violet glow on hover/focus as visual punch
- **Risk:** Modal focus trap breaks existing booking-form modal which has dynamic content (datepicker, time slots)
  - Mitigation: implement trap as MutationObserver-aware (re-scan focusables when DOM changes), test booking flow end-to-end
- **Risk:** Keyboard nav for RatingStars conflicts with existing star-picker JS in `src/scripts/reviews-form.ts`
  - Mitigation: implementation will read current code and either replace or augment, not add a parallel handler
- **Risk:** Lighthouse score on dashboard/admin pages depends on auth state; can't run unauthenticated
  - Mitigation: run Lighthouse in authenticated browser session (preview_eval login first), or use DevTools Lighthouse panel which inherits session

## Out-of-band cleanup observed during exploration

- `--glow-cyan` aliased to `--glow-violet` in `global.css:78` — legacy name. Optional cleanup.
- `--ink-on-cyan` token still defined (line 45) but cyan accent isn't the primary anymore. Leave for now; rename in a separate refactor.
- `MEMORY.md` still says active project is `almaty-gg`. Canonical name is `respawn-kz`. Already documented in Obsidian decisions; not part of this spec.

## Out-of-scope follow-ups for future specs

- 5.4 per-page og:image — likely a small spec; ImageMagick / sharp to generate dynamic banners or use Cloudflare OG Functions
- 5.7 Service Worker — `@vite-pwa/astro` integration, runtime caching strategy, install prompt UX
- 5.9 Loading states + error boundaries — systematic pass on async pages; aria-live announcements
- HTML escaping in email templates (from SP5/6/7) — separate small spec, security defense-in-depth
- Admin-side booking reschedule UI (from SP7) — guard trigger allows it, no UI yet

## Open questions

None at design time. All scope decisions resolved during brainstorming:
- Hybrid audit strategy (✓ chosen over Lighthouse-first or Common-patterns-only)
- Lighthouse a11y ≥ 95 bar on all pages (✓ chosen over score 90 / strict 100)
- All pages including auth-gated (✓ chosen over public-only)
- Option 4 contrast strategy: restrict accent to non-text (✓)
