import { supabase } from '../lib/supabase';
import { requireSuperAdmin } from '../lib/route-guards';
import { type ClubAdmin } from '../data/supabase-types';

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

async function loadAllAdmins(): Promise<ClubAdmin[] | null> {
  const { data, error } = await supabase.from('club_admins').select('*');
  if (error) {
    console.error('[admin-owners] load failed', error);
    return null;
  }
  return (data ?? []) as ClubAdmin[];
}

async function grantOwnership(userId: string, clubSlug: string, grantedBy: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('club_admins').insert({
    user_id: userId,
    club_slug: clubSlug,
    granted_by: grantedBy,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function revokeOwnership(rowId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('club_admins').delete().eq('id', rowId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function renderCurrent(admins: ClubAdmin[]): string {
  if (admins.length === 0) {
    return '<span style="color:var(--text-muted)">Нет привязанных владельцев</span>';
  }
  return `
    <ul class="owner-card__list">
      ${admins.map((a) => `
        <li>
          <code style="font-size:12px">${a.user_id}</code>
          <button type="button" class="btn btn--ghost btn--sm" data-revoke="${a.id}">Отвязать</button>
        </li>
      `).join('')}
    </ul>
  `;
}

export async function setupAdminOwners(): Promise<void> {
  const root = document.getElementById('admin-owners-root');
  if (!root) return;

  const loadingEl = document.getElementById('owners-loading');
  const listEl = document.getElementById('owners-list');
  const errorEl = document.getElementById('owners-error');
  if (!loadingEl || !listEl) return;

  const { user } = await requireSuperAdmin();
  if (!user) return;

  async function refresh() {
    const admins = await loadAllAdmins();
    if (admins === null) {
      if (errorEl) errorEl.hidden = false;
      return;
    }
    const bySlug = new Map<string, ClubAdmin[]>();
    admins.forEach((a) => {
      const arr = bySlug.get(a.club_slug) ?? [];
      arr.push(a);
      bySlug.set(a.club_slug, arr);
    });

    document.querySelectorAll<HTMLElement>('[data-current-for]').forEach((el) => {
      const slug = el.getAttribute('data-current-for')!;
      el.innerHTML = renderCurrent(bySlug.get(slug) ?? []);
    });
  }

  await refresh();
  loadingEl.hidden = true;
  listEl.hidden = false;

  // Grant + revoke handler (event delegation)
  listEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    const grantBtn = target.closest('[data-grant]') as HTMLButtonElement | null;
    if (grantBtn) {
      const slug = grantBtn.getAttribute('data-grant')!;
      const input = document.querySelector(`[data-uid-input="${slug}"]`) as HTMLInputElement;
      const uid = input.value.trim();
      if (!isUuid(uid)) {
        alert('Введи валидный UUID (формат: 8-4-4-4-12 hex)');
        return;
      }
      grantBtn.setAttribute('aria-busy', 'true');
      grantBtn.disabled = true;
      grantBtn.textContent = 'Сохраняем…';
      const result = await grantOwnership(uid, slug, user.id);
      if (!result.ok) {
        alert(`Ошибка: ${result.error}`);
        grantBtn.removeAttribute('aria-busy');
        grantBtn.disabled = false;
        grantBtn.textContent = 'Привязать';
        return;
      }
      input.value = '';
      grantBtn.removeAttribute('aria-busy');
      grantBtn.disabled = false;
      grantBtn.textContent = 'Привязать';
      await refresh();
      return;
    }

    const revokeBtn = target.closest('[data-revoke]') as HTMLButtonElement | null;
    if (revokeBtn) {
      const id = revokeBtn.getAttribute('data-revoke')!;
      if (!window.confirm('Отвязать этого владельца?')) return;
      revokeBtn.setAttribute('aria-busy', 'true');
      revokeBtn.disabled = true;
      revokeBtn.textContent = '…';
      const result = await revokeOwnership(id);
      if (!result.ok) {
        alert(`Ошибка: ${result.error}`);
        revokeBtn.removeAttribute('aria-busy');
        revokeBtn.disabled = false;
        revokeBtn.textContent = 'Отвязать';
        return;
      }
      await refresh();
    }
  });
}
