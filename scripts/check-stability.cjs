#!/usr/bin/env node
'use strict';
/**
 * Phase 4 — repeat-fetch a URL as Googlebot to test prerender response stability.
 * Low concurrency by design: requests run sequentially with a delay between them.
 *
 * This script only buckets by status/size/hash equality (STABLE, HASH_VARIANCE,
 * SIZE_VARIANCE, INTERMITTENT_HTTP_FAILURE). If hashes vary, inspect the saved
 * responses to decide whether the variance is INTERMITTENT_RAW_SHELL,
 * INTERMITTENT_WRONG_ENTITY, or UNKNOWN_VARIANCE (content judgment call — not
 * automated here) per references/classification-guide.md.
 *
 * Usage: node check-stability.cjs <url> [--count 10] [--delay-ms 500]
 */
const { fetchAsGooglebot } = require('./lib/fetch-utils.cjs');
const { sha1 } = require('./lib/html-utils.cjs');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--count') args.count = Number(argv[++i]);
    else if (a === '--delay-ms') args.delayMs = Number(argv[++i]);
    else args._.push(a);
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classify(results) {
  const statuses = new Set(results.map((r) => r.status));
  const hashes = new Set(results.map((r) => r.hash));
  const sizes = new Set(results.map((r) => r.bytes));
  if (statuses.size > 1) return 'INTERMITTENT_HTTP_FAILURE';
  if (hashes.size === 1) return 'STABLE';
  if (sizes.size > 1) return 'SIZE_VARIANCE';
  return 'HASH_VARIANCE';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = args._[0];
  if (!url) {
    console.error('Usage: node check-stability.cjs <url> [--count 10] [--delay-ms 500]');
    process.exit(1);
  }
  const count = args.count || 10;
  const delayMs = args.delayMs || 500;
  const results = [];
  for (let i = 0; i < count; i++) {
    const res = await fetchAsGooglebot(url);
    results.push({
      iteration: i + 1,
      status: res.httpStatus,
      bytes: res.decodedSizeBytes,
      hash: sha1(res.body),
    });
    if (i < count - 1) await sleep(delayMs);
  }
  console.log(JSON.stringify({
    url,
    requestCount: count,
    results,
    stabilityClassification: classify(results),
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
