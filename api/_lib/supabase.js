'use strict';
const { createClient } = require('@supabase/supabase-js');

const PRACTICE_ID = process.env.PRACTICE_ID || '00000000-0000-0000-0000-000000000001';

/**
 * Service-role client — bypasses RLS. Use only in API routes (server-side).
 * Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
function adminClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

/**
 * Allowed CORS origins. Requests from other origins still reach the API
 * but will not receive ACAO headers, so browsers will block them.
 * Add the production domain here; Vercel preview URLs are also allowed
 * via the pattern match below.
 */
const ALLOWED_ORIGINS = new Set([
  'https://ohdental.co.za',
  'https://www.ohdental.co.za',
]);

function isAllowedOrigin(origin) {
  if (!origin) return false; // server-to-server calls have no Origin header — handled below
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Allow Vercel preview deployments: *.vercel.app
  if (/^https:\/\/[a-z0-9-]+-[a-z0-9-]+\.vercel\.app$/.test(origin)) return true;
  return false;
}

/**
 * Standard CORS + method guard. Call at the top of every handler.
 * Returns true if the request was handled (OPTIONS preflight), false otherwise.
 *
 * Only sets ACAO for known origins — wildcard is intentionally removed.
 * Direct server-to-server calls (no Origin header) pass through unaffected.
 */
function cors(req, res) {
  const origin = req.headers.origin || '';
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin',  origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

/**
 * Parse JSON body from a Vercel serverless request.
 * Vercel already parses it in most runtimes but this is a safe fallback.
 */
async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

/**
 * Validate a staff JWT from the Authorization header.
 * Returns the Supabase user object on success, or responds 401 and returns null.
 *
 * Usage in a route:
 *   const user = await requireAuth(req, res);
 *   if (!user) return;  // response already sent
 */
async function requireAuth(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  // Use a temporary anon client to validate the JWT — no secrets exposed
  const anonClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
  const { data: { user }, error } = await anonClient.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    return null;
  }
  return user;
}

module.exports = { adminClient, cors, parseBody, PRACTICE_ID, requireAuth };
