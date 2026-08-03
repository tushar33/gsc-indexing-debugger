#!/usr/bin/env node
'use strict';
/**
 * Optional bonus for Phase 8 — cross-check the ACTUAL submitted-sitemap
 * status Google has recorded (lastSubmitted, isPending, warnings, errors),
 * distinct from check-sitemap.cjs which only crawls the public sitemap XML.
 * Requires the same service account as gsc-api-inspect.cjs.
 *
 * Usage: node gsc-api-list-sitemaps.cjs <siteUrl> [--key <path>]
 *   siteUrl example: https://www.example.com/
 *   or for a Domain property: sc-domain:example.com
 */
const { loadServiceAccountCredentials, listSitemaps } = require('./lib/gsc-api-client.cjs');

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
  const siteUrl = args._[0];
  if (!siteUrl) {
    console.error('Usage: node gsc-api-list-sitemaps.cjs <siteUrl> [--key <path>]');
    console.error('siteUrl example: https://www.example.com/  (or sc-domain:example.com)');
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

  const result = await listSitemaps(creds, siteUrl);
  console.log(JSON.stringify({ automated: true, siteUrl, sitemaps: result.sitemap || [] }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ automated: true, error: err.message }));
  process.exit(1);
});
