import { supabase } from './supabase';

export interface PublicReviewSnippet {
  rating: number;
  text: string;
  created_at: string;
}

/**
 * Fetch the most-recent `limit` published reviews for a club.
 * Called at SSG build-time to embed Review snippets into JSON-LD.
 */
export async function loadTopReviewsForClub(slug: string, limit = 5): Promise<PublicReviewSnippet[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('rating, text, created_at')
    .eq('club_slug', slug)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[reviews-loader] failed to load reviews', error);
    return [];
  }
  return (data ?? []) as PublicReviewSnippet[];
}
