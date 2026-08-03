#!/usr/bin/env node
'use strict';
/**
 * Phase 5 — extract SEO identity signals (title, canonical, meta, OG, JSON-LD,
 * robots, hreflang) from a live URL or a previously saved HTML file.
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
  if (args.file) {
    html = fs.readFileSync(args.file, 'utf8');
  } else {
    const res = await fetchAsGooglebot(args.url);
    html = res.body;
    finalUrl = res.finalUrl;
    httpStatus = res.httpStatus;
  }
  const signals = extractSignals(html);
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
