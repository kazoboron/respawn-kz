-- 0027 — clear Unsplash seed photos from clubs
--
-- Migration 0022 seeded Unsplash gaming photos for all 12 clubs as
-- visual placeholders. Some images contain Call-of-Duty: Warzone
-- screenshots / brand text that the user wants removed, and the rest
-- are stock photos that don't reflect real clubs anyway.
--
-- Clearing the photos array makes ClubCard fall back to its gradient +
-- initial-letter cover, which is intentional, consistent, and clean.
-- Real club photos will be uploaded later via the dashboard upload UI.

UPDATE public.clubs
SET photos = NULL
WHERE photos IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM unnest(photos) AS p
    WHERE p LIKE '%images.unsplash.com%'
  );
