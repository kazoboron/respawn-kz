export function setupGlitch(): void {
  const target = document.querySelector('.glitch');
  if (!target) return;

  const trigger = () => {
    target.classList.add('is-glitching');
    setTimeout(() => target.classList.remove('is-glitching'), 600);
  };

  setTimeout(trigger, 500);

  const loop = () => {
    const delay = 7000 + Math.random() * 5000;
    setTimeout(() => {
      trigger();
      loop();
    }, delay);
  };
  loop();
}
