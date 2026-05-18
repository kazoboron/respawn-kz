# Keyboard nav test — admin flow

**Status:** ⏳ Pending manual execution
**Build:** dist commit <SHA>

## Protocol

Same as customer flow: keyboard only, prod-like preview.

Login as super_admin (zhandos397@gmail.com — existing test user). Magic link via keyboard from /login.

## Test steps

| # | Step | Expected | Result | Notes |
|---|---|---|---|---|
| 1 | After auth, Tab to user menu | Focusable | ⬜ | |
| 2 | Enter on user menu, Tab to "Админка", Enter | Navigate to `/admin/` | ⬜ | |
| 3 | Tab through DashboardNav sidebar | Active item has aria-current=page | ⬜ | |
| 4 | Tab to /admin/reviews link, Enter | Navigate to admin reviews | ⬜ | |
| 5 | Tab to status filter (fieldset radio group), arrow keys | Filter changes via keyboard | ⬜ | |
| 6 | Tab to first row "Скрыть" button | Focus visible, aria-label includes review snippet | ⬜ | |
| 7 | Enter on "Скрыть" | Reason modal opens, focus inside | ⬜ | |
| 8 | Tab through modal, fill reason, submit | Review status updates to hidden | ⬜ | |
| 9 | Verify "Показать" button now on the hidden review row | Status flipped | ⬜ | |
| 10 | Navigate to /admin/applications | Tab through list | ⬜ | |
| 11 | Enter on "Одобрить" or "Отклонить" on an application | Action modal opens | ⬜ | |
| 12 | If reject: tab to reason textarea, fill, submit | Application rejected | ⬜ | |

## Issues found

_(populate during testing)_

## Final result

- ⏳ Pending / ✅ All pass / ❌ N issues found and fixed

When complete, commit this file with message `test(a11y): admin keyboard nav flow verified`.
