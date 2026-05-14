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
