# Obsidian Second Brain — setup & session automation

**Date:** 2026-05-15
**Status:** Design approved, awaiting plan
**Owner:** Zhandos Kultumiyev

## Problem

Claude Code conversations have no memory beyond the current session. Project knowledge, decisions, and progress evaporate when the session ends. The user has Obsidian + Local REST API plugin installed and wants to use the vault as a persistent "second brain" — automatically loaded at session start and updated at session end.

## Goals

1. Make Claude restore project context at the start of every new session (without dumping the entire vault into context).
2. Make Claude record what was done during each session into a journal at the vault.
3. Establish a clean, scalable folder structure that supports both creative projects (mobile games, stories — pre-existing user direction) and dev projects (current Astro/Supabase work, future ones).
4. Migrate the current dev project's known context into the vault now.

## Non-goals

- Replacing source-of-truth files: code lives in repos, specs in `docs/superpowers/`, secrets in `.env`/MCP config. Obsidian holds **summaries and pointers**, not duplicates.
- Building a full PARA / Zettelkasten / GTD methodology. Structure stays pragmatic and grows organically.
- Cross-vault sync, mobile app integration, or any feature that depends on resources outside this Windows machine.

## Vault structure

```
Zhandos Second Brain/
├── INDEX.md                       — map of vault + `active_project` pointer (single source of truth for "what are we working on")
├── 00 Inbox/                      — quick captures before sorting
├── 01 AI Context/
│   └── second_brain_context_zhandos.md   (moved from root)
├── 02 Mobile Games/               — folders created on first use
├── 03 Marijuana Business Simulator/
├── 04 Story Bible/
├── 05 Visual References/
├── 06 Business and Monetization/
├── 07 Dev Projects/
│   └── <project-slug>/
│       ├── README.md              — what it is, status, stack, key decisions, links to repo specs
│       ├── decisions.md           — short architectural decision log
│       └── open-questions.md      — unresolved questions
├── 08 Sessions/
│   └── YYYY-MM-DD.md              — one file per day, blocks per session
└── 99 Archive/                    — deprecated notes, default Obsidian welcome files
```

The `02`–`06` and `99` sections are reserved according to the user's pre-existing plan in `second_brain_context_zhandos.md` § 14. We do not pre-create empty folders for them — they appear when content arrives.

`07 Dev Projects/` is new and added for code projects (current: `almaty-gg`).

## Journal format

`08 Sessions/YYYY-MM-DD.md` — one file per day. One block per session, separated by `---`:

```markdown
# 2026-05-15

## Сессия HH:MM — <project-slug or topic>
**Контекст в начале:** what we were on / what I knew when I started.
**Что сделано:**
- Concrete changes with file paths and (when applicable) commit shorthashes.
**Решения:**
- Architectural / product choices made.
**Открытые вопросы:**
- Things deferred or needing attention.
**Следующий шаг:** one sentence — the natural next move.

---
```

The template is a guideline, not a schema. Short sessions get short blocks. Trivial Q&A sessions are not journaled.

**Trigger points for journaling (Claude's responsibility, not a hook):**
- Before the session ends (user signs off / closes the work)
- After completing a major task (can happen multiple times per session)
- When Claude judges that meaningful work was produced and worth recording

## Session-start context loading

A `SessionStart` hook injects an instruction into Claude's context. The hook **does not read vault files itself** — it only tells Claude what to read via the `mcp__obsidian__*` tools. This keeps token cost low and gives Claude flexibility (e.g., to skip reading if a file is missing, or to pull additional project files Claude judges relevant).

### Hook instruction (injected at session start)

> The user uses Obsidian as a second brain. Before responding to the user:
>
> 1. Verify the `obsidian` MCP server is connected (tools `mcp__obsidian__*` should be available). If they are not, tell the user to ensure Obsidian is running, then proceed without context.
> 2. Read these files:
>    - `INDEX.md` — vault map and `active_project` pointer
>    - The most recent file in `08 Sessions/` (use `list_files_in_dir` then read the last one)
>    - For the active project: `07 Dev Projects/<active_project>/README.md`, `decisions.md`, `open-questions.md`
> 3. Greet the user with a 3-5 line summary: "Подхватываю с того места, где остановились — последняя сессия была про X, активный проект Y, на следующем шаге Z. Что делаем?"
> 4. Before the session ends, append a session block to `08 Sessions/<today>.md` per the journal template (see `01 AI Context/journal-template.md`).

### Why a hook and not just CLAUDE.md instructions

Hooks are deterministic — they fire at the exact lifecycle event. CLAUDE.md instructions can be ignored by the model under cognitive load. The hook output is a system reminder that is harder to skip.

## Session-end journaling

`SessionEnd` hook **cannot run Claude tools** (the session is already terminating). Therefore the journal write is Claude's responsibility, prompted by the SessionStart instruction. Two safety nets:

1. SessionStart instruction explicitly says "before the session ends, append to today's journal".
2. User can manually invoke a `/journal` slash command (out of scope for this spec — flagged as a follow-up if Claude proves unreliable at journaling).

## Active project pointer

`INDEX.md` contains a YAML-style metadata block:

```yaml
---
active_project: almaty-gg
last_updated: 2026-05-15
---
```

Plus a markdown body: short list of all projects with one-line descriptions and links to their `README.md`. This is the single document that tells Claude "what are we currently working on".

The pointer is updated:
- By the user typing "теперь работаем над X"
- By Claude on confirmed project switches
- Manually by the user editing `INDEX.md`

## Hook configuration

**Location:** `C:\Users\Lenovo\.claude\settings.json` (user scope, applies in all projects). Edited via the `update-config` skill.

**Scripts location:** `C:\Users\Lenovo\.claude\hooks\` (PowerShell scripts, created if folder doesn't exist).

**Required hooks:**

| Event | Script | Purpose |
|---|---|---|
| `SessionStart` | `obsidian-session-start.ps1` | Verifies Obsidian is reachable; outputs the context-loading instruction. |

`SessionEnd` is not used (cannot run tools).
`Stop` is not used (would fire on every Claude response — too noisy).

**Why no API key in scripts:** the key already lives in `C:\Users\Lenovo\.claude.json` under `mcpServers.obsidian.env.OBSIDIAN_API_KEY`. The session-start script reads it from there to verify connectivity. Single source of truth.

## Migration plan (current knowledge → vault)

Performed once during initial setup, executed via `mcp__obsidian__*` tools (after CLI restart) or REST API directly:

| Target file | Source | Content summary |
|---|---|---|
| `INDEX.md` | new | Vault map + `active_project: almaty-gg` |
| `01 AI Context/second_brain_context_zhandos.md` | move from root | (no content change) |
| `01 AI Context/journal-template.md` | new | The journal template from § "Journal format" |
| `07 Dev Projects/almaty-gg/README.md` | git log + `src/` + existing specs | Stack, pages, current state, links to repo specs |
| `07 Dev Projects/almaty-gg/decisions.md` | git log | Astro migration, Supabase auth via magic link, RLS on bookings, recent localStorage stub conversion |
| `07 Dev Projects/almaty-gg/open-questions.md` | inferred | Why localStorage stub? almaty-gg vs respawn-kz relationship? Live deploy? |
| `08 Sessions/2026-05-15.md` | this session | Today's work: Obsidian connection, vault setup |
| `99 Archive/Добро пожаловать.md` | move from root | Default Obsidian welcome |
| `99 Archive/создайте ссылку.md` | move from root | Default Obsidian sample |

## What we explicitly do NOT migrate

- Specs and plans from `docs/superpowers/` — they stay in the repo (versioned, source-of-truth). Obsidian links to them by absolute path.
- Code, environment variables, API keys.
- Anything that already lives reliably elsewhere (git history, package.json, etc.) — only summaries.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Obsidian closed when session starts → no context | SessionStart script detects this, outputs warning. Claude proceeds without context. |
| Claude forgets to journal at session end | SessionStart instruction repeats it. If unreliable in practice, add a `/journal` slash command (follow-up). |
| Vault structure drifts from this spec | The structure is documented in `INDEX.md` body; on detection of drift, Claude should propose a cleanup rather than silently working around it. |
| Two parallel sessions write to same `Sessions/<today>.md` | Out of scope. Single-user, single-session use. If it becomes an issue, switch journal naming to `YYYY-MM-DD-HHMM.md`. |
| The user later wants the vault on a different machine / synced | Standard Obsidian sync (paid) or git-based vault sync. Out of scope for this spec but compatible with the chosen structure. |

## Out of scope (follow-ups, not now)

- A `/journal` slash command for explicit journaling.
- Automatic git commits of vault changes.
- Per-project journal in addition to global.
- Cross-vault search across multiple Obsidian vaults.
- Migrating spec/plan content into Obsidian (current decision: link only).

## Acceptance criteria

1. Vault has the structure shown in § "Vault structure".
2. `INDEX.md` exists with `active_project: almaty-gg` pointer.
3. `07 Dev Projects/almaty-gg/` populated with `README.md`, `decisions.md`, `open-questions.md`.
4. `08 Sessions/2026-05-15.md` contains today's session entry.
5. `C:\Users\Lenovo\.claude\settings.json` has a `SessionStart` hook pointing at `obsidian-session-start.ps1`.
6. After CLI restart, opening a new session shows Claude reading vault files and producing the 3-5 line greeting per § "Hook instruction".
7. At session end, today's journal file has a new block describing the session.
