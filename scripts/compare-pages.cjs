#!/usr/bin/env node
'use strict';
/**
 * Phase 7 — compute deterministic comparison facts between an affected URL and
 * a Google-selected canonical (or any two URLs).
 *
 * This script produces FACTS only — it does not classify similarity.
 * IDENTICAL / NEAR_IDENTICAL / STRUCTURALLY_SIMILAR_CONTENT_DISTINCT /
 * CLEARLY_DISTINCT is a judgment call made against these facts using
 * references/classification-guide.md — never from byte size, shared template,
 * or shared OG image alone.
 *
 * Usage: node compare-pages.cjs <urlA> <urlB>
 */
const { fetchAsGooglebot } = require('./lib/fetch-utils.cjs');
const {
  extractSignals, extractVisibleText, normalizeForComparison, wordCount, jaccardSimilarity, sha1,
} = require('./lib/html-utils.cjs');

async function analyze(url) {
  const res = await fetchAsGooglebot(url);
  const signals = extractSignals(res.body);
  const visibleText = extractVisibleText(res.body);
  const normalized = normalizeForComparison(visibleText);
  return {
    requestedUrl: url,
    finalUrl: res.finalUrl,
    httpStatus: res.httpStatus,
    signals,
    visibleWordCount: wordCount(visibleText),
    normalizedTextHash: sha1(normalized),
    normalizedText: normalized,
  };
}

async function main() {
  const [urlA, urlB] = process.argv.slice(2);
  if (!urlA || !urlB) {
    console.error('Usage: node compare-pages.cjs <urlA> <urlB>');
    process.exit(1);
  }
  const [a, b] = await Promise.all([analyze(urlA), analyze(urlB)]);

  const comparisonFacts = {
    sameFinalUrl: a.finalUrl === b.finalUrl,
    httpStatusEqual: a.httpStatus === b.httpStatus,
    titleEqual: a.signals.title === b.signals.title,
    canonicalEqual: a.signals.canonical === b.signals.canonical,
    h1Equal: a.signals.h1 === b.signals.h1,
    ogImageEqual: a.signals.ogImage === b.signals.ogImage,
    wordCountDiff: Math.abs(a.visibleWordCount - b.visibleWordCount),
    normalizedTextHashEqual: a.normalizedTextHash === b.normalizedTextHash,
    normalizedTextJaccardSimilarity: jaccardSimilarity(a.normalizedText, b.normalizedText),
  };

  // Drop the large raw text payloads from the printed report — the hash + similarity score are sufficient evidence.
  delete a.normalizedText;
  delete b.normalizedText;

  console.log(JSON.stringify({ pageA: a, pageB: b, comparisonFacts }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
