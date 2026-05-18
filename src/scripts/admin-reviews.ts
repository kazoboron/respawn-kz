import { supabase } from '../lib/supabase';
import { requireSuperAdmin } from '../lib/route-guards';
import { type Review, REVIEW_STATUS_LABELS } from '../data/supabase-types';

interface ReviewWithClub extends Review {
  clubs: { name: string } | null;
}

type Filter = 'all' | 'published' | 'hidden';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(s: string): string {
  return new Date(s).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderStars(rating: number): string {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="rating-stars__star${i <= rating ? ' is-filled' : ''}">★</span>`;
  }
  return `<span class="rating-stars rating-stars--sm">${html}</span>`;
}

function renderRow(r: ReviewWithClub): string {
  const clubName = r.clubs?.name ?? r.club_slug;
  const ariaExcerpt = `отзыв ${r.text.slice(0, 30)}…`;
  const action = r.status === 'published'
    ? `<button class="btn btn--sm btn--ghost" data-action="hide" data-id="${r.id}" aria-label="Скрыть ${ariaExcerpt}">Скрыть</button>`
    : `<button class="btn btn--sm" data-action="unhide" data-id="${r.id}" aria-label="Опубликовать ${ariaExcerpt}">Опубликовать</button>`;
  const statusPill = r.status === 'published'
    ? `<span class="pill pill--confirmed" aria-label="Статус: ${REVIEW_STATUS_LABELS.published}">${REVIEW_STATUS_LABELS.published}</span>`
    : `<span class="pill pill--cancelled" aria-label="Статус: ${REVIEW_STATUS_LABELS.hidden}">${REVIEW_STATUS_LABELS.hidden}</span>`;
  const reason = r.hidden_reason ? `<div class="admin-review__reason">Причина: ${escapeHtml(r.hidden_reason)}</div>` : '';
  return `
    <article class="admin-review" data-review-id="${r.id}">
      <div class="admin-review__top">
        <div class="admin-review__meta">
          ${renderStars(r.rating)}
          <a class="admin-review__club" href="/clubs/${r.club_slug}/">${escapeHtml(clubName)}</a>
          <span class="admin-review__date">${formatDate(r.created_at)}</span>
        </div>
        <div class="admin-review__side">
          ${statusPill}
          ${action}
        </div>
      </div>
      <p class="admin-review__text">${escapeHtml(r.text)}</p>
      ${reason}
      <div class="admin-review__ids">booking_id: ${r.booking_id} · user_id: ${r.user_id.slice(0, 8)}…</div>
    </article>
  `;
}

async function loadReviews(filter: Filter): Promise<ReviewWithClub[]> {
  let q = supabase
    .from('reviews')
    .select('*, clubs(name)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (filter !== 'all') q = q.eq('status', filter);
  const { data, error } = await q;
  if (error) {
    console.error('[admin-reviews] load failed', error);
    return [];
  }
  return (data ?? []) as ReviewWithClub[];
}

async function hideReview(id: string, reason: string, by: string): Promise<boolean> {
  const { error } = await supabase
    .from('reviews')
    .update({
      status: 'hidden',
      hidden_by: by,
      hidden_at: new Date().toISOString(),
      hidden_reason: reason,
    })
    .eq('id', id);
  return !error;
}

async function unhideReview(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('reviews')
    .update({
      status: 'published',
      hidden_by: null,
      hidden_at: null,
      hidden_reason: null,
    })
    .eq('id', id);
  return !error;
}

export async function setupAdminReviews(): Promise<void> {
  const root = document.getElementById('admin-reviews-root');
  const listEl = document.getElementById('admin-reviews-list');
  if (!root || !listEl) return;

  const { user } = await requireSuperAdmin();
  if (!user) return;

  let currentFilter: Filter = 'all';

  async function refresh() {
    listEl!.innerHTML = '<p class="reviews-loading">Загрузка…</p>';
    const rows = await loadReviews(currentFilter);
    if (rows.length === 0) {
      listEl!.innerHTML = '<p class="reviews-empty">Отзывов с этим фильтром нет.</p>';
      return;
    }
    listEl!.innerHTML = rows.map(renderRow).join('');
  }

  root.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.name === 'status-filter') {
      currentFilter = target.value as Filter;
      refresh();
    }
  });

  listEl.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLButtonElement | null;
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    if (!id || !action) return;

    let ok = false;
    if (action === 'hide') {
      const reason = window.prompt('Причина скрытия (опционально):') ?? '';
      btn.disabled = true;
      ok = await hideReview(id, reason, user.id);
    } else if (action === 'unhide') {
      btn.disabled = true;
      ok = await unhideReview(id);
    }

    if (!ok) {
      btn.disabled = false;
      alert('Не удалось обновить статус. Попробуй ещё раз.');
      return;
    }
    await refresh();
  });

  await refresh();
}
