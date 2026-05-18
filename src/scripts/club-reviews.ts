import { supabase } from '../lib/supabase';

const PAGE_SIZE = 10;

interface PublicReview {
  id: string;
  rating: number;
  text: string;
  created_at: string;
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

function renderCard(r: PublicReview): string {
  return `
    <li>
      <article class="review-card">
        <div class="review-card__header">
          ${renderStars(r.rating)}
          <span class="review-card__date">${formatDate(r.created_at)}</span>
        </div>
        <p class="review-card__text">${escapeHtml(r.text)}</p>
      </article>
    </li>
  `;
}

export async function setupClubReviews(): Promise<void> {
  const slug = (window as unknown as { __clubReviewsSlug?: string }).__clubReviewsSlug;
  const listEl = document.getElementById('reviews-list') as HTMLUListElement | null;
  const loadingEl = document.getElementById('reviews-loading');
  const errorEl = document.getElementById('reviews-error');
  const loadMoreBtn = document.getElementById('reviews-load-more') as HTMLButtonElement | null;
  const emptyEl = document.getElementById('reviews-empty');
  const retryBtn = errorEl?.querySelector<HTMLButtonElement>('[data-retry-reviews]') ?? null;

  if (!slug || !listEl) return;

  let offset = 0;
  let initialRender = true;

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

    const { data, error } = await supabase
      .from('reviews')
      .select('id, rating, text, created_at')
      .eq('club_slug', slug!)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

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
      listEl!.innerHTML = rows.map(renderCard).join('');
    } else {
      listEl!.insertAdjacentHTML('beforeend', rows.map(renderCard).join(''));
    }

    initialRender = false;
    offset += rows.length;
    if (loadMoreBtn) loadMoreBtn.hidden = rows.length < PAGE_SIZE;
  }

  retryBtn?.addEventListener('click', () => {
    initialRender = true;
    offset = 0;
    listEl!.innerHTML = '';
    loadPage();
  });

  loadMoreBtn?.addEventListener('click', loadPage);
  await loadPage();
}
