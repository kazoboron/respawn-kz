-- Migration 0023: backfill geo coordinates for remaining 8 cities.
-- Migration 0021 only covered Almaty + Astana. Other cities had `latitude is null`
-- after apply, so distance sort excluded them. This migration fills approximate
-- city-center coordinates for the rest of Kazakhstan's covered cities.
--
-- Real clubs will replace these via /dashboard/club/edit map picker later.
-- Idempotent: only updates clubs where latitude is still null.

update public.clubs set latitude = 42.3417, longitude = 69.5901 where city = 'shymkent'  and latitude is null;
update public.clubs set latitude = 49.8047, longitude = 73.1094 where city = 'karaganda' and latitude is null;
update public.clubs set latitude = 50.2839, longitude = 57.1670 where city = 'aktobe'    and latitude is null;
update public.clubs set latitude = 42.9000, longitude = 71.3667 where city = 'taraz'     and latitude is null;
update public.clubs set latitude = 52.2873, longitude = 76.9674 where city = 'pavlodar'  and latitude is null;
update public.clubs set latitude = 49.9482, longitude = 82.6275 where city = 'oskemen'   and latitude is null;
update public.clubs set latitude = 50.4111, longitude = 80.2275 where city = 'semey'     and latitude is null;
update public.clubs set latitude = 47.1167, longitude = 51.8833 where city = 'atyrau'    and latitude is null;
