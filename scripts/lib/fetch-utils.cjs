'use strict';
/**
 * Shared Googlebot-UA fetch helper used by every gsc-indexing-debugger script.
 * Read-only GET requests only. No mutation, no auth, no cookies.
 */
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const { URL } = require('url');

const GOOGLEBOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

function decodeBody(buffer, encoding) {
  if (!encoding) return buffer;
  const enc = encoding.toLowerCase();
  try {
    if (enc === 'gzip' || enc === 'x-gzip') return zlib.gunzipSync(buffer);
    if (enc === 'br') return zlib.brotliDecompressSync(buffer);
    if (enc === 'deflate') return zlib.inflateSync(buffer);
  } catch (e) {
    // If decoding fails, fall through and return the raw buffer rather than throwing —
    // the caller can still inspect headers/status even if the body is undecodable.
  }
  return buffer;
}

function singleFetch(urlStr, { userAgent = GOOGLEBOT_UA, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch (e) {
      return reject(new Error(`Invalid URL: ${urlStr}`));
    }
    const lib = parsed.protocol === 'http:' ? http : https;
    const req = lib.request(
      parsed,
      {
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          const body = decodeBody(raw, res.headers['content-encoding']);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            rawByteLength: raw.length,
            body: body.toString('utf8'),
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms: ${urlStr}`));
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Fetch a URL as Googlebot, following redirects manually so the full chain is
 * recorded as evidence (required by Phase 3 of the diagnostic workflow).
 */
async function fetchAsGooglebot(startUrl, { maxRedirects = 10, userAgent, timeoutMs } = {}) {
  const redirectChain = [];
  let currentUrl = startUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await singleFetch(currentUrl, { userAgent, timeoutMs });
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.location) {
      redirectChain.push({ from: currentUrl, status: res.status, location: res.headers.location });
      currentUrl = new URL(res.headers.location, currentUrl).toString();
      continue;
    }
    return {
      requestedUrl: startUrl,
      redirectChain,
      finalUrl: currentUrl,
      httpStatus: res.status,
      headers: res.headers,
      // The `content-length` header (when present) and `rawByteLength` both
      // describe the WIRE size (post-gzip/br/deflate) — useful for CDN
      // debugging, but NOT comparable to "page size" evidence like the
      // documented 140647-byte figure, which is the size Google/humans
      // actually see. That figure is the DECODED HTML byte length below.
      transferSizeBytes: res.headers['content-length']
        ? Number(res.headers['content-length'])
        : res.rawByteLength,
      decodedSizeBytes: Buffer.byteLength(res.body, 'utf8'),
      body: res.body,
    };
  }
  throw new Error(`Too many redirects (> ${maxRedirects}) starting at ${startUrl}`);
}

module.exports = { fetchAsGooglebot, GOOGLEBOT_UA };
