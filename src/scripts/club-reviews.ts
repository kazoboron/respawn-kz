import { supabase } from '../lib/supabase';

const PAGE_SIZE = 10;

interface PublicReview {
  id: string;
  rating: number;
  text: string;
  created_at: string;
  // Optional fields — present once migrations 0016/0020 apply, undefined before.
  reply_text?: string | null;
  replied_at?: string | null;
  photo_urls?: string[] | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(s: string): string {
  return new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function renderStars(rating: number): string {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="rating-stars__star${i <= rating ? ' is-filled' : ''}">★</span>`;
  }
  return `<span class="rating-stars rating-stars--sm">${html}</span>`;
}

function renderReply(r: PublicReview): string {
  if (!r.reply_text) return '';
  return `
    <div class="review-card__reply" role="region" aria-label="Ответ клуба">
      <div class="review-card__reply-header">
        <span class="review-card__reply-label">Ответ клуба</span>
        ${r.replied_at ? `<span class="review-card__date">${formatDate(r.replied_at)}</span>` : ''}
      </div>
      <p class="review-card__reply-text">${escapeHtml(r.reply_text)}</p>
    </div>
  `;
}

function renderPhotos(r: PublicReview): string {
  if (!r.photo_urls || r.photo_urls.length === 0) return '';
  // photo-index/data-photos pattern is what gallery-lightbox.ts expects for #club-gallery.
  // For reviews we use a different wrapper id per review so each review's photos form
  // an independent lightbox set.
  const photos = JSON.stringify(r.photo_urls);
  return `
    <div class="review-card__photos" id="review-gallery-${r.id}" data-photos='${photos.replace(/'/g, "&apos;")}'>
      ${r.photo_urls.map((url, i) => `
        <button type="button" class="review-card__photo-btn" data-photo-index="${i}" aria-label="Открыть фото ${i + 1} к отзыву">
          <img src="${url}" alt="" loading="lazy" />
        </button>
      `).join('')}
    </div>
  `;
}

function renderCard(r: PublicReview): string {
  return `
    <li>
      <article class="review-card">
        <div class="review-card__header">
          ${renderStars(r.rating)}
          <span class="review-card__date">${formatDate(r.created_at)}</span>
        </div>
        <p class="review-card__text">${escapeHtml(r.text)}</p>
        ${renderPhotos(r)}
        ${renderReply(r)}
      </article>
    </li>
  `;
}

type SortKey = 'newest' | 'oldest' | 'highest' | 'lowest';

const SORT_CONFIG: Record<SortKey, { column: 'created_at' | 'rating'; ascending: boolean; secondary?: { column: 'created_at'; ascending: boolean } }> = {
  newest: { column: 'created_at', ascending: false },
  oldest: { column: 'created_at', ascending: true },
  highest: { column: 'rating', ascending: false, secondary: { column: 'created_at', ascending: false } },
  lowest: { column: 'rating', ascending: true, secondary: { column: 'created_at', ascending: false } },
};

export async function setupClubReviews(): Promise<void> {
  const slug = (window as unknown as { __clubReviewsSlug?: string }).__clubReviewsSlug;
  const listEl = document.getElementById('reviews-list') as HTMLUListElement | null;
  const loadingEl = document.getElementById('reviews-loading');
  const errorEl = document.getElementById('reviews-error');
  const loadMoreBtn = document.getElementById('reviews-load-more') as HTMLButtonElement | null;
  const emptyEl = document.getElementById('reviews-empty');
  const sortEl = document.getElementById('reviews-sort') as HTMLSelectElement | null;
  const retryBtn = errorEl?.querySelector<HTMLButtonElement>('[data-retry-reviews]') ?? null;

  if (!slug || !listEl) return;

  let offset = 0;
  let initialRender = true;
  let sortKey: SortKey = 'newest';

  function showLoading(): void {
    if (loadingEl) loadingEl.hidden = false;
    listEl!.setAttribute('aria-busy', 'true');
    if (errorEl) errorEl.hidden = true;
  }

  function hideLoading(): void {
    if (loadingEl) loadingEl.hidden = true;
    listEl!.setAttribute('aria-busy', 'false');
  }

  function showError(): void {
    hideLoading();
    if (errorEl) errorEl.hidden = false;
    if (loadMoreBtn) loadMoreBtn.hidden = true;
  }

  async function loadPage(): Promise<void> {
    if (initialRender) showLoading();

    const cfg = SORT_CONFIG[sortKey];
    // Defensive query: try modern columns; if migration 0016/0020 not yet applied,
    // fall back to base columns and synthesize null for missing fields.
    const baseQuery = () => supabase
      .from('reviews')
      .select('id, rating, text, created_at, reply_text, replied_at, photo_urls')
      .eq('club_slug', slug!)
      .eq('status', 'published')
      .order(cfg.column, { ascending: cfg.ascending });
    const fallbackQuery = () => supabase
      .from('reviews')
      .select('id, rating, text, created_at')
      .eq('club_slug', slug!)
      .eq('status', 'published')
      .order(cfg.column, { ascending: cfg.ascending });

    let query = baseQuery();
    if (cfg.secondary) {
      query = query.order(cfg.secondary.column, { ascending: cfg.secondary.ascending });
    }
    let { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);

    // 42703 = column does not exist (migration 0016 or 0020 not applied yet)
    if (error && error.code === '42703') {
      let fq = fallbackQuery();
      if (cfg.secondary) fq = fq.order(cfg.secondary.column, { ascending: cfg.secondary.ascending });
      const retry = await fq.range(offset, offset + PAGE_SIZE - 1);
      // Fallback rows don't have the optional fields — cast to widen.
      data = retry.data as typeof data;
      error = retry.error;
    }

    if (error) {
      console.error('[club-reviews] load failed', error);
      if (initialRender) showError();
      return;
    }

    hideLoading();

    const rows = (data ?? []) as PublicReview[];

    if (initialRender) {
      if (rows.length === 0) {
        listEl!.innerHTML = '';
        if (emptyEl) emptyEl.hidden = false;
        if (loadMoreBtn) loadMoreBtn.hidden = true;
        return;
      }
      if (emptyEl) emptyEl.hidden = true;
      listEl!.innerHTML = rows.map(renderCard).join('');
    } else {
      listEl!.insertAdjacentHTML('beforeend', rows.map(renderCard).join(''));
    }

    initialRender = false;
    offset += rows.length;
    if (loadMoreBtn) loadMoreBtn.hidden = rows.length < PAGE_SIZE;
  }

  function resetAndReload(): void {
    initialRender = true;
    offset = 0;
    listEl!.innerHTML = '';
    if (loadMoreBtn) loadMoreBtn.hidden = true;
    loadPage();
  }

  sortEl?.addEventListener('change', () => {
    const v = sortEl.value as SortKey;
    if (v === sortKey) return;
    sortKey = v;
    resetAndReload();
  });

  retryBtn?.addEventListener('click', resetAndReload);
  loadMoreBtn?.addEventListener('click', loadPage);
  await loadPage();
}
