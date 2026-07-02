'use strict';
/**
 * POST /api/notify
 *
 * Internal webhook endpoint called by Supabase pg_net triggers:
 *   - type: 'new_patient'  → fires on INSERT into patients
 *   - type: 'payment'      → fires on UPDATE to treatment_plan_sessions where amount_paid increases
 *
 * Fetches all staff Expo push tokens for the practice and sends a batch
 * push notification via the Expo push API.
 *
 * Security: caller must supply x-webhook-secret header matching NOTIFY_SECRET env var.
 * The migration (025_push_notify_triggers.sql) sets this secret in the DB trigger.
 *
 * POST /api/notify?action=save-token  { token: "ExponentPushToken[xxx]" }
 *
 * Saves the Expo push token for the authenticated staff member (mobile app,
 * called on login). Staff-authed via requireStaff — separate from the
 * webhook-secret path above. Folded in here to stay under Vercel's
 * Hobby-plan 12-function cap.
 *
 * GET  /api/notify?action=ai-ask                    → { used, limit, remaining }
 * POST /api/notify?action=ai-ask  { question }      → { answer, used, limit, remaining }
 *
 * AI clinical reference assistant for the mobile app (was /api/ai-ask). Staff-authed
 * via requireStaff, rate-limited per practice. Also folded in here to stay under the
 * Hobby-plan 12-function cap. Required env var: ANTHROPIC_API_KEY.
 */
const { adminClient, cors, parseBody, PRACTICE_ID, requireStaff } = require('./_lib/supabase');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Constant-time string comparison — a plain !== leaks the matching prefix
// length through response timing.
const { timingSafeEqual } = require('crypto');
function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// ── AI clinical assistant config (was api/ai-ask.js) ─────────────────
const AI_RATE_LIMIT = 10;                          // requests per rolling hour
const AI_MODEL      = 'claude-3-5-haiku-20241022'; // cheapest capable Claude model
const AI_MAX_TOKENS = 600;                          // keep answers concise → cheaper

const AI_SYSTEM_PROMPT = `
You are a concise clinical reference assistant for dental professionals in South Africa.

You help with:
- Dental procedures and techniques (fillings, extractions, root canals, crowns, implants)
- Local anaesthetic dosages and pharmacology (lidocaine, articaine, mepivacaine, bupivacaine)
- Drug interactions relevant to dentistry
- Management of medically complex patients (anticoagulants, diabetes, cardiac conditions, hypertension)
- Antibiotic prophylaxis guidelines (e.g. SADA / AHA protocols)
- Infection control and sterilisation protocols
- Dental materials and their clinical applications
- Emergency management in a dental setting (syncope, anaphylaxis, angina)
- Clinical guidelines and best practices (SADA, BDA, ADA)

Response style:
- Lead immediately with the key answer — no preamble or "Great question!"
- 2–4 sentences for simple queries; a short numbered/bullet list for complex ones
- Mark safety-critical warnings with ⚠️
- End with a one-line note to verify against current guidelines when relevant

Do not: diagnose individual patients, give legal or billing/medical-aid-claim advice, or speculate beyond dental/medical scope.
`.trim();

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  // ── Action: AI clinical assistant (GET usage / POST ask) ─────
  // Checked before the POST-only guard because the usage check is a GET.
  if (req.query.action === 'ai-ask') return aiAsk(req, res);

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Action: save a staff push token (mobile app, staff-authed) ──
  if (req.query.action === 'save-token') return saveToken(req, res);

  // ── Auth: validate webhook secret (constant-time comparison) ──
  const secret   = process.env.NOTIFY_SECRET;
  const incoming = req.headers['x-webhook-secret'];
  if (!secret || typeof incoming !== 'string' || !safeEqual(incoming, secret)) {
    console.warn('[notify] rejected — bad or missing webhook secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = await parseBody(req);
  const { type, data = {} } = body;

  // ── Build notification content ────────────────────────────────
  let title, notifBody;

  if (type === 'new_patient') {
    title      = 'New patient registered';
    notifBody  = data.name
      ? `${data.name} has just completed their intake form.`
      : 'A new patient has registered.';
  } else if (type === 'payment') {
    title      = 'Payment received';
    notifBody  = data.name && data.amount
      ? `R${data.amount} received from ${data.name}.`
      : data.name
        ? `Payment received from ${data.name}.`
        : 'A payment has been recorded.';
  } else {
    return res.status(400).json({ error: `Unknown notification type: ${type}` });
  }

  // ── Fetch all staff push tokens ───────────────────────────────
  const db = adminClient();
  const { data: staff, error: staffErr } = await db
    .from('staff')
    .select('expo_push_token')
    .eq('practice_id', PRACTICE_ID)
    .not('expo_push_token', 'is', null);

  if (staffErr) {
    console.error('[notify] staff fetch error:', staffErr);
    return res.status(500).json({ error: 'Could not fetch staff tokens' });
  }

  const tokens = (staff ?? [])
    .map(s => s.expo_push_token)
    .filter(t => typeof t === 'string' && t.startsWith('ExponentPushToken'));

  if (!tokens.length) {
    return res.status(200).json({ sent: 0, message: 'No push tokens registered' });
  }

  // ── Send via Expo push service ────────────────────────────────
  // Only forward the specific data fields we expect — never spread the raw
  // webhook body into the push payload, as the caller controls that object.
  const safeData = { type };
  if (typeof data.name   === 'string') safeData.name   = data.name.slice(0, 100);
  if (typeof data.amount === 'number') safeData.amount = data.amount;

  const messages = tokens.map(to => ({
    to,
    title,
    body:     notifBody,
    data:     safeData,
    sound:    'default',
    priority: 'high',
  }));

  try {
    const pushRes  = await fetch(EXPO_PUSH_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify(messages),
    });
    const pushData = await pushRes.json();
    console.log('[notify] push sent to', tokens.length, 'device(s):', JSON.stringify(pushData));
    return res.status(200).json({ sent: tokens.length });
  } catch (e) {
    console.error('[notify] push delivery error:', e);
    return res.status(500).json({ error: 'Push delivery failed' });
  }
};

// ── Save a staff member's Expo push token (was POST /api/push-token) ──
async function saveToken(req, res) {
  const user = await requireStaff(req, res);
  if (!user) return;

  const { token } = await parseBody(req);
  if (!token || typeof token !== 'string' || !token.startsWith('ExponentPushToken')) {
    return res.status(400).json({ error: 'Invalid push token' });
  }

  const db = adminClient();
  // Key on the staff row id resolved by requireStaff — more reliable than
  // matching by email, which can differ in case or be changed in Auth.
  const { error } = await db
    .from('staff')
    .update({ expo_push_token: token })
    .eq('practice_id', PRACTICE_ID)
    .eq('id', user.staffId);

  if (error) {
    console.error('[notify save-token]', error);
    return res.status(500).json({ error: 'Could not save push token' });
  }

  return res.status(200).json({ success: true });
}

// ── AI clinical reference assistant (was GET/POST /api/ai-ask) ──────
async function aiAskUsage(db) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await db
    .from('ai_requests')
    .select('id', { count: 'exact', head: true })
    .eq('practice_id', PRACTICE_ID)
    .gte('created_at', oneHourAgo);

  if (error) {
    console.error('[ai-ask] usage check error:', error);
    return { used: 0, limit: AI_RATE_LIMIT, remaining: AI_RATE_LIMIT };
  }

  const used = count ?? 0;
  return { used, limit: AI_RATE_LIMIT, remaining: Math.max(0, AI_RATE_LIMIT - used) };
}

async function aiAsk(req, res) {
  const user = await requireStaff(req, res);
  if (!user) return;

  const db = adminClient();

  // ── GET — return current hourly usage ────────────────────────
  if (req.method === 'GET') {
    const usage = await aiAskUsage(db);
    return res.status(200).json(usage);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── POST — ask the AI ─────────────────────────────────────────
  const { question } = await parseBody(req);

  if (!question?.trim()) {
    return res.status(400).json({ error: 'question is required' });
  }
  if (question.trim().length > 1500) {
    return res.status(400).json({ error: 'Question too long (max 1500 characters)' });
  }

  // Rate limit check (before we log the request)
  const usage = await aiAskUsage(db);
  if (usage.remaining <= 0) {
    return res.status(429).json({
      error: `Rate limit reached: ${AI_RATE_LIMIT} AI requests per hour. Please try again later.`,
      ...usage,
    });
  }

  // Log request BEFORE calling the AI — prevents parallel-request abuse
  const { error: logErr } = await db
    .from('ai_requests')
    .insert({ practice_id: PRACTICE_ID });

  if (logErr) {
    console.error('[ai-ask] failed to log request:', logErr);
    // Continue anyway — a logging failure shouldn't block the doctor
  }

  // Background cleanup: delete records older than 2 hours to keep table small
  db.from('ai_requests')
    .delete()
    .lt('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
    .then(() => {})
    .catch(() => {});

  // ── Call Anthropic API ────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[ai-ask] ANTHROPIC_API_KEY is not set in Vercel env vars');
    return res.status(500).json({
      error: 'AI service not configured. Add ANTHROPIC_API_KEY to your Vercel environment variables.',
    });
  }

  try {
    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      AI_MODEL,
        max_tokens: AI_MAX_TOKENS,
        system:     AI_SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: question.trim() }],
      }),
    });

    if (!aiResponse.ok) {
      const errBody = await aiResponse.json().catch(() => ({}));
      console.error('[ai-ask] Anthropic API error:', aiResponse.status, errBody);
      return res.status(502).json({ error: 'AI service temporarily unavailable. Please try again.' });
    }

    const aiData  = await aiResponse.json();
    const answer  = aiData.content?.[0]?.text ?? 'No response received.';
    const inTok   = aiData.usage?.input_tokens  ?? 0;
    const outTok  = aiData.usage?.output_tokens ?? 0;

    console.log(`[ai-ask] tokens: in=${inTok} out=${outTok} q_len=${question.trim().length}`);

    return res.status(200).json({
      answer,
      used:      usage.used + 1,
      limit:     AI_RATE_LIMIT,
      remaining: usage.remaining - 1,
    });

  } catch (err) {
    console.error('[ai-ask] fetch error:', err);
    return res.status(502).json({ error: 'Could not reach AI service. Check your internet connection.' });
  }
}
