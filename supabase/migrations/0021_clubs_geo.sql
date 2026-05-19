-- Migration 0021: club geolocation (Block 7.7).
-- Adds latitude + longitude columns to clubs so the catalog can sort by
-- distance from the user. Backfill is intentionally NULL for now —
-- real clubs supply real coords during onboarding; mock clubs without
-- coords simply appear at the end of the distance sort.

alter table public.clubs
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6);

-- Sanity range check (rough world bounds — won't block any real input)
alter table public.clubs
  drop constraint if exists clubs_latitude_range;
alter table public.clubs
  add constraint clubs_latitude_range check (latitude is null or (latitude >= -90 and latitude <= 90));

alter table public.clubs
  drop constraint if exists clubs_longitude_range;
alter table public.clubs
  add constraint clubs_longitude_range check (longitude is null or (longitude >= -180 and longitude <= 180));

-- Mock-club backfill: spread the 12 existing clubs across rough Almaty district
-- centers so the geo-distance sort is testable in dev. Real clubs override
-- via /dashboard/club/edit (Block 7.7 follow-up — add a map picker UI).
update public.clubs set latitude = 43.2520, longitude = 76.9450 where district ilike '%Алмалин%';
update public.clubs set latitude = 43.2350, longitude = 76.9100 where district ilike '%Бостандык%';
update public.clubs set latitude = 43.2950, longitude = 76.9450 where district ilike '%Жетысу%';
update public.clubs set latitude = 43.2450, longitude = 76.9650 where district ilike '%Медеу%';
update public.clubs set latitude = 43.2350, longitude = 76.8800 where district ilike '%Ауэзов%';
update public.clubs set latitude = 43.3300, longitude = 76.9550 where district ilike '%Турксиб%';
update public.clubs set latitude = 43.2150, longitude = 76.8400 where district ilike '%Наурызбай%';
update public.clubs set latitude = 43.3300, longitude = 76.8700 where district ilike '%Алатау%';
-- Astana fallback for non-Almaty city clubs
update public.clubs set latitude = 51.1280, longitude = 71.4300 where city = 'astana' and latitude is null;
-- Generic Almaty center for any Almaty club still missing coords
update public.clubs set latitude = 43.2380, longitude = 76.9450 where city = 'almaty' and latitude is null;
