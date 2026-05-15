# respawn.kz — Website UI Kit

Interactive recreation of the respawn.kz Astro site as a single-page React
click-thru prototype. Pixel-faithful: styles, copy, gradients, and component
markup are lifted directly from
[`kazoboron/respawn-kz`](https://github.com/kazoboron/respawn-kz).

There is only one product, so there is only one kit. The booking flow, the
auth flow, and the personal cabinet are all mocked in-memory — no Supabase, no
network.

## Run

Open `index.html`. No build step. React 18 + Babel-standalone load via CDN.

## What's interactive

- **Landing** — search form (submit jumps to catalog), three "how it works" steps,
  6-club grid, benefits, FAQ accordion, final CTA.
- **Catalog** — city + tag + text filters; chip multiselect; reset.
- **Club detail** — gallery, equipment list, sticky pricing card, "Забронировать"
  opens the booking modal.
- **Booking modal** — date/time/hours, recomputed total, confirm sends you
  through login (if not signed in) → personal cabinet with the booking added.
- **Login** — magic-link demo banner, fake email → 1-second auto-login.
- **Me** — list of confirmed bookings, status pills, cancel toggles `cancelled`.

The header tracks scroll and turns into the blurred cyan-bordered bar after
50px. The hero scanline animation runs (respects `prefers-reduced-motion`).

## File map

```
ui_kits/website/
├── README.md         ← this file
├── index.html        ← entry; loads React + Babel + all JSX
├── tokens.css        ← page-level styles (header, hero, sections, footer, …)
├── data.js           ← CLUBS, CITIES, LANDING_FAQ — verbatim from src/data/
├── Logo.jsx          ← teardrop-pin + Audiowide wordmark + shared <Icons />
├── Header.jsx        ← fixed top, scroll-aware, magic-link auth
├── Footer.jsx        ← 3-col, IG / TG / TT social pills
├── ClubCard.jsx      ← gradient media, mono name, tags, price footer
├── SearchForm.jsx    ← 4-col hero search (city / date / time / submit)
├── FAQ.jsx           ← also exports BookingModal
├── App.jsx           ← router + state (route, activeClub, bookings, user)
└── screens/
    ├── Landing.jsx
    ├── Catalog.jsx
    ├── ClubDetail.jsx
    ├── Login.jsx
    └── Me.jsx
```

## Patterns to follow when extending

- Always set `font-family: var(--font-mono)` for numbers, prices, status pills,
  tags, and any "system fact" text.
- Cards default to `var(--bg-surface)` + `var(--border-soft)` and lift -4/-6px
  on hover with a cyan-tinted border. Don't add box shadows by default;
  cyan glow is reserved for hero / pricing / modal cards.
- Buttons: `.btn--primary` for any commit action, `.btn--ghost` for cancel /
  secondary, `.btn--sm` for inline card actions.
- Always speak to the user in **«ты»** — never «Вы».
- Icons: reuse `Icons.*` from `Logo.jsx`, or author a new inline SVG following
  the rules in the root README's *ICONOGRAPHY → Drawing new icons* section.

## Known shortcuts

- No mobile drawer in the React kit; mobile responsive styles are in
  `../../colors_and_type.css` parent — production behaviour lives in the Astro
  repo.
- City geolocation button is decorative.
- /for-clubs and /about are stubs; the production pages live in
  `src/pages/for-clubs.astro` and `src/pages/about.astro`.
