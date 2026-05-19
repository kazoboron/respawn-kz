#!/usr/bin/env node
// Apply pending Supabase migrations + re-deploy Edge Function.
// Usage: npm run apply-pending
//
// Prerequisites:
// - `supabase login` once (browser flow; token cached locally)
// - Repo cloned with all supabase/migrations/*.sql files
//
// Idempotent: re-running won't re-apply already-applied migrations
// (Supabase CLI tracks state) and won't break the Edge Function.

import { spawnSync } from 'node:child_process';

const PROJECT_REF = 'qfuhtvtietnldeqklxdo';

function run(cmd, args, label) {
  console.log(`\n▶ ${label}`);
  console.log(`  $ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
  console.log(`✓ ${label}`);
}

console.log('Applying pending Supabase work for respawn.kz');
console.log('=============================================');

// 1. Make sure we're linked to the project (idempotent — re-link is fine)
run('npx', ['supabase', 'link', '--project-ref', PROJECT_REF], 'Link Supabase project');

// 2. Apply all pending migrations
run('npx', ['supabase', 'db', 'push'], 'Apply migrations');

// 3. Re-deploy the notification Edge Function (templates + escaping)
run('npx', ['supabase', 'functions', 'deploy', 'send-notification', '--project-ref', PROJECT_REF], 'Deploy send-notification');

console.log('\n=============================================');
console.log('✓ All pending Supabase work applied');
console.log('');
console.log('Next: visit https://respawn.kz and verify');
console.log('  • Loyalty card shows on /me (after a completed booking)');
console.log('  • Club admin reply works on /admin/reviews & /dashboard/reviews');
console.log('  • Review photo upload works on /reviews/new');
console.log('  • "Сначала ближайшие" sort works on /clubs');
