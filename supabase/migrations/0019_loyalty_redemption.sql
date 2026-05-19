-- Migration 0019: loyalty cashback redemption (Block 7.3-7.4).
-- Customers can spend accumulated cashback hours when creating a booking.

-- ============================================================
-- 1. Add redeem_hours column to bookings
-- ============================================================
alter table public.bookings
  add column if not exists redeem_hours numeric(10,2) not null default 0
  check (redeem_hours >= 0);

-- ============================================================
-- 2. BEFORE INSERT trigger: validate balance + debit
-- ============================================================
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

  -- Can't redeem more than the booking itself covers
  if NEW.redeem_hours > NEW.hours then
    raise exception 'Cannot redeem % hours from a % hour booking', NEW.redeem_hours, NEW.hours;
  end if;

  -- Lock the balance row to prevent race conditions
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

-- ============================================================
-- 3. AFTER UPDATE trigger: refund balance when booking gets cancelled
-- ============================================================
create or replace function loyalty_refund_on_booking_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only refund on transition INTO 'cancelled' from a non-cancelled state
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
-- 4. Update earn trigger from 0018 — calculate cashback on EFFECTIVELY PAID hours
--    (subtract redeem_hours so users don't double-dip cashback on redeemed hours)
-- ============================================================
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
