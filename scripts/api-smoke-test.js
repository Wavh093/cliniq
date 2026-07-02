'use strict';
/**
 * API smoke tests — run the real serverless handlers against an in-memory
 * mock of @supabase/supabase-js (and resend), no network or DB required.
 *
 *   node scripts/api-smoke-test.js
 *
 * Covers: CORS, auth gating (401/403 vs staff), public booking validation
 * (slot check, past dates, email escaping), public services GET, patient
 * upload path sanitisation, review rating validation, notify webhook secret.
 */

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
delete process.env.PRACTICE_ID; // use the default
delete process.env.RESEND_API_KEY;
delete process.env.NOTIFY_SECRET;

const PRACTICE_ID = '00000000-0000-0000-0000-000000000001';

// ── Mock state ─────────────────────────────────────────────────────
const state = {
  tables: {},          // table → array of rows
  rpc: {},             // rpc name → fn(args) → { data, error }
  users: {},           // token → user object
  storage: [],         // uploaded paths
  emails: [],          // sent resend emails
  idSeq: 1,
};

function resetState() {
  state.tables = {
    staff: [{ id: 'staff-1', practice_id: PRACTICE_ID, user_id: 'user-1', role: 'admin', active: true, email: 'doc@example.com', first_name: 'Doc', last_name: 'Tor', expo_push_token: null }],
    services: [{ id: 'svc-1', practice_id: PRACTICE_ID, name: 'Checkup & Clean', category: 'General', duration_minutes: 45, price_from: 650, active: true }],
    patients: [],
    appointments: [],
    contact_submissions: [],
    ai_requests: [],
    patient_documents: [],
    practices: [{ id: PRACTICE_ID, name: 'Test Practice', letterhead_data: null }],
  };
  state.rpc = {
    compute_available_slots: () => ({ data: [{ slot_time: '09:00:00' }, { slot_time: '09:30:00' }], error: null }),
  };
  state.users = { 'staff-token': { id: 'user-1', email: 'doc@example.com' }, 'rando-token': { id: 'user-999', email: 'rando@example.com' } };
  state.storage = [];
  state.emails = [];
  state.orCalls = [];   // every .or(<filter string>) — lets tests assert injection stripping
}

// ── Mock supabase client ───────────────────────────────────────────
function applyFilters(rows, filters) {
  return rows.filter(row => filters.every(([m, args]) => {
    if (m === 'eq') return row[args[0]] === args[1];
    if (m === 'neq') return row[args[0]] !== args[1];
    if (m === 'is' && args[1] === null) return row[args[0]] == null;
    return true; // ignore or/ilike/gte/… for smoke purposes
  }));
}

function makeBuilder(table) {
  const q = { table, op: 'select', payload: null, filters: [], single: null, wantRows: false, head: false };
  const b = {};
  const chainable = ['select', 'eq', 'neq', 'is', 'not', 'or', 'in', 'gt', 'gte', 'lt', 'lte', 'ilike', 'order', 'range', 'limit'];
  for (const m of chainable) {
    b[m] = (...args) => {
      if (m === 'select') { q.wantRows = true; if (args[1]?.head) q.head = true; }
      else q.filters.push([m, args]);
      if (m === 'or') state.orCalls.push(String(args[0]));
      return b;
    };
  }
  b.insert = p => { q.op = 'insert'; q.payload = p; return b; };
  b.update = p => { q.op = 'update'; q.payload = p; return b; };
  b.upsert = p => { q.op = 'upsert'; q.payload = p; return b; };
  b.delete = () => { q.op = 'delete'; return b; };
  b.single = () => { q.single = 'single'; return b; };
  b.maybeSingle = () => { q.single = 'maybe'; return b; };
  b.then = (onF, onR) => Promise.resolve().then(() => resolve(q)).then(onF, onR);
  return b;

  function resolve(q) {
    const rows = state.tables[q.table] || (state.tables[q.table] = []);
    if (q.op === 'insert') {
      const list = Array.isArray(q.payload) ? q.payload : [q.payload];
      const created = list.map(p => ({ id: `id-${state.idSeq++}`, ...p }));
      rows.push(...created);
      const data = q.single ? created[0] : created;
      return { data, error: null, count: created.length };
    }
    if (q.op === 'update' || q.op === 'upsert') {
      const matched = applyFilters(rows, q.filters);
      for (const r of matched) Object.assign(r, q.payload);
      const data = q.single ? (matched[0] ?? null) : matched;
      if (q.single === 'single' && !matched.length) return { data: null, error: { message: '0 rows' } };
      return { data, error: null, count: matched.length };
    }
    if (q.op === 'delete') {
      const matched = applyFilters(rows, q.filters);
      state.tables[q.table] = rows.filter(r => !matched.includes(r));
      return { data: matched, error: null, count: matched.length };
    }
    // select
    const matched = applyFilters(rows, q.filters);
    if (q.single === 'single') {
      return matched.length ? { data: matched[0], error: null } : { data: null, error: { message: '0 rows' } };
    }
    if (q.single === 'maybe') return { data: matched[0] ?? null, error: null };
    return { data: q.head ? null : matched, error: null, count: matched.length };
  }
}

const supabaseMock = {
  createClient: () => ({
    from: table => makeBuilder(table),
    rpc: (name, args) => {
      const fn = state.rpc[name];
      const result = fn ? fn(args) : { data: null, error: { message: `no rpc ${name}` } };
      return Promise.resolve(result);
    },
    auth: {
      getUser: async token => {
        const user = state.users[token];
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'bad token' } };
      },
      admin: {
        inviteUserByEmail: async email => ({ data: { user: { id: 'invited-1' } }, error: null }),
        updateUserById: async () => ({ data: {}, error: null }),
      },
    },
    storage: {
      from: () => ({
        upload: async (path) => { state.storage.push(path); return { data: { path }, error: null }; },
        createSignedUrl: async path => ({ data: { signedUrl: `https://signed.example/${path}` }, error: null }),
        remove: async () => ({ data: null, error: null }),
      }),
    },
  }),
};

const resendMock = {
  Resend: class {
    constructor() { this.emails = { send: async msg => { state.emails.push(msg); return { data: { id: 'em' } }; } }; }
  },
};

// Intercept module loading BEFORE requiring any handler
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@supabase/supabase-js') return supabaseMock;
  if (request === 'resend') return resendMock;
  return origLoad.apply(this, arguments);
};

// Mock global fetch (Expo push, Gemini, Anthropic) — never hit the network
global.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' });

// ── Tiny req/res harness ───────────────────────────────────────────
let ipSeq = 1;
function makeReq({ method = 'GET', query = {}, body = null, token = null, origin = null, headers = {} } = {}) {
  const h = { 'x-forwarded-for': `10.0.${Math.floor(ipSeq / 250)}.${ipSeq++ % 250}`, ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (origin) h.origin = origin;
  return { method, query, body, headers: h, socket: { remoteAddress: '127.0.0.1' } };
}
function makeRes() {
  const res = { statusCode: null, body: null, headers: {}, ended: false };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = c => { res.statusCode = c; return res; };
  res.json = obj => { res.body = obj; res.ended = true; return res; };
  res.end = () => { res.ended = true; return res; };
  return res;
}

// ── Test runner ────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL ${name}${extra ? ' — ' + JSON.stringify(extra) : ''}`); }
}

async function run() {
  const bookings     = require('../api/bookings');
  const services     = require('../api/services');
  const appointments = require('../api/appointments');
  const patients     = require('../api/patients');
  const reviews      = require('../api/reviews');
  const contact      = require('../api/contact');
  const notify       = require('../api/notify');
  const staff        = require('../api/staff');
  const revenue      = require('../api/revenue');
  const inventory    = require('../api/inventory');
  const analytics    = require('../api/analytics');
  const documents    = require('../api/documents');

  // ── Documents: type allowlist now includes 'prescription' ──
  console.log('\nDocuments: prescription type');
  resetState();
  {
    const bad = makeRes();
    await documents(makeReq({ method: 'POST', token: 'staff-token', body: { type: 'invoice', title: 'X', html_content: '<p>x</p>' } }), bad);
    check('unknown doc type → 400', bad.statusCode === 400, { got: bad.statusCode });
    for (const type of ['sick_note', 'referral_letter', 'prescription']) {
      const res = makeRes();
      await documents(makeReq({ method: 'POST', token: 'staff-token', body: { type, appointment_id: 'ap-1', patient_id: 'pt-1', title: `${type} doc`, html_content: '<p>ok</p>' } }), res);
      check(`${type} accepted → 201`, res.statusCode === 201, { got: res.statusCode, body: res.body });
    }
    const bad2 = makeRes();
    await documents(makeReq({ method: 'POST', body: { type: 'prescription', title: 'X', html_content: '<p>x</p>' } }), bad2);
    check('prescription without staff token → 401/403', bad2.statusCode === 401 || bad2.statusCode === 403, { got: bad2.statusCode });
  }

  // ── Practice config exposes letterhead to authed clients only ──
  console.log('\nPractice config: letterhead');
  resetState();
  state.tables.practices[0].letterhead_data = 'data:image/png;base64,AAAA';
  {
    const anon = makeRes();
    await staff(makeReq({ method: 'GET', query: { resource: 'config' } }), anon);
    check('config without token → no practice/letterhead leaked', anon.statusCode === 200 && !anon.body.practice, { practice: anon.body.practice });
    const authed = makeRes();
    await staff(makeReq({ method: 'GET', query: { resource: 'config' }, token: 'staff-token' }), authed);
    check('authed config includes letterhead_data', authed.statusCode === 200 && authed.body.practice?.letterhead_data === 'data:image/png;base64,AAAA', { practice: authed.body.practice });
  }

  // ── Practice PATCH: letterhead is writable, id/created_at are not ──
  console.log('\nPractice profile: letterhead writable');
  resetState();
  {
    const res = makeRes();
    await staff(makeReq({ method: 'PATCH', token: 'staff-token', query: { resource: 'practice' }, body: { letterhead_data: 'data:image/png;base64,BBBB', id: 'evil' } }), res);
    const row = state.tables.practices[0];
    check('letterhead_data saved via PATCH', res.statusCode === 200 && row.letterhead_data === 'data:image/png;base64,BBBB', { got: res.statusCode, lh: row.letterhead_data });
    check('practice id not overwritten', row.id === PRACTICE_ID, { id: row.id });
  }

  // ── CORS ──
  console.log('\nCORS');
  resetState();
  {
    const res = makeRes();
    await bookings(makeReq({ method: 'OPTIONS', origin: 'https://ohdental.co.za' }), res);
    check('OPTIONS preflight → 204', res.statusCode === 204);
    check('allowed origin gets ACAO', res.headers['access-control-allow-origin'] === 'https://ohdental.co.za');
  }
  {
    const res = makeRes();
    await bookings(makeReq({ method: 'OPTIONS', origin: 'https://evil.example' }), res);
    check('unknown origin gets no ACAO', res.headers['access-control-allow-origin'] === undefined);
  }

  // ── Auth gating ──
  console.log('\nAuth gating');
  for (const [name, handler, extra] of [
    ['appointments', appointments, {}],
    ['patients', patients, {}],
    ['revenue', revenue, {}],
    ['inventory', inventory, {}],
    ['analytics', analytics, {}],
    ['documents', documents, { query: { patient_id: 'p1' } }],
    ['contact', contact, {}],
    ['reviews', reviews, {}],
    ['staff', staff, {}],
  ]) {
    resetState();
    const r1 = makeRes();
    await handler(makeReq({ method: 'GET', ...(extra || {}) }), r1);
    check(`${name} GET no token → 401`, r1.statusCode === 401, { got: r1.statusCode });
    const r2 = makeRes();
    await handler(makeReq({ method: 'GET', token: 'rando-token', ...(extra || {}) }), r2);
    check(`${name} GET non-staff user → 403`, r2.statusCode === 403, { got: r2.statusCode });
    const r3 = makeRes();
    await handler(makeReq({ method: 'GET', token: 'staff-token', ...(extra || {}) }), r3);
    check(`${name} GET staff → 200`, r3.statusCode === 200, { got: r3.statusCode, body: r3.body });
  }

  // ── Services: public GET, staff-only mutations ──
  console.log('\nServices');
  resetState();
  {
    const res = makeRes();
    await services(makeReq({ method: 'GET' }), res);
    check('public GET → 200 with active services', res.statusCode === 200 && res.body.services.length === 1);
    const res2 = makeRes();
    await services(makeReq({ method: 'GET', query: { all: 'true' } }), res2);
    check('GET all=true without token → 401', res2.statusCode === 401);
    const res3 = makeRes();
    await services(makeReq({ method: 'POST', body: { name: 'X', category: 'General', duration_minutes: 30 } }), res3);
    check('POST without token → 401', res3.statusCode === 401);
    const res4 = makeRes();
    await services(makeReq({ method: 'POST', token: 'staff-token', body: { name: 'X', category: 'General', duration_minutes: 30 } }), res4);
    check('POST as staff → 201', res4.statusCode === 201);
  }

  // ── Bookings GET ──
  console.log('\nBookings GET');
  resetState();
  {
    const res = makeRes();
    await bookings(makeReq({ method: 'GET', query: {} }), res);
    check('missing date → 400', res.statusCode === 400);
    const res2 = makeRes();
    await bookings(makeReq({ method: 'GET', query: { date: '2026-07-02', duration: '9999' } }), res2);
    check('absurd duration → 400', res2.statusCode === 400);
    const res3 = makeRes();
    await bookings(makeReq({ method: 'GET', query: { date: '2026-07-02', duration: '30' } }), res3);
    check('valid GET → slots trimmed to HH:MM', res3.statusCode === 200 && res3.body.slots[0] === '09:00');
  }

  // ── Bookings POST ──
  console.log('\nBookings POST');
  const futureDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const validBooking = {
    service: 'Checkup', patientType: 'new', date: futureDate, time: '09:00',
    firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '0825550123',
  };
  resetState();
  {
    const res = makeRes();
    await bookings(makeReq({ method: 'POST', body: { ...validBooking, email: 'not-an-email' } }), res);
    check('bad email → 400', res.statusCode === 400);

    const res2 = makeRes();
    await bookings(makeReq({ method: 'POST', body: { ...validBooking, date: '2020-01-01' } }), res2);
    check('past date → 400', res2.statusCode === 400, { got: res2.statusCode, body: res2.body });

    const res3 = makeRes();
    await bookings(makeReq({ method: 'POST', body: { ...validBooking, time: '13:00' } }), res3);
    check('unavailable slot → 409', res3.statusCode === 409, { got: res3.statusCode, body: res3.body });

    const res4 = makeRes();
    await bookings(makeReq({ method: 'POST', body: validBooking }), res4);
    check('valid booking → 201', res4.statusCode === 201, { got: res4.statusCode, body: res4.body });
    check('patient created', state.tables.patients.length === 1);
    check('appointment created pending', state.tables.appointments[0]?.status === 'pending');
  }

  // ── Booking email escaping ──
  console.log('\nBooking email escaping');
  resetState();
  process.env.RESEND_API_KEY = 'test-key';
  {
    const res = makeRes();
    await bookings(makeReq({
      method: 'POST',
      body: { ...validBooking, email: 'x@example.com', firstName: '<script>alert(1)</script>', notes: '<img src=x onerror=alert(2)>' },
    }), res);
    check('booking with HTML in name → 201', res.statusCode === 201, { got: res.statusCode, body: res.body });
    const html = state.emails.map(e => e.html).join('\n');
    check('emails sent', state.emails.length === 2, { count: state.emails.length });
    check('no raw <script> in emails', !html.includes('<script>'));
    check('no raw onerror in emails', !html.includes('<img src=x onerror'));
    check('escaped entities present', html.includes('&lt;script&gt;'));
  }
  delete process.env.RESEND_API_KEY;

  // ── Patients: onboarding public, upload sanitisation ──
  console.log('\nPatients');
  resetState();
  {
    const res = makeRes();
    await patients(makeReq({ method: 'POST', query: { onboarding: 'true' }, body: {
      first_name: 'A', last_name: 'B', phone: '0821234567', id_number: '9001015009087',
    } }), res);
    check('public onboarding → 201', res.statusCode === 201, { got: res.statusCode, body: res.body });

    const res2 = makeRes();
    await patients(makeReq({ method: 'POST', query: { onboarding: 'true' }, body: {
      first_name: 'A', last_name: 'B', phone: '0821234568', id_number: '123',
    } }), res2);
    check('onboarding bad ID number → 400', res2.statusCode === 400);

    // upload_doc for unknown patient must 404 without touching storage
    const res3 = makeRes();
    await patients(makeReq({ method: 'POST', token: 'staff-token', query: { upload_doc: '1' }, body: {
      patient_id: 'nope', file_name: 'x.pdf', file_type: 'application/pdf', file_base64: Buffer.from('hi').toString('base64'),
    } }), res3);
    check('upload for unknown patient → 404, no orphan file', res3.statusCode === 404 && state.storage.length === 0, { got: res3.statusCode });

    // path traversal attempt in extension
    const pid = state.tables.patients[0].id;
    const res4 = makeRes();
    await patients(makeReq({ method: 'POST', token: 'staff-token', query: { upload_doc: '1' }, body: {
      patient_id: pid, file_name: 'evil.a/../../x', file_type: 'application/pdf', file_base64: Buffer.from('hi').toString('base64'),
    } }), res4);
    check('upload succeeds with sanitised ext', res4.statusCode === 201, { got: res4.statusCode, body: res4.body });
    check('storage path has no traversal', state.storage.length === 1 && !state.storage[0].includes('..') && !state.storage[0].split('/').pop().includes('/'), { path: state.storage[0] });
  }

  // ── Reviews ──
  console.log('\nReviews');
  resetState();
  {
    const res = makeRes();
    await reviews(makeReq({ method: 'POST', body: { rating: 3.7, text: 'pretty good visit' } }), res);
    check('fractional rating → 400', res.statusCode === 400, { got: res.statusCode });
    const res2 = makeRes();
    await reviews(makeReq({ method: 'POST', body: { rating: 5, text: 'pretty good visit' } }), res2);
    check('valid review → 201', res2.statusCode === 201, { got: res2.statusCode, body: res2.body });
  }

  // ── Contact ──
  console.log('\nContact');
  resetState();
  {
    const res = makeRes();
    await contact(makeReq({ method: 'POST', body: { name: 'A', email: 'a@b.co', message: 'short' } }), res);
    check('short message → 400', res.statusCode === 400);
    const res2 = makeRes();
    await contact(makeReq({ method: 'POST', body: { name: 'A', email: 'a@b.co', message: 'hello I need a checkup please' } }), res2);
    check('valid contact → 201', res2.statusCode === 201, { got: res2.statusCode, body: res2.body });
  }

  // ── Notify webhook secret ──
  console.log('\nNotify');
  resetState();
  process.env.NOTIFY_SECRET = 's3cret';
  {
    const res = makeRes();
    await notify(makeReq({ method: 'POST', body: { type: 'new_patient' }, headers: { 'x-webhook-secret': 'wrong' } }), res);
    check('bad webhook secret → 401', res.statusCode === 401);
    const res2 = makeRes();
    await notify(makeReq({ method: 'POST', body: { type: 'new_patient', data: { name: 'X' } }, headers: { 'x-webhook-secret': 's3cret' } }), res2);
    check('good secret → 200', res2.statusCode === 200, { got: res2.statusCode, body: res2.body });
  }
  delete process.env.NOTIFY_SECRET;

  // ── Staff config (public + authed practice row) ──
  console.log('\nStaff config');
  resetState();
  state.tables.practices = [{ id: PRACTICE_ID, name: 'Test Practice' }];
  {
    const res = makeRes();
    await staff(makeReq({ method: 'GET', query: { resource: 'config' } }), res);
    check('config without token → url+anon only', res.statusCode === 200 && res.body.supabaseUrl && !res.body.practice);
    const res2 = makeRes();
    await staff(makeReq({ method: 'GET', query: { resource: 'config' }, token: 'staff-token' }), res2);
    check('config with token includes practice row', res2.statusCode === 200 && res2.body.practice?.name === 'Test Practice', { body: res2.body });
  }

  // ── Appointments state machine + validation ──
  console.log('\nAppointments');
  resetState();
  {
    const res = makeRes();
    await appointments(makeReq({ method: 'POST', token: 'staff-token', body: {
      patient_id: 'p1', service_id: 'svc-1', appointment_date: 'not-a-date', appointment_time: '09:00',
    } }), res);
    check('POST bad date format → 400', res.statusCode === 400, { got: res.statusCode });

    const res2 = makeRes();
    await appointments(makeReq({ method: 'POST', token: 'staff-token', body: {
      patient_id: 'p1', service_id: 'svc-1', appointment_date: futureDate, appointment_time: '09:00', duration_minutes: 30,
    } }), res2);
    check('POST valid → 201', res2.statusCode === 201, { got: res2.statusCode, body: res2.body });

    const apptId = state.tables.appointments[0].id;
    // Force it completed, then try to reopen — terminal state must be locked
    state.tables.appointments[0].status = 'completed';
    const res3 = makeRes();
    await appointments(makeReq({ method: 'PATCH', token: 'staff-token', query: { id: apptId }, body: { status: 'pending' } }), res3);
    check('completed is terminal → 422', res3.statusCode === 422, { got: res3.statusCode, body: res3.body });

    const res4 = makeRes();
    await appointments(makeReq({ method: 'PATCH', token: 'staff-token', query: { id: apptId }, body: { duration_minutes: 'abc' } }), res4);
    check('PATCH NaN duration → 400', res4.statusCode === 400, { got: res4.statusCode });
  }

  // ══ SECURITY TESTS ══════════════════════════════════════════════
  console.log('\nSecurity: PostgREST filter injection');
  resetState();
  {
    // Injection payload trying to smuggle extra filter clauses into .or()
    const res = makeRes();
    await patients(makeReq({ method: 'GET', token: 'staff-token', query: { q: 'x),(deleted_at.not.is.null' } }), res);
    check('malicious search still 200', res.statusCode === 200, { got: res.statusCode });
    const injected = state.orCalls.filter(c => c.includes('deleted_at.not'));
    // The user term is embedded between % wildcards — control chars ( ) , .
    // must have been stripped from every embedded term.
    let bad = false;
    for (const c of state.orCalls) {
      for (const m of c.matchAll(/%([^%]*)%/g)) {
        if (/[(),."\\]/.test(m[1])) bad = true;
      }
    }
    check('filter control chars stripped from search terms', injected.length === 0 && !bad, { orCalls: state.orCalls.slice(0, 3) });
  }

  console.log('\nSecurity: mass assignment blocked');
  resetState();
  {
    const pid = state.tables.patients[0]?.id || (state.tables.patients.push({ id: 'pt-x', practice_id: PRACTICE_ID, first_name: 'A', last_name: 'B' }), 'pt-x');
    state.tables.patients[0].id = pid; state.tables.patients[0].practice_id = PRACTICE_ID;
    const res = makeRes();
    await patients(makeReq({ method: 'PATCH', token: 'staff-token', query: { id: pid }, body: {
      first_name: 'Renamed', practice_id: 'evil-practice', deleted_at: '2020-01-01T00:00:00Z', id: 'evil-id',
    } }), res);
    const row = state.tables.patients.find(r => r.first_name === 'Renamed');
    check('patient PATCH applies allowlisted field', res.statusCode === 200 && !!row, { got: res.statusCode });
    check('practice_id / deleted_at / id not writable', row && row.practice_id === PRACTICE_ID && row.deleted_at == null && row.id === pid,
      { practice_id: row?.practice_id, deleted_at: row?.deleted_at });
  }
  {
    // appointments PATCH must ignore unknown/dangerous fields too
    state.tables.appointments = [{ id: 'ap-1', practice_id: PRACTICE_ID, status: 'pending', appointment_date: '2027-01-01', appointment_time: '09:00:00', duration_minutes: 30 }];
    const res = makeRes();
    await appointments(makeReq({ method: 'PATCH', token: 'staff-token', query: { id: 'ap-1' }, body: {
      internal_notes: 'ok', practice_id: 'evil', deleted_at: '2020-01-01',
    } }), res);
    const row = state.tables.appointments[0];
    check('appointment PATCH ignores practice_id/deleted_at', res.statusCode === 200 && row.practice_id === PRACTICE_ID && row.deleted_at == null,
      { got: res.statusCode, practice_id: row.practice_id, deleted_at: row.deleted_at });
  }

  console.log('\nSecurity: CORS origin spoofing');
  resetState();
  for (const [origin, allowed] of [
    ['https://ohdental.co.za', true],
    ['https://cliniq-git-branch.vercel.app', true],           // legit preview
    ['https://evil-cliniq.vercel.app', false],                // prefix spoof
    ['https://cliniq.vercel.app.evil.com', false],            // suffix spoof
    ['https://ohdental.co.za.evil.com', false],
    ['http://ohdental.co.za', false],                         // wrong scheme
  ]) {
    const res = makeRes();
    await bookings(makeReq({ method: 'OPTIONS', origin }), res);
    const got = res.headers['access-control-allow-origin'];
    check(`origin ${origin} ${allowed ? 'allowed' : 'blocked'}`, allowed ? got === origin : got === undefined, { got });
  }

  console.log('\nSecurity: oversize + type limits');
  resetState();
  {
    const res = makeRes();
    await bookings(makeReq({ method: 'POST', body: { ...validBooking, notes: 'x'.repeat(1001) } }), res);
    check('booking notes >1000 chars → 400', res.statusCode === 400, { got: res.statusCode });
    const res2 = makeRes();
    await bookings(makeReq({ method: 'POST', body: { ...validBooking, firstName: 'x'.repeat(101) } }), res2);
    check('booking name >100 chars → 400', res2.statusCode === 400, { got: res2.statusCode });
    const res3 = makeRes();
    await patients(makeReq({ method: 'POST', token: 'staff-token', query: { upload_doc: '1' }, body: {
      patient_id: 'pt-1', file_name: 'x.exe', file_type: 'application/x-msdownload', file_base64: 'aGk=',
    } }), res3);
    check('upload with executable mime type → 400', res3.statusCode === 400, { got: res3.statusCode });
  }

  console.log('\nSecurity: method fuzzing');
  for (const [name, handler] of [['bookings', bookings], ['services', services], ['reviews', reviews], ['contact', contact]]) {
    resetState();
    const res = makeRes();
    await handler(makeReq({ method: 'PUT', token: 'staff-token', body: {} }), res);
    check(`${name} PUT → 405`, res.statusCode === 405, { got: res.statusCode });
  }

  console.log('\nSecurity: webhook secret');
  resetState();
  {
    delete process.env.NOTIFY_SECRET;
    const res = makeRes();
    await notify(makeReq({ method: 'POST', body: { type: 'new_patient' }, headers: { 'x-webhook-secret': '' } }), res);
    check('unset NOTIFY_SECRET rejects everything', res.statusCode === 401, { got: res.statusCode });
    process.env.NOTIFY_SECRET = 'topsecret';
    const res2 = makeRes();
    await notify(makeReq({ method: 'POST', body: { type: 'new_patient' }, headers: { 'x-webhook-secret': 'topsecre' } }), res2);
    check('near-miss secret rejected', res2.statusCode === 401, { got: res2.statusCode });
    const res3 = makeRes();
    await notify(makeReq({ method: 'POST', body: { type: 'new_patient' }, headers: { 'x-webhook-secret': 'topsecret' } }), res3);
    check('exact secret accepted', res3.statusCode === 200, { got: res3.statusCode });
    delete process.env.NOTIFY_SECRET;
  }

  // ── Summary ──
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) { console.log('Failures:', failures); process.exit(1); }
}

run().catch(e => { console.error(e); process.exit(1); });
