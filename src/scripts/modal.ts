interface ModalContent {
  title: string;
  body: string;
}

export function openModal({ title, body }: ModalContent): void {
  const modal = document.getElementById('modal');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  if (!modal || !titleEl || !bodyEl) return;
  titleEl.textContent = title;
  bodyEl.innerHTML = body;
  modal.hidden = false;
  document.body.classList.add('modal-open');
}

export function closeModal(): void {
  const modal = document.getElementById('modal');
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove('modal-open');
}

export function setupModal(): void {
  const modal = document.getElementById('modal');
  if (!modal) return;

  modal.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.hasAttribute('data-modal-close')) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });
}
