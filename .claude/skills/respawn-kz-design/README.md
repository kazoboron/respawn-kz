# respawn.kz — Design System

> **respawn.kz** — платформа онлайн-бронирования компьютерных клубов в Казахстане.
> Найди клуб, забронируй слот, оплати картой. Без звонков, без очередей, без предоплаты администратору.

This is the design system extracted from the live codebase. It captures the brand's
neon-cyberpunk visual language, its Russian-language copy voice, and the components
needed to build new pages or prototypes that look indistinguishable from production.

## Source

- **Codebase (GitHub):** [`kazoboron/respawn-kz`](https://github.com/kazoboron/respawn-kz) — Astro 4 SSG + Supabase + Cloudflare Pages
- **Production:** [respawn.kz](https://respawn.kz)
- **Staging:** [respawn-kz.pages.dev](https://respawn-kz.pages.dev)

If you have access, browse the repo for the full set of components, page templates,
and content. The most useful files for visual fidelity are:
`src/styles/global.css`, `src/components/Logo.astro`, `src/components/ClubCard.astro`,
and `src/layouts/BaseLayout.astro`.

## Product context

One product, one audience, two surfaces:

1. **Players (B2C)** — landing, catalog of clubs, individual club pages, login (magic
   link), personal cabinet with bookings.
2. **Club owners (B2B)** — single `/for-clubs/` page selling onboarding (one tariff,
   one form, three steps).

Tone is friendly-but-direct Russian, addressing players as **«ты»** (informal). The
brand position is: *we grew up in PC clubs ourselves, we respect the game, no hidden
fees, no admin upcharges, just respawn and play.*

Cities covered: Алматы, Астана, Шымкент, Караганда, Актобе, Тараз, Павлодар,
Усть-Каменогорск, Семей, Атырау — Kazakhstan's 10 largest.

---

## Index

```
.
├── README.md                  ← you are here
├── SKILL.md                   ← skill manifest (works in Claude Code too)
├── colors_and_type.css        ← all design tokens + base typography
├── assets/                    ← logo, hero photos, favicon
├── preview/                   ← Design-System-tab cards (Type, Colors, Spacing, Components, Brand)
└── ui_kits/
    └── website/               ← full Astro site recreated as a React click-thru prototype
        ├── README.md
        ├── index.html         ← interactive demo
        ├── tokens.css
        └── *.jsx              ← Header, Footer, ClubCard, SearchForm, FAQ, …
```

There is **one product surface** — the marketing site + booking flow — so there is
**one UI kit**: `ui_kits/website/`.

---

## CONTENT FUNDAMENTALS

### Language & tone

- **Russian (`lang="ru"`)** for everything user-facing. Brand name, product names
  and tech terms stay in Latin: *respawn.kz, PS5, VR, RTX 4080, Visa, Mastercard,
  Kaspi*.
- **Воровайся к игроку на «ты».** Always informal: «Забронируй», «Выбери клуб»,
  «Куда писать если проблема?». Never «Вы». The brand is a friend, not a clerk.
- **Direct, short, imperative.** Headlines are calls to action, not descriptions:
  - *«Забронируй компьютерный клуб в Казахстане за 30 секунд»*
  - *«Три шага до игры»*
  - *«Готов играть?»*
  - *«Найти клуб»*
- **No corporate fluff.** Promises are concrete: *«Бесплатная отмена за 2 часа до
  начала»*, *«Возврат на ту же карту, 3-5 рабочих дней»*, *«Telegram
  @respawn_kz_support — отвечаем 24/7»*.
- **Numbers go in mono.** *«12 000+ игроков», «80+ клубов», «10 городов»*, prices
  *«от 1 200 ₸ /час»*, и phone numbers — all set in JetBrains Mono so they read
  as "system facts" rather than marketing.
- **One subtle gaming wink per surface, max.** The product is *respawn* — a
  gamer's word — but the copy never overplays it. You get exactly one glitch
  effect (on the hero word «30 секунд»), one «Готов играть?» CTA, and that's it.
  Everything else is plainspoken.

### Casing

- **Sentence case** everywhere, including buttons: «Найти клуб», «Забронировать»,
  «Получить ссылку», «Все города».
- **UPPERCASE** is reserved for tiny utility labels with `letter-spacing: 0.1em`:
  field labels («ГОРОД», «ДАТА», «ВРЕМЯ»), footer column titles
  («НАВИГАЦИЯ», «КОНТАКТЫ»), and step numbers («01», «02», «03»).
- **Logo** is the exception — `RESPAWN.kz` reads as `RESPAWN` (caps, italic, Audiowide)
  with `.kz` in a smaller pink suffix.

### Emoji — used sparingly, only in supporting contexts

The brand uses emoji as **tiny supporting accents**, not as primary iconography.
They appear in:

- Demo-mode banners: `⚙️ Demo-режим: данные сохраняются локально…`
- Auth success: `📨 Письмо отправлено на…`
- Geolocation button: `📍 Мой город`
- For-clubs benefit headers (one emoji per card, in `font-size: 32px`):
  `🚀 Поток клиентов`, `💳 Онлайн-оплаты`, `📊 Аналитика`, `📣 Маркетинг`

Emoji **never** appear in headlines, navigation, primary CTAs, or product copy.
For all real iconography, the site draws inline SVG (see **ICONOGRAPHY** below).

### Vibe

Cyberpunk-adjacent **without** going full "blade-runner neon dystopia". The reference
points are e-sports broadcasts, Razer/HyperX product pages, and CS2 menu screens —
a darkness that still feels welcoming to a 19-year-old student spending 800 ₸/час
on a Saturday afternoon. Confident, fast, no-frills. Trust through specificity:
*«Razer DeathAdder V3», «Мониторы 240Hz LG UltraGear», «Кресла Secretlab Titan»*.

### Concrete examples to copy

| Where | Example |
|---|---|
| Hero h1 | «Забронируй компьютерный клуб в Казахстане за **30 секунд**» (last 2 words `.glitch`) |
| Hero sub | «Лучшие клубы страны в одном месте. Выбирай слот, оплачивай онлайн, приходи играть.» |
| Section title | «Три шага до игры», «Топ клубы в Казахстане», «Почему respawn.kz» |
| Step copy | «Фильтруй по району, цене и оборудованию. Сравнивай рейтинги и отзывы.» |
| FAQ Q | «Что если я опоздаю?» |
| FAQ A | «Слот ждёт 15 минут после старта. Дальше место может быть передано следующему игроку, оплаченное время — сгорает.» |
| Empty state | «Письмо отправлено на you@example.com. Проверь почту (включая спам) — кликни по ссылке.» |
| Pricing | «от **1 200 ₸** /час» — *от* + cyan amount in mono + grey unit |

---

## VISUAL FOUNDATIONS

### Mood

**Dark, neon-accented, grid-textured.** Think *e-sports arena lighting*. The
background is near-black `#0a0a0f`, never pure black. Surfaces are layered three
deep (`base → surface → elevated`) using slightly cooler blacks. Color is used like
LEDs in a dark room: small, glowing, intentional. Pure white never appears — text
is off-white `#f0f0ff` with a faint blue cast.

### Palette

| Token | Hex | Role |
|---|---|---|
| `--bg-base` | `#0a0a0f` | Page background |
| `--bg-surface` | `#14141c` | Cards, header (scrolled), modal panel |
| `--bg-elevated` | `#1c1c28` | Inputs, social pills, info chips |
| `--text-primary` | `#f0f0ff` | Headlines, body text |
| `--text-secondary` | `#a0a0b8` | Subtitles, meta, descriptions |
| `--text-muted` | `#60607a` | Labels, helper text, copyright |
| `--neon-cyan` | `#00f0ff` | **Primary** — CTAs, links, focus, "success" |
| `--neon-magenta` | `#ff2e9a` | Errors, "cancelled", glitch secondary |
| `--neon-yellow` | `#fef300` | Ratings, "pending", warnings |
| `--neon-blue / purple / orange / pink / indigo / violet` | various | **Gradients only** — club card media, logo, hero radials |

The neon palette is intentionally narrow: **cyan is the brand**. Magenta and yellow
appear in semantic roles (error / warning). The other neons (blue, purple, orange,
pink) live exclusively inside gradients — they are never used as flat fills for
text or borders.

### Typography

Three families, strict roles:

| Family | Use | Where |
|---|---|---|
| **Inter** (400/500/600/700) | Default sans for everything | Body, headlines, buttons, nav |
| **JetBrains Mono** (400/500) | "System facts" | Stats, prices, status pills, tags, codes, phone numbers, mono logo word |
| **Audiowide** (400) | Display, italic | **Logo wordmark only** — `RESPAWN.kz` |

Headlines use `letter-spacing: -0.02em` and `line-height: 1.2`. Mono text uses
`letter-spacing: 0.02–0.05em` for breathing room. Eyebrow labels use
`letter-spacing: 0.1em` and `text-transform: uppercase`.

⚠️ **Font substitutions:** `Inter`, `JetBrains Mono`, and `Audiowide` are all
loaded from Google Fonts — no local files needed and no substitutions made.
The skill imports them in `colors_and_type.css`.

### Backgrounds & textures

- **No flat sections.** The hero stacks **three layers**: a near-black base, two
  faint radial gradients (`rgba(99,102,241,0.18)` and `rgba(168,85,247,0.14)`), and
  a `radial-gradient`-masked photo of a club at `opacity: 0.22`.
- **Subway-grid overlay.** The hero has a CSS-drawn grid
  (`linear-gradient` lines `rgba(0,240,255,0.06)` at 60×60px) masked with a radial
  vignette — invisible at the edges, faintly glowing in the center.
- **Animated scanline.** A `linear-gradient` band (`rgba(0,240,255,0.04)`) slides
  vertically over the hero every 8 seconds — `@keyframes scanline`. It's a 4% alpha
  band, so it's atmospheric, not distracting.
- **Photo treatment.** Real photos (`club-hero.webp`, `club-rows.webp`) appear only
  in the hero and the bottom CTA. They are **always**: low-opacity (0.15–0.22),
  blended over the dark base, **mask-imaged** with a radial gradient so the edges
  fade to black, and never shown at full saturation.
- **Club card media is purely synthetic.** Every club gets a 135° two-stop linear
  gradient from a curated palette (cyan→blue, purple→pink, yellow→orange, etc.)
  with a huge monospace **initial letter** centered. This is the brand's
  "placeholder photography" — no stock photos required.
- **Gradient bias is warm-cool diagonal.** All linear gradients use `135deg` or
  `45deg`. Radial gradients use elliptical shapes (e.g. `ellipse 80% 50% at 20% 30%`).
- **Imagery color vibe:** cool, slightly desaturated, with cyan/magenta highlights
  bleeding through the multiply. Never warm. Never bright.

### Borders

- **Default border:** `1px solid rgba(0, 240, 255, 0.15)` — a faint cyan tint.
- **Soft border** (card hairlines that need to recede): `rgba(255, 255, 255, 0.06)`.
- **Hover border:** `rgba(0, 240, 255, 0.40)` — the cyan brightens.
- Borders are rarely thicker than 1px. The brand expresses elevation through **glow**,
  not stroke weight.

### Shadows & glow — the signature

Three shadow tokens do most of the work:

```
--glow-cyan:    0 0 24px rgba(0, 240, 255, 0.4);
--glow-magenta: 0 0 24px rgba(255, 46, 154, 0.4);
--glow-card:    0 12px 40px rgba(0, 240, 255, 0.15),
                0 0 24px rgba(0, 240, 255, 0.1);
```

- Primary buttons sit on **a cyan halo by default** (`box-shadow: var(--glow-cyan)`).
  On hover the halo widens to `32px / 0.6 alpha`.
- The auth card, the pricing card, and the modal panel each have a permanent
  cyan halo — they read as "lit from inside".
- Cards do **not** glow by default. They get the cyan halo only on hover, paired
  with a 6px lift (`translateY(-6px)`).
- Deep navy drop-shadows (`0 8px 32px rgba(0,0,0,0.5)`) sit under the hero search
  bar and modal panel for **depth**, separate from the neon glow.

### Hover & press states

| Element | Default | Hover | Notes |
|---|---|---|---|
| `.btn--primary` | cyan fill + cyan glow | lighter cyan + bigger glow + `translateY(-2px)` | |
| `.btn--ghost` | transparent + cyan border 15% | cyan text + cyan border 40% | no fill |
| `a` (text link) | inherits text color | `color: var(--neon-cyan)` | 150ms |
| `.nav__link` | secondary text + invisible underline | cyan + 1px underline grows in 250ms | underline is `::after width: 0 → 100%` |
| `.club-card` | soft hairline border | cyan-tinted border + glow-card shadow + `translateY(-6px)` | |
| `.step`, `.benefit`, `.club-benefit` | soft hairline | cyan border + `translateY(-4px)` | |
| `.faq__item[open]` | soft hairline | cyan-tinted border (no transform) | + icon rotates 45° |

No press/active state is defined separately — clicks reuse the hover treatment.
The brand does **not** use a "scale-down on press" treatment.

### Animation

- **Easing:** the entire system uses CSS keyword `ease` with three durations:
  `--t-fast: 150ms`, `--t-base: 250ms`, `--t-slow: 400ms`. The single exception is
  the modal panel pop-in, which uses `cubic-bezier(0.2, 0.8, 0.2, 1)` (an "out-back"
  curve) to give the panel a hint of overshoot.
- **What animates:** colors, borders, glow shadows, `translateY` (-2/-4/-6px on
  hover lift), `transform: scale()` (modal entry only), `opacity` (modal/cookie
  banner fade-in).
- **What doesn't:** layout shifts, page transitions, complex multi-property keyframes.
  This brand does **not** use bouncy spring-physics, parallax, or scroll-driven
  effects.
- **Looping ambient motion:** the hero scanline (`@keyframes scanline`, 8s linear
  infinite) and the optional glitch flicker (`is-glitching` class, applied for
  600ms in 2 steps via `glitch.ts`, fired randomly every few seconds). Both respect
  `prefers-reduced-motion`.

### Transparency & blur

- The fixed header is **transparent at the top** and turns into a blurred bar
  (`rgba(10,10,15,0.85) + backdrop-filter: blur(12px)`) **only after the user
  scrolls** (`.header.scrolled`).
- Modal backdrop: `rgba(5,5,10,0.75)` + `backdrop-filter: blur(8px)`.
- All tag pills, chips, and status pills are made of two layers:
  `background: rgba(<accent>, 0.06–0.12)` + `border: 1px solid rgba(<accent>, 0.15–0.20)`.
  This produces the "lit from behind" feel without needing actual translucent
  surfaces underneath.

### Corner radii

A four-step scale, used consistently:

| Token | Value | Where |
|---|---|---|
| `--radius-sm` | `6px` | Chips, tags, pay-method pills, small buttons (`club-card__btn`), code pill |
| `--radius-md` | `12px` | Inputs, default buttons, icon containers, small modals |
| `--radius-lg` | `20px` | Cards, hero search bar, modal panel, auth card, sections |
| `--radius-pill` | `100px` | Status pills, rating pill, geo button |

`50%` (circle) is used only for: step number badges, social-link circles, and the
modal close button.

### Cards — the recipe

```
background: var(--bg-surface);                /* #14141c */
border:     1px solid var(--border-soft);     /* white @ 6% */
border-radius: var(--radius-lg);              /* 20px */
padding:    20–32px (varies by card type)
transition: border-color, transform, box-shadow var(--t-base);
```

On hover: border becomes cyan-tinted, card lifts 4–6px, optional cyan glow shadow.
Pricing cards & auth cards are "hero cards" — they get the permanent cyan glow and
slightly thicker padding (`40–48px`).

### Layout rules

- **Container:** `max-width: 1200px`, `padding-inline: 20px` (mobile: 16px).
- **Sections:** `padding-block: 96px` desktop, `72px` tablet, `56px` mobile.
- **Header:** fixed-top, transparent → blurred-cyan-bordered on scroll.
- **Hero:** `min-height: 100vh`, search bar lives **inside** the hero on the
  landing page.
- **Three-up grids** for clubs (`repeat(3, 1fr)` → 2 → 1) and steps. **Two-up**
  for benefits.
- **Sticky sidebar** on club-detail pages (right column, `top: 96px`).

### Fixed elements

- Header (`position: fixed; top: 0`)
- Mobile nav drawer (off-canvas right, `position: fixed`)
- Modal + cookie banner (`position: fixed`)

Nothing else. No floating CTAs, no chat bubbles, no scroll-to-top buttons.

---

## ICONOGRAPHY

### Approach

**No icon font. No PNG icons. No external icon library.** Every icon in the
codebase is a **hand-authored inline SVG**, drawn with consistent rules:

- **viewBox 0 0 64 64** for large feature icons (steps); **0 0 28 28** for inline
  utility icons (benefits, FAQ, status checks).
- **Stroke style** for outline icons (steps, benefits, FAQ check):
  `fill: none; stroke: currentColor; stroke-width: 2 (28-grid) or 2.5 (64-grid);
  stroke-linecap: round; stroke-linejoin: round`.
- **Fill style** for solid glyphs (logo gamepad body, star rating, dots/circles).
- `color: currentColor` is set on the icon container so SVGs inherit
  `var(--neon-cyan)` (steps, benefit icons) or `var(--text-secondary)` (rest).

This means: **never use Lucide, Heroicons, Font Awesome, or any other library to
mock this brand.** It will look wrong. Draw the SVGs by hand, or copy the existing
ones from the codebase verbatim (see `src/components/HowItWorks.astro` and
`src/components/Benefits.astro`).

### Icon family — what already exists

From the live codebase, the production icon set is small and purposeful:

1. **Step icons** (64×64, 2.5px stroke, cyan): map pin + dot, calendar/card,
   gamepad with face buttons.
2. **Benefit icons** (28×28, 2px stroke, cyan): calendar-with-check, credit-card,
   shield-with-check, star/medal.
3. **Logo gamepad** (filled white inside a teardrop pin gradient) — the only
   illustrative SVG in the brand.
4. **Bullets:** `▸` (Unicode "BLACK RIGHT-POINTING SMALL TRIANGLE") rendered in
   `--neon-cyan` via `::before`. Used in `.equipment-list` and `.legal__article ul`.
5. **Star rating glyph:** `★` (Unicode), rendered in `--neon-yellow` inside a pill.
6. **Hamburger:** three pure `<span>` bars, no SVG.

### Unicode characters used as iconography

- `★` ratings
- `▸` list bullets
- `·` (MIDDLE DOT) meta separator: «Алматы · Алмалинский р-н · 312 отзывов»
- `📍 📨 ⚙️ 🚀 💳 📊 📣` decorative emoji in specific supporting copy slots only
  (see CONTENT FUNDAMENTALS → Emoji).

### Assets in this project

```
assets/
├── favicon.svg     ← teardrop pin + gamepad, blue→purple gradient, on near-black bg
├── logo.svg        ← same teardrop but with respawn arc — the brand mark
├── club-hero.webp  ← 1216×752 photo of a club interior (low-opacity hero bg)
└── club-rows.webp  ← 1216×752 photo of PC rows (low-opacity CTA bg)
```

These are the **only** raster assets in the entire codebase. The brand achieves
its visual richness through CSS gradients and inline SVG — not through hero photos
or illustrations. When designing new pages, treat the two `.webp` photos as
**texture-only** assets: always mask-imaged, always 15–22% opacity, never as the
primary subject.

### Drawing new icons — rules to follow

If you need an icon that doesn't exist:

1. Author it as inline SVG in the component file (do not put it in `assets/`).
2. Use the appropriate viewBox: **64-grid** for ≥48px display icons, **28-grid**
   for inline 24–28px icons.
3. Stroke icons: `stroke: currentColor`, `stroke-width: 2 or 2.5`,
   `stroke-linecap: round`, `stroke-linejoin: round`, `fill: none`.
4. Filled glyphs: `fill: currentColor`, no stroke.
5. Set color via the parent (`color: var(--neon-cyan)` etc.) — never hardcode.
6. Avoid gradients in icons. Gradients live in the logo and in club-card media
   backgrounds — they don't belong in line-art icons.

---

## How to use this system

- **Building a static page or prototype?** Import `colors_and_type.css` and copy
  components out of `ui_kits/website/`. Layout your page using the section/container
  rules above.
- **Building real product code?** Read `src/styles/global.css` from the source repo
  directly — the tokens here are a 1:1 mirror, but the production CSS has the full
  page-level styles you need for `/clubs`, `/about`, `/me`, etc.
- **Need a hero image?** Use `assets/club-hero.webp` or `assets/club-rows.webp`
  with `opacity: 0.15–0.22` and a `mask-image: radial-gradient(...)`. Don't add
  new photos — they will not match the brand.
- **Need an icon?** Either reuse one from `ui_kits/website/Icons.jsx` or draw a new
  inline SVG following the rules in **ICONOGRAPHY → Drawing new icons**.

Browse the source repo — [`kazoboron/respawn-kz`](https://github.com/kazoboron/respawn-kz) — for the full set of page templates,
data files, and component code if you want pixel-perfect fidelity beyond what's
captured here.
