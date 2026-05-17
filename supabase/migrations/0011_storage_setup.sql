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
