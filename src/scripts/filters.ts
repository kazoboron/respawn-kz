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

  function updateResetVisibility(f: Filters): void {
    const hasFilters = f.city || f.priceTiers.length || f.tags.length || f.sort !== 'rating';
    if (resetBtn) resetBtn.hidden = !hasFilters;
  }

  function render(): void {
    const f = readFilters();
    const results = applyFilters(f);
    countEl!.textContent = String(results.length);
    grid!.innerHTML = results.map(renderCard).join('');
    emptyEl!.hidden = results.length > 0;
    writeUrl(f);
    updateResetVisibility(f);
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

  render();
}
