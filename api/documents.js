'use strict';
/**
 * /api/documents
 *
 * CRUD for patient_documents (sick notes, referral letters).
 *
 * GET  ?id=UUID              → single document (includes html_content)
 * GET  ?appointment_id=UUID  → list for appointment (metadata only)
 * GET  ?patient_id=UUID      → list for patient (metadata only)
 * POST { type, appointment_id?, patient_id?, title, html_content } → { id }
 *
 * All routes require a valid staff session (Bearer token).
 */
const { cors, parseBody, adminClient, PRACTICE_ID, requireAuth } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const db = adminClient();

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { id, appointment_id, patient_id } = req.query;

    // Single document (full, including html_content)
    if (id) {
      const { data, error } = await db
        .from('patient_documents')
        .select('id, type, title, html_content, appointment_id, patient_id, created_by, created_at')
        .eq('id', id)
        .eq('practice_id', PRACTICE_ID)
        .single();
      if (error || !data) return res.status(404).json({ error: 'Document not found' });
      return res.status(200).json({ document: data });
    }

    // List by appointment (metadata only — no html_content)
    if (appointment_id) {
      const { data, error } = await db
        .from('patient_documents')
        .select('id, type, title, appointment_id, patient_id, created_by, created_at')
        .eq('appointment_id', appointment_id)
        .eq('practice_id', PRACTICE_ID)
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ documents: data || [] });
    }

    // List by patient (metadata only — no html_content)
    if (patient_id) {
      const { data, error } = await db
        .from('patient_documents')
        .select('id, type, title, appointment_id, patient_id, created_by, created_at')
        .eq('patient_id', patient_id)
        .eq('practice_id', PRACTICE_ID)
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ documents: data || [] });
    }

    return res.status(400).json({ error: 'Query parameter required: id, appointment_id, or patient_id' });
  }

  // ── POST ─────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = await parseBody(req);
    const { type, appointment_id, patient_id, title, html_content } = body;

    if (!type || !['sick_note', 'referral_letter'].includes(type)) {
      return res.status(400).json({ error: 'type must be "sick_note" or "referral_letter"' });
    }
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }
    if (!html_content || typeof html_content !== 'string' || !html_content.trim()) {
      return res.status(400).json({ error: 'html_content is required' });
    }

    const insert = {
      practice_id:    PRACTICE_ID,
      type,
      title:          title.trim(),
      html_content:   html_content.trim(),
      created_by:     user.id,
      ...(appointment_id ? { appointment_id } : {}),
      ...(patient_id     ? { patient_id }     : {}),
    };

    const { data, error } = await db
      .from('patient_documents')
      .insert(insert)
      .select('id')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ id: data.id });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
