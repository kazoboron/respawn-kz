const HOOK_URL = import.meta.env.PUBLIC_CF_DEPLOY_HOOK_URL;

export async function triggerSiteRebuild(): Promise<{ ok: boolean; error?: string }> {
  if (!HOOK_URL) {
    console.warn('[deploy-trigger] PUBLIC_CF_DEPLOY_HOOK_URL not set, skipping rebuild');
    return { ok: false, error: 'Hook URL not configured' };
  }
  try {
    const response = await fetch(HOOK_URL, { method: 'POST' });
    if (!response.ok) {
      return { ok: false, error: `${response.status} ${response.statusText}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
