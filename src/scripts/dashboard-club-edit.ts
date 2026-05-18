import { supabase } from '../lib/supabase';
import { getRoles } from '../lib/roles';
import { type ClubRow } from '../data/supabase-types';
import { uploadClubPhoto, isUploadedUrl, urlToStoragePath, deleteClubPhoto } from '../lib/photo-upload';
import { triggerSiteRebuild } from '../lib/deploy-trigger';

const DAYS = [
  { key: 'mon', label: 'Понедельник' },
  { key: 'tue', label: 'Вторник' },
  { key: 'wed', label: 'Среда' },
  { key: 'thu', label: 'Четверг' },
  { key: 'fri', label: 'Пятница' },
  { key: 'sat', label: 'Суббота' },
  { key: 'sun', label: 'Воскресенье' },
];

function renderDayRow(dayKey: string, dayLabel: string, hours: { open: string; close: string } | null): string {
  const closed = hours === null;
  const is24h = !closed && hours.open === '24h';
  return `
    <div class="time-picker-day" data-day="${dayKey}">
      <span class="time-picker-day__label">${dayLabel}</span>
      <label class="time-picker-day__check">
        <input type="checkbox" data-day-closed="${dayKey}" ${closed ? 'checked' : ''} />
        Закрыто
      </label>
      <label class="time-picker-day__check">
        <input type="checkbox" data-day-24h="${dayKey}" ${is24h ? 'checked' : ''} ${closed ? 'disabled' : ''} />
        24h
      </label>
      <input type="time" data-day-open="${dayKey}" value="${closed || is24h ? '10:00' : hours.open}" ${closed || is24h ? 'disabled' : ''} />
      <span>—</span>
      <input type="time" data-day-close="${dayKey}" value="${closed || is24h ? '02:00' : hours.close}" ${closed || is24h ? 'disabled' : ''} />
    </div>
  `;
}

function buildTimePicker(workingHours: ClubRow['working_hours']): string {
  return DAYS.map((d) => renderDayRow(d.key, d.label, workingHours[d.key] ?? null)).join('');
}

function readTimePicker(container: HTMLElement): ClubRow['working_hours'] {
  const result: ClubRow['working_hours'] = {};
  DAYS.forEach((d) => {
    const closed = (container.querySelector(`[data-day-closed="${d.key}"]`) as HTMLInputElement).checked;
    if (closed) {
      result[d.key] = null;
      return;
    }
    const is24h = (container.querySelector(`[data-day-24h="${d.key}"]`) as HTMLInputElement).checked;
    if (is24h) {
      result[d.key] = { open: '24h', close: '24h' };
      return;
    }
    const open = (container.querySelector(`[data-day-open="${d.key}"]`) as HTMLInputElement).value;
    const close = (container.querySelector(`[data-day-close="${d.key}"]`) as HTMLInputElement).value;
    result[d.key] = { open, close };
  });
  return result;
}

function attachDayHandlers(container: HTMLElement): void {
  DAYS.forEach((d) => {
    const closed = container.querySelector(`[data-day-closed="${d.key}"]`) as HTMLInputElement;
    const is24h = container.querySelector(`[data-day-24h="${d.key}"]`) as HTMLInputElement;
    const open = container.querySelector(`[data-day-open="${d.key}"]`) as HTMLInputElement;
    const close = container.querySelector(`[data-day-close="${d.key}"]`) as HTMLInputElement;
    closed.addEventListener('change', () => {
      const isClosed = closed.checked;
      is24h.disabled = isClosed;
      if (isClosed) is24h.checked = false;
      open.disabled = isClosed || is24h.checked;
      close.disabled = isClosed || is24h.checked;
    });
    is24h.addEventListener('change', () => {
      const is24 = is24h.checked;
      open.disabled = is24 || closed.checked;
      close.disabled = is24 || closed.checked;
    });
  });
}

function renderPhotoRow(url: string): string {
  if (url && isUploadedUrl(url)) {
    const filename = url.split('/').pop() ?? 'photo';
    return `
      <div class="photos-list__row photos-list__row--uploaded" data-url="${url}">
        <img src="${url}" class="photos-list__thumb" alt="" loading="lazy" />
        <span class="photos-list__name">${filename}</span>
        <button type="button" class="btn btn--ghost btn--sm photos-list__remove" aria-label="Удалить фото">×</button>
      </div>
    `;
  }
  return `
    <div class="photos-list__row photos-list__row--url">
      <input type="url" class="auth-input" value="${url}" placeholder="https://..." />
      <button type="button" class="btn btn--ghost btn--sm photos-list__remove" aria-label="Удалить фото">×</button>
    </div>
  `;
}

function renderUploadingRow(filename: string): string {
  return `
    <div class="photos-list__row photos-list__row--uploading">
      <span class="photos-list__thumb photos-list__thumb--placeholder">⏳</span>
      <span class="photos-list__name">${filename}</span>
      <span style="color:var(--text-muted);font-size:13px">загрузка…</span>
    </div>
  `;
}

function renderErrorRow(filename: string, error: string): string {
  return `
    <div class="photos-list__row photos-list__row--error">
      <span class="photos-list__thumb photos-list__thumb--placeholder" style="color:rgb(248,113,113)">⚠</span>
      <span class="photos-list__name">${filename}</span>
      <span style="color:rgb(248,113,113);font-size:13px">${error}</span>
      <button type="button" class="btn btn--ghost btn--sm photos-list__remove" aria-label="Удалить фото">×</button>
    </div>
  `;
}

export async function setupDashboardClubEdit(): Promise<void> {
  const root = document.getElementById('club-edit-root');
  if (!root) return;

  const loadingEl = document.getElementById('club-edit-loading');
  const errorEl = document.getElementById('club-edit-error');
  const formEl = document.getElementById('club-edit-form') as HTMLFormElement | null;
  const successEl = document.getElementById('club-edit-save-success');
  const saveErrorEl = document.getElementById('club-edit-save-error');
  if (!loadingEl || !errorEl || !formEl || !successEl || !saveErrorEl) return;

  const url = new URL(window.location.href);
  const slug = url.searchParams.get('slug');
  if (!slug) {
    loadingEl.hidden = true;
    errorEl.textContent = 'Нужен параметр ?slug=<club-slug> в URL.';
    errorEl.hidden = false;
    return;
  }

  // Gate: must be logged in + (super-admin OR admin of THIS slug)
  const roles = await getRoles();
  if (!roles.user) {
    window.location.href = `/login/?return=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }
  const isAuthorized = roles.isSuperAdmin || roles.clubSlugs.includes(slug);
  if (!isAuthorized) {
    loadingEl.hidden = true;
    errorEl.textContent = 'Нет доступа к редактированию этого клуба.';
    errorEl.hidden = false;
    return;
  }

  // Load club (RLS allows club_admin / super-admin to see drafts of their own)
  const { data: club, error: loadErr } = await supabase
    .from('clubs')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (loadErr || !club) {
    loadingEl.hidden = true;
    errorEl.textContent = `Клуб не найден: ${loadErr?.message ?? 'no data'}`;
    errorEl.hidden = false;
    return;
  }
  const c = club as ClubRow;

  // Populate form
  (formEl.querySelector('[name="name"]') as HTMLInputElement).value = c.name;
  (formEl.querySelector('[name="city"]') as HTMLSelectElement).value = c.city;
  (formEl.querySelector('[name="district"]') as HTMLInputElement).value = c.district ?? '';
  (formEl.querySelector('[name="address"]') as HTMLInputElement).value = c.address;
  (formEl.querySelector('[name="phone"]') as HTMLInputElement).value = c.phone ?? '';
  (formEl.querySelector('[name="price_per_hour"]') as HTMLInputElement).value = String(c.price_per_hour);
  (formEl.querySelector('[name="description"]') as HTMLTextAreaElement).value = c.description ?? '';
  (formEl.querySelector('[name="gradient"]') as HTMLInputElement).value = c.gradient ?? '';
  (formEl.querySelector('[name="equipment"]') as HTMLTextAreaElement).value = (c.equipment ?? []).join('\n');

  // Tags
  c.tags.forEach((t) => {
    const cb = formEl.querySelector(`input[name="tag"][value="${t}"]`) as HTMLInputElement | null;
    if (cb) cb.checked = true;
  });

  // Time picker
  const picker = document.getElementById('time-picker')!;
  picker.innerHTML = buildTimePicker(c.working_hours ?? {});
  attachDayHandlers(picker);

  // Copy Monday to all
  document.getElementById('copy-mon-to-all')!.addEventListener('click', () => {
    const monClosed = (picker.querySelector('[data-day-closed="mon"]') as HTMLInputElement).checked;
    const mon24 = (picker.querySelector('[data-day-24h="mon"]') as HTMLInputElement).checked;
    const monOpen = (picker.querySelector('[data-day-open="mon"]') as HTMLInputElement).value;
    const monClose = (picker.querySelector('[data-day-close="mon"]') as HTMLInputElement).value;
    DAYS.slice(1).forEach((d) => {
      (picker.querySelector(`[data-day-closed="${d.key}"]`) as HTMLInputElement).checked = monClosed;
      (picker.querySelector(`[data-day-24h="${d.key}"]`) as HTMLInputElement).checked = mon24;
      (picker.querySelector(`[data-day-24h="${d.key}"]`) as HTMLInputElement).disabled = monClosed;
      (picker.querySelector(`[data-day-open="${d.key}"]`) as HTMLInputElement).value = monOpen;
      (picker.querySelector(`[data-day-open="${d.key}"]`) as HTMLInputElement).disabled = monClosed || mon24;
      (picker.querySelector(`[data-day-close="${d.key}"]`) as HTMLInputElement).value = monClose;
      (picker.querySelector(`[data-day-close="${d.key}"]`) as HTMLInputElement).disabled = monClosed || mon24;
    });
  });

  // Photos
  const photosList = document.getElementById('photos-list')!;
  const fileInput = document.getElementById('photo-file-input') as HTMLInputElement;
  const pickBtn = document.getElementById('photo-pick-btn')!;
  const addUrlBtn = document.getElementById('add-photo-url')!;
  const uploader = document.getElementById('photos-uploader')!;

  function renderAllPhotos(urls: string[]) {
    photosList.innerHTML = urls.map(renderPhotoRow).join('');
  }
  renderAllPhotos(c.photos ?? []);

  async function handleFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (photosList.children.length >= 6) {
        alert('Максимум 6 фото');
        break;
      }
      const placeholder = document.createElement('div');
      placeholder.innerHTML = renderUploadingRow(file.name);
      const row = placeholder.firstElementChild!;
      photosList.appendChild(row);

      const result = await uploadClubPhoto(slug!, file);
      if (result.ok && result.publicUrl) {
        const newRow = document.createElement('div');
        newRow.innerHTML = renderPhotoRow(result.publicUrl);
        row.replaceWith(newRow.firstElementChild!);
      } else {
        const errRow = document.createElement('div');
        errRow.innerHTML = renderErrorRow(file.name, result.error ?? 'unknown');
        row.replaceWith(errRow.firstElementChild!);
      }
    }
  }

  pickBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files) handleFiles(fileInput.files);
    fileInput.value = '';  // reset so same file can re-pick
  });

  addUrlBtn.addEventListener('click', () => {
    if (photosList.children.length >= 6) {
      alert('Максимум 6 фото');
      return;
    }
    photosList.insertAdjacentHTML('beforeend', renderPhotoRow(''));
  });

  // Drag-drop on the uploader strip
  uploader.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploader.classList.add('photos-uploader--drag');
  });
  uploader.addEventListener('dragleave', () => {
    uploader.classList.remove('photos-uploader--drag');
  });
  uploader.addEventListener('drop', async (e) => {
    e.preventDefault();
    uploader.classList.remove('photos-uploader--drag');
    if (e.dataTransfer?.files) await handleFiles(e.dataTransfer.files);
  });

  // Remove handler: delete from Storage if uploaded
  photosList.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('.photos-list__remove');
    if (!btn) return;
    const row = btn.parentElement;
    if (!row) return;
    const uploadedUrl = row.getAttribute('data-url');
    row.remove();
    if (uploadedUrl) {
      const path = urlToStoragePath(uploadedUrl);
      if (path) {
        deleteClubPhoto(path).catch((err) => console.warn('[edit] storage delete failed', err));
      }
    }
  });

  // Publication toggle visible only to super-admin
  if (roles.isSuperAdmin) {
    const pubSection = document.getElementById('publish-section')!;
    pubSection.hidden = false;
    (pubSection.querySelector('[name="is_published"]') as HTMLInputElement).checked = c.is_published;
  }

  loadingEl.hidden = true;
  formEl.hidden = false;

  // Submit
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    successEl.hidden = true;
    saveErrorEl.hidden = true;

    const tags = Array.from(formEl.querySelectorAll('input[name="tag"]:checked'))
      .map((el) => (el as HTMLInputElement).value);
    const equipment = (formEl.querySelector('[name="equipment"]') as HTMLTextAreaElement).value
      .split('\n').map((s) => s.trim()).filter(Boolean);
    // Collect photo URLs from both uploaded rows (data-url) and url-input rows
    const photoUrls: string[] = [];
    photosList.querySelectorAll('.photos-list__row').forEach((row) => {
      const uploadedUrl = row.getAttribute('data-url');
      if (uploadedUrl) {
        photoUrls.push(uploadedUrl);
        return;
      }
      const urlInput = row.querySelector('input[type="url"]') as HTMLInputElement | null;
      if (urlInput && urlInput.value.trim()) {
        photoUrls.push(urlInput.value.trim());
      }
    });
    const workingHours = readTimePicker(picker);

    const patch: Record<string, unknown> = {
      name: (formEl.querySelector('[name="name"]') as HTMLInputElement).value.trim(),
      city: (formEl.querySelector('[name="city"]') as HTMLSelectElement).value,
      district: (formEl.querySelector('[name="district"]') as HTMLInputElement).value.trim() || null,
      address: (formEl.querySelector('[name="address"]') as HTMLInputElement).value.trim(),
      phone: (formEl.querySelector('[name="phone"]') as HTMLInputElement).value.trim() || null,
      price_per_hour: Number((formEl.querySelector('[name="price_per_hour"]') as HTMLInputElement).value),
      description: (formEl.querySelector('[name="description"]') as HTMLTextAreaElement).value.trim() || null,
      gradient: (formEl.querySelector('[name="gradient"]') as HTMLInputElement).value.trim() || null,
      tags,
      equipment,
      photos: photoUrls,
      working_hours: workingHours,
      updated_at: new Date().toISOString(),
    };

    if (roles.isSuperAdmin) {
      patch.is_published = (document.querySelector('[name="is_published"]') as HTMLInputElement).checked;
    }

    const submitBtn = formEl.querySelector('button[type="submit"]') as HTMLButtonElement;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Сохраняем…';

    const { error: updateErr } = await supabase.from('clubs').update(patch).eq('slug', slug);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Сохранить';

    if (updateErr) {
      saveErrorEl.textContent = `Не удалось сохранить: ${updateErr.message}`;
      saveErrorEl.hidden = false;
      saveErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Mark required fields that are empty as invalid
      formEl.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[required]').forEach((el) => {
        if (!el.value.trim()) el.setAttribute('aria-invalid', 'true');
      });
      return;
    }

    // Clear aria-invalid on successful save
    formEl.querySelectorAll<HTMLElement>('[aria-invalid]').forEach((el) => {
      el.setAttribute('aria-invalid', 'false');
    });

    // Optimistic: assume rebuild trigger works. Real failure logged but not user-visible.
    successEl.innerHTML = '<strong>Сохранено!</strong> Сайт обновится через 1-2 минуты.';
    successEl.hidden = false;
    // Scroll the success banner into view (it sits right above the Save button at
    // the bottom of the form). Previously we scrolled to top — that moved the
    // banner OUT of view on long forms with photos.
    successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Fire-and-forget rebuild trigger via Supabase Edge Function → GitHub Actions
    triggerSiteRebuild(`club edit: ${slug}`).then((r) => {
      if (!r.ok) console.warn('[edit] deploy trigger failed:', r.error);
    });
  });
}
