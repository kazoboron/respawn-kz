import { CLUBS } from '../data/clubs';
import { openModal } from './modal';

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}

export function setupBookingButtons(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('[data-book]') as HTMLElement | null;
    if (!btn) return;
    const slug = btn.getAttribute('data-book');
    const club = CLUBS.find((c) => c.slug === slug || c.name === slug);
    if (!club) return;

    openModal({
      title: `Бронирование — ${club.name}`,
      body: `
        <p><strong>${club.name}</strong> · ${club.district} · ${club.address}</p>
        <p style="margin-top:8px">Цена: <span class="modal__highlight">${formatPrice(club.price)} ₸/час</span></p>
        <div class="modal__qr">
          QR-код придёт на email после оплаты<br />
          <span style="color:var(--neon-cyan)">▢▢▢▢▢ ▢▢▢▢▢</span>
        </div>
        <p>Это демо-версия — реальное бронирование появится в продакшен-версии платформы.</p>
      `,
    });
  });
}
