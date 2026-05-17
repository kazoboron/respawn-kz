# respawn.kz Photo Upload + Auto-rebuild — Design Spec

**Date:** 2026-05-17
**Status:** Draft — awaiting user approval (brainstormed autonomously during user's break)
**Block 1 closed:** SP1 (B2B Cabinet) + SP2+3 (Clubs DB + Slot Validation) — all in production
**This = Sub-project 4 (post-Block-1 enhancement)**

## Goal

Two deferred features from Block 1 grouped into one short sub-project:

**A. Auto-rebuild on club edit** — when a club admin saves changes via `/dashboard/club/edit`, trigger a Cloudflare Pages rebuild via deploy hook so the catalog reflects updates within ~60 seconds. Today's UX is "появится после деплоя" with no concrete timing, which is annoying.

**B. Photo Upload via Supabase Storage** — replace the URL-paste-only photos input with a real file upload that stores photos in a Supabase Storage bucket. Today's UX requires admins to host photos externally (Google Drive, Imgur), which is friction.

Combining them because Photo Upload's value depends on the rebuild trigger working (otherwise the photos sit invisible until next manual deploy).

## Scope

**In:**
- New Supabase Storage bucket `club-photos` (public-read, RLS write)
- Migration `0011_storage_setup.sql` to set up bucket + RLS policies
- `src/lib/photo-upload.ts` — wrapper around `supabase.storage.from(...)` with upload + delete helpers
- `src/lib/deploy-trigger.ts` — fires Cloudflare Pages deploy hook URL
- `/dashboard/club/edit.astro` photos section: file input + drag-drop + preview thumbnails, max 6 photos, max 3 MB each, still allow external URL paste as fallback
- `dashboard-club-edit.ts` upload flow + rebuild trigger after successful save
- Env var `PUBLIC_CF_DEPLOY_HOOK_URL` documented in `.env.example`
- Success notice in edit form: "Сохранено! Изменения появятся на сайте через 30-60 секунд."

**Out (deferred):**
- Image compression / resize / format conversion on client (rely on user upload)
- Supabase Image Transformations (paid feature)
- Cropping UI
- Photo reordering by drag-drop
- Photo metadata (caption / alt text)
- Bulk upload from folder
- Polling Cloudflare API to detect deploy completion (just show estimate)
- Edge Function wrapper to keep deploy hook URL truly secret (URL is "public env" for MVP; can rotate if abused)

## Architecture

### 1. Storage bucket setup

Supabase Storage uses a separate API but is queryable from SQL via the `storage.objects` and `storage.buckets` tables. Migration 0011 sets up:

```sql
-- Migration 0011: club-photos storage bucket + RLS

-- Create bucket (idempotent via insert ON CONFLICT)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'club-photos',
  'club-photos',
  true,                                        -- public read
  3145728,                                     -- 3 MB max per file (3 * 1024 * 1024)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RLS for storage.objects (bucket-scoped)
-- Public SELECT (bucket is public)
create policy "anyone reads club-photos" on storage.objects
  for select using (bucket_id = 'club-photos');

-- INSERT: authenticated + (super_admin OR club_admin of the path's slug)
-- Path convention: {slug}/{filename}
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

-- UPDATE: same gate (for overwrite scenarios)
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

`storage.foldername(name)` is a Supabase helper that splits the object name (path) on `/` and returns the segments as an array. `[1]` is the first segment = `{slug}`.

### 2. Object naming convention

Path: `{slug}/{timestamp}-{safe-filename}.{ext}`

- `timestamp` = `Date.now()` (milliseconds) to avoid collisions on quick re-uploads
- `safe-filename` = original name with non-alphanumeric → underscore (caps preserved)
- `ext` = original lowercase extension
- Example: `cyberzone/1700000000000-club_main.jpg`

Public URL: `https://qfuhtvtietnldeqklxdo.supabase.co/storage/v1/object/public/club-photos/{slug}/{filename}`

Stored in `clubs.photos[]` as this full URL string.

### 3. `src/lib/photo-upload.ts`

Single source for upload + delete + URL extraction:

```ts
import { supabase } from './supabase';

const BUCKET = 'club-photos';

export interface UploadResult {
  ok: boolean;
  publicUrl?: string;
  storagePath?: string;
  error?: string;
}

export async function uploadClubPhoto(slug: string, file: File): Promise<UploadResult> {
  if (file.size > 3 * 1024 * 1024) {
    return { ok: false, error: 'Фото больше 3 МБ. Сожми его и попробуй снова.' };
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
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

/** Extract the storage path from a public URL (or return null if not a Storage URL). */
export function urlToStoragePath(url: string): string | null {
  const m = url.match(/\/storage\/v1\/object\/public\/club-photos\/(.+)$/);
  return m ? m[1] : null;
}

export async function deleteClubPhoto(storagePath: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
```

### 4. `src/lib/deploy-trigger.ts`

Fire-and-forget POST to Cloudflare deploy hook:

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

The hook URL is treated as a credential-in-URL. Storing it in a `PUBLIC_` env var means it ends up in the client JS bundle — anyone reading the source can find it and trigger builds. Trade-off: Cloudflare Pages Free tier has 500 builds/month; if someone abuses it, we rotate. Future hardening = Supabase Edge Function proxy.

### 5. UI changes in `/dashboard/club/edit.astro`

Replace the current "Фото" section's URL-only inputs with a new control:

```astro
<h2 class="club-edit-section">Фото</h2>
<p style="color:var(--text-secondary);font-size:14px">
  Загрузи прямо файлы (JPEG / PNG / WebP, до 3 МБ) или вставь ссылки на внешние фото. До 6 шт.
</p>

<div class="photos-uploader" id="photos-uploader">
  <input type="file" id="photo-file-input" accept="image/jpeg,image/png,image/webp" multiple hidden />
  <button type="button" class="btn btn--ghost" id="photo-pick-btn">+ Выбрать фото</button>
  <span style="color:var(--text-muted);font-size:14px;margin-left:8px">или перетащи сюда</span>
</div>

<div id="photos-list" class="photos-list"></div>
```

`photos-list` rows still support BOTH:
1. Uploaded files (preview thumbnail + remove deletes from Storage)
2. External URLs (text input + remove just clears the slot)

The script renders each photo row based on type:

```ts
function renderPhotoRow(photo: PhotoEntry): string {
  if (photo.kind === 'uploaded') {
    return `
      <div class="photos-list__row photos-list__row--uploaded" data-url="${photo.url}">
        <img src="${photo.url}" class="photos-list__thumb" alt="" />
        <span class="photos-list__name">${photo.filename}</span>
        <button type="button" class="btn btn--ghost btn--sm photos-list__remove">×</button>
      </div>
    `;
  }
  return `
    <div class="photos-list__row photos-list__row--url">
      <input type="url" class="auth-input" value="${photo.url}" placeholder="https://..." />
      <button type="button" class="btn btn--ghost btn--sm photos-list__remove">×</button>
    </div>
  `;
}
```

PhotoEntry kind detected from URL prefix:
- If URL matches `^https://qfuhtvtietnldeqklxdo\.supabase\.co/storage/v1/object/public/club-photos/`, treat as `uploaded`
- Else treat as `url` (external)

### 6. Save flow in `dashboard-club-edit.ts`

Order of operations on submit:
1. Build patch object (all fields incl. `photos` from current rows in order)
2. UPDATE clubs table
3. If save succeeded → call `triggerSiteRebuild()` (don't await, fire-and-forget so user sees instant success)
4. Show notice: "Сохранено! Сайт обновится через 30-60 секунд."

Photos array reconciliation on remove:
- When user clicks × on an uploaded photo row:
  - Remove DOM row immediately
  - In background: extract storage path via `urlToStoragePath(url)` and `deleteClubPhoto(path)`
  - Don't block UI on storage delete (orphaned files = small cost; nightly cleanup script can be added later)

Upload flow on file-pick or drag-drop:
- For each File in event.target.files:
  - If photos-list already has 6 rows → alert "Максимум 6 фото", stop
  - Show a temporary "uploading" placeholder row
  - Call `uploadClubPhoto(slug, file)`
  - On success: replace placeholder with real uploaded row (thumbnail + remove button)
  - On failure: replace placeholder with error message; user can remove it

### 7. Deploy environment

Cloudflare Pages env vars needed (set in Pages → Settings → Environment variables):
- `PUBLIC_CF_DEPLOY_HOOK_URL` = the hook URL from CF Pages → Deploy Hooks

`.env.example` documents this for local dev.

The hook URL itself is created in CF Pages dashboard:
- respawn-kz project → Settings → Builds & deployments → Deploy Hooks
- "Add deploy hook" → name="club-edit-rebuild" → branch="main" → Create
- Copy the URL (looks like `https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/{uuid}`)
- Paste into Pages env var
- Trigger redeploy of Pages for env var to take effect

## Files Created (3)

- `supabase/migrations/0011_storage_setup.sql`
- `src/lib/photo-upload.ts`
- `src/lib/deploy-trigger.ts`

## Files Modified (5)

- `src/pages/dashboard/club/edit.astro` — new photo section UI
- `src/scripts/dashboard-club-edit.ts` — upload flow + rebuild trigger
- `src/styles/global.css` — `.photos-uploader`, `.photos-list__thumb`, `.photos-list__name`, drag-over state
- `.env.example` — add `PUBLIC_CF_DEPLOY_HOOK_URL=`
- `supabase/apply_clubs.sql` (or new `apply_photo_upload.sql`) — document 0011 in deploy sequence

## Acceptance Criteria

1. New storage bucket `club-photos` exists in Supabase with 3 MB limit + jpeg/png/webp allowed
2. RLS prevents anon and non-admins from uploading to any club's folder
3. RLS allows super-admin and club_admin (of THIS slug) to upload to `{slug}/...`
4. Public READ works for anon (clicking a public URL returns the image)
5. `/dashboard/club/edit` shows file picker; drag-drop also works
6. After upload, photo appears with thumbnail and remove button
7. After save, the photos appear at `/clubs/{slug}/` after rebuild (~60 sec)
8. Removed photos are deleted from Storage (not just from the URL array)
9. External URL paste still works (backward compat with existing 12 mock clubs that have `[]` photos but might later get external URLs)
10. Save in edit form triggers Cloudflare rebuild; success message tells user wait time
11. PUBLIC_CF_DEPLOY_HOOK_URL absent → save still works, just doesn't trigger rebuild (graceful degradation)
12. `npm run build` succeeds with 0 errors

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Hook URL leaked → abuse → 500 build cap hit | Medium | Cloudflare hook URLs are rotatable. Migrate to Edge Function proxy later if needed. |
| Upload race: two admins for same club upload at same moment, same filename | Very low | Path includes Date.now() in milliseconds. Browser-side rounding loses ~1ms precision. Practically can't collide. |
| Orphaned files in Storage when user removes URL but app crashes before storage delete | Low | Acceptable for MVP. Future: nightly cleanup script that diffs Storage vs clubs.photos[]. |
| User uploads non-image renamed as `.jpg` | Low | RLS allows the upload (Postgres trusts MIME), but bucket has `allowed_mime_types` check. Supabase rejects mismatched MIME at upload time. |
| User uploads many photos quickly, all triggering rebuilds | Low | Save action triggers ONE rebuild per save click, not per upload. Multiple rapid saves → multiple rebuilds queued by CF (max 1 running at a time, others wait). |

## Effort Estimate

- Migration 0011 + apply: 30 min
- photo-upload.ts: 30 min
- deploy-trigger.ts: 15 min
- Edit page UI + CSS: 1.5 hours
- Save flow integration: 1 hour
- Deploy hook setup in CF dashboard (user action): 5 min
- Smoke testing: 30 min

Total: ~4 hours of work + 5 min user action.

## Deploy Sequence

```
1. node scripts/apply-sql.mjs supabase/migrations/0011_storage_setup.sql
   ↓
2. (User action) Cloudflare Pages → Settings → Deploy hooks → Add hook for main branch.
   Copy hook URL.
   ↓
3. (User action) Add PUBLIC_CF_DEPLOY_HOOK_URL env var in Cloudflare Pages → Settings → Env vars.
   ↓
4. git merge feat/photo-upload-and-auto-rebuild → main, push
   ↓
5. npm run deploy (manual once — picks up the new env var)
   ↓
6. From this point onwards: edits via /dashboard/club/edit auto-trigger rebuilds.
```

## Open Questions

- **Should anonymous (unauthenticated) users be able to view photos in the bucket?**
  Yes (decision baked in). Photos appear in public catalog at `/clubs/`, must be loadable without auth.

- **Should we polyfill `storage.foldername()` or rely on it being present?**
  Rely on it. It's standard in all current Supabase Postgres versions.

- **Should there be a "publish bulk" mode for super-admin to approve all drafts at once?**
  Out of scope. Deferred.
