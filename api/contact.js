'use strict';
/**
 * /api/contact
 *
 * POST { name, email, phone?, topic, message }
 *   → 201 { success: true }
 *   Public — stores submission, emails practice + auto-replies.
 *
 * GET ?status=new|read|archived&page=1&limit=20
 *   → { submissions, total, page, limit, pages }
 *   Auth required (staff JWT).
 *
 * PATCH ?id=UUID { status: 'read'|'archived'|'new' }
 *   → { success: true }
 *   Auth required.
 */
const { adminClient, cors, parseBody, PRACTICE_ID, requireStaff } = require('./_lib/supabase');
const { rateLimit } = require('./_lib/rateLimit');

const VALID_TOPICS  = ['general', 'appointment', 'cosmetic', 'emergency', 'medical'];
const VALID_STATUSES = ['new', 'read', 'archived'];

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const db = adminClient();

  // ── GET — admin inbox ──────────────────────────────────────────
  if (req.method === 'GET') {
    const user = await requireStaff(req, res);
    if (!user) return;

    const page   = Math.max(1, parseInt(req.query.page  || '1', 10));
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const from   = (page - 1) * limit;
    const to     = from + limit - 1;
    const status = req.query.status;

    let q = db
      .from('contact_submissions')
      .select('id, name, email, phone, topic, message, status, created_at', { count: 'exact' })
      .eq('practice_id', PRACTICE_ID)
      .neq('topic', 'review')          // old sentinel (kept for safety)
      .or('phone.is.null,phone.neq.__review__')  // exclude review rows stored with sentinel phone
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status && VALID_STATUSES.includes(status)) {
      q = q.eq('status', status);
    }

    const { data, error, count } = await q;
    if (error) {
      console.error('[contact GET]', error);
      return res.status(500).json({ error: 'Could not retrieve submissions' });
    }

    return res.status(200).json({
      submissions: data || [],
      total: count || 0,
      page,
      limit,
      pages: Math.ceil((count || 0) / limit),
    });
  }

  // ── PATCH — mark status ────────────────────────────────────────
  if (req.method === 'PATCH') {
    const user = await requireStaff(req, res);
    if (!user) return;

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const body = await parseBody(req);
    const { status } = body;
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const { error } = await db
      .from('contact_submissions')
      .update({ status })
      .eq('id', id)
      .eq('practice_id', PRACTICE_ID);

    if (error) {
      console.error('[contact PATCH]', error);
      return res.status(500).json({ error: 'Could not update submission' });
    }
    return res.status(200).json({ success: true });
  }

  // ── POST — public contact form ─────────────────────────────────
  if (req.method === 'POST') {
    if (rateLimit(req, res)) return;

    const body = await parseBody(req);
    const { name, email, phone = null, topic = 'general', message } = body;

    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return res.status(400).json({ error: 'name, email and message are required' });
    }
    if (typeof name !== 'string' || name.trim().length > 100) {
      return res.status(400).json({ error: 'name must be a string (max 100 characters)' });
    }
    if (typeof email !== 'string' || email.length > 254) {
      return res.status(400).json({ error: 'email must be a string (max 254 characters)' });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (phone !== null && (typeof phone !== 'string' || phone.length > 30)) {
      return res.status(400).json({ error: 'phone must be a string (max 30 characters)' });
    }
    if (!VALID_TOPICS.includes(topic)) {
      return res.status(400).json({ error: `topic must be one of: ${VALID_TOPICS.join(', ')}` });
    }
    if (typeof message !== 'string' || message.trim().length > 5000) {
      return res.status(400).json({ error: 'message must be a string (max 5000 characters)' });
    }
    if (message.trim().length < 10) {
      return res.status(400).json({ error: 'Message is too short' });
    }

    const { data: submission, error: dbErr } = await db
      .from('contact_submissions')
      .insert({
        practice_id: PRACTICE_ID,
        name:        name.trim(),
        email:       email.toLowerCase().trim(),
        phone:       phone?.trim() || null,
        topic,
        message:     message.trim(),
        status:      'new',
      })
      .select('id')
      .single();

    if (dbErr) {
      console.error('[contact POST] db insert', dbErr);
      return res.status(500).json({ error: 'Could not save your message' });
    }

    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from:    'Contact Form <hello@ohdental.co.za>',
          to:      ['hello@ohdental.co.za'],
          subject: `New message from ${name} — ${topicLabel(topic)}`,
          html:    practiceAlertHtml({ name, email, phone, topic, message }),
        });
        await resend.emails.send({
          from:    'OH Dental Studio <hello@ohdental.co.za>',
          to:      [email.toLowerCase().trim()],
          subject: 'We received your message',
          html:    autoReplyHtml({ name }),
        });
      } catch (emailErr) {
        console.error('[contact POST] email error', emailErr);
      }
    }

    return res.status(201).json({ success: true, id: submission.id });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

/** Escape user input before embedding in HTML email bodies. */
function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function topicLabel(topic) {
  const map = {
    general:     'General question',
    appointment: 'Appointment enquiry',
    cosmetic:    'Cosmetic consult',
    emergency:   'Dental emergency',
    medical:     'Medical aid / billing',
  };
  return map[topic] || topic;
}

function practiceAlertHtml({ name, email, phone, topic, message }) {
  // All user input MUST be escaped — XSS in email HTML can execute in some clients.
  const n = escapeHtml(name);
  const e = escapeHtml(email);
  const p = phone ? escapeHtml(phone) : null;
  const m = escapeHtml(message);
  const t = escapeHtml(topicLabel(topic));
  return `
    <div style="font-family:monospace;max-width:480px;margin:0 auto;color:#1a1a1a">
      <p style="font-size:11px;color:#666;margin:0 0 16px">NEW CONTACT FORM — OH DENTAL STUDIO</p>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px 0;border-top:1px solid #eee;font-size:11px;color:#666;width:30%">From</td><td style="padding:8px 0;border-top:1px solid #eee">${n}</td></tr>
        <tr><td style="padding:8px 0;border-top:1px solid #eee;font-size:11px;color:#666">Email</td><td style="padding:8px 0;border-top:1px solid #eee"><a href="mailto:${e}">${e}</a></td></tr>
        ${p ? `<tr><td style="padding:8px 0;border-top:1px solid #eee;font-size:11px;color:#666">Phone</td><td style="padding:8px 0;border-top:1px solid #eee">${p}</td></tr>` : ''}
        <tr><td style="padding:8px 0;border-top:1px solid #eee;font-size:11px;color:#666">Topic</td><td style="padding:8px 0;border-top:1px solid #eee">${t}</td></tr>
        <tr><td style="padding:8px 0;border-top:1px solid #eee;font-size:11px;color:#666;vertical-align:top">Message</td><td style="padding:8px 0;border-top:1px solid #eee;white-space:pre-wrap">${m}</td></tr>
      </table>
    </div>`;
}

function autoReplyHtml({ name }) {
  const n = escapeHtml(name);
  return `
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#2A3128">
      <div style="background:#F2EDE4;padding:40px 48px;border-radius:8px">
        <p style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#8A8478;margin:0 0 28px">OH Dental Studio</p>
        <h1 style="font-size:32px;font-weight:400;margin:0 0 16px">Thanks, ${n}.</h1>
        <p style="color:#4C5347;margin:0 0 16px">Your message is on its way. We read every one ourselves and reply within one working day.</p>
        <p style="color:#4C5347;margin:0 0 32px">If it's urgent, call us on <strong>011 660 2400</strong> (Mon–Fri 08:00–17:00, Sat 09:00–13:00).</p>
        <p style="font-size:12px;color:#8A8478;margin:0;padding-top:20px;border-top:1px solid #D9D1C0">Where the best smiles are made.</p>
      </div>
    </div>`;
}
