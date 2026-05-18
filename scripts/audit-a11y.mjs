#!/usr/bin/env node
// Lighthouse a11y audit runner for respawn.kz.
// Usage: node scripts/audit-a11y.mjs [baseUrl]
//   defaults to http://localhost:4321
// Prints a markdown table of {url, score} and writes JSON to docs/audit/a11y-latest.json

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseUrl = process.argv[2] ?? 'http://localhost:4321';

// Public + auth-gated pages. Auth-gated pages will get partial scores (login redirect)
// — for those, run Lighthouse manually in an authenticated browser session.
const PATHS = [
  '/',
  '/about/',
  '/for-clubs/',
  '/privacy/',
  '/terms/',
  '/clubs/',
  '/clubs/cyberzone/',
  // Other club slugs auto-discovered via sitemap at runtime would be ideal,
  // but for baseline we audit one representative club page. Add more slugs
  // here after confirming they exist via `curl https://respawn.kz/sitemap-0.xml`.
  '/login/',
  '/reviews/new/',
  '/me/',
  '/admin/',
  '/admin/reviews/',
  '/admin/applications/',
  '/admin/users/',
  '/admin/owners/',
  '/dashboard/',
  '/dashboard/bookings/',
  '/dashboard/applications/',
  '/dashboard/register/',
  '/dashboard/club/edit/',
  // NOTE: /404/ removed — Astro builds dist/404.html (not dist/404/index.html).
  // Cloudflare Pages serves it on any 404. Auditing /404/ always scores 0.
];

async function runAudit(url, chromePort) {
  const result = await lighthouse(url, {
    port: chromePort,
    output: 'json',
    onlyCategories: ['accessibility'],
    logLevel: 'error',
  });
  const score = Math.round((result.lhr.categories.accessibility.score ?? 0) * 100);
  const audits = result.lhr.audits;
  const failures = Object.values(audits)
    .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode !== 'notApplicable')
    .map((a) => ({ id: a.id, title: a.title, score: a.score }));
  return { url, score, failures };
}

let chrome;
try {
  chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
  const results = [];
  for (const path of PATHS) {
    const url = `${baseUrl}${path}`;
    try {
      const r = await runAudit(url, chrome.port);
      results.push(r);
      console.log(`${r.score >= 95 ? '✅' : '⚠️ '} ${path} — ${r.score}`);
    } catch (e) {
      results.push({ url, score: 0, failures: [{ id: 'error', title: e.message }] });
      console.log(`❌ ${path} — ERROR: ${e.message}`);
    }
  }

  const outDir = join(__dirname, '..', 'docs', 'audit');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'a11y-latest.json'), JSON.stringify(results, null, 2));

  const avg = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
  const passing = results.filter((r) => r.score >= 95).length;
  console.log(`\nSummary: ${passing}/${results.length} ≥95, avg ${avg}`);
  console.log(`Full report: docs/audit/a11y-latest.json`);
} finally {
  await chrome?.kill();
}
