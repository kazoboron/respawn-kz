// Edge Function: trigger-rebuild
// Invoked from /dashboard/club/edit after a successful UPDATE.
// Calls GitHub Actions workflow_dispatch with a PAT to trigger a deploy.
// PAT lives only in Supabase secrets (GH_PAT) — never exposed to client.

const GH_PAT = Deno.env.get('GH_PAT')!;
const REPO_OWNER = Deno.env.get('GH_REPO_OWNER') ?? 'kazoboron';
const REPO_NAME = Deno.env.get('GH_REPO_NAME') ?? 'respawn-kz';
const WORKFLOW_FILE = Deno.env.get('GH_WORKFLOW_FILE') ?? 'deploy.yml';
const REF = Deno.env.get('GH_REF') ?? 'main';

interface TriggerRequest {
  reason?: string;
}

Deno.serve(async (req) => {
  // Permissive CORS — same pattern as Supabase Edge Functions default
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  let body: TriggerRequest = {};
  try {
    if (req.headers.get('content-length') && req.headers.get('content-length') !== '0') {
      body = await req.json();
    }
  } catch {
    // Empty / invalid body is OK — we use defaults
  }

  const reason = body.reason ?? 'admin edit';

  // POST to GitHub Actions workflow_dispatch
  const ghUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/dispatches`;

  try {
    const ghResp = await fetch(ghUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GH_PAT}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'respawn-kz-trigger-rebuild',
      },
      body: JSON.stringify({
        ref: REF,
        inputs: { reason: reason.slice(0, 200) },
      }),
    });

    if (!ghResp.ok) {
      const errText = await ghResp.text();
      console.error('[trigger-rebuild] GitHub API failed', ghResp.status, errText);
      return new Response(
        JSON.stringify({ ok: false, error: `GitHub API ${ghResp.status}: ${errText.slice(0, 200)}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // workflow_dispatch returns 204 No Content on success
    return new Response(
      JSON.stringify({ ok: true, reason, dispatched_at: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[trigger-rebuild] fetch failed', msg);
    return new Response(
      JSON.stringify({ ok: false, error: `Transient error: ${msg}` }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
