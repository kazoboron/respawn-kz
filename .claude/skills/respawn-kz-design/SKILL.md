---
name: respawn-kz-design
description: Use this skill to generate well-branded interfaces and assets for respawn.kz — Kazakhstan's online PC-club booking platform — either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

# respawn.kz design skill

Read **`README.md`** in this skill first — it contains the brand's content
fundamentals (Russian, «ты», direct/concrete), visual foundations
(dark + neon-cyan + selective glow, no flat sections, gradient placeholders),
and iconography rules (inline SVG only, never Lucide/Heroicons).

Then explore the other available files:

- `colors_and_type.css` — all design tokens (colors, type, radii, motion,
  spacing) + base typography. Import this at the top of any new HTML file.
- `components.css` — reusable component styles (`.btn`, `.field`, `.tag`,
  `.chip`, `.pill`, `.card`, `.club-card`, `.step`, `.benefit`, `.faq__item`,
  `.stat`). Import this alongside `colors_and_type.css`.
- `assets/` — logo (`logo.svg`), favicon (`favicon.svg`), two club photos
  (`club-hero.webp`, `club-rows.webp`). Photos must be used at 15–22% opacity
  with a radial mask — never as primary subjects.
- `preview/` — small specimen cards for every token + component. Open them
  to see exactly how a piece looks before you build with it.
- `ui_kits/website/` — full React click-thru prototype of the production site.
  Lift components from here (`Header.jsx`, `Footer.jsx`, `ClubCard.jsx`,
  `SearchForm.jsx`, `FAQ.jsx`, `Logo.jsx` + `Icons`, and the `screens/`
  folder). `data.js` carries the verbatim CLUBS / CITIES / FAQ lists.

## When the user invokes this skill

If creating **visual artifacts** (slides, mocks, throwaway prototypes,
deck templates): copy `assets/` and the relevant CSS into a new folder
and build static HTML files. Reach for the `ui_kits/website/` components
as your starting layer.

If working on **production code** (the real Astro repo at
[`kazoboron/respawn-kz`](https://github.com/kazoboron/respawn-kz)): copy
the token values out of `colors_and_type.css` into the project's actual
`src/styles/global.css` if a value is missing, and use the
content / iconography / motion rules in `README.md` to make decisions.

If the user invokes this skill **without any other guidance**, ask them
what they want to build or design (a landing variation? a new feature
page? a deck for an investor pitch?), ask 4–6 clarifying questions about
audience, scope, and surface, and then act as an expert designer who
outputs HTML artifacts _or_ production code, depending on the need.

## Hard rules — never break these

1. **All user-facing copy is in Russian** and addresses the user as «ты», never
   «Вы». English is reserved for product / tech terms (PS5, VR, Visa, Kaspi).
2. **Cyan is the brand.** Magenta and yellow have *semantic* roles (error,
   warning). Purple, blue, orange, pink live **only inside gradients**, never
   as flat fills for text or borders.
3. **Background is `#0a0a0f`, never `#000000`.** Layer surfaces with
   `var(--bg-surface)` (`#14141c`) and `var(--bg-elevated)` (`#1c1c28`).
4. **Icons are hand-drawn inline SVG.** Never use Lucide, Heroicons, Font
   Awesome, or any icon library. Follow the stroke / viewBox rules in
   `README.md` → ICONOGRAPHY.
5. **Three fonts only:** Inter (everything), JetBrains Mono (numbers / facts /
   tags / status / mono UI), Audiowide (logo wordmark only).
6. **Emoji are decorative accents in specific copy slots only** (demo banners,
   geo button, for-clubs benefit headers). Never in headlines or buttons.
7. **Glow is the brand's elevation system.** Use `--glow-cyan` for primary
   buttons and hero cards, `--glow-card` for hover lifts. Avoid drop-shadow
   from any colour other than the named glow tokens.
