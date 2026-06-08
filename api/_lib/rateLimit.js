'use strict';
/**
 * Lightweight in-memory rate limiter for Vercel serverless functions.
 *
 * Because each Vercel invocation may use a different warm instance, this
 * provides per-instance protection — suitable for a small practice site.
 * It uses a sliding-window counter keyed on IP address.
 *
 * Usage:
 *   const { rateLimit } = require('./_lib/rateLimit');
 *
 *   // At the top of a handler, after cors():
 *   if (rateLimit(req, res)) return;   // 429 already sent
 */

// module-level Map persists across invocations on the same warm instance
const store = new Map(); // key → { count, windowStart }

const WINDOW_MS  = 60 * 1000; // 60 seconds
const MAX_HITS   = 10;         // max requests per IP per window

/**
 * Returns true (and sends 429) if the request should be blocked.
 * Returns false if the request is within limits.
 *
 * @param {object} req  - Vercel/Node IncomingMessage
 * @param {object} res  - Vercel/Node ServerResponse
 * @param {number} [maxHits]    - override default MAX_HITS
 * @param {number} [windowMs]   - override default WINDOW_MS
 */
function rateLimit(req, res, maxHits = MAX_HITS, windowMs = WINDOW_MS) {
  // Prefer the real client IP forwarded by Vercel's edge
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now - entry.windowStart >= windowMs) {
    // Start a fresh window
    store.set(ip, { count: 1, windowStart: now });
    // Prune stale entries periodically to avoid unbounded memory growth
    if (store.size > 5000) pruneStore(now, windowMs);
    return false;
  }

  entry.count++;
  if (entry.count > maxHits) {
    const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      error: 'Too many requests. Please wait a moment and try again.',
    });
    return true;
  }

  return false;
}

function pruneStore(now, windowMs) {
  for (const [key, entry] of store.entries()) {
    if (now - entry.windowStart >= windowMs) store.delete(key);
  }
}

module.exports = { rateLimit };
