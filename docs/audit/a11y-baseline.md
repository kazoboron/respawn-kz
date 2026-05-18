# A11y baseline (before SP9)

**Captured:** 2026-05-19 via `npm run audit-a11y` against `http://localhost:4321`.

| Page | Score | Top failures |
|---|---|---|
| / | 98 | heading-order, label-content-name-mismatch |
| /about/ | 98 | heading-order, label-content-name-mismatch |
| /for-clubs/ | 98 | heading-order, label-content-name-mismatch |
| /privacy/ | 98 | heading-order, label-content-name-mismatch |
| /terms/ | 98 | heading-order, label-content-name-mismatch |
| /clubs/ | 98 | heading-order, label-content-name-mismatch |
| /clubs/cyberzone/ | 98 | heading-order, label-content-name-mismatch |
| /login/ | 98 | heading-order, label-content-name-mismatch |
| /reviews/new/ | 98 | heading-order, label-content-name-mismatch |
| /me/ | 98 | heading-order, label-content-name-mismatch |
| /admin/ | 98 | heading-order, label-content-name-mismatch |
| /admin/reviews/ | 98 | heading-order, label-content-name-mismatch |
| /admin/applications/ | 98 | heading-order, label-content-name-mismatch |
| /admin/users/ | 98 | heading-order, label-content-name-mismatch |
| /admin/owners/ | 98 | heading-order, label-content-name-mismatch |
| /dashboard/ | 98 | heading-order, label-content-name-mismatch |
| /dashboard/bookings/ | 98 | heading-order, label-content-name-mismatch |
| /dashboard/applications/ | 98 | heading-order, label-content-name-mismatch |
| /dashboard/register/ | 98 | heading-order, label-content-name-mismatch |
| /dashboard/club/edit/ | 98 | heading-order, label-content-name-mismatch |
| /404/ | 0 | (no failures — page may be unreachable or misconfigured) |

**Avg:** 93 — **Passing (≥95):** 20/21

## Notes

**Auth-gated pages:** Pages under `/me/`, `/admin/*`, and `/dashboard/*` are protected by authentication. When accessed without a session, these endpoints redirect to `/login`, so Lighthouse audits the login page destination rather than the protected page content. Scores reflect the redirect destination. Authenticated re-audit is planned for Task 18.

**404 page:** The `/404/` route scores 0 with no failures reported, indicating the page may be unreachable via direct navigation or improperly configured for testing.

**Systemic issues:** All 20 reachable pages share two consistent failures:
- **heading-order:** Heading elements are not in a sequentially-descending order
- **label-content-name-mismatch:** Elements with visible text labels do not have matching accessible names

These issues are planned for Task 3+ in the SP9 spec.

## After SP9 fixes (2026-05-19)

| Page | Before | After | Δ | Remaining failures |
|---|---|---|---|---|
| / | 98 | 98 | 0 | heading-order, label-content-name-mismatch |
| /about/ | 98 | 98 | 0 | heading-order, label-content-name-mismatch |
| /for-clubs/ | 98 | 98 | 0 | heading-order, label-content-name-mismatch |
| /privacy/ | 98 | 98 | 0 | heading-order, label-content-name-mismatch |
| /terms/ | 98 | 98 | 0 | heading-order, label-content-name-mismatch |
| /clubs/ | 98 | 98 | 0 | heading-order, label-content-name-mismatch |
| /clubs/cyberzone/ | 98 | 98 | 0 | heading-order, label-content-name-mismatch |
| /login/ | 98 | 98 | 0 | heading-order, label-content-name-mismatch |
| /reviews/new/ | 98 | 98 | 0 | heading-order, label-content-name-mismatch |
| /me/ | 98 | 98 | 0 | heading-order, label-content-name-mismatch |
| /admin/ | 98 | 98 | 0 | heading-order, label-content-name-mismatch |
| /admin/reviews/ | 98 | 98 | 0 | heading-order, label-content-name-mismatch |
| /admin/applications/ | 98 | 98 | 0 | heading-order, label-content-name-mismatch |
| /admin/users/ | 98 | 98 | 0 | heading-order, label-content-name-mismatch |
| /admin/owners/ | 98 | 98 | 0 | heading-order, label-content-name-mismatch |
| /dashboard/ | 98 | 98 | 0 | heading-order, label-content-name-mismatch |
| /dashboard/bookings/ | 98 | 98 | 0 | heading-order, label-content-name-mismatch |
| /dashboard/applications/ | 98 | 98 | 0 | heading-order, label-content-name-mismatch |
| /dashboard/register/ | 98 | 98 | 0 | heading-order, label-content-name-mismatch |
| /dashboard/club/edit/ | 98 | 98 | 0 | heading-order, label-content-name-mismatch |
| /404/ | 0 | 0 | 0 | (none) |

**Avg:** before 93.3 → after 93.3 — **Passing (≥95):** before 20/21 → after 20/21

### Pages still <95
- /404/: 0 (failures: Lighthouse cannot audit this page; it appears to be unreachable or misconfigured)

### Most common remaining failure types
- label-content-name-mismatch: 20 pages
- heading-order: 20 pages

## After T19 targeted fixes (2026-05-19)

| Page | Before T19 | After T19 | Δ | Remaining failures |
|---|---|---|---|---|
| / | 98 | 100 | +2 | — |
| /about/ | 98 | 100 | +2 | — |
| /for-clubs/ | 98 | 100 | +2 | — |
| /privacy/ | 98 | 100 | +2 | — |
| /terms/ | 98 | 100 | +2 | — |
| /clubs/ | 98 | 100 | +2 | — |
| /clubs/cyberzone/ | 98 | 100 | +2 | — |
| /login/ | 98 | 100 | +2 | — |
| /reviews/new/ | 98 | 100 | +2 | — |
| /me/ | 98 | 100 | +2 | — |
| /admin/ | 98 | 100 | +2 | — |
| /admin/reviews/ | 98 | 100 | +2 | — |
| /admin/applications/ | 98 | 100 | +2 | — |
| /admin/users/ | 98 | 100 | +2 | — |
| /admin/owners/ | 98 | 100 | +2 | — |
| /dashboard/ | 98 | 100 | +2 | — |
| /dashboard/bookings/ | 98 | 100 | +2 | — |
| /dashboard/applications/ | 98 | 100 | +2 | — |
| /dashboard/register/ | 98 | 100 | +2 | — |
| /dashboard/club/edit/ | 98 | 100 | +2 | — |
| /404/ | removed | — | — | Removed from PATHS (Astro builds dist/404.html, not dist/404/index.html) |

**Avg:** before 93.3 (20/21) → after T19 **100 (20/20)**

### Root causes fixed

**label-content-name-mismatch (was: all 20 pages)**
- `Footer.astro`: Social links `<a aria-label="Instagram">IG</a>` — "IG" not in "Instagram". Fixed: `aria-label="IG — Instagram"` (same for TG/TT). Present on all pages → explained the universal failure.
- `Modal.astro`: Close button `<button aria-label="Закрыть">✕</button>` — "✕" not in "Закрыть". Fixed: `aria-label="✕ Закрыть"`. Modal is in BaseLayout → all pages.
- `admin-reviews.ts`: Button text "Опубликовать" but `aria-label="Показать {excerpt}"`. Fixed: `aria-label="Опубликовать {excerpt}"`.
- `dashboard-club-edit.ts`: Photo-remove "×" buttons with `aria-label="Удалить фото"`. Fixed: `aria-label="× Удалить фото"`.

**heading-order (was: all 20 pages)**
- `Footer.astro`: Footer section headings were `h4` ("Навигация", "Правовая информация", "Контакты"). On simple pages (login, me, etc.) the DOM has h1 → h4, skipping h2 and h3. Fixed: changed all footer headings to `h2`.
- `admin/owners.astro`: Page had h1 → h3 (club names) with no h2 in between. Fixed: `owner-card__title` to `h2`.
- `scripts/filters.ts`: Catalog page (`/clubs/`) dynamically renders club card titles as `h3` under h1 with no intermediate h2. Fixed: changed to `h2` in the JS-rendered template.

**Other**
- Removed `/404/` from `scripts/audit-a11y.mjs` PATHS — Astro builds `dist/404.html`, not `dist/404/index.html`, so `/404/` is unreachable and always scores 0.
