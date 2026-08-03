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

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const splitLine = (line) => {
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  };
  const headers = splitLine(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map((l) => {
    const cells = splitLine(l);
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] !== undefined ? cells[i] : ''; });
    return row;
  });
  return { headers, rows };
}

function findUrlColumn(headers) {
  return headers.find((h) => h === 'url' || h.includes('url')) || headers[0];
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
  const text = fs.readFileSync(file, 'utf8');
  const { headers, rows } = parseCsv(text);
  const urlCol = findUrlColumn(headers);
  const reasonCol = headers.find((h) => h.includes('reason') || h.includes('issue') || h.includes('status'));
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
