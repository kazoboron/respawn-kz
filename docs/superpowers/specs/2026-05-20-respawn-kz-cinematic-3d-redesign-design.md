# respawn.kz — Cinematic 3D Redesign (Design Spec)

**Date:** 2026-05-20
**Status:** Approved direction, prompt for claude.ai/design to be assembled
**Scope:** Full production replacement of landing (`/`); other pages in follow-up rounds.

---

## Decisions log

| # | Question | Answer |
|---|---|---|
| 1 | Scope | Full prod replacement of respawn.kz (a11y 100/100, perf 90+, booking must keep working) |
| 2 | Vibe | Apple/premium cinematic 3D (Vision Pro / Mac Pro page reference) |
| 3 | Narrative | Hero is gaming PC hardware — PC build + RGB + peripherals |
| 4 | Brand continuity | Full rebrand — drop cyan, drop Audiowide, drop glitch/emoji/scanline |
| 5 | Accent color | Electric violet → pink shift (`#8b5cf6` → `#d946ef`), NVIDIA-RTX-style |
| 6 | Pages first round | Landing only (`/`). Other pages = follow-up prompts |
| 7 | Typography | Inter Display (body/UI) + JetBrains Mono (numbers/specs). Audiowide gone. |
| 8 | 3D technique | Pre-rendered video tied to scroll position (not real-time WebGL) — perf-friendly, GPU-light |

## Brand voice (unchanged)

- All copy in **Russian**, addresses user as **«ты»**, never «Вы»
- English reserved for product/tech terms (PS5, VR, Visa, Kaspi, RTX, 240Hz)
- Sentence case everywhere, including buttons
- Direct, short, imperative — «Найти клуб», «Забронируй», «Готов играть?»
- Numbers in mono (JetBrains Mono): «12 000+ игроков», «от 1 200 ₸/час»
- **No emoji anywhere** — old brand allowed them in supporting copy; new brand drops them entirely
- **No glitch effect** — old brand had `.glitch` on hero words; new brand replaces with subtle violet glow + scroll-tied lighting changes

## Visual language

### Palette

| Token | Hex | Role |
|---|---|---|
| `--bg-base` | `#0a0a0a` | Page background (slightly cooler than pure black) |
| `--bg-surface` | `#141414` | Cards, header (scrolled), modal panel |
| `--bg-elevated` | `#1c1c1c` | Inputs, info chips |
| `--text-primary` | `#fafafa` | Headlines, body text |
| `--text-secondary` | `#a3a3a3` | Subtitles, descriptions |
| `--text-muted` | `#525252` | Labels, helper text |
| `--titanium` | `#888888` | Brushed-metal accents, dividers |
| `--accent` | `#8b5cf6` | Primary CTA, links, RGB-pulse |
| `--accent-glow` | `#d946ef` | Glow shift, hover state |
| `--danger` | `#ef4444` | Errors (neutral red, not magenta) |
| `--success` | `#22c55e` | Confirmations (neutral green) |

**No** cyan, no neon-magenta-as-primary, no yellow-as-warning. Old palette is fully retired.

### Typography

- **Inter Display** (variable, 100–900) for all UI text. Loaded from Google Fonts.
- **JetBrains Mono** (variable, 400–700) for numbers, prices, specs, code, stat rows.
- **No third font.** Logo is set in Inter Display at 600 weight with tight letter-spacing (`-0.04em`), not a display font.

Headline scale (Apple-style):
- Hero h1: `clamp(48px, 8vw, 120px)`, weight 600, line-height 0.95, letter-spacing `-0.04em`
- Section h2: `clamp(36px, 5vw, 72px)`, weight 600, line-height 1.0
- Body: 17–19px, weight 400, line-height 1.5
- Eyebrow: 13px uppercase, letter-spacing 0.15em, weight 500

### Glow / shadow system

- `--glow-violet: 0 0 32px rgba(139, 92, 246, 0.5), 0 0 64px rgba(139, 92, 246, 0.2)` — primary CTA, hovers
- `--glow-pink: 0 0 32px rgba(217, 70, 239, 0.4)` — accent moments, RGB shifts
- `--shadow-deep: 0 32px 64px rgba(0, 0, 0, 0.8)` — for the floating 3D PC in beats 1–3
- No cyan-tinted borders. Borders are `rgba(255,255,255,0.08)` (default) → `rgba(139,92,246,0.4)` (hover).

### Motion

- **Lenis smooth scroll** library (Apple uses similar). Soft easing, 120ms inertia.
- **Scroll-tied video** in hero: `<video>` element with `currentTime` driven by `window.scrollY`. Pre-rendered at 60fps. Total video length ~6–8 seconds covering beats 1–3.
- **Per-element fade-in** on intersection: 400ms, ease-out, 12px translateY.
- **Hover lifts** on cards: `translateY(-4px)`, 250ms.
- **No bouncy springs**, no scale-down on press, no parallax beyond the hero pinning.
- `prefers-reduced-motion: reduce` → disable scroll-tied video, replace with static hero image; disable all transforms; keep simple opacity fades.

---

## Landing scroll narrative — 6 beats

```
┌─────────────────────────────────────────────────────────────┐
│  BEAT 1 — COLD OPEN                                          │ ← pinned hero, sticky
│  Black. 3D PC sits off, barely visible in low-key lighting.  │   scroll-tied video
│  Title: «Лучшие клубы Казахстана.                            │   (beats 1→3)
│         Один тап до игры.»                                   │
│  CTA: «Найти клуб»                                            │
│  Scroll cue: faint chevron + «↓ Прокрути ↓»                  │
├─────────────────────────────────────────────────────────────┤
│  BEAT 2 — POWER-ON                                            │ ← still pinned
│  PC powers on as user scrolls. RGB ignites in violet → pink. │   video scrubs forward
│  Fans spin up. Monitor flickers on showing CS2 menu.         │
│  Sub: «Забронируй слот за 30 секунд.                         │
│        Без звонков, без очередей.»                            │
├─────────────────────────────────────────────────────────────┤
│  BEAT 3 — EXPLODED SPECS                                      │ ← still pinned
│  PC components float apart with thin connecting lines and    │   final video frame
│  callout labels: «RTX 4080», «240Hz LG UltraGear»,           │
│  «Razer DeathAdder V3», «Secretlab Titan»                    │
│  Apple-spec-callout style, no body copy needed                │
├─────────────────────────────────────────────────────────────┤
│  ──── unpinning point ────                                    │
│                                                              │
│  BEAT 4 — B-ROLL CINEMATIC                                    │ ← full-width
│  4–6 sec looped video: real club, RGB lighting, drone pan.   │   muted, autoplay
│  Sound off, no controls. Caption underneath in mono:          │
│  «80+ клубов · 10 городов · Открыто 24/7»                    │
├─────────────────────────────────────────────────────────────┤
│  BEAT 5 — CATALOG TEASER                                      │ ← grid
│  3-up grid (1-up on mobile) of top clubs with real photos.   │
│  Apple-card style: large photo, thin divider, minimal text.  │
│  Name + city + rating in mono + price-from in violet mono.    │
│  CTA at bottom: «Все 80+ клубов →»                            │
├─────────────────────────────────────────────────────────────┤
│  BEAT 6 — FINAL CTA + STATS                                   │ ← centered
│  Massive h1: «Готов играть?»                                 │
│  Button: «Найти свой клуб» with violet glow                  │
│  Apple-stat-row in mono below button:                         │
│  «12 000+ игроков · 80+ клубов · 10 городов»                 │
│                                                              │
│  Footer: minimal — logo, 4 columns (Каталог / Для клубов /   │
│  Помощь / Юр.), social links, copyright.                     │
└─────────────────────────────────────────────────────────────┘
```

### Beat-by-beat technical notes

**Beats 1–3 (pinned hero scroll-tied 3D):**
- `position: sticky; top: 0; height: 100vh`
- Container scrollable area: `300vh` (so user scrolls through 3 "pages" while hero is pinned)
- Video element: `<video src="hero-pc-sequence.mp4" muted playsinline preload="auto">`
- JS: scroll handler sets `video.currentTime = (scrollY / 3vh) * videoDuration` clamped 0–duration
- Text overlays positioned absolute, fade in/out at scroll thresholds: 0–33vh (beat 1), 33–66vh (beat 2), 66–100vh (beat 3)
- Mobile: replace with single static image + simple fade-up text. Skip the pinned sticky behavior entirely (it's janky on iOS scroll).

**Beat 4 (B-roll):**
- `<video autoplay muted loop playsinline>` standard.
- Lazy-loaded with Intersection Observer (load when within 1 viewport).
- Provide static `<img>` fallback for `prefers-reduced-motion`.

**Beats 5–6:** standard responsive layouts, no scroll-tied behavior.

---

## Pages out of scope (this round)

These pages keep their *current* implementation but should receive the new color tokens + typography in a CSS-only pass so they don't look broken next to the new landing:

- `/clubs` — catalog
- `/clubs/[slug]` — club detail
- `/for-clubs` — B2B
- `/about` — about
- `/me` — user dashboard
- `/login` + `/auth/callback`
- `/admin/*`, `/dashboard/*`
- `/privacy`, `/terms`

A separate prompt round will redesign each surface in the new language. This spec covers the landing only.

---

## Constraints to communicate to claude.ai/design

1. **Output target:** React + TailwindCSS (or vanilla HTML/CSS), ready to be lifted into an Astro project. No frameworks beyond React.
2. **No 3D library required.** The "3D" is a pre-rendered video file — designer should mock up the *visual frames* (screenshots) and the *scroll-tied layout*. We'll source the actual video separately.
3. **A11y baseline:** All interactives keyboard-accessible, focus rings visible, semantic HTML (`<main>`, `<section>`, `<h1>` per page), `aria-label` on icon-only buttons, `prefers-reduced-motion` honoured.
4. **No emoji, no Lucide/Heroicons.** Icons inline SVG, hand-drawn, 1.5–2px stroke, currentColor.
5. **Perf budget:** Total page weight < 500KB initial, < 2MB total. Video files lazy-loaded.
6. **Russian copy throughout.** Exact strings provided in the prompt.

---

## Follow-up

After designer returns first draft:
1. Review output against spec
2. Iterate on visual specifics with screenshot feedback
3. Source/produce the actual hero video sequence (Blender render or commissioned 3D artist)
4. Source the B-roll cinematic clip (commissioned shoot at partner club, or stock cinematic licensed)
5. Implement in Astro — port React components, integrate scroll-tied video logic, wire up to existing Supabase data
6. Run a11y + perf audit, iterate until 100/100 and 90+
7. Deploy to staging branch before main

Once landing is locked, repeat the spec → prompt → iterate loop for `/clubs`, `/clubs/[slug]`, `/for-clubs`, `/about` (these can share one design round since they're all marketing surfaces). Then a separate round for dashboards/admin (functional UI in the new system).
