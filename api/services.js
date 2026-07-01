'use strict';
/**
 * /api/services
 *
 * GET  → { services: [...] }   PUBLIC (rate-limited) — active services only.
 *        The patient booking page uses this to show the live catalogue.
 * GET  ?all=true               → includes inactive. Staff only.
 * POST  { name, category, duration_minutes, price_from, price_to?, description? }
 *   → 201 { service }   Staff only.
 * PATCH ?id=UUID  { name?, category?, duration_minutes?, price_from?,
 *                   price_to?, description?, active? }
 *   → 200 { success: true }   Staff only.
 * DELETE ?id=UUID  → soft-delete (sets active = false)
 *   → 200 { success: true }   Staff only.
 */
const { adminClient, cors, parseBody, PRACTICE_ID, requireStaff } = require('./_lib/supabase');
const { rateLimit } = require('./_lib/rateLimit');

const VALID_CATEGORIES = [
  'General','Cosmetic','Orthodontics','Paediatric','Oral Surgery',
  'Periodontics','Endodontics','Implants','Prosthodontics','Other',
];

const SERVICE_SELECT = 'id, name, category, duration_minutes, price_from, price_to, description, active, created_at';

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const db = adminClient();

  // ── GET ────────────────────────────────────────────────────────
  // The active-services list is public information (it is displayed on the
  // patient booking page), so plain GET needs no auth — only a rate limit.
  // Including inactive services (?all=true) stays staff-only.
  if (req.method === 'GET') {
    const all = req.query.all === 'true';
    if (all) {
      const staffUser = await requireStaff(req, res);
      if (!staffUser) return;
    } else if (rateLimit(req, res, 30, 60_000)) {
      return;
    }

    let q = db
      .from('services')
      .select(SERVICE_SELECT)
      .eq('practice_id', PRACTICE_ID)
      .order('category')
      .order('name');

    if (!all) q = q.eq('active', true);

    const { data, error } = await q;
    if (error) {
      console.error('[services GET]', error);
      return res.status(500).json({ error: 'Could not retrieve services' });
    }
    return res.status(200).json({ services: data || [] });
  }

  // All mutations require verified staff membership
  const user = await requireStaff(req, res);
  if (!user) return;

  // ── POST — create service ──────────────────────────────────────
  if (req.method === 'POST') {
    const body = await parseBody(req);
    const { name, category, duration_minutes, price_from, price_to, description } = body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!category) {
      return res.status(400).json({ error: 'category is required' });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }
    if (!duration_minutes || isNaN(Number(duration_minutes))) {
      return res.status(400).json({ error: 'duration_minutes must be a number' });
    }
    if (price_from !== undefined && isNaN(Number(price_from))) {
      return res.status(400).json({ error: 'price_from must be a number' });
    }

    const { data: svc, error } = await db
      .from('services')
      .insert({
        practice_id:      PRACTICE_ID,
        name:             name.trim(),
        category,
        duration_minutes: Number(duration_minutes),
        price_from:       price_from != null ? Number(price_from) : null,
        price_to:         price_to   != null ? Number(price_to)   : null,
        description:      description?.trim() || null,
        active:           true,
      })
      .select(SERVICE_SELECT)
      .single();

    if (error) {
      console.error('[services POST]', error);
      return res.status(500).json({ error: 'Could not create service' });
    }
    return res.status(201).json({ service: svc });
  }

  // ── PATCH — update service ─────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const body = await parseBody(req);
    const { name, category, duration_minutes, price_from, price_to, description, active } = body;

    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }

    const updates = {};
    if (name             !== undefined) updates.name             = name.trim();
    if (category         !== undefined) updates.category         = category;
    if (duration_minutes !== undefined) updates.duration_minutes = Number(duration_minutes);
    // price_from/to can be explicitly set to null to clear a price
    if ('price_from' in body) updates.price_from = price_from !== null ? Number(price_from) : null;
    if ('price_to'   in body) updates.price_to   = price_to   !== null ? Number(price_to)   : null;
    if (description  !== undefined) updates.description      = description?.trim() || null;
    if (active       !== undefined) updates.active           = Boolean(active);

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { error } = await db
      .from('services')
      .update(updates)
      .eq('id', id)
      .eq('practice_id', PRACTICE_ID);

    if (error) {
      console.error('[services PATCH]', error);
      return res.status(500).json({ error: 'Could not update service' });
    }
    return res.status(200).json({ success: true });
  }

  // ── DELETE — deactivate service ────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const { error } = await db
      .from('services')
      .update({ active: false })
      .eq('id', id)
      .eq('practice_id', PRACTICE_ID);

    if (error) {
      console.error('[services DELETE]', error);
      return res.status(500).json({ error: 'Could not deactivate service' });
    }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
