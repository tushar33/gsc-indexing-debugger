#!/usr/bin/env node
'use strict';
/**
 * Phase 8 (automated, single sitemap) — full stats for ONE specific sitemap
 * path via Search Console sitemaps.get, including warnings/errors counts.
 * Prefer this over gsc-api-list-sitemaps.cjs when checking a specific child
 * sitemap: .list() has been observed to omit real sitemaps entirely (see
 * lib/gsc-api-client.cjs comment on listSitemaps).
 *
 * Usage: node gsc-api-get-sitemap.cjs <siteUrl> <sitemapPath> [--key <path>]
 *   siteUrl example: sc-domain:example.com
 *   sitemapPath example: https://www.example.com/sitemaps/videos/sitemap.xml
 */
const { loadServiceAccountCredentials, getSitemap } = require('./lib/gsc-api-client.cjs');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--key') args.key = argv[++i];
    else args._.push(a);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [siteUrl, sitemapPath] = args._;
  if (!siteUrl || !sitemapPath) {
    console.error('Usage: node gsc-api-get-sitemap.cjs <siteUrl> <sitemapPath> [--key <path>]');
    process.exit(1);
  }

  const creds = loadServiceAccountCredentials(args.key);
  if (!creds.configured) {
    console.log(JSON.stringify({
      automated: false,
      note: 'GSC EVIDENCE NOT AUTOMATED — no service account key found. See skills/gsc-indexing-debugger/README.md for setup.',
      expectedKeyPath: creds.keyPath,
    }, null, 2));
    return;
  }

  const result = await getSitemap(creds, siteUrl, sitemapPath);
  console.log(JSON.stringify({ automated: true, siteUrl, sitemapPath, ...result }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ automated: true, error: err.message }));
  process.exit(1);
});
