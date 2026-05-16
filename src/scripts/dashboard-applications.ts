import { supabase } from '../lib/supabase';
import { requireLogin } from '../lib/route-guards';
import { type ClubApplication, APPLICATION_STATUS_LABELS } from '../data/supabase-types';
import { CITY_LABELS } from '../data/cities';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function renderAppCard(app: ClubApplication): string {
  const cityLabel = CITY_LABELS[app.city] ?? app.city;
  return `
    <article class="app-card">
      <div class="app-card__header">
        <h3 class="app-card__title">${app.club_name}</h3>
        <span class="pill pill--${app.status}">${APPLICATION_STATUS_LABELS[app.status]}</span>
      </div>
      <div class="app-card__meta">
        <span>${cityLabel}</span>
        ${app.district ? `<span class="club-card__meta-sep">·</span><span>${app.district}</span>` : ''}
        <span class="club-card__meta-sep">·</span>
        <span>${app.address}</span>
      </div>
      ${app.description ? `<p class="app-card__desc">${app.description}</p>` : ''}
      <div class="app-card__footer">
        <span>Подана: ${formatDate(app.created_at)}</span>
        ${app.reviewed_at ? `<span>Рассмотрена: ${formatDate(app.reviewed_at)}</span>` : ''}
      </div>
      ${app.review_note ? `
        <div class="app-card__review">
          <strong>Комментарий модератора:</strong>
          <p>${app.review_note}</p>
        </div>
      ` : ''}
    </article>
  `;
}

export async function setupDashboardApplications(): Promise<void> {
  const root = document.getElementById('my-apps-root');
  if (!root) return;

  const loadingEl = document.getElementById('my-apps-loading');
  const listEl = document.getElementById('my-apps-list');
  const emptyEl = document.getElementById('my-apps-empty');
  if (!loadingEl || !listEl || !emptyEl) return;

  const { user } = await requireLogin();
  if (!user) return;

  const { data, error } = await supabase
    .from('club_applications')
    .select('*')
    .eq('applicant_user_id', user.id)
    .order('created_at', { ascending: false });

  loadingEl.hidden = true;

  if (error) {
    listEl.innerHTML = `<p>Ошибка: ${error.message}</p>`;
    listEl.hidden = false;
    return;
  }

  const apps = (data ?? []) as ClubApplication[];
  if (apps.length === 0) {
    emptyEl.hidden = false;
    return;
  }

  listEl.innerHTML = apps.map(renderAppCard).join('');
  listEl.hidden = false;
}
