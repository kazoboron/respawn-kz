-- Migration 0016: club admin replies to reviews.
-- Adds reply_text/replied_at/replied_by columns + RLS policy for club_admins
-- + guard trigger restricting non-super-admin updates to reply fields only.

-- ============================================================
-- 1. Add columns
-- ============================================================
alter table public.reviews
  add column if not exists reply_text text,
  add column if not exists replied_at timestamptz,
  add column if not exists replied_by uuid references auth.users(id);

-- Length constraint (same shape as review text but optional)
alter table public.reviews
  drop constraint if exists reviews_reply_length;
alter table public.reviews
  add constraint reviews_reply_length check (
    reply_text is null or (char_length(reply_text) between 10 and 1000)
  );

-- ============================================================
-- 2. Trigger: auto-stamp replied_at + replied_by when reply_text changes
-- ============================================================
create or replace function set_review_reply_meta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.reply_text is distinct from OLD.reply_text then
    if NEW.reply_text is null then
      NEW.replied_at := null;
      NEW.replied_by := null;
    else
      NEW.replied_at := now();
      NEW.replied_by := auth.uid();
    end if;
  end if;
  return NEW;
end;
$$;

revoke execute on function set_review_reply_meta() from public, anon, authenticated;

drop trigger if exists reviews_set_reply_meta on public.reviews;
create trigger reviews_set_reply_meta
  before update on public.reviews
  for each row execute function set_review_reply_meta();

-- ============================================================
-- 3. Guard trigger: non-super-admin updates restricted to reply fields only
-- ============================================================
create or replace function check_review_update_allowed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skip if no actual change
  if NEW is not distinct from OLD then
    return NEW;
  end if;

  -- Super-admin can update anything (handles status/hidden_* moderation)
  if is_super_admin() then
    return NEW;
  end if;

  -- Otherwise: must be a club_admin of this review's club
  if not exists (
    select 1 from public.club_admins
    where user_id = auth.uid() and club_slug = OLD.club_slug
  ) then
    raise exception 'Not authorized to update this review';
  end if;

  -- And can only change reply_text. Other fields (rating/text/status/hidden_*/club_slug/
  -- booking_id/user_id) must remain unchanged. replied_at/replied_by/updated_at are
  -- set by other triggers and are allowed to differ from OLD.
  if NEW.rating is distinct from OLD.rating
     or NEW.text is distinct from OLD.text
     or NEW.status is distinct from OLD.status
     or NEW.hidden_by is distinct from OLD.hidden_by
     or NEW.hidden_at is distinct from OLD.hidden_at
     or NEW.hidden_reason is distinct from OLD.hidden_reason
     or NEW.club_slug is distinct from OLD.club_slug
     or NEW.booking_id is distinct from OLD.booking_id
     or NEW.user_id is distinct from OLD.user_id then
    raise exception 'Club admin can only update reply fields';
  end if;

  return NEW;
end;
$$;

revoke execute on function check_review_update_allowed() from public, anon, authenticated;

drop trigger if exists reviews_check_update_allowed on public.reviews;
create trigger reviews_check_update_allowed
  before update on public.reviews
  for each row execute function check_review_update_allowed();

-- ============================================================
-- 4. RLS policy: club_admins can UPDATE reviews for their clubs
--    (restricted to reply fields by the guard trigger above)
-- ============================================================
drop policy if exists "club_admins reply to reviews" on public.reviews;
create policy "club_admins reply to reviews" on public.reviews
  for update to authenticated
  using (
    exists (
      select 1 from public.club_admins
      where user_id = auth.uid() and club_slug = reviews.club_slug
    )
  )
  with check (
    exists (
      select 1 from public.club_admins
      where user_id = auth.uid() and club_slug = reviews.club_slug
    )
  );
