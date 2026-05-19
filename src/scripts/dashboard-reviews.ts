import { supabase } from '../lib/supabase';
import { requireClubAdmin } from '../lib/route-guards';
import { type Review } from '../data/supabase-types';

interface ReviewWithClub extends Review {
  clubs: { name: string } | null;
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
          <span class="admin-review__reply-label">Твой ответ${r.replied_at ? ` · ${formatDate(r.replied_at)}` : ''}</span>
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
  return `
    <article class="admin-review" data-review-id="${r.id}">
      <div class="admin-review__top">
        <div class="admin-review__meta">
          ${renderStars(r.rating)}
          <a class="admin-review__club" href="/clubs/${r.club_slug}/">${escapeHtml(clubName)}</a>
          <span class="admin-review__date">${formatDate(r.created_at)}</span>
        </div>
      </div>
      <p class="admin-review__text">${escapeHtml(r.text)}</p>
      ${renderReplyBlock(r)}
    </article>
  `;
}

async function loadReviewsForClubs(clubSlugs: string[], isSuperAdmin: boolean): Promise<ReviewWithClub[] | null> {
  let q = supabase
    .from('reviews')
    .select('*, clubs(name)')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(100);
  if (!isSuperAdmin && clubSlugs.length > 0) {
    q = q.in('club_slug', clubSlugs);
  }
  const { data, error } = await q;
  if (error) {
    console.error('[dashboard-reviews] load failed', error);
    return null;
  }
  return (data ?? []) as ReviewWithClub[];
}

async function setReplyText(id: string, text: string | null): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('reviews')
    .update({ reply_text: text })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setupDashboardReviews(): Promise<void> {
  const root = document.getElementById('dashboard-reviews-root');
  const listEl = document.getElementById('dashboard-reviews-list');
  const loadingEl = document.getElementById('dashboard-reviews-loading');
  const emptyEl = document.getElementById('dashboard-reviews-empty');
  const errorEl = document.getElementById('dashboard-reviews-error');
  const retryBtn = errorEl?.querySelector<HTMLButtonElement>('[data-retry-dashboard-reviews]') ?? null;
  if (!root || !listEl) return;

  const { clubSlugs, isSuperAdmin } = await requireClubAdmin();

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
    const rows = await loadReviewsForClubs(clubSlugs, isSuperAdmin);
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

  listEl.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLButtonElement | null;
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    if (!id || !action) return;

    const originalText = btn.textContent ?? '';
    let ok = false;

    if (action === 'reply-delete') {
      if (!window.confirm('Удалить твой ответ на этот отзыв?')) return;
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
      return;
    }
    await refresh();
  });

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
