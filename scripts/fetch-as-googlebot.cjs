#!/usr/bin/env node
'use strict';
/**
 * Phase 3 — fetch a URL as Googlebot and record redirect chain, status, and headers.
 * Read-only GET. Usage:
 *   node fetch-as-googlebot.cjs <url> [--save-dir <dir>] [--max-redirects N]
 */
const fs = require('fs');
const path = require('path');
const { fetchAsGooglebot } = require('./lib/fetch-utils.cjs');
const { sha1 } = require('./lib/html-utils.cjs');

const HEADER_ALLOWLIST = [
  'content-type', 'content-length', 'server', 'date', 'age', 'cache-control',
  'etag', 'x-cache', 'via',
];

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--save-dir') args.saveDir = argv[++i];
    else if (a === '--max-redirects') args.maxRedirects = Number(argv[++i]);
    else args._.push(a);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = args._[0];
  if (!url) {
    console.error('Usage: node fetch-as-googlebot.cjs <url> [--save-dir <dir>] [--max-redirects N]');
    process.exit(1);
  }
  const result = await fetchAsGooglebot(url, { maxRedirects: args.maxRedirects || 10 });
  const contentHash = sha1(result.body);

  let savedPath = null;
  if (args.saveDir) {
    fs.mkdirSync(args.saveDir, { recursive: true });
    const safeName = url.replace(/[^a-z0-9]+/gi, '_').slice(0, 120);
    savedPath = path.join(args.saveDir, `${safeName}.html`);
    fs.writeFileSync(savedPath, result.body, 'utf8');
  }

  const relevantHeaders = {};
  for (const h of HEADER_ALLOWLIST) {
    if (result.headers[h] !== undefined) relevantHeaders[h] = result.headers[h];
  }
  for (const [k, v] of Object.entries(result.headers)) {
    if (/^x-(amz|cloudfront)/i.test(k)) relevantHeaders[k] = v;
  }

  console.log(JSON.stringify({
    requestedUrl: result.requestedUrl,
    redirectChain: result.redirectChain,
    finalUrl: result.finalUrl,
    httpStatus: result.httpStatus,
    headers: relevantHeaders,
    // decodedSizeBytes is the comparable "page size" figure (what Google/humans
    // actually see); transferSizeBytes is the wire size post-compression —
    // useful for CDN debugging only, do not use it for content comparisons.
    decodedSizeBytes: result.decodedSizeBytes,
    transferSizeBytes: result.transferSizeBytes,
    contentHash,
    savedHtmlPath: savedPath,
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
