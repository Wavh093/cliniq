'use strict';
/**
 * /api/ai-ask
 *
 * AI clinical reference assistant for dental professionals.
 * Backed by Claude 3.5 Haiku — low cost, fast, medically capable.
 *
 * GET              → { used, limit, remaining }      — current hourly usage
 * POST { question } → { answer, used, limit, remaining }
 *
 * Rate-limited to RATE_LIMIT requests per rolling hour per practice.
 * Rate-limit state is persisted in the ai_requests table (migration 026).
 *
 * Required Vercel env var: ANTHROPIC_API_KEY
 */
const { adminClient, cors, parseBody, PRACTICE_ID, requireAuth } = require('./_lib/supabase');

const RATE_LIMIT = 10;                          // requests per rolling hour
const MODEL      = 'claude-3-5-haiku-20241022'; // cheapest capable Claude model
const MAX_TOKENS = 600;                         // keep answers concise → cheaper

const SYSTEM_PROMPT = `
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

// ── Helpers ────────────────────────────────────────────────────────

async function getUsage(db) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await db
    .from('ai_requests')
    .select('id', { count: 'exact', head: true })
    .eq('practice_id', PRACTICE_ID)
    .gte('created_at', oneHourAgo);

  if (error) {
    console.error('[ai-ask] usage check error:', error);
    return { used: 0, limit: RATE_LIMIT, remaining: RATE_LIMIT };
  }

  const used = count ?? 0;
  return { used, limit: RATE_LIMIT, remaining: Math.max(0, RATE_LIMIT - used) };
}

// ── Handler ────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const db = adminClient();

  // ── GET — return current hourly usage ────────────────────────
  if (req.method === 'GET') {
    const usage = await getUsage(db);
    return res.status(200).json(usage);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── POST — ask the AI ─────────────────────────────────────────
  const body = await parseBody(req);
  const { question } = body;

  if (!question?.trim()) {
    return res.status(400).json({ error: 'question is required' });
  }
  if (question.trim().length > 1500) {
    return res.status(400).json({ error: 'Question too long (max 1500 characters)' });
  }

  // Rate limit check (before we log the request)
  const usage = await getUsage(db);
  if (usage.remaining <= 0) {
    return res.status(429).json({
      error: `Rate limit reached: ${RATE_LIMIT} AI requests per hour. Please try again later.`,
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
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        system:     SYSTEM_PROMPT,
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
      limit:     RATE_LIMIT,
      remaining: usage.remaining - 1,
    });

  } catch (err) {
    console.error('[ai-ask] fetch error:', err);
    return res.status(502).json({ error: 'Could not reach AI service. Check your internet connection.' });
  }
};
