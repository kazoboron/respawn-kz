# respawn.kz Catalog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Мигрировать существующий лендинг respawn.kz на Astro SSG и расширить до многостраничного каталога (5 страниц + 12 страниц клубов).

**Architecture:** Astro 4.x проект в `C:\ClaudeCode\`. Старые файлы переезжают в `_legacy/`. Все стили в `src/styles/global.css`, компоненты в `src/components/`, скрипты как TypeScript-модули в `src/scripts/`, данные в `src/data/`. Страницы в `src/pages/`, страницы клубов генерятся через `getStaticPaths()`. Никакого React/Vue — компоненты в нативном `.astro` синтаксисе.

**Tech Stack:** Astro 4.16+, TypeScript (strict), vanilla JS на клиенте, CSS custom properties, Google Fonts (Inter + JetBrains Mono).

**Spec:** [docs/superpowers/specs/2026-05-15-respawn-kz-catalog-design.md](../specs/2026-05-15-respawn-kz-catalog-design.md)

---

## Important environment notes

- Node.js v22.11.0 установлен в `C:\Users\Lenovo\node\node-v22.11.0-win-x64\`
- Текущие Bash/PowerShell сессии в Claude Code **не видят node/npm в PATH** до перезапуска Claude Code. Каждая `npm/node` команда в плане префиксуется:
  ```bash
  export PATH="$PATH:/c/Users/Lenovo/node/node-v22.11.0-win-x64" && npm ...
  ```
- После перезапуска Claude Code префикс не нужен.

## File structure (после миграции)

```
C:\ClaudeCode\
├── _legacy/                      # старые файлы для сравнения (удаляется в Task 26)
│   ├── index.html
│   ├── styles.css
│   └── script.js
├── public/
│   └── favicon.svg
├── src/
│   ├── layouts/BaseLayout.astro
│   ├── components/
│   │   ├── Header.astro Footer.astro
│   │   ├── SearchForm.astro ClubCard.astro
│   │   ├── HeroStats.astro HowItWorks.astro
│   │   ├── Benefits.astro FAQ.astro
│   │   └── Modal.astro
│   ├── data/cities.ts clubs.ts content.ts
│   ├── scripts/
│   │   ├── geolocation.ts modal.ts menu.ts
│   │   ├── search.ts booking.ts glitch.ts
│   │   ├── header-scroll.ts filters.ts
│   │   └── init.ts                     # импортирует и инициализирует всё
│   ├── styles/global.css
│   └── pages/
│       ├── index.astro
│       ├── about.astro
│       ├── for-clubs.astro
│       └── clubs/
│           ├── index.astro
│           └── [slug].astro
├── astro.config.mjs
├── tsconfig.json
├── package.json
├── .gitignore                     # обновляется (добавить node_modules, dist, .astro)
├── .claude/launch.json            # обновляется под Astro dev server
└── docs/superpowers/...
```

---

# Phase 1: Setup

## Task 1: Move legacy files

Сохранить текущие `index.html`, `styles.css`, `script.js` в `_legacy/` чтобы не потерять при инициализации Astro.

**Files:**
- Modify: `C:\ClaudeCode\` (move 3 files)

- [ ] **Step 1: Create _legacy directory and move files**

```bash
mkdir -p _legacy && mv index.html styles.css script.js _legacy/
```

- [ ] **Step 2: Verify legacy preserved**

```bash
ls _legacy/
```

Expected output:
```
index.html  script.js  styles.css
```

- [ ] **Step 3: Verify root is now clean of legacy**

```bash
ls
```

Expected: `_legacy`, `docs`, `.claude`, `.git`, `.gitignore` (no html/css/js in root).

- [ ] **Step 4: Commit**

```bash
git add -A && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "chore: move legacy landing files to _legacy/ before Astro migration"
```

---

## Task 2: Initialize Astro project manually

Вместо `npm create astro@latest` (требует пустую папку), создадим `package.json` и установим Astro вручную — у нас уже есть `_legacy/`, `docs/`, `.git/` в папке.

**Files:**
- Create: `C:\ClaudeCode\package.json`
- Create: `C:\ClaudeCode\.gitignore` (обновление)

- [ ] **Step 1: Create package.json**

```bash
cat > package.json << 'EOF'
{
  "name": "respawn-kz",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "astro dev --port 4321",
    "build": "astro build",
    "preview": "astro preview",
    "astro": "astro"
  }
}
EOF
```

- [ ] **Step 2: Install Astro and TypeScript**

```bash
export PATH="$PATH:/c/Users/Lenovo/node/node-v22.11.0-win-x64" && npm install astro@^4.16.0 && npm install --save-dev typescript @types/node
```

Expected: `node_modules/` создаётся, `package-lock.json` появляется, `astro` в `node_modules/.bin/`.

- [ ] **Step 3: Update .gitignore**

Заменить содержимое `.gitignore`:

```
# OS
.DS_Store
Thumbs.db
desktop.ini

# Editor
.vscode/
.idea/
*.swp
*.swo

# Node / Astro
node_modules/
dist/
.astro/

# Logs
*.log
npm-debug.log*

# Local env
.env
.env.local
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: initialize Astro project with TypeScript"
```

---

## Task 3: Configure Astro and TypeScript

Создать `astro.config.mjs` и `tsconfig.json`, минимальный hello-world.

**Files:**
- Create: `C:\ClaudeCode\astro.config.mjs`
- Create: `C:\ClaudeCode\tsconfig.json`
- Create: `C:\ClaudeCode\src\pages\index.astro` (временно, заменится в Task 16)

- [ ] **Step 1: Create astro.config.mjs**

```js
// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://respawn.kz',
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  devToolbar: {
    enabled: false,
  },
});
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist", "_legacy"]
}
```

- [ ] **Step 3: Create temporary hello-world index page**

```bash
mkdir -p src/pages
```

Создать `src/pages/index.astro`:

```astro
---
// Temporary hello world — replaced in Task 16
---
<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>respawn.kz — coming soon</title>
  </head>
  <body style="background:#0a0a0f;color:#f0f0ff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
    <h1 style="color:#00f0ff">respawn.kz Astro setup ✓</h1>
  </body>
</html>
```

- [ ] **Step 4: Start dev server in background**

```bash
export PATH="$PATH:/c/Users/Lenovo/node/node-v22.11.0-win-x64" && npm run dev &
```

Wait 3-5 seconds for server to start.

- [ ] **Step 5: Verify server responds**

```bash
curl -s http://localhost:4321/ | grep -o "respawn.kz Astro setup"
```

Expected: `respawn.kz Astro setup`

- [ ] **Step 6: Stop dev server**

```bash
kill %1 2>/dev/null || true
```

- [ ] **Step 7: Commit**

```bash
git add astro.config.mjs tsconfig.json src/pages/index.astro && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: configure Astro with TypeScript strict and add hello-world"
```

---

## Task 4: Update preview launch config

Обновить `.claude/launch.json` под Astro dev server (был Python http.server на 5173, теперь Astro на 4321).

**Files:**
- Modify: `C:\ClaudeCode\.claude\launch.json`

- [ ] **Step 1: Replace launch.json content**

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "respawn-kz",
      "runtimeExecutable": "C:\\Users\\Lenovo\\node\\node-v22.11.0-win-x64\\npm.cmd",
      "runtimeArgs": ["run", "dev"],
      "port": 4321
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add .claude/launch.json && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "chore: update launch config for Astro dev server on 4321"
```

---

# Phase 2: Migrate landing

## Task 5: Migrate styles to global.css

Скопировать содержимое `_legacy/styles.css` в `src/styles/global.css` без изменений.

**Files:**
- Create: `C:\ClaudeCode\src\styles\global.css`

- [ ] **Step 1: Create directory and copy file**

```bash
mkdir -p src/styles && cp _legacy/styles.css src/styles/global.css
```

- [ ] **Step 2: Verify content matches**

```bash
diff _legacy/styles.css src/styles/global.css
```

Expected: no output (files identical).

- [ ] **Step 3: Commit**

```bash
git add src/styles/global.css && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: migrate global styles to src/styles/global.css"
```

---

## Task 6: Create cities.ts data module

Перенести `CITIES` массив из `_legacy/script.js` в TypeScript-модуль с типизацией.

**Files:**
- Create: `C:\ClaudeCode\src\data\cities.ts`

- [ ] **Step 1: Create directory**

```bash
mkdir -p src/data
```

- [ ] **Step 2: Create cities.ts**

```ts
export interface City {
  id: string;
  label: string;
  lat: number;
  lon: number;
}

export const CITIES: City[] = [
  { id: 'almaty',    label: 'Алматы',           lat: 43.2389, lon: 76.8897 },
  { id: 'astana',    label: 'Астана',           lat: 51.1605, lon: 71.4704 },
  { id: 'shymkent',  label: 'Шымкент',          lat: 42.3417, lon: 69.5901 },
  { id: 'karaganda', label: 'Караганда',        lat: 49.8047, lon: 73.1094 },
  { id: 'aktobe',    label: 'Актобе',           lat: 50.2839, lon: 57.1670 },
  { id: 'taraz',     label: 'Тараз',            lat: 42.9000, lon: 71.3667 },
  { id: 'pavlodar',  label: 'Павлодар',         lat: 52.2873, lon: 76.9670 },
  { id: 'oskemen',   label: 'Усть-Каменогорск', lat: 49.9468, lon: 82.6075 },
  { id: 'semey',     label: 'Семей',            lat: 50.4111, lon: 80.2275 },
  { id: 'atyrau',    label: 'Атырау',           lat: 47.1167, lon: 51.8833 },
];

export const CITY_LABELS: Record<string, string> = Object.fromEntries(
  CITIES.map((c) => [c.id, c.label])
);
```

- [ ] **Step 3: Commit**

```bash
git add src/data/cities.ts && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add cities.ts data module with 10 Kazakhstan cities"
```

---

## Task 7: Create clubs.ts data module (12 clubs with full fields)

Перенести и **расширить** `CLUBS` — добавить поля для страницы клуба (description, equipment, hours, phone, address, slug, galleryGradients) и довести до 12 клубов.

**Files:**
- Create: `C:\ClaudeCode\src\data\clubs.ts`

- [ ] **Step 1: Create clubs.ts**

```ts
export interface Club {
  slug: string;
  name: string;
  initial: string;
  gradient: string;
  city: string;
  district: string;
  address: string;
  phone: string;
  hours: string;
  rating: number;
  reviews: number;
  price: number;
  tags: string[];
  description: string;
  equipment: string[];
  galleryGradients: string[];
}

export const CLUBS: Club[] = [
  {
    slug: 'cyberzone',
    name: 'Cyberzone',
    initial: 'C',
    gradient: 'linear-gradient(135deg, #00f0ff, #0066ff)',
    city: 'almaty',
    district: 'Алмалинский р-н',
    address: 'ул. Абая, 150',
    phone: '+7 (727) 123-45-67',
    hours: 'Круглосуточно',
    rating: 4.9,
    reviews: 312,
    price: 1200,
    tags: ['PC', 'PS5', 'VR'],
    description: 'Cyberzone — флагманский клуб с премиум-оборудованием в центре Алматы. RTX 4080, мониторы 240Hz, профессиональная периферия Razer. Зоны для одиночных игроков, кооператива и киберспортивных команд. VR-кабины с играми Beat Saber и Half-Life: Alyx.',
    equipment: ['RTX 4080 / i7-13700K', 'Мониторы 240Hz LG UltraGear', 'Razer DeathAdder V3', 'Razer BlackShark V2 Pro', 'Кресла Secretlab Titan', '2 VR-кабины Meta Quest 3'],
    galleryGradients: [
      'linear-gradient(135deg, #00f0ff, #0066ff)',
      'linear-gradient(135deg, #0066ff, #8b00ff)',
      'linear-gradient(45deg, #00f0ff, #14141c)',
      'linear-gradient(135deg, #14141c, #0066ff)',
    ],
  },
  {
    slug: 'gamerhub',
    name: 'GamerHub',
    initial: 'G',
    gradient: 'linear-gradient(135deg, #8b00ff, #ff2e9a)',
    city: 'almaty',
    district: 'Бостандыкский р-н',
    address: 'пр. Аль-Фараби, 77',
    phone: '+7 (727) 234-56-78',
    hours: '10:00–02:00',
    rating: 4.8,
    reviews: 145,
    price: 900,
    tags: ['PC', 'VR'],
    description: 'GamerHub — уютный клуб с акцентом на комфорт. Тихие игровые зоны, отдельная VR-комната, кафе с домашней едой. Подходит как для коротких сессий, так и для турниров выходного дня.',
    equipment: ['RTX 4070 / i5-13600K', 'Мониторы 165Hz', 'Logitech G Pro X', 'Кресла DXRacer', 'VR-комната Meta Quest 3'],
    galleryGradients: [
      'linear-gradient(135deg, #8b00ff, #ff2e9a)',
      'linear-gradient(45deg, #ff2e9a, #14141c)',
      'linear-gradient(135deg, #8b00ff, #14141c)',
      'linear-gradient(45deg, #14141c, #ff2e9a)',
    ],
  },
  {
    slug: 'colizeum-astana',
    name: 'Colizeum',
    initial: 'C',
    gradient: 'linear-gradient(135deg, #ff2e9a, #8b00ff)',
    city: 'astana',
    district: 'Есильский р-н',
    address: 'пр. Кабанбай батыра, 11',
    phone: '+7 (7172) 12-34-56',
    hours: 'Круглосуточно',
    rating: 4.8,
    reviews: 189,
    price: 1500,
    tags: ['PC', 'Sim Racing'],
    description: 'Colizeum — самый большой компьютерный клуб столицы. 60 рабочих мест, симуляторы гонок Logitech G Pro Racing, отдельные VIP-кабины для стримеров. Регулярные турниры по CS2 и Dota 2.',
    equipment: ['RTX 4080 / i7-14700K', 'Мониторы 360Hz', '6 Sim Racing кабин Logitech G Pro', 'Профессиональные стримерские установки', 'Кресла Secretlab'],
    galleryGradients: [
      'linear-gradient(135deg, #ff2e9a, #8b00ff)',
      'linear-gradient(45deg, #8b00ff, #00f0ff)',
      'linear-gradient(135deg, #14141c, #ff2e9a)',
      'linear-gradient(45deg, #ff2e9a, #00f0ff)',
    ],
  },
  {
    slug: 'nexus-astana',
    name: 'Nexus',
    initial: 'N',
    gradient: 'linear-gradient(135deg, #00f0ff, #ff2e9a)',
    city: 'astana',
    district: 'Сарыаркинский р-н',
    address: 'ул. Республики, 24',
    phone: '+7 (7172) 23-45-67',
    hours: '09:00–03:00',
    rating: 4.7,
    reviews: 124,
    price: 1100,
    tags: ['PC', 'PS5'],
    description: 'Nexus — клуб для тех, кто любит и PC, и консоли. 40 PC-мест, 8 PS5-зон с большими ТВ. Семейные пакеты выходного дня, безалкогольный бар.',
    equipment: ['RTX 4070 Ti / i7-13700', 'Мониторы 240Hz', '8 PS5 с играми FIFA, Mortal Kombat', 'Razer периферия', 'Кресла DXRacer'],
    galleryGradients: [
      'linear-gradient(135deg, #00f0ff, #ff2e9a)',
      'linear-gradient(45deg, #ff2e9a, #14141c)',
      'linear-gradient(135deg, #14141c, #00f0ff)',
      'linear-gradient(45deg, #00f0ff, #8b00ff)',
    ],
  },
  {
    slug: 'rage-arena',
    name: 'RAGE Arena',
    initial: 'R',
    gradient: 'linear-gradient(135deg, #fef300, #ff6a00)',
    city: 'shymkent',
    district: 'Аль-Фарабийский р-н',
    address: 'ул. Тауке хана, 5',
    phone: '+7 (7252) 12-34-56',
    hours: 'Круглосуточно',
    rating: 4.7,
    reviews: 256,
    price: 1000,
    tags: ['PC', 'PS5'],
    description: 'RAGE Arena — крупнейший киберспортивный клуб на юге Казахстана. Хост региональных турниров по Counter-Strike. Профессиональная звукоизоляция, отдельная зона для трансляций.',
    equipment: ['RTX 4070 / i5-13600KF', 'Мониторы 240Hz BenQ Zowie', 'HyperX Cloud III', '6 PS5 с VR2', 'Кресла Secretlab'],
    galleryGradients: [
      'linear-gradient(135deg, #fef300, #ff6a00)',
      'linear-gradient(45deg, #ff6a00, #14141c)',
      'linear-gradient(135deg, #14141c, #fef300)',
      'linear-gradient(45deg, #fef300, #ff2e9a)',
    ],
  },
  {
    slug: 'ignite-karaganda',
    name: 'IGNITE',
    initial: 'I',
    gradient: 'linear-gradient(135deg, #ff2e9a, #00f0ff)',
    city: 'karaganda',
    district: 'Казыбек би р-н',
    address: 'пр. Бухар жырау, 67',
    phone: '+7 (7212) 12-34-56',
    hours: '10:00–02:00',
    rating: 4.6,
    reviews: 98,
    price: 800,
    tags: ['PC'],
    description: 'IGNITE — современный клуб для соревновательных игр в Караганде. Турниры по CS2 и Valorant каждые выходные. Бесплатный wi-fi, безлимитные напитки в абонементе.',
    equipment: ['RTX 4060 Ti / i5-13400', 'Мониторы 165Hz', 'Razer DeathAdder', 'Кресла DXRacer'],
    galleryGradients: [
      'linear-gradient(135deg, #ff2e9a, #00f0ff)',
      'linear-gradient(45deg, #00f0ff, #14141c)',
      'linear-gradient(135deg, #14141c, #ff2e9a)',
      'linear-gradient(45deg, #ff2e9a, #fef300)',
    ],
  },
  {
    slug: 'netgame-aktobe',
    name: 'NetGame',
    initial: 'N',
    gradient: 'linear-gradient(135deg, #00f0ff, #14141c)',
    city: 'aktobe',
    district: 'Центр',
    address: 'пр. Абилкайыр хана, 38',
    phone: '+7 (7132) 12-34-56',
    hours: '12:00–00:00',
    rating: 4.5,
    reviews: 67,
    price: 600,
    tags: ['PC', 'PS5'],
    description: 'NetGame — уютный семейный клуб с лучшими ценами в Актобе. Подходит для школьников и студентов. Дневные тарифы со скидкой, акции на дни рождения.',
    equipment: ['RTX 3060 / i5-12400', 'Мониторы 144Hz', 'Logitech G102', '4 PS5'],
    galleryGradients: [
      'linear-gradient(135deg, #00f0ff, #14141c)',
      'linear-gradient(45deg, #14141c, #00f0ff)',
      'linear-gradient(135deg, #0066ff, #14141c)',
      'linear-gradient(45deg, #14141c, #0066ff)',
    ],
  },
  {
    slug: 'playzone-taraz',
    name: 'PlayZone',
    initial: 'P',
    gradient: 'linear-gradient(135deg, #8b00ff, #00f0ff)',
    city: 'taraz',
    district: 'Центр',
    address: 'ул. Толе би, 75',
    phone: '+7 (7262) 12-34-56',
    hours: '10:00–01:00',
    rating: 4.6,
    reviews: 54,
    price: 700,
    tags: ['PC', 'PS5'],
    description: 'PlayZone — первый современный компьютерный клуб в Таразе. 30 мест, обновлённый парк оборудования в 2025. Бонусная программа: каждый 10-й час бесплатно.',
    equipment: ['RTX 4060 / i5-13400', 'Мониторы 165Hz', 'Razer периферия', '4 PS5'],
    galleryGradients: [
      'linear-gradient(135deg, #8b00ff, #00f0ff)',
      'linear-gradient(45deg, #00f0ff, #14141c)',
      'linear-gradient(135deg, #14141c, #8b00ff)',
      'linear-gradient(45deg, #8b00ff, #ff2e9a)',
    ],
  },
  {
    slug: 'respawn-pavlodar',
    name: 'Respawn Café',
    initial: 'R',
    gradient: 'linear-gradient(135deg, #00f0ff, #fef300)',
    city: 'pavlodar',
    district: 'Центр',
    address: 'ул. Лермонтова, 12',
    phone: '+7 (7182) 12-34-56',
    hours: '11:00–00:00',
    rating: 4.5,
    reviews: 43,
    price: 750,
    tags: ['PC'],
    description: 'Respawn Café — клуб-кафе с акцентом на атмосферу. Кофе из специальной соски, бургеры, тихая зона для одиночек и громкая для команд.',
    equipment: ['RTX 4060 / i5-13400', 'Мониторы 165Hz', 'Logitech G Pro', 'Кресла DXRacer'],
    galleryGradients: [
      'linear-gradient(135deg, #00f0ff, #fef300)',
      'linear-gradient(45deg, #fef300, #14141c)',
      'linear-gradient(135deg, #14141c, #00f0ff)',
      'linear-gradient(45deg, #00f0ff, #ff6a00)',
    ],
  },
  {
    slug: 'epic-oskemen',
    name: 'Epic',
    initial: 'E',
    gradient: 'linear-gradient(135deg, #ff2e9a, #fef300)',
    city: 'oskemen',
    district: 'Центр',
    address: 'пр. Независимости, 56',
    phone: '+7 (7232) 12-34-56',
    hours: '12:00–02:00',
    rating: 4.4,
    reviews: 38,
    price: 800,
    tags: ['PC', 'PS5'],
    description: 'Epic — крупнейший клуб Восточно-Казахстанской области. 35 PC и 6 PS5 мест. Регулярные турниры по PUBG Mobile и Mortal Kombat.',
    equipment: ['RTX 4060 Ti / i5-13400', 'Мониторы 165Hz', 'HyperX периферия', '6 PS5'],
    galleryGradients: [
      'linear-gradient(135deg, #ff2e9a, #fef300)',
      'linear-gradient(45deg, #fef300, #14141c)',
      'linear-gradient(135deg, #14141c, #ff2e9a)',
      'linear-gradient(45deg, #ff2e9a, #ff6a00)',
    ],
  },
  {
    slug: 'lobby-semey',
    name: 'Lobby',
    initial: 'L',
    gradient: 'linear-gradient(135deg, #0066ff, #00f0ff)',
    city: 'semey',
    district: 'Центр',
    address: 'ул. Засядко, 23',
    phone: '+7 (7222) 12-34-56',
    hours: '11:00–01:00',
    rating: 4.5,
    reviews: 51,
    price: 700,
    tags: ['PC'],
    description: 'Lobby — клуб со студенческой атмосферой. Удобное расположение у университета, тарифы по студенческому. Ежемесячный турнир по Counter-Strike.',
    equipment: ['RTX 4060 / i5-13400', 'Мониторы 144Hz', 'Razer периферия'],
    galleryGradients: [
      'linear-gradient(135deg, #0066ff, #00f0ff)',
      'linear-gradient(45deg, #00f0ff, #14141c)',
      'linear-gradient(135deg, #14141c, #0066ff)',
      'linear-gradient(45deg, #0066ff, #8b00ff)',
    ],
  },
  {
    slug: 'cyber-atyrau',
    name: 'Cyber',
    initial: 'C',
    gradient: 'linear-gradient(135deg, #fef300, #ff2e9a)',
    city: 'atyrau',
    district: 'Центр',
    address: 'пр. Сатпаева, 8',
    phone: '+7 (7122) 12-34-56',
    hours: '10:00–02:00',
    rating: 4.6,
    reviews: 72,
    price: 900,
    tags: ['PC', 'PS5'],
    description: 'Cyber — современный клуб с видом на реку Урал. Премиальное оборудование, дизайнерский интерьер. Закрытые корпоративы и дни рождения.',
    equipment: ['RTX 4070 / i7-13700', 'Мониторы 240Hz', 'Razer периферия', '4 PS5'],
    galleryGradients: [
      'linear-gradient(135deg, #fef300, #ff2e9a)',
      'linear-gradient(45deg, #ff2e9a, #14141c)',
      'linear-gradient(135deg, #14141c, #fef300)',
      'linear-gradient(45deg, #fef300, #ff6a00)',
    ],
  },
];

export function getClubBySlug(slug: string): Club | undefined {
  return CLUBS.find((c) => c.slug === slug);
}

export function getSimilarClubs(slug: string, limit = 3): Club[] {
  const club = getClubBySlug(slug);
  if (!club) return CLUBS.slice(0, limit);
  const sameCity = CLUBS.filter((c) => c.city === club.city && c.slug !== slug);
  if (sameCity.length >= limit) return sameCity.slice(0, limit);
  // Если в том же городе мало — добавляем из других городов по рейтингу
  const others = CLUBS
    .filter((c) => c.city !== club.city && c.slug !== slug)
    .sort((a, b) => b.rating - a.rating);
  return [...sameCity, ...others].slice(0, limit);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data/clubs.ts && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add clubs.ts with 12 mock clubs and helper functions"
```

---

## Task 8: Create content.ts data module

Тексты, переиспользуемые между страницами (FAQ, миссия, преимущества для клубов).

**Files:**
- Create: `C:\ClaudeCode\src\data\content.ts`

- [ ] **Step 1: Create content.ts**

```ts
export interface FAQItem {
  q: string;
  a: string;
}

export const LANDING_FAQ: FAQItem[] = [
  {
    q: 'Как оплачивать бронирование?',
    a: 'Картами Visa, Mastercard или через Kaspi. Деньги списываются после подтверждения брони. Никакой предоплаты администратору клуба не нужно.',
  },
  {
    q: 'Можно ли отменить бронь?',
    a: 'Да. Бесплатная отмена за 2 часа до начала. Если отменяешь позже — комиссия 50%. Полностью без штрафа можно отменить ночные брони (после 23:00) за 4 часа.',
  },
  {
    q: 'Что если я опоздаю?',
    a: 'Слот ждёт 15 минут после старта. Дальше место может быть передано следующему игроку, оплаченное время — сгорает. Если задерживаешься — напиши в чат клуба прямо в приложении.',
  },
  {
    q: 'Это безопасно? Где мои деньги?',
    a: 'Платежи защищены через PCI DSS-сертифицированного процессинга. Мы не храним данные карт. Возвраты приходят в течение 3-5 рабочих дней.',
  },
  {
    q: 'Как стать партнёром (для владельцев клубов)?',
    a: 'Оставь заявку на странице «Для клубов». В течение дня свяжемся, расскажем о подключении и условиях. Подключение бесплатное, комиссия только с реальных броней.',
  },
  {
    q: 'Возврат денег возможен?',
    a: 'Да, по основаниям: техническая проблема клуба (нет света, поломка ПК), отмена с твоей стороны в рамках условий (см. выше). Возврат на ту же карту, 3-5 рабочих дней.',
  },
  {
    q: 'Куда писать если проблема?',
    a: 'Telegram @respawn_kz_support — отвечаем 24/7. Или email hello@respawn.kz — отвечаем в течение часа в рабочее время. Все споры решаем в пользу игрока.',
  },
];

export interface ClubBenefit {
  icon: string;
  title: string;
  desc: string;
}

export const FOR_CLUBS_BENEFITS: ClubBenefit[] = [
  {
    icon: '🚀',
    title: 'Поток клиентов',
    desc: 'Тысячи геймеров видят твой клуб первыми в поиске по городу. Расти без вложений в маркетинг.',
  },
  {
    icon: '💳',
    title: 'Онлайн-оплаты',
    desc: 'Без терминалов и кассы. Деньги выводятся на счёт ИП/ТОО еженедельно. Все чеки — фискальные.',
  },
  {
    icon: '📊',
    title: 'Аналитика',
    desc: 'Заполняемость, выручка, повторные клиенты, пиковые часы — всё в дашборде. Принимай решения на данных.',
  },
  {
    icon: '📣',
    title: 'Маркетинг',
    desc: 'Промо-акции, push-уведомления игрокам, рейтинговая система. Привлекай новых, удерживай старых.',
  },
];

export interface ClubStep {
  num: string;
  title: string;
  desc: string;
}

export const FOR_CLUBS_STEPS: ClubStep[] = [
  {
    num: '01',
    title: 'Подай заявку',
    desc: 'Заполни форму на этой странице. Менеджер свяжется с тобой в течение рабочего дня.',
  },
  {
    num: '02',
    title: 'Подключение',
    desc: 'Помогаем настроить расписание, цены, фото клуба. Обучаем работе с дашбордом. Занимает 1 день.',
  },
  {
    num: '03',
    title: 'Получай брони',
    desc: 'Клуб виден в поиске. Игроки бронируют слоты онлайн. Деньги приходят на твой счёт.',
  },
];

export const ABOUT_MISSION = [
  'respawn.kz объединяет компьютерные клубы Казахстана в одну удобную платформу. Мы решаем две боли одновременно: игроки больше не звонят и не ждут в очереди, а владельцы клубов получают предсказуемый поток клиентов без расходов на маркетинг.',
  'Платформа стартовала в 2026 году. Сейчас мы работаем в 10 крупнейших городах Казахстана — от Алматы до Атырау. Наша цель к концу года — 100+ клубов-партнёров и 50 000+ активных игроков.',
  'Мы делаем продукт от людей, которые сами выросли в компьютерных клубах. Уважение к игре, прозрачность к клубам, никаких скрытых комиссий.',
];
```

- [ ] **Step 2: Commit**

```bash
git add src/data/content.ts && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add content.ts with FAQ, club benefits and mission texts"
```

---

## Task 9: Migrate scripts batch 1 (geolocation, modal, menu, header-scroll)

Перевод vanilla JS из `_legacy/script.js` в TypeScript-модули. 4 файла без зависимостей между собой.

**Files:**
- Create: `C:\ClaudeCode\src\scripts\geolocation.ts`
- Create: `C:\ClaudeCode\src\scripts\modal.ts`
- Create: `C:\ClaudeCode\src\scripts\menu.ts`
- Create: `C:\ClaudeCode\src\scripts\header-scroll.ts`

- [ ] **Step 1: Create scripts directory**

```bash
mkdir -p src/scripts
```

- [ ] **Step 2: Create geolocation.ts**

```ts
import { CITIES, type City } from '../data/cities';

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function findClosestCity(lat: number, lon: number): { city: City; distance: number } {
  let best: City = CITIES[0];
  let bestDist = Infinity;
  for (const c of CITIES) {
    const d = distanceKm(lat, lon, c.lat, c.lon);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return { city: best, distance: bestDist };
}

function setGeoStatus(text: string, state?: 'success' | 'error'): void {
  const el = document.getElementById('geo-status');
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
  el.className = 'geo-status' + (state ? ` geo-status--${state}` : '');
}

export function setupGeolocation(): void {
  const btn = document.getElementById('geo-btn') as HTMLButtonElement | null;
  const select = document.getElementById('city-select') as HTMLSelectElement | null;
  if (!btn || !select) return;

  btn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      setGeoStatus('Геолокация не поддерживается', 'error');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Определяем…';
    setGeoStatus('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const { city, distance } = findClosestCity(latitude, longitude);
        select.value = city.id;
        select.dispatchEvent(new Event('change'));
        const distText = distance < 1 ? 'вы внутри города' : `~${Math.round(distance)} км до центра`;
        setGeoStatus(`📍 ${city.label} · ${distText}`, 'success');
        btn.disabled = false;
        btn.textContent = '📍 Мой город';
      },
      (err) => {
        const messages: Record<number, string> = {
          1: 'Доступ к геолокации запрещён',
          2: 'Не удалось определить позицию',
          3: 'Превышено время ожидания',
        };
        setGeoStatus(messages[err.code] || 'Ошибка геолокации', 'error');
        btn.disabled = false;
        btn.textContent = '📍 Мой город';
      },
      { timeout: 8000, maximumAge: 60000 }
    );
  });
}
```

- [ ] **Step 3: Create modal.ts**

```ts
interface ModalContent {
  title: string;
  body: string;
}

export function openModal({ title, body }: ModalContent): void {
  const modal = document.getElementById('modal');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  if (!modal || !titleEl || !bodyEl) return;
  titleEl.textContent = title;
  bodyEl.innerHTML = body;
  modal.hidden = false;
  document.body.classList.add('modal-open');
}

export function closeModal(): void {
  const modal = document.getElementById('modal');
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove('modal-open');
}

export function setupModal(): void {
  const modal = document.getElementById('modal');
  if (!modal) return;

  modal.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.hasAttribute('data-modal-close')) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });
}
```

- [ ] **Step 4: Create menu.ts**

```ts
export function setupMobileMenu(): void {
  const hamburger = document.getElementById('hamburger');
  const nav = document.getElementById('nav');
  if (!hamburger || !nav) return;

  const close = () => document.body.classList.remove('menu-open');

  hamburger.addEventListener('click', () => {
    document.body.classList.toggle('menu-open');
  });

  nav.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.matches('.nav__link')) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}
```

- [ ] **Step 5: Create header-scroll.ts**

```ts
export function setupHeaderScroll(): void {
  const header = document.getElementById('header');
  if (!header) return;
  const onScroll = () => {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
```

- [ ] **Step 6: Commit**

```bash
git add src/scripts/geolocation.ts src/scripts/modal.ts src/scripts/menu.ts src/scripts/header-scroll.ts && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: migrate geolocation, modal, menu and header-scroll to TS modules"
```

---

## Task 10: Migrate scripts batch 2 (search, booking, glitch)

**Files:**
- Create: `C:\ClaudeCode\src\scripts\search.ts`
- Create: `C:\ClaudeCode\src\scripts\booking.ts`
- Create: `C:\ClaudeCode\src\scripts\glitch.ts`

- [ ] **Step 1: Create search.ts**

```ts
import { CITY_LABELS } from '../data/cities';
import { openModal } from './modal';

export function setupSearchForm(): void {
  const form = document.getElementById('search-form') as HTMLFormElement | null;
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const city = (data.get('city') as string) || '';
    const date = (data.get('date') as string) || '—';
    const time = (data.get('time') as string) || 'любое время';

    const cityLabel = city ? CITY_LABELS[city] : 'Все города';
    const dateLabel =
      date && date !== '—'
        ? new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
        : '—';

    const count = Math.floor(3 + Math.random() * 9);

    openModal({
      title: `Найдено ${count} клубов`,
      body: `
        <p><span class="modal__highlight">${cityLabel}</span> · <span class="modal__highlight">${dateLabel}</span> · <span class="modal__highlight">${time}</span></p>
        <p style="margin-top:12px">Это демо-версия лендинга. В полной версии здесь будет список доступных слотов с возможностью бронирования.</p>
      `,
    });
  });
}

export function setupTimeSelect(): void {
  const select = document.getElementById('time-select');
  if (!select) return;
  const options = ['<option value="">Любое</option>'];
  for (let h = 0; h < 24; h++) {
    const value = `${String(h).padStart(2, '0')}:00`;
    options.push(`<option value="${value}">${value}</option>`);
  }
  select.innerHTML = options.join('');
}

export function setupDateDefault(): void {
  const input = document.querySelector('input[name="date"]') as HTMLInputElement | null;
  if (!input) return;
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  input.value = `${yyyy}-${mm}-${dd}`;
  input.min = `${yyyy}-${mm}-${dd}`;
}
```

- [ ] **Step 2: Create booking.ts**

```ts
import { CLUBS } from '../data/clubs';
import { openModal } from './modal';

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}

export function setupBookingButtons(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('[data-book]') as HTMLElement | null;
    if (!btn) return;
    const slug = btn.getAttribute('data-book');
    const club = CLUBS.find((c) => c.slug === slug || c.name === slug);
    if (!club) return;

    openModal({
      title: `Бронирование — ${club.name}`,
      body: `
        <p><strong>${club.name}</strong> · ${club.district} · ${club.address}</p>
        <p style="margin-top:8px">Цена: <span class="modal__highlight">${formatPrice(club.price)} ₸/час</span></p>
        <div class="modal__qr">
          QR-код придёт на email после оплаты<br />
          <span style="color:var(--neon-cyan)">▢▢▢▢▢ ▢▢▢▢▢</span>
        </div>
        <p>Это демо-версия — реальное бронирование появится в продакшен-версии платформы.</p>
      `,
    });
  });
}
```

- [ ] **Step 3: Create glitch.ts**

```ts
export function setupGlitch(): void {
  const target = document.querySelector('.glitch');
  if (!target) return;

  const trigger = () => {
    target.classList.add('is-glitching');
    setTimeout(() => target.classList.remove('is-glitching'), 600);
  };

  setTimeout(trigger, 500);

  const loop = () => {
    const delay = 7000 + Math.random() * 5000;
    setTimeout(() => {
      trigger();
      loop();
    }, delay);
  };
  loop();
}
```

- [ ] **Step 4: Commit**

```bash
git add src/scripts/search.ts src/scripts/booking.ts src/scripts/glitch.ts && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: migrate search, booking and glitch scripts to TS modules"
```

---

## Task 11: Create init.ts (entry point that wires up all scripts)

Один файл, который инициализирует все скрипты по DOMContentLoaded. Импортируется в BaseLayout.

**Files:**
- Create: `C:\ClaudeCode\src\scripts\init.ts`

- [ ] **Step 1: Create init.ts**

```ts
import { setupGeolocation } from './geolocation';
import { setupModal } from './modal';
import { setupMobileMenu } from './menu';
import { setupHeaderScroll } from './header-scroll';
import { setupSearchForm, setupTimeSelect, setupDateDefault } from './search';
import { setupBookingButtons } from './booking';
import { setupGlitch } from './glitch';

function init(): void {
  setupHeaderScroll();
  setupMobileMenu();
  setupModal();
  setupBookingButtons();
  // Поисковая форма и геолокация — только если на странице есть search-form
  if (document.getElementById('search-form')) {
    setupTimeSelect();
    setupDateDefault();
    setupSearchForm();
    setupGeolocation();
  }
  // Glitch — только если есть .glitch элемент
  if (document.querySelector('.glitch')) {
    setupGlitch();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/scripts/init.ts && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add init.ts entry point that wires up all scripts"
```

---

## Task 12: Create BaseLayout

Главный layout — `<html>`, `<head>`, импорт стилей, Header, slot, Footer, Modal root, script init.

**Files:**
- Create: `C:\ClaudeCode\src\layouts\BaseLayout.astro`

- [ ] **Step 1: Create layouts directory and BaseLayout**

```bash
mkdir -p src/layouts
```

Создать `src/layouts/BaseLayout.astro`:

```astro
---
import '../styles/global.css';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import Modal from '../components/Modal.astro';

interface Props {
  title: string;
  description?: string;
  activeRoute?: 'index' | 'clubs' | 'for-clubs' | 'about';
}

const {
  title,
  description = 'respawn.kz — онлайн-бронирование компьютерных клубов в Казахстане. Найди клуб, забронируй слот, оплати картой.',
  activeRoute,
} = Astro.props;
---

<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content={description} />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
    <title>{title}</title>
  </head>
  <body>
    <Header activeRoute={activeRoute} />
    <main>
      <slot />
    </main>
    <Footer />
    <Modal />
    <script>
      import '../scripts/init';
    </script>
  </body>
</html>
```

- [ ] **Step 2: Commit (после создания компонентов в Task 13-17 layout начнёт работать)**

```bash
git add src/layouts/BaseLayout.astro && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add BaseLayout with head, fonts, Header/Footer/Modal slots"
```

---

## Task 13: Create favicon

**Files:**
- Create: `C:\ClaudeCode\public\favicon.svg`

- [ ] **Step 1: Create public dir and favicon**

```bash
mkdir -p public
```

Создать `public/favicon.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#0a0a0f"/>
  <text x="16" y="22" font-family="JetBrains Mono, monospace" font-size="18" font-weight="700" text-anchor="middle" fill="#00f0ff" style="filter: drop-shadow(0 0 4px #00f0ff)">R</text>
</svg>
```

- [ ] **Step 2: Commit**

```bash
git add public/favicon.svg && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add favicon.svg with R logo in cyan glow"
```

---

## Task 14: Create Header and Footer components

**Files:**
- Create: `C:\ClaudeCode\src\components\Header.astro`
- Create: `C:\ClaudeCode\src\components\Footer.astro`

- [ ] **Step 1: Create components directory and Header.astro**

```bash
mkdir -p src/components
```

Создать `src/components/Header.astro`:

```astro
---
interface Props {
  activeRoute?: 'index' | 'clubs' | 'for-clubs' | 'about';
}

const { activeRoute } = Astro.props;

const navItems = [
  { href: '/clubs/', label: 'Клубы', key: 'clubs' },
  { href: '/#how', label: 'Как это работает', key: 'index' },
  { href: '/#benefits', label: 'Преимущества', key: 'index' },
  { href: '/for-clubs/', label: 'Для клубов', key: 'for-clubs' },
  { href: '/about/', label: 'О нас', key: 'about' },
];
---

<header class="header" id="header">
  <div class="container header__inner">
    <a href="/" class="logo">RESPAWN<span class="logo__accent">.kz</span></a>
    <nav class="nav" id="nav">
      {navItems.map((item) => (
        <a
          href={item.href}
          class:list={['nav__link', { 'nav__link--active': activeRoute === item.key }]}
        >
          {item.label}
        </a>
      ))}
    </nav>
    <div class="header__actions">
      <button class="btn btn--ghost" type="button">Войти</button>
      <button class="hamburger" id="hamburger" aria-label="Меню" type="button">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</header>
```

- [ ] **Step 2: Add active-link CSS to global.css**

Дописать в конец `src/styles/global.css`:

```css
.nav__link--active {
  color: var(--neon-cyan);
}
.nav__link--active::after {
  width: 100%;
}
```

- [ ] **Step 3: Create Footer.astro**

```astro
---
---

<footer class="footer">
  <div class="container footer__inner">
    <div class="footer__col">
      <div class="logo">RESPAWN<span class="logo__accent">.kz</span></div>
      <p class="footer__desc">Платформа онлайн-бронирования компьютерных клубов в Казахстане.</p>
      <p class="footer__copy">© 2026 respawn.kz</p>
    </div>
    <div class="footer__col">
      <h4 class="footer__title">Навигация</h4>
      <ul class="footer__list">
        <li><a href="/clubs/">Клубы</a></li>
        <li><a href="/for-clubs/">Для клубов</a></li>
        <li><a href="/about/">О нас</a></li>
      </ul>
    </div>
    <div class="footer__col">
      <h4 class="footer__title">Контакты</h4>
      <ul class="footer__list">
        <li><a href="mailto:hello@respawn.kz">hello@respawn.kz</a></li>
        <li><a href="tel:+77001234567">+7 (700) 123-45-67</a></li>
      </ul>
      <div class="footer__social">
        <a href="#" aria-label="Instagram" class="footer__social-link">IG</a>
        <a href="#" aria-label="Telegram" class="footer__social-link">TG</a>
        <a href="#" aria-label="TikTok" class="footer__social-link">TT</a>
      </div>
    </div>
  </div>
</footer>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Header.astro src/components/Footer.astro src/styles/global.css && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add Header and Footer components with nav active state"
```

---

## Task 15: Create Modal, SearchForm, HeroStats components

**Files:**
- Create: `C:\ClaudeCode\src\components\Modal.astro`
- Create: `C:\ClaudeCode\src\components\SearchForm.astro`
- Create: `C:\ClaudeCode\src\components\HeroStats.astro`

- [ ] **Step 1: Create Modal.astro**

```astro
---
---

<div class="modal" id="modal" hidden>
  <div class="modal__backdrop" data-modal-close></div>
  <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <button class="modal__close" data-modal-close aria-label="Закрыть">✕</button>
    <h3 class="modal__title" id="modal-title"></h3>
    <div class="modal__body" id="modal-body"></div>
  </div>
</div>
```

- [ ] **Step 2: Create SearchForm.astro**

```astro
---
import { CITIES } from '../data/cities';

interface Props {
  variant?: 'hero' | 'compact';
}

const { variant = 'hero' } = Astro.props;
---

<form class:list={['search', `search--${variant}`]} id="search-form">
  <label class="search__field">
    <span class="search__label">
      Город
      <button type="button" class="geo-btn" id="geo-btn" title="Определить мой город">📍 Мой город</button>
    </span>
    <select name="city" id="city-select" class="search__input">
      <option value="">Все города</option>
      {CITIES.map((c) => <option value={c.id}>{c.label}</option>)}
    </select>
    <span class="geo-status" id="geo-status" hidden></span>
  </label>
  <label class="search__field">
    <span class="search__label">Дата</span>
    <input type="date" name="date" class="search__input" />
  </label>
  <label class="search__field">
    <span class="search__label">Время</span>
    <select name="time" class="search__input" id="time-select"></select>
  </label>
  <button type="submit" class="btn btn--primary search__submit">Найти клуб</button>
</form>
```

- [ ] **Step 3: Create HeroStats.astro**

```astro
---
interface Props {
  stats?: Array<{ value: string; label: string }>;
}

const defaultStats = [
  { value: '12 000+', label: 'игроков' },
  { value: '80+', label: 'клубов' },
  { value: '10', label: 'городов' },
];

const { stats = defaultStats } = Astro.props;
---

<div class="hero__stats">
  {stats.map((s) => (
    <div class="stat">
      <span class="stat__value">{s.value}</span>
      <span class="stat__label">{s.label}</span>
    </div>
  ))}
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Modal.astro src/components/SearchForm.astro src/components/HeroStats.astro && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add Modal, SearchForm and HeroStats components"
```

---

## Task 16: Create ClubCard, HowItWorks, Benefits components

**Files:**
- Create: `C:\ClaudeCode\src\components\ClubCard.astro`
- Create: `C:\ClaudeCode\src\components\HowItWorks.astro`
- Create: `C:\ClaudeCode\src\components\Benefits.astro`

- [ ] **Step 1: Create ClubCard.astro**

```astro
---
import type { Club } from '../data/clubs';
import { CITY_LABELS } from '../data/cities';

interface Props {
  club: Club;
}

const { club } = Astro.props;

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}
---

<article class="club-card" data-club={club.slug}>
  <a href={`/clubs/${club.slug}/`} class="club-card__media-link">
    <div class="club-card__media" style={`background: ${club.gradient};`}>
      <span class="club-card__initial">{club.initial}</span>
    </div>
  </a>
  <div class="club-card__body">
    <div class="club-card__header">
      <h3 class="club-card__name">
        <a href={`/clubs/${club.slug}/`}>{club.name}</a>
      </h3>
      <span class="club-card__rating">★ {club.rating}</span>
    </div>
    <div class="club-card__meta">
      <span>{CITY_LABELS[club.city] ?? club.city}</span>
      <span class="club-card__meta-sep">·</span>
      <span>{club.district}</span>
      <span class="club-card__meta-sep">·</span>
      <span class="club-card__reviews">{club.reviews} отзывов</span>
    </div>
    <div class="club-card__tags">
      {club.tags.map((t) => <span class="club-card__tag">{t}</span>)}
    </div>
    <div class="club-card__footer">
      <div class="club-card__price">
        <span class="club-card__price-from">от</span><span class="club-card__price-value">{formatPrice(club.price)} ₸</span><span class="club-card__price-unit"> /час</span>
      </div>
      <button class="btn btn--primary club-card__btn" data-book={club.slug}>Забронировать</button>
    </div>
  </div>
</article>

<style>
  .club-card__media-link { display: block; }
  .club-card__name a { color: inherit; text-decoration: none; }
  .club-card__name a:hover { color: var(--neon-cyan); }
</style>
```

- [ ] **Step 2: Create HowItWorks.astro**

```astro
---
const steps = [
  {
    num: '01',
    title: 'Выбери клуб',
    desc: 'Фильтруй по району, цене и оборудованию. Сравнивай рейтинги и отзывы.',
    icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M32 8 C22 8 14 16 14 26 C14 38 32 56 32 56 C32 56 50 38 50 26 C50 16 42 8 32 8 Z"/>
      <circle cx="32" cy="26" r="6"/>
    </svg>`,
  },
  {
    num: '02',
    title: 'Забронируй слот',
    desc: 'Выбери дату, время и количество часов. Оплачивай картой — Visa, Mastercard, Kaspi.',
    icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="10" y="14" width="44" height="42" rx="4"/>
      <path d="M10 24 H54"/>
      <path d="M22 8 V20 M42 8 V20"/>
      <path d="M22 36 H30 M22 44 H42"/>
    </svg>`,
  },
  {
    num: '03',
    title: 'Приходи и играй',
    desc: 'Покажи QR-код на ресепшене — твоё место уже готово. Без очередей и звонков.',
    icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="8" y="22" width="48" height="28" rx="14"/>
      <circle cx="20" cy="36" r="3" fill="currentColor"/>
      <circle cx="44" cy="32" r="2" fill="currentColor"/>
      <circle cx="48" cy="40" r="2" fill="currentColor"/>
      <path d="M16 30 V42 M12 36 H20"/>
    </svg>`,
  },
];
---

<section class="how" id="how">
  <div class="container">
    <h2 class="section__title">Три шага до игры</h2>
    <div class="how__steps">
      {steps.map((s) => (
        <div class="step">
          <div class="step__num">{s.num}</div>
          <div class="step__icon" set:html={s.icon}></div>
          <h3 class="step__title">{s.title}</h3>
          <p class="step__desc">{s.desc}</p>
        </div>
      ))}
    </div>
  </div>
</section>
```

- [ ] **Step 3: Create Benefits.astro**

```astro
---
const benefits = [
  {
    title: 'Онлайн-бронирование',
    desc: 'Не нужно звонить и держать место. Бронь подтверждается мгновенно.',
    icon: `<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="5" width="22" height="20" rx="3"/>
      <path d="M3 11 H25"/>
      <path d="M9 2 V8 M19 2 V8"/>
      <path d="M9 17 L13 21 L21 13"/>
    </svg>`,
  },
  {
    title: 'Оплата картой',
    desc: 'Visa, Mastercard, Kaspi. Без наличных и предоплаты администратору.',
    icon: `<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="6" width="24" height="16" rx="3"/>
      <path d="M2 11 H26"/>
      <path d="M6 17 H10 M14 17 H18"/>
    </svg>`,
  },
  {
    title: 'Проверенные клубы',
    desc: 'Все клубы прошли модерацию. Реальные отзывы, реальные рейтинги.',
    icon: `<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2 L4 6 V14 C4 20 14 26 14 26 C14 26 24 20 24 14 V6 Z"/>
      <path d="M9 14 L13 18 L19 11"/>
    </svg>`,
  },
  {
    title: 'Бонусная программа',
    desc: 'Кэшбек 5% часами за каждое посещение. Бонусы не сгорают.',
    icon: `<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="14" cy="14" r="11"/>
      <path d="M14 7 L16 12 L22 12 L17 15 L19 21 L14 17 L9 21 L11 15 L6 12 L12 12 Z" fill="currentColor" stroke="none"/>
    </svg>`,
  },
];
---

<section class="benefits" id="benefits">
  <div class="container">
    <h2 class="section__title">Почему respawn.kz</h2>
    <div class="benefits__grid">
      {benefits.map((b) => (
        <div class="benefit">
          <div class="benefit__icon" set:html={b.icon}></div>
          <div class="benefit__content">
            <h3 class="benefit__title">{b.title}</h3>
            <p class="benefit__desc">{b.desc}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
</section>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ClubCard.astro src/components/HowItWorks.astro src/components/Benefits.astro && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add ClubCard, HowItWorks and Benefits components"
```

---

## Task 17: Create FAQ component

**Files:**
- Create: `C:\ClaudeCode\src\components\FAQ.astro`

- [ ] **Step 1: Create FAQ.astro**

```astro
---
import type { FAQItem } from '../data/content';

interface Props {
  items: FAQItem[];
  title?: string;
}

const { items, title = 'Частые вопросы' } = Astro.props;
---

<section class="faq" id="faq">
  <div class="container">
    <h2 class="section__title">{title}</h2>
    <div class="faq__list">
      {items.map((item, i) => (
        <details class="faq__item" name="faq-group">
          <summary class="faq__question">
            <span>{item.q}</span>
            <span class="faq__icon">+</span>
          </summary>
          <div class="faq__answer">{item.a}</div>
        </details>
      ))}
    </div>
  </div>
</section>
```

- [ ] **Step 2: Add FAQ styles to global.css**

Дописать в конец `src/styles/global.css`:

```css
/* ============================================
   FAQ
   ============================================ */
.faq {
  background: var(--bg-base);
}

.faq__list {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.faq__item {
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: border-color var(--t-base);
}

.faq__item[open] {
  border-color: var(--border-hover);
}

.faq__question {
  padding: 18px 24px;
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  list-style: none;
  transition: color var(--t-fast);
}

.faq__question::-webkit-details-marker {
  display: none;
}

.faq__question:hover {
  color: var(--neon-cyan);
}

.faq__icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--neon-cyan);
  font-family: "JetBrains Mono", monospace;
  font-size: 18px;
  font-weight: 400;
  transition: transform var(--t-base);
}

.faq__item[open] .faq__icon {
  transform: rotate(45deg);
}

.faq__answer {
  padding: 0 24px 20px;
  color: var(--text-secondary);
  line-height: 1.7;
  font-size: 15px;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/FAQ.astro src/styles/global.css && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add FAQ accordion component with styles"
```

---

## Task 18: Assemble pages/index.astro (landing)

Полная сборка лендинга из компонентов. Будет визуально идентичен `_legacy/index.html` + новая FAQ-секция.

**Files:**
- Replace: `C:\ClaudeCode\src\pages\index.astro` (был hello-world из Task 3)

- [ ] **Step 1: Replace src/pages/index.astro**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import SearchForm from '../components/SearchForm.astro';
import HeroStats from '../components/HeroStats.astro';
import HowItWorks from '../components/HowItWorks.astro';
import ClubCard from '../components/ClubCard.astro';
import Benefits from '../components/Benefits.astro';
import FAQ from '../components/FAQ.astro';
import { CLUBS } from '../data/clubs';
import { LANDING_FAQ } from '../data/content';

const topClubs = CLUBS.slice(0, 6);
---

<BaseLayout
  title="respawn.kz — Бронируй компьютерные клубы в Казахстане"
  activeRoute="index"
>
  <section class="hero" id="hero">
    <div class="hero__grid" aria-hidden="true"></div>
    <div class="hero__scanline" aria-hidden="true"></div>
    <div class="container hero__inner">
      <h1 class="hero__title">
        Забронируй компьютерный клуб <br />
        в Казахстане за <span class="glitch" data-text="30 секунд">30 секунд</span>
      </h1>
      <p class="hero__subtitle">
        Лучшие клубы страны в одном месте. Выбирай слот, оплачивай онлайн, приходи играть.
      </p>
      <SearchForm variant="hero" />
      <HeroStats />
    </div>
  </section>

  <HowItWorks />

  <section class="clubs" id="clubs">
    <div class="container">
      <h2 class="section__title">Топ клубы в Казахстане</h2>
      <p class="section__subtitle">Проверенные клубы с лучшим рейтингом</p>
      <div class="clubs__grid">
        {topClubs.map((club) => <ClubCard club={club} />)}
      </div>
    </div>
  </section>

  <Benefits />

  <FAQ items={LANDING_FAQ} />

  <section class="cta" id="for-clubs-cta">
    <div class="container cta__inner">
      <h2 class="cta__title">Готов играть?</h2>
      <p class="cta__subtitle">Найди свой клуб и забронируй слот прямо сейчас</p>
      <a href="#hero" class="btn btn--primary btn--large">Найти клуб</a>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 2: Start dev server and verify**

```bash
export PATH="$PATH:/c/Users/Lenovo/node/node-v22.11.0-win-x64" && npm run dev &
```

Подождать 3 секунды, затем:

```bash
curl -s http://localhost:4321/ | grep -E "(RESPAWN|Cyberzone|Три шага)"
```

Expected: ID шапки логотипа, имя клуба, заголовок секции — все три matches.

- [ ] **Step 3: Stop dev server**

```bash
kill %1 2>/dev/null || true
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.astro && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: assemble landing page from Astro components with FAQ"
```

---

# Phase 3: New pages

## Task 19: Create /about page

**Files:**
- Create: `C:\ClaudeCode\src\pages\about.astro`

- [ ] **Step 1: Create about.astro**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import HeroStats from '../components/HeroStats.astro';
import { ABOUT_MISSION } from '../data/content';
---

<BaseLayout
  title="О проекте — respawn.kz"
  description="respawn.kz объединяет компьютерные клубы Казахстана. Узнай о нашей миссии и команде."
  activeRoute="about"
>
  <section class="page-hero">
    <div class="container">
      <h1 class="page-hero__title">Объединяем компьютерные клубы Казахстана</h1>
      <p class="page-hero__subtitle">
        Удобный поиск, прозрачные цены, моментальная бронь — для игроков. Поток клиентов, аналитика, онлайн-оплаты — для клубов.
      </p>
    </div>
  </section>

  <section class="mission">
    <div class="container">
      <h2 class="section__title">Наша миссия</h2>
      <div class="mission__text">
        {ABOUT_MISSION.map((p) => <p>{p}</p>)}
      </div>
    </div>
  </section>

  <section class="about-stats">
    <div class="container">
      <HeroStats />
    </div>
  </section>

  <section class="audience">
    <div class="container">
      <div class="audience__grid">
        <div class="audience__col">
          <h3 class="audience__title">Для игроков</h3>
          <p>Найди клуб в своём городе, выбери слот, оплати — и приходи играть. Никаких звонков, никаких очередей.</p>
          <a href="/" class="btn btn--primary">Найти клуб</a>
        </div>
        <div class="audience__col">
          <h3 class="audience__title">Для клубов</h3>
          <p>Подключись к платформе и получай поток онлайн-броней. Без абонплаты, комиссия только с реальных заказов.</p>
          <a href="/for-clubs/" class="btn btn--ghost">Стать партнёром</a>
        </div>
      </div>
    </div>
  </section>

  <section class="contacts">
    <div class="container">
      <h2 class="section__title">Контакты</h2>
      <div class="contacts__grid">
        <a href="mailto:hello@respawn.kz" class="contacts__item">
          <span class="contacts__label">Email</span>
          <span class="contacts__value">hello@respawn.kz</span>
        </a>
        <a href="tel:+77001234567" class="contacts__item">
          <span class="contacts__label">Телефон</span>
          <span class="contacts__value">+7 (700) 123-45-67</span>
        </a>
        <a href="https://t.me/respawn_kz" class="contacts__item">
          <span class="contacts__label">Telegram</span>
          <span class="contacts__value">@respawn_kz</span>
        </a>
      </div>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 2: Add page styles to global.css**

Дописать в конец `src/styles/global.css`:

```css
/* ============================================
   PAGE-HERO (общий для подстраниц)
   ============================================ */
.page-hero {
  padding: 140px 0 56px;
  text-align: center;
  background:
    radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0, 240, 255, 0.10), transparent 70%),
    var(--bg-base);
  position: relative;
}

.page-hero__title {
  font-size: clamp(32px, 5vw, 52px);
  margin-bottom: 16px;
  max-width: 900px;
  margin-left: auto;
  margin-right: auto;
}

.page-hero__subtitle {
  font-size: clamp(15px, 1.8vw, 18px);
  color: var(--text-secondary);
  max-width: 720px;
  margin: 0 auto;
  line-height: 1.6;
}

/* ============================================
   ABOUT — mission + audience + contacts
   ============================================ */
.mission__text {
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--text-secondary);
  font-size: 17px;
  line-height: 1.7;
}

.audience__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  max-width: 900px;
  margin: 0 auto;
}

.audience__col {
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  padding: 32px;
}

.audience__title {
  font-size: 22px;
  margin-bottom: 12px;
}

.audience__col p {
  color: var(--text-secondary);
  margin-bottom: 20px;
  line-height: 1.6;
}

.contacts__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  max-width: 900px;
  margin: 0 auto;
}

.contacts__item {
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color var(--t-base), transform var(--t-base);
}

.contacts__item:hover {
  border-color: var(--border-hover);
  transform: translateY(-2px);
}

.contacts__label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}

.contacts__value {
  font-family: "JetBrains Mono", monospace;
  font-size: 16px;
  color: var(--neon-cyan);
}

@media (max-width: 768px) {
  .audience__grid,
  .contacts__grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: Verify page works**

```bash
export PATH="$PATH:/c/Users/Lenovo/node/node-v22.11.0-win-x64" && npm run dev &
```

Подождать 3 сек:

```bash
curl -s http://localhost:4321/about/ | grep -E "(миссия|hello@respawn.kz|Объединяем)"
```

Expected: все 3 совпадения найдены.

- [ ] **Step 4: Stop dev server**

```bash
kill %1 2>/dev/null || true
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/about.astro src/styles/global.css && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add /about page with mission, audience and contacts"
```

---

## Task 20: Create /for-clubs page

**Files:**
- Create: `C:\ClaudeCode\src\pages\for-clubs.astro`
- Create: `C:\ClaudeCode\src\scripts\club-application.ts`

- [ ] **Step 1: Create club-application.ts**

```ts
import { openModal } from './modal';

export function setupClubApplication(): void {
  const form = document.getElementById('club-application-form') as HTMLFormElement | null;
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const clubName = data.get('club-name') as string;

    openModal({
      title: 'Заявка принята',
      body: `
        <p>Спасибо! Заявка от <strong>${clubName}</strong> получена.</p>
        <p style="margin-top:12px">Менеджер свяжется с вами в течение рабочего дня — поможет настроить расписание клуба, цены и фото. Подключение бесплатное.</p>
        <p style="margin-top:12px;color:var(--text-muted)">Это демо-форма — реальная отправка появится в продакшен-версии платформы.</p>
      `,
    });
    form.reset();
  });
}
```

- [ ] **Step 2: Update init.ts to include club-application**

Заменить `src/scripts/init.ts`:

```ts
import { setupGeolocation } from './geolocation';
import { setupModal } from './modal';
import { setupMobileMenu } from './menu';
import { setupHeaderScroll } from './header-scroll';
import { setupSearchForm, setupTimeSelect, setupDateDefault } from './search';
import { setupBookingButtons } from './booking';
import { setupGlitch } from './glitch';
import { setupClubApplication } from './club-application';

function init(): void {
  setupHeaderScroll();
  setupMobileMenu();
  setupModal();
  setupBookingButtons();
  if (document.getElementById('search-form')) {
    setupTimeSelect();
    setupDateDefault();
    setupSearchForm();
    setupGeolocation();
  }
  if (document.querySelector('.glitch')) {
    setupGlitch();
  }
  if (document.getElementById('club-application-form')) {
    setupClubApplication();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

- [ ] **Step 3: Create for-clubs.astro**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { CITIES } from '../data/cities';
import { FOR_CLUBS_BENEFITS, FOR_CLUBS_STEPS } from '../data/content';
---

<BaseLayout
  title="Для клубов — respawn.kz"
  description="Подключи компьютерный клуб к платформе respawn.kz. Без абонплаты, комиссия только с реальных броней."
  activeRoute="for-clubs"
>
  <section class="page-hero">
    <div class="container">
      <h1 class="page-hero__title">Стань партнёром respawn.kz</h1>
      <p class="page-hero__subtitle">
        Получай больше клиентов, принимай онлайн-оплаты, видь аналитику в реальном времени.
      </p>
      <a href="#application" class="btn btn--primary btn--large" style="margin-top:24px">Подать заявку</a>
    </div>
  </section>

  <section class="club-benefits">
    <div class="container">
      <h2 class="section__title">Что вы получаете</h2>
      <div class="club-benefits__grid">
        {FOR_CLUBS_BENEFITS.map((b) => (
          <div class="club-benefit">
            <div class="club-benefit__icon">{b.icon}</div>
            <h3 class="club-benefit__title">{b.title}</h3>
            <p class="club-benefit__desc">{b.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>

  <section class="how" id="how-clubs">
    <div class="container">
      <h2 class="section__title">Как подключиться</h2>
      <div class="how__steps">
        {FOR_CLUBS_STEPS.map((s) => (
          <div class="step">
            <div class="step__num">{s.num}</div>
            <h3 class="step__title">{s.title}</h3>
            <p class="step__desc">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>

  <section class="pricing">
    <div class="container">
      <h2 class="section__title">Тариф</h2>
      <div class="pricing__card">
        <div class="pricing__big">
          <span class="pricing__amount">7%</span>
          <span class="pricing__unit">комиссия с брони</span>
        </div>
        <ul class="pricing__list">
          <li>✓ Без абонплаты</li>
          <li>✓ Без расходов на подключение</li>
          <li>✓ Обучение и поддержка — бесплатно</li>
          <li>✓ Вывод денег на счёт ИП/ТОО еженедельно</li>
          <li>✓ Все чеки — фискальные</li>
        </ul>
      </div>
    </div>
  </section>

  <section class="application" id="application">
    <div class="container">
      <h2 class="section__title">Подать заявку</h2>
      <p class="section__subtitle">Заполни форму — менеджер свяжется в течение рабочего дня</p>
      <form class="application__form" id="club-application-form">
        <label class="application__field">
          <span class="application__label">Название клуба</span>
          <input type="text" name="club-name" class="application__input" required />
        </label>
        <label class="application__field">
          <span class="application__label">Город</span>
          <select name="city" class="application__input" required>
            <option value="">Выбери город</option>
            {CITIES.map((c) => <option value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label class="application__field">
          <span class="application__label">Имя контакта</span>
          <input type="text" name="contact-name" class="application__input" required />
        </label>
        <label class="application__field">
          <span class="application__label">Телефон или email</span>
          <input type="text" name="contact" class="application__input" placeholder="+7 (___) ___-__-__" required />
        </label>
        <label class="application__field application__field--wide">
          <span class="application__label">Сообщение (опционально)</span>
          <textarea name="message" class="application__input application__textarea" rows="4"></textarea>
        </label>
        <button type="submit" class="btn btn--primary btn--large application__submit">Отправить заявку</button>
      </form>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 4: Add for-clubs styles to global.css**

Дописать в конец `src/styles/global.css`:

```css
/* ============================================
   FOR-CLUBS page
   ============================================ */
.club-benefits {
  background: var(--bg-base);
}

.club-benefits__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
  max-width: 1000px;
  margin: 0 auto;
}

.club-benefit {
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  padding: 32px;
  transition: border-color var(--t-base), transform var(--t-base);
}

.club-benefit:hover {
  border-color: var(--border-hover);
  transform: translateY(-4px);
}

.club-benefit__icon {
  font-size: 32px;
  margin-bottom: 16px;
}

.club-benefit__title {
  font-size: 20px;
  margin-bottom: 8px;
}

.club-benefit__desc {
  color: var(--text-secondary);
  line-height: 1.6;
}

.pricing__card {
  max-width: 560px;
  margin: 0 auto;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 48px 40px;
  text-align: center;
  box-shadow: var(--glow-cyan);
}

.pricing__big {
  margin-bottom: 32px;
}

.pricing__amount {
  display: block;
  font-family: "JetBrains Mono", monospace;
  font-size: 72px;
  font-weight: 700;
  color: var(--neon-cyan);
  line-height: 1;
  margin-bottom: 8px;
}

.pricing__unit {
  color: var(--text-secondary);
  font-size: 16px;
}

.pricing__list {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 360px;
  margin: 0 auto;
}

.pricing__list li {
  color: var(--text-primary);
  font-size: 15px;
}

.application__form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  max-width: 720px;
  margin: 0 auto;
}

.application__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.application__field--wide,
.application__submit {
  grid-column: 1 / -1;
}

.application__label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  font-weight: 500;
  padding-left: 14px;
}

.application__input {
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  font-size: 15px;
  color: var(--text-primary);
  transition: border-color var(--t-fast);
  font-family: inherit;
}

.application__input:hover,
.application__input:focus {
  border-color: var(--border-hover);
  outline: none;
}

.application__textarea {
  resize: vertical;
  min-height: 100px;
}

@media (max-width: 768px) {
  .club-benefits__grid {
    grid-template-columns: 1fr;
  }
  .application__form {
    grid-template-columns: 1fr;
  }
  .pricing__card {
    padding: 32px 24px;
  }
}
```

- [ ] **Step 5: Verify page**

```bash
export PATH="$PATH:/c/Users/Lenovo/node/node-v22.11.0-win-x64" && npm run dev &
```

Подождать, затем:

```bash
curl -s http://localhost:4321/for-clubs/ | grep -E "(Стань партнёром|комиссия с брони|Подать заявку)"
```

Expected: все 3 совпадения.

- [ ] **Step 6: Stop dev server**

```bash
kill %1 2>/dev/null || true
```

- [ ] **Step 7: Commit**

```bash
git add src/pages/for-clubs.astro src/scripts/club-application.ts src/scripts/init.ts src/styles/global.css && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add /for-clubs B2B page with benefits, pricing and application form"
```

---

## Task 21: Create filters.ts

**Files:**
- Create: `C:\ClaudeCode\src\scripts\filters.ts`

- [ ] **Step 1: Create filters.ts**

```ts
import { CLUBS, type Club } from '../data/clubs';
import { CITY_LABELS } from '../data/cities';

export type SortMode = 'rating' | 'price-asc' | 'price-desc';

export interface Filters {
  city: string;
  priceTiers: string[];
  tags: string[];
  sort: SortMode;
}

const PRICE_TIERS: Record<string, [number, number]> = {
  low: [0, 800],
  mid: [800, 1200],
  high: [1200, Infinity],
};

function priceMatches(price: number, tier: string): boolean {
  const range = PRICE_TIERS[tier];
  if (!range) return true;
  return price >= range[0] && price < range[1];
}

function sortFn(mode: SortMode): (a: Club, b: Club) => number {
  if (mode === 'price-asc') return (a, b) => a.price - b.price;
  if (mode === 'price-desc') return (a, b) => b.price - a.price;
  return (a, b) => b.rating - a.rating;
}

export function applyFilters(filters: Filters): Club[] {
  return CLUBS.filter((c) => !filters.city || c.city === filters.city)
    .filter(
      (c) =>
        !filters.priceTiers.length ||
        filters.priceTiers.some((t) => priceMatches(c.price, t))
    )
    .filter(
      (c) =>
        !filters.tags.length ||
        filters.tags.every((t) => c.tags.includes(t))
    )
    .sort(sortFn(filters.sort));
}

export function filtersToQuery(f: Filters): string {
  const params = new URLSearchParams();
  if (f.city) params.set('city', f.city);
  if (f.priceTiers.length) params.set('price', f.priceTiers.join(','));
  if (f.tags.length) params.set('tags', f.tags.join(','));
  if (f.sort !== 'rating') params.set('sort', f.sort);
  return params.toString();
}

export function queryToFilters(query: string): Filters {
  const params = new URLSearchParams(query);
  return {
    city: params.get('city') || '',
    priceTiers: params.get('price')?.split(',').filter(Boolean) || [],
    tags: params.get('tags')?.split(',').filter(Boolean) || [],
    sort: (params.get('sort') as SortMode) || 'rating',
  };
}

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}

function renderCard(club: Club): string {
  const cityLabel = CITY_LABELS[club.city] ?? club.city;
  return `
    <article class="club-card" data-club="${club.slug}">
      <a href="/clubs/${club.slug}/" class="club-card__media-link">
        <div class="club-card__media" style="background: ${club.gradient};">
          <span class="club-card__initial">${club.initial}</span>
        </div>
      </a>
      <div class="club-card__body">
        <div class="club-card__header">
          <h3 class="club-card__name"><a href="/clubs/${club.slug}/">${club.name}</a></h3>
          <span class="club-card__rating">★ ${club.rating}</span>
        </div>
        <div class="club-card__meta">
          <span>${cityLabel}</span>
          <span class="club-card__meta-sep">·</span>
          <span>${club.district}</span>
          <span class="club-card__meta-sep">·</span>
          <span class="club-card__reviews">${club.reviews} отзывов</span>
        </div>
        <div class="club-card__tags">
          ${club.tags.map((t) => `<span class="club-card__tag">${t}</span>`).join('')}
        </div>
        <div class="club-card__footer">
          <div class="club-card__price">
            <span class="club-card__price-from">от</span><span class="club-card__price-value">${formatPrice(club.price)} ₸</span><span class="club-card__price-unit"> /час</span>
          </div>
          <button class="btn btn--primary club-card__btn" data-book="${club.slug}">Забронировать</button>
        </div>
      </div>
    </article>
  `;
}

export function setupCatalogFilters(): void {
  const grid = document.getElementById('catalog-grid');
  const countEl = document.getElementById('catalog-count');
  const emptyEl = document.getElementById('catalog-empty');
  const resetBtn = document.getElementById('catalog-reset');
  if (!grid || !countEl || !emptyEl) return;

  const citySelect = document.getElementById('city-select') as HTMLSelectElement | null;
  const sortSelect = document.getElementById('sort-select') as HTMLSelectElement | null;
  const priceChips = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-price-tier]'));
  const tagChecks = Array.from(document.querySelectorAll<HTMLInputElement>('[data-tag]'));

  function readFilters(): Filters {
    return {
      city: citySelect?.value || '',
      priceTiers: priceChips.filter((c) => c.classList.contains('is-active')).map((c) => c.dataset.priceTier!),
      tags: tagChecks.filter((c) => c.checked).map((c) => c.dataset.tag!),
      sort: (sortSelect?.value as SortMode) || 'rating',
    };
  }

  function writeUrl(f: Filters): void {
    const qs = filtersToQuery(f);
    const url = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState({}, '', url);
  }

  function render(): void {
    const f = readFilters();
    const results = applyFilters(f);
    countEl.textContent = String(results.length);
    grid.innerHTML = results.map(renderCard).join('');
    emptyEl.hidden = results.length > 0;
    writeUrl(f);
    updateResetVisibility(f);
  }

  function updateResetVisibility(f: Filters): void {
    const hasFilters = f.city || f.priceTiers.length || f.tags.length || f.sort !== 'rating';
    if (resetBtn) resetBtn.hidden = !hasFilters;
  }

  function applyFiltersToUI(f: Filters): void {
    if (citySelect) citySelect.value = f.city;
    if (sortSelect) sortSelect.value = f.sort;
    priceChips.forEach((c) => {
      c.classList.toggle('is-active', f.priceTiers.includes(c.dataset.priceTier!));
    });
    tagChecks.forEach((c) => {
      c.checked = f.tags.includes(c.dataset.tag!);
    });
  }

  // Применить фильтры из URL при загрузке
  applyFiltersToUI(queryToFilters(window.location.search.slice(1)));

  citySelect?.addEventListener('change', render);
  sortSelect?.addEventListener('change', render);
  priceChips.forEach((c) => c.addEventListener('click', () => {
    c.classList.toggle('is-active');
    render();
  }));
  tagChecks.forEach((c) => c.addEventListener('change', render));
  resetBtn?.addEventListener('click', () => {
    applyFiltersToUI({ city: '', priceTiers: [], tags: [], sort: 'rating' });
    render();
  });

  // Первый рендер
  render();
}
```

- [ ] **Step 2: Update init.ts to call setupCatalogFilters when on catalog page**

Заменить `src/scripts/init.ts`:

```ts
import { setupGeolocation } from './geolocation';
import { setupModal } from './modal';
import { setupMobileMenu } from './menu';
import { setupHeaderScroll } from './header-scroll';
import { setupSearchForm, setupTimeSelect, setupDateDefault } from './search';
import { setupBookingButtons } from './booking';
import { setupGlitch } from './glitch';
import { setupClubApplication } from './club-application';
import { setupCatalogFilters } from './filters';

function init(): void {
  setupHeaderScroll();
  setupMobileMenu();
  setupModal();
  setupBookingButtons();
  if (document.getElementById('search-form')) {
    setupTimeSelect();
    setupDateDefault();
    setupSearchForm();
    setupGeolocation();
  }
  if (document.querySelector('.glitch')) {
    setupGlitch();
  }
  if (document.getElementById('club-application-form')) {
    setupClubApplication();
  }
  if (document.getElementById('catalog-grid')) {
    setupCatalogFilters();
    setupGeolocation();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

- [ ] **Step 3: Commit**

```bash
git add src/scripts/filters.ts src/scripts/init.ts && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add filters.ts module for catalog page with URL state"
```

---

## Task 22: Create /clubs catalog page

**Files:**
- Create: `C:\ClaudeCode\src\pages\clubs\index.astro`

- [ ] **Step 1: Create clubs directory and index.astro**

```bash
mkdir -p src/pages/clubs
```

Создать `src/pages/clubs/index.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import { CITIES } from '../../data/cities';
import { CLUBS } from '../../data/clubs';
---

<BaseLayout
  title="Все клубы Казахстана — respawn.kz"
  description="Каталог компьютерных клубов в 10 городах Казахстана. Фильтры по городу, цене и оборудованию."
  activeRoute="clubs"
>
  <section class="catalog">
    <div class="container">
      <nav class="breadcrumb">
        <a href="/">Главная</a>
        <span class="breadcrumb__sep">/</span>
        <span class="breadcrumb__current">Клубы</span>
      </nav>

      <header class="catalog__header">
        <h1 class="catalog__title">Клубы Казахстана</h1>
        <p class="catalog__subtitle">Найдено <strong id="catalog-count">{CLUBS.length}</strong> клубов</p>
      </header>

      <div class="catalog__filters" id="catalog-filters">
        <label class="filter">
          <span class="filter__label">
            Город
            <button type="button" class="geo-btn" id="geo-btn">📍 Мой город</button>
          </span>
          <select id="city-select" class="filter__input">
            <option value="">Все города</option>
            {CITIES.map((c) => <option value={c.id}>{c.label}</option>)}
          </select>
          <span class="geo-status" id="geo-status" hidden></span>
        </label>

        <div class="filter">
          <span class="filter__label">Цена</span>
          <div class="filter__chips">
            <button type="button" class="chip" data-price-tier="low">до 800 ₸</button>
            <button type="button" class="chip" data-price-tier="mid">800–1200 ₸</button>
            <button type="button" class="chip" data-price-tier="high">1200+ ₸</button>
          </div>
        </div>

        <div class="filter">
          <span class="filter__label">Оборудование</span>
          <div class="filter__tags">
            <label class="tag-check"><input type="checkbox" data-tag="PC" /><span>PC</span></label>
            <label class="tag-check"><input type="checkbox" data-tag="PS5" /><span>PS5</span></label>
            <label class="tag-check"><input type="checkbox" data-tag="VR" /><span>VR</span></label>
            <label class="tag-check"><input type="checkbox" data-tag="Sim Racing" /><span>Sim Racing</span></label>
          </div>
        </div>

        <label class="filter">
          <span class="filter__label">Сортировка</span>
          <select id="sort-select" class="filter__input">
            <option value="rating">По рейтингу</option>
            <option value="price-asc">Цена ↑</option>
            <option value="price-desc">Цена ↓</option>
          </select>
        </label>

        <button type="button" class="btn btn--ghost catalog__reset" id="catalog-reset" hidden>Сбросить фильтры</button>
      </div>

      <div class="clubs__grid" id="catalog-grid"></div>

      <div class="catalog__empty" id="catalog-empty" hidden>
        <p>Ничего не нашлось — попробуй сбросить фильтры</p>
      </div>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 2: Add catalog styles to global.css**

Дописать в конец `src/styles/global.css`:

```css
/* ============================================
   CATALOG page
   ============================================ */
.catalog {
  padding-top: 120px;
  padding-bottom: 80px;
  min-height: 100vh;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 14px;
  margin-bottom: 24px;
}

.breadcrumb a {
  color: var(--text-secondary);
}

.breadcrumb a:hover {
  color: var(--neon-cyan);
}

.breadcrumb__sep {
  opacity: 0.4;
}

.breadcrumb__current {
  color: var(--text-primary);
}

.catalog__header {
  margin-bottom: 32px;
}

.catalog__title {
  font-size: clamp(28px, 4vw, 40px);
  margin-bottom: 8px;
}

.catalog__subtitle {
  color: var(--text-secondary);
  font-size: 17px;
}

.catalog__subtitle strong {
  color: var(--neon-cyan);
  font-family: "JetBrains Mono", monospace;
}

.catalog__filters {
  display: grid;
  grid-template-columns: 1fr 1.5fr 2fr 1fr;
  gap: 20px;
  align-items: end;
  padding: 20px;
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  margin-bottom: 32px;
  position: relative;
}

.filter {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter__label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  font-weight: 500;
  padding-left: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.filter__input {
  background: var(--bg-elevated);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  font-size: 14px;
  color: var(--text-primary);
  transition: border-color var(--t-fast);
}

.filter__input:hover,
.filter__input:focus {
  border-color: var(--border-hover);
  outline: none;
}

.filter__chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.chip {
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  padding: 7px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-soft);
  border-radius: 100px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--t-fast);
}

.chip:hover {
  border-color: var(--border-hover);
  color: var(--text-primary);
}

.chip.is-active {
  background: rgba(0, 240, 255, 0.12);
  border-color: var(--neon-cyan);
  color: var(--neon-cyan);
}

.filter__tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tag-check {
  position: relative;
  cursor: pointer;
}

.tag-check input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.tag-check span {
  display: inline-block;
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  padding: 7px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  transition: all var(--t-fast);
}

.tag-check:hover span {
  border-color: var(--border-hover);
}

.tag-check input:checked + span {
  background: rgba(0, 240, 255, 0.12);
  border-color: var(--neon-cyan);
  color: var(--neon-cyan);
}

.catalog__reset {
  grid-column: 1 / -1;
  justify-self: start;
  font-size: 13px;
  padding: 8px 16px;
}

.catalog__empty {
  text-align: center;
  padding: 64px 20px;
  color: var(--text-secondary);
  font-size: 17px;
  background: var(--bg-surface);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
}

@media (max-width: 1024px) {
  .catalog__filters {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 768px) {
  .catalog {
    padding-top: 96px;
  }
  .catalog__filters {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .catalog__reset {
    grid-column: 1;
  }
}
```

- [ ] **Step 3: Verify**

```bash
export PATH="$PATH:/c/Users/Lenovo/node/node-v22.11.0-win-x64" && npm run dev &
```

Подождать, затем:

```bash
curl -s http://localhost:4321/clubs/ | grep -E "(Клубы Казахстана|catalog-grid|catalog-count)"
```

Expected: все 3 совпадения.

- [ ] **Step 4: Stop dev server**

```bash
kill %1 2>/dev/null || true
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/clubs/index.astro src/styles/global.css && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add /clubs catalog page with filters and reactive grid"
```

---

## Task 23: Create /clubs/[slug] detail pages

**Files:**
- Create: `C:\ClaudeCode\src\pages\clubs\[slug].astro`

- [ ] **Step 1: Create [slug].astro**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import ClubCard from '../../components/ClubCard.astro';
import { CLUBS, getSimilarClubs, type Club } from '../../data/clubs';
import { CITY_LABELS } from '../../data/cities';

export function getStaticPaths() {
  return CLUBS.map((club) => ({
    params: { slug: club.slug },
    props: { club },
  }));
}

interface Props {
  club: Club;
}

const { club } = Astro.props;
const cityLabel = CITY_LABELS[club.city] ?? club.city;
const similar = getSimilarClubs(club.slug, 3);

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}
---

<BaseLayout
  title={`${club.name} — ${cityLabel} — respawn.kz`}
  description={`${club.name}, ${cityLabel}, ${club.district}. От ${formatPrice(club.price)} ₸/час. ${club.tags.join(', ')}.`}
  activeRoute="clubs"
>
  <section class="club-page">
    <div class="container">
      <nav class="breadcrumb">
        <a href="/">Главная</a>
        <span class="breadcrumb__sep">/</span>
        <a href="/clubs/">Клубы</a>
        <span class="breadcrumb__sep">/</span>
        <span class="breadcrumb__current">{club.name}</span>
      </nav>

      <header class="club-page__hero">
        <h1 class="club-page__name">{club.name}</h1>
        <div class="club-page__meta">
          <span>{cityLabel}</span>
          <span class="club-card__meta-sep">·</span>
          <span>{club.district}</span>
          <span class="club-card__meta-sep">·</span>
          <span class="club-card__rating">★ {club.rating} ({club.reviews} отзывов)</span>
        </div>
        <div class="club-page__tags">
          {club.tags.map((t) => <span class="club-card__tag">{t}</span>)}
        </div>
      </header>

      <div class="club-page__gallery">
        {club.galleryGradients.map((g, i) => (
          <div class="gallery-item" style={`background: ${g};`}>
            <span class="gallery-item__num">{i + 1}</span>
          </div>
        ))}
      </div>

      <div class="club-page__layout">
        <div class="club-page__main">
          <section class="club-section">
            <h2 class="club-section__title">О клубе</h2>
            <p class="club-section__text">{club.description}</p>
          </section>

          <section class="club-section">
            <h2 class="club-section__title">Что у нас есть</h2>
            <ul class="equipment-list">
              {club.equipment.map((e) => <li>{e}</li>)}
            </ul>
          </section>

          <section class="club-section">
            <h2 class="club-section__title">Часы работы и адрес</h2>
            <div class="info-grid">
              <div>
                <div class="info-label">Часы работы</div>
                <div class="info-value">{club.hours}</div>
              </div>
              <div>
                <div class="info-label">Адрес</div>
                <div class="info-value">{club.address}</div>
              </div>
              <div>
                <div class="info-label">Телефон</div>
                <div class="info-value"><a href={`tel:${club.phone.replace(/[^+\d]/g, '')}`}>{club.phone}</a></div>
              </div>
            </div>
          </section>
        </div>

        <aside class="club-page__sidebar">
          <div class="pricing-card">
            <div class="pricing-card__amount">
              <span class="pricing-card__from">от</span>
              <span class="pricing-card__value">{formatPrice(club.price)} ₸</span>
              <span class="pricing-card__unit">/час</span>
            </div>
            <button class="btn btn--primary btn--large pricing-card__btn" data-book={club.slug}>
              Забронировать слот
            </button>
            <div class="pricing-card__pay">
              <span class="pricing-card__pay-label">Принимаем:</span>
              <span class="pricing-card__pay-icons">
                <span class="pay-icon">VISA</span>
                <span class="pay-icon">MC</span>
                <span class="pay-icon">Kaspi</span>
              </span>
            </div>
          </div>
        </aside>
      </div>

      <section class="similar">
        <h2 class="section__title">Похожие клубы</h2>
        <div class="clubs__grid">
          {similar.map((c) => <ClubCard club={c} />)}
        </div>
      </section>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 2: Add club-page styles to global.css**

Дописать в конец `src/styles/global.css`:

```css
/* ============================================
   CLUB DETAIL page
   ============================================ */
.club-page {
  padding-top: 120px;
  padding-bottom: 80px;
}

.club-page__hero {
  margin-bottom: 32px;
}

.club-page__name {
  font-family: "JetBrains Mono", monospace;
  font-size: clamp(32px, 5vw, 56px);
  margin-bottom: 12px;
  text-shadow: 0 0 30px rgba(0, 240, 255, 0.3);
}

.club-page__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.club-page__tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.club-page__gallery {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 48px;
}

.gallery-item {
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-md);
  position: relative;
  overflow: hidden;
}

.gallery-item__num {
  position: absolute;
  bottom: 12px;
  left: 12px;
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  background: rgba(0, 0, 0, 0.6);
  color: var(--text-primary);
  padding: 4px 8px;
  border-radius: 6px;
}

.club-page__layout {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 40px;
  margin-bottom: 64px;
}

.club-page__main {
  display: flex;
  flex-direction: column;
  gap: 40px;
}

.club-section__title {
  font-size: 24px;
  margin-bottom: 16px;
}

.club-section__text {
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1.7;
}

.equipment-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 24px;
}

.equipment-list li {
  color: var(--text-secondary);
  padding-left: 24px;
  position: relative;
  font-size: 15px;
  line-height: 1.6;
}

.equipment-list li::before {
  content: "▸";
  position: absolute;
  left: 4px;
  color: var(--neon-cyan);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.info-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.info-value {
  color: var(--text-primary);
  font-size: 15px;
}

.info-value a {
  color: var(--neon-cyan);
}

.club-page__sidebar {
  position: sticky;
  top: 96px;
  align-self: start;
}

.pricing-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 28px;
  box-shadow: var(--glow-cyan);
}

.pricing-card__amount {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 20px;
  font-family: "JetBrains Mono", monospace;
}

.pricing-card__from {
  color: var(--text-muted);
  font-size: 14px;
}

.pricing-card__value {
  font-size: 36px;
  font-weight: 700;
  color: var(--neon-cyan);
}

.pricing-card__unit {
  color: var(--text-secondary);
  font-size: 14px;
}

.pricing-card__btn {
  width: 100%;
}

.pricing-card__pay {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--border-soft);
  font-size: 12px;
  color: var(--text-muted);
}

.pricing-card__pay-icons {
  display: flex;
  gap: 6px;
  margin-left: auto;
}

.pay-icon {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  font-weight: 700;
  padding: 3px 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
}

.similar {
  margin-top: 32px;
}

@media (max-width: 1024px) {
  .club-page__gallery {
    grid-template-columns: repeat(2, 1fr);
  }
  .info-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 768px) {
  .club-page {
    padding-top: 96px;
  }
  .club-page__layout {
    grid-template-columns: 1fr;
    gap: 32px;
  }
  .club-page__sidebar {
    position: static;
  }
  .equipment-list,
  .info-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: Verify a club page**

```bash
export PATH="$PATH:/c/Users/Lenovo/node/node-v22.11.0-win-x64" && npm run dev &
```

Подождать, затем:

```bash
curl -s http://localhost:4321/clubs/cyberzone/ | grep -E "(Cyberzone|RTX 4080|Алмалинский)"
```

Expected: все 3 совпадения.

- [ ] **Step 4: Verify another club**

```bash
curl -s http://localhost:4321/clubs/rage-arena/ | grep -E "(RAGE Arena|Шымкент|Тауке хана)"
```

Expected: все 3 совпадения.

- [ ] **Step 5: Stop dev server**

```bash
kill %1 2>/dev/null || true
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/clubs/\[slug\].astro src/styles/global.css && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: add /clubs/[slug] detail pages with gallery, equipment and pricing card"
```

---

# Phase 4: Verify + cleanup

## Task 24: npm run build verification

**Files:** (no edits, validation only)

- [ ] **Step 1: Run production build**

```bash
export PATH="$PATH:/c/Users/Lenovo/node/node-v22.11.0-win-x64" && npm run build
```

Expected: build завершается без ошибок, выводит «<NN> page(s) built», создаёт `dist/`.

- [ ] **Step 2: Verify dist/ has all expected pages**

```bash
ls dist/ dist/clubs/ dist/clubs/cyberzone/ 2>&1
```

Expected output:
```
dist/:
about  clubs  favicon.svg  for-clubs  index.html

dist/clubs/:
colizeum-astana  cyber-atyrau  cyberzone  epic-oskemen  gamerhub  ignite-karaganda  index.html  lobby-semey  netgame-aktobe  nexus-astana  playzone-taraz  rage-arena  respawn-pavlodar

dist/clubs/cyberzone/:
index.html
```

(должно быть 12 папок клубов + `index.html` для каталога)

- [ ] **Step 3: Count generated HTML files**

```bash
find dist -name "*.html" | wc -l
```

Expected: `16` (1 landing + 1 about + 1 for-clubs + 1 catalog + 12 club details).

- [ ] **Step 4: Verify a specific club detail in dist**

```bash
grep -l "RTX 4080" dist/clubs/cyberzone/index.html
```

Expected: `dist/clubs/cyberzone/index.html` (содержит equipment).

- [ ] **Step 5: Commit dist artifacts? No — dist/ is in .gitignore**

```bash
git status
```

Expected: clean working tree (build artifacts ignored).

---

## Task 25: Full QA via preview

**Files:** (no edits, validation only)

- [ ] **Step 1: Start dev server**

```bash
export PATH="$PATH:/c/Users/Lenovo/node/node-v22.11.0-win-x64" && npm run dev &
```

Подождать 3 сек.

- [ ] **Step 2: Verify landing via curl**

```bash
curl -s http://localhost:4321/ | grep -E "(RESPAWN|Cyberzone|Три шага|Частые вопросы)" | wc -l
```

Expected: `4` (логотип в header, имя клуба, заголовок секции «Три шага», FAQ-заголовок).

- [ ] **Step 3: Verify catalog**

```bash
curl -s http://localhost:4321/clubs/ | grep -E "(Клубы Казахстана|catalog-grid|geo-btn)" | wc -l
```

Expected: `3`.

- [ ] **Step 4: Verify all club detail pages return 200**

```bash
for slug in cyberzone gamerhub colizeum-astana nexus-astana rage-arena ignite-karaganda netgame-aktobe playzone-taraz respawn-pavlodar epic-oskemen lobby-semey cyber-atyrau; do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4321/clubs/$slug/)
  echo "$slug: $code"
done
```

Expected: каждая строка `<slug>: 200`.

- [ ] **Step 5: Verify /about**

```bash
curl -s http://localhost:4321/about/ | grep -E "(Объединяем|hello@respawn.kz|Для игроков|Для клубов)" | wc -l
```

Expected: `4`.

- [ ] **Step 6: Verify /for-clubs**

```bash
curl -s http://localhost:4321/for-clubs/ | grep -E "(Стань партнёром|комиссия|Подать заявку|club-application-form)" | wc -l
```

Expected: `4`.

- [ ] **Step 7: Verify nav is consistent**

```bash
for path in / /clubs/ /for-clubs/ /about/ /clubs/cyberzone/; do
  match=$(curl -s http://localhost:4321$path | grep -c 'class="logo"')
  echo "$path logo count: $match"
done
```

Expected: каждая строка `<path> logo count: 2` (один в header, один в footer).

- [ ] **Step 8: Stop dev server**

```bash
kill %1 2>/dev/null || true
```

- [ ] **Step 9: Document QA pass — no commit (just verification)**

---

## Task 26: Remove _legacy and final commit

**Files:**
- Delete: `C:\ClaudeCode\_legacy\` (вся папка)

- [ ] **Step 1: Verify everything builds without _legacy**

```bash
ls _legacy/
```

Expected: 3 файла (index.html, styles.css, script.js).

- [ ] **Step 2: Remove _legacy directory**

```bash
rm -rf _legacy/
```

- [ ] **Step 3: Verify root is clean**

```bash
ls
```

Expected output (no `_legacy`):
```
.astro  .claude  .git  .gitignore  astro.config.mjs  docs  node_modules  package-lock.json  package.json  public  src  tsconfig.json
```

- [ ] **Step 4: Final build to confirm nothing was depending on _legacy**

```bash
export PATH="$PATH:/c/Users/Lenovo/node/node-v22.11.0-win-x64" && npm run build
```

Expected: build succeeds, 16 pages.

- [ ] **Step 5: Final commit**

```bash
git add -A && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "chore: remove _legacy directory after successful Astro migration"
```

- [ ] **Step 6: Show commit log**

```bash
git log --oneline | head -30
```

Expected: чистая последовательность ~26+ коммитов от scaffold до финала миграции.

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|------------------|------|
| Astro setup with TypeScript strict | T1-T3 |
| Move legacy files | T1 |
| Update launch config | T4 |
| Migrate styles to global.css | T5 |
| cities.ts with 10 cities | T6 |
| clubs.ts with 12 clubs + extended fields (Appendix A) | T7 |
| content.ts with FAQ/clubs benefits/mission | T8 |
| Scripts migration (8 modules) | T9, T10, T11, T20, T21 |
| BaseLayout with head/Header/Footer/Modal | T12 |
| favicon | T13 |
| Header + Footer components | T14 |
| Modal/SearchForm/HeroStats components | T15 |
| ClubCard/HowItWorks/Benefits components | T16 |
| FAQ component | T17 |
| Landing assembled from components | T18 |
| /about page | T19 |
| /for-clubs page with form | T20 |
| filters.ts module | T21 |
| /clubs catalog with filters | T22 |
| /clubs/[slug] detail pages (12 generated) | T23 |
| npm run build verification | T24 |
| Full QA across all pages | T25 |
| Cleanup _legacy | T26 |
| Out of scope items (auth, payment, i18n) | not implemented ✓ |

All 14 acceptance criteria from spec are covered by Tasks 24-25.

**Placeholder scan:** все шаги содержат конкретный код, нет TBD/TODO/«implement later».

**Type/name consistency:**
- `Club`, `City`, `Filters`, `SortMode` — все типы определены в data/scripts и используются согласованно
- Имена скриптов согласованы: `setupHeaderScroll`, `setupModal`, etc.
- Все компоненты экспортируются как default (Astro convention)
- `getStaticPaths()` корректно возвращает `{ params: { slug }, props: { club } }`
- `data-book` атрибут совпадает между ClubCard, [slug].astro и booking.ts (использует `club.slug`)
- `id="city-select"`, `id="search-form"`, `id="modal"` — DOM ID совпадают между components и scripts

**Готов к исполнению.**
