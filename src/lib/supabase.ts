import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = !!(url && key);

if (!supabaseConfigured) {
  console.warn(
    '[supabase] Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY in .env. ' +
    'Auth/booking features will not work. See .env.example.'
  );
}

// Используем placeholder если env отсутствует — клиент создастся, но запросы провалятся.
// Это позволяет странам без auth работать в dev, и явно сигнализирует если auth/booking вызвали.
export const supabase: SupabaseClient = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
