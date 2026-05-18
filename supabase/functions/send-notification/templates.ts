import { renderHtml, renderText } from './render.ts';
import type { RenderedTemplate } from './types.ts';

const SITE_URL = 'https://respawn.kz';

type TemplateDef = {
  subject: (p: Record<string, unknown>) => string;
  bodyHtml: (p: Record<string, unknown>) => string;
  bodyText: (p: Record<string, unknown>) => string;
};

const TEMPLATES: Record<string, TemplateDef> = {
  booking_created: {
    subject: (p) => `Новая бронь — ${p.club_name}, ${p.date}`,
    bodyHtml: (p) => `
      <h1>Новая бронь</h1>
      <p>Получена новая бронь в клубе <strong>${p.club_name}</strong>.</p>
      <ul>
        <li>Дата: ${p.date}</li>
        <li>Время: ${p.time_slot} (${p.hours} ч)</li>
        <li>Сумма: ${p.total_price} ₸</li>
        <li>Клиент: ${p.customer_email}</li>
      </ul>
      <p><a href="${SITE_URL}/dashboard/bookings/">Открыть в кабинете</a> чтобы подтвердить или отклонить.</p>
    `,
    bodyText: (p) => `
Новая бронь в клубе ${p.club_name}.
Дата: ${p.date}
Время: ${p.time_slot} (${p.hours} ч)
Сумма: ${p.total_price} ₸
Клиент: ${p.customer_email}

Управление: ${SITE_URL}/dashboard/bookings/
    `,
  },

  booking_confirmed: {
    subject: (p) => `Бронь подтверждена — ${p.club_name}, ${p.date}`,
    bodyHtml: (p) => `
      <h1>Бронь подтверждена</h1>
      <p>Клуб <strong>${p.club_name}</strong> подтвердил твою бронь.</p>
      <ul>
        <li>Дата: ${p.date}</li>
        <li>Время: ${p.time_slot} (${p.hours} ч)</li>
        <li>Сумма: ${p.total_price} ₸</li>
      </ul>
      <p><a href="${SITE_URL}/me/">Открыть личный кабинет</a></p>
    `,
    bodyText: (p) => `
Клуб ${p.club_name} подтвердил твою бронь.
Дата: ${p.date}
Время: ${p.time_slot} (${p.hours} ч)
Сумма: ${p.total_price} ₸

Личный кабинет: ${SITE_URL}/me/
    `,
  },

  booking_cancelled: {
    subject: (p) => `Бронь отменена — ${p.club_name}, ${p.date}`,
    bodyHtml: (p) => `
      <h1>Бронь отменена</h1>
      <p>Бронь в клубе <strong>${p.club_name}</strong> на ${p.date} (${p.time_slot}) отменена.</p>
      <p><a href="${SITE_URL}/clubs/${p.club_slug}/">Открыть страницу клуба</a> чтобы забронировать другое время.</p>
    `,
    bodyText: (p) => `
Бронь в клубе ${p.club_name} на ${p.date} (${p.time_slot}) отменена.

Страница клуба: ${SITE_URL}/clubs/${p.club_slug}/
    `,
  },

  booking_completed: {
    subject: (p) => `Спасибо за визит — ${p.club_name}`,
    bodyHtml: (p) => `
      <h1>Спасибо за визит!</h1>
      <p>Бронь в клубе <strong>${p.club_name}</strong> на ${p.date} завершена.</p>
      <p>Будем рады видеть тебя снова — <a href="${SITE_URL}/clubs/${p.club_slug}/">забронировать ещё</a>.</p>
    `,
    bodyText: (p) => `
Спасибо за визит! Бронь в клубе ${p.club_name} на ${p.date} завершена.

Забронировать ещё: ${SITE_URL}/clubs/${p.club_slug}/
    `,
  },

  booking_no_show: {
    subject: (p) => `Бронь отмечена как no-show — ${p.club_name}`,
    bodyHtml: (p) => `
      <h1>Бронь отмечена как no-show</h1>
      <p>Клуб <strong>${p.club_name}</strong> отметил бронь на ${p.date} (${p.time_slot}) как несостоявшуюся.</p>
      <p>Если это ошибка — свяжись с клубом напрямую.</p>
    `,
    bodyText: (p) => `
Клуб ${p.club_name} отметил бронь на ${p.date} (${p.time_slot}) как несостоявшуюся.
Если это ошибка — свяжись с клубом напрямую.
    `,
  },

  application_submitted: {
    subject: (p) => `Новая заявка клуба — ${p.club_name}`,
    bodyHtml: (p) => `
      <h1>Новая заявка</h1>
      <p>Поступила заявка на регистрацию клуба <strong>${p.club_name}</strong>.</p>
      <ul>
        <li>Город: ${p.city}</li>
        <li>Адрес: ${p.address}</li>
        <li>Контакт: ${p.applicant_name}${p.applicant_phone ? `, ${p.applicant_phone}` : ''}</li>
        <li>Email: ${p.applicant_email}</li>
        ${p.description ? `<li>Описание: ${p.description}</li>` : ''}
      </ul>
      <p><a href="${SITE_URL}/admin/applications/">Открыть очередь модерации</a></p>
    `,
    bodyText: (p) => `
Новая заявка на регистрацию клуба ${p.club_name}.
Город: ${p.city}
Адрес: ${p.address}
Контакт: ${p.applicant_name}${p.applicant_phone ? `, ${p.applicant_phone}` : ''}
Email: ${p.applicant_email}
${p.description ? `Описание: ${p.description}\n` : ''}

Модерация: ${SITE_URL}/admin/applications/
    `,
  },

  application_approved: {
    subject: (p) => `Заявка одобрена — ${p.club_name}`,
    bodyHtml: (p) => `
      <h1>Заявка одобрена</h1>
      <p>Заявка на регистрацию клуба <strong>${p.club_name}</strong> одобрена.</p>
      <p>Теперь клуб доступен для редактирования в твоём кабинете.</p>
      ${p.review_note ? `<p>Комментарий модератора: ${p.review_note}</p>` : ''}
      <p><a href="${SITE_URL}/dashboard/club/edit?slug=${p.club_slug}">Открыть редактор клуба</a></p>
    `,
    bodyText: (p) => `
Заявка на регистрацию клуба ${p.club_name} одобрена.
Клуб доступен для редактирования в твоём кабинете.
${p.review_note ? `Комментарий модератора: ${p.review_note}\n` : ''}

Редактор: ${SITE_URL}/dashboard/club/edit?slug=${p.club_slug}
    `,
  },

  application_rejected: {
    subject: (p) => `Заявка отклонена — ${p.club_name}`,
    bodyHtml: (p) => `
      <h1>Заявка отклонена</h1>
      <p>К сожалению, заявка на регистрацию клуба <strong>${p.club_name}</strong> отклонена.</p>
      ${p.review_note ? `<p>Причина: ${p.review_note}</p>` : '<p>Свяжись с поддержкой для подробностей.</p>'}
      <p><a href="${SITE_URL}/dashboard/register/">Подать новую заявку</a></p>
    `,
    bodyText: (p) => `
Заявка на регистрацию клуба ${p.club_name} отклонена.
${p.review_note ? `Причина: ${p.review_note}\n` : 'Свяжись с поддержкой для подробностей.\n'}

Подать новую заявку: ${SITE_URL}/dashboard/register/
    `,
  },

  review_created: {
    subject: (p) => `Новый отзыв в ${p.club_name ?? 'клубе'} — ★${p.rating}`,
    bodyHtml: (p) => `
      <h1>Новый отзыв</h1>
      <p>В клубе <strong>${p.club_name}</strong> оставлен новый отзыв.</p>
      <ul>
        <li>Оценка: ★${p.rating} / 5</li>
        <li>Клиент: ${p.customer_email}</li>
      </ul>
      <blockquote style="border-left: 3px solid #00d4ff; padding-left: 12px; color: #cfcfd9; margin: 16px 0;">
        ${p.text}
      </blockquote>
      <p><a href="${SITE_URL}/clubs/${p.club_slug}/">Открыть страницу клуба</a></p>
    `,
    bodyText: (p) => `
Новый отзыв в клубе ${p.club_name}.
Оценка: ${p.rating}/5
Клиент: ${p.customer_email}

«${p.text}»

Страница клуба: ${SITE_URL}/clubs/${p.club_slug}/
    `,
  },
};

export function renderTemplate(
  eventType: string,
  payload: Record<string, unknown>,
): RenderedTemplate | null {
  const tpl = TEMPLATES[eventType];
  if (!tpl) return null;
  return {
    subject: tpl.subject(payload),
    html: renderHtml(tpl.bodyHtml(payload)),
    text: renderText(tpl.bodyText(payload)),
  };
}
