-- ============================================================
-- BUNDLE: все pending миграции (0016-0021) одним файлом.
-- ============================================================
-- КАК ПРИМЕНИТЬ:
-- 1. Открой https://supabase.com/dashboard/project/qfuhtvtietnldeqklxdo/sql/new
-- 2. Вставь содержимое этого файла целиком
-- 3. Нажми Run
-- 4. Готово — прод заработает (новые брони + отзывы с reply/фото + loyalty + geo)
--
-- Альтернатива (если есть локальный supabase CLI auth):
--   supabase login
--   npm run apply-pending
--
-- Идемпотентен: re-run безопасно. Все ALTER/CREATE — с `if not exists`
-- или `or replace`, существующие данные не теряются.
-- ============================================================


-- ============================================================
-- 0016: club admin replies to reviews
-- ============================================================
alter table public.reviews
  add column if not exists reply_text text,
  add column if not exists replied_at timestamptz,
  add column if not exists replied_by uuid references auth.users(id);

alter table public.reviews
  drop constraint if exists reviews_reply_length;
alter table public.reviews
  add constraint reviews_reply_length check (
    reply_text is null or (char_length(reply_text) between 10 and 1000)
  );

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


-- ============================================================
-- 0017: email notify on review reply
-- ============================================================
alter table public.notifications_outbox
  drop constraint notifications_outbox_event_type_check;
alter table public.notifications_outbox
  add constraint notifications_outbox_event_type_check
  check (event_type in (
    'application_submitted',
    'application_approved',
    'application_rejected',
    'booking_created',
    'booking_confirmed',
    'booking_cancelled',
    'booking_completed',
    'booking_no_show',
    'review_created',
    'booking_rescheduled',
    'review_replied'
  ));

create or replace function notify_review_replied()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_customer_email text;
begin
  if OLD.reply_text is not null then
    return NEW;
  end if;
  if NEW.reply_text is null then
    return NEW;
  end if;
  v_customer_email := get_user_email(NEW.user_id);
  if v_customer_email is null then
    return NEW;
  end if;
  v_payload := jsonb_build_object(
    'review_id', NEW.id,
    'club_slug', NEW.club_slug,
    'reply_text', NEW.reply_text,
    'review_text', NEW.text,
    'review_rating', NEW.rating,
    'customer_email', v_customer_email
  );
  insert into public.notifications_outbox
    (event_type, source_table, source_id, recipient_email, payload)
  values
    ('review_replied', 'reviews', NEW.id, v_customer_email, v_payload)
  on conflict (event_type, source_id, recipient_email) do nothing;
  return NEW;
end;
$$;

revoke execute on function notify_review_replied() from public, anon, authenticated;

drop trigger if exists reviews_notify_replied on public.reviews;
create trigger reviews_notify_replied
  after update on public.reviews
  for each row execute function notify_review_replied();


-- ============================================================
-- 0018: loyalty cashback (earn)
-- ============================================================
create table if not exists public.loyalty_balance (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hours_balance numeric(10,2) not null default 0 check (hours_balance >= 0),
  hours_earned_lifetime numeric(10,2) not null default 0 check (hours_earned_lifetime >= 0),
  hours_redeemed_lifetime numeric(10,2) not null default 0 check (hours_redeemed_lifetime >= 0),
  updated_at timestamptz not null default now()
);

alter table public.loyalty_balance enable row level security;

drop policy if exists "users read own loyalty" on public.loyalty_balance;
create policy "users read own loyalty" on public.loyalty_balance
  for select to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.loyalty_balance from public, anon, authenticated;

create or replace function loyalty_earn_on_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid_hours numeric(10,2);
  v_cashback numeric(10,2);
begin
  if NEW.status != 'completed' then
    return NEW;
  end if;
  if OLD.status = 'completed' then
    return NEW;
  end if;
  v_paid_hours := greatest(0, NEW.hours - coalesce(NEW.redeem_hours, 0));
  v_cashback := round(v_paid_hours * 0.05, 2);
  if v_cashback <= 0 then
    return NEW;
  end if;
  insert into public.loyalty_balance (user_id, hours_balance, hours_earned_lifetime, updated_at)
  values (NEW.user_id, v_cashback, v_cashback, now())
  on conflict (user_id) do update set
    hours_balance = public.loyalty_balance.hours_balance + EXCLUDED.hours_balance,
    hours_earned_lifetime = public.loyalty_balance.hours_earned_lifetime + EXCLUDED.hours_earned_lifetime,
    updated_at = now();
  return NEW;
end;
$$;

revoke execute on function loyalty_earn_on_completed() from public, anon, authenticated;

drop trigger if exists bookings_loyalty_earn on public.bookings;
create trigger bookings_loyalty_earn
  after update of status on public.bookings
  for each row execute function loyalty_earn_on_completed();

-- Backfill existing completed bookings
do $$
declare
  v_row record;
begin
  delete from public.loyalty_balance;
  for v_row in
    select user_id, sum(round(hours * 0.05, 2))::numeric(10,2) as total_hours
    from public.bookings
    where status = 'completed'
    group by user_id
    having sum(round(hours * 0.05, 2)) > 0
  loop
    insert into public.loyalty_balance (user_id, hours_balance, hours_earned_lifetime, updated_at)
    values (v_row.user_id, v_row.total_hours, v_row.total_hours, now());
  end loop;
end;
$$;


-- ============================================================
-- 0019: loyalty redemption
-- ============================================================
alter table public.bookings
  add column if not exists redeem_hours numeric(10,2) not null default 0
  check (redeem_hours >= 0);

create or replace function loyalty_debit_on_booking_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric(10,2);
begin
  if NEW.redeem_hours <= 0 then
    return NEW;
  end if;
  if NEW.redeem_hours > NEW.hours then
    raise exception 'Cannot redeem % hours from a % hour booking', NEW.redeem_hours, NEW.hours;
  end if;
  select coalesce(hours_balance, 0) into v_balance
  from public.loyalty_balance
  where user_id = NEW.user_id
  for update;
  if v_balance is null or v_balance < NEW.redeem_hours then
    raise exception 'Insufficient loyalty balance: have %, need %', coalesce(v_balance, 0), NEW.redeem_hours;
  end if;
  update public.loyalty_balance set
    hours_balance = hours_balance - NEW.redeem_hours,
    hours_redeemed_lifetime = hours_redeemed_lifetime + NEW.redeem_hours,
    updated_at = now()
  where user_id = NEW.user_id;
  return NEW;
end;
$$;

revoke execute on function loyalty_debit_on_booking_insert() from public, anon, authenticated;

drop trigger if exists bookings_loyalty_debit on public.bookings;
create trigger bookings_loyalty_debit
  before insert on public.bookings
  for each row execute function loyalty_debit_on_booking_insert();

create or replace function loyalty_refund_on_booking_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status != 'cancelled' or OLD.status = 'cancelled' then
    return NEW;
  end if;
  if coalesce(NEW.redeem_hours, 0) <= 0 then
    return NEW;
  end if;
  update public.loyalty_balance set
    hours_balance = hours_balance + NEW.redeem_hours,
    hours_redeemed_lifetime = greatest(0, hours_redeemed_lifetime - NEW.redeem_hours),
    updated_at = now()
  where user_id = NEW.user_id;
  return NEW;
end;
$$;

revoke execute on function loyalty_refund_on_booking_cancel() from public, anon, authenticated;

drop trigger if exists bookings_loyalty_refund on public.bookings;
create trigger bookings_loyalty_refund
  after update of status on public.bookings
  for each row execute function loyalty_refund_on_booking_cancel();


-- ============================================================
-- 0020: photo attachments on reviews
-- ============================================================
insert into storage.buckets (id, name, public)
values ('review-photos', 'review-photos', true)
on conflict (id) do nothing;

drop policy if exists "review-photos public read" on storage.objects;
create policy "review-photos public read" on storage.objects
  for select using (bucket_id = 'review-photos');

drop policy if exists "review-photos auth upload" on storage.objects;
create policy "review-photos auth upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'review-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "review-photos auth delete own" on storage.objects;
create policy "review-photos auth delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'review-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

alter table public.reviews
  add column if not exists photo_urls text[] not null default '{}';

alter table public.reviews
  drop constraint if exists reviews_photo_urls_max;
alter table public.reviews
  add constraint reviews_photo_urls_max check (
    array_length(photo_urls, 1) is null or array_length(photo_urls, 1) <= 3
  );

-- Update guard trigger to also block club_admin from changing photo_urls
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


-- ============================================================
-- 0021: club geolocation
-- ============================================================
alter table public.clubs
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6);

alter table public.clubs
  drop constraint if exists clubs_latitude_range;
alter table public.clubs
  add constraint clubs_latitude_range check (latitude is null or (latitude >= -90 and latitude <= 90));

alter table public.clubs
  drop constraint if exists clubs_longitude_range;
alter table public.clubs
  add constraint clubs_longitude_range check (longitude is null or (longitude >= -180 and longitude <= 180));

update public.clubs set latitude = 43.2520, longitude = 76.9450 where district ilike '%Алмалин%';
update public.clubs set latitude = 43.2350, longitude = 76.9100 where district ilike '%Бостандык%';
update public.clubs set latitude = 43.2950, longitude = 76.9450 where district ilike '%Жетысу%';
update public.clubs set latitude = 43.2450, longitude = 76.9650 where district ilike '%Медеу%';
update public.clubs set latitude = 43.2350, longitude = 76.8800 where district ilike '%Ауэзов%';
update public.clubs set latitude = 43.3300, longitude = 76.9550 where district ilike '%Турксиб%';
update public.clubs set latitude = 43.2150, longitude = 76.8400 where district ilike '%Наурызбай%';
update public.clubs set latitude = 43.3300, longitude = 76.8700 where district ilike '%Алатау%';
update public.clubs set latitude = 51.1280, longitude = 71.4300 where city = 'astana' and latitude is null;
update public.clubs set latitude = 43.2380, longitude = 76.9450 where city = 'almaty' and latitude is null;

-- ============================================================
-- DONE. After this runs successfully, redeploy Edge Function:
--   supabase functions deploy send-notification --project-ref qfuhtvtietnldeqklxdo
-- (or wait — current Edge Function still works for non-review_replied events)
-- ============================================================
