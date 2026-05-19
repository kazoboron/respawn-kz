import { CITY_LABELS } from '../data/cities';

// Inline Club type (replaces import from deleted ../data/clubs)
interface Club {
  slug: string;
  name: string;
  city: string;
  district: string | null;
  address: string;
  phone: string | null;
  price: number;
  rating: number;
  reviews: number;
  tags: string[];
  gradient: string | null;
  initial: string | null;
  working_hours: Record<string, { open: string; close: string } | null>;
  latitude: number | null;
  longitude: number | null;
  photos?: string[];
}

export type SortMode = 'rating' | 'price-asc' | 'price-desc' | 'distance';

// User's current coords — set by setupCatalogFilters when 'distance' sort
// is picked + browser geolocation succeeds. Null means we don't know yet.
let userCoords: { lat: number; lon: number } | null = null;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function distanceFromUser(c: Club): number {
  if (!userCoords || c.latitude == null || c.longitude == null) return Infinity;
  return haversineKm(userCoords.lat, userCoords.lon, c.latitude, c.longitude);
}

export interface Filters {
  city: string;
  priceTiers: string[];
  tags: string[];
  sort: SortMode;
  query: string;
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
  if (mode === 'distance') return (a, b) => distanceFromUser(a) - distanceFromUser(b);
  return (a, b) => b.rating - a.rating;
}

function matchesQuery(club: Club, q: string): boolean {
  const needle = q.toLowerCase().trim();
  if (!needle) return true;
  const haystack = [
    club.name,
    club.district ?? '',
    club.address,
    ...club.tags,
  ].join(' ').toLowerCase();
  return haystack.includes(needle);
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
    .filter((c) => matchesQuery(c, filters.query))
    .sort(sortFn(filters.sort));
}

export function filtersToQuery(f: Filters): string {
  const params = new URLSearchParams();
  if (f.city) params.set('city', f.city);
  if (f.priceTiers.length) params.set('price', f.priceTiers.join(','));
  if (f.tags.length) params.set('tags', f.tags.join(','));
  if (f.sort !== 'rating') params.set('sort', f.sort);
  if (f.query) params.set('q', f.query);
  return params.toString();
}

export function queryToFilters(query: string): Filters {
  const params = new URLSearchParams(query);
  return {
    city: params.get('city') || '',
    priceTiers: params.get('price')?.split(',').filter(Boolean) || [],
    tags: params.get('tags')?.split(',').filter(Boolean) || [],
    sort: (params.get('sort') as SortMode) || 'rating',
    query: params.get('q') || '',
  };
}

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}

function renderCard(club: Club): string {
  const cityLabel = CITY_LABELS[club.city] ?? club.city;
  const hasPhoto = club.photos && club.photos.length > 0 && club.photos[0];
  const mediaHtml = hasPhoto
    ? `<div class="club-card__media club-card__media--photo">
         <img src="${club.photos![0]}" alt="" loading="lazy" />
         <span class="club-card__initial-overlay">${club.initial}</span>
       </div>`
    : `<div class="club-card__media" style="background: ${club.gradient};">
         <span class="club-card__initial">${club.initial}</span>
       </div>`;
  return `
    <article class="club-card" data-club="${club.slug}" data-href="/clubs/${club.slug}/" style="cursor:pointer">
      <a href="/clubs/${club.slug}/" class="club-card__media-link" tabindex="-1">
        ${mediaHtml}
      </a>
      <div class="club-card__body">
        <div class="club-card__header">
          <h2 class="club-card__name"><a href="/clubs/${club.slug}/">${club.name}</a></h2>
          <span class="pill pill--rating">★ ${club.rating}</span>
        </div>
        <div class="club-card__meta">
          <span>${cityLabel}</span>
          <span class="club-card__meta-sep">·</span>
          <span>${club.district}</span>
          <span class="club-card__meta-sep">·</span>
          <span class="club-card__reviews">${club.reviews} отзывов</span>
        </div>
        <div class="club-card__tags">
          ${club.tags.map((t) => `<span class="tag">${t}</span>`).join('')}
        </div>
        <div class="club-card__footer">
          <div class="club-card__price">
            <span class="club-card__price-from">от</span><span class="club-card__price-value">${formatPrice(club.price)} ₸</span><span class="club-card__price-unit"> /час</span>
          </div>
          <button class="btn btn--primary btn--sm" data-book="${club.slug}">Забронировать</button>
        </div>
      </div>
    </article>
  `;
}

function loadClubsFromInline(): Club[] {
  const el = document.getElementById('catalog-data');
  if (!el) return []; // Non-catalog page — silently bail. setupCatalogFilters() gates by #catalog-grid anyway.
  try {
    return JSON.parse(el.textContent ?? '[]') as Club[];
  } catch (err) {
    console.error('[filters] failed to parse #catalog-data', err);
    return [];
  }
}
// Lazy-loaded inside setupCatalogFilters so non-catalog pages don't run this on import
let CLUBS: Club[] = [];

export function setupCatalogFilters(): void {
  const grid = document.getElementById('catalog-grid');
  const countEl = document.getElementById('catalog-count');
  const emptyEl = document.getElementById('catalog-empty');
  const resetBtn = document.getElementById('catalog-reset');
  if (!grid || !countEl || !emptyEl) return;

  // Load inline data only when actually entering the catalog page
  CLUBS = loadClubsFromInline();

  const citySelect = document.getElementById('city-select') as HTMLSelectElement | null;
  const sortSelect = document.getElementById('sort-select') as HTMLSelectElement | null;
  const searchInput = document.getElementById('catalog-search') as HTMLInputElement | null;
  const priceChips = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-price-tier]'));
  const tagChecks = Array.from(document.querySelectorAll<HTMLInputElement>('[data-tag]'));

  function readFilters(): Filters {
    return {
      city: citySelect?.value || '',
      priceTiers: priceChips.filter((c) => c.classList.contains('is-active')).map((c) => c.dataset.priceTier!),
      tags: tagChecks.filter((c) => c.checked).map((c) => c.dataset.tag!),
      sort: (sortSelect?.value as SortMode) || 'rating',
      query: searchInput?.value || '',
    };
  }

  function writeUrl(f: Filters): void {
    const qs = filtersToQuery(f);
    const url = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState({}, '', url);
  }

  function updateResetVisibility(f: Filters): void {
    const hasFilters = f.city || f.priceTiers.length || f.tags.length || f.sort !== 'rating' || f.query;
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
    if (searchInput) searchInput.value = f.query;
    priceChips.forEach((c) => {
      c.classList.toggle('is-active', f.priceTiers.includes(c.dataset.priceTier!));
    });
    tagChecks.forEach((c) => {
      c.checked = f.tags.includes(c.dataset.tag!);
    });
  }

  applyFiltersToUI(queryToFilters(window.location.search.slice(1)));

  citySelect?.addEventListener('change', render);
  sortSelect?.addEventListener('change', async () => {
    // 'distance' requires browser geolocation. Request once on first selection;
    // cached `userCoords` is reused for subsequent re-renders.
    if (sortSelect.value === 'distance' && !userCoords) {
      if (!navigator.geolocation) {
        alert('Браузер не поддерживает геолокацию. Выбран сорт по рейтингу.');
        sortSelect.value = 'rating';
      } else {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 60_000 });
          });
          userCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        } catch {
          alert('Не удалось определить местоположение. Сортировка по рейтингу.');
          sortSelect.value = 'rating';
        }
      }
    }
    render();
  });

  // Debounced search input — re-render 200ms after last keystroke to avoid
  // thrashing the DOM as the user types.
  let queryDebounce: number | undefined;
  searchInput?.addEventListener('input', () => {
    window.clearTimeout(queryDebounce);
    queryDebounce = window.setTimeout(render, 200);
  });

  priceChips.forEach((c) => c.addEventListener('click', () => {
    c.classList.toggle('is-active');
    render();
  }));
  tagChecks.forEach((c) => c.addEventListener('change', render));
  resetBtn?.addEventListener('click', () => {
    applyFiltersToUI({ city: '', priceTiers: [], tags: [], sort: 'rating', query: '' });
    render();
  });

  render();
}
