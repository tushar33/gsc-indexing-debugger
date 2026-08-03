#!/usr/bin/env node
'use strict';
/**
 * Phase 5 — extract SEO identity signals (title, canonical, meta, OG, JSON-LD,
 * robots, hreflang) from a live URL or a previously saved HTML file.
 *
 * Checks BOTH noindex sources: the meta robots tag (from the HTML) and the
 * X-Robots-Tag response header (from a CDN/edge function -- invisible to
 * anything that only parses HTML, and easy to miss since a clean meta tag
 * alone doesn't rule it out). --file mode has no associated response, so
 * xRobotsTag/noindex there only reflect the meta tag.
 *
 * Usage:
 *   node extract-signals.cjs --url <url>
 *   node extract-signals.cjs --file <path-to-html>
 */
const fs = require('fs');
const { fetchAsGooglebot } = require('./lib/fetch-utils.cjs');
const { extractSignals } = require('./lib/html-utils.cjs');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i];
    else if (a === '--file') args.file = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url && !args.file) {
    console.error('Usage: node extract-signals.cjs --url <url> | --file <path>');
    process.exit(1);
  }
  let html;
  let finalUrl = args.url || null;
  let httpStatus = null;
  let headers = {};
  if (args.file) {
    html = fs.readFileSync(args.file, 'utf8');
  } else {
    const res = await fetchAsGooglebot(args.url);
    html = res.body;
    finalUrl = res.finalUrl;
    httpStatus = res.httpStatus;
    headers = res.headers;
  }
  const signals = extractSignals(html, headers);
  console.log(JSON.stringify({
    sourceUrl: args.url || null,
    sourceFile: args.file || null,
    finalUrl,
    httpStatus,
    signals,
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
