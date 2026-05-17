-- Migration 0008: FKs from club_admins/bookings to clubs + slot validation trigger
-- IMPORTANT: must be applied AFTER seed runs (otherwise FK validation fails
-- because club_admins/bookings already reference slugs).

-- =====================================================================
-- Foreign keys
-- =====================================================================

alter table public.club_admins
  add constraint club_admins_club_slug_fkey
  foreign key (club_slug) references public.clubs(slug) on delete cascade;

alter table public.bookings
  add constraint bookings_club_slug_fkey
  foreign key (club_slug) references public.clubs(slug);

-- =====================================================================
-- Slot validation trigger
-- =====================================================================

create or replace function check_booking_slot_valid()
returns trigger as $$
declare
  v_hours jsonb;
  v_day text;
  v_open time;
  v_close time;
  v_start time;
  v_end_time time;
  overnight boolean;
begin
  -- Skip when only status changes (status trigger handles those rules)
  if TG_OP = 'UPDATE'
     and NEW.date = OLD.date
     and NEW.time_slot = OLD.time_slot
     and NEW.hours = OLD.hours then
    return NEW;
  end if;

  if NEW.date < current_date then
    raise exception 'Cannot book past dates';
  end if;

  if not exists (select 1 from public.clubs where slug = NEW.club_slug and is_published = true) then
    raise exception 'Club % does not exist or is not published', NEW.club_slug;
  end if;

  select working_hours into v_hours from public.clubs where slug = NEW.club_slug;
  v_day := lower(to_char(NEW.date, 'dy'));

  if v_hours->v_day is null or v_hours->v_day = 'null'::jsonb then
    raise exception 'Club closed on %', v_day;
  end if;

  if (v_hours->v_day->>'open') = '24h' then
    null;
  else
    v_open := (v_hours->v_day->>'open')::time;
    v_close := (v_hours->v_day->>'close')::time;
    v_start := NEW.time_slot::time;
    v_end_time := (v_start + (NEW.hours || ' hours')::interval)::time;
    overnight := v_close < v_open;

    if not overnight then
      if v_start < v_open or v_end_time > v_close then
        raise exception 'Time slot %-% outside working hours (%-%)', v_start, v_end_time, v_open, v_close;
      end if;
    else
      if not (v_start >= v_open or v_end_time <= v_close) then
        raise exception 'Time slot %-% outside working hours (% - % overnight)', v_start, v_end_time, v_open, v_close;
      end if;
    end if;
  end if;

  if exists (
    select 1 from public.bookings b
    where b.club_slug = NEW.club_slug
      and b.date = NEW.date
      and b.status in ('pending', 'confirmed')
      and b.id != coalesce(NEW.id, gen_random_uuid())
      and tsrange(
        (b.date + b.time_slot::time)::timestamp,
        (b.date + b.time_slot::time + (b.hours || ' hours')::interval)::timestamp
      ) && tsrange(
        (NEW.date + NEW.time_slot::time)::timestamp,
        (NEW.date + NEW.time_slot::time + (NEW.hours || ' hours')::interval)::timestamp
      )
  ) then
    raise exception 'Time slot overlaps with existing booking';
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger bookings_slot_validation
  before insert or update of date, time_slot, hours on public.bookings
  for each row execute function check_booking_slot_valid();
