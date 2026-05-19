/**
 * Tiny scroll-reveal helper. Adds `.is-revealed` class to any element with
 * `data-reveal` when it enters the viewport — used by CSS to trigger
 * fade-up / slide-in animations on landing sections.
 *
 * Respects `prefers-reduced-motion`: in that case, everything is revealed
 * immediately on page load without animation.
 */

export function setupScrollReveal(): void {
  const targets = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (targets.length === 0) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    // No animation — show everything immediately.
    targets.forEach((el) => el.classList.add('is-revealed'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      }
    },
    {
      threshold: 0.1,
      rootMargin: '0px 0px -80px 0px', // trigger slightly before fully in view
    },
  );

  targets.forEach((el) => observer.observe(el));
}
