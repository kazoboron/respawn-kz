import { supabase } from './supabase';

const CYRILLIC_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

/** Convert Cyrillic-or-Latin string to URL-safe slug. */
export function slugify(s: string): string {
  const transliterated = s.toLowerCase().split('').map((c) => CYRILLIC_MAP[c] ?? c).join('');
  return transliterated.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Generate a slug that doesn't collide with existing club slugs. */
export async function generateUniqueClubSlug(name: string): Promise<string> {
  const base = slugify(name) || 'club';
  let candidate = base;
  let n = 1;
  // Bound the loop so we don't infinite-loop on misbehaving DB
  for (let i = 0; i < 100; i++) {
    const { data } = await supabase.from('clubs').select('slug').eq('slug', candidate).maybeSingle();
    if (!data) return candidate;
    n++;
    candidate = `${base}-${n}`;
  }
  throw new Error('Could not generate unique slug after 100 attempts');
}
