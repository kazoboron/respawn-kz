export function setupMobileMenu(): void {
  const hamburger = document.getElementById('hamburger');
  const nav = document.getElementById('nav');
  if (!hamburger || !nav) return;

  const close = () => document.body.classList.remove('menu-open');

  hamburger.addEventListener('click', () => {
    document.body.classList.toggle('menu-open');
  });

  nav.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.matches('.nav__link')) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}
