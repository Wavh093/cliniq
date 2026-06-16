'use strict';
/**
 * /api/dental
 *
 * GET  ?patient_id=UUID                  → { records, notes }  full chart data
 * GET  ?action=scans&patient_id=UUID     → { scans }           with 1-hour signed URLs
 * POST body { patient_id, tooth_fdi, status }          → upsert tooth record
 * POST ?action=note body { patient_id, tooth_fdi, note, appointment_id? } → add note
 * POST ?action=scan body { patient_id, file_path, mime_type, filename, appointment_id?, tooth_fdis?, notes? }
 * DELETE ?action=note&id=UUID            → delete note
 * DELETE ?action=scan&id=UUID            → delete scan + storage file
 */
const { adminClient, cors, parseBody, PRACTICE_ID, requireAuth } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const db = adminClient();
  const { action, patient_id, id } = req.query;

  // ── GET ───────────────────────────────────────────────────────────────────
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

    // Dental chart: all records + all notes for the patient
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

  // ── POST ──────────────────────────────────────────────────────────────────
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
      if (!pid)           return res.status(400).json({ error: 'patient_id required' });
      if (!tooth_fdi)     return res.status(400).json({ error: 'tooth_fdi required' });
      if (!note?.trim())  return res.status(400).json({ error: 'note is required' });

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

    // Default POST: upsert tooth status
    const { patient_id: pid, tooth_fdi, status } = body;
    if (!pid)       return res.status(400).json({ error: 'patient_id required' });
    if (!tooth_fdi) return res.status(400).json({ error: 'tooth_fdi required' });

    const VALID_STATUSES = [
      'healthy','cavity','filled','crown',
      'extraction','implant','missing','bridge','needs_treatment',
    ];
    if (status && !VALID_STATUSES.includes(status)) {
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

  // ── DELETE ────────────────────────────────────────────────────────────────
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

      await db.storage.from('dental-scans').remove([scan.file_path]);

      const { error } = await db
        .from('dental_scans')
        .delete()
        .eq('id', id)
        .eq('practice_id', PRACTICE_ID);

      if (error) return res.status(500).json({ error: error.message });
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
};
