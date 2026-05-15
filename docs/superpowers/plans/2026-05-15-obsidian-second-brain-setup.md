# Obsidian Second Brain Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Obsidian vault as Claude's persistent memory: structured folders, daily session journal, current project knowledge migrated, and a `SessionStart` hook that loads vault context at the start of every Claude Code session.

**Architecture:** All vault writes go through Obsidian's Local REST API (HTTP `127.0.0.1:27123`, Bearer auth) so the plugin handles index updates correctly. The hook is a PowerShell script in `C:\Users\Lenovo\.claude\hooks\` referenced from `C:\Users\Lenovo\.claude\settings.json` (user scope). The hook outputs an instruction to Claude — it does not read vault files itself.

**Tech Stack:** Obsidian Local REST API plugin v3.6.2, PowerShell 5.1, Claude Code hooks (SessionStart), `mcp-obsidian` MCP server (already configured user-scope).

**Spec:** [docs/superpowers/specs/2026-05-15-obsidian-second-brain-setup-design.md](../specs/2026-05-15-obsidian-second-brain-setup-design.md)

---

## File Structure

**Vault files** (created via REST API; vault root is wherever Obsidian opens — accessed via API path `vault/<path>`):

| Path | Purpose |
|---|---|
| `INDEX.md` | Vault map + `active_project` pointer |
| `01 AI Context/second_brain_context_zhandos.md` | (moved from root) |
| `01 AI Context/journal-template.md` | Reusable journal block template |
| `07 Dev Projects/almaty-gg/README.md` | What it is, status, stack, links to repo specs |
| `07 Dev Projects/almaty-gg/decisions.md` | Architectural decision log |
| `07 Dev Projects/almaty-gg/open-questions.md` | Unresolved questions |
| `08 Sessions/2026-05-15.md` | Today's journal |
| `99 Archive/Добро пожаловать.md` | (moved from root) |
| `99 Archive/создайте ссылку.md` | (moved from root) |

**Settings & hook files:**

| Path | Purpose |
|---|---|
| `C:\Users\Lenovo\.claude\hooks\obsidian-session-start.ps1` | SessionStart hook script |
| `C:\Users\Lenovo\.claude\settings.json` | Wires the hook into Claude Code |

**Memory files:**

| Path | Purpose |
|---|---|
| `C:\Users\Lenovo\.claude\projects\C--ClaudeCode\memory\obsidian_brain.md` | Update with session-automation note |
| `C:\Users\Lenovo\.claude\projects\C--ClaudeCode\memory\almaty_gg_project.md` | New: project context pointer |
| `C:\Users\Lenovo\.claude\projects\C--ClaudeCode\memory\MEMORY.md` | Add new entry |

**Constants used throughout:**
- `OBSIDIAN_API_KEY` = `0d85c4ff50b8de871dd071c012d312077ab28c94f4a3c042ccde78eb00e97239`
- API base = `http://127.0.0.1:27123/vault/`
- All API calls use header `Authorization: Bearer <key>`

---

## Task 1: Restructure vault — create folder layout & relocate existing files

**Files:**
- Create: `01 AI Context/second_brain_context_zhandos.md` (moved from root)
- Create: `99 Archive/Добро пожаловать.md` (moved from root)
- Create: `99 Archive/создайте ссылку.md` (moved from root)
- Delete (after copy): root copies of the three files above

The Local REST API does not have a "move" endpoint, so each move is GET (read) → PUT (write to new path) → GET (verify) → DELETE (old path).

- [ ] **Step 1: Verify Obsidian REST API is reachable**

Run:

```powershell
$h = @{ Authorization = "Bearer 0d85c4ff50b8de871dd071c012d312077ab28c94f4a3c042ccde78eb00e97239" }
(Invoke-RestMethod -Uri "http://127.0.0.1:27123/" -Headers $h).authenticated
```

Expected output: `True`

If this fails, abort the plan and ask the user to ensure Obsidian is running with the Local REST API plugin enabled.

- [ ] **Step 2: Move `second_brain_context_zhandos.md` → `01 AI Context/`**

Run:

```powershell
$h = @{ Authorization = "Bearer 0d85c4ff50b8de871dd071c012d312077ab28c94f4a3c042ccde78eb00e97239" }
$content = Invoke-RestMethod -Uri "http://127.0.0.1:27123/vault/second_brain_context_zhandos.md" -Headers $h
$bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
Invoke-RestMethod -Uri "http://127.0.0.1:27123/vault/01%20AI%20Context/second_brain_context_zhandos.md" -Headers $h -Method Put -ContentType "text/markdown" -Body $bytes
Invoke-RestMethod -Uri "http://127.0.0.1:27123/vault/second_brain_context_zhandos.md" -Headers $h -Method Delete
```

Expected: no errors. The folder `01 AI Context/` is auto-created by the PUT.

- [ ] **Step 3: Verify the move**

Run:

```powershell
$h = @{ Authorization = "Bearer 0d85c4ff50b8de871dd071c012d312077ab28c94f4a3c042ccde78eb00e97239" }
$root = (Invoke-RestMethod -Uri "http://127.0.0.1:27123/vault/" -Headers $h).files
$ai = (Invoke-RestMethod -Uri "http://127.0.0.1:27123/vault/01%20AI%20Context/" -Headers $h).files
Write-Host "Root has second_brain file: $($root -contains 'second_brain_context_zhandos.md')"
Write-Host "AI Context has it: $($ai -contains 'second_brain_context_zhandos.md')"
```

Expected: `Root has second_brain file: False`, `AI Context has it: True`

- [ ] **Step 4: Move `Добро пожаловать.md` → `99 Archive/`**

Run:

```powershell
$h = @{ Authorization = "Bearer 0d85c4ff50b8de871dd071c012d312077ab28c94f4a3c042ccde78eb00e97239" }
$src = "Добро пожаловать.md"
$dst = "99 Archive/Добро пожаловать.md"
$srcUrl = "http://127.0.0.1:27123/vault/" + [System.Uri]::EscapeDataString($src)
$dstUrl = "http://127.0.0.1:27123/vault/" + ($dst -split '/' | ForEach-Object { [System.Uri]::EscapeDataString($_) }) -join '/'
$content = Invoke-RestMethod -Uri $srcUrl -Headers $h
$bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
Invoke-RestMethod -Uri $dstUrl -Headers $h -Method Put -ContentType "text/markdown" -Body $bytes
Invoke-RestMethod -Uri $srcUrl -Headers $h -Method Delete
```

Expected: no errors.

- [ ] **Step 5: Move `создайте ссылку.md` → `99 Archive/`**

Run (same pattern, different filename):

```powershell
$h = @{ Authorization = "Bearer 0d85c4ff50b8de871dd071c012d312077ab28c94f4a3c042ccde78eb00e97239" }
$src = "создайте ссылку.md"
$dst = "99 Archive/создайте ссылку.md"
$srcUrl = "http://127.0.0.1:27123/vault/" + [System.Uri]::EscapeDataString($src)
$dstUrl = "http://127.0.0.1:27123/vault/" + (($dst -split '/') | ForEach-Object { [System.Uri]::EscapeDataString($_) }) -join '/'
$content = Invoke-RestMethod -Uri $srcUrl -Headers $h
$bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
Invoke-RestMethod -Uri $dstUrl -Headers $h -Method Put -ContentType "text/markdown" -Body $bytes
Invoke-RestMethod -Uri $srcUrl -Headers $h -Method Delete
```

Expected: no errors.

- [ ] **Step 6: Verify final root state**

Run:

```powershell
$h = @{ Authorization = "Bearer 0d85c4ff50b8de871dd071c012d312077ab28c94f4a3c042ccde78eb00e97239" }
(Invoke-RestMethod -Uri "http://127.0.0.1:27123/vault/" -Headers $h).files
```

Expected: only `01 AI Context/`, `99 Archive/` and any folders Obsidian autocreated (no loose `.md` files at the root).

---

## Task 2: Create `INDEX.md` and journal template

**Files:**
- Create: `INDEX.md` at vault root
- Create: `01 AI Context/journal-template.md`

- [ ] **Step 1: Create `INDEX.md`**

Run:

```powershell
$h = @{ Authorization = "Bearer 0d85c4ff50b8de871dd071c012d312077ab28c94f4a3c042ccde78eb00e97239" }
$indexContent = @'
---
active_project: almaty-gg
last_updated: 2026-05-15
---

# Vault Index / Карта vault

> Single source of truth for "what are we currently working on". Claude reads this file at the start of every session.

## Active project

**`almaty-gg`** — see [[07 Dev Projects/almaty-gg/README]].

## Folder map

| Folder | What lives here |
|---|---|
| `00 Inbox/` | Quick captures before sorting |
| `01 AI Context/` | Profile, preferences, journal template, anything an AI agent should read first |
| `02 Mobile Games/` | (planned) Interactive story app, cat characters, Episode-alternative research |
| `03 Marijuana Business Simulator/` | (planned) Game design notes for the business sim concept |
| `04 Story Bible/` | (planned) Characters, locations, branching choices |
| `05 Visual References/` | (planned) Reference images, mood boards |
| `06 Business and Monetization/` | (planned) Monetization strategy, business notes |
| `07 Dev Projects/` | Code projects: per-project README + decisions + open-questions |
| `08 Sessions/` | Daily journal — one file per day, blocks per session |
| `99 Archive/` | Deprecated notes, default Obsidian welcome files |

## All projects

### Dev projects

- [[07 Dev Projects/almaty-gg/README|almaty-gg]] — Astro + Supabase web platform, esports-club catalog with bookings (Almaty, KZ)

### Creative projects

- (none migrated yet — see [[01 AI Context/second_brain_context_zhandos|second brain context]] for direction)

## How to switch active project

Edit the `active_project:` field in the frontmatter at the top of this file. Or tell Claude "теперь работаем над X" and Claude will update it.
'@
$bytes = [System.Text.Encoding]::UTF8.GetBytes($indexContent)
Invoke-RestMethod -Uri "http://127.0.0.1:27123/vault/INDEX.md" -Headers $h -Method Put -ContentType "text/markdown" -Body $bytes
```

Expected: no error.

- [ ] **Step 2: Verify `INDEX.md` content**

Run:

```powershell
$h = @{ Authorization = "Bearer 0d85c4ff50b8de871dd071c012d312077ab28c94f4a3c042ccde78eb00e97239" }
$idx = Invoke-RestMethod -Uri "http://127.0.0.1:27123/vault/INDEX.md" -Headers $h
$idx.Substring(0, 200)
```

Expected: starts with `---\nactive_project: almaty-gg\n...`

- [ ] **Step 3: Create `01 AI Context/journal-template.md`**

Run:

```powershell
$h = @{ Authorization = "Bearer 0d85c4ff50b8de871dd071c012d312077ab28c94f4a3c042ccde78eb00e97239" }
$tmpl = @'
# Journal template / Шаблон записи в журнал

> Used by Claude when appending a session block to `08 Sessions/YYYY-MM-DD.md`. Adapt loosely; short sessions get short blocks.

## Сессия HH:MM — <project-slug или topic>

**Контекст в начале:** на чём остановились / что Claude знал в начале сессии.

**Что сделано:**
- Конкретные изменения, имена файлов, ссылки на коммиты (если были).

**Решения:**
- Архитектурные / продуктовые выборы.

**Открытые вопросы:**
- То что не успели или требует внимания.

**Следующий шаг:** одна фраза — что логично делать дальше.

---
'@
$bytes = [System.Text.Encoding]::UTF8.GetBytes($tmpl)
$url = "http://127.0.0.1:27123/vault/" + (("01 AI Context/journal-template.md" -split '/') | ForEach-Object { [System.Uri]::EscapeDataString($_) }) -join '/'
Invoke-RestMethod -Uri $url -Headers $h -Method Put -ContentType "text/markdown" -Body $bytes
```

Expected: no error.

---

## Task 3: Create `almaty-gg` project files

**Files:**
- Create: `07 Dev Projects/almaty-gg/README.md`
- Create: `07 Dev Projects/almaty-gg/decisions.md`
- Create: `07 Dev Projects/almaty-gg/open-questions.md`

- [ ] **Step 1: Helper function (define in this PowerShell session, reuse below)**

Run:

```powershell
$h = @{ Authorization = "Bearer 0d85c4ff50b8de871dd071c012d312077ab28c94f4a3c042ccde78eb00e97239" }
function Put-VaultFile($path, $content) {
    $url = "http://127.0.0.1:27123/vault/" + (($path -split '/') | ForEach-Object { [System.Uri]::EscapeDataString($_) }) -join '/'
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
    Invoke-RestMethod -Uri $url -Headers $h -Method Put -ContentType "text/markdown" -Body $bytes
}
```

Expected: no output. Function is defined for reuse.

- [ ] **Step 2: Create `07 Dev Projects/almaty-gg/README.md`**

Run:

```powershell
$readme = @'
# almaty-gg

**Status:** MVP in progress. Backend currently a localStorage stub with the same API surface as Supabase (commit `2a314d3`).
**Repo:** `C:\ClaudeCode`
**Working directory:** same as repo root.

## What it is

Astro + TypeScript web platform: catalog of esports/gaming clubs in Almaty (Kazakhstan) with booking flow. Users can browse clubs, view details, log in via magic link, book a slot, and manage their bookings on `/me`.

## Tech stack

- **Framework:** Astro
- **Language:** TypeScript
- **Backend:** Supabase (auth via magic link, `bookings` table with Row Level Security). Currently swapped for a localStorage stub with identical API surface — see decisions.
- **Styling:** custom global CSS (`src/styles/global.css`)

## Pages

| Route | File | Purpose |
|---|---|---|
| `/` | `src/pages/index.astro` | Landing page |
| `/about` | `src/pages/about.astro` | Mission, audience, contacts |
| `/for-clubs` | `src/pages/for-clubs.astro` | B2B page for clubs (benefits, pricing, application form) |
| `/clubs` | `src/pages/clubs/index.astro` | Catalog with filters |
| `/clubs/[slug]` | `src/pages/clubs/[slug].astro` | Club detail page (gallery, equipment, pricing) |
| `/login` | `src/pages/login.astro` | Magic link form |
| `/auth/callback` | `src/pages/auth/callback.astro` | Magic link redirect handler |
| `/me` | `src/pages/me.astro` | User dashboard: bookings list with cancel |

## Key modules

- `src/lib/supabase.ts` — Supabase client singleton with session persistence (tolerant of missing env vars per commit `460f24a`)
- `src/scripts/auth.ts` — session detection and header rendering
- `src/scripts/booking-real.ts` — booking flow against Supabase API
- `src/scripts/me-page.ts` — `/me` dashboard logic
- `src/scripts/filters.ts` — catalog filters with URL state
- `src/data/clubs.ts`, `src/data/cities.ts` — static catalog data
- `src/data/supabase-types.ts` — generated DB types

## Data model

- `Booking`, `NewBooking` types in `src/data/supabase-types.ts` with status labels
- `bookings` table with RLS (migration in `supabase/migrations/` — created in commit `4de3e72`)

## Specs and plans (in repo)

- `docs/superpowers/specs/2026-05-14-almaty-gg-landing-design.md`
- `docs/superpowers/plans/2026-05-14-almaty-gg-landing.md`
- `docs/superpowers/specs/2026-05-15-respawn-kz-catalog-design.md`
- `docs/superpowers/plans/2026-05-15-respawn-kz-catalog.md`
- Backend MVP: docs `94332dc`, plan `9f638de` (commits — view via `git show`)

## Related

- See [[decisions]] for architectural choices
- See [[open-questions]] for unresolved items
'@
Put-VaultFile "07 Dev Projects/almaty-gg/README.md" $readme
```

Expected: no error.

- [ ] **Step 3: Create `07 Dev Projects/almaty-gg/decisions.md`**

Run:

```powershell
$decisions = @'
# Decisions log — almaty-gg

> Short architectural and product decisions, newest at top. Each entry: date, decision, why.

## 2026-05-15 — Backend swapped to localStorage stub

Replaced the live Supabase backend with a localStorage-backed stub that exposes the same API surface (commit `2a314d3`). Reason: not yet known — flag in [[open-questions]]. Likely demo / dev-without-keys mode.

## 2026-05-14 — Supabase auth via magic link

Authentication uses Supabase's magic link flow. Created `/login` page (commit `bc38723`) and `/auth/callback` redirect handler (commit `01c5aac`). Session is persisted in the Supabase client singleton (`src/lib/supabase.ts`).

## 2026-05-14 — RLS on `bookings` table

Bookings table created with Row Level Security migration (commit `4de3e72`). Each user sees only their own bookings.

## 2026-05-14 — `/me` dashboard

Added `/me` page with bookings list and cancel action (commit `c887fe1`).

## (earlier) — Astro migration

The codebase was migrated to Astro from a previous structure. The legacy `_legacy/` directory was removed in commit `2ca190a` after successful migration. Pre-Astro state lives only in git history.

## (earlier) — Catalog and B2B pages

Catalog (`/clubs`) with reactive filters (commit `b18d87b`), club detail pages with gallery/equipment/pricing card (commit `35a6534`), and B2B `/for-clubs` page with application form (commit `e47c715`).
'@
Put-VaultFile "07 Dev Projects/almaty-gg/decisions.md" $decisions
```

Expected: no error.

- [ ] **Step 4: Create `07 Dev Projects/almaty-gg/open-questions.md`**

Run:

```powershell
$oq = @'
# Open questions — almaty-gg

> Unresolved items. When answered, move the resolution into [[decisions]] and remove from here.

## Why is the backend a localStorage stub right now?

Last commit (`2a314d3`) swapped the live Supabase backend for a localStorage stub with the same API surface. Possible reasons:
- Demo mode for showing the product without provisioning Supabase
- Dev mode to avoid hitting production data
- Temporary while Supabase keys / project are reconfigured

**Need to confirm:** is this temporary or part of the deployed app?

## `almaty-gg` vs `respawn-kz` — same product or two?

Two specs exist in the repo:
- `2026-05-14-almaty-gg-landing-design.md`
- `2026-05-15-respawn-kz-catalog-design.md`

Are these two names for the same product, or two distinct projects sharing a codebase? The slug used here is `almaty-gg` based on git history; revisit if it's actually `respawn-kz`.

## Is there a live deploy?

No deployment platform / URL is documented. Ask user where (Vercel? Netlify? self-hosted?) and add to README.

## Project status overall

MVP, alpha, ready for clubs to onboard? What is the immediate next milestone?
'@
Put-VaultFile "07 Dev Projects/almaty-gg/open-questions.md" $oq
```

Expected: no error.

- [ ] **Step 5: Verify the three files exist**

Run:

```powershell
$h = @{ Authorization = "Bearer 0d85c4ff50b8de871dd071c012d312077ab28c94f4a3c042ccde78eb00e97239" }
$files = (Invoke-RestMethod -Uri "http://127.0.0.1:27123/vault/07%20Dev%20Projects/almaty-gg/" -Headers $h).files
$files
```

Expected output (order may vary):
```
README.md
decisions.md
open-questions.md
```

---

## Task 4: Write today's session journal entry

**Files:**
- Create: `08 Sessions/2026-05-15.md`

- [ ] **Step 1: Create today's journal file with the current session entry**

Run:

```powershell
$h = @{ Authorization = "Bearer 0d85c4ff50b8de871dd071c012d312077ab28c94f4a3c042ccde78eb00e97239" }
$now = Get-Date -Format "HH:mm"
$body = @"
# 2026-05-15

## Сессия $now — obsidian setup

**Контекст в начале:** Obsidian + Local REST API уже установлены, MCP-сервер ``mcp-obsidian`` зарегистрирован user-scope ранее в этой же сессии. В vault лежал один содержательный файл ``second_brain_context_zhandos.md`` + два дефолтных welcome.

**Что сделано:**
- Реструктурирован vault: создана секция ``07 Dev Projects/`` для код-проектов рядом с существующим планом креативных секций (02–06).
- Перенесены: ``second_brain_context_zhandos.md`` → ``01 AI Context/``, два welcome-файла → ``99 Archive/``.
- Создан ``INDEX.md`` с указателем ``active_project: almaty-gg`` и картой vault.
- Создан ``01 AI Context/journal-template.md`` (этот шаблон).
- Перенесены знания о текущем проекте в ``07 Dev Projects/almaty-gg/``: README, decisions.md, open-questions.md.
- Спека дизайна закоммичена: ``docs/superpowers/specs/2026-05-15-obsidian-second-brain-setup-design.md`` (commit ``2952733``).
- План реализации: ``docs/superpowers/plans/2026-05-15-obsidian-second-brain-setup.md``.
- Создан и подключён ``SessionStart`` хук: ``C:\Users\Lenovo\.claude\hooks\obsidian-session-start.ps1``, прописан в ``C:\Users\Lenovo\.claude\settings.json``.
- Обновлены memory-файлы под новые реалии.

**Решения:**
- Структура: расширение существующей разметки 00–99, ``07 Dev Projects/`` для кода.
- Журнал: один файл на день, блоки на сессию (а не per-project).
- Старт сессии: читаем ``INDEX.md`` + последний журнал + активный проект (а не весь vault).
- Спеки и планы остаются в репо; в Obsidian только сводки и ссылки.
- Обсидиан должен быть запущен для работы хука; иначе хук выдаёт предупреждение.

**Открытые вопросы:**
- См. [[07 Dev Projects/almaty-gg/open-questions]] про сам код-проект.
- Эффективность хука можно подтвердить только после рестарта CLI (следующая сессия).

**Следующий шаг:** пользователь рестартит Claude Code — на старте новой сессии я должен прочитать INDEX/журнал/almaty-gg и поприветствовать кратким резюме.

---
"@
$bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
$url = "http://127.0.0.1:27123/vault/" + (("08 Sessions/2026-05-15.md" -split '/') | ForEach-Object { [System.Uri]::EscapeDataString($_) }) -join '/'
Invoke-RestMethod -Uri $url -Headers $h -Method Put -ContentType "text/markdown" -Body $bytes
```

Expected: no error.

- [ ] **Step 2: Verify the journal file**

Run:

```powershell
$h = @{ Authorization = "Bearer 0d85c4ff50b8de871dd071c012d312077ab28c94f4a3c042ccde78eb00e97239" }
$url = "http://127.0.0.1:27123/vault/" + (("08 Sessions/2026-05-15.md" -split '/') | ForEach-Object { [System.Uri]::EscapeDataString($_) }) -join '/'
(Invoke-RestMethod -Uri $url -Headers $h).Substring(0, 200)
```

Expected: starts with `# 2026-05-15\n\n## Сессия HH:MM — obsidian setup\n...`

---

## Task 5: Create the SessionStart hook script

**Files:**
- Create: `C:\Users\Lenovo\.claude\hooks\obsidian-session-start.ps1`

- [ ] **Step 1: Ensure hooks directory exists**

Run:

```powershell
$dir = "C:\Users\Lenovo\.claude\hooks"
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
Test-Path $dir
```

Expected: `True`

- [ ] **Step 2: Write the hook script**

Use the Write tool to create `C:\Users\Lenovo\.claude\hooks\obsidian-session-start.ps1` with this content:

```powershell
# SessionStart hook for Claude Code.
# Reads the Obsidian API key from the user's MCP config and verifies the
# Local REST API is reachable. Outputs JSON instructing Claude to load
# vault context. If Obsidian is closed, Claude is told to proceed without context.

$ErrorActionPreference = "Stop"

function Emit-AdditionalContext($text) {
    $payload = @{
        hookSpecificOutput = @{
            hookEventName     = "SessionStart"
            additionalContext = $text
        }
    } | ConvertTo-Json -Depth 5 -Compress
    Write-Output $payload
}

try {
    $claudeJson = Get-Content "$env:USERPROFILE\.claude.json" -Raw -ErrorAction Stop | ConvertFrom-Json
    $apiKey = $claudeJson.mcpServers.obsidian.env.OBSIDIAN_API_KEY
    if (-not $apiKey) { throw "OBSIDIAN_API_KEY not found in .claude.json mcpServers.obsidian.env" }

    $headers = @{ Authorization = "Bearer $apiKey" }
    $resp = Invoke-RestMethod -Uri "http://127.0.0.1:27123/" -Headers $headers -TimeoutSec 3
    if (-not $resp.authenticated) { throw "Obsidian API responded but not authenticated" }
} catch {
    Emit-AdditionalContext @"
The Obsidian Local REST API is not reachable ($($_.Exception.Message)).

This session does NOT have second-brain context loaded. Tell the user briefly:
"Obsidian не запущен или недоступен — работаю без подгруженного контекста из vault. Открой Obsidian, чтобы я мог подхватить состояние проектов."

Then proceed with the user's request normally.
"@
    exit 0
}

Emit-AdditionalContext @"
The user uses Obsidian as a persistent second brain. Before responding to the user's first message, do the following:

1. Use the ``mcp__obsidian__*`` tools to read these vault files:
   - ``INDEX.md`` (vault map and ``active_project`` pointer in YAML frontmatter)
   - The most recent file in ``08 Sessions/`` (list the directory, take the last file by date)
   - For the active project, read all files in ``07 Dev Projects/<active_project>/`` (typically ``README.md``, ``decisions.md``, ``open-questions.md``)

2. Greet the user with a short (3-5 line) summary in Russian: на чём остановились в прошлой сессии, какой проект активный, какой логичный следующий шаг. End with a question like "Что делаем сегодня?"

3. Before the session ends (when the user signs off or after major work), append a session block to ``08 Sessions/<today>.md`` using the template at ``01 AI Context/journal-template.md``. If today's file does not exist, create it with the date as H1 heading.

If the ``mcp__obsidian__*`` tools are not available in this session, tell the user to restart Claude Code (the MCP server was likely added after the previous start).
"@
```

- [ ] **Step 3: Test the hook script manually (Obsidian running case)**

Run:

```powershell
& "C:\Users\Lenovo\.claude\hooks\obsidian-session-start.ps1"
```

Expected: a single line of compact JSON like `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"The user uses Obsidian as a persistent second brain..."}}`. No errors.

- [ ] **Step 4: Confirm exit code is 0**

Run:

```powershell
& "C:\Users\Lenovo\.claude\hooks\obsidian-session-start.ps1" | Out-Null
$LASTEXITCODE
```

Expected: `0`

---

## Task 6: Wire the hook into `~/.claude/settings.json`

**Files:**
- Modify: `C:\Users\Lenovo\.claude\settings.json`

- [ ] **Step 1: Read current settings**

Use the Read tool on `C:\Users\Lenovo\.claude\settings.json`. Note the existing structure — it may or may not have a top-level `hooks` key.

- [ ] **Step 2: Add the SessionStart hook**

If `settings.json` does not exist, create it with the following content. If it exists, merge the `hooks.SessionStart` array into it (preserving any other existing hooks). Use the Edit tool for an in-place merge, or Write to recreate.

Target structure:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -NoProfile -ExecutionPolicy Bypass -File \"C:\\Users\\Lenovo\\.claude\\hooks\\obsidian-session-start.ps1\""
          }
        ]
      }
    ]
  }
}
```

The `matcher` value `startup|resume|clear` ensures the hook runs on fresh starts, on `--resume`, and after `/clear`.

- [ ] **Step 3: Validate the JSON**

Run:

```powershell
Get-Content "C:\Users\Lenovo\.claude\settings.json" -Raw | ConvertFrom-Json | Out-Null
"valid JSON: $($?)"
```

Expected: `valid JSON: True`

- [ ] **Step 4: Confirm the hook is registered (if `claude` CLI exposes it)**

Run:

```powershell
claude --help 2>&1 | Select-String -Pattern "hook" -SimpleMatch
```

This is best-effort — if `claude` does not have an inspection command, just rely on the JSON validation in Step 3.

---

## Task 7: Update memory + finalize

**Files:**
- Modify: `C:\Users\Lenovo\.claude\projects\C--ClaudeCode\memory\obsidian_brain.md`
- Create: `C:\Users\Lenovo\.claude\projects\C--ClaudeCode\memory\almaty_gg_project.md`
- Modify: `C:\Users\Lenovo\.claude\projects\C--ClaudeCode\memory\MEMORY.md`

- [ ] **Step 1: Update `obsidian_brain.md` to mention the SessionStart hook**

Use Edit to add a new paragraph at the bottom of the existing file (do not rewrite from scratch):

```
A SessionStart hook at `C:\Users\Lenovo\.claude\hooks\obsidian-session-start.ps1` (registered in `~/.claude/settings.json`) instructs Claude at every new session to read INDEX.md + latest 08 Sessions/* + active project files and to journal at session end. The hook runs before the first user message — if Obsidian is closed, the hook outputs a warning instead of vault-loading instructions.
```

- [ ] **Step 2: Create `almaty_gg_project.md`**

Use the Write tool to create the file with this content:

```markdown
---
name: almaty-gg project
description: User's active dev project — Astro+Supabase web platform, esports club catalog with bookings (Almaty, KZ). Lives in C:\ClaudeCode. Knowledge mirrored in Obsidian vault `07 Dev Projects/almaty-gg/`.
type: project
---

`almaty-gg` is the user's active web app: Astro + TypeScript + Supabase. Catalog of gaming/esports clubs in Almaty with magic-link auth and a bookings flow. Repo at `C:\ClaudeCode`.

Why: this is the project the SessionStart hook treats as `active_project`. When user references "the project" / "сайт" / "клубы" / "booking", default to this codebase.

How to apply: for full current context, read `07 Dev Projects/almaty-gg/README.md`, `decisions.md`, `open-questions.md` in the Obsidian vault (via `mcp__obsidian__*` tools). The repo holds source-of-truth specs in `docs/superpowers/specs/` (almaty-gg landing, respawn-kz catalog, backend MVP). Last known state: backend swapped to localStorage stub with same API surface as Supabase (commit `2a314d3`) — reason flagged as open question.

Watch for the `almaty-gg` vs `respawn-kz` naming question — both spec names exist; treat as same product until user clarifies.
```

- [ ] **Step 3: Update `MEMORY.md`**

Use Edit to add this line below the existing `obsidian_brain.md` line:

```
- [almaty-gg project](almaty_gg_project.md) — active dev project; full state in Obsidian `07 Dev Projects/almaty-gg/`.
```

- [ ] **Step 4: Final verification — list everything**

Run:

```powershell
$h = @{ Authorization = "Bearer 0d85c4ff50b8de871dd071c012d312077ab28c94f4a3c042ccde78eb00e97239" }
Write-Host "=== Vault root ==="
(Invoke-RestMethod -Uri "http://127.0.0.1:27123/vault/" -Headers $h).files
Write-Host "`n=== 01 AI Context ==="
(Invoke-RestMethod -Uri "http://127.0.0.1:27123/vault/01%20AI%20Context/" -Headers $h).files
Write-Host "`n=== 07 Dev Projects/almaty-gg ==="
(Invoke-RestMethod -Uri "http://127.0.0.1:27123/vault/07%20Dev%20Projects/almaty-gg/" -Headers $h).files
Write-Host "`n=== 08 Sessions ==="
(Invoke-RestMethod -Uri "http://127.0.0.1:27123/vault/08%20Sessions/" -Headers $h).files
Write-Host "`n=== 99 Archive ==="
(Invoke-RestMethod -Uri "http://127.0.0.1:27123/vault/99%20Archive/" -Headers $h).files
Write-Host "`n=== Hook script ==="
Test-Path "C:\Users\Lenovo\.claude\hooks\obsidian-session-start.ps1"
Write-Host "`n=== Settings hook section ==="
(Get-Content "C:\Users\Lenovo\.claude\settings.json" -Raw | ConvertFrom-Json).hooks.SessionStart | ConvertTo-Json -Depth 5
```

Expected:
- Root contains `INDEX.md`, `01 AI Context/`, `07 Dev Projects/`, `08 Sessions/`, `99 Archive/`
- `01 AI Context/` contains `second_brain_context_zhandos.md`, `journal-template.md`
- `07 Dev Projects/almaty-gg/` contains `README.md`, `decisions.md`, `open-questions.md`
- `08 Sessions/` contains `2026-05-15.md`
- `99 Archive/` contains `Добро пожаловать.md`, `создайте ссылку.md`
- Hook script: `True`
- Settings hook section: shows the SessionStart entry

- [ ] **Step 5: Hand off to user**

Tell the user:

> Готово. Чтобы хук активировался, перезапусти Claude Code (закрой и снова открой эту сессию). На следующем старте я должен прочитать INDEX, последний журнал и файлы almaty-gg, и поприветствовать тебя кратким резюме.
>
> Если что-то не так — напиши в новой сессии "проверь хук" и я продиагностирую.

---

## Acceptance criteria mapping (from spec)

| Spec § | Plan task |
|---|---|
| Vault has the structure shown in § "Vault structure" | Tasks 1, 2, 3, 4 |
| `INDEX.md` exists with `active_project: almaty-gg` pointer | Task 2 |
| `07 Dev Projects/almaty-gg/` populated | Task 3 |
| `08 Sessions/2026-05-15.md` contains today's session entry | Task 4 |
| `~/.claude/settings.json` has SessionStart hook | Task 6 |
| After CLI restart, opening a new session shows Claude reading vault files | Verified by user post-restart (out of plan execution scope) |
| At session end, today's journal has a new block | Behavioral — Claude follows hook instruction; verified next session |
