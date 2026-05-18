import { supabase } from '../lib/supabase';
import { requireSuperAdmin } from '../lib/route-guards';
import { type ClubAdmin, type ClubApplication } from '../data/supabase-types';

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

interface UserSearchResult {
  user_id: string;
  email: string | null;
  applications: ClubApplication[];
  clubAdmin: ClubAdmin[];
  isSuperAdmin: boolean;
}

async function lookupByEmail(email: string): Promise<UserSearchResult | null> {
  const { data: apps } = await supabase
    .from('club_applications')
    .select('*')
    .eq('applicant_email', email);

  if (!apps || apps.length === 0) {
    return null;
  }

  const userId = (apps[0] as ClubApplication).applicant_user_id;
  if (!userId) return null;

  return enrichUserData(userId, email);
}

async function lookupByUid(uid: string): Promise<UserSearchResult | null> {
  const { data: apps } = await supabase
    .from('club_applications')
    .select('*')
    .eq('applicant_user_id', uid);

  const email = apps && apps.length > 0 ? (apps[0] as ClubApplication).applicant_email : null;
  return enrichUserData(uid, email);
}

async function enrichUserData(userId: string, email: string | null): Promise<UserSearchResult> {
  const [{ data: apps }, { data: admins }, { data: superRow }] = await Promise.all([
    supabase.from('club_applications').select('*').eq('applicant_user_id', userId),
    supabase.from('club_admins').select('*').eq('user_id', userId),
    supabase.from('super_admins').select('user_id').eq('user_id', userId).maybeSingle(),
  ]);

  return {
    user_id: userId,
    email,
    applications: (apps ?? []) as ClubApplication[],
    clubAdmin: (admins ?? []) as ClubAdmin[],
    isSuperAdmin: !!superRow,
  };
}

function renderResult(r: UserSearchResult): string {
  return `
    <article class="user-result-card">
      <div class="user-result-card__header">
        <h3>Пользователь</h3>
        ${r.isSuperAdmin ? '<span class="pill pill--admin">Super Admin</span>' : ''}
      </div>
      <div class="info-grid">
        <div><div class="info-label">UID</div><div class="info-value"><code style="font-size:12px">${r.user_id}</code></div></div>
        <div><div class="info-label">Email</div><div class="info-value">${r.email ?? '<span style="color:var(--text-muted)">не известен</span>'}</div></div>
      </div>

      <h4 style="margin-top:24px">Владелец клубов (${r.clubAdmin.length})</h4>
      ${r.clubAdmin.length === 0 ? '<p style="color:var(--text-muted)">Нет привязок</p>' : `
        <ul class="user-result-card__list">
          ${r.clubAdmin.map((a) => `<li><code>${a.club_slug}</code> (с ${new Date(a.created_at).toLocaleDateString('ru-RU')})</li>`).join('')}
        </ul>
      `}

      <h4 style="margin-top:24px">Заявки (${r.applications.length})</h4>
      ${r.applications.length === 0 ? '<p style="color:var(--text-muted)">Нет заявок</p>' : `
        <ul class="user-result-card__list">
          ${r.applications.map((a) => `<li>${a.club_name} — <span class="pill pill--${a.status}">${a.status}</span></li>`).join('')}
        </ul>
      `}

      <div style="margin-top:16px">
        <button type="button" class="btn btn--ghost btn--sm" data-copy-uid="${r.user_id}">Скопировать UID</button>
        <a href="/admin/owners/" class="btn btn--ghost btn--sm">→ Owners</a>
      </div>
    </article>
  `;
}

export async function setupAdminUsers(): Promise<void> {
  const root = document.getElementById('admin-users-root');
  if (!root) return;

  await requireSuperAdmin();

  const queryEl = document.getElementById('users-query') as HTMLInputElement;
  const searchBtn = document.getElementById('users-search-btn') as HTMLButtonElement;
  const resultEl = document.getElementById('users-result')!;

  async function doSearch() {
    const q = queryEl.value.trim();
    if (!q) {
      resultEl.innerHTML = '';
      return;
    }

    searchBtn.setAttribute('aria-busy', 'true');
    searchBtn.disabled = true;
    resultEl.innerHTML = '<p style="color:var(--text-muted)">Ищем…</p>';

    let result: UserSearchResult | null = null;
    try {
      if (isUuid(q)) {
        result = await lookupByUid(q);
      } else if (isEmail(q)) {
        result = await lookupByEmail(q.toLowerCase());
      } else {
        resultEl.innerHTML = '<p style="color:rgb(248, 113, 113)">Введи email или UUID</p>';
        return;
      }
    } finally {
      searchBtn.removeAttribute('aria-busy');
      searchBtn.disabled = false;
    }

    if (!result) {
      resultEl.innerHTML = `
        <p style="color:var(--text-muted)">
          Пользователь не найден через таблицу заявок. Если ты уверен что он существует —
          возьми UID в Supabase Dashboard (Authentication → Users) и введи здесь напрямую.
        </p>
      `;
      return;
    }

    resultEl.innerHTML = renderResult(result);
  }

  searchBtn.addEventListener('click', doSearch);
  queryEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  resultEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('[data-copy-uid]') as HTMLButtonElement | null;
    if (!btn) return;
    const uid = btn.getAttribute('data-copy-uid')!;
    try {
      await navigator.clipboard.writeText(uid);
      const oldText = btn.textContent;
      btn.textContent = 'Скопировано!';
      setTimeout(() => { btn.textContent = oldText; }, 1500);
    } catch {
      alert(`UID: ${uid}`);
    }
  });
}
