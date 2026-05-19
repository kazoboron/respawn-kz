-- Migration 0022: seed placeholder photos for mock clubs.
-- User feedback 2026-05-20: "вставь в каждый клуб по несколько фотографии
-- якобы их фотки чтобы видно было нагляднее".
--
-- Distributes 4 photo triplets via abs(hashtext(slug)) % 4 so different
-- clubs get different first photos on cards — avoids identical look.
-- All URLs are Unsplash CDN (royalty-free, no API key required for direct
-- linking). Real clubs replace these via /dashboard/club/edit later.
--
-- Idempotent: only touches rows where photos is null/empty, so re-applying
-- doesn't overwrite real club photos that may have been uploaded since.

update public.clubs
set photos = case abs(hashtext(slug)) % 4
  when 0 then array[
    'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=1200&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1556438064-2d7646166914?w=1200&q=80&auto=format&fit=crop'
  ]
  when 1 then array[
    'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=1200&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1200&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=1200&q=80&auto=format&fit=crop'
  ]
  when 2 then array[
    'https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=1200&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=1200&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200&q=80&auto=format&fit=crop'
  ]
  else array[
    'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1200&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1556438064-2d7646166914?w=1200&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=1200&q=80&auto=format&fit=crop'
  ]
end
where photos is null or cardinality(photos) = 0;
