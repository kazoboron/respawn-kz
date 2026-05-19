import { renderHtml, renderText } from './render.ts';
import type { RenderedTemplate } from './types.ts';

const SITE_URL = 'https://respawn.kz';

function escapeHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const e = escapeHtml; // short alias for readability in template literals

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
      <p>Получена новая бронь в клубе <strong>${e(p.club_name)}</strong>.</p>
      <ul>
        <li>Дата: ${e(p.date)}</li>
        <li>Время: ${e(p.time_slot)} (${e(p.hours)} ч)</li>
        <li>Сумма: ${e(p.total_price)} ₸</li>
        <li>Клиент: ${e(p.customer_email)}</li>
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
      <p>Клуб <strong>${e(p.club_name)}</strong> подтвердил твою бронь.</p>
      <ul>
        <li>Дата: ${e(p.date)}</li>
        <li>Время: ${e(p.time_slot)} (${e(p.hours)} ч)</li>
        <li>Сумма: ${e(p.total_price)} ₸</li>
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
      <p>Бронь в клубе <strong>${e(p.club_name)}</strong> на ${e(p.date)} (${e(p.time_slot)}) отменена.</p>
      <p><a href="${SITE_URL}/clubs/${e(p.club_slug)}/">Открыть страницу клуба</a> чтобы забронировать другое время.</p>
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
      <p>Бронь в клубе <strong>${e(p.club_name)}</strong> на ${e(p.date)} завершена.</p>
      <p>Будем рады видеть тебя снова — <a href="${SITE_URL}/clubs/${e(p.club_slug)}/">забронировать ещё</a>.</p>
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
      <p>Клуб <strong>${e(p.club_name)}</strong> отметил бронь на ${e(p.date)} (${e(p.time_slot)}) как несостоявшуюся.</p>
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
      <p>Поступила заявка на регистрацию клуба <strong>${e(p.club_name)}</strong>.</p>
      <ul>
        <li>Город: ${e(p.city)}</li>
        <li>Адрес: ${e(p.address)}</li>
        <li>Контакт: ${e(p.applicant_name)}${p.applicant_phone ? `, ${e(p.applicant_phone)}` : ''}</li>
        <li>Email: ${e(p.applicant_email)}</li>
        ${p.description ? `<li>Описание: ${e(p.description)}</li>` : ''}
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
      <p>Заявка на регистрацию клуба <strong>${e(p.club_name)}</strong> одобрена.</p>
      <p>Теперь клуб доступен для редактирования в твоём кабинете.</p>
      ${p.review_note ? `<p>Комментарий модератора: ${e(p.review_note)}</p>` : ''}
      <p><a href="${SITE_URL}/dashboard/club/edit?slug=${e(p.club_slug)}">Открыть редактор клуба</a></p>
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
      <p>К сожалению, заявка на регистрацию клуба <strong>${e(p.club_name)}</strong> отклонена.</p>
      ${p.review_note ? `<p>Причина: ${e(p.review_note)}</p>` : '<p>Свяжись с поддержкой для подробностей.</p>'}
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
      <p>В клубе <strong>${e(p.club_name)}</strong> оставлен новый отзыв.</p>
      <ul>
        <li>Оценка: ★${e(p.rating)} / 5</li>
        <li>Клиент: ${e(p.customer_email)}</li>
      </ul>
      <blockquote style="border-left: 3px solid #00d4ff; padding-left: 12px; color: #cfcfd9; margin: 16px 0;">
        ${e(p.text)}
      </blockquote>
      <p><a href="${SITE_URL}/clubs/${e(p.club_slug)}/">Открыть страницу клуба</a></p>
    `,
    bodyText: (p) => `
Новый отзыв в клубе ${p.club_name}.
Оценка: ${p.rating}/5
Клиент: ${p.customer_email}

«${p.text}»

Страница клуба: ${SITE_URL}/clubs/${p.club_slug}/
    `,
  },

  booking_rescheduled: {
    subject: (p) => `Бронь изменена — ${p.club_name}`,
    bodyHtml: (p) => `
      <h1>Бронь изменена клиентом</h1>
      <p>Клиент изменил детали брони в клубе <strong>${e(p.club_name)}</strong>.</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr style="color: #8a8a95;">
          <td style="padding: 4px 12px 4px 0;">Было:</td>
          <td><s>${e(p.old_date)} · ${e(p.old_time_slot)} · ${e(p.old_hours)} ч</s></td>
        </tr>
        <tr>
          <td style="padding: 4px 12px 4px 0; color: #00d4ff;">Стало:</td>
          <td><strong>${e(p.new_date)} · ${e(p.new_time_slot)} · ${e(p.new_hours)} ч</strong></td>
        </tr>
      </table>
      <ul>
        <li>Сумма: ${e(p.total_price)} ₸</li>
        <li>Клиент: ${e(p.customer_email)}</li>
      </ul>
      <p>Бронь ожидает подтверждения. <a href="${SITE_URL}/dashboard/bookings/">Открыть в кабинете</a></p>
    `,
    bodyText: (p) => `
Клиент изменил детали брони в клубе ${p.club_name}.

Было: ${p.old_date} · ${p.old_time_slot} · ${p.old_hours} ч
Стало: ${p.new_date} · ${p.new_time_slot} · ${p.new_hours} ч

Сумма: ${p.total_price} ₸
Клиент: ${p.customer_email}

Бронь ожидает подтверждения.
Кабинет: ${SITE_URL}/dashboard/bookings/
    `,
  },

  review_replied: {
    subject: () => `Клуб ответил на твой отзыв — respawn.kz`,
    bodyHtml: (p) => `
      <h1>Клуб ответил на твой отзыв</h1>
      <p>Твой отзыв (★${e(p.review_rating)}/5):</p>
      <blockquote style="border-left: 3px solid #8a8a95; padding-left: 12px; color: #cfcfd9; margin: 16px 0;">
        ${e(p.review_text)}
      </blockquote>
      <p><strong>Ответ клуба:</strong></p>
      <blockquote style="border-left: 3px solid #8b5cf6; padding-left: 12px; color: #cfcfd9; margin: 16px 0;">
        ${e(p.reply_text)}
      </blockquote>
      <p><a href="${SITE_URL}/clubs/${e(p.club_slug)}/#reviews-section">Посмотреть на сайте</a></p>
    `,
    bodyText: (p) => `
Клуб ответил на твой отзыв.

Твой отзыв (${p.review_rating}/5):
«${p.review_text}»

Ответ клуба:
«${p.reply_text}»

Посмотреть на сайте: ${SITE_URL}/clubs/${p.club_slug}/#reviews-section
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
