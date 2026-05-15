import { openModal } from './modal';

export function setupClubApplication(): void {
  const form = document.getElementById('club-application-form') as HTMLFormElement | null;
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const clubName = data.get('club-name') as string;

    openModal({
      title: 'Заявка принята',
      body: `
        <p>Спасибо! Заявка от <strong>${clubName}</strong> получена.</p>
        <p style="margin-top:12px">Менеджер свяжется с вами в течение рабочего дня — поможет настроить расписание клуба, цены и фото. Подключение бесплатное.</p>
        <p style="margin-top:12px;color:var(--text-muted)">Это демо-форма — реальная отправка появится в продакшен-версии платформы.</p>
      `,
    });
    form.reset();
  });
}
