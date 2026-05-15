const STORAGE_KEY = 'respawn.cookies.consent';

type Consent = 'accepted' | 'declined';

function getConsent(): Consent | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'accepted' || v === 'declined') return v;
    return null;
  } catch {
    return null;
  }
}

function setConsent(v: Consent): void {
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {}
}

export function setupCookieBanner(): void {
  if (getConsent() !== null) return; // уже отвечал — не показываем

  const banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Согласие на cookies');
  banner.innerHTML = `
    <div class="cookie-banner__inner">
      <p class="cookie-banner__text">
        Мы используем функциональные cookies для сохранения сессии. Аналитики и маркетинга нет.
        Подробнее — в <a href="/privacy/">политике конфиденциальности</a>.
      </p>
      <div class="cookie-banner__actions">
        <button type="button" class="btn btn--ghost cookie-banner__btn" data-consent="declined">Только необходимые</button>
        <button type="button" class="btn btn--primary cookie-banner__btn" data-consent="accepted">Принять</button>
      </div>
    </div>
  `;

  document.body.appendChild(banner);

  // animate in
  requestAnimationFrame(() => {
    banner.classList.add('is-visible');
  });

  banner.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('[data-consent]') as HTMLElement | null;
    if (!btn) return;
    const choice = btn.getAttribute('data-consent') as Consent;
    setConsent(choice);
    banner.classList.remove('is-visible');
    setTimeout(() => banner.remove(), 300);
  });
}
