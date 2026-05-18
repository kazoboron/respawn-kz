# respawn.kz Auto-Rebuild on Edit (SP8) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the dormant auto-rebuild path from SP4 by connecting the GitHub repo to CF Pages and setting the production env vars. After this, every club edit triggers a CF rebuild within ~60 seconds.

**Architecture:** Pure infrastructure — no DB migrations, no Edge Function changes, no TypeScript edits. The existing `src/lib/deploy-trigger.ts` + `src/scripts/dashboard-club-edit.ts` go from no-op-with-warning to functional once `PUBLIC_CF_DEPLOY_HOOK_URL` is set in the CF build environment.

**Tech Stack:** Cloudflare Pages (git source); GitHub; existing Astro 4.16 build pipeline; existing `wrangler pages deploy` retained alongside.

**Spec:** [docs/superpowers/specs/2026-05-19-respawn-kz-auto-rebuild-github-cf-design.md](../specs/2026-05-19-respawn-kz-auto-rebuild-github-cf-design.md)

**Pre-flight:** Working tree must be clean on `main`. No feature branch needed — work happens entirely on main (one tiny commit for docs only) plus user actions in the CF dashboard.

**Identity for commits (HANDOFF.md convention):**
```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "..."
```

---

## File map

**Modify:**
- `.env.example` — already has the `PUBLIC_CF_DEPLOY_HOOK_URL` line, but the comment could be sharper about production-vs-local placement.
- `HANDOFF.md` (gitignored) — add SP8 section at top + remove SP4 auto-rebuild-deferred note from section 8.
- `07 Dev Projects/almaty-gg/decisions.md` (Obsidian) — log decision.
- `08 Sessions/2026-05-19.md` (Obsidian) — session journal block.

**No code created. No DB changes. No deploys.**

---

## Task 1: Verify pre-flight state

**Files:** none (verification only)

- [ ] **Step 1: Check working tree on main is clean**

```bash
git status --short
git rev-parse --abbrev-ref HEAD
```

Expected: `main`, no un-tracked code (the pre-existing `.claude/settings.local.json M` + `supabase/.temp/` are fine — gitignored side effects).

- [ ] **Step 2: Confirm deploy-trigger.ts is wired**

```bash
grep -n "PUBLIC_CF_DEPLOY_HOOK_URL" src/lib/deploy-trigger.ts src/scripts/dashboard-club-edit.ts .env.example
```

Expected output:
```
src/lib/deploy-trigger.ts:1:const HOOK_URL = import.meta.env.PUBLIC_CF_DEPLOY_HOOK_URL;
src/lib/deploy-trigger.ts:5:    console.warn('[deploy-trigger] PUBLIC_CF_DEPLOY_HOOK_URL not set, skipping rebuild');
src/scripts/dashboard-club-edit.ts:361:    const hookConfigured = !!import.meta.env.PUBLIC_CF_DEPLOY_HOOK_URL;
.env.example:9:PUBLIC_CF_DEPLOY_HOOK_URL=
```

If any are missing, the code from SP4 isn't where it should be — STOP and escalate. If all three present, you're cleared for setup.

---

## Task 2: USER ACTION — Connect GitHub repo to CF Pages

**Files:** none (CF dashboard click-through)

This task is performed by the user, not the implementer. The implementer **pauses here** and prints the checklist. The implementer waits for explicit user confirmation that the connection succeeded.

- [ ] **Step 1: Print user checklist**

Print this verbatim to the user:

```
SP8 Step 1 — Connect GitHub to CF Pages.

1. Open in browser:
   https://dash.cloudflare.com/a0e078cc25816fdf7cac77e162244c55/pages/view/respawn-kz/settings/builds-deployments

2. You should see a button like "Connect to Git" or "Manage" near
   the top of the page (depends on current state).

3. Click "Connect to Git" (or equivalent).

4. Authorize Cloudflare to access your GitHub account if prompted
   (one-time OAuth).

5. Select repository: kazoboron/respawn-kz

6. Build configuration:
   - Production branch:           main
   - Build command:                npm run build
   - Build output directory:       dist
   - Root directory (optional):    leave default (empty)
   - Framework preset:             Astro (auto-detected) or "None"

7. Save / Connect.

8. Cloudflare immediately kicks off an initial build from current main.
   This usually takes 1-2 minutes. Watch the "Deployments" tab — you
   should see a row appearing with status "Building" then "Success".

9. ⚠️ The initial build will probably FAIL or produce a broken site
   because env vars (PUBLIC_SUPABASE_URL etc.) aren't set yet. That's
   expected — we'll fix in the next task. Don't panic.

Reply with "connected" or "build failed" + the build log snippet when
the initial build finishes (success OR failure).
```

- [ ] **Step 2: Wait for user "connected" or diagnostic**

If user reports build failure not related to missing env vars (e.g., npm version mismatch, missing dependency), help diagnose by reading the build log. Common fix paths:
- Set `NODE_VERSION=22` in CF env vars if Node version mismatch.
- Set `NPM_VERSION=10` if npm version mismatch.

Once user confirms the connection succeeded (build may still be broken — that's fine), proceed.

---

## Task 3: USER ACTION — Create deploy hook

**Files:** none

- [ ] **Step 1: Print user checklist**

```
SP8 Step 2 — Create the deploy hook.

1. Same CF Pages → respawn-kz → Settings → Builds & deployments page.

2. Scroll down to the "Deploy hooks" section.

3. Click "Add deploy hook":
   - Hook name:        club-edit-rebuild
   - Branch to build:  main

4. Click Create.

5. Cloudflare displays the hook URL — it looks like:
   https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/<long-uuid>

   Copy the FULL URL. You only see it in plain text this once on the
   creation screen (after that it's masked).

Reply with "hook copied" when you have the URL. Don't paste it in the
chat — we'll use it directly in CF env settings in the next step.
```

- [ ] **Step 2: Wait for user "hook copied"**

---

## Task 4: USER ACTION — Set 3 production env vars in CF Pages

**Files:** none

- [ ] **Step 1: Print user checklist**

```
SP8 Step 3 — Set environment variables for the production build.

These are needed so the CF-side build (triggered by git push or the
deploy hook) injects them into the bundle. Astro/Vite inlines PUBLIC_*
vars at build time, so without these the deployed site has 'undefined'
in place of the Supabase URL.

1. CF Pages → respawn-kz → Settings → Environment variables.

2. Make sure "Production" environment is selected (NOT "Preview").

3. Add three variables (one at a time, click "Add variable" for each):

   Variable 1:
     Name:  PUBLIC_SUPABASE_URL
     Value: https://qfuhtvtietnldeqklxdo.supabase.co
     Type:  Plaintext (NOT encrypted — these are public vars)

   Variable 2:
     Name:  PUBLIC_SUPABASE_ANON_KEY
     Value: (long JWT, copy from your local .env file — it's the
             'eyJhbGci...' string)
     Type:  Plaintext

   Variable 3:
     Name:  PUBLIC_CF_DEPLOY_HOOK_URL
     Value: (the deploy hook URL from previous task)
     Type:  Plaintext

4. Save each variable.

5. After all three saved, trigger one manual rebuild so the build picks
   them up: CF Pages → Deployments → find the latest deployment → click
   "..." menu → "Retry deployment" (or "Rebuild"). Or — easier — just
   trigger the new deploy hook by curl'ing it:
     curl -X POST <the-deploy-hook-url>
   It returns a JSON ack and CF starts a fresh build.

6. Watch the build → should succeed this time (~1-2 min).

Reply with "env vars set, build green" once the rebuild succeeds.
```

- [ ] **Step 2: Wait for user "env vars set, build green"**

If the build fails, read the log together. Most likely cause: typo in variable name (must be exactly `PUBLIC_*`) or missing value.

---

## Task 5: AC4 — Verify env vars active on https://respawn.kz

**Files:** none (verification only)

- [ ] **Step 1: Static-page check via curl**

```bash
for p in / /me/ /clubs/cyberzone/ /reviews/new/; do
  echo -n "$p: "
  curl -s -o /dev/null -w "%{http_code}\n" -L "https://respawn.kz$p"
done
```

Expected: all 200.

- [ ] **Step 2: Inspect built JS for Supabase URL injection**

```bash
curl -s https://respawn.kz/ | grep -oE "qfuhtvtietnldeqklxdo" | head -3
```

Expected output: one or more matches (the URL appears in inline scripts or in the JS bundle linked from the HTML). If zero matches, env var wasn't baked in.

- [ ] **Step 3: User-side login test (delegated)**

Print to user:

```
Quick test that env vars are active:

1. Open https://respawn.kz in a fresh tab (Cmd-Shift-N for incognito,
   to avoid any cached state).
2. Click "Войти" (top right) → enter your email → submit.
3. You should be redirected to /login/?return=... and see "Магическая
   ссылка отправлена" message.

If step 3 throws a console error like "Cannot read properties of
undefined (reading 'auth')", that's missing PUBLIC_SUPABASE_URL.

Reply "AC4 OK" if magic link form works.
```

Wait for user "AC4 OK".

---

## Task 6: AC1 — Verify git push triggers a build

**Files:** none (test commit + push)

- [ ] **Step 1: Make a trivial change**

We want to push something to main so CF auto-build kicks in. The cleanest no-op change: bump a comment in `.env.example` to clarify the production placement of `PUBLIC_CF_DEPLOY_HOOK_URL`.

Open `.env.example`. Replace lines 6-9 (the current Cloudflare section) with:

```bash
# Cloudflare Pages deploy hook URL — triggered after club edit save.
# For PRODUCTION the value lives in CF Pages → Settings → Environment Variables
# (NOT this file). Local empty/unset = triggerSiteRebuild() no-ops silently.
# Get it from: CF Pages → respawn-kz → Settings → Builds & deploys → Deploy Hooks.
# Format: https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/{uuid}
PUBLIC_CF_DEPLOY_HOOK_URL=
```

- [ ] **Step 2: Commit + push**

```bash
git add .env.example
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
docs(env): clarify production placement of PUBLIC_CF_DEPLOY_HOOK_URL

The hook URL for production lives in CF Pages env settings, not
this file. Local empty value = triggerSiteRebuild() no-ops, which
is the correct behavior for dev environments.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin main
```

Expected: push succeeds. GitHub secret-scanning shouldn't fire (no secrets in this commit).

- [ ] **Step 3: Wait for CF auto-build**

```bash
# Watch for ~2 minutes
echo "Waiting 90 seconds for CF build to complete..."
sleep 90
# Then check the live site reflects the new commit's HEAD
curl -s https://respawn.kz/ | head -2
```

If CF build completed in < 90s and the deploy succeeded, https://respawn.kz now serves the build triggered by `git push`. Even though the .env.example change has no user-visible effect, the deploy completing confirms the pipeline works.

- [ ] **Step 4: Print to user for visual confirmation**

```
AC1 verification — CF auto-build after git push.

Open the CF Pages deployments page:
https://dash.cloudflare.com/a0e078cc25816fdf7cac77e162244c55/pages/view/respawn-kz

You should see a NEW deployment row appearing at the top, with:
- Source: GitHub (with the commit message snippet)
- Status: Success (or Building if still running — wait then refresh)
- Created: just now

Reply "AC1 OK" if you see the auto-build row.
```

Wait for user "AC1 OK".

---

## Task 7: AC2 — Verify admin edit triggers rebuild

**Files:** none (user-side smoke)

- [ ] **Step 1: Print user smoke checklist**

```
AC2 verification — admin edit triggers auto-rebuild.

1. Open https://respawn.kz/dashboard/club/edit?slug=cyberzone as
   super-admin (zhandos397@gmail.com — if not logged in, log in first).

2. Find the "Описание" textarea. Change it to something obviously new
   — e.g., add a timestamp tag like "Тест SP8 2026-05-19 — описание
   обновлено через автодеплой".

3. Click "Сохранить".

4. Look at the success message. It should now read:
   "Сохранено! Сайт обновится через 30-60 секунд."
   (NOT "после следующего деплоя" — that was the deferred-hook variant).

5. Wait ~60-90 seconds. Open CF dashboard → Deployments. You should
   see a NEW deployment row (triggered by the hook, NOT git push) —
   source field will say something like "Deploy hook (club-edit-rebuild)"
   or similar.

6. Once the deployment finishes, open https://respawn.kz/clubs/cyberzone/
   in a fresh tab (clear cache: Cmd-Shift-R). The new description text
   should be visible.

Reply "AC2 OK" when the new description renders on the public page.
If the message in step 4 still says "после следующего деплоя", the
PUBLIC_CF_DEPLOY_HOOK_URL env var wasn't baked into the previous CF
build — re-run AC1 manually trigger via CF dashboard.
```

- [ ] **Step 2: Wait for "AC2 OK"**

This is the headline acceptance criterion — the whole sub-project hinges on this working.

---

## Task 8: AC3 — Verify wrangler still works

**Files:** none (verification)

- [ ] **Step 1: Quick wrangler deploy**

We have no code change to deploy, but we can re-deploy the current state to confirm the path still works.

```bash
CLOUDFLARE_API_TOKEN="<from-HANDOFF-section-1>" npm run deploy
```

Expected output ends with `✨ Deployment complete!` and a new pages.dev URL.

Open the CF dashboard Deployments tab. You'll see the just-uploaded deployment alongside the git-source ones; source field says "Direct Upload" (or similar) for this one.

- [ ] **Step 2: Verify production still serves**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://respawn.kz/
```

Expected: 200.

---

## Task 9: Update HANDOFF.md

**Files:**
- Modify: `HANDOFF.md` (gitignored — no git commit)

- [ ] **Step 1: Insert new SP8 section**

Open `HANDOFF.md`. Find the `## ✅ SP7 (Booking Reschedule) SHIPPED 2026-05-19` section's closing `---` separator. Immediately after it, insert:

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

- [ ] **Step 2: Remove SP4 deferred note from section 8**

Find the section 8 ("Known issues / Deferred items") in HANDOFF.md. Look for the entry that mentions "Auto-rebuild on club edit" and `PUBLIC_CF_DEPLOY_HOOK_URL` being unset. Delete the entire bullet point and the surrounding context that explicitly says auto-rebuild is deferred. The SP8 section at the top now supersedes it.

- [ ] **Step 3: No commit**

HANDOFF.md is gitignored — just save the file.

---

## Task 10: Update Obsidian — decisions + journal

**Files (Obsidian vault, via `mcp__obsidian__*`):**
- Append to: `07 Dev Projects/almaty-gg/decisions.md`
- Append to: `08 Sessions/2026-05-19.md`

- [ ] **Step 1: Append decision**

Use `mcp__obsidian__obsidian_append_content` on `07 Dev Projects/almaty-gg/decisions.md`:

```markdown


## 2026-05-19 — Auto-Rebuild on Club Edit (SP8) SHIPPED

Connected GitHub repo to Cloudflare Pages (project type ad_hoc → git-source). Now every club edit on /dashboard/club/edit fires a POST to the CF deploy hook (existing code from SP4) and the site rebuilds within ~60 seconds. No code changes besides a tiny `.env.example` comment clarification — pure infrastructure.

Three deploy mechanisms coexist: `npm run deploy` (wrangler, fast), `git push origin main` (CF auto-build), and deploy hook (triggered by admin edits). All converge on the same artifact.

PUBLIC_* env vars now duplicated between local .env and CF Pages env settings — required because CF builds inline them at build time (Astro/Vite pattern). One-time setup cost.
```

- [ ] **Step 2: Append session journal**

Use `mcp__obsidian__obsidian_append_content` on `08 Sessions/2026-05-19.md`:

```markdown


## Сессия (ночь) — SP8 (Auto-Rebuild via GitHub-CF) shipped

**Контекст в начале:** SP7 только что задеплоен. Из roadmap пользователь выбрал auto-rebuild — heaviest на setup, легчайший по коду.

**Что сделано:**
- Spec + plan для SP8 (10 tasks, almost all user-action).
- User: connected GitHub repo to CF Pages (project type ad_hoc → git-source).
- User: created deploy hook `club-edit-rebuild` for main branch.
- User: set 3 PUBLIC_* env vars in CF Pages production env settings (Supabase URL, anon key, deploy hook URL).
- `.env.example` comment refined to clarify production placement (one tiny commit).
- AC1 verified: git push to main triggers CF auto-build (~1-2 min).
- AC2 verified: edit club description in /dashboard/club/edit → success message "Сайт обновится через 30-60 секунд" → CF rebuild fires → public page updated within ~90 sec.
- AC3 verified: `npm run deploy` (wrangler) still works alongside.
- HANDOFF.md updated, SP4 deferred note removed.

**Решения:**
- Path 1 (GitHub connect) chosen over Path 2 (GitHub Actions + Supabase Edge Function proxy) — zero code, faster setup.
- Both deploy paths kept active: wrangler for fast dev iteration, git push for normal flow, deploy hook for admin-triggered rebuilds. Last-write-wins on races; harmless for static site.
- PUBLIC_* env vars accepted as duplicated config (local .env + CF Pages env) — standard Astro/Vite pattern at build time.

**Открытые вопросы:**
- Build-status notification in UI deferred (admin trusts the ~60s estimate).
- No webhook authentication on the deploy hook (public-by-design at CF, abuse is harmless).
- HTML escaping в email templates всё ещё tracked from SP5/6/7 — это не блокирует но висит.

**State:**
- main at `<latest>`, all auto-rebuild paths working
- No new branches, no migrations, no Edge Function changes
- One small commit: `.env.example` comment clarification

**Следующий шаг:** roadmap — HTML escaping cleanup, Kaspi payments, или per-day working hours UI. Пользователь выберет.
```

- [ ] **Step 3: No commit needed** — Obsidian vault is independent of git.

---

## Self-review notes

**Spec coverage:**
- AC1 (git push deploys) → Task 6
- AC2 (admin edit triggers rebuild) → Task 7
- AC3 (wrangler still works) → Task 8
- AC4 (env vars active) → Task 5

**Setup steps from spec → tasks:**
- Step 1 (connect GitHub) → Task 2
- Step 2 (initial build) → Task 2 step 2 (waits for user)
- Step 3 (deploy hook) → Task 3
- Step 4 (env vars) → Task 4
- Step 5 (trigger manual rebuild) → Task 4 step 1 instructions

**Placeholder scan:** No TBD or vague steps. User-action tasks have explicit click paths with screenshots-not-needed level of detail.

**Type consistency:** No types in this plan — no TypeScript work.

**One observation noted during review:** Task 6's `.env.example` rewrite is the ONLY code change in the whole plan. It's intentionally small — the goal of that commit isn't to change behavior (current empty line works fine) but to give us SOMETHING to push so AC1 (git push triggers build) has a meaningful test artifact. If you want to skip the comment refinement and instead use a no-op commit (e.g., `git commit --allow-empty -m "chore: trigger first git-source build"`), that's also fine — flag in commit message.

**Codebase conventions matched:**
- HANDOFF.md update pattern matches SP5/6/7 entries.
- Obsidian decisions + journal pattern matches.
- Commit author flags consistent.
