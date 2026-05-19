-- Migration 0018: loyalty cashback (Block 7.1-7.4).
-- Users earn 5% of hours back on each completed booking.

-- ============================================================
-- 1. loyalty_balance table
-- ============================================================
create table if not exists public.loyalty_balance (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hours_balance numeric(10,2) not null default 0 check (hours_balance >= 0),
  hours_earned_lifetime numeric(10,2) not null default 0 check (hours_earned_lifetime >= 0),
  hours_redeemed_lifetime numeric(10,2) not null default 0 check (hours_redeemed_lifetime >= 0),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 2. RLS — users read their own balance
-- ============================================================
alter table public.loyalty_balance enable row level security;

drop policy if exists "users read own loyalty" on public.loyalty_balance;
create policy "users read own loyalty" on public.loyalty_balance
  for select to authenticated
  using (auth.uid() = user_id);

-- No client INSERT/UPDATE — only trigger or service_role writes.
revoke insert, update, delete on public.loyalty_balance from public, anon, authenticated;

-- ============================================================
-- 3. Trigger: earn cashback when booking transitions to 'completed'
-- ============================================================
create or replace function loyalty_earn_on_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cashback numeric(10,2);
begin
  -- Only fire on the transition INTO 'completed' (not on no-op or out-of-completed)
  if NEW.status != 'completed' then
    return NEW;
  end if;
  if OLD.status = 'completed' then
    return NEW;
  end if;

  v_cashback := round(NEW.hours * 0.05, 2);
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

-- ============================================================
-- 4. Backfill: grant cashback for already-completed bookings (one-time)
--    Idempotent: rebuilds balance from scratch by summing existing completed
--    bookings. Safe to re-run.
-- ============================================================
do $$
declare
  v_row record;
begin
  -- Reset any existing rows so re-runs don't double-credit
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
