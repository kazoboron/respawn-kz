// Modal accessibility: focus trap, ESC to close, focus restore, inert background.
// Call setupModalA11y() once at app boot. It listens for modal hidden→visible transitions
// via MutationObserver and applies the patterns.

let lastFocused: HTMLElement | null = null;
let trapHandler: ((e: KeyboardEvent) => void) | null = null;

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('hidden') && el.offsetParent !== null);
}

function activateTrap(modal: HTMLElement) {
  lastFocused = document.activeElement as HTMLElement;
  const focusables = getFocusable(modal);
  (focusables[0] ?? modal).focus();

  trapHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      deactivateTrap(modal);
      modal.hidden = true;
      return;
    }
    if (e.key !== 'Tab') return;
    const list = getFocusable(modal);
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement as HTMLElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', trapHandler);

  // Make background inert while modal is open
  document.querySelectorAll('main, footer, header').forEach((el) => {
    (el as HTMLElement).setAttribute('inert', '');
  });
}

function deactivateTrap(_modal: HTMLElement) {
  if (trapHandler) document.removeEventListener('keydown', trapHandler);
  trapHandler = null;
  document.querySelectorAll('main, footer, header').forEach((el) => {
    (el as HTMLElement).removeAttribute('inert');
  });
  lastFocused?.focus();
  lastFocused = null;
}

export function setupModalA11y() {
  const modal = document.getElementById('modal');
  if (!modal) return;
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'hidden') {
        if (modal.hidden) deactivateTrap(modal);
        else activateTrap(modal);
      }
    }
  });
  observer.observe(modal, { attributes: true, attributeFilter: ['hidden'] });
}
