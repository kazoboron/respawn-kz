# ALMATY.GG Landing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Построить статический одностраничный лендинг ALMATY.GG — платформы бронирования компьютерных клубов в Алматы (B2C, ориентирован на игроков), в cyberpunk/gaming-стиле.

**Architecture:** Три файла (`index.html`, `styles.css`, `script.js`) в корне `C:\ClaudeCode\`. Без бэкенда, без build-инструментов. Mock-данные клубов в `script.js`. Все CTA показывают модалки. Адаптив mobile-first.

**Tech Stack:** HTML5, CSS3 (custom properties, grid, flexbox, animations), vanilla JavaScript (ES2020), Google Fonts (Inter + JetBrains Mono), inline SVG.

**Spec:** [docs/superpowers/specs/2026-05-14-almaty-gg-landing-design.md](../specs/2026-05-14-almaty-gg-landing-design.md)

---

## File Structure

```
C:\ClaudeCode\
├── .gitignore
├── index.html       ← разметка всех секций, ссылки на CSS/JS
├── styles.css       ← все стили: :root-токены, reset, секции, респонсив, эффекты
├── script.js        ← mock-данные клубов, рендер карточек, интерактив
└── docs\superpowers\
    ├── specs\2026-05-14-almaty-gg-landing-design.md  (уже существует)
    └── plans\2026-05-14-almaty-gg-landing.md         (этот файл)
```

**Принцип**: HTML описывает структуру, CSS — всю стилизацию, JS — данные клубов и интерактив. Никакого inline-CSS/JS в `index.html`.

---

## Task 1: Project Setup

Инициализация git, базовый каркас файлов.

**Files:**
- Create: `C:\ClaudeCode\.gitignore`
- Create: `C:\ClaudeCode\index.html` (заглушка)
- Create: `C:\ClaudeCode\styles.css` (пустой)
- Create: `C:\ClaudeCode\script.js` (пустой)

- [ ] **Step 1: Initialize git repo**

```bash
git init
git branch -M main
```

Expected: «Initialized empty Git repository in C:/ClaudeCode/.git/»

- [ ] **Step 2: Create .gitignore**

Содержимое `.gitignore`:

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

# Build / deps (на будущее)
node_modules/
dist/
.cache/

# Logs
*.log
```

- [ ] **Step 3: Create stub index.html**

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ALMATY.GG — Бронируй компьютерные клубы Алматы</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main>
    <h1>ALMATY.GG</h1>
  </main>
  <script src="script.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create empty styles.css and script.js**

`styles.css`:
```css
/* ALMATY.GG — styles */
```

`script.js`:
```js
// ALMATY.GG — interactions
```

- [ ] **Step 5: Verify in browser**

Открыть `C:\ClaudeCode\index.html` в браузере (двойной клик или drag-n-drop).
Expected: видна страница с заголовком «ALMATY.GG», заголовок вкладки правильный.

- [ ] **Step 6: First commit**

```bash
git add .gitignore index.html styles.css script.js docs/superpowers/specs/2026-05-14-almaty-gg-landing-design.md docs/superpowers/plans/2026-05-14-almaty-gg-landing.md
git commit -m "chore: initial project scaffold with spec and plan"
```

---

## Task 2: HTML Skeleton

Полная семантическая разметка всех секций (пока без контента — заглушки и комментарии). Это даст карту страницы.

**Files:**
- Modify: `C:\ClaudeCode\index.html`

- [ ] **Step 1: Заменить содержимое index.html полным скелетом**

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="ALMATY.GG — онлайн-бронирование компьютерных клубов в Алматы. Найди клуб, забронируй слот, оплати картой." />
  <title>ALMATY.GG — Бронируй компьютерные клубы Алматы</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <!-- HEADER -->
  <header class="header" id="header">
    <div class="container header__inner">
      <a href="#" class="logo">ALMATY<span class="logo__accent">.GG</span></a>
      <nav class="nav" id="nav">
        <a href="#clubs" class="nav__link">Клубы</a>
        <a href="#how" class="nav__link">Как это работает</a>
        <a href="#benefits" class="nav__link">Преимущества</a>
        <a href="#for-clubs" class="nav__link">Для клубов</a>
      </nav>
      <div class="header__actions">
        <button class="btn btn--ghost" type="button">Войти</button>
        <button class="hamburger" id="hamburger" aria-label="Меню" type="button">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
  </header>

  <main>
    <!-- HERO -->
    <section class="hero" id="hero">
      <div class="hero__grid" aria-hidden="true"></div>
      <div class="hero__scanline" aria-hidden="true"></div>
      <div class="container hero__inner">
        <h1 class="hero__title">
          Забронируй компьютерный клуб <br />
          в Алматы за <span class="glitch" data-text="30 секунд">30 секунд</span>
        </h1>
        <p class="hero__subtitle">
          Лучшие клубы города в одном месте. Выбирай слот, оплачивай онлайн, приходи играть.
        </p>

        <form class="search" id="search-form">
          <label class="search__field">
            <span class="search__label">Район</span>
            <select name="district" class="search__input">
              <option value="">Все районы</option>
              <option value="almalinsky">Алмалинский</option>
              <option value="bostandyk">Бостандыкский</option>
              <option value="medeu">Медеуский</option>
              <option value="auezov">Ауэзовский</option>
            </select>
          </label>
          <label class="search__field">
            <span class="search__label">Дата</span>
            <input type="date" name="date" class="search__input" />
          </label>
          <label class="search__field">
            <span class="search__label">Время</span>
            <select name="time" class="search__input" id="time-select">
              <!-- options populated by JS -->
            </select>
          </label>
          <button type="submit" class="btn btn--primary search__submit">Найти клуб</button>
        </form>

        <div class="hero__stats">
          <div class="stat"><span class="stat__value">4 800+</span><span class="stat__label">игроков</span></div>
          <div class="stat"><span class="stat__value">24</span><span class="stat__label">клуба-партнёра</span></div>
          <div class="stat"><span class="stat__value">4.8</span><span class="stat__label">средний рейтинг</span></div>
        </div>
      </div>
    </section>

    <!-- HOW IT WORKS -->
    <section class="how" id="how">
      <div class="container">
        <h2 class="section__title">Три шага до игры</h2>
        <div class="how__steps" id="how-steps">
          <!-- populated by JS -->
        </div>
      </div>
    </section>

    <!-- CLUBS -->
    <section class="clubs" id="clubs">
      <div class="container">
        <h2 class="section__title">Топ клубы в Алматы</h2>
        <p class="section__subtitle">Проверенные клубы с лучшим рейтингом</p>
        <div class="clubs__grid" id="clubs-grid">
          <!-- populated by JS -->
        </div>
      </div>
    </section>

    <!-- BENEFITS -->
    <section class="benefits" id="benefits">
      <div class="container">
        <h2 class="section__title">Почему ALMATY.GG</h2>
        <div class="benefits__grid" id="benefits-grid">
          <!-- populated by JS -->
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="cta" id="for-clubs">
      <div class="container cta__inner">
        <h2 class="cta__title">Готов играть?</h2>
        <p class="cta__subtitle">Найди свой клуб и забронируй слот прямо сейчас</p>
        <a href="#hero" class="btn btn--primary btn--large">Найти клуб</a>
      </div>
    </section>
  </main>

  <!-- FOOTER -->
  <footer class="footer">
    <div class="container footer__inner">
      <div class="footer__col">
        <div class="logo">ALMATY<span class="logo__accent">.GG</span></div>
        <p class="footer__desc">Платформа онлайн-бронирования компьютерных клубов в Алматы.</p>
        <p class="footer__copy">© 2026 ALMATY.GG</p>
      </div>
      <div class="footer__col">
        <h4 class="footer__title">Навигация</h4>
        <ul class="footer__list">
          <li><a href="#clubs">Клубы</a></li>
          <li><a href="#how">Как это работает</a></li>
          <li><a href="#benefits">Преимущества</a></li>
          <li><a href="#for-clubs">Для клубов</a></li>
        </ul>
      </div>
      <div class="footer__col">
        <h4 class="footer__title">Контакты</h4>
        <ul class="footer__list">
          <li><a href="mailto:hello@almaty.gg">hello@almaty.gg</a></li>
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

  <!-- MODAL ROOT -->
  <div class="modal" id="modal" hidden>
    <div class="modal__backdrop" data-modal-close></div>
    <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button class="modal__close" data-modal-close aria-label="Закрыть">✕</button>
      <h3 class="modal__title" id="modal-title"></h3>
      <div class="modal__body" id="modal-body"></div>
    </div>
  </div>

  <script src="script.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify in browser**

Открыть `index.html`. Expected:
- Видна структура (хедер, hero-заголовок, секции с заголовками)
- Без стилей всё выглядит ужасно, но контент читаем
- В консоли (F12) нет ошибок 404 на CSS/JS

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add full HTML skeleton with all sections"
```

---

## Task 3: Design System + Reset

Базовые токены, ресет, типографика, container, утилитарные классы.

**Files:**
- Modify: `C:\ClaudeCode\styles.css`

- [ ] **Step 1: Заменить содержимое styles.css**

```css
/* ============================================
   ALMATY.GG — Landing styles
   ============================================ */

/* ---------- Design tokens ---------- */
:root {
  /* Backgrounds */
  --bg-base: #0a0a0f;
  --bg-surface: #14141c;
  --bg-elevated: #1c1c28;

  /* Text */
  --text-primary: #f0f0ff;
  --text-secondary: #a0a0b8;
  --text-muted: #60607a;

  /* Neon accents */
  --neon-cyan: #00f0ff;
  --neon-magenta: #ff2e9a;
  --neon-yellow: #fef300;

  /* Borders */
  --border: rgba(0, 240, 255, 0.15);
  --border-hover: rgba(0, 240, 255, 0.4);
  --border-soft: rgba(255, 255, 255, 0.06);

  /* Glow */
  --glow-cyan: 0 0 24px rgba(0, 240, 255, 0.4);
  --glow-magenta: 0 0 24px rgba(255, 46, 154, 0.4);

  /* Radii */
  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 20px;

  /* Container */
  --container-max: 1200px;
  --container-pad: 20px;

  /* Transitions */
  --t-fast: 150ms ease;
  --t-base: 250ms ease;
  --t-slow: 400ms ease;
}

/* ---------- Reset ---------- */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  scroll-behavior: smooth;
  -webkit-text-size-adjust: 100%;
}

body {
  font-family: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: var(--text-primary);
  background: var(--bg-base);
  overflow-x: hidden;
  min-height: 100vh;
}

img,
svg {
  display: block;
  max-width: 100%;
}

button,
input,
select {
  font: inherit;
  color: inherit;
}

button {
  cursor: pointer;
  background: none;
  border: none;
}

a {
  color: inherit;
  text-decoration: none;
  transition: color var(--t-fast);
}

a:hover {
  color: var(--neon-cyan);
}

ul {
  list-style: none;
}

/* ---------- Layout ---------- */
.container {
  width: 100%;
  max-width: var(--container-max);
  margin: 0 auto;
  padding-left: var(--container-pad);
  padding-right: var(--container-pad);
}

/* ---------- Typography ---------- */
h1,
h2,
h3,
h4 {
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.section__title {
  font-size: clamp(28px, 4vw, 40px);
  margin-bottom: 12px;
  text-align: center;
}

.section__subtitle {
  color: var(--text-secondary);
  text-align: center;
  margin-bottom: 48px;
  font-size: 18px;
}

/* ---------- Logo ---------- */
.logo {
  font-family: "JetBrains Mono", monospace;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.02em;
  display: inline-block;
}

.logo__accent {
  color: var(--neon-cyan);
  text-shadow: 0 0 10px rgba(0, 240, 255, 0.6);
}

/* ---------- Buttons ---------- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 15px;
  transition: all var(--t-base);
  white-space: nowrap;
  cursor: pointer;
  border: 1px solid transparent;
}

.btn--primary {
  background: var(--neon-cyan);
  color: #001014;
  box-shadow: var(--glow-cyan);
}

.btn--primary:hover {
  background: #5af5ff;
  box-shadow: 0 0 32px rgba(0, 240, 255, 0.6);
  transform: translateY(-2px);
}

.btn--ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--text-primary);
}

.btn--ghost:hover {
  border-color: var(--neon-cyan);
  color: var(--neon-cyan);
}

.btn--large {
  padding: 18px 40px;
  font-size: 17px;
}

/* ---------- Section base spacing ---------- */
section {
  padding: 96px 0;
  position: relative;
}

/* ---------- Focus ---------- */
:focus-visible {
  outline: 2px solid var(--neon-cyan);
  outline-offset: 3px;
  border-radius: 4px;
}
```

- [ ] **Step 2: Verify in browser**

Reload `index.html`. Expected:
- Тёмный фон `#0a0a0f`
- Шрифт Inter применён (sans-serif, чистый)
- Логотип `ALMATY.GG` — моно-шрифт, `.GG` cyan с glow
- Кнопка «Войти» — outline с border
- Контент центрирован, есть padding по бокам
- Заголовки секций крупные и по центру

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "feat: add design tokens, reset, base typography and buttons"
```

---

## Task 4: Header & Navigation

Sticky header с навигацией. Mobile-меню без JS (только стили; toggle добавим позже).

**Files:**
- Modify: `C:\ClaudeCode\styles.css` (добавить в конец)

- [ ] **Step 1: Добавить стили header в styles.css**

```css
/* ============================================
   HEADER
   ============================================ */
.header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding: 16px 0;
  background: transparent;
  transition: background var(--t-base), backdrop-filter var(--t-base), border-color var(--t-base);
  border-bottom: 1px solid transparent;
}

.header.scrolled {
  background: rgba(10, 10, 15, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom-color: var(--border);
}

.header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
}

.nav {
  display: flex;
  align-items: center;
  gap: 32px;
}

.nav__link {
  font-size: 15px;
  color: var(--text-secondary);
  font-weight: 500;
  position: relative;
  padding: 4px 0;
  transition: color var(--t-fast);
}

.nav__link::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  width: 0;
  height: 1px;
  background: var(--neon-cyan);
  transition: width var(--t-base);
}

.nav__link:hover {
  color: var(--neon-cyan);
}

.nav__link:hover::after {
  width: 100%;
}

.header__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Hamburger — скрыт на десктопе */
.hamburger {
  display: none;
  width: 32px;
  height: 32px;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  padding: 0;
}

.hamburger span {
  display: block;
  width: 22px;
  height: 2px;
  background: var(--text-primary);
  transition: transform var(--t-base), opacity var(--t-base);
  border-radius: 2px;
}

/* Активное состояние гамбургера */
body.menu-open .hamburger span:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}
body.menu-open .hamburger span:nth-child(2) {
  opacity: 0;
}
body.menu-open .hamburger span:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}
```

- [ ] **Step 2: Verify**

Reload. Expected:
- Хедер прижат к верху, прозрачный (через hero ещё ничего не видно — это нормально)
- Ссылки в навигации серые, на hover становятся cyan с подчёркиванием
- Логотип слева, навигация, кнопка «Войти» справа

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "feat: style header with sticky behavior and nav hover effects"
```

---

## Task 5: Hero Section

Заголовок с glitch-словом, поисковая форма, статистика, декоративная сетка и scanline.

**Files:**
- Modify: `C:\ClaudeCode\styles.css` (добавить в конец)

- [ ] **Step 1: Добавить стили hero в styles.css**

```css
/* ============================================
   HERO
   ============================================ */
.hero {
  min-height: 100vh;
  padding-top: 140px;
  padding-bottom: 80px;
  display: flex;
  align-items: center;
  overflow: hidden;
  background:
    radial-gradient(ellipse 80% 50% at 20% 30%, rgba(0, 240, 255, 0.12), transparent 60%),
    radial-gradient(ellipse 60% 40% at 80% 70%, rgba(255, 46, 154, 0.10), transparent 60%),
    var(--bg-base);
}

.hero__grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(0, 240, 255, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 240, 255, 0.06) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 80%);
  pointer-events: none;
}

.hero__scanline {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgba(0, 240, 255, 0.04) 50%,
    transparent 100%
  );
  background-size: 100% 8px;
  pointer-events: none;
  opacity: 0.4;
  animation: scanline 8s linear infinite;
}

@keyframes scanline {
  0%   { background-position: 0 0; }
  100% { background-position: 0 100vh; }
}

.hero__inner {
  position: relative;
  z-index: 2;
  text-align: center;
}

.hero__title {
  font-size: clamp(36px, 6vw, 64px);
  font-weight: 700;
  line-height: 1.1;
  margin-bottom: 24px;
  max-width: 900px;
  margin-left: auto;
  margin-right: auto;
}

.hero__subtitle {
  font-size: clamp(16px, 2vw, 20px);
  color: var(--text-secondary);
  margin-bottom: 48px;
  max-width: 640px;
  margin-left: auto;
  margin-right: auto;
}

/* ---------- Glitch ---------- */
.glitch {
  position: relative;
  color: var(--neon-cyan);
  display: inline-block;
}

.glitch::before,
.glitch::after {
  content: attr(data-text);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.glitch::before {
  color: var(--neon-magenta);
  transform: translate(-2px, 0);
  mix-blend-mode: screen;
  clip-path: polygon(0 0, 100% 0, 100% 45%, 0 45%);
  opacity: 0.8;
}

.glitch::after {
  color: var(--neon-yellow);
  transform: translate(2px, 0);
  mix-blend-mode: screen;
  clip-path: polygon(0 55%, 100% 55%, 100% 100%, 0 100%);
  opacity: 0.7;
}

.glitch.is-glitching::before {
  animation: glitch-1 0.6s steps(2) 1;
}
.glitch.is-glitching::after {
  animation: glitch-2 0.6s steps(2) 1;
}

@keyframes glitch-1 {
  0%   { transform: translate(-2px, 0); }
  20%  { transform: translate(-6px, 1px); }
  40%  { transform: translate(0, -1px); }
  60%  { transform: translate(-4px, 0); }
  80%  { transform: translate(-1px, 1px); }
  100% { transform: translate(-2px, 0); }
}

@keyframes glitch-2 {
  0%   { transform: translate(2px, 0); }
  20%  { transform: translate(5px, -1px); }
  40%  { transform: translate(1px, 1px); }
  60%  { transform: translate(3px, 0); }
  80%  { transform: translate(0, -1px); }
  100% { transform: translate(2px, 0); }
}

/* ---------- Search form ---------- */
.search {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr auto;
  gap: 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  max-width: 900px;
  margin: 0 auto 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.02);
  text-align: left;
}

.search__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.search__label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  font-weight: 500;
  padding-left: 14px;
}

.search__input {
  background: var(--bg-elevated);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  font-size: 15px;
  color: var(--text-primary);
  transition: border-color var(--t-fast), box-shadow var(--t-fast);
  width: 100%;
}

.search__input:hover,
.search__input:focus {
  border-color: var(--border-hover);
  outline: none;
}

.search__submit {
  align-self: end;
  height: 46px;
}

/* date input — нормализация */
input[type="date"]::-webkit-calendar-picker-indicator {
  filter: invert(0.8);
  cursor: pointer;
}

/* ---------- Stats ---------- */
.hero__stats {
  display: flex;
  justify-content: center;
  gap: 64px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat__value {
  font-family: "JetBrains Mono", monospace;
  font-size: 28px;
  font-weight: 700;
  color: var(--neon-cyan);
  line-height: 1;
}

.stat__label {
  font-size: 13px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

- [ ] **Step 2: Verify**

Reload. Expected:
- Hero на весь экран, тёмный фон с двумя цветными «вспышками» (cyan + magenta)
- Сетка на фоне (тонкая, с маской в центре)
- Заголовок крупный, «30 секунд» — cyan с слегка видимыми magenta/yellow тенями (glitch ready)
- Под заголовком — белая subtitle
- Поисковая форма: 4 колонки (район, дата, время, кнопка), внутри — поля с лейблами
- Время-select пока пустой (option'ы добавим в JS позже)
- Статистика в строку (3 пункта)
- При фокусе на поле — cyan border

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "feat: build hero section with search form, stats and decorative grid"
```

---

## Task 6: How It Works Section

3 шага с inline SVG-иконками. Рендерим из JS (массив step-объектов).

**Files:**
- Modify: `C:\ClaudeCode\styles.css` (стили в конец)
- Modify: `C:\ClaudeCode\script.js` (данные + рендер)

- [ ] **Step 1: Добавить стили how в styles.css**

```css
/* ============================================
   HOW IT WORKS
   ============================================ */
.how {
  background: var(--bg-base);
}

.how__steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  max-width: 1000px;
  margin: 0 auto;
  position: relative;
}

.step {
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  padding: 32px 24px;
  text-align: center;
  position: relative;
  transition: border-color var(--t-base), transform var(--t-base);
}

.step:hover {
  border-color: var(--border-hover);
  transform: translateY(-4px);
}

.step__num {
  position: absolute;
  top: -16px;
  left: 50%;
  transform: translateX(-50%);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--neon-cyan);
  color: #001014;
  font-family: "JetBrains Mono", monospace;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  box-shadow: var(--glow-cyan);
}

.step__icon {
  width: 64px;
  height: 64px;
  margin: 8px auto 20px;
  color: var(--neon-cyan);
}

.step__title {
  font-size: 20px;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.step__desc {
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.6;
}
```

- [ ] **Step 2: Добавить данные и рендер в script.js**

Заменить содержимое `script.js`:

```js
// ============================================
// ALMATY.GG — Landing interactions
// ============================================

// ---------- Data ----------
const STEPS = [
  {
    num: "01",
    title: "Выбери клуб",
    desc: "Фильтруй по району, цене и оборудованию. Сравнивай рейтинги и отзывы.",
    icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M32 8 C22 8 14 16 14 26 C14 38 32 56 32 56 C32 56 50 38 50 26 C50 16 42 8 32 8 Z"/>
      <circle cx="32" cy="26" r="6"/>
    </svg>`,
  },
  {
    num: "02",
    title: "Забронируй слот",
    desc: "Выбери дату, время и количество часов. Оплачивай картой — Visa, Mastercard, Kaspi.",
    icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="10" y="14" width="44" height="42" rx="4"/>
      <path d="M10 24 H54"/>
      <path d="M22 8 V20 M42 8 V20"/>
      <path d="M22 36 H30 M22 44 H42"/>
    </svg>`,
  },
  {
    num: "03",
    title: "Приходи и играй",
    desc: "Покажи QR-код на ресепшене — твоё место уже готово. Без очередей и звонков.",
    icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="8" y="22" width="48" height="28" rx="14"/>
      <circle cx="20" cy="36" r="3" fill="currentColor"/>
      <circle cx="44" cy="32" r="2" fill="currentColor"/>
      <circle cx="48" cy="40" r="2" fill="currentColor"/>
      <path d="M16 30 V42 M12 36 H20"/>
    </svg>`,
  },
];

// ---------- Renderers ----------
function renderSteps() {
  const root = document.getElementById("how-steps");
  if (!root) return;
  root.innerHTML = STEPS.map(
    (s) => `
    <div class="step">
      <div class="step__num">${s.num}</div>
      <div class="step__icon">${s.icon}</div>
      <h3 class="step__title">${s.title}</h3>
      <p class="step__desc">${s.desc}</p>
    </div>
  `
  ).join("");
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  renderSteps();
});
```

- [ ] **Step 3: Verify**

Reload. Expected:
- Секция «Три шага до игры» с заголовком по центру
- 3 карточки в ряд, у каждой:
  - Кружок с номером (01/02/03) поверх верхнего края, cyan с glow
  - Большая cyan SVG-иконка по центру
  - Заголовок и описание
- При hover карточка приподнимается и border становится cyan

- [ ] **Step 4: Commit**

```bash
git add styles.css script.js
git commit -m "feat: build 'how it works' section with 3 steps and SVG icons"
```

---

## Task 7: Clubs Section

Карточки клубов: 6 mock-объектов, рендер из JS, hover-эффекты. Плейсхолдер вместо фото — градиент с инициалом.

**Files:**
- Modify: `C:\ClaudeCode\styles.css` (стили в конец)
- Modify: `C:\ClaudeCode\script.js` (данные + рендер)

- [ ] **Step 1: Добавить стили clubs в styles.css**

```css
/* ============================================
   CLUBS
   ============================================ */
.clubs {
  background:
    radial-gradient(ellipse 60% 40% at 90% 20%, rgba(255, 46, 154, 0.06), transparent 60%),
    var(--bg-base);
}

.clubs__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.club-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: transform var(--t-base), border-color var(--t-base), box-shadow var(--t-base);
  display: flex;
  flex-direction: column;
}

.club-card:hover {
  transform: translateY(-6px);
  border-color: var(--border-hover);
  box-shadow: 0 12px 40px rgba(0, 240, 255, 0.15), 0 0 24px rgba(0, 240, 255, 0.1);
}

.club-card__media {
  aspect-ratio: 16 / 10;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.club-card__media::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 50%, rgba(10, 10, 15, 0.7) 100%);
}

.club-card__initial {
  font-family: "JetBrains Mono", monospace;
  font-size: 72px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.85);
  letter-spacing: -0.04em;
  text-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  position: relative;
  z-index: 1;
}

.club-card__body {
  padding: 20px 22px 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.club-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.club-card__name {
  font-family: "JetBrains Mono", monospace;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.club-card__rating {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(254, 243, 0, 0.1);
  color: var(--neon-yellow);
  padding: 4px 10px;
  border-radius: 100px;
  font-family: "JetBrains Mono", monospace;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.club-card__meta {
  color: var(--text-secondary);
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.club-card__meta-sep {
  opacity: 0.4;
}

.club-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.club-card__tag {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(0, 240, 255, 0.08);
  color: var(--neon-cyan);
  border: 1px solid rgba(0, 240, 255, 0.15);
  letter-spacing: 0.02em;
}

.club-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--border-soft);
}

.club-card__price {
  font-family: "JetBrains Mono", monospace;
  font-size: 16px;
}

.club-card__price-from {
  color: var(--text-muted);
  font-size: 12px;
  margin-right: 4px;
}

.club-card__price-value {
  color: var(--neon-cyan);
  font-weight: 600;
}

.club-card__price-unit {
  color: var(--text-secondary);
  font-size: 12px;
}

.club-card__btn {
  padding: 8px 16px;
  font-size: 13px;
  border-radius: var(--radius-sm);
}

.club-card__reviews {
  color: var(--text-muted);
  font-size: 12px;
}
```

- [ ] **Step 2: Добавить данные клубов и рендер в script.js**

Добавить в `script.js` после `STEPS` (перед `renderSteps`):

```js
const CLUBS = [
  {
    name: "Cyberzone",
    initial: "C",
    gradient: "linear-gradient(135deg, #00f0ff, #0066ff)",
    district: "Алмалинский",
    distance: "2.3 км",
    rating: 4.9,
    reviews: 312,
    price: 1200,
    tags: ["PC", "PS5", "VR"],
  },
  {
    name: "Colizeum",
    initial: "C",
    gradient: "linear-gradient(135deg, #ff2e9a, #8b00ff)",
    district: "Бостандыкский",
    distance: "4.1 км",
    rating: 4.8,
    reviews: 189,
    price: 1500,
    tags: ["PC", "Sim Racing"],
  },
  {
    name: "RAGE Arena",
    initial: "R",
    gradient: "linear-gradient(135deg, #fef300, #ff6a00)",
    district: "Медеуский",
    distance: "5.8 км",
    rating: 4.7,
    reviews: 256,
    price: 1000,
    tags: ["PC", "PS5"],
  },
  {
    name: "IGNITE",
    initial: "I",
    gradient: "linear-gradient(135deg, #ff2e9a, #00f0ff)",
    district: "Ауэзовский",
    distance: "6.2 км",
    rating: 4.6,
    reviews: 98,
    price: 800,
    tags: ["PC"],
  },
  {
    name: "NetGame",
    initial: "N",
    gradient: "linear-gradient(135deg, #00f0ff, #14141c)",
    district: "Алмалинский",
    distance: "1.5 км",
    rating: 4.5,
    reviews: 67,
    price: 600,
    tags: ["PC", "PS5"],
  },
  {
    name: "GamerHub",
    initial: "G",
    gradient: "linear-gradient(135deg, #8b00ff, #ff2e9a)",
    district: "Бостандыкский",
    distance: "3.7 км",
    rating: 4.8,
    reviews: 145,
    price: 900,
    tags: ["PC", "VR"],
  },
];

function formatPrice(value) {
  return value.toLocaleString("ru-RU");
}

function renderClubs() {
  const root = document.getElementById("clubs-grid");
  if (!root) return;
  root.innerHTML = CLUBS.map(
    (c) => `
    <article class="club-card" data-club="${c.name}">
      <div class="club-card__media" style="background: ${c.gradient};">
        <span class="club-card__initial">${c.initial}</span>
      </div>
      <div class="club-card__body">
        <div class="club-card__header">
          <h3 class="club-card__name">${c.name}</h3>
          <span class="club-card__rating">★ ${c.rating}</span>
        </div>
        <div class="club-card__meta">
          <span>${c.district}</span>
          <span class="club-card__meta-sep">·</span>
          <span>${c.distance}</span>
          <span class="club-card__meta-sep">·</span>
          <span class="club-card__reviews">${c.reviews} отзывов</span>
        </div>
        <div class="club-card__tags">
          ${c.tags.map((t) => `<span class="club-card__tag">${t}</span>`).join("")}
        </div>
        <div class="club-card__footer">
          <div class="club-card__price">
            <span class="club-card__price-from">от</span><span class="club-card__price-value">${formatPrice(c.price)} ₸</span><span class="club-card__price-unit"> /час</span>
          </div>
          <button class="btn btn--primary club-card__btn" data-book="${c.name}">Забронировать</button>
        </div>
      </div>
    </article>
  `
  ).join("");
}
```

И добавить вызов `renderClubs()` в обработчик `DOMContentLoaded`. Заменить блок:

```js
document.addEventListener("DOMContentLoaded", () => {
  renderSteps();
});
```

на:

```js
document.addEventListener("DOMContentLoaded", () => {
  renderSteps();
  renderClubs();
});
```

- [ ] **Step 3: Verify**

Reload. Expected:
- Секция «Топ клубы в Алматы», подзаголовок
- Сетка 3×2 — 6 карточек
- В каждой:
  - Верх — градиент-плейсхолдер с крупной буквой (C, C, R, I, N, G)
  - Название моно-шрифтом
  - Жёлтый chip с рейтингом (★ 4.9)
  - Район · расстояние · отзывы
  - Cyan-теги (PC, PS5, VR…)
  - Внизу — цена «от 1 200 ₸ /час» и кнопка «Забронировать»
- Hover: карточка приподнимается, появляется cyan glow

- [ ] **Step 4: Commit**

```bash
git add styles.css script.js
git commit -m "feat: render clubs grid with 6 mock cards and hover effects"
```

---

## Task 8: Benefits Section

4 преимущества в сетке 2×2, рендер из JS, inline SVG иконки.

**Files:**
- Modify: `C:\ClaudeCode\styles.css` (стили в конец)
- Modify: `C:\ClaudeCode\script.js` (данные + рендер)

- [ ] **Step 1: Добавить стили benefits в styles.css**

```css
/* ============================================
   BENEFITS
   ============================================ */
.benefits {
  background: var(--bg-base);
}

.benefits__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
  max-width: 1000px;
  margin: 0 auto;
}

.benefit {
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  padding: 28px;
  display: flex;
  gap: 20px;
  align-items: flex-start;
  transition: border-color var(--t-base), transform var(--t-base);
}

.benefit:hover {
  border-color: var(--border-hover);
  transform: translateY(-4px);
}

.benefit__icon {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: var(--radius-md);
  background: rgba(0, 240, 255, 0.08);
  border: 1px solid rgba(0, 240, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--neon-cyan);
}

.benefit__icon svg {
  width: 28px;
  height: 28px;
}

.benefit__content {
  flex: 1;
}

.benefit__title {
  font-size: 18px;
  margin-bottom: 6px;
}

.benefit__desc {
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.6;
}
```

- [ ] **Step 2: Добавить данные и рендер в script.js**

Добавить в `script.js` после массива `CLUBS`:

```js
const BENEFITS = [
  {
    title: "Онлайн-бронирование",
    desc: "Не нужно звонить и держать место. Бронь подтверждается мгновенно.",
    icon: `<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="5" width="22" height="20" rx="3"/>
      <path d="M3 11 H25"/>
      <path d="M9 2 V8 M19 2 V8"/>
      <path d="M9 17 L13 21 L21 13" stroke="currentColor"/>
    </svg>`,
  },
  {
    title: "Оплата картой",
    desc: "Visa, Mastercard, Kaspi. Без наличных и предоплаты администратору.",
    icon: `<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="6" width="24" height="16" rx="3"/>
      <path d="M2 11 H26"/>
      <path d="M6 17 H10 M14 17 H18"/>
    </svg>`,
  },
  {
    title: "Проверенные клубы",
    desc: "Все клубы прошли модерацию. Реальные отзывы, реальные рейтинги.",
    icon: `<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2 L4 6 V14 C4 20 14 26 14 26 C14 26 24 20 24 14 V6 Z"/>
      <path d="M9 14 L13 18 L19 11"/>
    </svg>`,
  },
  {
    title: "Бонусная программа",
    desc: "Кэшбек 5% часами за каждое посещение. Бонусы не сгорают.",
    icon: `<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="14" cy="14" r="11"/>
      <path d="M14 7 L16 12 L22 12 L17 15 L19 21 L14 17 L9 21 L11 15 L6 12 L12 12 Z" fill="currentColor" stroke="none"/>
    </svg>`,
  },
];

function renderBenefits() {
  const root = document.getElementById("benefits-grid");
  if (!root) return;
  root.innerHTML = BENEFITS.map(
    (b) => `
    <div class="benefit">
      <div class="benefit__icon">${b.icon}</div>
      <div class="benefit__content">
        <h3 class="benefit__title">${b.title}</h3>
        <p class="benefit__desc">${b.desc}</p>
      </div>
    </div>
  `
  ).join("");
}
```

Заменить `DOMContentLoaded`-блок:

```js
document.addEventListener("DOMContentLoaded", () => {
  renderSteps();
  renderClubs();
  renderBenefits();
});
```

- [ ] **Step 3: Verify**

Reload. Expected:
- Секция «Почему ALMATY.GG»
- 4 карточки в сетке 2×2
- Слева в каждой — cyan SVG-иконка в квадратном бэйдже
- Справа — заголовок + описание
- Hover: подъём + cyan border

- [ ] **Step 4: Commit**

```bash
git add styles.css script.js
git commit -m "feat: build benefits section with 4 feature cards"
```

---

## Task 9: Final CTA & Footer

**Files:**
- Modify: `C:\ClaudeCode\styles.css` (стили в конец)

- [ ] **Step 1: Добавить стили cta + footer в styles.css**

```css
/* ============================================
   CTA (final)
   ============================================ */
.cta {
  background:
    radial-gradient(ellipse 60% 80% at 50% 50%, rgba(0, 240, 255, 0.15), transparent 70%),
    var(--bg-base);
}

.cta__inner {
  text-align: center;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 64px 32px;
  position: relative;
  overflow: hidden;
  max-width: 900px;
}

.cta__inner::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 40% at 20% 0%, rgba(0, 240, 255, 0.12), transparent 60%),
    radial-gradient(ellipse 60% 40% at 80% 100%, rgba(255, 46, 154, 0.12), transparent 60%);
  pointer-events: none;
}

.cta__title {
  font-size: clamp(28px, 4vw, 44px);
  margin-bottom: 12px;
  position: relative;
}

.cta__subtitle {
  color: var(--text-secondary);
  font-size: 18px;
  margin-bottom: 32px;
  position: relative;
}

.cta .btn {
  position: relative;
}

/* ============================================
   FOOTER
   ============================================ */
.footer {
  background: var(--bg-surface);
  border-top: 1px solid var(--border);
  padding: 56px 0 32px;
}

.footer__inner {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr;
  gap: 48px;
}

.footer__col .logo {
  margin-bottom: 16px;
}

.footer__desc {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 24px;
  max-width: 320px;
}

.footer__copy {
  color: var(--text-muted);
  font-size: 13px;
}

.footer__title {
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 16px;
  color: var(--text-secondary);
}

.footer__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.footer__list a {
  color: var(--text-secondary);
  font-size: 14px;
}

.footer__list a:hover {
  color: var(--neon-cyan);
}

.footer__social {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.footer__social-link {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-elevated);
  border: 1px solid var(--border-soft);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  transition: all var(--t-base);
}

.footer__social-link:hover {
  border-color: var(--neon-cyan);
  color: var(--neon-cyan);
  box-shadow: var(--glow-cyan);
}
```

- [ ] **Step 2: Verify**

Reload. Expected:
- CTA-блок: тёмная панель с cyan-glow по бокам, крупный заголовок «Готов играть?», кнопка «Найти клуб» (большая, primary)
- Footer: 3 колонки (бренд + описание / навигация / контакты + соцсети)
- Соцсети — круглые бэйджи IG/TG/TT с hover-glow

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "feat: add final CTA and footer sections"
```

---

## Task 10: JS — Header scroll, Smooth Scroll, Time Select Population

Поведение хедера при скролле, заполнение select'а времени, плавный скролл по якорям (уже работает через CSS, но добавим компенсацию sticky-хедера).

**Files:**
- Modify: `C:\ClaudeCode\script.js`

- [ ] **Step 1: Добавить функции в script.js перед `DOMContentLoaded`**

```js
// ---------- Header scroll behavior ----------
function setupHeaderScroll() {
  const header = document.getElementById("header");
  if (!header) return;
  const onScroll = () => {
    if (window.scrollY > 50) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

// ---------- Time select population ----------
function setupTimeSelect() {
  const select = document.getElementById("time-select");
  if (!select) return;
  const options = ['<option value="">Любое</option>'];
  for (let h = 0; h < 24; h++) {
    const value = `${String(h).padStart(2, "0")}:00`;
    options.push(`<option value="${value}">${value}</option>`);
  }
  select.innerHTML = options.join("");
}

// ---------- Date input default ----------
function setupDateDefault() {
  const input = document.querySelector('input[name="date"]');
  if (!input) return;
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  input.value = `${yyyy}-${mm}-${dd}`;
  input.min = `${yyyy}-${mm}-${dd}`;
}
```

- [ ] **Step 2: Обновить `DOMContentLoaded` блок**

Заменить на:

```js
document.addEventListener("DOMContentLoaded", () => {
  renderSteps();
  renderClubs();
  renderBenefits();
  setupHeaderScroll();
  setupTimeSelect();
  setupDateDefault();
});
```

- [ ] **Step 3: Verify**

Reload. Expected:
- При прокрутке вниз хедер получает тёмный фон с blur + cyan-разделитель снизу
- В select «Время» появились варианты «Любое, 00:00, 01:00, …, 23:00»
- Поле «Дата» автоматически заполнено сегодняшним числом
- Клик по nav-ссылке плавно скроллит к секции (smooth-scroll работает через CSS `html { scroll-behavior: smooth }`)

- [ ] **Step 4: Add scroll offset for sticky header in CSS**

Добавить в `styles.css` (в конец секции `:root` или сразу после неё):

```css
section[id] {
  scroll-margin-top: 80px;
}
```

(Это компенсирует фиксированный хедер при якорной прокрутке.)

- [ ] **Step 5: Verify scroll offset**

Reload, кликнуть «Клубы» в навигации. Expected: секция доскролливается не под хедер, а ниже него.

- [ ] **Step 6: Commit**

```bash
git add script.js styles.css
git commit -m "feat: add header scroll behavior, time select and date default"
```

---

## Task 11: JS — Mobile Menu Toggle

Гамбургер открывает/закрывает навигацию на мобильных. Логика toggle + блокировка скролла body.

**Files:**
- Modify: `C:\ClaudeCode\script.js`
- Modify: `C:\ClaudeCode\styles.css`

- [ ] **Step 1: Добавить функцию `setupMobileMenu` в script.js**

Добавить перед `DOMContentLoaded`:

```js
// ---------- Mobile menu ----------
function setupMobileMenu() {
  const hamburger = document.getElementById("hamburger");
  const nav = document.getElementById("nav");
  if (!hamburger || !nav) return;

  const close = () => {
    document.body.classList.remove("menu-open");
  };

  hamburger.addEventListener("click", () => {
    document.body.classList.toggle("menu-open");
  });

  nav.addEventListener("click", (e) => {
    if (e.target.matches(".nav__link")) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}
```

- [ ] **Step 2: Обновить `DOMContentLoaded` блок**

```js
document.addEventListener("DOMContentLoaded", () => {
  renderSteps();
  renderClubs();
  renderBenefits();
  setupHeaderScroll();
  setupTimeSelect();
  setupDateDefault();
  setupMobileMenu();
});
```

- [ ] **Step 3: Добавить стили мобильного меню в styles.css**

В конец `styles.css`:

```css
/* ============================================
   MOBILE MENU
   ============================================ */
body.menu-open {
  overflow: hidden;
}
```

(Основные responsive-стили для меню добавим в Task 13.)

- [ ] **Step 4: Verify (desktop)**

Reload. На десктопе кнопка гамбургера всё ещё скрыта (display: none из Task 4). Никакого визуального изменения. Меню заработает на мобильном после Task 13.

- [ ] **Step 5: Commit**

```bash
git add script.js styles.css
git commit -m "feat: add mobile menu toggle logic with body scroll lock"
```

---

## Task 12: Modal System + Search Form + Booking

Универсальная модалка, обработка submit поисковой формы и клика «Забронировать».

**Files:**
- Modify: `C:\ClaudeCode\script.js`
- Modify: `C:\ClaudeCode\styles.css`

- [ ] **Step 1: Добавить стили модалки в styles.css (в конец)**

```css
/* ============================================
   MODAL
   ============================================ */
.modal[hidden] {
  display: none;
}

.modal {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: modal-in 250ms ease;
}

@keyframes modal-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.modal__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(5, 5, 10, 0.75);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.modal__panel {
  position: relative;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 32px;
  max-width: 480px;
  width: 100%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), var(--glow-cyan);
  animation: panel-in 300ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes panel-in {
  from { opacity: 0; transform: translateY(20px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.modal__close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 16px;
  transition: all var(--t-fast);
}

.modal__close:hover {
  background: var(--bg-elevated);
  color: var(--neon-cyan);
}

.modal__title {
  font-size: 22px;
  margin-bottom: 12px;
  padding-right: 32px;
}

.modal__body {
  color: var(--text-secondary);
  line-height: 1.6;
}

.modal__body strong {
  color: var(--text-primary);
  font-weight: 600;
}

.modal__body .modal__highlight {
  display: inline-block;
  padding: 2px 8px;
  background: rgba(0, 240, 255, 0.1);
  border: 1px solid rgba(0, 240, 255, 0.2);
  border-radius: 6px;
  font-family: "JetBrains Mono", monospace;
  font-size: 13px;
  color: var(--neon-cyan);
  margin: 0 2px;
}

.modal__qr {
  margin: 20px 0;
  padding: 16px;
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  border: 1px dashed var(--border);
  text-align: center;
  font-family: "JetBrains Mono", monospace;
  font-size: 13px;
  color: var(--text-muted);
}
```

- [ ] **Step 2: Добавить логику модалки и обработчики в script.js**

Добавить перед `DOMContentLoaded`:

```js
// ---------- Modal ----------
function openModal({ title, body }) {
  const modal = document.getElementById("modal");
  const titleEl = document.getElementById("modal-title");
  const bodyEl = document.getElementById("modal-body");
  if (!modal || !titleEl || !bodyEl) return;
  titleEl.textContent = title;
  bodyEl.innerHTML = body;
  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeModal() {
  const modal = document.getElementById("modal");
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
}

function setupModal() {
  const modal = document.getElementById("modal");
  if (!modal) return;

  modal.addEventListener("click", (e) => {
    if (e.target.hasAttribute("data-modal-close")) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });
}

// ---------- Search form ----------
const DISTRICT_LABELS = {
  "": "всех районах",
  almalinsky: "Алмалинском",
  bostandyk: "Бостандыкском",
  medeu: "Медеуском",
  auezov: "Ауэзовском",
};

function setupSearchForm() {
  const form = document.getElementById("search-form");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const district = data.get("district") || "";
    const date = data.get("date") || "—";
    const time = data.get("time") || "любое время";

    const districtLabel = DISTRICT_LABELS[district] ?? "всех районах";
    const dateLabel = date && date !== "—"
      ? new Date(date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
      : "—";

    const count = Math.floor(3 + Math.random() * 9);

    openModal({
      title: `Найдено ${count} клубов`,
      body: `
        <p>В <strong>${districtLabel}</strong> на <span class="modal__highlight">${dateLabel}</span> в <span class="modal__highlight">${time}</span>.</p>
        <p style="margin-top:12px">Это демо-версия лендинга. В полной версии здесь будет список доступных слотов с возможностью бронирования.</p>
      `,
    });
  });
}

// ---------- Booking ----------
function setupBookingButtons() {
  const grid = document.getElementById("clubs-grid");
  if (!grid) return;
  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-book]");
    if (!btn) return;
    const clubName = btn.getAttribute("data-book");
    const club = CLUBS.find((c) => c.name === clubName);
    if (!club) return;

    openModal({
      title: `Бронирование — ${club.name}`,
      body: `
        <p><strong>${club.name}</strong> · ${club.district} · ${club.distance}</p>
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

- [ ] **Step 3: Обновить `DOMContentLoaded`**

```js
document.addEventListener("DOMContentLoaded", () => {
  renderSteps();
  renderClubs();
  renderBenefits();
  setupHeaderScroll();
  setupTimeSelect();
  setupDateDefault();
  setupMobileMenu();
  setupModal();
  setupSearchForm();
  setupBookingButtons();
});
```

- [ ] **Step 4: Verify**

Reload. Expected:
- Заполнить поисковую форму и нажать «Найти клуб» → открывается модалка «Найдено N клубов в [Район] на [Дата] в [Время]»
- Клик по «Забронировать» в карточке клуба → модалка «Бронирование — [Клуб]» с ценой и моком QR
- Закрытие модалки: крестик, клик по backdrop, Esc
- Модалка появляется плавно (fade + scale)

- [ ] **Step 5: Commit**

```bash
git add script.js styles.css
git commit -m "feat: add modal system, search form submit and booking flow"
```

---

## Task 13: Responsive — Tablet & Mobile

Media queries для tablet (≤1024) и mobile (≤768).

**Files:**
- Modify: `C:\ClaudeCode\styles.css` (в конец)

- [ ] **Step 1: Добавить media queries в styles.css**

```css
/* ============================================
   RESPONSIVE — Tablet (≤1024)
   ============================================ */
@media (max-width: 1024px) {
  section {
    padding: 72px 0;
  }

  .clubs__grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .footer__inner {
    grid-template-columns: 1fr 1fr;
    gap: 32px;
  }

  .footer__col:first-child {
    grid-column: 1 / -1;
  }

  .hero__stats {
    gap: 40px;
  }
}

/* ============================================
   RESPONSIVE — Mobile (≤768)
   ============================================ */
@media (max-width: 768px) {
  :root {
    --container-pad: 16px;
  }

  section {
    padding: 56px 0;
  }

  /* Header mobile */
  .hamburger {
    display: inline-flex;
  }

  .header__actions .btn--ghost {
    display: none;
  }

  .nav {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(280px, 80vw);
    background: var(--bg-surface);
    border-left: 1px solid var(--border);
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: 0;
    padding: 88px 24px 24px;
    transform: translateX(100%);
    transition: transform var(--t-base);
    z-index: 90;
  }

  body.menu-open .nav {
    transform: translateX(0);
    box-shadow: -20px 0 60px rgba(0, 0, 0, 0.5);
  }

  .nav__link {
    padding: 14px 0;
    font-size: 17px;
    border-bottom: 1px solid var(--border-soft);
  }

  .nav__link::after { display: none; }

  /* Hero */
  .hero {
    min-height: auto;
    padding-top: 120px;
    padding-bottom: 56px;
  }

  .hero__title {
    margin-bottom: 16px;
  }

  .hero__subtitle {
    margin-bottom: 32px;
  }

  .search {
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 14px;
  }

  .search__submit {
    height: auto;
    padding: 14px;
  }

  .hero__stats {
    gap: 24px;
  }

  .stat__value {
    font-size: 22px;
  }

  /* How */
  .how__steps {
    grid-template-columns: 1fr;
    gap: 32px;
  }

  /* Clubs */
  .clubs__grid {
    grid-template-columns: 1fr;
  }

  /* Benefits */
  .benefits__grid {
    grid-template-columns: 1fr;
  }

  .benefit {
    padding: 22px;
    gap: 16px;
  }

  /* CTA */
  .cta__inner {
    padding: 40px 24px;
  }

  /* Footer */
  .footer {
    padding: 40px 0 24px;
  }

  .footer__inner {
    grid-template-columns: 1fr;
    gap: 32px;
  }

  /* Modal */
  .modal__panel {
    padding: 24px;
  }
}

/* ============================================
   RESPONSIVE — Small phones (≤480)
   ============================================ */
@media (max-width: 480px) {
  .section__subtitle {
    margin-bottom: 32px;
  }

  .club-card__media {
    aspect-ratio: 16 / 8;
  }

  .club-card__initial {
    font-size: 56px;
  }

  .hero__stats {
    flex-direction: column;
    align-items: center;
  }
}
```

- [ ] **Step 2: Verify — Desktop**

Reload в обычном окне. Expected: ничего не изменилось (≥1025px).

- [ ] **Step 3: Verify — Tablet (768–1024)**

DevTools (F12) → Toggle device toolbar → ширина 900px. Expected:
- Клубы в 2 колонки
- Footer в 2 колонки (бренд занимает всю ширину)
- Кнопка «Войти» ещё видна

- [ ] **Step 4: Verify — Mobile (≤768)**

DevTools → ширина 375px (iPhone SE). Expected:
- Гамбургер виден в хедере (кнопка «Войти» скрыта)
- Клик по гамбургеру → выезжает боковое меню справа, гамбургер превращается в крестик
- Клик по nav-ссылке закрывает меню
- Hero: поисковая форма в одну колонку
- Шаги, клубы, преимущества — все стэками
- Footer в одну колонку

- [ ] **Step 5: Commit**

```bash
git add styles.css
git commit -m "feat: add responsive styles for tablet and mobile breakpoints"
```

---

## Task 14: Glitch Animation Trigger + Polish

Запуск glitch-эффекта на heading и пара дополнительных штрихов.

**Files:**
- Modify: `C:\ClaudeCode\script.js`

- [ ] **Step 1: Добавить функцию `setupGlitch` в script.js**

Перед `DOMContentLoaded`:

```js
// ---------- Glitch animation ----------
function setupGlitch() {
  const target = document.querySelector(".glitch");
  if (!target) return;

  const trigger = () => {
    target.classList.add("is-glitching");
    setTimeout(() => target.classList.remove("is-glitching"), 600);
  };

  // первый запуск через 500мс после load
  setTimeout(trigger, 500);

  // повторять каждые 7-12 секунд (случайно)
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

- [ ] **Step 2: Обновить `DOMContentLoaded`**

```js
document.addEventListener("DOMContentLoaded", () => {
  renderSteps();
  renderClubs();
  renderBenefits();
  setupHeaderScroll();
  setupTimeSelect();
  setupDateDefault();
  setupMobileMenu();
  setupModal();
  setupSearchForm();
  setupBookingButtons();
  setupGlitch();
});
```

- [ ] **Step 3: Verify**

Reload. Expected:
- Через ~0.5 сек после загрузки слова «30 секунд» в заголовке кратко glitch-аются (RGB-смещение)
- Через 7-12 секунд эффект повторяется

- [ ] **Step 4: Commit**

```bash
git add script.js
git commit -m "feat: trigger glitch animation on hero title with random loop"
```

---

## Task 15: Final QA & Verification

Финальная ручная проверка всех сценариев.

- [ ] **Step 1: Desktop QA (1440px)**

Открыть `index.html` в браузере, ширина окна ~1440px. Проверить:
- [ ] Хедер прозрачный в hero, при скролле получает blur + cyan border снизу
- [ ] Логотип `ALMATY.GG` с cyan glow на `.GG`
- [ ] Nav-ссылки с hover-подчёркиванием
- [ ] Hero: glitch на «30 секунд» один раз через 0.5с
- [ ] Search form: все 4 поля заполняются, кнопка работает → модалка
- [ ] 3 шага: hover приподнимает карточку
- [ ] 6 клубов: hover-glow, клик «Забронировать» → модалка
- [ ] 4 benefit-карточки: hover-эффект
- [ ] CTA-блок с двойным glow
- [ ] Footer: 3 колонки, hover на ссылках и соцсетях
- [ ] Модалка: открывается с анимацией, закрывается на Esc / backdrop / X

- [ ] **Step 2: Tablet QA (768–1024)**

DevTools → 900px. Проверить:
- [ ] Клубы в 2 колонки
- [ ] Footer в 2 колонки

- [ ] **Step 3: Mobile QA (375px)**

DevTools → 375px (iPhone SE). Проверить:
- [ ] Гамбургер открывает sidebar-меню
- [ ] Меню закрывается по клику на ссылку или Esc
- [ ] Search-форма в одну колонку
- [ ] Все секции читабельны, нет горизонтального скролла

- [ ] **Step 4: Accessibility check**

- [ ] Tab проходит по всем интерактивам в логическом порядке
- [ ] Focus visible на кнопках и ссылках (cyan outline)
- [ ] Esc закрывает модалку
- [ ] В консоли нет ошибок и предупреждений

- [ ] **Step 5: Performance check**

DevTools → Network → Reload. Expected:
- [ ] index.html, styles.css, script.js загружаются с 200
- [ ] Google Fonts загружаются
- [ ] Total page size < 200 KB (без шрифтов)
- [ ] Нет 404 ошибок

- [ ] **Step 6: Final commit (если были фиксы) и summary**

Если что-то правили во время QA:

```bash
git add -A
git commit -m "fix: address QA findings"
```

Иначе — проверить статус:

```bash
git status
git log --oneline
```

Expected: чистая рабочая копия, цепочка коммитов от scaffold до final.

---

## Self-Review

**Spec coverage:**
- ✅ Header sticky → Task 4 + Task 10 (scroll behavior)
- ✅ Hero + поисковая форма → Task 5 + Task 10 (date/time)
- ✅ Как это работает (3 шага) → Task 6
- ✅ Популярные клубы (6 cards) → Task 7
- ✅ Преимущества (4 cards) → Task 8
- ✅ Финальный CTA → Task 9
- ✅ Footer → Task 9
- ✅ Mock-данные клубов из спека → Task 7 (имена, районы, цены, рейтинги совпадают)
- ✅ Cyberpunk-палитра и токены → Task 3
- ✅ Шрифты Inter + JetBrains Mono → Task 2 (link) + Task 3
- ✅ Glow на CTA → Task 3
- ✅ Фоновая сетка + scanline → Task 5
- ✅ Glitch на H1 → Task 5 (CSS) + Task 14 (JS trigger)
- ✅ Hover-эффекты на карточках → Tasks 6, 7, 8
- ✅ Smooth scroll → Task 3 (CSS) + Task 10 (scroll-margin-top)
- ✅ Mobile menu → Task 11 (JS) + Task 13 (CSS)
- ✅ Поисковая форма submit → Task 12
- ✅ Модалки → Task 12
- ✅ Бронирование клик → Task 12
- ✅ Header scroll-state → Task 10
- ✅ Брейкпоинты 768/1024 → Task 13
- ✅ a11y: lang="ru", focus-стейты, Esc, aria-labels → Tasks 2, 3, 11, 12
- ✅ Out-of-scope items не попали в план

**Placeholder scan:** все шаги содержат конкретный код, нет TBD/TODO/«implement later».

**Type/name consistency:**
- `STEPS`, `CLUBS`, `BENEFITS` — массивы данных, имена консистентны
- `renderSteps`, `renderClubs`, `renderBenefits` — рендереры
- `setupHeaderScroll`, `setupMobileMenu`, `setupModal`, `setupSearchForm`, `setupBookingButtons`, `setupGlitch`, `setupTimeSelect`, `setupDateDefault` — все вызываются в `DOMContentLoaded`
- CSS-классы: `.club-card`, `.step`, `.benefit`, `.modal`, `.search`, `.hero`, `.btn`, `.btn--primary`, `.btn--ghost`, `.btn--large` — используются согласованно в HTML, CSS и JS
- `data-book`, `data-modal-close` — атрибуты совпадают между HTML (Task 2) и JS (Task 12)
- ID-якоря в HTML (#hero, #how, #clubs, #benefits, #for-clubs) совпадают с nav-ссылками

**Готов к исполнению.**
