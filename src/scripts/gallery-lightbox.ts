// Photo lightbox for the club gallery.
// Opens a full-size view in the shared Modal when a gallery item is clicked.
// Arrow keys (←/→) navigate within the modal; ESC closes (handled by modal-a11y).

import { openModal } from './modal';

interface LightboxState {
  photos: string[];
  index: number;
}

function renderLightbox(state: LightboxState): string {
  const total = state.photos.length;
  const src = state.photos[state.index] ?? '';
  return `
    <div class="lightbox">
      <img src="${src}" alt="" class="lightbox__image" />
      ${total > 1 ? `
        <div class="lightbox__nav" role="group" aria-label="Навигация по фото">
          <button type="button" class="btn btn--ghost lightbox__prev" data-lightbox-prev aria-label="Предыдущее фото">←</button>
          <span class="lightbox__counter" aria-live="polite">${state.index + 1} / ${total}</span>
          <button type="button" class="btn btn--ghost lightbox__next" data-lightbox-next aria-label="Следующее фото">→</button>
        </div>
      ` : ''}
    </div>
  `;
}

function openLightbox(photos: string[], startIndex: number): void {
  const state: LightboxState = { photos, index: Math.max(0, Math.min(startIndex, photos.length - 1)) };

  openModal({
    title: 'Фото',
    body: renderLightbox(state),
  });

  function rerender(): void {
    const modalBody = document.getElementById('modal-body');
    if (modalBody) modalBody.innerHTML = renderLightbox(state);
  }

  function next(): void {
    if (state.photos.length < 2) return;
    state.index = (state.index + 1) % state.photos.length;
    rerender();
  }

  function prev(): void {
    if (state.photos.length < 2) return;
    state.index = (state.index - 1 + state.photos.length) % state.photos.length;
    rerender();
  }

  // Event delegation on the modal — survives the rerender swaps
  const modal = document.getElementById('modal');
  if (!modal) return;

  const onClick = (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-lightbox-next]')) next();
    else if (target.closest('[data-lightbox-prev]')) prev();
  };
  const onKey = (e: KeyboardEvent) => {
    if (modal.hidden) {
      // Modal closed — detach
      modal.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      return;
    }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  };

  modal.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
}

/**
 * Set up lightbox for any element with `data-photos` attribute. Uses document-level
 * delegation so dynamically-rendered review galleries (added after page load) work
 * the same way as the SSG'd club gallery.
 *
 * Each photo-set container needs:
 * - data-photos='["url1", "url2", ...]' JSON-encoded URL array
 * - children with data-photo-index="N" attribute (typically a <button>)
 */
export function setupGalleryLightbox(): void {
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-photo-index]') as HTMLElement | null;
    if (!btn) return;
    const container = btn.closest('[data-photos]') as HTMLElement | null;
    if (!container) return;
    let photos: string[] = [];
    try {
      photos = JSON.parse(container.getAttribute('data-photos') ?? '[]');
    } catch {
      return;
    }
    if (photos.length === 0) return;
    const idx = Number(btn.getAttribute('data-photo-index'));
    if (Number.isNaN(idx)) return;
    openLightbox(photos, idx);
  });
}
