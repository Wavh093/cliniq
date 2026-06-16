'use strict';
/**
 * /api/config
 *
 * GET → { supabaseUrl, supabaseAnon, practice? }
 *
 * Returns the public (non-secret) Supabase configuration needed by the
 * browser-side Supabase Auth client in admin.html. These values are safe
 * to expose — the anon key is designed to be public and RLS enforces access.
 * This endpoint keeps config out of the HTML source (no hardcoded values).
 *
 * When a valid Bearer token is present, also returns the practice row so
 * the client can display the practice name / contact details without a
 * separate API call.
 */
const { createClient } = require('@supabase/supabase-js');
const { cors, adminClient, PRACTICE_ID } = require('./_lib/supabase');
const { rateLimit } = require('./_lib/rateLimit');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  // Config endpoint is GET-only but must not be abused for enumeration/probing
  if (rateLimit(req, res, 30, 60_000)) return; // 30 req/min (generous for page loads)

  // Optional: if a valid auth token is present, also return the practice row.
  // We do NOT use requireAuth here because we want a non-blocking fallback —
  // the endpoint must always return at minimum { supabaseUrl, supabaseAnon }.
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token) {
    try {
      const anonClient = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { auth: { persistSession: false } }
      );
      const { data: { user } } = await anonClient.auth.getUser(token).catch(() => ({ data: { user: null } }));
      if (user) {
        const db = adminClient();
        const { data: practice } = await db
          .from('practices')
          .select('id, name, email, phone, address_line1, hpcsa_number')
          .eq('id', PRACTICE_ID)
          .single()
          .catch(() => ({ data: null }));
        return res.status(200).json({
          supabaseUrl:  process.env.SUPABASE_URL,
          supabaseAnon: process.env.SUPABASE_ANON_KEY,
          practice:     practice || null,
        });
      }
    } catch {
      // Fall through to unauthenticated response
    }
  }

  return res.status(200).json({
    supabaseUrl:  process.env.SUPABASE_URL,
    supabaseAnon: process.env.SUPABASE_ANON_KEY,
  });
};
