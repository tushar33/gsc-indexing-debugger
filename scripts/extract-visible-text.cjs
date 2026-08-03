#!/usr/bin/env node
'use strict';
/**
 * Phase 6 — extract visible text robustly. Uses whole-string regex (not
 * line-based) so it works correctly even when the entire prerendered document
 * is a single line — the earlier failure mode this must avoid.
 *
 * Usage:
 *   node extract-visible-text.cjs --url <url>
 *   node extract-visible-text.cjs --file <path-to-html>
 */
const fs = require('fs');
const { fetchAsGooglebot } = require('./lib/fetch-utils.cjs');
const { extractVisibleText, normalizeForComparison, wordCount, sha1 } = require('./lib/html-utils.cjs');

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
    console.error('Usage: node extract-visible-text.cjs --url <url> | --file <path>');
    process.exit(1);
  }
  const html = args.file ? fs.readFileSync(args.file, 'utf8') : (await fetchAsGooglebot(args.url)).body;

  const visibleText = extractVisibleText(html);
  const normalized = normalizeForComparison(visibleText);
  console.log(JSON.stringify({
    source: args.url || args.file,
    visibleWordCount: wordCount(visibleText),
    normalizedTextHash: sha1(normalized),
    firstMeaningfulLines: visibleText.slice(0, 400),
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
