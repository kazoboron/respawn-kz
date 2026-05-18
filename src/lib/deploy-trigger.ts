// Calls the Supabase Edge Function `trigger-rebuild` which proxies to
// GitHub Actions workflow_dispatch with a PAT held in Supabase secrets.
// The site is rebuilt via GitHub Actions → wrangler pages deploy.

import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;

export async function triggerSiteRebuild(reason = 'admin edit'): Promise<{ ok: boolean; error?: string }> {
  if (!SUPABASE_URL) {
    console.warn('[deploy-trigger] PUBLIC_SUPABASE_URL not set, skipping rebuild');
    return { ok: false, error: 'Supabase URL not configured' };
  }

  try {
    // Use the supabase client's functions.invoke so auth + service URL are wired correctly.
    const { data, error } = await supabase.functions.invoke('trigger-rebuild', {
      body: { reason },
    });
    if (error) {
      console.warn('[deploy-trigger] invoke failed:', error.message);
      return { ok: false, error: error.message };
    }
    if (data && data.ok === false) {
      console.warn('[deploy-trigger] function returned error:', data.error);
      return { ok: false, error: data.error };
    }
    return { ok: true };
  } catch (err) {
    const msg = (err as Error).message;
    console.warn('[deploy-trigger] threw:', msg);
    return { ok: false, error: msg };
  }
}
