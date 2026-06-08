'use strict';
/**
 * POST /api/push-token  { token: "ExponentPushToken[xxx]" }
 * Saves the Expo push token for the authenticated staff member.
 * Used by the mobile app on login to enable push notifications.
 */
const { adminClient, cors, parseBody, PRACTICE_ID, requireAuth } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
    console.error('[push-token POST]', error);
    return res.status(500).json({ error: 'Could not save push token' });
  }

  return res.status(200).json({ success: true });
};
