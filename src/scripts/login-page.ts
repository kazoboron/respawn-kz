import { supabase, supabaseConfigured } from '../lib/supabase';
import { saveReturnUrl, popReturnUrl } from './auth';

export function setupLoginPage(): void {
  const form = document.getElementById('login-form') as HTMLFormElement | null;
  const successEl = document.getElementById('login-success');
  const errorEl = document.getElementById('login-error');
  const demoBanner = document.getElementById('login-demo-banner');
  if (!form) return;

  // Показать demo-баннер если работаем без Supabase
  if (!supabaseConfigured && demoBanner) {
    demoBanner.hidden = false;
  }

  // Если есть ?return= — сохраняем
  const params = new URLSearchParams(window.location.search);
  const returnUrl = params.get('return');
  if (returnUrl) saveReturnUrl(returnUrl);

  const emailInput = form.querySelector<HTMLInputElement>('#login-email');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const email = (data.get('email') as string).trim();
    if (!email) return;

    if (successEl) successEl.hidden = true;
    if (errorEl) errorEl.hidden = true;
    if (emailInput) emailInput.setAttribute('aria-invalid', 'false');
    const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = supabaseConfigured ? 'Отправляем…' : 'Входим…';

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback/`,
      },
    });

    if (error) {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.textContent = supabaseConfigured ? 'Получить ссылку' : 'Войти';
      if (emailInput) emailInput.setAttribute('aria-invalid', 'true');
      if (errorEl) {
        errorEl.textContent = `Ошибка: ${error.message}`;
        errorEl.hidden = false;
      }
      return;
    }

    if (!supabaseConfigured) {
      // В демо-режиме signInWithOtp уже создал сессию — сразу редиректим
      const target = popReturnUrl() || '/me/';
      window.location.replace(target);
      return;
    }

    // Реальный Supabase: показываем «письмо отправлено»
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.textContent = 'Получить ссылку';
    if (emailInput) emailInput.setAttribute('aria-invalid', 'false');
    if (successEl) {
      successEl.querySelector('[data-email]')!.textContent = email;
      successEl.hidden = false;
    }
    form.reset();
  });
}
