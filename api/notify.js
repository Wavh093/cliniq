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
 * called on login). Staff-authed via requireAuth — separate from the
 * webhook-secret path above. Folded in here to stay under Vercel's
 * Hobby-plan 12-function cap.
 */
const { adminClient, cors, parseBody, PRACTICE_ID, requireAuth } = require('./_lib/supabase');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Action: save a staff push token (mobile app, staff-authed) ──
  if (req.query.action === 'save-token') return saveToken(req, res);

  // ── Auth: validate webhook secret ────────────────────────────
  const secret   = process.env.NOTIFY_SECRET;
  const incoming = req.headers['x-webhook-secret'];
  if (!secret || incoming !== secret) {
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
  const messages = tokens.map(to => ({
    to,
    title,
    body:     notifBody,
    data:     { type, ...data },
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
  const user = await requireAuth(req, res);
  if (!user) return;

  const { token } = await parseBody(req);
  if (!token || typeof token !== 'string' || !token.startsWith('ExponentPushToken')) {
    return res.status(400).json({ error: 'Invalid push token' });
  }

  const db = adminClient();
  const { error } = await db
    .from('staff')
    .update({ expo_push_token: token })
    .eq('practice_id', PRACTICE_ID)
    .eq('email', user.email);

  if (error) {
    console.error('[notify save-token]', error);
    return res.status(500).json({ error: 'Could not save push token' });
  }

  return res.status(200).json({ success: true });
}
