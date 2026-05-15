# respawn.kz

Платформа онлайн-бронирования компьютерных клубов в Казахстане.

**Production:** https://respawn.kz (после полной DNS-пропагации)
**Staging:** https://respawn-kz.pages.dev

## Stack

- **Frontend:** Astro 4.16 (SSG) + TypeScript strict
- **Backend:** Supabase (PostgreSQL + Auth + RLS)
- **Hosting:** Cloudflare Pages + Cloudflare DNS
- **Domain:** respawn.kz через hoster.kz, NS Cloudflare

## Quick start

```bash
# Установка зависимостей (один раз)
npm install

# Dev-сервер на localhost:4321
npm run dev

# Production-build
npm run build

# Деплой (билд + загрузка в Cloudflare Pages)
npm run deploy
```

Для деплоя нужны env-vars в текущей сессии:
```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=a0e078cc25816fdf7cac77e162244c55
```

## Структура

```
src/
├── layouts/BaseLayout.astro       # HTML shell, head, fonts, Header/Footer/Modal
├── components/                    # Header, Footer, ClubCard, SearchForm, FAQ, Logo, ...
├── data/                          # cities.ts, clubs.ts, content.ts, supabase-types.ts
├── lib/supabase.ts                # Supabase client (with localStorage stub fallback)
├── pages/
│   ├── index.astro                # Лендинг
│   ├── about.astro, for-clubs.astro, privacy.astro, terms.astro
│   ├── 404.astro
│   ├── clubs/[slug].astro         # getStaticPaths → 12 страниц клубов
│   ├── clubs/index.astro          # Каталог с фильтрами
│   ├── login.astro                # Magic-link auth
│   ├── auth/callback.astro        # Auth redirect target
│   └── me.astro                   # Личный кабинет
├── scripts/                       # Client-side TS modules (geolocation, modal, booking, ...)
└── styles/global.css              # All styles
```

## Окружение

`.env` в корне (не коммитится):
```
PUBLIC_SUPABASE_URL=https://qfuhtvtietnldeqklxdo.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

Без `.env` сайт работает в demo-режиме через localStorage-стаб.

## Документация

- [Roadmap](docs/superpowers/plans/) — что осталось делать
- [Spec lендинга](docs/superpowers/specs/2026-05-14-almaty-gg-landing-design.md)
- [Spec каталога](docs/superpowers/specs/2026-05-15-respawn-kz-catalog-design.md)
- [Obsidian vault](C:\Users\Lenovo\Documents\respawn-obsidian) — sessions journal, decisions, open questions

## Лицензия

Proprietary. © 2026 respawn.kz
