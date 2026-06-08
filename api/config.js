'use strict';
/**
 * /api/config
 *
 * GET → { supabaseUrl, supabaseAnon }
 *
 * Returns the public (non-secret) Supabase configuration needed by the
 * browser-side Supabase Auth client in admin.html. These values are safe
 * to expose — the anon key is designed to be public and RLS enforces access.
 * This endpoint keeps config out of the HTML source (no hardcoded values).
 */
const { cors } = require('./_lib/supabase');
const { rateLimit } = require('./_lib/rateLimit');

module.exports = function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  // Config endpoint is GET-only but must not be abused for enumeration/probing
  if (rateLimit(req, res, 30, 60_000)) return; // 30 req/min (generous for page loads)

  return res.status(200).json({
    supabaseUrl:  process.env.SUPABASE_URL,
    supabaseAnon: process.env.SUPABASE_ANON_KEY,
  });
};
