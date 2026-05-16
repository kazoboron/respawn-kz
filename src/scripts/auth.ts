import { supabase } from '../lib/supabase';
import { clearRolesCache, getRoles } from '../lib/roles';

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function signOut(): Promise<void> {
  clearRolesCache();
  await supabase.auth.signOut();
  window.location.href = '/';
}

export function setupAuthButton(): void {
  const root = document.getElementById('header-auth');
  if (!root) return;

  function render(loggedIn: boolean) {
    if (loggedIn) {
      root!.innerHTML = `
        <a href="/me/" class="btn btn--ghost">Личный кабинет</a>
        <button class="btn btn--ghost" type="button" id="logout-btn">Выйти</button>
      `;
      document.getElementById('logout-btn')?.addEventListener('click', signOut);
      updateRoleNav();
    } else {
      root!.innerHTML = `<a href="/login/" class="btn btn--ghost">Войти</a>`;
      hideRoleNav();
    }
  }

  // Первичный рендер
  getCurrentUser().then((user) => render(!!user));

  // Реагируем на изменения сессии
  supabase.auth.onAuthStateChange((_event, session) => {
    clearRolesCache();
    render(!!session?.user);
  });
}

export function saveReturnUrl(url: string): void {
  try {
    localStorage.setItem('auth.return', url);
  } catch {}
}

export function popReturnUrl(): string | null {
  try {
    const url = localStorage.getItem('auth.return');
    if (url) localStorage.removeItem('auth.return');
    return url;
  } catch {
    return null;
  }
}

async function updateRoleNav(): Promise<void> {
  const cabinetLink = document.getElementById('nav-cabinet');
  const adminLink = document.getElementById('nav-admin');
  if (!cabinetLink && !adminLink) return;

  try {
    const { isSuperAdmin, clubSlugs } = await getRoles();
    if (cabinetLink) {
      cabinetLink.hidden = clubSlugs.length === 0 && !isSuperAdmin;
    }
    if (adminLink) {
      adminLink.hidden = !isSuperAdmin;
    }
  } catch (err) {
    console.warn('[auth] failed to load roles for nav', err);
  }
}

function hideRoleNav(): void {
  const cabinetLink = document.getElementById('nav-cabinet');
  const adminLink = document.getElementById('nav-admin');
  if (cabinetLink) cabinetLink.hidden = true;
  if (adminLink) adminLink.hidden = true;
}
