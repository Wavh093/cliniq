'use strict';
/**
 * /api/bookings
 *
 * GET  ?date=YYYY-MM-DD[&duration=30]
 *   → { slots: ['08:00', '08:30', ...] }
 *
 * POST { service, patientType, date, time, firstName, lastName, email, phone, notes? }
 *   → 201 { success: true, appointmentId }
 */
const { adminClient, cors, parseBody, PRACTICE_ID } = require('./_lib/supabase');
const { rateLimit } = require('./_lib/rateLimit');

const VALID_PATIENT_TYPES = ['new', 'returning'];

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;
  // Rate limit public POST (booking creation); apply lighter limit to GET (slot checks)
  if (req.method === 'POST' && rateLimit(req, res)) return;

  const db = adminClient();

  // ── GET — available slots for a date ──────────────────────────
  if (req.method === 'GET') {
    const { date, duration = 30 } = req.query;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
    }

    const { data, error } = await db.rpc('compute_available_slots', {
      p_practice_id: PRACTICE_ID,
      p_date:        date,
      p_duration:    Number(duration),
    });

    if (error) {
      console.error('[bookings GET]', error);
      return res.status(500).json({ error: 'Could not retrieve available slots' });
    }

    // RPC returns [{ slot_time: '08:00:00' }, ...] — trim to HH:MM
    const slots = (data || []).map(r => r.slot_time.slice(0, 5));
    return res.status(200).json({ slots });
  }

  // ── POST — create an appointment ──────────────────────────────
  if (req.method === 'POST') {
    const body = await parseBody(req);
    const {
      service: serviceName,
      patientType = 'new',
      date,
      time,
      firstName,
      lastName,
      email,
      phone,
      notes = null,
    } = body;

    // Validate required fields
    const missing = ['date','time','firstName','lastName','email','phone','service']
      .filter(k => !body[k]);
    if (missing.length) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    // Type and length validation
    const strFields = { firstName, lastName, phone };
    for (const [field, val] of Object.entries(strFields)) {
      if (typeof val !== 'string') return res.status(400).json({ error: `${field} must be a string` });
      if (val.trim().length > 100) return res.status(400).json({ error: `${field} is too long (max 100 characters)` });
    }
    if (typeof serviceName !== 'string' || serviceName.trim().length > 100) {
      return res.status(400).json({ error: 'service must be a string (max 100 characters)' });
    }
    if (typeof email !== 'string' || email.length > 254) {
      return res.status(400).json({ error: 'email must be a string (max 254 characters)' });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (!VALID_PATIENT_TYPES.includes(patientType)) {
      return res.status(400).json({ error: `patientType must be one of: ${VALID_PATIENT_TYPES.join(', ')}` });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({ error: 'time must be in HH:MM format' });
    }
    if (notes !== null && (typeof notes !== 'string' || notes.length > 1000)) {
      return res.status(400).json({ error: 'notes must be a string (max 1000 characters)' });
    }

    // 1. Resolve service
    const { data: service, error: svcErr } = await db
      .from('services')
      .select('id, name, duration_minutes')
      .eq('practice_id', PRACTICE_ID)
      .eq('active', true)
      .ilike('name', `%${serviceName.trim()}%`)
      .limit(1)
      .single();

    if (svcErr || !service) {
      return res.status(400).json({ error: 'Service not found. Please select a valid service.' });
    }

    // 2. Find or create patient (keyed on email + practice)
    let patientId;
    let needsPatientLink = false;
    const normalEmail = email.toLowerCase().trim();

    const { data: existing } = await db
      .from('patients')
      .select('id, patient_type')
      .eq('practice_id', PRACTICE_ID)
      .eq('email', normalEmail)
      .maybeSingle();

    if (existing) {
      patientId = existing.id;
      // Upgrade new → returning if they're booking again
      if (existing.patient_type === 'new') {
        await db.from('patients').update({ patient_type: 'returning' }).eq('id', patientId);
      }
    } else {
      const { data: created, error: createErr } = await db
        .from('patients')
        .insert({
          practice_id:  PRACTICE_ID,
          first_name:   firstName.trim(),
          last_name:    lastName.trim(),
          email:        normalEmail,
          phone:        phone.trim(),
          patient_type: patientType,
        })
        .select('id')
        .single();

      if (createErr) {
        console.error('[bookings POST] patient create', createErr);
        return res.status(500).json({ error: 'Could not create patient record' });
      }
      patientId = created.id;
      // Returning patient but no existing record found by email — admin needs to call
      // and link this appointment to the correct patient after verifying identity.
      if (patientType === 'returning') needsPatientLink = true;
    }

    // 3. Create appointment
    const { data: appt, error: apptErr } = await db
      .from('appointments')
      .insert({
        practice_id:        PRACTICE_ID,
        patient_id:         patientId,
        service_id:         service.id,
        appointment_date:   date,
        appointment_time:   time,
        duration_minutes:   service.duration_minutes,
        status:             'pending',
        patient_notes:      notes,
        needs_patient_link: needsPatientLink,
      })
      .select('id')
      .single();

    if (apptErr) {
      console.error('[bookings POST] appointment create', apptErr);
      return res.status(500).json({ error: 'Could not create appointment' });
    }

    // 4. Push notification to all staff with a registered token
    try {
      const { data: staffRows } = await db
        .from('staff')
        .select('expo_push_token')
        .eq('practice_id', PRACTICE_ID)
        .not('expo_push_token', 'is', null);

      const tokens = (staffRows || [])
        .map(r => r.expo_push_token)
        .filter(t => typeof t === 'string' && t.startsWith('ExponentPushToken'));

      if (tokens.length > 0) {
        const messages = tokens.map(to => ({
          to,
          title: 'New booking — OH Dental',
          body:  `${firstName} ${lastName} · ${service.name} · ${date} at ${time}`,
          data:  { appointmentId: appt.id },
          sound: 'default',
        }));
        await fetch('https://exp.host/--/api/v2/push/send', {
          method:  'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body:    JSON.stringify(messages),
        });
      }
    } catch (pushErr) {
      console.error('[bookings POST] push error', pushErr); // non-fatal
    }

    // 5. Send confirmation email (if Resend is configured)
    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);

        // Patient confirmation
        await resend.emails.send({
          from:    'OH Dental Studio <bookings@ohdental.co.za>',
          to:      [normalEmail],
          subject: `Appointment confirmed — ${service.name} on ${date}`,
          html:    confirmationHtml({ firstName, service: service.name, date, time }),
        });

        // Practice alert
        await resend.emails.send({
          from:    'Booking System <bookings@ohdental.co.za>',
          to:      ['hello@ohdental.co.za'],
          subject: `New booking: ${firstName} ${lastName} — ${service.name} on ${date} at ${time}`,
          html:    practiceAlertHtml({ firstName, lastName, email: normalEmail, phone, service: service.name, date, time, notes }),
        });

        await db.from('appointments').update({ confirmation_sent: true }).eq('id', appt.id);
      } catch (emailErr) {
        // Non-fatal — booking is still created
        console.error('[bookings POST] email error', emailErr);
      }
    }

    return res.status(201).json({ success: true, appointmentId: appt.id });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

// ── Email templates ────────────────────────────────────────────

function confirmationHtml({ firstName, service, date, time }) {
  return `
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#2A3128">
      <div style="background:#F2EDE4;padding:40px 48px;border-radius:8px">
        <p style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#8A8478;margin:0 0 28px">OH Dental Studio</p>
        <h1 style="font-size:36px;font-weight:400;margin:0 0 8px;line-height:1.1">You're <em>booked</em>.</h1>
        <p style="color:#4C5347;margin:0 0 32px">Hi ${firstName} — here are your appointment details.</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:32px">
          <tr><td style="padding:12px 0;border-top:1px solid #D9D1C0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#8A8478;width:40%">Service</td><td style="padding:12px 0;border-top:1px solid #D9D1C0;font-weight:500">${service}</td></tr>
          <tr><td style="padding:12px 0;border-top:1px solid #D9D1C0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#8A8478">Date</td><td style="padding:12px 0;border-top:1px solid #D9D1C0;font-weight:500">${date}</td></tr>
          <tr><td style="padding:12px 0;border-top:1px solid #D9D1C0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#8A8478">Time</td><td style="padding:12px 0;border-top:1px solid #D9D1C0;font-weight:500">${time}</td></tr>
          <tr><td style="padding:12px 0;border-top:1px solid #D9D1C0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#8A8478">Address</td><td style="padding:12px 0;border-top:1px solid #D9D1C0">23 Voortrekker Road, Krugersdorp</td></tr>
        </table>
        <p style="font-size:13px;color:#4C5347">Need to reschedule? Call us on <strong>011 660 2400</strong> or reply to this email.</p>
        <p style="font-size:12px;color:#8A8478;margin-top:32px;padding-top:20px;border-top:1px solid #D9D1C0">Where the best smiles are made.</p>
      </div>
    </div>`;
}

function practiceAlertHtml({ firstName, lastName, email, phone, service, date, time, notes }) {
  return `
    <div style="font-family:monospace;max-width:480px;margin:0 auto;color:#1a1a1a">
      <p style="font-size:11px;color:#666;margin:0 0 16px">NEW BOOKING — OH DENTAL STUDIO</p>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px 0;border-top:1px solid #eee;font-size:11px;color:#666;width:35%">Name</td><td style="padding:8px 0;border-top:1px solid #eee">${firstName} ${lastName}</td></tr>
        <tr><td style="padding:8px 0;border-top:1px solid #eee;font-size:11px;color:#666">Email</td><td style="padding:8px 0;border-top:1px solid #eee">${email}</td></tr>
        <tr><td style="padding:8px 0;border-top:1px solid #eee;font-size:11px;color:#666">Phone</td><td style="padding:8px 0;border-top:1px solid #eee">${phone}</td></tr>
        <tr><td style="padding:8px 0;border-top:1px solid #eee;font-size:11px;color:#666">Service</td><td style="padding:8px 0;border-top:1px solid #eee">${service}</td></tr>
        <tr><td style="padding:8px 0;border-top:1px solid #eee;font-size:11px;color:#666">Date</td><td style="padding:8px 0;border-top:1px solid #eee">${date}</td></tr>
        <tr><td style="padding:8px 0;border-top:1px solid #eee;font-size:11px;color:#666">Time</td><td style="padding:8px 0;border-top:1px solid #eee">${time}</td></tr>
        ${notes ? `<tr><td style="padding:8px 0;border-top:1px solid #eee;font-size:11px;color:#666">Notes</td><td style="padding:8px 0;border-top:1px solid #eee">${notes}</td></tr>` : ''}
      </table>
    </div>`;
}
