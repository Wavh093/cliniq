'use strict';
/**
 * Dev/test stub server — serves the static site plus an in-memory fake of
 * the /api endpoints the admin dashboard uses. No Supabase or network needed.
 *
 *   node scripts/dev-stub-server.js [port]     (default 4173)
 *
 * Used by scripts/ui-test.mjs (Playwright) to drive admin.html end-to-end.
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = Number(process.argv[2] || process.env.PORT || 4173);
const ROOT = path.join(__dirname, '..');

// ── Seed data ───────────────────────────────────────────────────────
let idSeq = 100;
const nid = p => `${p}-${idSeq++}`;

const db = {
  patients: [
    {
      id: 'pt-1', first_name: 'Jane', last_name: 'Smith', email: 'jane@example.com',
      phone: '0821234567', patient_type: 'returning', date_of_birth: '1990-01-01',
      gender: 'female', id_number: '9001015009087', home_address: '1 Main Rd',
      suburb: 'Krugersdorp North', city: 'Krugersdorp', postal_code: '1739', province: 'Gauteng',
      has_medical_aid: true, medical_aid_name: 'Discovery Health', medical_aid_number: 'DH123456',
      medical_aid_plan: 'Classic', relationship_to_member: 'main_member', dependant_code: null,
      main_member_patient_id: null, main_member_name: null,
      allergies: ['Penicillin'], medications: [], medical_conditions: ['Hypertension'],
      dental_anxiety: 'mild', intake_notes: 'Prefers morning appointments.',
      consent_signed: true, consent_date: '2026-01-10T08:00:00Z',
      popia_consent: true, popia_consent_date: '2026-01-10T08:00:00Z',
      marketing_consent: false, referral_source: 'google', referral_detail: null,
      consent_docs: [], created_at: '2026-01-10T08:00:00Z',
    },
    {
      id: 'pt-2', first_name: 'Bob', last_name: 'Jones', email: 'bob@example.com',
      phone: '0837654321', patient_type: 'new', date_of_birth: '1985-05-20',
      gender: 'male', id_number: '8505205009086', has_medical_aid: false,
      allergies: [], medications: [], medical_conditions: [],
      consent_signed: false, popia_consent: false, marketing_consent: false,
      consent_docs: [], created_at: '2026-06-01T09:00:00Z',
    },
  ],
  services: [
    { id: 'svc-1', name: 'Checkup & Clean', category: 'General', duration_minutes: 45, price_from: 650, price_to: null, description: null, active: true, created_at: '2026-01-01' },
    { id: 'svc-2', name: 'Root Canal', category: 'Endodontics', duration_minutes: 90, price_from: 3900, price_to: null, description: null, active: true, created_at: '2026-01-01' },
  ],
  plans: [
    {
      id: 'plan-1', title: 'Root Canal Treatment — Tooth 16', description: 'Three-visit root canal on tooth 16.',
      total_sessions: 3, sessions_done: 1, status: 'active', next_session_due: '2026-07-15',
      notify_patient: false, last_notified_at: null, notes: null,
      created_at: '2026-06-01T08:00:00Z', updated_at: '2026-06-01T08:00:00Z',
      patients: { id: 'pt-1', first_name: 'Jane', last_name: 'Smith', phone: '0821234567', email: 'jane@example.com' },
    },
  ],
  // Deliberate gap in session numbers (1 and 3) — the UI must offer 4 next, not 3.
  sessions: [
    { id: 'sess-1', plan_id: 'plan-1', session_number: 1, status: 'completed', session_date: '2026-06-10',
      notes: 'Access cavity + cleaning', amount_charged: 1300, amount_paid: 1300, payment_method: 'card',
      payment_notes: null, paid_at: '2026-06-10T10:00:00Z', appointment_id: null, appointments: null, service_id: null },
    { id: 'sess-3', plan_id: 'plan-1', session_number: 3, status: 'scheduled', session_date: '2026-07-15',
      notes: null, amount_charged: null, amount_paid: null, payment_method: null,
      payment_notes: null, paid_at: null, appointment_id: null, appointments: null, service_id: null },
  ],
  dentalRecords: { 'pt-1': [ { tooth_fdi: 26, status: 'filled', updated_at: '2026-06-01T08:00:00Z' } ] },
  dentalNotes:   { 'pt-1': [ { id: 'note-1', tooth_fdi: 26, note: 'Composite filling 2024', appointment_id: null, created_at: '2026-06-01T08:00:00Z', appointments: null } ] },
  dentalSurfaces:{ 'pt-1': [ { tooth_fdi: 26, surface: 'occlusal', status: 'filled', notes: null, updated_at: '2026-06-01T08:00:00Z' } ] },
  dentalScans:   { 'pt-1': [] },
};

// ── Helpers ─────────────────────────────────────────────────────────
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

// ── API router ──────────────────────────────────────────────────────
async function apiHandler(req, res, url) {
  const q = Object.fromEntries(url.searchParams.entries());
  const route = url.pathname.replace(/^\/api\//, '');
  const method = req.method;

  // /api/staff
  if (route === 'staff') {
    if (q.resource === 'config') {
      return send(res, 200, { supabaseUrl: `http://localhost:${PORT}`, supabaseAnon: 'stub-anon-key', googleMapsKey: null });
    }
    if (q.resource === 'practice') return send(res, 200, { practice: { id: 'prac-1', name: 'Stub Dental' } });
    return send(res, 200, { staff: [{ id: 'staff-1', user_id: 'user-1', first_name: 'Doc', last_name: 'Tor', name: 'Doc Tor', email: 'doc@example.com', role: 'admin', active: true }] });
  }

  // /api/services
  if (route === 'services') {
    if (method === 'GET') return send(res, 200, { services: db.services.filter(s => q.all === 'true' || s.active) });
    return send(res, 201, { service: db.services[0] });
  }

  // /api/patients
  if (route === 'patients') {
    if (method === 'GET') {
      if (q.main_member_id) return send(res, 200, { patients: db.patients.filter(p => p.main_member_patient_id === q.main_member_id) });
      if (q.id) {
        const p = db.patients.find(x => x.id === q.id);
        if (!p) return send(res, 404, { error: 'Patient not found' });
        return send(res, 200, { patient: { ...p, appointments: [] } });
      }
      let list = db.patients;
      if (q.q) {
        const needle = q.q.toLowerCase();
        list = list.filter(p => `${p.first_name} ${p.last_name} ${p.email || ''} ${p.phone || ''}`.toLowerCase().includes(needle));
      }
      return send(res, 200, { patients: list, total: list.length });
    }
    if (method === 'POST') {
      const body = await readBody(req);
      if (!body.first_name?.trim() || !body.last_name?.trim()) return send(res, 400, { error: 'first_name and last_name are required' });
      if (!body.id_number?.trim()) return send(res, 400, { error: 'ID number is required' });
      const idv = body.id_number.trim();
      if (!/^\d{13}$/.test(idv) && !/^[A-Za-z]\d{8}$/.test(idv)) return send(res, 400, { error: 'ID must be a 13-digit SA ID number or a passport number (1 letter + 8 digits)' });
      const p = { id: nid('pt'), consent_docs: [], created_at: new Date().toISOString(), allergies: [], medications: [], medical_conditions: [], ...body };
      db.patients.push(p);
      return send(res, 201, { success: true, patientId: p.id });
    }
    if (method === 'PATCH') {
      const p = db.patients.find(x => x.id === q.id);
      if (!p) return send(res, 404, { error: 'Patient not found' });
      Object.assign(p, await readBody(req));
      return send(res, 200, { success: true });
    }
    if (method === 'DELETE') {
      db.patients = db.patients.filter(x => x.id !== q.id);
      return send(res, 200, { success: true });
    }
  }

  // /api/appointments — treatment plans, sessions and the rest
  if (route === 'appointments') {
    if (q.resource === 'treatment_plans') {
      if (method === 'GET') {
        if (q.id) {
          const plan = db.plans.find(p => p.id === q.id);
          if (!plan) return send(res, 404, { error: 'Treatment plan not found' });
          const sess = db.sessions.filter(s => s.plan_id === plan.id);
          const total_charged = sess.reduce((s, x) => s + (parseFloat(x.amount_charged) || 0), 0);
          const total_paid    = sess.reduce((s, x) => s + (parseFloat(x.amount_paid)    || 0), 0);
          return send(res, 200, { plan: { ...plan, treatment_plan_sessions: sess, payment_summary: { total_charged, total_paid, outstanding: total_charged - total_paid } } });
        }
        let list = db.plans;
        if (q.patient_id) list = list.filter(p => p.patients?.id === q.patient_id);
        else if (q.status) list = list.filter(p => p.status === q.status);
        else list = list.filter(p => p.status !== 'cancelled');
        return send(res, 200, { plans: list, total: list.length, page: 1, pages: 1 });
      }
      if (method === 'POST') {
        const body = await readBody(req);
        const pt = db.patients.find(p => p.id === body.patient_id);
        const plan = {
          id: nid('plan'), title: body.title, description: body.description || null,
          total_sessions: Number(body.total_sessions) || 1, sessions_done: 0, status: 'active',
          next_session_due: body.next_session_due || null, notify_patient: false, last_notified_at: null,
          notes: body.notes || null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          patients: pt ? { id: pt.id, first_name: pt.first_name, last_name: pt.last_name, phone: pt.phone, email: pt.email } : null,
        };
        db.plans.push(plan);
        return send(res, 201, { plan });
      }
      if (method === 'PATCH') {
        const plan = db.plans.find(p => p.id === q.id);
        if (!plan) return send(res, 404, { error: 'Treatment plan not found' });
        Object.assign(plan, await readBody(req));
        return send(res, 200, { success: true });
      }
      if (method === 'DELETE') {
        const plan = db.plans.find(p => p.id === q.id);
        if (plan) plan.status = 'cancelled';
        return send(res, 200, { success: true });
      }
    }

    if (q.resource === 'plan_sessions') {
      if (method === 'GET') return send(res, 200, { sessions: db.sessions.filter(s => s.plan_id === q.plan_id) });
      if (method === 'POST') {
        const body = await readBody(req);
        if (db.sessions.some(s => s.plan_id === body.plan_id && s.session_number === Number(body.session_number))) {
          return send(res, 409, { error: `Session ${body.session_number} already exists for this plan` });
        }
        const sess = {
          id: nid('sess'), plan_id: body.plan_id, session_number: Number(body.session_number),
          status: 'scheduled', session_date: body.session_date || null, notes: body.notes || null,
          amount_charged: null, amount_paid: null, payment_method: null, payment_notes: null, paid_at: null,
          service_id: body.service_id || null, appointment_id: null, appointments: null,
        };
        if (body.session_date) {
          sess.appointment_id = nid('appt');
          sess.appointments = { id: sess.appointment_id, appointment_date: body.session_date, appointment_time: body.appointment_time ? body.appointment_time + ':00' : '09:00:00', status: 'pending', duration_minutes: 30, clinical_notes: null, services: null };
        }
        db.sessions.push(sess);
        return send(res, 201, { session: sess });
      }
      if (method === 'PATCH') {
        const sess = db.sessions.find(s => s.id === q.id);
        if (!sess) return send(res, 404, { error: 'Session not found' });
        Object.assign(sess, await readBody(req));
        // recompute sessions_done on the plan (mirrors the DB trigger)
        const plan = db.plans.find(p => p.id === sess.plan_id);
        if (plan) plan.sessions_done = db.sessions.filter(s => s.plan_id === plan.id && s.status === 'completed').length;
        return send(res, 200, { success: true });
      }
    }

    if (q.resource === 'branches')    return send(res, 200, { branches: [] });
    if (q.resource === 'time_blocks') return send(res, 200, { time_blocks: [] });
    if (q.resource === 'tariff_ref' || q.resource === 'icd10_ref') return send(res, 200, { codes: [] });
    if (q.needs_link === 'true') return send(res, 200, { appointments: [] });
    return send(res, 200, { appointments: [], total: 0, page: 1, limit: 20, pages: 1 });
  }

  // /api/documents — dental chart resources + patient documents
  if (route === 'documents') {
    const pid = q.patient_id;
    if (q.resource === 'dental') {
      if (method === 'GET' && q.action === 'scans') return send(res, 200, { scans: db.dentalScans[pid] || [] });
      if (method === 'GET') return send(res, 200, { records: db.dentalRecords[pid] || [], notes: db.dentalNotes[pid] || [] });
      if (method === 'POST') {
        const body = await readBody(req);
        const bpid = body.patient_id;
        if (q.action === 'note') {
          const note = { id: nid('note'), tooth_fdi: Number(body.tooth_fdi), note: body.note, appointment_id: null, created_at: new Date().toISOString(), appointments: null };
          (db.dentalNotes[bpid] = db.dentalNotes[bpid] || []).unshift(note);
          return send(res, 201, { note });
        }
        if (q.action === 'scan') {
          const scan = { id: nid('scan'), appointment_id: null, tooth_fdis: body.tooth_fdis || [], file_path: body.file_path, mime_type: body.mime_type, filename: body.filename, notes: null, created_at: new Date().toISOString(), signed_url: null };
          (db.dentalScans[bpid] = db.dentalScans[bpid] || []).unshift(scan);
          return send(res, 201, { scan });
        }
        // upsert tooth status
        const recs = (db.dentalRecords[bpid] = db.dentalRecords[bpid] || []);
        let rec = recs.find(r => r.tooth_fdi === Number(body.tooth_fdi));
        if (!rec) { rec = { tooth_fdi: Number(body.tooth_fdi) }; recs.push(rec); }
        rec.status = body.status || 'healthy';
        rec.updated_at = new Date().toISOString();
        return send(res, 200, { record: rec });
      }
      if (method === 'DELETE') {
        if (q.action === 'note') { for (const k of Object.keys(db.dentalNotes)) db.dentalNotes[k] = db.dentalNotes[k].filter(n => n.id !== q.id); return send(res, 200, { success: true }); }
        if (q.action === 'scan') { for (const k of Object.keys(db.dentalScans)) db.dentalScans[k] = db.dentalScans[k].filter(s => s.id !== q.id); return send(res, 200, { success: true }); }
      }
    }
    if (q.resource === 'dental_surfaces') {
      if (method === 'GET') return send(res, 200, { surfaces: db.dentalSurfaces[pid] || [] });
      if (method === 'POST') {
        const body = await readBody(req);
        const list = (db.dentalSurfaces[body.patient_id] = db.dentalSurfaces[body.patient_id] || []);
        let s = list.find(x => x.tooth_fdi === Number(body.tooth_fdi) && x.surface === body.surface);
        if (!s) { s = { tooth_fdi: Number(body.tooth_fdi), surface: body.surface }; list.push(s); }
        s.status = body.status; s.notes = body.notes || null; s.updated_at = new Date().toISOString();
        return send(res, 200, { surface: s });
      }
    }
    return send(res, 200, { documents: [] });
  }

  // Quiet defaults for the rest of the dashboard
  if (route === 'contact')   return send(res, 200, { submissions: [], total: 0, page: 1, limit: 20, pages: 1 });
  if (route === 'reviews')   return send(res, 200, { reviews: [], total: 0, page: 1, limit: 20, pages: 1, avg_rating: null });
  if (route === 'inventory') return send(res, 200, { items: [] });
  if (route === 'analytics') return send(res, 200, { monthly_bookings: [], revenue: [], revenue_collected: [], payment_methods: {}, demographics: [], inventory_variance: [], low_stock: [], logs: [], rows: [] });
  if (route === 'revenue')   return send(res, 200, { appointments: [], plan_sessions: [], summary: { total_appointments: 0, estimated_revenue: 0, amount_collected: 0, amount_outstanding: 0, inventory_cost: 0, net_revenue: 0 } });
  if (route === 'bookings')  return send(res, 200, { slots: [] });
  if (route === 'notify')    return send(res, 200, { success: true, used: 0, limit: 10, remaining: 10 });

  return send(res, 200, {});
}

// ── Server ──────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (url.pathname.startsWith('/api/')) return await apiHandler(req, res, url);

    // Minimal fake of the Supabase auth endpoint (only hit on token refresh)
    if (url.pathname.startsWith('/auth/v1/')) {
      return send(res, 200, { access_token: 'stub-token', token_type: 'bearer', expires_in: 3600 * 24 * 365, refresh_token: 'stub-refresh', user: { id: 'user-1', email: 'doc@example.com' } });
    }

    // Static files
    let file = url.pathname === '/' ? '/admin.html' : url.pathname;
    const full = path.join(ROOT, path.normalize(file).replace(/^([.][.][\/\\])+/, ''));
    if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      res.writeHead(404); return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(full).pipe(res);
  } catch (e) {
    console.error('[stub]', e);
    send(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => console.log(`stub server on http://localhost:${PORT}`));
