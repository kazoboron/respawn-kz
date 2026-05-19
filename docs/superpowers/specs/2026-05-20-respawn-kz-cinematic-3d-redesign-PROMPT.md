# Prompt for claude.ai/design — respawn.kz landing v2

Paste everything below the `---` line into claude.ai/design. Attach reference
screenshots in the same message (Apple Vision Pro page, Mac Pro page, NVIDIA
RTX pages, any specific shots you've collected).

---

I need a complete landing-page design for **respawn.kz** — an online booking
platform for PC gaming clubs (компьютерные клубы) in Kazakhstan. Players
choose a club, pick a time slot, pay online, and show up to play. We've shipped
a working product already; this is a full visual redesign for the marketing
landing only.

## The brief in one sentence

A cinematic, Apple-product-page-style landing for a PC-club booking platform —
the kind of treatment Apple gives to Vision Pro or Mac Pro, applied to a
gaming PC instead of an Apple device. Scroll-driven 3D hero (rendered as a
scroll-scrubbed video), exploded specs view, club b-roll, catalog teaser,
final CTA.

## Audience

- Primary: 16–28 year-old gamers in Kazakhstan's 10 biggest cities (Алматы,
  Астана, Шымкент, Караганда, Актобе, Тараз, Павлодар, Усть-Каменогорск,
  Семей, Атырау)
- Tone: respectful and direct. The brand grew up in PC clubs and respects the
  player. No corporate marketing-speak.
- Secondary: club owners scouting whether the platform looks premium enough
  to join.

## Brand voice — copy rules (strict)

- **All copy in Russian.** Brand and tech terms stay in Latin: `respawn.kz`,
  `RTX 4080`, `240Hz`, `CS2`, `Valorant`, `Visa`, `Kaspi`.
- **Address the user as «ты», never «Вы».** Friendly, not formal.
  «Забронируй», «Выбери клуб», «Готов играть?»
- **Direct and short.** Headlines are calls to action, not descriptions.
- **Sentence case** everywhere — including buttons. «Найти клуб», never «НАЙТИ КЛУБ».
- **Uppercase only** for tiny eyebrow labels («ХАРАКТЕРИСТИКИ», «БРОНЬ»,
  «ГОРОДА») with letter-spacing 0.15em.
- **Numbers go in JetBrains Mono.** Prices «1 200 ₸», stats «12 000+ игроков»,
  specs «240 Hz», phone numbers — all mono.
- **No emoji anywhere.** Previous brand had emoji accents; we are dropping them.
- **No glitch / shake / scanline effects.** Previous brand had a glitch on the
  hero word; we are dropping all of that.

## Visual direction

**Reference vocabulary:** Apple Vision Pro page, Apple Mac Pro page, Tesla
Cybertruck page, NVIDIA RTX 40-series product pages. Cinematic, dark,
low-key lit, with one electric-violet accent that pulses.

### Color palette

Use these tokens exactly. Do **not** introduce cyan, magenta, yellow, orange,
or any other accent — the only accent is violet→pink.

```css
--bg-base:        #0a0a0a;  /* page background — almost black, slightly cool */
--bg-surface:     #141414;  /* cards, scrolled header */
--bg-elevated:    #1c1c1c;  /* inputs, info chips */
--text-primary:   #fafafa;  /* headlines, body */
--text-secondary: #a3a3a3;  /* subtitles */
--text-muted:     #525252;  /* helper text, labels */
--titanium:       #888888;  /* brushed-metal dividers */
--border-soft:    rgba(255,255,255,0.08);
--border-hover:   rgba(139, 92, 246, 0.4);

--accent:         #8b5cf6;  /* electric violet — primary CTA, RGB pulse */
--accent-glow:    #d946ef;  /* pink-shift for glow halos and hover states */

--danger:         #ef4444;  /* neutral red for errors */
--success:        #22c55e;  /* neutral green for confirmations */

--glow-violet:    0 0 32px rgba(139, 92, 246, 0.5), 0 0 64px rgba(139, 92, 246, 0.2);
--glow-pink:      0 0 32px rgba(217, 70, 239, 0.4);
--shadow-deep:    0 32px 64px rgba(0, 0, 0, 0.8);
```

### Typography

- **Inter Display** (variable, weights 100–900) for all UI text. Load from
  Google Fonts.
- **JetBrains Mono** (variable, 400–700) for numbers, prices, specs, stats,
  any "system fact" text.
- Logo wordmark: set in Inter Display 600 with letter-spacing -0.04em — **not**
  a display script font.

Scale:
- Hero h1: `clamp(48px, 8vw, 120px)`, weight 600, line-height 0.95, tracking -0.04em
- Section h2: `clamp(36px, 5vw, 72px)`, weight 600, line-height 1.0
- Body: 17–19px, weight 400, line-height 1.5
- Eyebrow: 13px UPPERCASE, tracking 0.15em, weight 500

### Iconography

Hand-drawn inline SVG only. **Never** use Lucide, Heroicons, Font Awesome, or
any library. Outline icons use stroke 1.5–2px, `stroke: currentColor`,
`fill: none`, `stroke-linecap: round`, `stroke-linejoin: round`.

### Motion

- Use the **Lenis** smooth-scroll library for body scroll.
- The hero (beats 1–3) is **pinned with sticky** for a 3× viewport scroll range,
  during which a `<video>` element is scroll-scrubbed (set
  `video.currentTime` based on scroll progress within the pinned range).
- Fade-up animations on intersection: 400ms ease-out, 12px translateY.
- Card hover: `translateY(-4px)` + violet border + soft violet glow, 250ms.
- **No bouncy springs, no parallax beyond the hero pin, no scale-down on press.**
- **Honour `prefers-reduced-motion: reduce`** — replace scroll-scrubbed video
  with a static hero image, disable transforms, keep simple opacity fades.

## Page structure — six beats

The landing is a single long-scroll page with 6 distinct beats. Beats 1–3
share a pinned sticky hero (~300vh of scroll space).

### Beat 1 — Cold Open (in pinned hero, t=0)

- Background: `#0a0a0a` with a barely-visible 3D gaming PC tower in the
  centre, lit from below in faint violet. The PC is **off** — no RGB yet.
- Below the PC (or overlaid centred): hero h1
  > Лучшие клубы Казахстана.
  > Один тап до игры.
- One primary CTA button: `Найти клуб` — violet fill, white text, violet glow.
- Scroll cue below the CTA: a thin chevron icon + uppercase eyebrow
  «↓ ПРОКРУТИ ↓» in `--text-muted`.

### Beat 2 — Power-On (in pinned hero, scroll progress ~33–66%)

- Same pinned hero, video has scrubbed forward. PC has powered on: RGB strips
  glow in violet, fans visibly spinning (motion blur), monitor flickers on
  showing a CS2 menu still.
- Hero h1 fades out, replaced by sub-headline anchored bottom-left or centred:
  > Забронируй слот за 30 секунд.
  > Без звонков, без очередей.
- No CTA in this beat — keep visual focus on the powering-on sequence.

### Beat 3 — Exploded Specs (in pinned hero, scroll progress ~66–100%)

- PC components float apart in 3D space: case, motherboard, GPU, RAM, monitor,
  keyboard, mouse, chair. Thin titanium lines connect each component to a
  callout label.
- Each callout in Apple-spec style — small uppercase label + mono spec value:
  - `GPU` → `RTX 4080 16GB`
  - `МОНИТОР` → `LG UltraGear 240Hz`
  - `МЫШЬ` → `Razer DeathAdder V3`
  - `КРЕСЛО` → `Secretlab Titan`
  - `НАУШНИКИ` → `HyperX Cloud III`
- Tiny eyebrow above the whole composition: «ХАРАКТЕРИСТИКИ КЛУБОВ»
- No CTA — viewer is meant to absorb the trust signal then scroll past.

### Beat 4 — B-Roll Cinematic (unpinned, full-width)

- Full-bleed `<video autoplay muted loop playsinline>` placeholder — a 4–6
  second cinematic of a real PC club at night: RGB-lit machines in rows,
  players in chairs from behind, drone-style slow pan. (Use a dark placeholder
  with violet vignette mock; we'll source the real footage later.)
- Below the video, centred mono caption:
  `80+ клубов · 10 городов · Открыто 24/7`

### Beat 5 — Catalog Teaser (grid)

- Section eyebrow: «ТОП КЛУБЫ»
- Section h2: «Где играть прямо сейчас»
- 3-column grid desktop, 2-column tablet, 1-column mobile.
- Each card is Apple-product-card style:
  - Large square photo of the club (use a dark placeholder with violet tint)
  - Thin `--titanium` divider
  - Club name in Inter Display 500, 22px
  - City + district in `--text-secondary`, 14px, separated by ` · `
  - Rating in mono: `★ 4.8` (rating in violet, count «(312 отзывов)» in muted)
  - Price-from line in mono: «от **1 200 ₸** /час» (the number in `--accent`)
- Sample club data to use:
  1. **Cyberzone** · Алматы · Алмалинский р-н · `★ 4.9` (412 отзывов) · от 1 500 ₸/час
  2. **GG Arena** · Астана · Есиль · `★ 4.8` (287 отзывов) · от 1 800 ₸/час
  3. **Respawn Hub** · Шымкент · Аль-Фарабийский · `★ 4.7` (156 отзывов) · от 1 200 ₸/час
- Hover state: card lifts 4px, `--border-soft` becomes `--border-hover` (violet),
  soft violet glow appears underneath.
- Below the grid, a ghost CTA: `Все 80+ клубов →` (text link in violet with
  arrow that translates 4px right on hover).

### Beat 6 — Final CTA + Stat Row + Footer

- Massive centred h1 (~120px on desktop): «Готов играть?»
- Single primary CTA below: `Найти свой клуб` — violet fill, white text, glow.
- Below the CTA, a single-line stat row in JetBrains Mono, 18px,
  `--text-secondary` with violet numerals:
  `12 000+ игроков  ·  80+ клубов  ·  10 городов`
- Footer:
  - Top divider line in `--titanium` at 10% opacity
  - 4 columns of links:
    - **Каталог:** Алматы, Астана, Шымкент, Все города
    - **Для клубов:** Подключиться, Тарифы, Поддержка
    - **Помощь:** FAQ, Контакты, Telegram @respawn_kz_support
    - **Юр.:** Политика конфиденциальности, Условия использования
  - Bottom row: logo wordmark `respawn.kz` (Inter Display 600, -0.04em) + copyright
    «© 2026 respawn.kz · Алматы, Казахстан» in `--text-muted`.

## Header (sticky across all beats)

- Transparent at top, becomes `rgba(10,10,10,0.85)` + `backdrop-filter: blur(12px)`
  after the user scrolls 80px.
- Layout:
  - Left: logo wordmark `respawn.kz`
  - Centre: nav links — `Клубы`, `Города`, `Для клубов`, `Помощь` (Inter Display
    500, 14px, `--text-secondary`, hover → `--text-primary` with a 1px violet
    underline that grows in from left on 250ms)
  - Right: secondary ghost button `Войти` + primary violet button `Найти клуб`
- Mobile: collapses to a hamburger that opens a right-side drawer at 320px wide
  with the same links stacked vertically.

## Tech requirements

- **Output as React components** with TailwindCSS classes, ready to be lifted
  into an Astro project. Single page export.
- **No Three.js, no R3F, no WebGL libraries.** The "3D" hero is implemented as
  a scroll-scrubbed pre-rendered `<video>` element — I will produce the video
  file separately (via Blender). Your job is the layout, the scroll-pin logic,
  the text overlays, and the `currentTime` driver code.
- **A11y baseline:** Semantic HTML (`<main>`, `<section>`, single `<h1>`),
  visible focus rings on all interactives, `aria-label` on icon-only buttons,
  `prefers-reduced-motion` respected (disable scroll-scrubbing, fall back to
  static image).
- **Perf budget:** initial JS < 100KB, video files lazy-loaded with
  Intersection Observer.
- **Mobile-first responsive.** On mobile, drop the pinned-sticky hero
  entirely — replace with a single static hero image + simple text fade-up.
  iOS Safari does not handle scroll-pinning + video scrubbing well.

## What to deliver

1. A single React component (`<RespawnLanding />`) covering all 6 beats + header
   + footer, with all Russian copy inline, all Tailwind classes wired, and the
   scroll-scrubbed video logic implemented (Lenis + a `useEffect` setting
   `video.currentTime`).
2. The color tokens above implemented either as Tailwind theme extensions or
   CSS custom properties at `:root`.
3. Placeholder video elements (`<video>` tags) with dark backgrounds + a
   centred uppercase mono caption like `PLACEHOLDER: hero-pc-sequence.mp4`
   so I can see where the videos go before I produce them.
4. Mobile layout (≤640px) that drops the pinned-hero and shows a simple
   static-image fallback.
5. A short README block at the top of the file explaining how to plug it into
   an Astro project and where to drop the actual video files.

## What NOT to do

- Do not introduce cyan, magenta, yellow, orange, or pink-as-primary. Only
  violet `#8b5cf6` → `#d946ef` for accent.
- Do not use emoji.
- Do not use any icon library (Lucide, Heroicons, etc.). Inline SVG only.
- Do not use Audiowide or any display script font. Inter Display only.
- Do not add a glitch effect, scanline, or grid overlay. Those belong to the
  previous brand — we're explicitly leaving them behind.
- Do not invent new copy. Use the exact Russian strings provided above.

Iterate with me — once I see the first pass, I'll send screenshots with
specific feedback on what to push further.
