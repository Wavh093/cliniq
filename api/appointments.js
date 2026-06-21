'use strict';
/**
 * /api/appointments
 *
 * Standard appointment CRUD:
 * GET  (no params)                  → today's + next 14 days (paginated)
 * GET  ?date=YYYY-MM-DD             → appointments for a specific date
 * GET  ?status=pending|confirmed|…  → filter by status
 * GET  ?patient_id=UUID             → all appointments for a patient
 * GET  ?month=YYYY-MM               → all appointments in that month
 * GET  ?needs_link=true             → unlinked returning-patient appointments
 * GET  ?page=1&limit=20             → pagination (default limit 20, max 100)
 *
 * PATCH ?id=UUID  { status?, internal_notes?, duration_minutes?,
 *                   patient_id?, needs_patient_link?,
 *                   appointment_date?, appointment_time?, service_id?,
 *                   branch_id? }
 *
 * POST  { patient_id, service_id, appointment_date, appointment_time,
 *         duration_minutes?, status?, internal_notes?, patient_notes?, branch_id? }
 *
 * ── Branches (requires migrations/017_branches.sql) ──
 * GET  ?resource=branches            → list all active branches
 * POST ?resource=branches            → { name, address?, phone? } create branch
 * PATCH ?resource=branches&id=UUID   → { name?, address?, phone?, active? }
 * DELETE ?resource=branches&id=UUID  → deactivate branch
 *
 * ── Treatment plans (requires migrations/018_treatment_plans.sql) ──
 * GET  ?resource=treatment_plans&patient_id=UUID  → plans for a patient
 * GET  ?resource=treatment_plans&id=UUID          → single plan + sessions
 * GET  ?resource=treatment_plans                  → all active plans (paginated)
 * POST ?resource=treatment_plans                  → { patient_id, title, total_sessions, description?, notes?, next_session_due? }
 * PATCH ?resource=treatment_plans&id=UUID         → update plan fields
 * DELETE ?resource=treatment_plans&id=UUID        → cancel plan
 *
 * GET  ?resource=plan_sessions&plan_id=UUID        → sessions for a plan
 * POST ?resource=plan_sessions                     → { plan_id, session_number, appointment_id?, session_date?, notes? }
 * PATCH ?resource=plan_sessions&id=UUID            → { status?, notes?, appointment_id?, session_date? }
 *
 * All routes require Authorization: Bearer <staff-jwt>.
 */
const { adminClient, cors, parseBody, PRACTICE_ID, requireAuth } = require('./_lib/supabase');

const VALID_STATUSES = ['pending','confirmed','completed','cancelled','no_show'];

// Valid status transitions — terminal states (completed, cancelled) are locked
const VALID_TRANSITIONS = {
  pending:   ['confirmed', 'completed', 'cancelled', 'no_show'],
  confirmed: ['pending',   'completed', 'cancelled', 'no_show'],
  no_show:   ['cancelled'],
  completed: [],   // terminal
  cancelled: [],   // terminal
};
const VALID_PLAN_STATUSES = ['active','paused','completed','cancelled'];
const VALID_SESSION_STATUSES = ['scheduled','completed','missed','rescheduled','cancelled'];

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const db = adminClient();

  // ══════════════════════════════════════════════════════════════
  //  BRANCHES  (?resource=branches)
  // ══════════════════════════════════════════════════════════════
  if (req.query.resource === 'branches') {
    if (req.method === 'GET') {
      const { data, error } = await db
        .from('branches')
        .select('id, name, address, phone, active')
        .eq('practice_id', PRACTICE_ID)
        .eq('active', true)
        .order('name');
      if (error) { console.error('[branches GET]', error); return res.status(500).json({ error: 'Could not load branches' }); }
      return res.status(200).json({ branches: data || [] });
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      const { name, address, phone } = body;
      if (!name?.trim()) return res.status(400).json({ error: 'Branch name is required' });
      const { data, error } = await db.from('branches')
        .insert({ practice_id: PRACTICE_ID, name: name.trim(), address: address?.trim() || null, phone: phone?.trim() || null })
        .select('id, name, address, phone, active').single();
      if (error) { console.error('[branches POST]', error); return res.status(500).json({ error: 'Could not create branch' }); }
      return res.status(201).json({ branch: data });
    }

    if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id is required' });
      const body = await parseBody(req);
      const updates = {};
      if (body.name    !== undefined) updates.name    = body.name.trim();
      if (body.address !== undefined) updates.address = body.address?.trim() || null;
      if (body.phone   !== undefined) updates.phone   = body.phone?.trim() || null;
      if (body.active  !== undefined) updates.active  = Boolean(body.active);
      if (!Object.keys(updates).length) return res.status(400).json({ error: 'No fields to update' });
      const { error } = await db.from('branches').update(updates).eq('id', id).eq('practice_id', PRACTICE_ID);
      if (error) { console.error('[branches PATCH]', error); return res.status(500).json({ error: 'Could not update branch' }); }
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id is required' });
      const { error } = await db.from('branches').update({ active: false }).eq('id', id).eq('practice_id', PRACTICE_ID);
      if (error) { console.error('[branches DELETE]', error); return res.status(500).json({ error: 'Could not deactivate branch' }); }
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ══════════════════════════════════════════════════════════════
  //  TREATMENT PLAN SESSIONS  (?resource=plan_sessions)
  // ══════════════════════════════════════════════════════════════
  if (req.query.resource === 'plan_sessions') {
    if (req.method === 'GET') {
      const { plan_id } = req.query;
      if (!plan_id) return res.status(400).json({ error: 'plan_id is required' });
      const { data, error } = await db
        .from('treatment_plan_sessions')
        .select('*, appointments(id, appointment_date, appointment_time, status, duration_minutes, clinical_notes, internal_notes, services(id, name, price_from))')
        .eq('plan_id', plan_id)
        .order('session_number');
      if (error) { console.error('[plan_sessions GET]', error); return res.status(500).json({ error: 'Could not load sessions' }); }
      return res.status(200).json({ sessions: data || [] });
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      const { plan_id, session_number, appointment_id, session_date, notes, service_id, appointment_time } = body;
      if (!plan_id)                             return res.status(400).json({ error: 'plan_id is required' });
      if (!session_number)                      return res.status(400).json({ error: 'session_number is required' });
      if (Number(session_number) < 1 || isNaN(Number(session_number))) return res.status(400).json({ error: 'session_number must be a positive integer' });
      if (session_date && !/^\d{4}-\d{2}-\d{2}$/.test(session_date)) return res.status(400).json({ error: 'session_date must be YYYY-MM-DD' });

      // Prevent duplicate session_number within the same plan
      const { data: existing } = await db.from('treatment_plan_sessions')
        .select('id').eq('plan_id', plan_id).eq('session_number', Number(session_number)).maybeSingle();
      if (existing) return res.status(409).json({ error: `Session ${session_number} already exists for this plan` });

      // Look up plan to get patient_id for auto-creating appointment
      const { data: plan } = await db.from('treatment_plans')
        .select('patient_id, practice_id').eq('id', plan_id).single();
      if (!plan) return res.status(404).json({ error: 'Treatment plan not found' });

      const { data, error } = await db.from('treatment_plan_sessions')
        .insert({
          plan_id, session_number: Number(session_number),
          appointment_id: appointment_id || null,
          session_date: session_date || null,
          notes: notes || null,
          service_id: service_id || null,
        })
        .select().single();
      if (error) { console.error('[plan_sessions POST]', error); return res.status(500).json({ error: 'Could not add session' }); }

      // Auto-create a linked appointment if session_date is provided and no appointment_id was given
      if (session_date && !appointment_id) {
        const { data: appt, error: apptErr } = await db.from('appointments')
          .insert({
            practice_id: PRACTICE_ID,
            patient_id: plan.patient_id,
            service_id: service_id || null,
            appointment_date: session_date,
            appointment_time: appointment_time || '09:00:00',
            duration_minutes: 30,
            status: 'pending',
            internal_notes: 'Auto-created from treatment plan — confirm time with patient',
            treatment_plan_session_id: data.id,
          })
          .select('id').single();
        if (!apptErr && appt) {
          await db.from('treatment_plan_sessions')
            .update({ appointment_id: appt.id })
            .eq('id', data.id);
          data.appointment_id = appt.id;
        }
      }

      // Re-fetch with nested joins so the response includes appointment data
      const { data: fullSession } = await db.from('treatment_plan_sessions')
        .select('*, appointments(id, appointment_date, appointment_time, status, duration_minutes, clinical_notes, services(id, name, price_from))')
        .eq('id', data.id)
        .single();
      return res.status(201).json({ session: fullSession || data });
    }

    if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id is required' });
      const body = await parseBody(req);
      const updates = {};
      if (body.status         !== undefined) {
        if (!VALID_SESSION_STATUSES.includes(body.status)) return res.status(400).json({ error: `status must be one of: ${VALID_SESSION_STATUSES.join(', ')}` });
        updates.status = body.status;
      }
      if (body.notes           !== undefined) updates.notes           = body.notes || null;
      if (body.appointment_id  !== undefined) updates.appointment_id  = body.appointment_id || null;
      if (body.session_date    !== undefined) updates.session_date    = body.session_date || null;
      if (body.service_id      !== undefined) updates.service_id      = body.service_id || null;
      // Payment fields (migration 019)
      if (body.amount_charged !== undefined) {
        const charged = body.amount_charged != null ? Number(body.amount_charged) : null;
        if (charged != null && (isNaN(charged) || charged < 0)) return res.status(400).json({ error: 'amount_charged must be a non-negative number' });
        updates.amount_charged = charged;
      }
      if (body.amount_paid !== undefined) {
        const paid = body.amount_paid != null ? Number(body.amount_paid) : 0;
        if (isNaN(paid) || paid < 0) return res.status(400).json({ error: 'amount_paid must be a non-negative number' });
        const charged = updates.amount_charged ?? (await (async () => {
          const { data } = await db.from('treatment_plan_sessions').select('amount_charged').eq('id', id).single();
          return data?.amount_charged ?? null;
        })());
        if (charged != null && paid > charged) return res.status(400).json({ error: 'amount_paid cannot exceed amount_charged' });
        updates.amount_paid = paid;
      }
      if (body.payment_method !== undefined) {
        const VALID_METHODS = ['cash','card','eft','medical_aid','other'];
        if (body.payment_method && !VALID_METHODS.includes(body.payment_method)) return res.status(400).json({ error: `payment_method must be one of: ${VALID_METHODS.join(', ')}` });
        updates.payment_method = body.payment_method || null;
      }
      if (body.payment_notes !== undefined) updates.payment_notes = body.payment_notes || null;
      if (body.paid_at       !== undefined) updates.paid_at       = body.paid_at       || null;
      if (!Object.keys(updates).length) return res.status(400).json({ error: 'No fields to update' });

      // Fetch current session state for lazy appointment creation and status sync
      const { data: currentSess } = await db.from('treatment_plan_sessions')
        .select('appointment_id, plan_id, service_id').eq('id', id).single();

      const { error } = await db.from('treatment_plan_sessions').update(updates).eq('id', id);
      if (error) { console.error('[plan_sessions PATCH]', error); return res.status(500).json({ error: 'Could not update session' }); }

      // Lazy appointment creation: date assigned to a session that has no appointment
      if (updates.session_date && currentSess && !currentSess.appointment_id && !updates.appointment_id) {
        // Re-check session hasn't been linked by a concurrent request
        const { data: freshSess } = await db.from('treatment_plan_sessions')
          .select('appointment_id').eq('id', id).single();
        if (freshSess?.appointment_id) {
          // Another request already created the appointment — skip
        } else {
          const { data: plan } = await db.from('treatment_plans')
            .select('patient_id').eq('id', currentSess.plan_id).single();
          if (plan) {
            const svcId = updates.service_id || currentSess.service_id || null;
            const { data: appt } = await db.from('appointments')
              .insert({
                practice_id: PRACTICE_ID,
                patient_id: plan.patient_id,
                service_id: svcId,
                appointment_date: updates.session_date,
                appointment_time: body.appointment_time || '09:00:00',
                duration_minutes: 30,
                status: 'pending',
                internal_notes: 'Auto-created from treatment plan — confirm time with patient',
                treatment_plan_session_id: id,
              })
              .select('id').single();
            if (appt) {
              await db.from('treatment_plan_sessions').update({ appointment_id: appt.id }).eq('id', id);
            }
          }
        }
      }

      // Sync session_date → appointment_date on existing linked appointments
      if (updates.session_date && currentSess?.appointment_id) {
        await db.from('appointments')
          .update({ appointment_date: updates.session_date })
          .eq('id', currentSess.appointment_id);
      }

      // Sync session status → appointment status
      if (updates.status && currentSess?.appointment_id) {
        const apptStatus = updates.status === 'completed' ? 'completed'
          : updates.status === 'missed' ? 'no_show'
          : null;
        if (apptStatus) {
          await db.from('appointments').update({ status: apptStatus })
            .eq('id', currentSess.appointment_id);
        }
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ══════════════════════════════════════════════════════════════
  //  TREATMENT PLANS  (?resource=treatment_plans)
  // ══════════════════════════════════════════════════════════════
  if (req.query.resource === 'treatment_plans') {
    if (req.method === 'GET') {
      const { id, patient_id } = req.query;
      const page  = Math.max(1, parseInt(req.query.page  || '1', 10));
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
      const from  = (page - 1) * limit;
      const to    = from + limit - 1;

      const PLAN_SELECT = `
        id, title, description, total_sessions, sessions_done, status,
        next_session_due, notify_patient, last_notified_at, notes, created_at, updated_at,
        patients ( id, first_name, last_name, phone, email )
      `;

      // Single plan with sessions
      if (id) {
        const { data: plan, error } = await db.from('treatment_plans')
          .select(PLAN_SELECT + ', treatment_plan_sessions(*, appointments(id, appointment_date, appointment_time, status, duration_minutes, clinical_notes, internal_notes, services(id, name, price_from)))')
          .eq('id', id).eq('practice_id', PRACTICE_ID).single();
        if (error || !plan) return res.status(404).json({ error: 'Treatment plan not found' });
        // Attach payment summary computed from embedded sessions
        const sess = plan.treatment_plan_sessions || [];
        const totalCharged = sess.reduce((s, x) => s + (parseFloat(x.amount_charged) || 0), 0);
        const totalPaid    = sess.reduce((s, x) => s + (parseFloat(x.amount_paid)    || 0), 0);
        plan.payment_summary = { total_charged: totalCharged, total_paid: totalPaid, outstanding: totalCharged - totalPaid };
        return res.status(200).json({ plan });
      }

      const { status: planStatus } = req.query;
      let q = db.from('treatment_plans').select(PLAN_SELECT, { count: 'exact' }).eq('practice_id', PRACTICE_ID);
      if (patient_id) { q = q.eq('patient_id', patient_id).limit(50); }
      else {
        if (planStatus && VALID_PLAN_STATUSES.includes(planStatus)) {
          q = q.eq('status', planStatus);
        } else {
          q = q.neq('status', 'cancelled');
        }
        q = q.order('created_at', { ascending: false }).range(from, to);
      }

      const { data, error, count } = await q;
      if (error) { console.error('[treatment_plans GET]', error); return res.status(500).json({ error: 'Could not load treatment plans' }); }
      return res.status(200).json({ plans: data || [], total: count || 0, page, pages: Math.ceil((count || 0) / limit) });
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      const { patient_id, title, total_sessions = 1, description, notes, next_session_due, notify_patient = false } = body;
      if (!patient_id) return res.status(400).json({ error: 'patient_id is required' });
      if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
      if (total_sessions < 1) return res.status(400).json({ error: 'total_sessions must be at least 1' });

      const { data: plan, error } = await db.from('treatment_plans')
        .insert({
          practice_id: PRACTICE_ID, patient_id, title: title.trim(),
          total_sessions: Number(total_sessions), description: description?.trim() || null,
          notes: notes?.trim() || null, next_session_due: next_session_due || null,
          notify_patient: Boolean(notify_patient),
        })
        .select('*, patients(id, first_name, last_name, phone, email)').single();

      if (error) { console.error('[treatment_plans POST]', error); return res.status(500).json({ error: 'Could not create treatment plan' }); }

      // Auto-create session 1 with linked appointment when a first-session date is provided
      if (next_session_due) {
        const { data: sess } = await db.from('treatment_plan_sessions')
          .insert({ plan_id: plan.id, session_number: 1, session_date: next_session_due })
          .select().single();
        if (sess) {
          const { data: appt } = await db.from('appointments')
            .insert({
              practice_id: PRACTICE_ID, patient_id,
              appointment_date: next_session_due, appointment_time: '09:00:00',
              duration_minutes: 30, status: 'pending',
              internal_notes: 'Auto-created from treatment plan — confirm time with patient',
              treatment_plan_session_id: sess.id,
            })
            .select('id').single();
          if (appt) {
            await db.from('treatment_plan_sessions').update({ appointment_id: appt.id }).eq('id', sess.id);
          }
        }
      }

      return res.status(201).json({ plan });
    }

    if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id is required' });
      const body = await parseBody(req);
      const updates = {};
      if (body.title            !== undefined) updates.title            = body.title?.trim();
      if (body.description      !== undefined) updates.description      = body.description?.trim() || null;
      if (body.notes            !== undefined) updates.notes            = body.notes?.trim() || null;
      if (body.total_sessions   !== undefined) updates.total_sessions   = Number(body.total_sessions);
      if (body.next_session_due !== undefined) updates.next_session_due = body.next_session_due || null;
      if (body.notify_patient   !== undefined) updates.notify_patient   = Boolean(body.notify_patient);
      if (body.status !== undefined) {
        if (!VALID_PLAN_STATUSES.includes(body.status)) return res.status(400).json({ error: `status must be one of: ${VALID_PLAN_STATUSES.join(', ')}` });
        updates.status = body.status;
      }
      if (body.last_notified_at !== undefined) updates.last_notified_at = body.last_notified_at;
      if (!Object.keys(updates).length) return res.status(400).json({ error: 'No fields to update' });
      const { error } = await db.from('treatment_plans').update(updates).eq('id', id).eq('practice_id', PRACTICE_ID);
      if (error) { console.error('[treatment_plans PATCH]', error); return res.status(500).json({ error: 'Could not update treatment plan' }); }
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id is required' });
      const { error } = await db.from('treatment_plans').update({ status: 'cancelled' }).eq('id', id).eq('practice_id', PRACTICE_ID);
      if (error) { console.error('[treatment_plans DELETE]', error); return res.status(500).json({ error: 'Could not cancel treatment plan' }); }

      // Cancel all non-completed sessions
      await db.from('treatment_plan_sessions')
        .update({ status: 'cancelled' })
        .eq('plan_id', id)
        .neq('status', 'completed');

      // Cancel all pending/confirmed appointments linked to this plan's sessions
      const { data: planSessions } = await db.from('treatment_plan_sessions')
        .select('appointment_id')
        .eq('plan_id', id)
        .not('appointment_id', 'is', null);
      if (planSessions?.length) {
        const apptIds = planSessions.map(s => s.appointment_id).filter(Boolean);
        if (apptIds.length) {
          await db.from('appointments')
            .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
            .in('id', apptIds)
            .in('status', ['pending', 'confirmed']);
        }
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ══════════════════════════════════════════════════════════════
  //  TARIFF CODE REFERENCE  (?resource=tariff_ref)
  // ══════════════════════════════════════════════════════════════
  if (req.query.resource === 'tariff_ref') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { q, category } = req.query;
    let query = db.from('dental_tariff_codes')
      .select('code, description, category, nrpl_fee')
      .eq('is_active', true)
      .order('code');
    if (q?.trim()) {
      query = query.or(`code.ilike.%${q.trim()}%,description.ilike.%${q.trim()}%`);
    }
    if (category?.trim()) query = query.eq('category', category.trim());
    query = query.limit(60);
    const { data, error } = await query;
    if (error) { console.error('[tariff_ref GET]', error); return res.status(500).json({ error: 'Could not load tariff codes' }); }
    return res.status(200).json({ codes: data || [] });
  }

  // ══════════════════════════════════════════════════════════════
  //  ICD-10 CODE REFERENCE  (?resource=icd10_ref)
  // ══════════════════════════════════════════════════════════════
  if (req.query.resource === 'icd10_ref') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { q, category } = req.query;
    let query = db.from('dental_icd10_codes')
      .select('code, description, category')
      .eq('is_active', true)
      .order('code');
    if (q?.trim()) {
      query = query.or(`code.ilike.%${q.trim()}%,description.ilike.%${q.trim()}%`);
    }
    if (category?.trim()) query = query.eq('category', category.trim());
    query = query.limit(60);
    const { data, error } = await query;
    if (error) { console.error('[icd10_ref GET]', error); return res.status(500).json({ error: 'Could not load ICD-10 codes' }); }
    return res.status(200).json({ codes: data || [] });
  }

  // ══════════════════════════════════════════════════════════════
  //  CLAIM DATA  (?resource=claim_data&id=UUID)
  //  Returns full appointment + patient + MA data for PDF generation
  // ══════════════════════════════════════════════════════════════
  if (req.query.resource === 'claim_data') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id is required' });
    const { data, error } = await db
      .from('appointments')
      .select(`
        id, appointment_date, appointment_time, duration_minutes, status,
        clinical_notes, icd10_codes, tariff_codes,
        medical_aid_claim_number, medical_aid_auth_number,
        ma_amount_charged, ma_amount_received, ma_status,
        patient_portion, patient_method,
        patients (
          id, first_name, last_name, email, phone,
          date_of_birth, id_number,
          has_medical_aid, medical_aid_name, medical_aid_number,
          medical_aid_plan, relationship_to_member, dependant_code,
          main_member_id_number
        ),
        services ( id, name, category, price_from ),
        branches ( id, name, address, phone )
      `)
      .eq('id', id)
      .eq('practice_id', PRACTICE_ID)
      .single();
    if (error || !data) { console.error('[claim_data GET]', error); return res.status(404).json({ error: 'Appointment not found' }); }
    return res.status(200).json({ appointment: data });
  }

  // ══════════════════════════════════════════════════════════════
  //  CLAIMS  (?resource=claims)
  //  GET  ?id=UUID          → single claim + lines + remittances
  //  GET  ?patient_id=UUID  → claims for a patient
  //  GET  ?status=submitted,partial  → filter by status
  //  POST                   → create claim + lines
  //  PATCH ?id=UUID         → update status / fields
  //  DELETE ?id=UUID        → soft delete
  // ══════════════════════════════════════════════════════════════
  if (req.query.resource === 'claims') {
    if (req.method === 'GET') {
      const { id: cid, patient_id: cpid, status: cstatus } = req.query;

      if (cid) {
        const { data: claim, error: cErr } = await db
          .from('claims')
          .select(`*, patients(id,first_name,last_name,email,phone,date_of_birth,id_number), appointments(id,appointment_date,appointment_time,services(name))`)
          .eq('id', cid).eq('practice_id', PRACTICE_ID).is('deleted_at', null).single();
        if (cErr || !claim) return res.status(404).json({ error: 'Claim not found' });
        const [{ data: lines }, { data: remits }] = await Promise.all([
          db.from('claim_lines').select('*').eq('claim_id', cid).order('sort_order').order('created_at'),
          db.from('claim_remittances').select('*').eq('claim_id', cid).order('received_at', { ascending: false }),
        ]);
        return res.status(200).json({ claim, lines: lines || [], remittances: remits || [] });
      }

      let q = db.from('claims')
        .select(`id,status,date_of_service,scheme_name,scheme_membership_no,plan_name,auth_number,claim_reference_number,total_charged,total_received,submitted_at,settled_at,notes,created_at,appointment_id,patients(id,first_name,last_name)`)
        .eq('practice_id', PRACTICE_ID).is('deleted_at', null)
        .order('date_of_service', { ascending: false }).limit(200);
      if (cpid)    q = q.eq('patient_id', cpid);
      if (cstatus) {
        const ss = cstatus.split(',').map(s => s.trim()).filter(Boolean);
        if (ss.length === 1) q = q.eq('status', ss[0]); else q = q.in('status', ss);
      }
      const { data, error } = await q;
      if (error) { console.error('[claims GET]', error); return res.status(500).json({ error: 'Could not load claims' }); }
      return res.status(200).json({ claims: data || [] });
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      const { patient_id, appointment_id, scheme_name, scheme_membership_no, dependant_code,
              plan_name, treating_provider, date_of_service, auth_number, lines = [], notes } = body;
      if (!patient_id)             return res.status(400).json({ error: 'patient_id is required' });
      if (!scheme_name?.trim())    return res.status(400).json({ error: 'scheme_name is required' });
      if (!scheme_membership_no?.trim()) return res.status(400).json({ error: 'scheme_membership_no is required' });
      if (!date_of_service)        return res.status(400).json({ error: 'date_of_service is required' });

      const total_charged = lines.reduce((s, l) => s + (parseFloat(l.fee_charged) || 0) * (parseInt(l.qty) || 1), 0);

      const { data: claim, error: cErr } = await db.from('claims').insert({
        practice_id: PRACTICE_ID, patient_id,
        appointment_id:      appointment_id || null,
        scheme_name:         scheme_name.trim(),
        scheme_membership_no: scheme_membership_no.trim(),
        dependant_code:      dependant_code?.trim() || null,
        plan_name:           plan_name?.trim() || null,
        treating_provider:   treating_provider?.trim() || null,
        date_of_service,
        auth_number:         auth_number?.trim() || null,
        total_charged:       Math.round(total_charged * 100) / 100,
        notes:               notes?.trim() || null,
      }).select('id').single();
      if (cErr) { console.error('[claims POST]', cErr); return res.status(500).json({ error: 'Could not create claim' }); }

      if (lines.length > 0) {
        const lineRows = lines.map((l, i) => ({
          claim_id: claim.id, code: l.code, description: l.description,
          tooth_number: l.tooth || l.tooth_number || null, surface: l.surface || null,
          qty: parseInt(l.qty) || 1, fee_charged: parseFloat(l.fee_charged) || 0, sort_order: i,
        }));
        await db.from('claim_lines').insert(lineRows);
      }
      return res.status(201).json({ claim_id: claim.id });
    }

    if (req.method === 'PATCH') {
      const { id: cid } = req.query;
      if (!cid) return res.status(400).json({ error: 'id is required' });
      const body = await parseBody(req);
      const VALID_CS = ['draft','submitted','partial','paid','rejected','written_off'];
      const up = {};
      if (body.status !== undefined) {
        if (!VALID_CS.includes(body.status)) return res.status(400).json({ error: 'Invalid status' });
        up.status = body.status;
        if (body.status === 'submitted') up.submitted_at = up.submitted_at || new Date().toISOString();
        if (['paid','partial'].includes(body.status)) up.settled_at = up.settled_at || new Date().toISOString();
      }
      ['claim_reference_number','auth_number','treating_provider','notes'].forEach(f => {
        if (body[f] !== undefined) up[f] = body[f]?.trim() || null;
      });
      if (body.submitted_at  !== undefined) up.submitted_at  = body.submitted_at  || null;
      if (body.total_received !== undefined) up.total_received = Number(body.total_received);
      up.updated_at = new Date().toISOString();
      const { error } = await db.from('claims').update(up).eq('id', cid).eq('practice_id', PRACTICE_ID).is('deleted_at', null);
      if (error) { console.error('[claims PATCH]', error); return res.status(500).json({ error: 'Could not update claim' }); }
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { id: cid } = req.query;
      if (!cid) return res.status(400).json({ error: 'id is required' });
      const { error } = await db.from('claims').update({ deleted_at: new Date().toISOString() }).eq('id', cid).eq('practice_id', PRACTICE_ID);
      if (error) { console.error('[claims DELETE]', error); return res.status(500).json({ error: 'Could not delete claim' }); }
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ══════════════════════════════════════════════════════════════
  //  CLAIM LINES  (?resource=claim_lines&id=UUID)
  //  PATCH to record remittance response per line
  // ══════════════════════════════════════════════════════════════
  if (req.query.resource === 'claim_lines') {
    if (req.method === 'PATCH') {
      const { id: lid } = req.query;
      if (!lid) return res.status(400).json({ error: 'id is required' });
      const body = await parseBody(req);
      const VALID_LS = ['pending','approved','partial','rejected'];
      const up = {};
      if (body.status !== undefined) {
        if (!VALID_LS.includes(body.status)) return res.status(400).json({ error: 'Invalid line status' });
        up.status = body.status;
      }
      if (body.amount_approved  !== undefined) up.amount_approved  = body.amount_approved  != null ? Number(body.amount_approved) : null;
      if (body.rejection_code   !== undefined) up.rejection_code   = body.rejection_code?.trim()   || null;
      if (body.rejection_reason !== undefined) up.rejection_reason = body.rejection_reason?.trim() || null;
      if (!Object.keys(up).length) return res.status(400).json({ error: 'No fields to update' });
      const { error } = await db.from('claim_lines').update(up).eq('id', lid);
      if (error) { console.error('[claim_lines PATCH]', error); return res.status(500).json({ error: 'Could not update line' }); }
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ══════════════════════════════════════════════════════════════
  //  PRE-AUTHORISATIONS  (?resource=pre_auths)
  // ══════════════════════════════════════════════════════════════
  if (req.query.resource === 'pre_auths') {
    if (req.method === 'GET') {
      const { patient_id: ppid, status: past } = req.query;
      let q = db.from('pre_auths')
        .select(`*, patients(id,first_name,last_name,medical_aid_name)`)
        .eq('practice_id', PRACTICE_ID)
        .order('requested_at', { ascending: false }).limit(200);
      if (ppid) q = q.eq('patient_id', ppid);
      if (past) q = q.eq('status', past);
      const { data, error } = await q;
      if (error) { console.error('[pre_auths GET]', error); return res.status(500).json({ error: 'Could not load pre-auths' }); }
      return res.status(200).json({ pre_auths: data || [] });
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      const { patient_id, scheme_name, membership_no, requested_codes = [], requested_amount, notes, requested_at } = body;
      if (!patient_id)          return res.status(400).json({ error: 'patient_id is required' });
      if (!scheme_name?.trim()) return res.status(400).json({ error: 'scheme_name is required' });
      if (!membership_no?.trim()) return res.status(400).json({ error: 'membership_no is required' });
      const { data, error } = await db.from('pre_auths').insert({
        practice_id: PRACTICE_ID, patient_id,
        scheme_name:      scheme_name.trim(),
        membership_no:    membership_no.trim(),
        requested_codes:  Array.isArray(requested_codes) ? requested_codes : [],
        requested_amount: requested_amount != null ? Number(requested_amount) : null,
        notes:            notes?.trim() || null,
        requested_at:     requested_at || new Date().toISOString().slice(0, 10),
      }).select('id').single();
      if (error) { console.error('[pre_auths POST]', error); return res.status(500).json({ error: 'Could not create pre-auth' }); }
      return res.status(201).json({ id: data.id });
    }

    if (req.method === 'PATCH') {
      const { id: paid } = req.query;
      if (!paid) return res.status(400).json({ error: 'id is required' });
      const body = await parseBody(req);
      const VALID_PAS = ['requested','granted','declined','expired'];
      const up = {};
      if (body.status !== undefined) {
        if (!VALID_PAS.includes(body.status)) return res.status(400).json({ error: 'Invalid status' });
        up.status = body.status;
      }
      if (body.auth_number        !== undefined) up.auth_number        = body.auth_number?.trim()        || null;
      if (body.authorised_amount  !== undefined) up.authorised_amount  = body.authorised_amount != null ? Number(body.authorised_amount) : null;
      if (body.valid_from         !== undefined) up.valid_from         = body.valid_from  || null;
      if (body.valid_until        !== undefined) up.valid_until        = body.valid_until || null;
      if (body.notes              !== undefined) up.notes              = body.notes?.trim() || null;
      up.updated_at = new Date().toISOString();
      const { error } = await db.from('pre_auths').update(up).eq('id', paid).eq('practice_id', PRACTICE_ID);
      if (error) { console.error('[pre_auths PATCH]', error); return res.status(500).json({ error: 'Could not update pre-auth' }); }
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── GET ────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { date, status, patient_id, needs_link, month } = req.query;

    // ── Single appointment by ID ───────────────────────────────
    if (req.query.id && !date && !patient_id && !needs_link && !month) {
      const SELECT_SINGLE = `
        id, appointment_date, appointment_time, duration_minutes, status,
        patient_notes, internal_notes, clinical_notes, icd10_codes, tariff_codes,
        branch_id, cancellation_reason, cancelled_at, created_at,
        treatment_plan_session_id,
        patients ( id, first_name, last_name, email, phone, date_of_birth, id_number, allergies, medical_conditions, medications ),
        services ( id, name, category, price_from ),
        branches ( id, name )
      `;
      const { data: singleAppt, error: sErr } = await db
        .from('appointments')
        .select(SELECT_SINGLE)
        .eq('id', req.query.id)
        .eq('practice_id', PRACTICE_ID)
        .is('deleted_at', null)
        .single();
      if (sErr || !singleAppt) return res.status(404).json({ error: 'Appointment not found' });

      // Attach treatment plan context if this appointment belongs to a plan session
      if (singleAppt.treatment_plan_session_id) {
        const { data: tpSess } = await db.from('treatment_plan_sessions')
          .select('id, session_number, plan_id, treatment_plans(id, title, status, total_sessions, sessions_done)')
          .eq('id', singleAppt.treatment_plan_session_id)
          .single();
        singleAppt.treatment_plan_session = tpSess || null;
      }

      return res.status(200).json({ appointment: singleAppt });
    }

    // Pagination
    const page  = Math.max(1, parseInt(req.query.page  || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    const SELECT = `
      id, appointment_date, appointment_time, duration_minutes, status,
      patient_notes, internal_notes, confirmation_sent, needs_patient_link, created_at,
      icd10_codes, tariff_codes, clinical_notes, branch_id,
      cancellation_reason, cancelled_at, treatment_plan_session_id,
      patients ( id, first_name, last_name, email, phone, date_of_birth, allergies, medical_conditions, medications ),
      services (
        id, name, category, price_from,
        service_inventory_map (
          expected_qty, notes,
          inventory_items ( id, name, unit, category )
        )
      ),
      branches ( id, name )
    `;

    // ?needs_link=true → unlinked returning-patient appointments (no pagination)
    if (needs_link === 'true') {
      const { data, error } = await db
        .from('appointments')
        .select(SELECT)
        .eq('practice_id', PRACTICE_ID)
        .eq('needs_patient_link', true)
        .is('deleted_at', null)
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true })
        .limit(200);
      if (error) {
        console.error('[appointments GET needs_link]', error);
        return res.status(500).json({ error: 'Could not retrieve appointments' });
      }
      return res.status(200).json({ appointments: data || [] });
    }

    // Default sort: upcoming first (asc), then past (desc) is complex — use
    // date asc so today's appointments appear first, future dates below.
    let q = db
      .from('appointments')
      .select(SELECT, { count: 'exact' })
      .eq('practice_id', PRACTICE_ID)
      .is('deleted_at', null)
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true });

    if (date) {
      q = q.eq('appointment_date', date);
    } else if (patient_id) {
      q = q.eq('patient_id', patient_id);
    } else if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split('-').map(Number);
      const pad    = n => String(n).padStart(2, '0');
      const start  = `${month}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const end    = `${month}-${pad(lastDay)}`;
      q = q.gte('appointment_date', start).lte('appointment_date', end);
    }
    // No else — default returns ALL appointments, paginated, newest first

    if (status && VALID_STATUSES.includes(status)) {
      q = q.eq('status', status);
    }

    // Apply pagination (skip for patient_id which is used internally by PatientDrawer)
    const usePagination = !patient_id && !date;
    if (usePagination) {
      q = q.range(from, to);
    } else {
      q = q.limit(200);
    }

    const { data, error, count } = await q;
    if (error) {
      console.error('[appointments GET]', error);
      return res.status(500).json({ error: 'Could not retrieve appointments' });
    }

    const resp = { appointments: data || [] };
    if (usePagination) {
      resp.total = count || 0;
      resp.page  = page;
      resp.limit = limit;
      resp.pages = Math.ceil((count || 0) / limit);
    }
    return res.status(200).json(resp);
  }

  // ── PATCH ──────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const body = await parseBody(req);
    const {
      status, internal_notes, duration_minutes,
      patient_id, needs_patient_link,
      appointment_date, appointment_time, service_id,
      icd10_codes, tariff_codes, clinical_notes,
      branch_id, cancellation_reason,
    } = body;

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    // ── State machine: enforce valid transitions ──────────────────
    if (status) {
      const { data: current } = await db
        .from('appointments').select('status')
        .eq('id', id).eq('practice_id', PRACTICE_ID).is('deleted_at', null).single();
      if (!current) return res.status(404).json({ error: 'Appointment not found' });
      const allowed = VALID_TRANSITIONS[current.status] ?? [];
      if (!allowed.includes(status)) {
        const isTerminal = allowed.length === 0;
        return res.status(422).json({
          error: isTerminal
            ? `A ${current.status} appointment cannot be changed.`
            : `Cannot change status from '${current.status}' to '${status}'. Allowed: ${allowed.join(', ') || 'none'}.`,
        });
      }
    }

    if (appointment_date && !/^\d{4}-\d{2}-\d{2}$/.test(appointment_date)) {
      return res.status(400).json({ error: 'appointment_date must be YYYY-MM-DD' });
    }

    if (appointment_time && !/^\d{2}:\d{2}(:\d{2})?$/.test(appointment_time)) {
      return res.status(400).json({ error: 'appointment_time must be HH:MM or HH:MM:SS' });
    }

    const updates = {};
    if (status              != null) {
      updates.status = status;
      if (status === 'cancelled') {
        updates.cancellation_reason = cancellation_reason?.trim() || null;
        updates.cancelled_at        = new Date().toISOString();
      }
    }
    if (cancellation_reason !== undefined && status !== 'cancelled') {
      // Allow updating reason on already-cancelled appointments
      updates.cancellation_reason = cancellation_reason?.trim() || null;
    }
    if (internal_notes      != null) updates.internal_notes      = internal_notes;
    if (duration_minutes    != null) updates.duration_minutes    = Number(duration_minutes);
    if (patient_id          != null && patient_id !== '') updates.patient_id = patient_id;
    if (needs_patient_link  != null) updates.needs_patient_link  = needs_patient_link;
    if (appointment_date    != null) updates.appointment_date    = appointment_date;
    if (service_id          != null && service_id !== '') updates.service_id = service_id;
    if (icd10_codes         != null) updates.icd10_codes         = Array.isArray(icd10_codes) ? icd10_codes : [];
    if (tariff_codes        != null) updates.tariff_codes        = Array.isArray(tariff_codes) ? tariff_codes : [];
    if (clinical_notes      != null) updates.clinical_notes      = clinical_notes;
    if (branch_id           != null) updates.branch_id           = branch_id || null;
    if (appointment_time    != null) {
      updates.appointment_time = String(appointment_time).length === 5
        ? appointment_time + ':00'
        : appointment_time;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // ── Time conflict check on reschedule ─────────────────────────
    // Only run when date or time is being changed
    if (updates.appointment_date || updates.appointment_time) {
      // Fetch the current appointment to fill in any unchanged date/time/duration
      const { data: current } = await db
        .from('appointments')
        .select('appointment_date, appointment_time, duration_minutes')
        .eq('id', id).eq('practice_id', PRACTICE_ID).is('deleted_at', null).single();

      const checkDate = updates.appointment_date || current?.appointment_date;
      const checkTime = updates.appointment_time || current?.appointment_time || '00:00:00';
      const checkDur  = updates.duration_minutes  || current?.duration_minutes || 30;

      const { data: existing } = await db
        .from('appointments')
        .select('appointment_time, duration_minutes')
        .eq('practice_id', PRACTICE_ID)
        .eq('appointment_date', checkDate)
        .neq('id', id)   // exclude the appointment being rescheduled
        .not('status', 'in', '("cancelled","no_show")')
        .is('deleted_at', null);

      if (existing?.length) {
        const newStart = checkTime.slice(0, 5);
        const [nh, nm] = newStart.split(':').map(Number);
        const newStartMin = nh * 60 + nm;
        const newEndMin   = newStartMin + Number(checkDur);

        for (const ex of existing) {
          const exTime = (ex.appointment_time || '').slice(0, 5);
          const [eh, em] = exTime.split(':').map(Number);
          const exStart  = eh * 60 + em;
          const exEnd    = exStart + (ex.duration_minutes || 30);
          if (newStartMin < exEnd && newEndMin > exStart) {
            return res.status(409).json({
              error: `Time conflict: another appointment is already booked at ${exTime} on this date.`,
            });
          }
        }
      }
    }

    const { error } = await db
      .from('appointments')
      .update(updates)
      .eq('id', id)
      .eq('practice_id', PRACTICE_ID)
      .is('deleted_at', null);

    if (error) {
      console.error('[appointments PATCH]', error);
      return res.status(500).json({ error: 'Could not update appointment' });
    }

    return res.status(200).json({ success: true });
  }

  // ── POST — admin creates an appointment ───────────────────────
  if (req.method === 'POST') {
    const body = await parseBody(req);
    const {
      patient_id,
      service_id,
      appointment_date,
      appointment_time,
      duration_minutes,
      status = 'confirmed',
      internal_notes,
      patient_notes,
      branch_id,
    } = body;

    const missing = ['patient_id','service_id','appointment_date','appointment_time']
      .filter(k => !body[k]);
    if (missing.length) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    let dur = duration_minutes ? Number(duration_minutes) : null;
    if (!dur) {
      const { data: svc } = await db
        .from('services')
        .select('duration_minutes')
        .eq('id', service_id)
        .single();
      dur = svc?.duration_minutes || 30;
    }

    const timeVal = String(appointment_time).length === 5
      ? appointment_time + ':00'
      : appointment_time;

    // ── Time conflict check ───────────────────────────────────────
    // Fetch all non-cancelled appointments on the same date to detect overlaps
    const { data: existing } = await db
      .from('appointments')
      .select('appointment_time, duration_minutes')
      .eq('practice_id', PRACTICE_ID)
      .eq('appointment_date', appointment_date)
      .not('status', 'in', '("cancelled","no_show")')
      .is('deleted_at', null);

    if (existing?.length) {
      const newStart = timeVal.slice(0, 5); // HH:MM
      const [nh, nm] = newStart.split(':').map(Number);
      const newStartMin = nh * 60 + nm;
      const newEndMin   = newStartMin + dur;

      for (const ex of existing) {
        const exTime  = (ex.appointment_time || '').slice(0, 5);
        const [eh, em] = exTime.split(':').map(Number);
        const exStart  = eh * 60 + em;
        const exEnd    = exStart + (ex.duration_minutes || 30);
        // Overlap: new starts before existing ends AND new ends after existing starts
        if (newStartMin < exEnd && newEndMin > exStart) {
          return res.status(409).json({
            error: `Time conflict: another appointment is already booked at ${exTime} on this date.`,
          });
        }
      }
    }

    const { data: appt, error } = await db
      .from('appointments')
      .insert({
        practice_id:        PRACTICE_ID,
        patient_id,
        service_id,
        appointment_date,
        appointment_time:   timeVal,
        duration_minutes:   dur,
        status,
        internal_notes:     internal_notes  || null,
        patient_notes:      patient_notes   || null,
        needs_patient_link: false,
        branch_id:          branch_id       || null,
      })
      .select(`
        id, appointment_date, appointment_time, duration_minutes, status,
        patient_notes, internal_notes, needs_patient_link,
        patients ( id, first_name, last_name, email, phone ),
        services (
          id, name, category, price_from,
          service_inventory_map (
            expected_qty,
            inventory_items ( id, name, unit )
          )
        )
      `)
      .single();

    if (error) {
      console.error('[appointments POST]', error);
      return res.status(500).json({ error: 'Could not create appointment' });
    }

    return res.status(201).json({ appointment: appt });
  }

  // ── DELETE — soft-delete ───────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const { error } = await db
      .from('appointments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('practice_id', PRACTICE_ID)
      .is('deleted_at', null);

    if (error) {
      console.error('[appointments DELETE]', error);
      return res.status(500).json({ error: 'Could not cancel appointment' });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
