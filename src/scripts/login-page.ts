import { supabase } from '../lib/supabase';
import { saveReturnUrl } from './auth';

export function setupLoginPage(): void {
  const form = document.getElementById('login-form') as HTMLFormElement | null;
  const successEl = document.getElementById('login-success');
  const errorEl = document.getElementById('login-error');
  if (!form) return;

  // Если есть ?return= — сохраняем
  const params = new URLSearchParams(window.location.search);
  const returnUrl = params.get('return');
  if (returnUrl) saveReturnUrl(returnUrl);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const email = (data.get('email') as string).trim();
    if (!email) return;

    if (successEl) successEl.hidden = true;
    if (errorEl) errorEl.hidden = true;
    const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Отправляем…';

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback/`,
      },
    });

    btn.disabled = false;
    btn.textContent = 'Получить ссылку';

    if (error) {
      if (errorEl) {
        errorEl.textContent = `Ошибка: ${error.message}`;
        errorEl.hidden = false;
      }
      return;
    }

    if (successEl) {
      successEl.querySelector('[data-email]')!.textContent = email;
      successEl.hidden = false;
    }
    form.reset();
  });
}
