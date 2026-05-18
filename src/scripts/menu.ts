export function setupMobileMenu(): void {
  const hamburger = document.getElementById('hamburger');
  const nav = document.getElementById('nav');
  if (!hamburger || !nav) return;

  const close = () => {
    document.body.classList.remove('menu-open');
    hamburger.setAttribute('aria-expanded', 'false');
  };

  hamburger.addEventListener('click', () => {
    const isOpen = document.body.classList.toggle('menu-open');
    hamburger.setAttribute('aria-expanded', String(isOpen));
  });

  nav.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.matches('.nav__link')) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}
