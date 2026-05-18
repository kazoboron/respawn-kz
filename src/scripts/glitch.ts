export function setupGlitch(): void {
  const target = document.querySelector('.glitch');
  if (!target) return;

  // Use rAF to batch classList changes in the compositor frame, avoiding forced reflow.
  const trigger = () => {
    requestAnimationFrame(() => {
      target.classList.add('is-glitching');
      setTimeout(() => requestAnimationFrame(() => target.classList.remove('is-glitching')), 600);
    });
  };

  // Delay first trigger past LCP window (>2.5s) so it doesn't interfere with scoring.
  setTimeout(trigger, 2500);

  const loop = () => {
    const delay = 7000 + Math.random() * 5000;
    setTimeout(() => {
      trigger();
      loop();
    }, delay);
  };
  loop();
}
