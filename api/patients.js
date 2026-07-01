'use strict';
/**
 * /api/patients
 *
 * GET  ?q=search&limit=20&offset=0          → { patients, total }  Auth required
 * GET  ?id=UUID                              → { patient }          Auth required
 * POST { ...intake }                         → 201 { patientId }    Auth required
 * POST ?onboarding=true { ...intake }        → 201 { patient_id }   PUBLIC (rate-limited walk-in)
 * PATCH ?id=UUID { ...fields }               → 200 { success }      Auth required
 * DELETE ?id=UUID                            → 200 { success }      Auth required
 */
const { adminClient, cors, parseBody, PRACTICE_ID, requireStaff } = require('./_lib/supabase');
const { rateLimit } = require('./_lib/rateLimit');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  // ── Public walk-in onboarding (no auth) ──────────────────────
  if (req.method === 'POST' && req.query.onboarding === 'true') {
    if (rateLimit(req, res, 5, 60_000)) return;

    const body = await parseBody(req);
    const {
      first_name, last_name, phone,
      email = null, dob = null, gender = null, id_number = null,
      home_address = null, suburb = null, city = null, postal_code = null, province = null,
      medical_aid_name = null, medical_aid_number = null,
      medical_aid_plan = null, medical_aid_member_status = 'main_member',
      popia_consent = false, marketing_consent = false,
    } = body;

    if (!first_name?.trim()) return res.status(400).json({ error: 'First name is required' });
    if (!last_name?.trim())  return res.status(400).json({ error: 'Surname is required' });
    if (!id_number?.trim())  return res.status(400).json({ error: 'ID number is required' });
    if (!/^\d{13}$/.test(id_number.trim())) {
      return res.status(400).json({ error: 'SA ID number must be exactly 13 digits' });
    }
    if (!phone?.trim())      return res.status(400).json({ error: 'Phone number is required' });
    const phoneDigits = phone.trim().replace(/\D/g, '');
    if (phoneDigits.length < 7) {
      return res.status(400).json({ error: 'Please enter a valid phone number' });
    }
    if (!phoneDigits.startsWith('0')) {
      return res.status(400).json({ error: 'Phone number must start with 0' });
    }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    const dbPub = adminClient();
    const { data: existing } = await dbPub
      .from('patients').select('id, first_name, last_name')
      .eq('practice_id', PRACTICE_ID).eq('phone', phone.trim()).is('deleted_at', null)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({
        error: `We already have a record with this phone number (${existing.first_name} ${existing.last_name}). Please speak to the receptionist.`,
      });
    }

    const { data: pt, error } = await dbPub
      .from('patients')
      .insert({
        practice_id: PRACTICE_ID,
        first_name: first_name.trim(), last_name: last_name.trim(), phone: phone.trim(),
        email: email?.toLowerCase().trim() || null,
        date_of_birth: dob || null, gender: gender || null, id_number: id_number?.trim() || null,
        home_address: home_address?.trim() || null,
        suburb: suburb?.trim() || null, city: city?.trim() || null,
        postal_code: postal_code?.trim() || null, province: province || null,
        medical_aid_name: medical_aid_name?.trim() || null,
        medical_aid_number: medical_aid_number?.trim() || null,
        medical_aid_plan: medical_aid_plan?.trim() || null,
        medical_aid_member_status: medical_aid_name?.trim()
          ? (medical_aid_member_status || 'main_member') : null,
        referral_source: 'self_checkin', patient_type: 'new',
        popia_consent: Boolean(popia_consent), marketing_consent: Boolean(marketing_consent),
      })
      .select('id').single();

    if (error) {
      console.error('[patients onboarding POST]', error);
      return res.status(500).json({ error: 'Could not save your details. Please speak to the receptionist.' });
    }
    return res.status(201).json({ success: true, patient_id: pt.id });
  }

  // ── All other routes require verified staff membership ────────
  // Patient records are PII — a valid Supabase session alone is not enough.
  const user = await requireStaff(req, res);
  if (!user) return;

  const db = adminClient();

  // ── GET — search or single patient ────────────────────────────
  if (req.method === 'GET') {
    const { id, q, limit = '20', offset = '0', main_member_id } = req.query;

    // Dependants of a given main member
    if (main_member_id) {
      const { data, error } = await db
        .from('patients')
        .select('id, first_name, last_name, email, phone, relationship_to_member, dependant_code, medical_aid_name, medical_aid_number')
        .eq('practice_id', PRACTICE_ID)
        .eq('main_member_patient_id', main_member_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[patients GET dependants]', error);
        return res.status(500).json({ error: 'Could not retrieve dependants' });
      }
      return res.status(200).json({ patients: data || [] });
    }

    // Single patient with appointment history
    if (id) {
      const { data: patient, error: pErr } = await db
        .from('patients')
        .select('*')
        .eq('practice_id', PRACTICE_ID)
        .eq('id', id)
        .is('deleted_at', null)
        .single();

      if (pErr || !patient) return res.status(404).json({ error: 'Patient not found' });

      const { data: appointments } = await db
        .from('appointments')
        .select(`
          id, appointment_date, appointment_time, duration_minutes,
          status, patient_notes, internal_notes, clinical_notes, created_at,
          services ( name, category, price_from )
        `)
        .eq('patient_id', id)
        .is('deleted_at', null)
        .order('appointment_date', { ascending: false })
        .limit(50);

      return res.status(200).json({ patient: { ...patient, appointments: appointments || [] } });
    }

    // Search / list
    let query = db
      .from('patients')
      .select('id, first_name, last_name, email, phone, patient_type, date_of_birth, suburb, referral_source, medical_aid_name, medical_aid_number, created_at', { count: 'exact' })
      .eq('practice_id', PRACTICE_ID)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (q?.trim()) {
      // Enforce a reasonable search length to prevent abuse
      const searchInput = q.trim().slice(0, 100);
      // Each word in the query must appear in at least one of: first_name, last_name, email, phone.
      // This lets "Bev" find "Pat Bev", and "Bev Pat" find the same patient as "Pat Bev".
      // Phone is included so staff can look up a patient by their number.
      //
      // Security note: the `.or()` filter value is a PostgREST filter string that is
      // interpolated directly. Strip PostgREST control characters (`.`, `,`, `(`, `)`,
      // `"`) from each term to prevent filter-string injection before building `pat`.
      // The `%` wildcards are intentional and safe as ILIKE wildcards.
      for (const rawTerm of searchInput.split(/\s+/)) {
        // Strip PostgREST filter-string operators in addition to SQL metacharacters.
        // Allowed through: alphanumerics, spaces, @, +, -, _, digits.
        // Stripped: . , ( ) " \ ' | ! * : ; < > = ~ ^ ` { } [ ]
        const term = rawTerm.replace(/[^a-zA-Z0-9@+\-_ ]/g, '');
        if (!term) continue;
        const pat = `%${term}%`;
        query = query.or(`first_name.ilike.${pat},last_name.ilike.${pat},email.ilike.${pat},phone.ilike.${pat},medical_aid_number.ilike.${pat}`);
      }
    }

    const { data, error, count } = await query;
    if (error) {
      console.error('[patients GET]', error);
      return res.status(500).json({ error: 'Could not retrieve patients' });
    }

    return res.status(200).json({ patients: data || [], total: count || 0 });
  }

  // ── POST ?upload_doc=1 — upload a consent document ───────────
  // IMPORTANT: This check must come BEFORE the generic POST handler below,
  // otherwise the generic handler fires first and errors on missing first_name.
  if (req.method === 'POST' && req.query.upload_doc === '1') {
    const body = await parseBody(req);
    const { patient_id, file_name, file_type, file_base64, doc_type = 'Consent form' } = body;

    if (!patient_id) return res.status(400).json({ error: 'patient_id is required' });
    if (!file_name)  return res.status(400).json({ error: 'file_name is required' });
    if (!file_base64)return res.status(400).json({ error: 'file_base64 is required' });

    const ALLOWED_TYPES = ['application/pdf','image/jpeg','image/png','image/webp'];
    if (file_type && !ALLOWED_TYPES.includes(file_type)) {
      return res.status(400).json({ error: 'Only PDF, JPEG, PNG and WebP files are allowed' });
    }

    // Decode base64 → buffer
    const fileBuffer = Buffer.from(file_base64, 'base64');
    if (fileBuffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'File is too large (max 5 MB)' });
    }

    // Verify the patient exists in this practice BEFORE uploading, so a bad
    // patient_id can't leave an orphaned file in storage.
    const { data: patient } = await db
      .from('patients').select('consent_docs')
      .eq('id', patient_id).eq('practice_id', PRACTICE_ID).is('deleted_at', null)
      .maybeSingle();
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const { createClient: makeClient } = require('@supabase/supabase-js');
    const storageSb = makeClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    // Use cryptographically random bytes — Math.random() paths are guessable.
    const { randomBytes } = require('crypto');
    const docId   = `${Date.now()}-${randomBytes(8).toString('hex')}`;
    // Sanitise the extension — file_name is client input and must not be able
    // to inject path separators or other storage-key metacharacters.
    const rawExt  = String(file_name).split('.').pop() || '';
    const ext     = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'pdf';
    const path    = `${PRACTICE_ID}/${patient_id}/${docId}.${ext}`;

    // Upload to Supabase Storage (bucket created via migration 015)
    const { error: storageErr } = await storageSb.storage
      .from('consent-docs')
      .upload(path, fileBuffer, { contentType: file_type || 'application/pdf', upsert: false });

    if (storageErr) {
      console.error('[patients upload_doc] storage', storageErr);
      return res.status(500).json({ error: 'Could not upload file — has migration 015 been applied?' });
    }

    // Get a long-lived signed URL (10 years)
    const { data: signedData } = await storageSb.storage
      .from('consent-docs')
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);

    const newDoc = {
      id:           docId,
      name:         file_name,
      doc_type,
      storage_path: path,
      url:          signedData?.signedUrl || null,
      uploaded_at:  new Date().toISOString(),
    };

    // Append to patient's consent_docs array (patient row fetched above)
    const existing = Array.isArray(patient?.consent_docs) ? patient.consent_docs : [];
    const { error: updateErr } = await db.from('patients')
      .update({ consent_docs: [...existing, newDoc] })
      .eq('id', patient_id).eq('practice_id', PRACTICE_ID);

    if (updateErr) {
      console.error('[patients upload_doc] update', updateErr);
      return res.status(500).json({ error: 'File uploaded but could not save reference' });
    }

    return res.status(201).json({ success: true, doc: newDoc });
  }

  // ── POST — create patient (intake form) ───────────────────────
  if (req.method === 'POST') {
    const body = await parseBody(req);
    const {
      first_name, last_name, email, phone,
      date_of_birth, gender, id_number,
      home_address, suburb, city, postal_code, province,
      referral_source, referral_detail,
      has_medical_aid,
      medical_aid_name, medical_aid_number, medical_aid_plan,
      main_member = true, main_member_name,
      relationship_to_member, dependant_code, main_member_patient_id,
      allergies = [], medications = [], medical_conditions = [],
      previous_dentist, dental_anxiety,
      intake_notes,
      consent_signed = false, popia_consent = false, marketing_consent = false,
      patient_type = 'new',
    } = body;

    if (!first_name?.trim() || !last_name?.trim()) {
      return res.status(400).json({ error: 'first_name and last_name are required' });
    }

    // ID number is required and must be exactly 13 digits
    if (!id_number?.trim()) {
      return res.status(400).json({ error: 'ID number is required' });
    }
    if (!/^\d{13}$/.test(id_number.trim())) {
      return res.status(400).json({ error: 'SA ID number must be exactly 13 digits' });
    }

    // Email validation
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Phone must start with 0
    if (phone?.trim()) {
      const phoneDigits = phone.trim().replace(/\D/g, '');
      if (!phoneDigits.startsWith('0')) {
        return res.status(400).json({ error: 'Phone number must start with 0' });
      }
    }

    // Prevent duplicates — but dependants legitimately share the main member's
    // email, so only enforce uniqueness when the patient IS the main member.
    const isDependent = relationship_to_member && relationship_to_member !== 'main_member';
    if (email && !isDependent) {
      const { data: dup } = await db
        .from('patients')
        .select('id')
        .eq('practice_id', PRACTICE_ID)
        .eq('email', email.toLowerCase().trim())
        .is('deleted_at', null)
        .maybeSingle();

      if (dup) return res.status(409).json({ error: 'A patient with this email already exists', patientId: dup.id });
    }

    const { data: patient, error: insertErr } = await db
      .from('patients')
      .insert({
        practice_id:      PRACTICE_ID,
        first_name:       first_name.trim(),
        last_name:        last_name.trim(),
        email:            email?.toLowerCase().trim() || null,
        phone:            phone?.trim() || null,
        date_of_birth:    date_of_birth || null,
        gender:           gender || null,
        id_number:        id_number?.trim() || null,
        home_address:     home_address?.trim() || null,
        suburb:           suburb?.trim() || null,
        city:             city?.trim() || null,
        postal_code:      postal_code?.trim() || null,
        province:         province?.trim() || null,
        referral_source:  referral_source || null,
        referral_detail:  referral_detail?.trim() || null,
        has_medical_aid: Boolean(has_medical_aid) || !!(medical_aid_name?.trim()),
        medical_aid_name, medical_aid_number, medical_aid_plan,
        main_member, main_member_name:       main_member_name?.trim() || null,
        relationship_to_member:              relationship_to_member || null,
        dependant_code:                      dependant_code?.trim() || null,
        main_member_patient_id:              main_member_patient_id || null,
        allergies, medications, medical_conditions,
        previous_dentist: previous_dentist?.trim() || null,
        dental_anxiety:   dental_anxiety || null,
        intake_notes:     intake_notes?.trim() || null,
        consent_signed,
        consent_date:     consent_signed ? new Date().toISOString() : null,
        popia_consent,
        popia_consent_date: popia_consent ? new Date().toISOString() : null,
        marketing_consent,
        patient_type,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('[patients POST]', insertErr);
      return res.status(500).json({ error: 'Could not create patient' });
    }

    return res.status(201).json({ success: true, patientId: patient.id });
  }

  // ── PATCH — update patient ────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const body = await parseBody(req);

    // Allowlist — only permit known writable columns.
    // Stripping read-only fields is NOT enough; use an explicit allowlist so
    // adding new sensitive columns to the table doesn't automatically expose them.
    const ALLOWED_PATIENT_FIELDS = new Set([
      'first_name', 'last_name', 'email', 'phone',
      'date_of_birth', 'gender', 'id_number',
      'home_address', 'suburb', 'city', 'postal_code', 'province',
      'referral_source', 'referral_detail',
      'has_medical_aid', 'medical_aid_name', 'medical_aid_number', 'medical_aid_plan',
      'main_member', 'main_member_name', 'main_member_dob', 'main_member_id_number',
      'relationship_to_member', 'dependant_code', 'main_member_patient_id',
      'allergies', 'medications', 'medical_conditions',
      'previous_dentist', 'dental_anxiety',
      'intake_notes', 'patient_type',
      'consent_signed', 'popia_consent', 'marketing_consent',
    ]);

    const updates = {};
    for (const [key, value] of Object.entries(body)) {
      if (ALLOWED_PATIENT_FIELDS.has(key)) updates[key] = value;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // SA ID number format: exactly 13 digits (allow clearing with null/'')
    if (updates.id_number != null && updates.id_number !== '' && !/^\d{13}$/.test(String(updates.id_number).trim())) {
      return res.status(400).json({ error: 'SA ID number must be exactly 13 digits' });
    }

    // Convert empty strings → null — required for CHECK-constrained enums and
    // typed columns (DATE, UUID) which Postgres rejects if sent as ''.
    for (const f of [
      'gender', 'referral_source', 'dental_anxiety', 'relationship_to_member',
      'date_of_birth', 'main_member_dob', 'main_member_patient_id',
    ]) {
      if (updates[f] === '') updates[f] = null;
    }

    // Handle consent timestamps — set on grant, clear on revoke.
    if (updates.consent_signed === true) updates.consent_date = new Date().toISOString();
    if (updates.consent_signed === false) updates.consent_date = null;
    if (updates.popia_consent === true) updates.popia_consent_date = new Date().toISOString();
    if (updates.popia_consent === false) updates.popia_consent_date = null;

    const { error: updateErr } = await db
      .from('patients')
      .update(updates)
      .eq('id', id)
      .eq('practice_id', PRACTICE_ID)
      .is('deleted_at', null);

    if (updateErr) {
      console.error('[patients PATCH]', updateErr);
      return res.status(500).json({ error: 'Could not update patient' });
    }

    return res.status(200).json({ success: true });
  }

  // ── DELETE — soft-delete patient ──────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const { error } = await db
      .from('patients')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('practice_id', PRACTICE_ID)
      .is('deleted_at', null);

    if (error) {
      console.error('[patients DELETE]', error);
      return res.status(500).json({ error: 'Could not delete patient' });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
