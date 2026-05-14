# respawn.kz — Многостраничный сайт-каталог (Уровень 2)

**Дата:** 2026-05-15
**Тип:** Дизайн-спецификация миграции и расширения
**Стек:** Astro (SSG) + TypeScript + vanilla CSS + клиентский vanilla TS
**Локализация:** Русский (только)

## Контекст

Существует одностраничный лендинг respawn.kz (Уровень 1, реализован 2026-05-14):
3 файла (`index.html`, `styles.css`, `script.js`) в корне проекта, дизайн в стиле
cyberpunk/gaming, секции hero / how-it-works / clubs / benefits / cta / footer,
поисковая форма с геолокацией по 10 городам Казахстана.

Этот документ описывает миграцию на **Astro SSG** и расширение до **многостраничного
сайта-каталога** с 5 страницами и переиспользуемыми компонентами.

Полное приложение с аутентификацией, БД, реальной оплатой (Уровень 3) — вне скоупа.

## Цели

1. Сайт работает как полноценный каталог: пользователь может изучать список клубов,
   фильтровать, открывать страницу каждого клуба
2. Владелец клуба может найти страницу `/for-clubs` и оставить заявку
3. Архитектура готова к расширению: добавление новой страницы не требует копипаста
4. Дизайн и интерактив существующего лендинга сохранены 1:1 после миграции
5. Сайт собирается в статические HTML и деплоится на любой статический хостинг

## Целевая аудитория

- **Игроки/геймеры** Казахстана 16–30 лет — основной B2C-трафик на `/`, `/clubs`,
  `/clubs/[slug]`
- **Владельцы компьютерных клубов** — целевой трафик на `/for-clubs`
- **Инвесторы / партнёры** — `/about`

## Технические решения

| Решение | Выбор | Причина |
|---------|-------|---------|
| Стек | **Astro** | Компонентная модель, генерит статику, минимум JS на клиенте, лёгкий деплой |
| Локализация | RU только | YAGNI: KK/EN добавим, когда появятся реальные пользователи. Astro имеет встроенный i18n |
| Подход к миграции | **Полная компонентизация** (B) | Иначе теряется смысл Astro |
| URL для страниц клубов | `/clubs/[slug]` через `getStaticPaths` | Чистые URL, генерятся на билде из data-файла |
| Стили | Один `global.css` (текущий styles.css + новое) | YAGNI: разнесём на модули, когда файл реально разрастётся |
| Скрипты | `src/scripts/*.ts`, импортируются в нужных страницах | Tree-shaking, не льём всё на каждую страницу |

## Архитектура

### Файловая структура

```
C:\ClaudeCode\
├── package.json              # astro, @astrojs/check, typescript
├── astro.config.mjs          # site: 'https://respawn.kz', output: 'static'
├── tsconfig.json             # extends astro/tsconfigs/strict
├── public/
│   └── favicon.svg           # cyan-glow логотип
├── src/
│   ├── layouts/
│   │   └── BaseLayout.astro       # <html>, <head>, fonts, Header, <slot/>, Footer, Modal root
│   ├── components/
│   │   ├── Header.astro           # лого, nav, hamburger, login (props: activeRoute)
│   │   ├── Footer.astro           # 3 колонки, соцсети, copyright
│   │   ├── SearchForm.astro       # город+дата+время+гео-кнопка (props: variant)
│   │   ├── ClubCard.astro         # одна карточка (props: club: Club)
│   │   ├── HeroStats.astro        # 3 стата
│   │   ├── HowItWorks.astro       # 3 шага
│   │   ├── Benefits.astro         # 4 преимущества
│   │   ├── FAQ.astro              # аккордеон (props: items: FAQItem[])
│   │   └── Modal.astro            # шаблон модалки
│   ├── data/
│   │   ├── cities.ts              # CITIES + CITY_LABELS (текущие 10)
│   │   ├── clubs.ts               # 12 клубов с расширенными полями
│   │   └── content.ts             # FAQ, бенефиты для клубов, тексты
│   ├── scripts/
│   │   ├── geolocation.ts         # haversine + closest city
│   │   ├── modal.ts               # open/close, Esc/backdrop
│   │   ├── menu.ts                # hamburger toggle
│   │   ├── search.ts              # submit формы поиска
│   │   ├── booking.ts             # клик «Забронировать»
│   │   ├── glitch.ts              # анимация H1
│   │   ├── filters.ts             # фильтры на /clubs
│   │   └── header-scroll.ts       # sticky header behavior
│   ├── styles/
│   │   └── global.css             # все стили из текущего styles.css + расширения
│   └── pages/
│       ├── index.astro            # лендинг (мигрирован)
│       ├── clubs/
│       │   ├── index.astro        # каталог
│       │   └── [slug].astro       # страница клуба
│       ├── for-clubs.astro
│       └── about.astro
├── _legacy/                       # старые index.html/styles.css/script.js
│                                  # сохраняются на время миграции, удаляются после verify
├── .claude/
│   └── launch.json                # обновить: команда "npm run dev", port 4321
└── docs/superpowers/
    ├── specs/
    │   ├── 2026-05-14-almaty-gg-landing-design.md (существует)
    │   └── 2026-05-15-respawn-kz-catalog-design.md (этот файл)
    └── plans/
        └── 2026-05-15-respawn-kz-catalog.md (создаст writing-plans)
```

### Routing

| URL | Файл | Источник |
|-----|------|----------|
| `/` | `pages/index.astro` | Все компоненты + `clubs.ts` (топ-6) |
| `/clubs/` | `pages/clubs/index.astro` | `clubs.ts` (все 12) |
| `/clubs/[slug]/` | `pages/clubs/[slug].astro` | `getStaticPaths()` из `clubs.ts`, генерит 12 страниц |
| `/for-clubs/` | `pages/for-clubs.astro` | `content.ts` |
| `/about/` | `pages/about.astro` | `content.ts` |

`trailingSlash: 'always'` в `astro.config.mjs` — стабильнее для статического хостинга.

### Data model

**`src/data/cities.ts`** — без изменений по структуре, тот же массив:

```ts
export interface City {
  id: string;
  label: string;
  lat: number;
  lon: number;
}
export const CITIES: City[] = [/* 10 городов с координатами */];
export const CITY_LABELS: Record<string, string> =
  Object.fromEntries(CITIES.map(c => [c.id, c.label]));
```

**`src/data/clubs.ts`** — расширенная схема:

```ts
export interface Club {
  slug: string;             // URL: 'cyberzone' → /clubs/cyberzone/
  name: string;
  initial: string;
  gradient: string;          // CSS gradient для media-плейсхолдера
  city: string;              // city id
  district: string;
  address: string;           // mock адрес
  phone: string;             // mock телефон
  hours: string;             // 'Круглосуточно' | '10:00–02:00'
  rating: number;
  reviews: number;
  price: number;             // от X ₸/час
  tags: string[];            // ['PC', 'PS5', 'VR', 'Sim Racing']
  description: string;       // 2-3 абзаца для detail page
  equipment: string[];       // ['RTX 4080', 'Razer DeathAdder', '240Hz', ...]
  galleryGradients: string[];// 4 градиента для placeholder галереи
}
export const CLUBS: Club[] = [/* 12 клубов */];
```

**12 клубов** — 1-2 в каждом городе. Полный список в Appendix A в конце документа.

**`src/data/content.ts`** — FAQ-вопросы для лендинга, value props для /for-clubs,
текст миссии для /about.

### Build / dev workflow

- `npm install` — один раз
- `npm run dev` — Astro dev server на `http://localhost:4321` с HMR
- `npm run build` — генерит `dist/` со всеми статическими HTML
- `npm run preview` — локальный предпросмотр build

`.claude/launch.json` обновляется: `runtimeExecutable: "npm"`, `runtimeArgs: ["run", "dev"]`,
`port: 4321`.

### Прерeqвизит

Node.js версии 18+. Если не установлен — проверяется в Task 1 плана и блокирует
выполнение до установки.

## Содержимое страниц

### `/` — Лендинг (мигрированный)

Идентичный текущему по структуре + **новая секция FAQ** перед финальным CTA.
7 вопросов: как платить, можно ли отменить, что если опоздаешь, безопасно ли,
как стать партнёром, есть ли возврат, поддержка.

После миграции HTML/CSS/JS-результат должен быть визуально идентичен текущему лендингу
(плюс FAQ).

### `/clubs/` — Каталог

- Header с активным пунктом «Клубы»
- Breadcrumb «Главная / Клубы»
- Page hero: `<h1>Клубы Казахстана</h1>`, подзаголовок, реактивный счётчик «Найдено N клубов»
- Filter bar:
  - **City** select (все 10 городов + «Все города») с кнопкой «📍 Мой город»
  - **Цена** — 3 чипа: «до 800 ₸» / «800–1200 ₸» / «1200+ ₸» (multi-toggle)
  - **Оборудование** — 4 чекбокса: PC / PS5 / VR / Sim Racing
  - **Сортировка** — select: «По рейтингу» / «Цена ↑» / «Цена ↓»
  - Кнопка «Сбросить фильтры» (видна когда хоть один фильтр активен)
- На мобиле filter bar схлопывается в кнопку «Фильтры (N)» → выезжающий drawer
- Grid карточек ClubCard, реактивно обновляется при смене фильтров (vanilla TS, без фреймворка)
- Empty state: «Ничего не нашлось — попробуй сбросить фильтры»
- Footer

Состояние фильтров живёт в URL query string (`?city=almaty&tags=PC,VR&sort=rating`).
Это даёт shareable-ссылки и работающую кнопку «назад».

### `/clubs/[slug]/` — Страница клуба

12 страниц генерятся через `getStaticPaths()`. Если slug неизвестен — Astro вернёт 404.

- Header с активным пунктом «Клубы»
- Breadcrumb «Главная / Клубы / [Название]»
- **Hero**:
  - `<h1>` с названием клуба (моно-шрифт, крупно, glow)
  - Meta: город · район · ⭐ рейтинг (N отзывов)
  - Tags-чипы
- **Gallery**: 4 градиент-плейсхолдера в ряд (на мобиле — скролл-снап горизонтально)
- **Two-column layout** (desktop), стак (mobile):
  - **Left (2/3)**:
    - Описание (2-3 абзаца)
    - Заголовок «Что у нас есть» + список оборудования
    - Часы работы
    - Адрес
  - **Right (1/3, sticky)**:
    - Pricing card: «От [X] ₸/час»
    - Кнопка «Забронировать слот» (primary, glow) → modal
    - Иконки оплат: Visa / Mastercard / Kaspi (mini SVG)
- **«Похожие клубы»**: 3 ClubCard'а из того же города (если меньше 3 — добиваются из всего списка по близости города)
- Footer

### `/for-clubs/` — B2B-лендинг

- Header с активным «Для клубов»
- **Hero**:
  - `<h1>Стань партнёром respawn.kz</h1>`
  - Subtitle: «Получай больше клиентов, принимай онлайн-оплаты, видь аналитику в реальном времени»
  - Кнопка «Подать заявку» → плавный скролл к якорю формы
- **Value props** (4 кирпича 2×2):
  1. 🚀 **Поток клиентов** — «Тысячи геймеров видят твой клуб первыми в поиске по городу»
  2. 💳 **Онлайн-оплаты** — «Без терминалов и кассы. Деньги выводятся на счёт ИП/ТОО»
  3. 📊 **Аналитика** — «Заполняемость, выручка, повторные клиенты — всё в дашборде»
  4. 📣 **Маркетинг** — «Промо-акции, push-уведомления игрокам, рейтинговая система»
- **«Как это работает» (для клубов)** — 3 шага: подать заявку → подключение за 1 день → начни получать брони
- **Pricing** (один тариф):
  - «Без абонплаты. Комиссия 7% только с реальных броней»
  - «Подключение, обучение и поддержка — бесплатно»
- **Application form**:
  - Название клуба (text, required)
  - Город (select из CITIES, required)
  - Имя контакта (text, required)
  - Телефон или email (text, required)
  - Сообщение (textarea, optional)
  - Submit → modal «Заявка принята, мы свяжемся в течение дня» (демо, ничего никуда не отправляется)
- Footer

### `/about/` — О проекте

- Header с активным «О нас»
- **Hero**: H1 «Объединяем компьютерные клубы Казахстана» + краткое intro (1 абзац)
- **Миссия**: 2-3 абзаца о проблеме и решении
- **HeroStats**: тот же компонент, 12 000+ игроков · 80+ клубов · 10 городов
- **Two columns**:
  - «Для игроков» — короткий блок + кнопка «Найти клуб» → `/`
  - «Для клубов» — короткий блок + кнопка «Стать партнёром» → `/for-clubs/`
- **Контакты**: email, телефон, соцсети (IG/TG/TT), адрес офиса (mock)
- Footer

## Компоненты

### Header.astro
Props: `activeRoute?: 'index' | 'clubs' | 'for-clubs' | 'about'`. Подсветка активного nav-пункта.

### Footer.astro
Без пропсов. 3 колонки, идентично текущему. Nav-ссылки ведут на реальные страницы (`/clubs/`, `/for-clubs/`).

### SearchForm.astro
Props: `variant: 'hero' | 'compact'`. На лендинге — hero (большая, с stats после). На /clubs — compact (только поля, без декора). Геолокация и кнопка «Мой город» в обоих вариантах.

### ClubCard.astro
Props: `club: Club`. Плюс `compact?: boolean` (опционально, для «похожих клубов» — без gallery, более узкая).

### Modal.astro
Один модальный root в BaseLayout. Контент устанавливается из JS через `openModal({ title, body })`.

### FAQ.astro
Props: `items: { q: string; a: string }[]`. Аккордеон, открывается по клику. Один открытый за раз.

## Логика фильтров (filters.ts)

```ts
interface Filters {
  city: string;            // '' = все
  priceTiers: string[];    // ['low', 'mid', 'high']
  tags: string[];
  sort: 'rating' | 'price-asc' | 'price-desc';
}

function applyFilters(clubs: Club[], f: Filters): Club[] {
  return clubs
    .filter(c => !f.city || c.city === f.city)
    .filter(c => !f.priceTiers.length || f.priceTiers.some(t => priceMatches(c.price, t)))
    .filter(c => !f.tags.length || f.tags.every(t => c.tags.includes(t)))
    .sort(sortFn(f.sort));
}
```

Состояние сохраняется в URL и в `localStorage` (для возврата на страницу).

## Migration strategy (4 фазы)

### Phase 1: Setup
1. Установить Node.js (если нет): проверить `node --version`. Если ≥18 — ок. Если нет — Task 1 показывает инструкцию и блокирует.
2. Перенести текущие `index.html`, `styles.css`, `script.js` в `_legacy/`
3. Создать Astro-проект через `npm create astro@latest .` (минимальный template)
4. Настроить `astro.config.mjs`, `tsconfig.json`
5. Обновить `.claude/launch.json` под Astro dev server
6. Первый запуск, проверка hello-world

### Phase 2: Migrate landing
7. `BaseLayout.astro` — head, fonts, Header, Footer, Modal root
8. `Header.astro`, `Footer.astro` — извлечь из `_legacy/index.html`
9. Перенести `_legacy/styles.css` в `src/styles/global.css` (импорт в BaseLayout)
10. Перенести данные из `_legacy/script.js` в `src/data/cities.ts`, `src/data/clubs.ts` + расширить Club-полями
11. Разрезать `_legacy/script.js` на `src/scripts/*.ts` модули
12. Извлечь компоненты: `SearchForm`, `ClubCard`, `HeroStats`, `HowItWorks`, `Benefits`
13. Собрать `pages/index.astro` из компонентов
14. Verify: страница `/` идентична legacy визуально + интерактив работает

### Phase 3: New pages
15. `FAQ.astro` компонент + добавить FAQ-секцию на лендинг
16. `pages/about.astro`
17. `pages/for-clubs.astro` + form submit handler
18. `pages/clubs/index.astro` (каталог) + `filters.ts`
19. `pages/clubs/[slug].astro` (detail page) с `getStaticPaths`

### Phase 4: Polish + verify
20. Расширить CLUBS до 12 (Appendix A)
21. Прогнать каждую страницу в preview, проверить нав, мобильные брейкпоинты, формы
22. `npm run build` → проверить `dist/` (12 страниц клубов сгенерены, есть `index.html`, `clubs/index.html`, `for-clubs/index.html`, `about/index.html`)
23. Удалить `_legacy/`
24. Обновить preview-сервер на dev mode
25. Финальный коммит

Каждая фаза = отдельный коммит (или несколько коммитов для крупных).

## Out of scope (явно НЕ делаем в Уровне 2)

- Реальная аутентификация / личный кабинет
- Реальная база данных
- Реальная оплата (Kaspi/Stripe)
- Реальная отправка форм (только модалки-заглушки)
- Локализация на казахский / английский
- Многоязычные URL `/ru/...`, `/kk/...`
- Карта Алматы / Yandex Maps embed
- Реальные фотографии клубов (только градиент-плейсхолдеры)
- Аналитика (GA4, Yandex.Metrica)
- Cookie banner
- Personal account для клубов (B2B-кабинет)
- Турниры, события, лидерборды
- Email-уведомления о бронированиях
- QR-коды реальных броней
- API endpoints
- Тесты (визуальная проверка вручную через preview)

## Acceptance criteria

После завершения всех фаз:

1. ✅ `npm run dev` стартует на 4321 без ошибок
2. ✅ Все 4 верхнеуровневые страницы открываются: `/`, `/clubs/`, `/for-clubs/`, `/about/`
3. ✅ 12 страниц клубов открываются: `/clubs/cyberzone/`, `/clubs/colizeum/`, ... (slug в URL)
4. ✅ Лендинг визуально идентичен legacy (плюс FAQ-секция)
5. ✅ Каталог фильтрует по городу/цене/тегам, сортирует, состояние в URL
6. ✅ Геолокация работает на лендинге и каталоге (та же логика)
7. ✅ Submit формы поиска → модалка
8. ✅ Submit формы заявки клуба → модалка
9. ✅ Клик «Забронировать» (на карточке или странице клуба) → модалка
10. ✅ Mobile-меню работает на всех страницах
11. ✅ Адаптив 1440 / 768 / 375 — всё корректно
12. ✅ `npm run build` генерит статику, `dist/` содержит все 16 HTML-файлов
13. ✅ В консоли нет ошибок ни на одной странице
14. ✅ `_legacy/` удалена, в корне только Astro-структура

## Дальнейшие шаги

После одобрения этого спека — `writing-plans` skill создаёт пошаговый план реализации
с разбивкой на коммиты/задачи. План будет ссылаться на этот спек.

---

## Appendix A — 12 mock-клубов

| Slug | Name | City | District | Price | Rating | Reviews | Tags |
|------|------|------|----------|-------|--------|---------|------|
| `cyberzone` | Cyberzone | almaty | Алмалинский р-н | 1200 | 4.9 | 312 | PC, PS5, VR |
| `gamerhub` | GamerHub | almaty | Бостандыкский р-н | 900 | 4.8 | 145 | PC, VR |
| `colizeum-astana` | Colizeum | astana | Есильский р-н | 1500 | 4.8 | 189 | PC, Sim Racing |
| `nexus-astana` | Nexus | astana | Сарыаркинский р-н | 1100 | 4.7 | 124 | PC, PS5 |
| `rage-arena` | RAGE Arena | shymkent | Аль-Фарабийский р-н | 1000 | 4.7 | 256 | PC, PS5 |
| `ignite` | IGNITE | karaganda | Казыбек би р-н | 800 | 4.6 | 98 | PC |
| `netgame-aktobe` | NetGame | aktobe | Центр | 600 | 4.5 | 67 | PC, PS5 |
| `playzone-taraz` | PlayZone | taraz | Центр | 700 | 4.6 | 54 | PC, PS5 |
| `respawn-pavlodar` | Respawn Café | pavlodar | Центр | 750 | 4.5 | 43 | PC |
| `epic-oskemen` | Epic | oskemen | Центр | 800 | 4.4 | 38 | PC, PS5 |
| `lobby-semey` | Lobby | semey | Центр | 700 | 4.5 | 51 | PC |
| `cyber-atyrau` | Cyber | atyrau | Центр | 900 | 4.6 | 72 | PC, PS5 |

Покрытие: Алматы 2, Астана 2, остальные 8 городов по 1.

Описания, оборудование и галерея-градиенты генерятся per-club при имплементации
(спек не дублирует длинные тексты — они в `data/clubs.ts` после реализации).
