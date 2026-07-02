'use strict';
/**
 * /api/revenue
 *
 * GET  ?month=YYYY-MM  (defaults to current month)
 *   → { appointments: [...], summary: { total_appointments, estimated_revenue,
 *         amount_collected, amount_outstanding, inventory_cost, net_revenue } }
 *
 * PATCH ?id=UUID  { payment_method?, amount_paid?, medical_aid_paid?, payment_notes? }
 *   → 200 { success: true }
 *
 * Inventory cost per appointment:
 *   - If appointment_actuals exist → sum(qty_used × cost_per_unit)
 *   - Otherwise → sum(expected_qty × cost_per_unit) from service_inventory_map  (labelled "est.")
 */
const { adminClient, cors, parseBody, PRACTICE_ID, requireStaff } = require('./_lib/supabase');

/** SA-style debtor age bucket for a charge dated `dateStr`, relative to today. */
function ageBucket(dateStr, today) {
  if (!dateStr) return 'current';
  const days = Math.floor((new Date(today) - new Date(dateStr)) / 86400000);
  if (days <= 30)  return 'current';
  if (days <= 60)  return 'd30';
  if (days <= 90)  return 'd60';
  if (days <= 120) return 'd90';
  return 'd120';
}

/**
 * Build the patient-receivable ledger: money the practice is directly owed by
 * patients, from completed appointments (service price − collected) and
 * treatment-plan sessions (charged − paid). Scheme-owed amounts have their own
 * aging in claims_summary and are intentionally NOT included here, to avoid
 * double-counting a visit that is also on a claim.
 *
 * @returns {{ items, byPatient: Map }}
 */
function buildLedger({ appts, sessions, today }) {
  const items = [];
  const round = n => Math.round(n * 100) / 100;

  for (const a of (appts || [])) {
    const billed = Number(a.services?.price_from || 0);
    if (billed <= 0) continue;
    const collected = (a.ma_amount_received != null || a.patient_portion != null)
      ? (Number(a.ma_amount_received || 0) + Number(a.patient_portion || 0))
      : Number(a.amount_paid || 0);
    const owed = round(billed - collected);
    if (owed <= 0.01) continue;
    items.push({
      type: 'appointment', ref_id: a.id, date: a.appointment_date,
      description: a.services?.name || 'Consultation',
      patient: a.patients, patient_id: a.patients?.id,
      billed: round(billed), paid: round(collected), owed,
      bucket: ageBucket(a.appointment_date, today),
    });
  }

  for (const s of (sessions || [])) {
    const billed = Number(s.amount_charged || 0);
    if (billed <= 0) continue;
    const paid = Number(s.amount_paid || 0);
    const owed = round(billed - paid);
    if (owed <= 0.01) continue;
    const plan = s.treatment_plans;
    const date = s.session_date || (s.paid_at ? String(s.paid_at).slice(0, 10) : null);
    items.push({
      type: 'plan_session', ref_id: s.id, date,
      description: `${plan?.title || 'Treatment plan'} — session ${s.session_number}`,
      patient: plan?.patients, patient_id: plan?.patients?.id,
      billed: round(billed), paid: round(paid), owed,
      bucket: ageBucket(date, today),
    });
  }

  const byPatient = new Map();
  for (const it of items) {
    if (!it.patient_id) continue;
    if (!byPatient.has(it.patient_id)) {
      byPatient.set(it.patient_id, {
        patient_id: it.patient_id, patient: it.patient,
        current: 0, d30: 0, d60: 0, d90: 0, d120: 0, total: 0,
        oldest: it.date, items: [],
      });
    }
    const acc = byPatient.get(it.patient_id);
    acc[it.bucket] = round(acc[it.bucket] + it.owed);
    acc.total = round(acc.total + it.owed);
    if (it.date && (!acc.oldest || it.date < acc.oldest)) acc.oldest = it.date;
    acc.items.push(it);
  }
  return { items, byPatient };
}

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  // Financial + patient data — verified staff membership required.
  const user = await requireStaff(req, res);
  if (!user) return;

  const db = adminClient();

  // ── GET ?resource=aging — practice-wide patient debtor age analysis ──
  // ── GET ?resource=statement&patient_id=UUID — single patient's account ──
  if (req.method === 'GET' && (req.query.resource === 'aging' || req.query.resource === 'statement')) {
    const today = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10); // SAST
    const patientId = req.query.patient_id;

    let apptQ = db.from('appointments')
      .select('id, appointment_date, amount_paid, ma_amount_received, patient_portion, patients(id, first_name, last_name, phone, email), services(name, price_from)')
      .eq('practice_id', PRACTICE_ID)
      .eq('status', 'completed')
      .is('deleted_at', null)
      .limit(10000);
    if (patientId) apptQ = apptQ.eq('patient_id', patientId);

    let sessQ = db.from('treatment_plan_sessions')
      .select('id, session_number, session_date, amount_charged, amount_paid, paid_at, treatment_plans!inner(id, title, practice_id, patient_id, patients(id, first_name, last_name, phone, email))')
      .eq('treatment_plans.practice_id', PRACTICE_ID)
      .gt('amount_charged', 0)
      .limit(10000);
    if (patientId) sessQ = sessQ.eq('treatment_plans.patient_id', patientId);

    const [{ data: appts, error: aErr }, { data: sessions, error: sErr }] = await Promise.all([apptQ, sessQ]);
    if (aErr || sErr) { console.error('[revenue ledger]', aErr || sErr); return res.status(500).json({ error: 'Could not build account data' }); }

    const { items, byPatient } = buildLedger({ appts, sessions, today });

    if (req.query.resource === 'statement') {
      if (!patientId) return res.status(400).json({ error: 'patient_id is required' });
      const acc = byPatient.get(patientId) || { patient_id: patientId, current: 0, d30: 0, d60: 0, d90: 0, d120: 0, total: 0, oldest: null, items: [] };
      acc.items.sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
      return res.status(200).json({ statement: acc, as_at: today });
    }

    // aging: sorted debtor list, biggest balance first
    const debtors = [...byPatient.values()]
      .map(({ items: _drop, ...rest }) => rest)
      .sort((a, b) => b.total - a.total);
    const totals = debtors.reduce((t, d) => {
      ['current', 'd30', 'd60', 'd90', 'd120', 'total'].forEach(k => { t[k] = Math.round((t[k] + d[k]) * 100) / 100; });
      return t;
    }, { current: 0, d30: 0, d60: 0, d90: 0, d120: 0, total: 0 });
    return res.status(200).json({ debtors, totals, count: debtors.length, as_at: today });
  }

  // ── GET ?resource=claims_summary — aging buckets for ClaimsPage ──
  if (req.method === 'GET' && req.query.resource === 'claims_summary') {
    const today = new Date().toISOString().slice(0, 10);
    const { data: claims, error } = await db
      .from('claims').select('id,status,date_of_service,submitted_at,total_charged,total_received')
      .eq('practice_id', PRACTICE_ID).is('deleted_at', null);
    if (error) return res.status(500).json({ error: 'Could not load claims summary' });

    const bucketAmounts = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    const bucketCounts  = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    let totalOutstanding = 0, totalSubmitted = 0, rejectedCount = 0, draftTotal = 0;

    for (const c of (claims || [])) {
      const outstanding = Math.max(0, (c.total_charged || 0) - (c.total_received || 0));
      if (c.status === 'rejected') { rejectedCount++; continue; }
      if (c.status === 'written_off' || c.status === 'paid') continue;
      if (c.status === 'draft') { draftTotal += outstanding; continue; }
      // submitted or partial
      totalOutstanding += outstanding;
      totalSubmitted   += outstanding;
      const refDate = c.submitted_at ? c.submitted_at.slice(0, 10) : c.date_of_service;
      const ageDays = Math.floor((new Date(today) - new Date(refDate)) / 86400000);
      const key = ageDays <= 30 ? 'd0_30' : ageDays <= 60 ? 'd31_60' : ageDays <= 90 ? 'd61_90' : 'd90plus';
      bucketCounts[key]++;
      bucketAmounts[key] += outstanding;
    }
    return res.status(200).json({ bucketAmounts, bucketCounts, totalOutstanding, totalSubmitted, rejectedCount, draftTotal });
  }

  // ── POST ?resource=remittance — record payment from scheme ────────
  if (req.method === 'POST' && req.query.resource === 'remittance') {
    const body = await parseBody(req);
    const { claim_id, received_at, amount_received, remittance_ref, notes, line_updates = [] } = body;
    if (!claim_id)        return res.status(400).json({ error: 'claim_id is required' });
    if (!received_at)     return res.status(400).json({ error: 'received_at is required' });
    if (amount_received == null) return res.status(400).json({ error: 'amount_received is required' });

    const { data: claim } = await db.from('claims').select('id,total_charged,total_received')
      .eq('id', claim_id).eq('practice_id', PRACTICE_ID).is('deleted_at', null).single();
    if (!claim) return res.status(404).json({ error: 'Claim not found' });

    const { error: rErr } = await db.from('claim_remittances').insert({
      practice_id:     PRACTICE_ID, claim_id,
      received_at,
      amount_received: Number(amount_received),
      remittance_ref:  remittance_ref?.trim() || null,
      notes:           notes?.trim()          || null,
    });
    if (rErr) { console.error('[remittance POST]', rErr); return res.status(500).json({ error: 'Could not record remittance' }); }

    // Apply line-level updates if provided
    for (const lu of line_updates) {
      if (!lu.id) continue;
      const lup = {};
      if (lu.status            != null) lup.status            = lu.status;
      if (lu.amount_approved   != null) lup.amount_approved   = Number(lu.amount_approved);
      if (lu.rejection_code)            lup.rejection_code    = lu.rejection_code;
      if (lu.rejection_reason)          lup.rejection_reason  = lu.rejection_reason;
      if (Object.keys(lup).length)  await db.from('claim_lines').update(lup).eq('id', lu.id);
    }

    // Recompute total_received from all remittances
    const { data: allR } = await db.from('claim_remittances').select('amount_received').eq('claim_id', claim_id);
    const newTotal = (allR || []).reduce((s, r) => s + Number(r.amount_received), 0);

    const eps = 0.01;
    const newStatus = newTotal >= claim.total_charged - eps ? 'paid'
                    : newTotal > 0                          ? 'partial'
                    :                                         'submitted';
    const claimUp = { total_received: Math.round(newTotal * 100) / 100, status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === 'paid') claimUp.settled_at = new Date().toISOString();
    await db.from('claims').update(claimUp).eq('id', claim_id);

    return res.status(200).json({ success: true, total_received: claimUp.total_received, status: newStatus });
  }

  // ── GET ────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { month } = req.query;

    // Resolve month window
    let startDate, endDate;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      startDate = `${y}-${String(m).padStart(2,'0')}-01`;
      endDate   = `${y}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    } else {
      const n = new Date();
      const y = n.getFullYear(), m = n.getMonth() + 1;
      const lastDay = new Date(y, m, 0).getDate();
      startDate = `${y}-${String(m).padStart(2,'0')}-01`;
      endDate   = `${y}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    }

    // Fetch completed appointments with service inventory map for cost estimates
    const { data: appts, error: apptErr } = await db
      .from('appointments')
      .select(`
        id, appointment_date, appointment_time, status,
        payment_method, amount_paid, medical_aid_paid, payment_notes, paid_at,
        medical_aid_claim_number, medical_aid_auth_number,
        ma_amount_charged, ma_amount_received, ma_status,
        patient_portion, patient_method, patient_paid_at,
        patients ( id, first_name, last_name, email, phone, medical_aid_name, has_medical_aid ),
        services (
          id, name, price_from,
          service_inventory_map (
            expected_qty,
            inventory_items ( id, cost_per_unit, unit )
          )
        )
      `)
      .eq('practice_id', PRACTICE_ID)
      .not('status', 'in', '("cancelled","no_show")')
      .is('deleted_at', null)
      .gte('appointment_date', startDate)
      .lte('appointment_date', endDate)
      .order('appointment_date', { ascending: false })
      .order('appointment_time', { ascending: false });

    if (apptErr) {
      console.error('[revenue GET]', apptErr);
      return res.status(500).json({ error: apptErr.message });
    }

    // Fetch actuals for all returned appointment IDs
    const apptIds = (appts || []).map(a => a.id);
    const actualsByAppt = {};

    if (apptIds.length > 0) {
      const { data: actuals } = await db
        .from('appointment_actuals')
        .select('appointment_id, qty_used, inventory_items ( cost_per_unit )')
        .in('appointment_id', apptIds);

      for (const act of (actuals || [])) {
        if (!actualsByAppt[act.appointment_id]) actualsByAppt[act.appointment_id] = [];
        actualsByAppt[act.appointment_id].push(act);
      }
    }

    // Enrich each appointment with computed inventory cost
    const appointments = (appts || []).map(a => {
      let inventoryCost = 0;
      let actualsRecorded = false;

      const actuals = actualsByAppt[a.id] || [];
      if (actuals.length > 0) {
        actualsRecorded = true;
        inventoryCost = actuals.reduce((sum, act) => {
          return sum + (Number(act.qty_used) * Number(act.inventory_items?.cost_per_unit || 0));
        }, 0);
      } else {
        const map = a.services?.service_inventory_map || [];
        inventoryCost = map.reduce((sum, m) => {
          return sum + (Number(m.expected_qty) * Number(m.inventory_items?.cost_per_unit || 0));
        }, 0);
      }

      return {
        id:               a.id,
        appointment_date: a.appointment_date,
        appointment_time: a.appointment_time,
        status:           a.status,
        patient:          a.patients,
        service_name:     a.services?.name,
        price_from:       a.services?.price_from,
        payment_method:   a.payment_method,
        amount_paid:      a.amount_paid,
        medical_aid_paid: a.medical_aid_paid,
        payment_notes:    a.payment_notes,
        paid_at:          a.paid_at,
        inventory_cost:              Math.round(inventoryCost * 100) / 100,
        actuals_recorded:            actualsRecorded,
        medical_aid_claim_number:    a.medical_aid_claim_number,
        medical_aid_auth_number:     a.medical_aid_auth_number,
        ma_amount_charged:           a.ma_amount_charged,
        ma_amount_received:          a.ma_amount_received,
        ma_status:                   a.ma_status,
        patient_portion:             a.patient_portion,
        patient_method:              a.patient_method,
        patient_paid_at:             a.patient_paid_at,
      };
    });

    // Aggregate summary
    const summary = appointments.reduce((s, a) => {
      s.total_appointments++;
      s.estimated_revenue += Number(a.price_from || 0);
      // Use split-stream totals if available, otherwise legacy amount_paid
      const collected = (a.ma_amount_received != null || a.patient_portion != null)
        ? (Number(a.ma_amount_received || 0) + Number(a.patient_portion || 0))
        : Number(a.amount_paid || 0);
      s.amount_collected  += collected;
      s.inventory_cost    += Number(a.inventory_cost || 0);
      return s;
    }, { total_appointments: 0, estimated_revenue: 0, amount_collected: 0, inventory_cost: 0 });

    summary.amount_outstanding = Math.round((summary.estimated_revenue - summary.amount_collected) * 100) / 100;
    summary.net_revenue        = Math.round((summary.amount_collected - summary.inventory_cost) * 100) / 100;
    summary.estimated_revenue  = Math.round(summary.estimated_revenue * 100) / 100;
    summary.amount_collected   = Math.round(summary.amount_collected * 100) / 100;
    summary.inventory_cost     = Math.round(summary.inventory_cost * 100) / 100;

    // ── Treatment plan session payments for the same month ────────
    // Filter by paid_at so sessions without an explicit session_date still appear
    const { data: rawSessions } = await db
      .from('treatment_plan_sessions')
      .select(`
        id, session_number, session_date, status,
        amount_charged, amount_paid, payment_method, payment_notes, paid_at,
        treatment_plans!inner ( id, title, practice_id,
          patients ( id, first_name, last_name )
        )
      `)
      .eq('treatment_plans.practice_id', PRACTICE_ID)
      .gt('amount_paid', 0)
      .not('paid_at', 'is', null)
      .gte('paid_at', startDate + 'T00:00:00.000Z')
      .lte('paid_at', endDate + 'T23:59:59.999Z')
      .order('paid_at', { ascending: false });

    const plan_sessions = (rawSessions || []).map(s => ({
      id:              s.id,
      session_number:  s.session_number,
      session_date:    s.session_date,
      status:          s.status,
      amount_charged:  s.amount_charged,
      amount_paid:     s.amount_paid,
      payment_method:  s.payment_method,
      payment_notes:   s.payment_notes,
      paid_at:         s.paid_at,
      treatment_plans: s.treatment_plans,
    }));

    // Add session payments into summary totals
    plan_sessions.forEach(s => {
      summary.amount_collected   += Number(s.amount_paid    || 0);
      summary.estimated_revenue  += Number(s.amount_charged || 0);
    });
    summary.estimated_revenue  = Math.round(summary.estimated_revenue  * 100) / 100;
    summary.amount_collected   = Math.round(summary.amount_collected   * 100) / 100;
    summary.amount_outstanding = Math.round((summary.estimated_revenue - summary.amount_collected) * 100) / 100;
    summary.net_revenue        = Math.round((summary.amount_collected  - summary.inventory_cost)   * 100) / 100;

    return res.status(200).json({ appointments, plan_sessions, summary });
  }

  // ── PATCH ──────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const body = await parseBody(req);
    const { payment_method, amount_paid, medical_aid_paid, payment_notes,
            medical_aid_claim_number, medical_aid_auth_number,
            ma_amount_charged, ma_amount_received, ma_status,
            patient_portion, patient_method, patient_paid_at } = body;

    const updates = {};

    if (payment_method           !== undefined) updates.payment_method           = payment_method || null;
    if (amount_paid              !== undefined) updates.amount_paid              = amount_paid != null && amount_paid !== '' ? Number(amount_paid) : null;
    if (medical_aid_paid         !== undefined) updates.medical_aid_paid         = Boolean(medical_aid_paid);
    if (payment_notes            !== undefined) updates.payment_notes            = payment_notes?.trim() || null;
    if (medical_aid_claim_number !== undefined) updates.medical_aid_claim_number = medical_aid_claim_number?.trim() || null;
    if (medical_aid_auth_number  !== undefined) updates.medical_aid_auth_number  = medical_aid_auth_number?.trim()  || null;

    // Split-stream MA fields
    if (ma_amount_charged  !== undefined) updates.ma_amount_charged  = ma_amount_charged  != null && ma_amount_charged  !== '' ? Number(ma_amount_charged)  : null;
    if (ma_amount_received !== undefined) updates.ma_amount_received = ma_amount_received != null && ma_amount_received !== '' ? Number(ma_amount_received) : null;
    if (ma_status !== undefined) {
      const VALID_MA_STATUS = ['pending', 'received', 'partial', 'rejected'];
      if (ma_status && !VALID_MA_STATUS.includes(ma_status)) return res.status(400).json({ error: `ma_status must be one of: ${VALID_MA_STATUS.join(', ')}` });
      updates.ma_status = ma_status || null;
    }
    // Split-stream patient fields
    if (patient_portion !== undefined) updates.patient_portion = patient_portion != null && patient_portion !== '' ? Number(patient_portion) : null;
    if (patient_method !== undefined) {
      const VALID_PT_METHODS = ['cash', 'card', 'eft', 'other'];
      if (patient_method && !VALID_PT_METHODS.includes(patient_method)) return res.status(400).json({ error: `patient_method must be one of: ${VALID_PT_METHODS.join(', ')}` });
      updates.patient_method = patient_method || null;
    }
    if (patient_paid_at !== undefined) updates.patient_paid_at = patient_paid_at || null;

    // Stamp paid_at when a legacy amount is first recorded
    if (updates.amount_paid != null) updates.paid_at = new Date().toISOString();
    // Auto-stamp patient_paid_at when patient_portion is recorded without an explicit timestamp
    if (updates.patient_portion != null && !updates.patient_paid_at) updates.patient_paid_at = new Date().toISOString();

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data: updated, error } = await db
      .from('appointments')
      .update(updates)
      .eq('id', id)
      .eq('practice_id', PRACTICE_ID)
      .is('deleted_at', null)
      .select('id');

    if (error) {
      console.error('[revenue PATCH]', error);
      return res.status(500).json({ error: 'Could not update payment' });
    }

    if (!updated || updated.length === 0) {
      console.warn('[revenue PATCH] 0 rows affected — id:', id, 'practice:', PRACTICE_ID);
      return res.status(404).json({ error: 'Appointment not found or already deleted' });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
