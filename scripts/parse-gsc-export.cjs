#!/usr/bin/env node
'use strict';
/**
 * Bulk Mode — parse a GSC CSV/export: validate input, normalize route
 * families, and cluster URLs so a small number of representatives can be
 * chosen for deep investigation instead of inspecting every URL individually.
 *
 * Column names in GSC exports vary by report type, so this parses whatever
 * headers are present rather than assuming a fixed schema. Clustering only —
 * this script never fetches URLs or requests indexing.
 *
 * Usage: node parse-gsc-export.cjs <path-to-csv> [--samples-per-cluster 3]
 */
const fs = require('fs');
const { loadConfig } = require('./lib/config.cjs');

// Parses the whole text in one pass (not line-by-line) so a quoted field
// containing an embedded newline stays part of its own record instead of
// being split into two rows.
function parseCsv(text) {
  const records = [];
  let record = [];
  let cur = '';
  let inQuotes = false;
  const pushCell = () => { record.push(cur.trim()); cur = ''; };
  const pushRecord = () => {
    pushCell();
    if (!(record.length === 1 && record[0] === '')) records.push(record);
    record = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',') pushCell();
    else if (ch === '\r') { /* no-op; \n ends the record */ }
    else if (ch === '\n') pushRecord();
    else cur += ch;
  }
  if (cur !== '' || record.length > 0) pushRecord();

  if (records.length === 0) return { headers: [], rows: [] };
  const headers = records[0].map((h) => h.toLowerCase());
  const rows = records.slice(1).map((cells) => {
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] !== undefined ? cells[i] : ''; });
    return row;
  });
  return { headers, rows };
}

function findUrlColumn(headers) {
  // Check for an exact `url` header before a broader substring match --
  // Google treats a page's own URL and its (possibly different) selected
  // canonical URL as distinct fields, and "Canonical URL" would otherwise
  // win if it happens to precede "URL" in the export's column order.
  return headers.find((h) => h === 'url') || headers.find((h) => h.includes('url')) || headers[0];
}

// A bare single-segment path is not reliably one specific family on sites
// where "prefixless" entity routes exist (docs can drift from what
// production actually serves — verify with check-sitemap.cjs rather than
// trusting a routing table). Grouping by the alias itself would explode a
// real export into one cluster per URL, defeating clustering entirely.
// Bucket all prefixless paths together instead; the `reason` column (joined
// into the cluster key below) is the more informative axis for sampling.
function routeFamily(urlStr, routeFamilies) {
  let pathname;
  try {
    pathname = new URL(urlStr).pathname;
  } catch (e) {
    return '(unparseable-url)';
  }
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return '(root)';
  if (segments.length === 1) return '(prefixless-entity)';
  return routeFamilies.includes(segments[0]) ? segments[0] : `(unrecognized-prefix:${segments[0]})`;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--samples-per-cluster') args.samplesPerCluster = Number(argv[++i]);
    else args._.push(a);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = args._[0];
  if (!file) {
    console.error('Usage: node parse-gsc-export.cjs <path-to-csv> [--samples-per-cluster 3]');
    process.exit(1);
  }
  const config = loadConfig();
  if (config.configError) {
    console.error(`Refusing to proceed with a malformed config file: ${config.configError}`);
    process.exit(1);
  }
  const text = fs.readFileSync(file, 'utf8');
  const { headers, rows } = parseCsv(text);
  const urlCol = findUrlColumn(headers);
  // Google treats indexing status and indexing reason as different fields --
  // prefer an explicit reason column so rows aren't grouped by status alone
  // when both are present in the export.
  const reasonCol = headers.find((h) => h.includes('reason'))
    || headers.find((h) => h.includes('issue'))
    || headers.find((h) => h.includes('status'));
  const samplesPerCluster = args.samplesPerCluster || 3;

  const invalid = rows.filter((r) => {
    try { new URL(r[urlCol]); return false; } catch (e) { return true; }
  });
  const valid = rows.filter((r) => !invalid.includes(r));

  const clusters = {};
  for (const row of valid) {
    const family = routeFamily(row[urlCol], config.routeFamilies);
    const reason = reasonCol ? (row[reasonCol] || '(unspecified)') : '(no reason/status column in this export)';
    const key = `${family} :: ${reason}`;
    if (!clusters[key]) clusters[key] = { family, reason, urls: [] };
    clusters[key].urls.push(row[urlCol]);
  }

  const clusterSummary = Object.values(clusters)
    .map((c) => ({
      family: c.family,
      reason: c.reason,
      count: c.urls.length,
      sampleUrls: c.urls.slice(0, samplesPerCluster),
      remainingCount: Math.max(0, c.urls.length - samplesPerCluster),
    }))
    .sort((a, b) => b.count - a.count);

  console.log(JSON.stringify({
    sourceFile: file,
    totalRows: rows.length,
    validRows: valid.length,
    invalidRows: invalid.length,
    invalidSample: invalid.slice(0, 5),
    detectedUrlColumn: urlCol,
    detectedReasonColumn: reasonCol || null,
    clusterCount: clusterSummary.length,
    clusters: clusterSummary,
  }, null, 2));
}

main();
