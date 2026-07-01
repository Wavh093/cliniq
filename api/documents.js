'use strict';
/**
 * /api/documents
 *
 * ── Patient documents (sick notes, referral letters) ───────────────────────
 * GET  ?id=UUID                → single document (includes html_content)
 * GET  ?appointment_id=UUID   → list for appointment (metadata only)
 * GET  ?patient_id=UUID       → list for patient (metadata only)
 * POST { type, appointment_id?, patient_id?, title, html_content } → { id }
 *
 * ── Dental chart (resource=dental) ────────────────────────────────────────
 * GET  ?resource=dental&patient_id=UUID              → { records, notes }
 * GET  ?resource=dental&action=scans&patient_id=UUID → { scans } with signed URLs
 * POST ?resource=dental body { patient_id, tooth_fdi, status }  → upsert tooth
 * POST ?resource=dental&action=note  body { patient_id, tooth_fdi, note, appointment_id? }
 * POST ?resource=dental&action=scan  body { patient_id, file_path, mime_type, filename, … }
 * DELETE ?resource=dental&action=note&id=UUID → delete note
 * DELETE ?resource=dental&action=scan&id=UUID → delete scan + storage file
 *
 * All routes require a valid staff session (Bearer token).
 */
const { cors, parseBody, adminClient, PRACTICE_ID, requireStaff } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  // Clinical documents and dental charts are PII — staff only.
  const user = await requireStaff(req, res);
  if (!user) return;

  const db = adminClient();
  const { resource, action, patient_id, id } = req.query;

  // ── Dental chart routes ────────────────────────────────────────────────────
  if (resource === 'dental') {

    if (req.method === 'GET') {
      if (action === 'scans') {
        if (!patient_id) return res.status(400).json({ error: 'patient_id required' });

        const { data: scans, error } = await db
          .from('dental_scans')
          .select('id, appointment_id, tooth_fdis, file_path, mime_type, filename, notes, created_at')
          .eq('practice_id', PRACTICE_ID)
          .eq('patient_id', patient_id)
          .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });

        const scansWithUrls = await Promise.all(
          (scans || []).map(async (scan) => {
            const { data: urlData } = await db.storage
              .from('dental-scans')
              .createSignedUrl(scan.file_path, 3600);
            return { ...scan, signed_url: urlData?.signedUrl ?? null };
          }),
        );

        return res.status(200).json({ scans: scansWithUrls });
      }

      // Full dental chart: records + notes
      if (!patient_id) return res.status(400).json({ error: 'patient_id required' });

      const [recordsRes, notesRes] = await Promise.all([
        db
          .from('patient_tooth_records')
          .select('tooth_fdi, status, updated_at')
          .eq('practice_id', PRACTICE_ID)
          .eq('patient_id', patient_id),
        db
          .from('tooth_notes')
          .select('id, tooth_fdi, note, appointment_id, created_at, appointments(appointment_date, services(name))')
          .eq('practice_id', PRACTICE_ID)
          .eq('patient_id', patient_id)
          .order('created_at', { ascending: false }),
      ]);

      if (recordsRes.error) return res.status(500).json({ error: recordsRes.error.message });
      if (notesRes.error)   return res.status(500).json({ error: notesRes.error.message });

      return res.status(200).json({
        records: recordsRes.data ?? [],
        notes:   notesRes.data   ?? [],
      });
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);

      if (action === 'scan') {
        const { patient_id: pid, appointment_id, tooth_fdis = [], file_path, mime_type, filename, notes } = body;
        if (!pid)       return res.status(400).json({ error: 'patient_id required' });
        if (!file_path) return res.status(400).json({ error: 'file_path required' });
        if (!mime_type) return res.status(400).json({ error: 'mime_type required' });
        if (!filename)  return res.status(400).json({ error: 'filename required' });

        const VALID_MIMES = ['image/jpeg', 'image/png', 'application/pdf'];
        if (!VALID_MIMES.includes(mime_type)) {
          return res.status(400).json({ error: 'mime_type must be image/jpeg, image/png, or application/pdf' });
        }

        const { data, error } = await db
          .from('dental_scans')
          .insert({
            practice_id:    PRACTICE_ID,
            patient_id:     pid,
            appointment_id: appointment_id || null,
            tooth_fdis:     Array.isArray(tooth_fdis) ? tooth_fdis : [],
            file_path,
            mime_type,
            filename,
            notes:          notes?.trim() || null,
            created_by:     user.id,
          })
          .select('id, appointment_id, tooth_fdis, file_path, mime_type, filename, notes, created_at')
          .single();

        if (error) return res.status(500).json({ error: error.message });

        const { data: urlData } = await db.storage
          .from('dental-scans')
          .createSignedUrl(data.file_path, 3600);

        return res.status(201).json({ scan: { ...data, signed_url: urlData?.signedUrl ?? null } });
      }

      if (action === 'note') {
        const { patient_id: pid, tooth_fdi, note, appointment_id } = body;
        if (!pid)          return res.status(400).json({ error: 'patient_id required' });
        if (!tooth_fdi)    return res.status(400).json({ error: 'tooth_fdi required' });
        if (!note?.trim()) return res.status(400).json({ error: 'note is required' });

        const { data, error } = await db
          .from('tooth_notes')
          .insert({
            practice_id:    PRACTICE_ID,
            patient_id:     pid,
            tooth_fdi:      Number(tooth_fdi),
            note:           note.trim(),
            appointment_id: appointment_id || null,
            created_by:     user.id,
          })
          .select('id, tooth_fdi, note, appointment_id, created_at, appointments(appointment_date, services(name))')
          .single();

        if (error) return res.status(500).json({ error: error.message });
        return res.status(201).json({ note: data });
      }

      // Default: upsert tooth status
      const { patient_id: pid, tooth_fdi, status } = body;
      if (!pid)       return res.status(400).json({ error: 'patient_id required' });
      if (!tooth_fdi) return res.status(400).json({ error: 'tooth_fdi required' });

      const VALID_STATUSES = [
        'healthy','cavity','filled','crown',
        'extraction','implant','missing','bridge','needs_treatment',
      ];
      if (status !== undefined && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }

      const { data, error } = await db
        .from('patient_tooth_records')
        .upsert(
          {
            practice_id: PRACTICE_ID,
            patient_id:  pid,
            tooth_fdi:   Number(tooth_fdi),
            status:      status || 'healthy',
            updated_at:  new Date().toISOString(),
          },
          { onConflict: 'patient_id,tooth_fdi' },
        )
        .select('tooth_fdi, status, updated_at')
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ record: data });
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id required' });

      if (action === 'scan') {
        const { data: scan, error: fetchErr } = await db
          .from('dental_scans')
          .select('id, file_path')
          .eq('id', id)
          .eq('practice_id', PRACTICE_ID)
          .single();

        if (fetchErr || !scan) return res.status(404).json({ error: 'Scan not found' });

        // Delete DB row first — if this fails the file is preserved and recoverable.
        // A DB row pointing at a missing storage object is unrecoverable from the UI.
        const { error } = await db
          .from('dental_scans')
          .delete()
          .eq('id', id)
          .eq('practice_id', PRACTICE_ID);

        if (error) return res.status(500).json({ error: error.message });

        const { error: storageErr } = await db.storage
          .from('dental-scans')
          .remove([scan.file_path]);
        if (storageErr) {
          console.error('[dental scan DELETE] storage remove error (non-fatal):', storageErr.message);
        }

        return res.status(200).json({ success: true });
      }

      if (action === 'note') {
        const { error } = await db
          .from('tooth_notes')
          .delete()
          .eq('id', id)
          .eq('practice_id', PRACTICE_ID);

        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'action must be "note" or "scan"' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Dental surface records (resource=dental_surfaces) ─────────────────────
  if (resource === 'dental_surfaces') {
    if (req.method === 'GET') {
      if (!patient_id) return res.status(400).json({ error: 'patient_id required' });

      const { data, error } = await db
        .from('dental_surface_records')
        .select('tooth_fdi, surface, status, notes, updated_at')
        .eq('practice_id', PRACTICE_ID)
        .eq('patient_id', patient_id);

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ surfaces: data ?? [] });
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      const { patient_id: pid, tooth_fdi, surface, status, notes } = body;

      if (!pid) return res.status(400).json({ error: 'patient_id required' });

      const fdi = Number(tooth_fdi);
      if (!Number.isInteger(fdi) || fdi < 11 || fdi > 48) {
        return res.status(400).json({ error: 'tooth_fdi must be an integer between 11 and 48' });
      }

      const VALID_SURFACES = ['mesial', 'distal', 'occlusal', 'lingual', 'buccal'];
      if (!VALID_SURFACES.includes(surface)) {
        return res.status(400).json({ error: `surface must be one of: ${VALID_SURFACES.join(', ')}` });
      }

      const VALID_SURF_STATUSES = [
        'healthy', 'cavity', 'needs_treatment', 'filled', 'crown',
        'extraction', 'missing', 'implant', 'bridge',
      ];
      if (!VALID_SURF_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${VALID_SURF_STATUSES.join(', ')}` });
      }

      const { data, error } = await db
        .from('dental_surface_records')
        .upsert(
          {
            practice_id: PRACTICE_ID,
            patient_id:  pid,
            tooth_fdi:   fdi,
            surface,
            status,
            notes:       notes?.trim() || null,
            updated_at:  new Date().toISOString(),
            updated_by:  user.id,
          },
          { onConflict: 'practice_id,patient_id,tooth_fdi,surface' },
        )
        .select('tooth_fdi, surface, status, notes, updated_at')
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ surface: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Patient documents ──────────────────────────────────────────────────────

  if (req.method === 'GET') {
    const { id: docId, appointment_id, patient_id: pid } = req.query;

    if (docId) {
      const { data, error } = await db
        .from('patient_documents')
        .select('id, type, title, html_content, appointment_id, patient_id, created_by, created_at')
        .eq('id', docId)
        .eq('practice_id', PRACTICE_ID)
        .single();
      if (error || !data) return res.status(404).json({ error: 'Document not found' });
      return res.status(200).json({ document: data });
    }

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

    if (pid) {
      const { data, error } = await db
        .from('patient_documents')
        .select('id, type, title, appointment_id, patient_id, created_by, created_at')
        .eq('patient_id', pid)
        .eq('practice_id', PRACTICE_ID)
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ documents: data || [] });
    }

    return res.status(400).json({ error: 'Query parameter required: id, appointment_id, or patient_id' });
  }

  if (req.method === 'POST') {
    const body = await parseBody(req);
    const { type, appointment_id, patient_id: pid, title, html_content } = body;

    if (!type || !['sick_note', 'referral_letter'].includes(type)) {
      return res.status(400).json({ error: 'type must be "sick_note" or "referral_letter"' });
    }
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }
    if (!html_content || typeof html_content !== 'string' || !html_content.trim()) {
      return res.status(400).json({ error: 'html_content is required' });
    }

    const { data, error } = await db
      .from('patient_documents')
      .insert({
        practice_id:  PRACTICE_ID,
        type,
        title:        title.trim(),
        html_content: html_content.trim(),
        created_by:   user.id,
        ...(appointment_id ? { appointment_id } : {}),
        ...(pid            ? { patient_id: pid } : {}),
      })
      .select('id')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ id: data.id });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
