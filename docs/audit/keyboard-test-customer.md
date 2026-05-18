# Keyboard nav test — customer flow

**Status:** ⏳ Pending manual execution
**Build:** dist commit <SHA>

## Protocol

Disconnect mouse / disable trackpad. Boot prod-like preview locally:

```bash
npm run build && npm run preview
```

Open `http://localhost:4321/` in browser. Use only keyboard.

## Test steps

| # | Step | Expected | Result | Notes |
|---|---|---|---|---|
| 1 | Tab from address bar into page | Focus on skip-link | ⬜ | |
| 2 | Enter on skip-link | Focus jumps to `<main>` | ⬜ | |
| 3 | Shift+Tab to header, Tab through Logo, nav items, login | All focusable, visible ring | ⬜ | |
| 4 | Tab to "Каталог", Enter | Navigate to `/clubs/` | ⬜ | |
| 5 | Tab to first ClubCard title link, Enter | Navigate to club detail | ⬜ | |
| 6 | Tab to "Забронировать", Enter | Modal opens, focus inside | ⬜ | |
| 7 | ESC inside modal | Modal closes, focus restored to "Забронировать" | ⬜ | |
| 8 | Re-open modal, Tab through fields, fill date/time/hours, submit | Submit works | ⬜ | |
| 9 | Navigate to /login, fill email, submit | Magic link request | ⬜ | |
| 10 | After auth callback, navigate to /me | Bookings list visible | ⬜ | |
| 11 | Tab through bookings list | Each `<li>` focusable via action buttons | ⬜ | |
| 12 | Find completed booking without review, Tab to "Оставить отзыв", Enter | Navigate to /reviews/new | ⬜ | |
| 13 | Tab to rating-stars group, focus on selected (or 1) | One star in tab order | ⬜ | |
| 14 | Arrow Right/Down | Move to next star, aria-checked updates | ⬜ | |
| 15 | Arrow Left/Up | Move to previous star | ⬜ | |
| 16 | Space or Enter to confirm rating, Tab to textarea | Focus textarea, char count updates | ⬜ | |
| 17 | Type review, Tab to submit, Enter | Review posted | ⬜ | |
| 18 | Back to /me, Tab to "Изменить" on pending booking, Enter | Reschedule modal opens | ⬜ | |
| 19 | Logout via user menu (Tab to nav user button, Enter) | Logout completes | ⬜ | |

## Issues found

_(populate during testing — describe each blocker with step #, what happened, and any fix needed)_

## Final result

- ⏳ Pending / ✅ All pass / ❌ N issues found and fixed

When complete, commit this file with message `test(a11y): customer keyboard nav flow verified`.
