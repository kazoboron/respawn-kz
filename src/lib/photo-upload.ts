import { supabase } from './supabase';

const BUCKET = 'club-photos';
const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

// Compression settings — applied before upload to reduce bandwidth + storage
const COMPRESS_MAX_WIDTH = 1920;       // downscale anything wider; phones are 1080-1290 logical, 2x DPR = ~2580 worst case but 1920 is the practical web ceiling
const COMPRESS_QUALITY = 0.85;          // WebP @ 0.85 is visually lossless for photos
const COMPRESS_SKIP_BYTES = 200 * 1024; // skip compression for tiny files (<200 KB) — overhead outweighs gain

export interface UploadResult {
  ok: boolean;
  publicUrl?: string;
  storagePath?: string;
  error?: string;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/**
 * Compress an image client-side: downscale to COMPRESS_MAX_WIDTH if wider,
 * re-encode as WebP at COMPRESS_QUALITY. Returns the original if compression
 * would not reduce size, or if the file is already tiny.
 */
async function compressImage(file: File): Promise<File> {
  if (file.size < COMPRESS_SKIP_BYTES) return file;

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return file; // decoding failed — let upload proceed with original
  }

  const scale = Math.min(1, COMPRESS_MAX_WIDTH / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', COMPRESS_QUALITY);
  });

  if (!blob || blob.size >= file.size) return file;

  const base = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${base}.webp`, { type: 'image/webp' });
}

/** Internal: validate, compress, upload to given bucket+path. Shared by club + review photo uploads. */
async function uploadToBucket(
  bucket: string,
  pathFn: (compressedName: string) => string,
  file: File,
): Promise<UploadResult> {
  if (!ALLOWED_MIME.includes(file.type)) {
    return { ok: false, error: 'Только JPEG, PNG или WebP.' };
  }
  const compressed = await compressImage(file);
  if (compressed.size > MAX_BYTES) {
    return { ok: false, error: 'Фото больше 3 МБ даже после сжатия. Попробуй файл поменьше.' };
  }
  const safeName = compressed.name.toLowerCase().replace(/[^a-z0-9.]+/g, '_');
  const path = pathFn(safeName);

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, compressed, { contentType: compressed.type, upsert: false });
  if (error || !data) return { ok: false, error: error?.message ?? 'upload failed' };

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return { ok: true, publicUrl: urlData.publicUrl, storagePath: data.path };
}

export async function uploadClubPhoto(slug: string, file: File): Promise<UploadResult> {
  return uploadToBucket(BUCKET, (name) => {
    const ext = name.split('.').pop() ?? 'jpg';
    const base = name.replace(/\.[^.]+$/, '');
    return `${slug}/${Date.now()}-${base}.${ext}`;
  }, file);
}

/**
 * Upload a photo attached to a review. Stored in `review-photos` bucket under
 * `<userId>/<timestamp>-<filename>` so RLS gates writes to the user's own
 * folder (see migration 0020). Returns public URL on success.
 */
export async function uploadReviewPhoto(userId: string, file: File): Promise<UploadResult> {
  return uploadToBucket('review-photos', (name) => {
    const ext = name.split('.').pop() ?? 'webp';
    const base = name.replace(/\.[^.]+$/, '');
    return `${userId}/${Date.now()}-${base}.${ext}`;
  }, file);
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
