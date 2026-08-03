#!/usr/bin/env node
'use strict';
/**
 * Phase 2 (automated) — call the real Search Console URL Inspection API for
 * fresh Google-side evidence, instead of relying on manually pasted GSC text.
 *
 * Falls back cleanly (never throws) when no service account is configured —
 * prints `{ automated: false, ... }` so the caller can fall back to manual
 * GSC input without breaking the investigation. Requires a service account
 * key — see README.md for setup. Read-only scope only
 * (webmasters.readonly), enforced in lib/gsc-api-client.cjs.
 *
 * Usage: node gsc-api-inspect.cjs <url> [--site-url <property>] [--key <path>]
 */
const { loadServiceAccountCredentials, inspectUrl } = require('./lib/gsc-api-client.cjs');
const { loadConfig } = require('./lib/config.cjs');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--site-url') args.siteUrl = argv[++i];
    else if (a === '--key') args.key = argv[++i];
    else args._.push(a);
  }
  return args;
}

// If gsc-indexing-debugger.config.json declares `domain` (a Domain property),
// use its sc-domain: form for that host. Any other host (staging/preview
// domains, etc.) falls back to a URL-prefix guess; override either with
// --site-url or GSC_SITE_URL.
function guessSiteUrl(url, config) {
  const { hostname, origin } = new URL(url);
  const bareHost = hostname.replace(/^www\./, '');
  if (config.domain && bareHost === config.domain) return `sc-domain:${config.domain}`;
  return `${origin}/`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = args._[0];
  if (!url) {
    console.error('Usage: node gsc-api-inspect.cjs <url> [--site-url <property>] [--key <path>]');
    process.exit(1);
  }

  const creds = loadServiceAccountCredentials(args.key);
  if (!creds.configured) {
    console.log(JSON.stringify({
      automated: false,
      note: 'GSC EVIDENCE NOT AUTOMATED — no service account key found. See README.md for setup.',
      expectedKeyPath: creds.keyPath,
    }, null, 2));
    return;
  }

  const config = loadConfig();
  const siteUrl = args.siteUrl || process.env.GSC_SITE_URL || config.siteUrl || guessSiteUrl(url, config);
  const result = await inspectUrl(creds, { inspectionUrl: url, siteUrl });
  const indexStatus = result.inspectionResult && result.inspectionResult.indexStatusResult;

  console.log(JSON.stringify({
    automated: true,
    siteUrlUsed: siteUrl,
    inspectionUrl: url,
    inspectionResultLink: result.inspectionResult && result.inspectionResult.inspectionResultLink,
    verdict: indexStatus ? indexStatus.verdict : null,
    coverageState: indexStatus ? indexStatus.coverageState : null,
    lastCrawlTime: indexStatus ? indexStatus.lastCrawlTime : null,
    crawledAs: indexStatus ? indexStatus.crawledAs : null,
    pageFetchState: indexStatus ? indexStatus.pageFetchState : null,
    robotsTxtState: indexStatus ? indexStatus.robotsTxtState : null,
    indexingState: indexStatus ? indexStatus.indexingState : null,
    userCanonical: indexStatus ? indexStatus.userCanonical : null,
    googleCanonical: indexStatus ? indexStatus.googleCanonical : null,
    referringUrls: indexStatus ? indexStatus.referringUrls || [] : [],
    sitemap: indexStatus ? indexStatus.sitemap || [] : [],
    raw: result,
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ automated: true, error: err.message }));
  process.exit(1);
});
