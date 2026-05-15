import { supabase } from '../lib/supabase';

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function signOut(): Promise<void> {
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
    } else {
      root!.innerHTML = `<a href="/login/" class="btn btn--ghost">Войти</a>`;
    }
  }

  // Первичный рендер
  getCurrentUser().then((user) => render(!!user));

  // Реагируем на изменения сессии
  supabase.auth.onAuthStateChange((_event, session) => {
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
