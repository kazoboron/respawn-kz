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

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  renderSteps();
  renderClubs();
});
