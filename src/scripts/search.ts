import { CITY_LABELS } from '../data/cities';
import { openModal } from './modal';

export function setupSearchForm(): void {
  const form = document.getElementById('search-form') as HTMLFormElement | null;
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const city = (data.get('city') as string) || '';
    const date = (data.get('date') as string) || '—';
    const time = (data.get('time') as string) || 'любое время';

    const cityLabel = city ? CITY_LABELS[city] : 'Все города';
    const dateLabel =
      date && date !== '—'
        ? new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
        : '—';

    const count = Math.floor(3 + Math.random() * 9);

    openModal({
      title: `Найдено ${count} клубов`,
      body: `
        <p><span class="modal__highlight">${cityLabel}</span> · <span class="modal__highlight">${dateLabel}</span> · <span class="modal__highlight">${time}</span></p>
        <p style="margin-top:12px">Это демо-версия лендинга. В полной версии здесь будет список доступных слотов с возможностью бронирования.</p>
      `,
    });
  });
}

export function setupTimeSelect(): void {
  const select = document.getElementById('time-select');
  if (!select) return;
  const options = ['<option value="">Любое</option>'];
  for (let h = 0; h < 24; h++) {
    const value = `${String(h).padStart(2, '0')}:00`;
    options.push(`<option value="${value}">${value}</option>`);
  }
  select.innerHTML = options.join('');
}

export function setupDateDefault(): void {
  const input = document.querySelector('input[name="date"]') as HTMLInputElement | null;
  if (!input) return;
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  input.value = `${yyyy}-${mm}-${dd}`;
  input.min = `${yyyy}-${mm}-${dd}`;
}
