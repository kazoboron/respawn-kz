// One-shot Edge Function: applies migration 0028 (replace seed clubs
// with 15 real ones from Yandex.Maps research). Same pattern as the
// apply-trigger-fix function — connects via SUPABASE_DB_URL with
// service-role privilege, runs the full migration, returns before/after
// counts.

const MIGRATION_SQL = `
DELETE FROM public.bookings WHERE club_slug IN (
  'cyberzone', 'colizeum-astana', 'nexus-astana', 'gamerhub', 'rage-arena',
  'playzone-taraz', 'cyber-atyrau', 'ignite-karaganda', 'respawn-pavlodar',
  'lobby-semey', 'netgame-aktobe', 'epic-oskemen'
);
DELETE FROM public.reviews WHERE club_slug IN (
  'cyberzone', 'colizeum-astana', 'nexus-astana', 'gamerhub', 'rage-arena',
  'playzone-taraz', 'cyber-atyrau', 'ignite-karaganda', 'respawn-pavlodar',
  'lobby-semey', 'netgame-aktobe', 'epic-oskemen'
);
DELETE FROM public.club_admins WHERE club_slug IN (
  'cyberzone', 'colizeum-astana', 'nexus-astana', 'gamerhub', 'rage-arena',
  'playzone-taraz', 'cyber-atyrau', 'ignite-karaganda', 'respawn-pavlodar',
  'lobby-semey', 'netgame-aktobe', 'epic-oskemen'
);
DELETE FROM public.clubs WHERE slug IN (
  'cyberzone', 'colizeum-astana', 'nexus-astana', 'gamerhub', 'rage-arena',
  'playzone-taraz', 'cyber-atyrau', 'ignite-karaganda', 'respawn-pavlodar',
  'lobby-semey', 'netgame-aktobe', 'epic-oskemen'
);

INSERT INTO public.clubs (slug, name, city, district, address, phone, price_per_hour, rating, reviews_count, equipment, tags, gradient, initial, working_hours, latitude, longitude, is_published, description) VALUES
('cyber-dynasty', 'Cyber Dynasty', 'almaty', 'Алмалинский р-н', 'ул. Халела Досмухамедова, 83 к2', NULL, 1200, 5.0, 25, ARRAY['RTX 4060 Ti / i5-13400','Мониторы 165Hz','Razer DeathAdder','Кресла DXRacer'], ARRAY['PC'], 'linear-gradient(135deg, #8b5cf6, #ec4899)', 'C', '{"mon":{"open":"24h","close":"24h"},"tue":{"open":"24h","close":"24h"},"wed":{"open":"24h","close":"24h"},"thu":{"open":"24h","close":"24h"},"fri":{"open":"24h","close":"24h"},"sat":{"open":"24h","close":"24h"},"sun":{"open":"24h","close":"24h"}}'::jsonb, 43.247, 76.937, true, 'Современный компьютерный клуб в Алмалинском районе. Топ-рейтинг 5.0 на Яндекс.Картах, открыт круглосуточно.'),
('log-almaty', 'Log', 'almaty', 'Медеуский р-н', 'просп. Назарбаева, 42', NULL, 1100, 5.0, 65, ARRAY['RTX 4060 / i5-13400','Мониторы 165Hz','Razer DeathAdder','Кресла DXRacer'], ARRAY['PC'], 'linear-gradient(135deg, #6366f1, #8b5cf6)', 'L', '{"mon":{"open":"24h","close":"24h"},"tue":{"open":"24h","close":"24h"},"wed":{"open":"24h","close":"24h"},"thu":{"open":"24h","close":"24h"},"fri":{"open":"24h","close":"24h"},"sat":{"open":"24h","close":"24h"},"sun":{"open":"24h","close":"24h"}}'::jsonb, 43.262, 76.957, true, 'Один из самых посещаемых клубов Алматы — рейтинг 5.0 при 65+ отзывах. Просп. Назарбаева, в самом центре.'),
('lord-game-hub', 'Lord Game Hub', 'almaty', 'Алмалинский р-н', 'ул. Мукагали Макатаева, 117А', NULL, 1000, 4.5, 27, ARRAY['RTX 4060 / i5-13400','Мониторы 165Hz','Razer DeathAdder','Кресла DXRacer'], ARRAY['PC'], 'linear-gradient(135deg, #a78bfa, #f472b6)', 'L', '{"mon":{"open":"24h","close":"24h"},"tue":{"open":"24h","close":"24h"},"wed":{"open":"24h","close":"24h"},"thu":{"open":"24h","close":"24h"},"fri":{"open":"24h","close":"24h"},"sat":{"open":"24h","close":"24h"},"sun":{"open":"24h","close":"24h"}}'::jsonb, 43.260, 76.953, true, 'Стабильный клуб в Алмалинском районе на Мукагали Макатаева. Рейтинг 4.5, открыт 24/7.'),
('liberty-almaty', 'Liberty', 'almaty', 'Медеуский р-н', 'просп. Достык, 55 (цокольный этаж)', NULL, 1100, 4.7, 15, ARRAY['RTX 4060 / i5-13400','Мониторы 165Hz','Razer DeathAdder','Кресла DXRacer'], ARRAY['PC'], 'linear-gradient(135deg, #7c3aed, #a78bfa)', 'L', '{"mon":{"open":"24h","close":"24h"},"tue":{"open":"24h","close":"24h"},"wed":{"open":"24h","close":"24h"},"thu":{"open":"24h","close":"24h"},"fri":{"open":"24h","close":"24h"},"sat":{"open":"24h","close":"24h"},"sun":{"open":"24h","close":"24h"}}'::jsonb, 43.241, 76.954, true, 'Подвальный гейминг-зал на Достык, 55. Рейтинг 4.7, круглосуточно.'),
('garena-games-club', 'Garena Games Club', 'almaty', 'Алмалинский р-н', 'ул. Байтурсынова, 9', NULL, 900, 4.3, 23, ARRAY['RTX 4060 / i5-13400','Мониторы 165Hz','Razer DeathAdder','Кресла DXRacer'], ARRAY['PC'], 'linear-gradient(135deg, #8b5cf6, #22d3ee)', 'G', '{"mon":{"open":"24h","close":"24h"},"tue":{"open":"24h","close":"24h"},"wed":{"open":"24h","close":"24h"},"thu":{"open":"24h","close":"24h"},"fri":{"open":"24h","close":"24h"},"sat":{"open":"24h","close":"24h"},"sun":{"open":"24h","close":"24h"}}'::jsonb, 43.236, 76.945, true, 'Доступный клуб на Байтурсынова, 9. Рейтинг 4.3, открыт 24 часа.'),
('colizeum-saryarka', 'Colizeum', 'astana', 'Есильский р-н', 'просп. Сарыарка, 11', NULL, 1500, 5.0, 108, ARRAY['RTX 4080 / i7-14700K','Мониторы 360Hz','6 Sim Racing кабин Logitech G Pro','Профессиональные стримерские установки','Кресла Secretlab'], ARRAY['PC','Sim Racing'], 'linear-gradient(135deg, #8b5cf6, #ec4899)', 'C', '{"mon":{"open":"24h","close":"24h"},"tue":{"open":"24h","close":"24h"},"wed":{"open":"24h","close":"24h"},"thu":{"open":"24h","close":"24h"},"fri":{"open":"24h","close":"24h"},"sat":{"open":"24h","close":"24h"},"sun":{"open":"24h","close":"24h"}}'::jsonb, 51.137, 71.422, true, 'Флагман сети Colizeum в Астане. 60 мест, симуляторы гонок, отдельные VIP-стримерские. Рейтинг 5.0, 108 отзывов.'),
('colizeum-kuyshi-diny', 'Colizeum', 'astana', 'Алматинский р-н', 'ул. Куйши Дины, 20 (5 этаж)', NULL, 1400, 5.0, 33, ARRAY['RTX 4080 / i7-14700K','Мониторы 240Hz','Razer DeathAdder','Кресла Secretlab'], ARRAY['PC'], 'linear-gradient(135deg, #6366f1, #8b5cf6)', 'C', '{"mon":{"open":"24h","close":"24h"},"tue":{"open":"24h","close":"24h"},"wed":{"open":"24h","close":"24h"},"thu":{"open":"24h","close":"24h"},"fri":{"open":"24h","close":"24h"},"sat":{"open":"24h","close":"24h"},"sun":{"open":"24h","close":"24h"}}'::jsonb, 51.158, 71.388, true, 'Второй филиал Colizeum на Куйши Дины. Премиум-сетапы, рейтинг 5.0.'),
('top-game-astana', 'Top Game', 'astana', 'Есильский р-н', 'ул. Динмухамеда Кунаева, 23 (1-2 этажи)', NULL, 1000, 4.6, 16, ARRAY['RTX 4060 Ti / i5-13400','Мониторы 165Hz','Razer DeathAdder','Кресла DXRacer'], ARRAY['PC'], 'linear-gradient(135deg, #a78bfa, #f472b6)', 'T', '{"mon":{"open":"24h","close":"24h"},"tue":{"open":"24h","close":"24h"},"wed":{"open":"24h","close":"24h"},"thu":{"open":"24h","close":"24h"},"fri":{"open":"24h","close":"24h"},"sat":{"open":"24h","close":"24h"},"sun":{"open":"24h","close":"24h"}}'::jsonb, 51.124, 71.421, true, 'Двухэтажный клуб на Кунаева, 23. Рейтинг 4.6, круглосуточно.'),
('prime-game-hub', 'Prime Game Hub', 'astana', 'Есильский р-н', 'просп. Кабанбай Батыра, 11', NULL, 1100, 4.5, 13, ARRAY['RTX 4060 / i5-13400','Мониторы 165Hz','Razer DeathAdder','Кресла DXRacer'], ARRAY['PC'], 'linear-gradient(135deg, #7c3aed, #a78bfa)', 'P', '{"mon":{"open":"24h","close":"24h"},"tue":{"open":"24h","close":"24h"},"wed":{"open":"24h","close":"24h"},"thu":{"open":"24h","close":"24h"},"fri":{"open":"24h","close":"24h"},"sat":{"open":"24h","close":"24h"},"sun":{"open":"24h","close":"24h"}}'::jsonb, 51.123, 71.420, true, 'Премиум-клуб на Кабанбай Батыра, 11. Рейтинг 4.5, открыт круглосуточно.'),
('versus-astana', 'Versus', 'astana', 'Алматинский р-н', 'ул. Куйши Дины, 11/1 (1 этаж)', NULL, 1000, 4.4, 73, ARRAY['RTX 4060 / i5-13400','Мониторы 165Hz','Razer DeathAdder','Кресла DXRacer'], ARRAY['PC'], 'linear-gradient(135deg, #8b5cf6, #22d3ee)', 'V', '{"mon":{"open":"24h","close":"24h"},"tue":{"open":"24h","close":"24h"},"wed":{"open":"24h","close":"24h"},"thu":{"open":"24h","close":"24h"},"fri":{"open":"24h","close":"24h"},"sat":{"open":"24h","close":"24h"},"sun":{"open":"24h","close":"24h"}}'::jsonb, 51.157, 71.385, true, 'Народный клуб с 73 отзывами и рейтингом 4.4. Куйши Дины, 11/1.'),
('rocket-shymkent', 'Rocket', 'shymkent', 'Каратауский р-н', 'ул. Аргынбекова, 6864А', NULL, 800, 4.9, 57, ARRAY['RTX 4060 Ti / i5-13400','Мониторы 165Hz','Razer DeathAdder','Кресла DXRacer'], ARRAY['PC'], 'linear-gradient(135deg, #8b5cf6, #ec4899)', 'R', '{"mon":{"open":"24h","close":"24h"},"tue":{"open":"24h","close":"24h"},"wed":{"open":"24h","close":"24h"},"thu":{"open":"24h","close":"24h"},"fri":{"open":"24h","close":"24h"},"sat":{"open":"24h","close":"24h"},"sun":{"open":"24h","close":"24h"}}'::jsonb, 42.327, 69.587, true, 'Лучший клуб Шымкента — рейтинг 4.9 при 57 отзывах. Каратауский район, круглосуточно.'),
('warzone-shymkent', 'Warzone', 'shymkent', 'Аль-Фарабийский р-н', 'просп. Тауке хана, 43А/1', NULL, 900, 4.8, 20, ARRAY['RTX 4060 / i5-13400','Мониторы 165Hz','Razer DeathAdder','Кресла DXRacer'], ARRAY['PC'], 'linear-gradient(135deg, #6366f1, #8b5cf6)', 'W', '{"mon":{"open":"24h","close":"24h"},"tue":{"open":"24h","close":"24h"},"wed":{"open":"24h","close":"24h"},"thu":{"open":"24h","close":"24h"},"fri":{"open":"24h","close":"24h"},"sat":{"open":"24h","close":"24h"},"sun":{"open":"24h","close":"24h"}}'::jsonb, 42.317, 69.596, true, 'Клуб Warzone на Тауке хана. Рейтинг 4.8, круглосуточно.'),
('next-cyber-club', 'Next Cyber Club', 'shymkent', 'Аль-Фарабийский р-н', 'ж.к. Shymcity, 29', NULL, 900, 4.5, 4, ARRAY['RTX 4060 / i5-13400','Мониторы 165Hz','Razer DeathAdder','Кресла DXRacer'], ARRAY['PC'], 'linear-gradient(135deg, #a78bfa, #f472b6)', 'N', '{"mon":{"open":"24h","close":"24h"},"tue":{"open":"24h","close":"24h"},"wed":{"open":"24h","close":"24h"},"thu":{"open":"24h","close":"24h"},"fri":{"open":"24h","close":"24h"},"sat":{"open":"24h","close":"24h"},"sun":{"open":"24h","close":"24h"}}'::jsonb, 42.340, 69.600, true, 'Новый клуб в жилом комплексе Shymcity. Рейтинг 4.5, круглосуточно.'),
('zhasmin-shymkent', 'Жасмин', 'shymkent', 'Каратауский р-н', 'ул. Крейсер Аврора, 26/2', NULL, 700, 4.5, 54, ARRAY['RTX 4060 / i5-13400','Мониторы 144Hz','Razer DeathAdder','Кресла DXRacer'], ARRAY['PC'], 'linear-gradient(135deg, #7c3aed, #a78bfa)', 'Ж', '{"mon":{"open":"12:00","close":"03:00"},"tue":{"open":"12:00","close":"03:00"},"wed":{"open":"12:00","close":"03:00"},"thu":{"open":"12:00","close":"03:00"},"fri":{"open":"12:00","close":"03:00"},"sat":{"open":"12:00","close":"03:00"},"sun":{"open":"12:00","close":"03:00"}}'::jsonb, 42.335, 69.572, true, 'Уютный клуб на Крейсер Аврора. Рейтинг 4.5 при 54 отзывах. Работает с 12:00 до 03:00.'),
('bro-shymkent', 'Bro', 'shymkent', 'Енбекшинский р-н', 'просп. Байдибек би, 116к7', NULL, 700, 4.0, 0, ARRAY['RTX 4060 / i5-13400','Мониторы 144Hz','Razer DeathAdder','Кресла DXRacer'], ARRAY['PC'], 'linear-gradient(135deg, #8b5cf6, #22d3ee)', 'B', '{"mon":{"open":"24h","close":"24h"},"tue":{"open":"24h","close":"24h"},"wed":{"open":"24h","close":"24h"},"thu":{"open":"24h","close":"24h"},"fri":{"open":"24h","close":"24h"},"sat":{"open":"24h","close":"24h"},"sun":{"open":"24h","close":"24h"}}'::jsonb, 42.305, 69.610, true, 'Новый клуб на Байдибек би, 116. Круглосуточно, без отзывов пока.');
`;

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-max-age': '86400',
  'content-type': 'application/json',
};
function j(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: cors });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { headers: cors });
  if (req.method !== 'POST') return j({ ok: false, error: 'POST only' }, 405);

  let Client: typeof import('https://deno.land/x/postgres@v0.19.3/mod.ts').Client;
  try {
    ({ Client } = await import('https://deno.land/x/postgres@v0.19.3/mod.ts'));
  } catch (e) {
    return j({ ok: false, stage: 'import', error: String(e) }, 500);
  }

  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) return j({ ok: false, stage: 'env', error: 'SUPABASE_DB_URL missing' }, 500);

  const client = new Client(dbUrl);
  try {
    await client.connect();

    const before = await client.queryObject<{ count: bigint }>('SELECT COUNT(*) AS count FROM public.clubs');

    // Run the migration inside a transaction for atomicity
    await client.queryArray('BEGIN');
    try {
      await client.queryArray(MIGRATION_SQL);
      await client.queryArray('COMMIT');
    } catch (e) {
      await client.queryArray('ROLLBACK');
      throw e;
    }

    const after = await client.queryObject<{ count: bigint }>('SELECT COUNT(*) AS count FROM public.clubs');
    const sample = await client.queryObject<{ slug: string; name: string; city: string; rating: number }>(
      "SELECT slug, name, city, rating FROM public.clubs ORDER BY city, rating DESC LIMIT 20"
    );

    return j({
      ok: true,
      before_count: Number(before.rows[0]?.count ?? 0),
      after_count: Number(after.rows[0]?.count ?? 0),
      sample: sample.rows,
    });
  } catch (e) {
    return j({ ok: false, stage: 'db', error: e instanceof Error ? e.message : String(e) }, 500);
  } finally {
    try { await client.end(); } catch (_) {}
  }
});
