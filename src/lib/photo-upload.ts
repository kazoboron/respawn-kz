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
