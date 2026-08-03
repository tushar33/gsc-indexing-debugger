'use strict';
/**
 * Dependency-light HTML parsing helpers for gsc-indexing-debugger scripts.
 *
 * Every extraction here operates on the FULL html string with a dotall-style
 * regex ([\s\S]), never line-by-line. A prerendered page can often be a
 * single line of HTML — a line-based approach (e.g. `sed` matching per line)
 * has previously produced zero visible words by matching and stripping the
 * entire document in one shot. Whole-string regex avoids that failure class.
 */
const crypto = require('crypto');

function sha1(text) {
  return crypto.createHash('sha1').update(text, 'utf8').digest('hex');
}

function stripBlocks(html, tagNames) {
  let out = html;
  for (const tag of tagNames) {
    const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    out = out.replace(re, ' ');
  }
  return out;
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function extractVisibleText(html) {
  const withoutNonContent = stripBlocks(html, [
    'script', 'style', 'noscript', 'head', 'nav', 'footer', 'header',
  ]);
  const withoutTags = withoutNonContent.replace(/<[^>]+>/g, ' ');
  const decoded = decodeEntities(withoutTags);
  return decoded.replace(/\s+/g, ' ').trim();
}

function normalizeForComparison(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(text) {
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function jaccardSimilarity(a, b) {
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const tok of setA) if (setB.has(tok)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

function extractFirst(html, regex) {
  const m = html.match(regex);
  return m ? decodeEntities(m[1].trim()) : null;
}

function extractMetaContent(html, attr, value) {
  const re = new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]*content=["']([^"']*)["']`, 'i');
  const reReversed = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${value}["']`, 'i');
  return extractFirst(html, re) || extractFirst(html, reReversed);
}

function extractAllCanonicals(html) {
  const re = /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/gi;
  const results = [];
  let m;
  while ((m = re.exec(html))) results.push(m[1]);
  return results;
}

function extractRobotsMeta(html) {
  return extractMetaContent(html, 'name', 'robots');
}

function extractHreflangs(html) {
  const re = /<link[^>]+rel=["']alternate["'][^>]+hreflang=["']([^"']*)["'][^>]+href=["']([^"']*)["']/gi;
  const results = [];
  let m;
  while ((m = re.exec(html))) results.push({ hreflang: m[1], href: m[2] });
  return results;
}

function extractJsonLd(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const blocks = [];
  let m;
  while ((m = re.exec(html))) {
    try {
      blocks.push(JSON.parse(m[1].trim()));
    } catch (e) {
      blocks.push({ _parseError: e.message, _raw: m[1].trim().slice(0, 500) });
    }
  }
  return blocks;
}

function extractSignals(html) {
  const canonicals = extractAllCanonicals(html);
  return {
    title: extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    canonical: canonicals[0] || null,
    canonicalCount: canonicals.length,
    allCanonicals: canonicals,
    metaDescription: extractMetaContent(html, 'name', 'description'),
    robots: extractRobotsMeta(html),
    ogTitle: extractMetaContent(html, 'property', 'og:title'),
    ogDescription: extractMetaContent(html, 'property', 'og:description'),
    ogImage: extractMetaContent(html, 'property', 'og:image'),
    ogUrl: extractMetaContent(html, 'property', 'og:url'),
    ogType: extractMetaContent(html, 'property', 'og:type'),
    twitterCard: extractMetaContent(html, 'name', 'twitter:card'),
    twitterTitle: extractMetaContent(html, 'name', 'twitter:title'),
    h1: extractFirst(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
    hreflangs: extractHreflangs(html),
    jsonLd: extractJsonLd(html),
  };
}

module.exports = {
  sha1,
  stripBlocks,
  decodeEntities,
  extractVisibleText,
  normalizeForComparison,
  wordCount,
  jaccardSimilarity,
  extractSignals,
  extractJsonLd,
};
