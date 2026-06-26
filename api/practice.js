'use strict';
/**
 * /api/practice
 * GET  → { practice }   Auth required.
 * PATCH body {...}      → { practice }  Auth required.
 */
const { cors, parseBody, adminClient, PRACTICE_ID, requireAuth } = require('./_lib/supabase');

const PRACTICE_FIELDS = [
  'id', 'name', 'email', 'phone',
  'address_line1', 'address_line2', 'city', 'postal_code',
  'hpcsa_number', 'practice_number',
  'doctor_first_name', 'doctor_last_name', 'doctor_qualification', 'institution',
  'logo_data',
];

const UPDATABLE = [
  'name', 'email', 'phone',
  'address_line1', 'address_line2', 'city', 'postal_code',
  'hpcsa_number', 'practice_number',
  'doctor_first_name', 'doctor_last_name', 'doctor_qualification', 'institution',
  'logo_data',
];

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const db = adminClient();

  if (req.method === 'GET') {
    const { data, error } = await db
      .from('practices')
      .select(PRACTICE_FIELDS.join(', '))
      .eq('id', PRACTICE_ID)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ practice: data });
  }

  if (req.method === 'PATCH') {
    const body = await parseBody(req);
    const update = {};
    for (const k of UPDATABLE) {
      if (k in body) update[k] = body[k] ?? null;
    }
    if (!Object.keys(update).length) {
      return res.status(400).json({ error: 'Nothing to update' });
    }
    update.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('practices')
      .update(update)
      .eq('id', PRACTICE_ID)
      .select(PRACTICE_FIELDS.join(', '))
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ practice: data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
