-- Migration 0006: enforce booking status transition rules via trigger
-- Defense-in-depth: UI also checks, but trigger is the source of truth.

create or replace function check_booking_status_transition()
returns trigger as $$
begin
  -- Terminal statuses are immutable
  if OLD.status in ('cancelled', 'completed', 'no_show')
     and NEW.status != OLD.status then
    raise exception 'Cannot change booking from terminal status %', OLD.status;
  end if;

  -- Customer (not club_admin/super_admin) can only transition to 'cancelled'
  if auth.uid() = OLD.user_id
     and NEW.status != OLD.status
     and NEW.status != 'cancelled' then
    if not exists (
      select 1 from public.club_admins
      where user_id = auth.uid() and club_slug = OLD.club_slug
    ) and not exists (
      select 1 from public.super_admins where user_id = auth.uid()
    ) then
      raise exception 'Customers can only cancel own bookings';
    end if;
  end if;

  -- Customer cannot cancel bookings whose date is already in the past
  if auth.uid() = OLD.user_id
     and NEW.status = 'cancelled'
     and OLD.date < current_date then
    if not exists (
      select 1 from public.club_admins
      where user_id = auth.uid() and club_slug = OLD.club_slug
    ) and not exists (
      select 1 from public.super_admins where user_id = auth.uid()
    ) then
      raise exception 'Cannot cancel bookings from past dates';
    end if;
  end if;

  -- Auto-stamp audit fields on any status change
  NEW.status_changed_at := now();
  NEW.status_changed_by := auth.uid();

  return NEW;
end;
$$ language plpgsql security definer;

create trigger bookings_status_transition_check
  before update of status on public.bookings
  for each row execute function check_booking_status_transition();
