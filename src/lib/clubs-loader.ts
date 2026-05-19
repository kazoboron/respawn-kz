import { supabase } from './supabase';

export interface ClubRow {
  slug: string;
  name: string;
  city: string;
  district: string | null;
  address: string;
  phone: string | null;
  price_per_hour: number;
  working_hours: Record<string, { open: string; close: string } | null>;
  description: string | null;
  tags: string[];
  equipment: string[];
  photos: string[];
  gradient: string | null;
  initial: string | null;
  rating: number;
  reviews_count: number;
  is_published: boolean;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

export async function loadAllClubs(): Promise<ClubRow[]> {
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .eq('is_published', true)
    .order('rating', { ascending: false });
  if (error) throw new Error(`loadAllClubs failed: ${error.message}`);
  return (data ?? []) as ClubRow[];
}

export async function loadClubBySlug(slug: string): Promise<ClubRow | null> {
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  if (error) throw new Error(`loadClubBySlug(${slug}) failed: ${error.message}`);
  return data as ClubRow | null;
}

export async function loadSimilarClubs(slug: string, limit = 3): Promise<ClubRow[]> {
  const club = await loadClubBySlug(slug);
  if (!club) return [];
  const { data: sameCity } = await supabase
    .from('clubs')
    .select('*')
    .eq('is_published', true)
    .neq('slug', slug)
    .eq('city', club.city)
    .limit(limit);
  const list = (sameCity ?? []) as ClubRow[];
  if (list.length >= limit) return list.slice(0, limit);

  const { data: others } = await supabase
    .from('clubs')
    .select('*')
    .eq('is_published', true)
    .neq('slug', slug)
    .neq('city', club.city)
    .order('rating', { ascending: false })
    .limit(limit - list.length);
  return [...list, ...((others ?? []) as ClubRow[])];
}

// For admin pages: include drafts (RLS allows super-admin to see all)
export async function loadAllClubsForAdmin(): Promise<ClubRow[]> {
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .order('is_published', { ascending: false })
    .order('city', { ascending: true });
  if (error) throw new Error(`loadAllClubsForAdmin failed: ${error.message}`);
  return (data ?? []) as ClubRow[];
}
