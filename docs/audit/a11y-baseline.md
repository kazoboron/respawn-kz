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
