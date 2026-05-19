import { supabase } from '../lib/supabase';
import { requireLogin } from '../lib/route-guards';
import { uploadReviewPhoto } from '../lib/photo-upload';
import type { Booking, NewReview } from '../data/supabase-types';

const MAX_REVIEW_PHOTOS = 3;

function show(id: string) {
  const el = document.getElementById(id);
  if (el) el.hidden = false;
}
function hide(id: string) {
  const el = document.getElementById(id);
  if (el) el.hidden = true;
}

function setRating(value: number) {
  const hidden = document.querySelector<HTMLInputElement>('input[name="rating"]');
  if (hidden) hidden.value = String(value);
  const group = document.querySelector<HTMLElement>('[role="radiogroup"]');
  if (group) updateRatingStarsState(group, value);
}

function updateRatingStarsState(group: HTMLElement, n: number) {
  group.querySelectorAll<HTMLButtonElement>('[role="radio"]').forEach((b, i) => {
    const v = i + 1;
    b.setAttribute('aria-checked', v === n ? 'true' : 'false');
    b.setAttribute('tabindex', v === n ? '0' : '-1');
    b.classList.toggle('is-active', v <= n);
  });
}

function setupRatingStarsKeyboard(group: HTMLElement, onChange: (n: number) => void) {
  const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  group.addEventListener('keydown', (e) => {
    const current = document.activeElement as HTMLButtonElement;
    const idx = buttons.indexOf(current);
    if (idx === -1) return;
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % buttons.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + buttons.length) % buttons.length;
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const n = Number(current.dataset.ratingValue);
      onChange(n);
      return;
    } else return;
    e.preventDefault();
    buttons.forEach((b, i) => b.setAttribute('tabindex', i === next ? '0' : '-1'));
    buttons[next].focus();
    const n = Number(buttons[next].dataset.ratingValue);
    onChange(n);
  });
}

function translateError(msg: string): string {
  if (/violates row-level security/i.test(msg)) return 'Отзыв можно оставить только на завершённую бронь.';
  if (/duplicate key/i.test(msg)) return 'Отзыв на эту бронь уже есть.';
  if (/check constraint.*rating/i.test(msg)) return 'Выбери оценку от 1 до 5.';
  if (/check constraint.*text/i.test(msg)) return 'Комментарий: от 10 до 1000 символов.';
  return `Не удалось сохранить: ${msg}`;
}

export async function setupReviewsForm(): Promise<void> {
  const root = document.getElementById('review-form-root');
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const bookingId = params.get('booking_id');
  if (!bookingId) {
    hide('review-loading');
    show('review-not-eligible');
    return;
  }

  const { user } = await requireLogin();
  if (!user) return; // requireLogin redirected

  // Fetch booking — RLS allows owner to read.
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, user_id, club_slug, club_name, date, status')
    .eq('id', bookingId)
    .single();
  if (bErr || !booking || booking.user_id !== user.id || booking.status !== 'completed') {
    hide('review-loading');
    show('review-not-eligible');
    return;
  }
  const b = booking as Pick<Booking, 'id' | 'user_id' | 'club_slug' | 'club_name' | 'date' | 'status'>;

  // Check if a review already exists for this booking.
  const { data: existing } = await supabase
    .from('reviews')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (existing) {
    hide('review-loading');
    show('review-already');
    return;
  }

  // Render form.
  hide('review-loading');
  const ctx = document.getElementById('review-context');
  if (ctx) ctx.textContent = `${b.club_name} · ${b.date}`;
  show('review-form-block');

  // Star picker interactions
  document.querySelectorAll<HTMLButtonElement>('.rating-stars__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = Number(btn.getAttribute('data-rating-value'));
      setRating(v);
    });
  });
  const ratingGroup = document.querySelector<HTMLElement>('[role="radiogroup"]');
  if (ratingGroup) {
    setupRatingStarsKeyboard(ratingGroup, (n) => setRating(n));
  }

  // Char counter
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea[name="text"]');
  const counter = document.getElementById('char-count');
  textarea?.addEventListener('input', () => {
    if (counter) counter.textContent = String(textarea.value.length);
  });

  // Photo picker — uploads to review-photos bucket, accumulates URL list
  const photoInput = document.getElementById('review-photo-input') as HTMLInputElement | null;
  const photoPickBtn = document.getElementById('review-photo-pick') as HTMLButtonElement | null;
  const photoThumbs = document.getElementById('review-photo-thumbs') as HTMLUListElement | null;
  const photoStatus = document.getElementById('review-photo-status') as HTMLElement | null;
  const photoUrls: string[] = [];

  function renderThumbs(): void {
    if (!photoThumbs) return;
    photoThumbs.innerHTML = photoUrls.map((url, i) => `
      <li class="review-form__photo-thumb">
        <img src="${url}" alt="" loading="lazy" />
        <button type="button" class="btn btn--ghost btn--sm" data-remove-photo="${i}" aria-label="Удалить фото ${i + 1}">×</button>
      </li>
    `).join('');
    if (photoPickBtn) photoPickBtn.disabled = photoUrls.length >= MAX_REVIEW_PHOTOS;
  }

  photoPickBtn?.addEventListener('click', () => photoInput?.click());

  photoInput?.addEventListener('change', async () => {
    const files = Array.from(photoInput.files ?? []);
    photoInput.value = ''; // allow re-pick of same file
    for (const file of files) {
      if (photoUrls.length >= MAX_REVIEW_PHOTOS) {
        if (photoStatus) photoStatus.textContent = `Максимум ${MAX_REVIEW_PHOTOS} фото.`;
        break;
      }
      if (photoStatus) photoStatus.textContent = `Загружаем ${file.name}…`;
      const result = await uploadReviewPhoto(user.id, file);
      if (!result.ok || !result.publicUrl) {
        if (photoStatus) photoStatus.textContent = `Не удалось загрузить ${file.name}: ${result.error ?? 'unknown'}`;
        continue;
      }
      photoUrls.push(result.publicUrl);
      renderThumbs();
    }
    if (photoStatus && photoUrls.length === MAX_REVIEW_PHOTOS) {
      photoStatus.textContent = `Загружено ${photoUrls.length} из ${MAX_REVIEW_PHOTOS}.`;
    } else if (photoStatus && photoUrls.length > 0) {
      photoStatus.textContent = `Загружено ${photoUrls.length}.`;
    }
  });

  photoThumbs?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-remove-photo]') as HTMLButtonElement | null;
    if (!btn) return;
    const idx = Number(btn.getAttribute('data-remove-photo'));
    if (Number.isNaN(idx)) return;
    photoUrls.splice(idx, 1);
    renderThumbs();
    if (photoStatus) {
      photoStatus.textContent = photoUrls.length > 0 ? `Загружено ${photoUrls.length}.` : '';
    }
  });

  // Submit handler
  const form = document.getElementById('review-submit-form') as HTMLFormElement | null;
  const errorEl = document.getElementById('review-error');
  const textareaEl = document.getElementById('review-text') as HTMLTextAreaElement | null;
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const rating = Number(fd.get('rating') || 0);
    const text = String(fd.get('text') || '').trim();

    if (errorEl) errorEl.hidden = true;
    if (rating < 1 || rating > 5) {
      if (errorEl) { errorEl.textContent = 'Выбери оценку от 1 до 5.'; errorEl.hidden = false; }
      return;
    }
    if (text.length < 10) {
      if (textareaEl) textareaEl.setAttribute('aria-invalid', 'true');
      if (errorEl) { errorEl.textContent = 'Комментарий должен быть от 10 символов.'; errorEl.hidden = false; }
      return;
    }

    if (textareaEl) textareaEl.setAttribute('aria-invalid', 'false');
    const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.setAttribute('aria-busy', 'true'); submitBtn.textContent = 'Публикуем…'; }

    const newRow: NewReview = {
      booking_id: b.id,
      user_id: user.id,
      club_slug: b.club_slug,
      rating,
      text,
      // Only send photo_urls when present. Keeps INSERT working against
      // pre-migration-0020 schema (where the column doesn't exist yet).
      ...(photoUrls.length > 0 ? { photo_urls: photoUrls.slice() } : {}),
    } as NewReview;

    const { error } = await supabase.from('reviews').insert(newRow);

    if (error) {
      if (textareaEl) textareaEl.setAttribute('aria-invalid', 'true');
      if (errorEl) { errorEl.textContent = translateError(error.message); errorEl.hidden = false; }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.removeAttribute('aria-busy'); submitBtn.textContent = 'Опубликовать'; }
      return;
    }

    window.location.href = '/me/';
  });
}
