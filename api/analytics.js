'use strict';
/**
 * /api/analytics
 *
 * GET (no params)
 *   → { monthly_bookings, revenue, demographics, inventory_variance, low_stock }
 *
 * GET ?view=monthly_bookings | revenue | demographics | inventory_variance | low_stock
 *   → { data: [...] }   (single view)
 *
 * GET ?view=monthly_bookings&months=6    (optional, default 12)
 * GET ?view=revenue&months=6
 *
 * Requires Authorization: Bearer <staff-jwt>
 */
const { adminClient, cors, PRACTICE_ID, requireAuth } = require('./_lib/supabase');

const VIEWS = {
  monthly_bookings:   'v_monthly_bookings',
  revenue:            'v_revenue_estimate',
  demographics:       'v_patient_demographics',
  inventory_variance: 'v_inventory_variance',
  low_stock:          'v_low_stock',
};

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requireAuth(req, res);
  if (!user) return;

  const db     = adminClient();
  const { view, resource } = req.query;

  // ── Audit log ──────────────────────────────────────────────────
  if (resource === 'audit_log') {
    const VALID_HOURS = { '24': 24, '720': 720, '2160': 2160 };
    const hours = VALID_HOURS[req.query.hours] || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data, error } = await db
      .from('audit_log')
      .select('id, table_name, record_id, action, old_data, new_data, changed_at')
      .eq('practice_id', PRACTICE_ID)
      .gte('changed_at', since)
      .order('changed_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('[audit_log GET]', error);
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ logs: data || [] });
  }

  // ── CSV export ─────────────────────────────────────────────────
  if (resource === 'export') {
    const type = req.query.type; // 'patients' | 'appointments'

    if (type === 'patients') {
      const { data, error } = await db
        .from('patients')
        .select('id, first_name, last_name, email, phone, date_of_birth, gender, id_number, home_address, suburb, city, postal_code, province, has_medical_aid, medical_aid_name, medical_aid_number, medical_aid_plan, relationship_to_member, dependant_code, referral_source, patient_type, created_at')
        .eq('practice_id', PRACTICE_ID)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10000);

      if (error) { console.error('[export patients]', error); return res.status(500).json({ error: 'Export failed' }); }
      return res.status(200).json({ rows: data || [] });
    }

    if (type === 'appointments') {
      const { data, error } = await db
        .from('appointments')
        .select(`
          id, appointment_date, appointment_time, duration_minutes, status,
          cancellation_reason, clinical_notes,
          amount_paid, payment_method, ma_amount_charged, ma_amount_received, ma_status, patient_portion,
          created_at,
          patients ( first_name, last_name, email, phone, id_number ),
          services ( name, category )
        `)
        .eq('practice_id', PRACTICE_ID)
        .is('deleted_at', null)
        .order('appointment_date', { ascending: false })
        .limit(10000);

      if (error) { console.error('[export appointments]', error); return res.status(500).json({ error: 'Export failed' }); }

      // Flatten nested joins for CSV
      const rows = (data || []).map(a => ({
        id:                  a.id,
        date:                a.appointment_date,
        time:                a.appointment_time?.slice(0,5) || '',
        duration_min:        a.duration_minutes,
        status:              a.status,
        cancellation_reason: a.cancellation_reason || '',
        service:             a.services?.name || '',
        service_category:    a.services?.category || '',
        patient_name:        `${a.patients?.first_name || ''} ${a.patients?.last_name || ''}`.trim(),
        patient_email:       a.patients?.email || '',
        patient_phone:       a.patients?.phone || '',
        patient_id_number:   a.patients?.id_number || '',
        amount_paid:         a.amount_paid ?? '',
        payment_method:      a.payment_method || '',
        ma_amount_charged:   a.ma_amount_charged ?? '',
        ma_amount_received:  a.ma_amount_received ?? '',
        ma_status:           a.ma_status || '',
        patient_portion:     a.patient_portion ?? '',
        clinical_notes:      a.clinical_notes || '',
        created_at:          a.created_at,
      }));

      return res.status(200).json({ rows });
    }

    return res.status(400).json({ error: 'type must be patients or appointments' });
  }

  // ── Single view ────────────────────────────────────────────────
  if (view) {
    const viewName = VIEWS[view];
    if (!viewName) {
      return res.status(400).json({ error: `Unknown view. Options: ${Object.keys(VIEWS).join(', ')}` });
    }

    let q = db.from(viewName).select('*').eq('practice_id', PRACTICE_ID).limit(120);
    if (view === 'monthly_bookings' || view === 'revenue') {
      q = q.order('month', { ascending: false });
    }
    const { data, error } = await q;

    if (error) {
      console.error(`[analytics GET] ${viewName}`, error);
      return res.status(500).json({ error: 'Could not retrieve analytics data' });
    }

    return res.status(200).json({ data: data || [] });
  }

  // ── All views at once ──────────────────────────────────────────
  const [monthly, revenue, demographics, variance, lowStock, collectedQ] = await Promise.all([
    db.from('v_monthly_bookings')
      .select('month, total_bookings, completed, cancelled, no_show, unique_patients')
      .eq('practice_id', PRACTICE_ID)
      .order('month', { ascending: false })
      .limit(24),

    db.from('v_revenue_estimate')
      .select('month, total_price_from, avg_price_from, bookings_with_price')
      .eq('practice_id', PRACTICE_ID)
      .order('month', { ascending: false })
      .limit(24),

    db.from('v_patient_demographics')
      .select('*')
      .eq('practice_id', PRACTICE_ID)
      .limit(200),

    db.from('v_inventory_variance')
      .select('item_name, service_name, avg_actual_qty, avg_expected_qty, avg_variance, data_points')
      .eq('practice_id', PRACTICE_ID)
      .order('avg_variance', { ascending: true })
      .limit(60),

    db.from('v_low_stock')
      .select('id, name, category, unit, current_qty, reorder_threshold, reorder_qty, supplier')
      .eq('practice_id', PRACTICE_ID),

    db.from('appointments')
      .select('appointment_date, amount_paid, payment_method')
      .eq('practice_id', PRACTICE_ID)
      .eq('status', 'completed')
      .not('amount_paid', 'is', null)
      .is('deleted_at', null)
      .limit(2000),
  ]);

  const err = monthly.error || revenue.error || demographics.error || variance.error || lowStock.error;
  if (err) {
    console.error('[analytics GET] all-views', err);
    return res.status(500).json({ error: 'Could not retrieve analytics data' });
  }

  // Aggregate collected revenue by month
  const monthMap = {};
  for (const appt of (collectedQ.data || [])) {
    const m = appt.appointment_date?.slice(0, 7);
    if (!m) continue;
    if (!monthMap[m]) monthMap[m] = { month: m, total_collected: 0, cash: 0, card: 0, medical_aid: 0, count: 0 };
    monthMap[m].total_collected += Number(appt.amount_paid);
    monthMap[m].count++;
    if (appt.payment_method) monthMap[m][appt.payment_method] = (monthMap[m][appt.payment_method] || 0) + Number(appt.amount_paid);
  }
  const revenueCollected = Object.values(monthMap).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 24);

  // All-time payment method breakdown (appointment counts)
  const paymentMethods = { cash: 0, card: 0, medical_aid: 0 };
  for (const appt of (collectedQ.data || [])) {
    if (appt.payment_method) paymentMethods[appt.payment_method] = (paymentMethods[appt.payment_method] || 0) + 1;
  }

  return res.status(200).json({
    monthly_bookings:   monthly.data    || [],
    revenue:            revenue.data    || [],
    revenue_collected:  revenueCollected,
    payment_methods:    paymentMethods,
    demographics:       demographics.data || [],
    inventory_variance: variance.data   || [],
    low_stock:          lowStock.data   || [],
  });
};
