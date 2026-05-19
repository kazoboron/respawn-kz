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

function renderReplyBlock(r: ReviewWithClub): string {
  if (r.reply_text) {
    return `
      <div class="admin-review__reply" data-reply-block="${r.id}">
        <div class="admin-review__reply-header">
          <span class="admin-review__reply-label">Ответ клуба${r.replied_at ? ` · ${formatDate(r.replied_at)}` : ''}</span>
          <div class="admin-review__reply-actions">
            <button class="btn btn--sm btn--ghost" data-action="reply-edit" data-id="${r.id}">Редактировать</button>
            <button class="btn btn--sm btn--ghost" data-action="reply-delete" data-id="${r.id}">Удалить</button>
          </div>
        </div>
        <p class="admin-review__reply-text">${escapeHtml(r.reply_text)}</p>
      </div>
    `;
  }
  return `
    <details class="admin-review__reply-form" data-reply-form="${r.id}">
      <summary class="btn btn--sm btn--ghost">Ответить</summary>
      <form class="admin-review__reply-form-body" data-reply-submit="${r.id}">
        <label class="sr-only" for="reply-${r.id}">Текст ответа</label>
        <textarea
          id="reply-${r.id}"
          rows="3"
          minlength="10"
          maxlength="1000"
          required
          placeholder="Спасибо за отзыв… (10–1000 символов)"
        ></textarea>
        <div class="admin-review__reply-form-actions">
          <button type="submit" class="btn btn--sm btn--primary">Опубликовать</button>
          <span class="admin-review__reply-error" role="alert" aria-live="polite" hidden></span>
        </div>
      </form>
    </details>
  `;
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
      ${renderReplyBlock(r)}
      <div class="admin-review__ids">booking_id: ${r.booking_id} · user_id: ${r.user_id.slice(0, 8)}…</div>
    </article>
  `;
}

async function loadReviews(filter: Filter): Promise<ReviewWithClub[] | null> {
  let q = supabase
    .from('reviews')
    .select('*, clubs(name)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (filter !== 'all') q = q.eq('status', filter);
  const { data, error } = await q;
  if (error) {
    console.error('[admin-reviews] load failed', error);
    return null;
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

async function setReplyText(id: string, text: string | null): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('reviews')
    .update({ reply_text: text })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setupAdminReviews(): Promise<void> {
  const root = document.getElementById('admin-reviews-root');
  const listEl = document.getElementById('admin-reviews-list');
  const loadingEl = document.getElementById('admin-reviews-loading');
  const emptyEl = document.getElementById('admin-reviews-empty');
  const errorEl = document.getElementById('admin-reviews-error');
  const retryBtn = errorEl?.querySelector<HTMLButtonElement>('[data-retry-admin-reviews]') ?? null;
  if (!root || !listEl) return;

  const { user } = await requireSuperAdmin();
  if (!user) return;

  let currentFilter: Filter = 'all';

  function showLoading(): void {
    if (loadingEl) loadingEl.hidden = false;
    listEl!.setAttribute('aria-busy', 'true');
    if (emptyEl) emptyEl.hidden = true;
    if (errorEl) errorEl.hidden = true;
  }

  function hideLoading(): void {
    if (loadingEl) loadingEl.hidden = true;
    listEl!.setAttribute('aria-busy', 'false');
  }

  async function refresh() {
    showLoading();
    const rows = await loadReviews(currentFilter);
    hideLoading();

    if (rows === null) {
      if (errorEl) errorEl.hidden = false;
      return;
    }
    if (rows.length === 0) {
      if (emptyEl) emptyEl.hidden = false;
      listEl!.innerHTML = '';
      return;
    }
    listEl!.innerHTML = rows.map(renderRow).join('');
  }

  retryBtn?.addEventListener('click', () => refresh());

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

    const originalText = btn.textContent ?? '';
    let ok = false;

    if (action === 'hide') {
      const reason = window.prompt('Причина скрытия (опционально):') ?? '';
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
      btn.textContent = 'Скрываем…';
      ok = await hideReview(id, reason, user.id);
    } else if (action === 'unhide') {
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
      btn.textContent = 'Публикуем…';
      ok = await unhideReview(id);
    } else if (action === 'reply-delete') {
      if (!window.confirm('Удалить ответ клуба?')) return;
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
      btn.textContent = 'Удаляем…';
      const res = await setReplyText(id, null);
      ok = res.ok;
      if (!ok) alert(`Не удалось: ${res.error}`);
    } else if (action === 'reply-edit') {
      const current = (document.querySelector(`[data-reply-block="${id}"] .admin-review__reply-text`) as HTMLElement | null)?.textContent ?? '';
      const next = window.prompt('Редактировать ответ:', current);
      if (next === null) return;
      if (next.length < 10 || next.length > 1000) {
        alert('Ответ должен быть от 10 до 1000 символов.');
        return;
      }
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
      btn.textContent = 'Сохраняем…';
      const res = await setReplyText(id, next);
      ok = res.ok;
      if (!ok) alert(`Не удалось: ${res.error}`);
    } else {
      return;
    }

    if (!ok) {
      btn.removeAttribute('aria-busy');
      btn.disabled = false;
      btn.textContent = originalText;
      if (action === 'hide' || action === 'unhide') {
        alert('Не удалось обновить статус. Попробуй ещё раз.');
      }
      return;
    }
    await refresh();
  });

  // Reply form submit (separate handler, uses 'submit' event not 'click')
  listEl.addEventListener('submit', async (e) => {
    const form = e.target as HTMLFormElement;
    const id = form.getAttribute('data-reply-submit');
    if (!id) return;
    e.preventDefault();

    const textarea = form.querySelector('textarea') as HTMLTextAreaElement;
    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    const errorEl = form.querySelector('.admin-review__reply-error') as HTMLElement;
    const text = textarea.value.trim();

    errorEl.hidden = true;
    if (text.length < 10 || text.length > 1000) {
      errorEl.textContent = 'Ответ должен быть от 10 до 1000 символов.';
      errorEl.hidden = false;
      return;
    }

    const originalLabel = submitBtn.textContent ?? '';
    submitBtn.setAttribute('aria-busy', 'true');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Публикуем…';

    const res = await setReplyText(id, text);
    if (!res.ok) {
      submitBtn.removeAttribute('aria-busy');
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
      errorEl.textContent = `Не удалось: ${res.error}`;
      errorEl.hidden = false;
      return;
    }
    await refresh();
  });

  await refresh();
}
