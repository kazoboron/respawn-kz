# respawn.kz Auto-Rebuild on Edit (SP8) — Design Spec

**Date:** 2026-05-19
**Status:** Draft — awaiting user review
**Sub-project:** SP8 — activate the auto-rebuild path that was set up in SP4
**Depends on:** SP4 (Photo Upload + Auto-Rebuild) — code-side wiring already shipped; this spec connects the infrastructure that makes it functional

## Goal

Activate the auto-rebuild path that was coded in SP4 but left dormant because the Cloudflare Pages project type didn't support deploy hooks. After connecting the GitHub repo to CF Pages, every club edit on `/dashboard/club/edit` automatically triggers a rebuild — the public catalog reflects changes within ~60 seconds instead of after a manual `npm run deploy`.

User-visible outcome: an admin saving a club name, address, hours, photos, or any other field via `/dashboard/club/edit` sees the success message "Сохранено! Сайт обновится через 30-60 секунд", and within a minute `/clubs/<slug>/` shows the new data without any manual deploy command.

## Scope

**In:**
- User action: connect the GitHub repo `kazoboron/respawn-kz` to the CF Pages project `respawn-kz` (changes project type from `ad_hoc` → git-source).
- User action: create a deploy hook in CF Pages (`club-edit-rebuild`, targeting `main` branch).
- User action: set 3 env vars in CF Pages production environment: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_CF_DEPLOY_HOOK_URL`.
- Documentation:
  - `.env.example` — add `PUBLIC_CF_DEPLOY_HOOK_URL` line (commented, since for prod the URL lives in CF env, not local).
  - `HANDOFF.md` — new SP8 section at top; section 8 (known issues) — remove the SP4 auto-rebuild deferred note since it's now resolved.
  - Obsidian `decisions.md` — log the decision.
- Smoke test: edit `/dashboard/club/edit?slug=cyberzone` (change description) → save → verify within ~90 seconds that `/clubs/cyberzone/` reflects the change.

**Out (deferred):**
- Webhook authentication or signing — deploy hook URLs are public-by-design at Cloudflare; the URL itself acts as the only "credential" and any abuse just triggers harmless rebuilds.
- Removing `npm run deploy` from `package.json` — user chose to keep both paths (wrangler for fast local iteration, git push for normal flow).
- Preview deploys for non-main branches — keep MVP simple; only main → production.
- Rebuild status notification in UI (e.g., "Build queued / running / done") — fire-and-forget is enough; users see results in ~60s.
- Conditional rebuild (skip if no public-facing fields changed) — over-engineering; rebuild is cheap.
- Multi-hook setup (one per region/branch) — single main hook covers MVP.
- GitHub Actions workflow as a backup deploy path — git push is enough.
- Rollback automation — Cloudflare keeps deploy history; manual rollback in CF dashboard if needed.

## Architecture

### Data flow (unchanged from SP4 design — now actually functional)

```
[Admin opens /dashboard/club/edit?slug=X]
    ↓ edits fields, clicks Сохранить
    ↓ dashboard-club-edit.ts: UPDATE clubs SET ... WHERE slug = X
    ↓ on success: triggerSiteRebuild() — POST to PUBLIC_CF_DEPLOY_HOOK_URL
    ↓ user sees "Сохранено! Сайт обновится через 30-60 секунд."
[Cloudflare Pages deploy hook receives POST]
    ↓ enqueues build from latest main branch
    ↓ runs `npm install && npm run build` in CF build environment
    ↓ build inlines PUBLIC_* env vars (Supabase URL/key, deploy hook URL)
    ↓ uploads dist/ to CF Pages CDN
    ↓ promotes to production (~30-60 seconds total)
[https://respawn.kz/clubs/X/ reflects new data]
```

### Why connect to GitHub instead of using GitHub Actions

SP4's spec listed two paths to enable deploy hooks:
1. Connect GitHub repo to CF Pages directly (~2 min user action)
2. GitHub Actions `workflow_dispatch` + Supabase Edge Function as a proxy (~30 min code)

Path 1 is chosen because:
- Zero code work.
- `wrangler pages deploy` continues working alongside (user keeps fast local iteration).
- CF builds run with their own Node env — no GitHub Actions minutes consumed.
- Standard pattern for Astro + CF Pages.

Path 2 was a workaround for the "ad_hoc project type can't have deploy hooks" limitation. With path 1, the project type changes and the limitation goes away.

### Why keep `wrangler pages deploy`

After git connection, three deploy mechanisms coexist:
1. **`npm run deploy`** (local, via wrangler) — fast, no waiting for CF build pipeline. Used during feature development for iterating.
2. **`git push origin main`** — automatic CF build (~1-2 min). Used for routine code changes.
3. **Deploy hook** (triggered by admin club edits) — same as #2 but triggered by app instead of git push.

Mechanisms 2 and 3 produce identical results (same build, same artifact). #1 may briefly race with #2 if they fire in close succession; last commit/upload wins. Acceptable — racing is harmless for this small site.

### Why three env vars in CF Pages

Astro inlines `PUBLIC_*` env vars at build time via Vite. The CF build doesn't see local `.env`, only CF's own environment-variable settings. Without these, the built JS contains `undefined` where the env vars are referenced — Supabase client breaks, `triggerSiteRebuild` no-ops with a warning.

Setting them in CF env is one-time. They get baked into the published bundle but that's already the case today (PUBLIC_ vars are intentionally public).

## Setup steps (user actions)

### Step 1: Connect GitHub to CF Pages

1. Open https://dash.cloudflare.com/a0e078cc25816fdf7cac77e162244c55/pages/view/respawn-kz/settings/builds-deployments
2. **Connect to Git** → authorize Cloudflare to access GitHub.
3. Select repository `kazoboron/respawn-kz`.
4. Build configuration:
   - **Production branch:** `main`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `/` (leave empty / default)
   - **Framework preset:** Astro (auto-detected) or None
5. Save. Cloudflare will run an initial build from current `main` — should succeed in ~1-2 minutes.

### Step 2: Create deploy hook

1. Same Settings → Builds & deployments page → scroll to **Deploy hooks**.
2. **Add deploy hook**:
   - **Hook name:** `club-edit-rebuild`
   - **Branch to build:** `main`
3. Click Create. Cloudflare displays a URL like:
   ```
   https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/abc123-def456-...
   ```
   Copy the full URL — it's the only time it's shown in plain text on the form.

### Step 3: Set environment variables

1. CF Pages → respawn-kz → Settings → **Environment variables** → **Add variable**.
2. Add three variables for the **Production** environment (NOT preview):

| Name | Value | Note |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | `https://qfuhtvtietnldeqklxdo.supabase.co` | Same as local `.env` |
| `PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOi...` (long JWT) | Copy from local `.env` |
| `PUBLIC_CF_DEPLOY_HOOK_URL` | URL from Step 2 | Just-created deploy hook |

3. Save each. After all three are set, trigger one manual rebuild (Builds & deployments → **Retry deployment** on the latest) so the build picks them up.

### Step 4: Verify build picks up env vars

1. Once the manual rebuild finishes, open https://respawn.kz in a fresh tab.
2. Open DevTools → Application → Local Storage → check for Supabase session keys (they only appear after a successful Supabase client init; their absence means `PUBLIC_SUPABASE_URL` wasn't injected).
3. Click "Личный кабинет" — should redirect to `/login/` (not throw a console error like "Cannot read property of undefined" which would mean env vars are missing).

## Code changes

### `.env.example` — add deploy hook documentation line

Append to the existing file:

```bash
# Cloudflare Pages deploy hook for auto-rebuild on club edit.
# For PRODUCTION: set in CF Pages → Settings → Environment Variables.
# Optional locally — if set, local builds inject it into the bundle,
# but the hook URL only fires CF rebuilds anyway. Leave commented unless debugging.
# PUBLIC_CF_DEPLOY_HOOK_URL=https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/<uuid>
```

(Read the current `.env.example` first to confirm format match — keep the comment style consistent.)

### `HANDOFF.md` — update top sections

Add new section after the existing `## ✅ SP7 (Booking Reschedule)` section's closing `---`:

```markdown
## ✅ SP8 (Auto-Rebuild on Club Edit) SHIPPED 2026-05-19

**Status:** в продакшене. CF Pages теперь git-connected, deploy hook live.

**What's wired:**
- CF Pages project type: `git-source` (was `ad_hoc`)
- Branch `main` → auto-build on push (~1-2 min)
- Deploy hook `club-edit-rebuild` exists; URL set in `PUBLIC_CF_DEPLOY_HOOK_URL` (CF Pages env)
- Existing code (`src/lib/deploy-trigger.ts`, `src/scripts/dashboard-club-edit.ts`) now fully functional

**Three deploy paths now coexist:**
1. `npm run deploy` (wrangler, local) — fast iteration during dev
2. `git push origin main` — CF builds + deploys (~1-2 min)
3. Admin edits club in `/dashboard/club/edit` → POST to deploy hook → CF rebuilds (same as #2)

**Success message in /dashboard/club/edit/ now reads "Сохранено! Сайт обновится через 30-60 секунд."** instead of the previous "после следующего деплоя".

**Known notes:**
- Deploy hook URL is public-by-design at CF — abuse just triggers harmless rebuilds. Acceptable for MVP.
- No build-status notification in UI; admin trusts the ~60s estimate.
- CF Pages build minutes are unlimited on free plan — no cost concern.

---
```

Also update section 8 (known issues) by REMOVING the lines about auto-rebuild being deferred — it's now resolved.

### `Obsidian decisions.md` — log decision

Append entry:

```markdown


## 2026-05-19 — Auto-Rebuild on Club Edit (SP8) SHIPPED

Connected GitHub repo to Cloudflare Pages (project type ad_hoc → git-source). Now every club edit on /dashboard/club/edit fires a POST to the CF deploy hook (existing code from SP4) and the site rebuilds within ~60 seconds. No code changes — pure infrastructure.

Three deploy mechanisms coexist: `npm run deploy` (wrangler, fast), `git push origin main` (CF auto-build), and deploy hook (triggered by admin edits). All converge on the same artifact.

PUBLIC_* env vars now duplicated between local .env and CF Pages env settings — required because CF builds inline them at build time (Astro/Vite pattern). One-time setup cost.
```

## Verification

This sub-project has no SQL, no Edge Functions, and almost no code changes. Verification is observational:

### AC1 — git push deploys

1. Make a trivial change (e.g., edit a comment in `README.md`).
2. `git commit + git push origin main`.
3. Within ~2 min, the CF Pages dashboard shows a new deployment from the git source.
4. https://respawn.kz reflects the change.

### AC2 — admin edit triggers rebuild

1. Log in as super-admin, open `/dashboard/club/edit?slug=cyberzone`.
2. Change description to a known unique string (e.g., "Тест авторебилда 2026-05-19").
3. Click Сохранить.
4. Success message reads "Сохранено! Сайт обновится через 30-60 секунд." (the configured-hook variant).
5. Within 90 sec, open https://respawn.kz/clubs/cyberzone/ — description shows the unique string.

### AC3 — wrangler still works

1. Locally: make a small change, `npm run deploy`.
2. Deploy completes via wrangler (no git push needed).
3. https://respawn.kz reflects the change.

### AC4 — env vars active

1. Open https://respawn.kz/me/ as a logged-in user.
2. Bookings load successfully (means Supabase client works — env vars are present).
3. No console errors about `undefined` env values.

## Failure handling

| Scenario | Behavior |
|---|---|
| CF build fails (e.g., TS error introduced upstream) | CF dashboard shows the failure; site stays on previous deploy. Local `npm run deploy` can recover. |
| Deploy hook URL expires or rotates | `triggerSiteRebuild()` gets 404; UI still shows success (already saved DB), just "Сайт обновится через 30-60 секунд" becomes a white lie. Detect via CF dashboard. |
| Race condition: admin saves twice in a row | Two POSTs to deploy hook → two builds queued → CF processes them in order, last wins. Brief inconsistency window, eventually consistent. |
| GitHub repo gets disconnected from CF | Auto-build on push stops; `npm run deploy` keeps working. Reconnect via CF dashboard. |
| `PUBLIC_*` env var missing in CF | Build itself succeeds but runtime breaks (Supabase client throws on undefined URL). Caught by AC4 smoke. |
| Concurrent CF auto-build and local `wrangler pages deploy` | CF Pages serializes deploys; last one wins. No data loss because deploys are immutable file uploads. |

## Risks

| Risk | Mitigation |
|---|---|
| Initial git-connect build fails on first try | CF shows build log; usually node/npm version mismatch or missing env var. Fix and retry from CF dashboard. |
| Forgot to set one env var → site broken after CF build replaces wrangler upload | Pre-flight: set all three env vars BEFORE the first CF auto-build. AC4 catches this. |
| Deploy hook URL leaks into a public-facing place (e.g., logged to a 3rd-party service) | URL is PUBLIC_* by design (bundled into client JS). No secrecy assumed. Worst case: random people trigger rebuilds. Cheap, harmless. |
| Branch protection (e.g., requiring PR + review on main) blocks direct pushes | Currently no branch protection set; `git push origin main` works. If added later, deploys still happen via PR merge. |
| User accidentally deletes the deploy hook in CF | `triggerSiteRebuild()` returns 404 silently. Admin gets stale "Сохранено!" success — bookings/data are fine, but the publish step doesn't fire. Recreate the hook + update env var. |

## Migration sequence

No DB migrations. Pure setup + docs.

1. **User Step 1:** Connect GitHub repo to CF Pages.
2. **User Step 2:** Wait for initial git-source build to complete (~2 min) — verify no errors.
3. **User Step 3:** Create deploy hook, copy URL.
4. **User Step 4:** Add 3 env vars in CF Pages (production environment).
5. **User Step 5:** Trigger one manual rebuild to bake env vars into bundle.
6. **User smoke:** verify AC1-AC4.
7. **Documentation commit:**
   - `.env.example` update.
   - Commit.
8. **HANDOFF.md** update (gitignored — no commit).
9. **Obsidian decisions + session journal** updates.

## Open items requiring user action

The whole sub-project is essentially user setup. After steps 1-5 above are done, I (Claude) commit `.env.example` and update docs — that's ~5 minutes of my work versus ~5 minutes of yours in the CF dashboard.

If you'd like step-by-step screenshots / clearer click paths during the setup, share screens from your CF dashboard and I'll guide each click.
