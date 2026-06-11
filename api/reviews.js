'use strict';
/**
 * /api/reviews
 *
 * Reviews are stored in contact_submissions using:
 *   topic   = 'general'           (avoids needing migration 014)
 *   phone   = '__review__'        (sentinel — used to distinguish from real messages)
 *   message = JSON { _review:true, rating, text, treatment, would_recommend }
 *
 * POST { name?, email?, rating, text, treatment?, would_recommend? }
 *   → 201 { success, id }  Public (rate-limited).
 *
 * GET ?status=new|read&rating=1-5&page=1&limit=20
 *   → { reviews, total, page, limit, pages, avg_rating }  Auth required.
 *
 * PATCH ?id=UUID { status:'read'|'new' }
 *   → { success: true }  Auth required.
 *
 * POST ?action=chat { messages:[{role,content}], includeReviews?:bool }
 *   → { reply, model }  Auth required (staff JWT). Staff-only AI assistant —
 *     proxies to OpenRouter so the API key stays server-side. Folded in here
 *     (instead of its own /api/chat function) to stay under Vercel's Hobby-plan
 *     12-function-per-deployment limit.
 */
const { adminClient, cors, parseBody, PRACTICE_ID, requireAuth } = require('./_lib/supabase');
const { rateLimit } = require('./_lib/rateLimit');

const REVIEW_PHONE = '__review__'; // sentinel that distinguishes reviews from real contact msgs

// ── AI assistant config (OpenRouter) ─────────────────────────────────────────
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Free OpenRouter models, tried in order until one responds. Llama 3.3 70B is the
// verified default; the others cushion against free-tier rate limits (20 req/min).
// Override via OPENROUTER_MODEL (comma-separated). Confirm slugs at
// https://openrouter.ai/models?max_price=0 — free model availability changes over time.
const DEFAULT_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'google/gemini-2.0-flash-exp:free',
];

const MAX_TURNS         = 12;    // keep only the most recent turns (cost control)
const MAX_MESSAGE_CHARS = 4000;  // per-message cap
const MAX_REVIEWS       = 30;    // recent reviews injected as context

const SYSTEM_PROMPT = [
  'You are the Cliniq assistant — a helpful AI for the dental clinic\'s staff using',
  'their practice-management dashboard.',
  'You help with: general dentistry knowledge, South African dental practice admin,',
  'drafting messages and replies to patient reviews, and explaining how to use the',
  'dashboard. Answer clearly and concisely in English.',
  'Important: never invent patient-specific facts, names, appointments, or figures that',
  'you were not explicitly given. If you do not have the information, say so and suggest',
  'where in the dashboard to find it.',
].join(' ');

/** Build a compact digest of recent reviews to give the model real context. */
async function buildReviewContext(db) {
  const { data, error } = await db
    .from('contact_submissions')
    .select('message, created_at')
    .eq('practice_id', PRACTICE_ID)
    .eq('phone', REVIEW_PHONE)
    .order('created_at', { ascending: false })
    .limit(MAX_REVIEWS);

  if (error || !data || !data.length) return null;

  const lines = data.map(r => {
    let p = {};
    try { p = JSON.parse(r.message); } catch {}
    const date = r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '?';
    const rating = p.rating ? `${p.rating}/5` : 'n/a';
    const text = (p.text || '').replace(/\s+/g, ' ').trim();
    return `- [${date}] ${rating}: ${text}`;
  });

  return [
    `Here are the practice's ${lines.length} most recent patient reviews. Use them to`,
    'answer the staff member\'s question (summarise, find themes, draft replies). Do not',
    'fabricate reviews beyond this list.',
    '',
    ...lines,
  ].join('\n');
}

/** Staff-only AI assistant. Auth + rate limit already handled by the caller. */
async function handleChat(req, res, db) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('[chat] OPENROUTER_API_KEY is not set');
    return res.status(500).json({
      error: 'AI assistant is not configured. Please set OPENROUTER_API_KEY.',
    });
  }

  const body = await parseBody(req);
  const rawMessages = Array.isArray(body.messages) ? body.messages : null;
  if (!rawMessages || !rawMessages.length) {
    return res.status(400).json({ error: 'messages must be a non-empty array' });
  }

  // Sanitise + trim conversation history.
  const turns = rawMessages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_TURNS)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));

  if (!turns.length) {
    return res.status(400).json({ error: 'No valid messages provided' });
  }

  // Assemble the system context.
  let systemContent = SYSTEM_PROMPT;
  if (body.includeReviews) {
    try {
      const reviewCtx = await buildReviewContext(db);
      if (reviewCtx) systemContent += '\n\n' + reviewCtx;
    } catch (e) {
      console.error('[chat] review context fetch failed', e);
      // Non-fatal — continue without review context.
    }
  }

  const messages = [{ role: 'system', content: systemContent }, ...turns];

  // Resolve model fallback chain.
  const models = (process.env.OPENROUTER_MODEL || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const modelChain = models.length ? models : DEFAULT_MODELS;

  const referer = req.headers.origin || 'https://ohdental.co.za';

  let lastErr = null;
  for (const model of modelChain) {
    try {
      const resp = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': referer,
          'X-Title': 'Cliniq',
        },
        body: JSON.stringify({ model, messages }),
      });

      if (!resp.ok) {
        // 429 (rate limited) or 5xx — try the next model in the chain.
        const errText = await resp.text().catch(() => '');
        console.error(`[chat] ${model} → ${resp.status} ${errText.slice(0, 300)}`);
        lastErr = `Model ${model} returned ${resp.status}`;
        continue;
      }

      const data = await resp.json();
      const reply = data?.choices?.[0]?.message?.content?.trim();
      if (!reply) {
        console.error(`[chat] ${model} → empty reply`, JSON.stringify(data).slice(0, 300));
        lastErr = `Model ${model} returned an empty reply`;
        continue;
      }

      return res.status(200).json({ reply, model });
    } catch (e) {
      console.error(`[chat] ${model} request failed`, e);
      lastErr = e.message;
      // try next model
    }
  }

  console.error('[chat] all models failed:', lastErr);
  return res.status(503).json({
    error: 'The AI assistant is busy right now. Please try again in a moment.',
  });
}

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;
  const db = adminClient();

  // ── GET — admin reviews list ────────────────────────────────────────
  if (req.method === 'GET') {
    const user = await requireAuth(req, res);
    if (!user) return;

    const page  = Math.max(1, parseInt(req.query.page  || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    let q = db
      .from('contact_submissions')
      .select('id, name, email, message, status, created_at', { count: 'exact' })
      .eq('practice_id', PRACTICE_ID)
      .eq('phone', REVIEW_PHONE)        // sentinel filter — only review rows
      .order('created_at', { ascending: false })
      .range(from, to);

    if (req.query.status && ['new', 'read'].includes(req.query.status)) {
      q = q.eq('status', req.query.status);
    }

    const { data, error, count } = await q;
    if (error) {
      console.error('[reviews GET]', error);
      return res.status(500).json({ error: 'Could not retrieve reviews' });
    }

    const reviews = (data || []).map(r => {
      let parsed = {};
      try { parsed = JSON.parse(r.message); } catch {}
      return { id: r.id, name: r.name, email: r.email, status: r.status, created_at: r.created_at, ...parsed };
    });

    const ratingFilter = req.query.rating ? parseInt(req.query.rating, 10) : null;
    const filtered = ratingFilter ? reviews.filter(r => r.rating === ratingFilter) : reviews;

    const withRating = filtered.filter(r => r.rating > 0);
    const avg_rating = withRating.length
      ? (withRating.reduce((s, r) => s + r.rating, 0) / withRating.length).toFixed(1)
      : null;

    return res.status(200).json({ reviews: filtered, total: count || 0, page, limit,
      pages: Math.ceil((count || 0) / limit), avg_rating });
  }

  // ── PATCH — mark status ──────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const body = await parseBody(req);
    const { status } = body;
    if (!['new', 'read'].includes(status)) {
      return res.status(400).json({ error: 'status must be new or read' });
    }

    const { error } = await db
      .from('contact_submissions')
      .update({ status })
      .eq('id', id)
      .eq('practice_id', PRACTICE_ID)
      .eq('phone', REVIEW_PHONE);      // safety — only update review rows

    if (error) {
      console.error('[reviews PATCH]', error);
      return res.status(500).json({ error: 'Could not update review' });
    }
    return res.status(200).json({ success: true });
  }

  // ── POST ?action=chat — staff-only AI assistant ─────────────────────
  if (req.method === 'POST' && req.query.action === 'chat') {
    const user = await requireAuth(req, res);
    if (!user) return;
    // Match OpenRouter's free-tier ceiling (20 req/min) per IP.
    if (rateLimit(req, res, 20, 60_000)) return;
    return handleChat(req, res, db);
  }

  // ── POST — public review submission ─────────────────────────────────
  if (req.method === 'POST') {
    if (rateLimit(req, res)) return;

    const body = await parseBody(req);
    const { name = null, email = null, rating, text, treatment = null, would_recommend = null } = body;

    const r = Number(rating);
    if (!r || r < 1 || r > 5) {
      return res.status(400).json({ error: 'Please select a star rating (1 to 5 stars)' });
    }
    if (!text?.trim() || text.trim().length < 5) {
      return res.status(400).json({ error: 'Please write at least a few words about your visit' });
    }
    if (text.trim().length > 2000) {
      return res.status(400).json({ error: 'Review is too long (max 2000 characters)' });
    }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    const { data: sub, error: dbErr } = await db
      .from('contact_submissions')
      .insert({
        practice_id: PRACTICE_ID,
        name:    name?.trim()              || 'Anonymous',       // NOT NULL
        email:   email?.toLowerCase().trim() || 'review@anonymous.local', // NOT NULL
        phone:   REVIEW_PHONE,             // sentinel — marks this as a review
        topic:   'general',                // use allowed topic; phone sentinel identifies it
        message: JSON.stringify({
          _review:         true,           // additional safety marker
          rating:          r,
          text:            text.trim(),
          treatment:       treatment?.trim() || null,
          would_recommend: would_recommend !== null ? Boolean(would_recommend) : null,
        }),
        status: 'new',
      })
      .select('id')
      .single();

    if (dbErr) {
      console.error('[reviews POST]', dbErr);
      return res.status(500).json({ error: 'Could not save your review. Please try again.' });
    }

    return res.status(201).json({ success: true, id: sub.id });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
