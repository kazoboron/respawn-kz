# respawn.kz Photo Upload + Auto-rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace external-URL-only photos input on `/dashboard/club/edit` with a real file upload to Supabase Storage; on save, fire a Cloudflare Pages deploy hook so the catalog reflects changes within ~60 seconds.

**Architecture:** New Storage bucket `club-photos` (public-read, RLS-gated write by club_admin or super_admin matching the path's `{slug}` folder). Client uploads files via `supabase.storage.from('club-photos').upload(...)`. Public URLs stored in `clubs.photos[]` as before — backward compat with external URLs preserved. After successful save, fire-and-forget POST to `PUBLIC_CF_DEPLOY_HOOK_URL` triggers a CF Pages rebuild.

**Tech Stack:** Astro 4.16, Supabase Storage (separate API from Postgres), Cloudflare Pages Deploy Hooks, vanilla CSS.

**Reference spec:** `docs/superpowers/specs/2026-05-17-respawn-kz-photo-upload-and-auto-rebuild-design.md`

**Important context for implementer:**
- Project has no test framework. Verify via `npm run build` + `npx astro check` + manual smoke.
- Sub-projects 1-3 are in prod. This is a small, additive enhancement.
- Branch: `feat/photo-upload-and-auto-rebuild` (from main).
- Git author: `Claude <noreply@anthropic.com>` via inline `-c` flags.
- DATABASE_URL handled by controller for migration application.
- Two user-action steps (creating CF deploy hook + setting env var) happen between subagent batches.

---

## File Structure

### Created (3)
- `supabase/migrations/0011_storage_setup.sql`
- `src/lib/photo-upload.ts`
- `src/lib/deploy-trigger.ts`

### Modified (5)
- `src/pages/dashboard/club/edit.astro`
- `src/scripts/dashboard-club-edit.ts`
- `src/styles/global.css`
- `.env.example`
- `supabase/apply_clubs.sql` (add 0011 to documented deploy sequence)

### Branch
- `feat/photo-upload-and-auto-rebuild` (from main)

---

## Task 1: Create branch + Migration 0011 (Storage bucket + RLS)

**Files:**
- Create: `supabase/migrations/0011_storage_setup.sql`

- [ ] **Step 1: Branch off main**

```bash
git checkout main
git pull origin main
git checkout -b feat/photo-upload-and-auto-rebuild
```

- [ ] **Step 2: Create migration**

Create `supabase/migrations/0011_storage_setup.sql` with EXACT content:

```sql
-- Migration 0011: club-photos storage bucket + RLS
-- 3 MB max per file, JPEG/PNG/WebP only. Public read, RLS write by club_admins.

-- 1. Bucket (idempotent: ON CONFLICT updates settings without recreating)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'club-photos',
  'club-photos',
  true,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2. RLS policies on storage.objects, scoped to bucket_id = 'club-photos'

-- Public READ (anon + authenticated)
drop policy if exists "anyone reads club-photos" on storage.objects;
create policy "anyone reads club-photos" on storage.objects
  for select using (bucket_id = 'club-photos');

-- INSERT: authenticated + (super_admin OR club_admin of {slug} folder)
drop policy if exists "club_admins upload to their slug folder" on storage.objects;
create policy "club_admins upload to their slug folder" on storage.objects
  for insert
  with check (
    bucket_id = 'club-photos'
    and auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.club_admins
        where user_id = auth.uid()
          and club_slug = (storage.foldername(name))[1]
      )
    )
  );

-- DELETE: same gate
drop policy if exists "club_admins delete their slug folder" on storage.objects;
create policy "club_admins delete their slug folder" on storage.objects
  for delete using (
    bucket_id = 'club-photos'
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.club_admins
        where user_id = auth.uid()
          and club_slug = (storage.foldername(name))[1]
      )
    )
  );

-- UPDATE (e.g., metadata changes via upsert): same gate
drop policy if exists "club_admins update their slug folder" on storage.objects;
create policy "club_admins update their slug folder" on storage.objects
  for update using (
    bucket_id = 'club-photos'
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.club_admins
        where user_id = auth.uid()
          and club_slug = (storage.foldername(name))[1]
      )
    )
  );
```

- [ ] **Step 3: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add supabase/migrations/0011_storage_setup.sql
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(db): add club-photos storage bucket + RLS (migration 0011)

Bucket public-read with 3 MB limit, jpeg/png/webp only. RLS allows
authenticated club_admins (matching path's {slug} folder) and
super_admins to INSERT/UPDATE/DELETE. Path convention:
{slug}/{timestamp}-{filename}.{ext}

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## CONTROLLER STEP (after Task 1): Apply migration 0011

```bash
DATABASE_URL="..." node scripts/apply-sql.mjs supabase/migrations/0011_storage_setup.sql
```

Verify:
```sql
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id='club-photos';
-- expected: 1 row with public=true, file_size_limit=3145728, mime types as array

select policyname from pg_policies where tablename='objects' and schemaname='storage';
-- expected: includes the 4 'club-photos' policies
```

---

## Task 2: photo-upload.ts + deploy-trigger.ts

**Files:**
- Create: `src/lib/photo-upload.ts`
- Create: `src/lib/deploy-trigger.ts`

- [ ] **Step 1: photo-upload.ts**

Create `src/lib/photo-upload.ts` with EXACT content:

```ts
import { supabase } from './supabase';

const BUCKET = 'club-photos';
const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

export interface UploadResult {
  ok: boolean;
  publicUrl?: string;
  storagePath?: string;
  error?: string;
}

export async function uploadClubPhoto(slug: string, file: File): Promise<UploadResult> {
  if (file.size > MAX_BYTES) {
    return { ok: false, error: 'Фото больше 3 МБ. Сожми его и попробуй снова.' };
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return { ok: false, error: 'Только JPEG, PNG или WebP.' };
  }

  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '_');
  const ext = safeName.split('.').pop() ?? 'jpg';
  const base = safeName.replace(/\.[^.]+$/, '');
  const path = `${slug}/${Date.now()}-${base}.${ext}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error || !data) return { ok: false, error: error?.message ?? 'upload failed' };

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return { ok: true, publicUrl: urlData.publicUrl, storagePath: data.path };
}

/** Extract the storage path from a public URL, or null if not a Storage URL. */
export function urlToStoragePath(url: string): string | null {
  const m = url.match(/\/storage\/v1\/object\/public\/club-photos\/(.+)$/);
  return m ? m[1] : null;
}

export function isUploadedUrl(url: string): boolean {
  return urlToStoragePath(url) !== null;
}

export async function deleteClubPhoto(storagePath: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
```

- [ ] **Step 2: deploy-trigger.ts**

Create `src/lib/deploy-trigger.ts` with EXACT content:

```ts
const HOOK_URL = import.meta.env.PUBLIC_CF_DEPLOY_HOOK_URL;

export async function triggerSiteRebuild(): Promise<{ ok: boolean; error?: string }> {
  if (!HOOK_URL) {
    console.warn('[deploy-trigger] PUBLIC_CF_DEPLOY_HOOK_URL not set, skipping rebuild');
    return { ok: false, error: 'Hook URL not configured' };
  }
  try {
    const response = await fetch(HOOK_URL, { method: 'POST' });
    if (!response.ok) {
      return { ok: false, error: `${response.status} ${response.statusText}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
```

- [ ] **Step 3: Verify TS**

```bash
npx astro check 2>&1 | tail -5
```

Expected: 0 errors (pre-existing JSON-LD hint OK).

- [ ] **Step 4: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add src/lib/photo-upload.ts src/lib/deploy-trigger.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(lib): photo-upload + deploy-trigger helpers

photo-upload.ts: client-side guards (3 MB / image MIME) + upload to
'club-photos/{slug}/{timestamp}-{filename}' + getPublicUrl + delete.
urlToStoragePath/isUploadedUrl helpers to distinguish uploaded vs
external URLs.

deploy-trigger.ts: fire-and-forget POST to CF Pages deploy hook.
Graceful no-op if env var not set.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Update .env.example + apply_clubs.sql doc

**Files:**
- Modify: `.env.example`
- Modify: `supabase/apply_clubs.sql`

- [ ] **Step 1: .env.example**

Read current `.env.example`. Append at the end:

```
# Cloudflare Pages deploy hook URL — triggered after club edit save.
# Get it from: CF Pages → respawn-kz → Settings → Builds & deploys → Deploy Hooks.
# Format: https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/{uuid}
PUBLIC_CF_DEPLOY_HOOK_URL=
```

- [ ] **Step 2: apply_clubs.sql**

Open `supabase/apply_clubs.sql`. Find the line:
```
--   5. node scripts/apply-sql.mjs supabase/migrations/0010_fix_super_admins_rls.sql
```

Add a 6th line immediately after:
```
--   6. node scripts/apply-sql.mjs supabase/migrations/0011_storage_setup.sql
--      -- creates club-photos bucket with RLS write-gated by club_admin
```

Find the verification queries section. Append at end (before the final `select` statement):
```
--
--   select id, public from storage.buckets where id='club-photos';
--     -- expected: 1 row, public=true (added by migration 0011)
```

- [ ] **Step 3: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add .env.example supabase/apply_clubs.sql
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "docs: document PUBLIC_CF_DEPLOY_HOOK_URL and migration 0011

.env.example explains where to get the deploy hook URL.
apply_clubs.sql now lists 0011 (storage bucket) as step 6 in the
documented deploy sequence with its verification query.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Update /dashboard/club/edit.astro photos section

**Files:**
- Modify: `src/pages/dashboard/club/edit.astro`

- [ ] **Step 1: Read current file**

Read `C:\ClaudeCode\src\pages\dashboard\club\edit.astro` to locate the photos section.

- [ ] **Step 2: Replace photos section**

Find this block:
```astro
        <h2 class="club-edit-section">Фото</h2>
        <p style="color:var(--text-secondary);font-size:14px">Внешние ссылки (Google Drive / Imgur / Яндекс.Диск). До 6 фото.</p>

        <div id="photos-list" class="photos-list"></div>
        <button type="button" class="btn btn--ghost btn--sm" id="add-photo" style="align-self:flex-start">+ Добавить фото</button>
```

Replace with:
```astro
        <h2 class="club-edit-section">Фото</h2>
        <p style="color:var(--text-secondary);font-size:14px">
          Загрузи прямо файлы (JPEG / PNG / WebP, до 3 МБ) или вставь ссылки на внешние фото. До 6 шт.
        </p>

        <div class="photos-uploader" id="photos-uploader">
          <input type="file" id="photo-file-input" accept="image/jpeg,image/png,image/webp" multiple hidden />
          <button type="button" class="btn btn--primary btn--sm" id="photo-pick-btn">+ Выбрать файлы</button>
          <button type="button" class="btn btn--ghost btn--sm" id="add-photo-url">+ Внешняя ссылка</button>
          <span style="color:var(--text-muted);font-size:14px;margin-left:8px">или перетащи фото сюда</span>
        </div>

        <div id="photos-list" class="photos-list"></div>
```

- [ ] **Step 3: Build verify**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add src/pages/dashboard/club/edit.astro
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(edit): hybrid photos UI (file upload + URL fallback)

Replaces URL-only inputs with file picker + drag-drop zone + separate
'Add external URL' button. Script changes wired separately.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Update dashboard-club-edit.ts (upload + rebuild flow)

**Files:**
- Modify: `src/scripts/dashboard-club-edit.ts`

- [ ] **Step 1: Read current file to understand structure**

- [ ] **Step 2: Update imports**

Find the existing imports block at the top. Add:
```ts
import { uploadClubPhoto, isUploadedUrl, urlToStoragePath, deleteClubPhoto } from '../lib/photo-upload';
import { triggerSiteRebuild } from '../lib/deploy-trigger';
```

- [ ] **Step 3: Replace renderPhotoRow function**

Find the current `renderPhotoRow` function:
```ts
function renderPhotoRow(url: string): string {
  return `
    <div class="photos-list__row">
      <input type="url" class="auth-input" value="${url}" placeholder="https://..." />
      <button type="button" class="btn btn--ghost btn--sm photos-list__remove">×</button>
    </div>
  `;
}
```

Replace with:
```ts
function renderPhotoRow(url: string): string {
  if (url && isUploadedUrl(url)) {
    const filename = url.split('/').pop() ?? 'photo';
    return `
      <div class="photos-list__row photos-list__row--uploaded" data-url="${url}">
        <img src="${url}" class="photos-list__thumb" alt="" loading="lazy" />
        <span class="photos-list__name">${filename}</span>
        <button type="button" class="btn btn--ghost btn--sm photos-list__remove">×</button>
      </div>
    `;
  }
  return `
    <div class="photos-list__row photos-list__row--url">
      <input type="url" class="auth-input" value="${url}" placeholder="https://..." />
      <button type="button" class="btn btn--ghost btn--sm photos-list__remove">×</button>
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
      <button type="button" class="btn btn--ghost btn--sm photos-list__remove">×</button>
    </div>
  `;
}
```

- [ ] **Step 4: Replace the photos section of setupDashboardClubEdit**

Find the existing block:
```ts
  // Photos
  const photosList = document.getElementById('photos-list')!;
  function renderAllPhotos(urls: string[]) {
    photosList.innerHTML = urls.map(renderPhotoRow).join('');
  }
  renderAllPhotos(c.photos ?? []);

  document.getElementById('add-photo')!.addEventListener('click', () => {
    if (photosList.children.length >= 6) {
      alert('Максимум 6 фото');
      return;
    }
    photosList.insertAdjacentHTML('beforeend', renderPhotoRow(''));
  });

  photosList.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.photos-list__remove');
    if (btn) btn.parentElement?.remove();
  });
```

Replace with:
```ts
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

      const result = await uploadClubPhoto(slug, file);
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
```

- [ ] **Step 5: Update the photoUrls collection in submit handler**

Find:
```ts
    const photoUrls = Array.from(photosList.querySelectorAll('input[type="url"]'))
      .map((el) => (el as HTMLInputElement).value.trim())
      .filter(Boolean);
```

Replace with:
```ts
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
```

- [ ] **Step 6: Trigger rebuild after save**

Find the success block:
```ts
    successEl.innerHTML = '<strong>Сохранено!</strong> Изменения появятся в каталоге после следующего деплоя.';
    successEl.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
```

Replace with:
```ts
    successEl.innerHTML = '<strong>Сохранено!</strong> Сайт обновится через 30-60 секунд.';
    successEl.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Fire-and-forget rebuild trigger (don't await — let user see success immediately)
    triggerSiteRebuild().then((r) => {
      if (!r.ok) console.warn('[edit] deploy trigger failed:', r.error);
    });
```

- [ ] **Step 7: Build verify**

```bash
npm run build 2>&1 | tail -5
npx astro check 2>&1 | tail -5
```

Both should exit 0.

- [ ] **Step 8: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add src/scripts/dashboard-club-edit.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(edit): wire upload flow + auto-rebuild trigger

File picker + drag-drop integrate with uploadClubPhoto. Uploaded
rows show thumbnail + filename + remove. Removal deletes from
Storage (best-effort, non-blocking). External URL inputs still
supported alongside. On save, triggerSiteRebuild fires the CF
deploy hook (fire-and-forget); success notice updated to mention
30-60 sec propagation.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: CSS for uploader + thumbnails

**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: Append CSS at end of global.css**

```css

/* Photos uploader (in /dashboard/club/edit) */
.photos-uploader {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 16px;
  border: 2px dashed var(--glass-border, rgba(255,255,255,0.12));
  border-radius: 12px;
  background: rgba(255,255,255,0.02);
  transition: border-color 0.2s, background 0.2s;
}

.photos-uploader--drag {
  border-color: var(--c-violet-500, #8b5cf6);
  background: rgba(139, 92, 246, 0.06);
}

.photos-list__row--uploaded,
.photos-list__row--uploading,
.photos-list__row--error {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  border-radius: 8px;
}

.photos-list__thumb {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
  background: rgba(0,0,0,0.2);
}

.photos-list__thumb--placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}

.photos-list__name {
  flex: 1;
  font-size: 14px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.photos-list__row--uploaded .photos-list__name {
  color: var(--text-primary, #fff);
}

.photos-list__row--error {
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.05);
}
```

- [ ] **Step 2: Build**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add src/styles/global.css
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(styles): photos uploader + thumbnail rows

Dashed-border drop zone with drag-over state. Thumbnail rows
(40x40 cover) for uploaded photos, placeholder emojis (⏳/⚠)
for uploading and error states.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Final verify + summary

**Files:** none

- [ ] **Step 1: Full verify**

```bash
npm run build 2>&1 | tail -5
npx astro check 2>&1 | tail -5
git log main..HEAD --oneline
```

Expect: build OK, check OK, 6 commits on `feat/photo-upload-and-auto-rebuild`.

- [ ] **Step 2: Smoke checks (browser, after deploy)**

Done by controller after merge + deploy. Scenarios:
1. As super-admin, navigate to `/dashboard/club/edit?slug=cyberzone`
2. Click "+ Выбрать файлы", pick a JPEG ≤ 3 MB → uploads → thumbnail appears
3. Drag-drop an image into the dashed zone → uploads
4. Click "+ Внешняя ссылка" → empty URL input appears
5. Click × on uploaded photo → row vanishes immediately, storage object deleted in background
6. Save form → success notice mentions 30-60 sec → CF Pages dashboard shows new deploy starting
7. After deploy completes (~60 sec), `/clubs/cyberzone/` shows the new photos

- [ ] **Step 3: Report DONE to controller**

---

## CONTROLLER STEPS (after subagent tasks complete)

### A. User must do (~5 minutes)

1. Open https://dash.cloudflare.com/?to=/:account/pages/view/respawn-kz/settings/builds-deployments
2. Scroll to "Deploy hooks" → "Add deploy hook"
3. Name: `club-edit-rebuild`
4. Branch: `main`
5. Click "Create deploy hook" → copy the URL (format: `https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/{uuid}`)

Then:
6. Open the env vars page at https://dash.cloudflare.com/?to=/:account/pages/view/respawn-kz/settings/environment-variables
7. Add **production** env var: name `PUBLIC_CF_DEPLOY_HOOK_URL`, value = the hook URL
8. Save

Send the hook URL to controller for inclusion in `.env` for local dev (optional).

### B. Controller actions

```bash
# 1. Merge to main
git checkout main
git merge --ff-only feat/photo-upload-and-auto-rebuild
git push origin main
git branch -d feat/photo-upload-and-auto-rebuild

# 2. Deploy (with hook env var set in CF, the new build picks it up)
CLOUDFLARE_API_TOKEN="..." npm run deploy

# 3. Smoke test
curl -s -o /dev/null -w "%{http_code}\n" https://respawn.kz/dashboard/club/edit
# expected: 200 or 308→200
```

---

## Self-Review Checklist (for implementer)

- [ ] Migration 0011 applied + bucket exists with 4 RLS policies
- [ ] `npx astro check` = 0 errors
- [ ] `npm run build` exits 0
- [ ] photo-upload.ts handles 3 error paths (size / mime / supabase error)
- [ ] deploy-trigger.ts handles missing env var gracefully (warn + return ok:false)
- [ ] Edit page has file picker AND "external URL" button AND drag zone
- [ ] Submit handler collects both uploaded (data-url) and external (input) photos in order
- [ ] Remove handler deletes from Storage for uploaded photos (best-effort)
- [ ] Success notice mentions "30-60 секунд"
- [ ] Rebuild trigger fires after save (not on every keystroke)

---

## Acceptance Criteria mapping

| # | Criterion | Task |
|---|-----------|------|
| 1 | Bucket exists with config | Task 1 |
| 2 | RLS prevents anon write | Task 1 |
| 3 | RLS allows admin write to own slug | Task 1 |
| 4 | Public READ works | Task 1 |
| 5 | File picker on edit page | Task 4+5 |
| 6 | Uploaded → thumbnail | Task 5 |
| 7 | Edits propagate after rebuild | Task 5 (triggerSiteRebuild) + user action |
| 8 | Remove deletes from Storage | Task 5 |
| 9 | External URLs still work | Task 5 (renderPhotoRow handles both) |
| 10 | Save triggers rebuild | Task 5 |
| 11 | Missing env var → graceful | Task 2 |
| 12 | Build succeeds | Task 7 |

All 12 covered.

---

## Out of Scope (deferred)

- Client-side image resize (max-dimension cap, format conversion)
- Photo reordering UI (drag-to-sort)
- Photo captions / alt text
- Polling CF API to detect deploy completion → live "deployed" indicator
- Edge Function proxy for deploy hook URL (current MVP exposes URL in client JS bundle)
- Nightly orphan-file cleanup job (files left behind by failed delete operations)
