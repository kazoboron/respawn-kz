import { supabase } from '../lib/supabase';
import { popReturnUrl } from './auth';

export function setupAuthCallback(): void {
  if (!document.getElementById('auth-callback-root')) return;

  // Supabase JS детектит hash params автоматически через detectSessionInUrl
  // Дожидаемся события auth-state-change или прямого getSession.
  (async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      showError(`Ошибка авторизации: ${error.message}`);
      return;
    }
    if (!data.session) {
      // Подождать чуть, иногда detectSessionInUrl ещё в процессе
      setTimeout(async () => {
        const recheck = await supabase.auth.getSession();
        if (recheck.data.session) {
          redirect();
        } else {
          showError('Не удалось завершить вход. Попробуй ещё раз.');
        }
      }, 800);
      return;
    }
    redirect();
  })();

  function redirect(): void {
    const returnUrl = popReturnUrl() || '/me/';
    window.location.replace(returnUrl);
  }

  function showError(msg: string): void {
    const el = document.getElementById('callback-error');
    const loadingEl = document.getElementById('callback-loading');
    if (loadingEl) loadingEl.hidden = true;
    if (el) {
      el.textContent = msg;
      el.hidden = false;
    }
  }
}
