-- Migration 0020: photo attachments on reviews.
-- New storage bucket `review-photos` + photo_urls column on reviews.

-- ============================================================
-- 1. Storage bucket
-- ============================================================
insert into storage.buckets (id, name, public)
values ('review-photos', 'review-photos', true)
on conflict (id) do nothing;

-- Public read
drop policy if exists "review-photos public read" on storage.objects;
create policy "review-photos public read" on storage.objects
  for select using (bucket_id = 'review-photos');

-- Authenticated users insert into their own user_id-prefixed folder.
-- Path convention: <auth.uid()>/<timestamp>-<filename>
drop policy if exists "review-photos auth upload" on storage.objects;
create policy "review-photos auth upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'review-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owners can delete their own uploads
drop policy if exists "review-photos auth delete own" on storage.objects;
create policy "review-photos auth delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'review-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- 2. photo_urls column on reviews
-- ============================================================
alter table public.reviews
  add column if not exists photo_urls text[] not null default '{}';

-- Max 3 photos per review
alter table public.reviews
  drop constraint if exists reviews_photo_urls_max;
alter table public.reviews
  add constraint reviews_photo_urls_max check (
    array_length(photo_urls, 1) is null or array_length(photo_urls, 1) <= 3
  );

-- ============================================================
-- 3. Allow user to set photo_urls on INSERT (already permitted by existing
--    "users insert own review on completed booking" policy — no change needed).
--    Update guard trigger from 0016: photo_urls must NOT be touched in
--    update path either (immutable after creation; club_admin can't add or
--    remove user photos; super_admin can if needed via service-role bypass).
-- ============================================================
create or replace function check_review_update_allowed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW is not distinct from OLD then
    return NEW;
  end if;

  if is_super_admin() then
    return NEW;
  end if;

  if not exists (
    select 1 from public.club_admins
    where user_id = auth.uid() and club_slug = OLD.club_slug
  ) then
    raise exception 'Not authorized to update this review';
  end if;

  if NEW.rating is distinct from OLD.rating
     or NEW.text is distinct from OLD.text
     or NEW.status is distinct from OLD.status
     or NEW.hidden_by is distinct from OLD.hidden_by
     or NEW.hidden_at is distinct from OLD.hidden_at
     or NEW.hidden_reason is distinct from OLD.hidden_reason
     or NEW.club_slug is distinct from OLD.club_slug
     or NEW.booking_id is distinct from OLD.booking_id
     or NEW.user_id is distinct from OLD.user_id
     or NEW.photo_urls is distinct from OLD.photo_urls then
    raise exception 'Club admin can only update reply fields';
  end if;

  return NEW;
end;
$$;
