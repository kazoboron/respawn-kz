import { supabase } from '../lib/supabase';
import { requireSuperAdmin } from '../lib/route-guards';
import { type ClubApplication, type ApplicationStatus, APPLICATION_STATUS_LABELS } from '../data/supabase-types';
import { CITY_LABELS } from '../data/cities';
import { generateUniqueClubSlug } from '../lib/slugify';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function renderAdminAppCard(app: ClubApplication): string {
  const cityLabel = CITY_LABELS[app.city] ?? app.city;
  const isPending = app.status === 'pending';

  return `
    <article class="admin-app-card" data-app-id="${app.id}" data-applicant-email="${app.applicant_email}">
      <div class="admin-app-card__header">
        <div>
          <h3 class="admin-app-card__title">${app.club_name}</h3>
          <div class="admin-app-card__contact">
            ${app.applicant_name} · ${app.applicant_email} ${app.applicant_phone ? `· ${app.applicant_phone}` : ''}
          </div>
        </div>
        <span class="pill pill--${app.status}" aria-label="Статус: ${APPLICATION_STATUS_LABELS[app.status]}">${APPLICATION_STATUS_LABELS[app.status]}</span>
      </div>

      <div class="admin-app-card__body">
        <div class="info-grid">
          <div><div class="info-label">Город</div><div class="info-value">${cityLabel}</div></div>
          <div><div class="info-label">Район</div><div class="info-value">${app.district ?? '—'}</div></div>
          <div><div class="info-label">Адрес</div><div class="info-value">${app.address}</div></div>
          <div><div class="info-label">Часы</div><div class="info-value">${app.working_hours ?? '—'}</div></div>
        </div>
        ${app.equipment_note ? `<div><div class="info-label">Оборудование</div><div class="info-value">${app.equipment_note}</div></div>` : ''}
        ${app.description ? `<div><div class="info-label">Описание</div><div class="info-value">${app.description}</div></div>` : ''}
        ${app.photo_url ? `<div><div class="info-label">Фото</div><div class="info-value"><a href="${app.photo_url}" target="_blank" rel="noopener">Открыть ссылку →</a></div></div>` : ''}
      </div>

      <div class="admin-app-card__footer">
        <span>Подана: ${formatDate(app.created_at)}</span>
        ${app.reviewed_at ? `<span>Рассмотрена: ${formatDate(app.reviewed_at)}</span>` : ''}
      </div>

      ${app.review_note ? `
        <div class="app-card__review">
          <strong>Твой комментарий:</strong>
          <p>${app.review_note}</p>
        </div>
      ` : ''}

      ${isPending ? `
        <div class="admin-app-card__actions">
          <label for="note-${app.id}" class="sr-only">Комментарий для заявки ${app.club_name} (опционально)</label>
          <textarea
            id="note-${app.id}"
            class="auth-input"
            data-note="${app.id}"
            placeholder="Комментарий (опционально)"
            rows="2"
            style="margin-bottom:12px"
            aria-label="Комментарий модератора (опционально)"
          ></textarea>
          <div id="action-status-${app.id}" aria-live="polite" style="display:none"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn btn--primary btn--sm" data-action="approve" data-id="${app.id}" aria-label="Одобрить заявку ${app.club_name} от ${app.applicant_name}">Одобрить</button>
            <button type="button" class="btn btn--ghost btn--sm" data-action="reject" data-id="${app.id}" aria-label="Отклонить заявку ${app.club_name} от ${app.applicant_name}">Отклонить</button>
          </div>
        </div>
      ` : ''}
    </article>
  `;
}

async function loadApplications(statusFilter: string): Promise<ClubApplication[] | null> {
  let query = supabase.from('club_applications').select('*').order('created_at', { ascending: false });
  if (statusFilter) query = query.eq('status', statusFilter);
  const { data, error } = await query.limit(100);
  if (error) {
    console.error('[admin-apps] load failed', error);
    return null;
  }
  return (data ?? []) as ClubApplication[];
}

async function updateApplicationStatus(
  id: string,
  newStatus: ApplicationStatus,
  reviewNote: string,
  reviewerId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('club_applications')
    .update({
      status: newStatus,
      review_note: reviewNote || null,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setupAdminApplications(): Promise<void> {
  const root = document.getElementById('admin-apps-root');
  if (!root) return;

  const loadingEl = document.getElementById('admin-apps-loading');
  const filtersEl = document.getElementById('admin-apps-filters');
  const listEl = document.getElementById('admin-apps-list');
  const emptyEl = document.getElementById('admin-apps-empty');
  const errorEl = document.getElementById('admin-apps-error');
  const retryBtn = errorEl?.querySelector<HTMLButtonElement>('[data-retry-admin-apps]') ?? null;
  if (!loadingEl || !filtersEl || !listEl || !emptyEl) return;

  const { user } = await requireSuperAdmin();
  if (!user) return;

  let currentStatus = 'pending';

  async function refresh() {
    loadingEl!.hidden = false;
    loadingEl!.setAttribute('aria-busy', 'true');
    listEl!.hidden = true;
    emptyEl!.hidden = true;
    if (errorEl) errorEl.hidden = true;

    const apps = await loadApplications(currentStatus);
    loadingEl!.hidden = true;
    loadingEl!.setAttribute('aria-busy', 'false');

    if (apps === null) {
      if (errorEl) errorEl.hidden = false;
      return;
    }
    if (apps.length === 0) {
      emptyEl!.hidden = false;
      return;
    }

    listEl!.innerHTML = apps.map(renderAdminAppCard).join('');
    listEl!.hidden = false;
  }

  retryBtn?.addEventListener('click', () => refresh());

  filtersEl.hidden = false;
  (document.getElementById('admin-apps-status') as HTMLSelectElement).addEventListener('change', (e) => {
    currentStatus = (e.target as HTMLSelectElement).value;
    refresh();
  });

  listEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('[data-action]') as HTMLButtonElement | null;
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    if (!action || !id) return;

    const noteEl = document.querySelector(`textarea[data-note="${id}"]`) as HTMLTextAreaElement | null;
    const note = noteEl?.value.trim() ?? '';

    const newStatus: ApplicationStatus = action === 'approve' ? 'approved' : 'rejected';

    if (action === 'reject' && !note) {
      if (!window.confirm('Отклонить без комментария? Заявителю будет полезно знать причину.')) return;
    }

    const originalText = btn.textContent ?? '';
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;
    btn.textContent = action === 'approve' ? 'Одобряем…' : 'Отклоняем…';

    const card = btn.closest('[data-app-id]') as HTMLElement;
    // Read applicant email from data-attribute (set by renderAdminAppCard).
    // Previously scraped via regex from .admin-app-card__contact text — fragile
    // if name contained an '@'. Now authoritative.
    const cardEmail = card.getAttribute('data-applicant-email') ?? '';

    if (newStatus === 'approved') {
      // Fetch the full application to get club_name for slug generation
      const { data: app, error: fetchErr } = await supabase
        .from('club_applications')
        .select('club_name')
        .eq('id', id)
        .single();
      if (fetchErr || !app) {
        btn.removeAttribute('aria-busy');
        btn.disabled = false;
        btn.textContent = originalText;
        alert(`Не удалось загрузить заявку: ${fetchErr?.message ?? 'unknown'}`);
        return;
      }

      // Generate unique slug from club_name (cyrillic-aware)
      let newSlug: string;
      try {
        newSlug = await generateUniqueClubSlug(app.club_name);
      } catch (err) {
        btn.removeAttribute('aria-busy');
        btn.disabled = false;
        btn.textContent = originalText;
        alert(`Не удалось сгенерировать уникальный slug: ${(err as Error).message}`);
        return;
      }

      // Call RPC for atomic approval
      const { data: rpcSlug, error: rpcErr } = await supabase.rpc('approve_club_application', {
        p_application_id: id,
        p_club_slug: newSlug,
        p_review_note: note || null,
      });

      if (rpcErr) {
        btn.removeAttribute('aria-busy');
        btn.disabled = false;
        btn.textContent = originalText;
        alert(`Ошибка одобрения: ${rpcErr.message}`);
        return;
      }

      alert(
        `Одобрено!\n\nКлуб создан как DRAFT с slug "${rpcSlug}".\n\n` +
        `Дальше:\n` +
        `1. Заявитель (${cardEmail}) теперь club_admin этого клуба\n` +
        `2. Открой /dashboard/club/edit?slug=${rpcSlug} для редактирования (или жди что заявитель сам заполнит)\n` +
        `3. После заполнения — toggle is_published в той же форме`
      );
    } else {
      // Reject path uses the old update flow (no RPC needed)
      const result = await updateApplicationStatus(id, newStatus, note, user.id);
      if (!result.ok) {
        btn.removeAttribute('aria-busy');
        btn.disabled = false;
        btn.textContent = originalText;
        alert(`Ошибка: ${result.error}`);
        return;
      }
    }

    refresh();
  });

  await refresh();
}
