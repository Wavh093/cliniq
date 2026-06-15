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
 * POST ?action=chat { messages:[{role,content}] }
 *   → { reply }  Auth required (staff JWT). Staff-only operational assistant —
 *     proxies to Google Gemini (key stays server-side) with Google Search
 *     grounding for web look-ups. The model is given ONLY aggregate clinic stats
 *     (today's appointment counts, new/existing patient counts, review summary) —
 *     never individual patient rows — so it cannot leak PII. Folded in here
 *     (instead of its own /api/chat function) to stay under Vercel's Hobby-plan
 *     12-function-per-deployment limit.
 */
const { adminClient, cors, parseBody, PRACTICE_ID, requireAuth } = require('./_lib/supabase');
const { rateLimit } = require('./_lib/rateLimit');

const REVIEW_PHONE = '__review__'; // sentinel that distinguishes reviews from real contact msgs

// ── AI assistant config (Google Gemini) ──────────────────────────────────────
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL   = m => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;

const MAX_TURNS         = 12;    // keep only the most recent turns (cost control)
const MAX_MESSAGE_CHARS = 4000;  // per-message cap
const MAX_REVIEWS       = 30;    // recent reviews summarised as context

const SYSTEM_PROMPT = [
  'You are Klara, the front-desk assistant for this dental practice, used by clinic staff',
  'inside their practice-management dashboard. Answer clearly and concisely in English; keep',
  'replies short and to the point.',
  '',
  'You can help with two things:',
  '1. Quick operational stats about the clinic — use ONLY the "CLINIC STATS" block provided',
  '   below in this prompt. Never invent numbers. If a figure is not in that block (for example',
  '   reschedules, which are not tracked), say it is not tracked rather than guessing.',
  '2. General or external information — you have a Google Search tool; use it for things like',
  '   clinical guidelines, product info, or anything not specific to this clinic.',
  '',
  'STRICT PRIVACY RULE: never reveal, guess, or look up any individual patient\'s name, phone,',
  'email, ID number, address, medical history, or payment details. You are only ever given',
  'aggregate counts — no patient records — so you cannot do this. If asked about a specific',
  'person, or to list/export/identify individual patients, politely decline and tell the staff',
  'member to open the Patients page in the dashboard.',
].join('\n');

/** Current instant shifted to the practice timezone (SAST, UTC+2). The UTC
 *  fields of the returned Date read as SAST wall-clock, so getUTCDay/getUTCDate
 *  and toISOString().slice(0,10) all reflect the practice's local day. */
function practiceNow() {
  return new Date(Date.now() + 2 * 60 * 60 * 1000);
}

/** Today's date in the practice timezone (SAST, UTC+2) as YYYY-MM-DD. */
function practiceToday() {
  return practiceNow().toISOString().slice(0, 10);
}

/**
 * Build the aggregate "CLINIC STATS" context block injected into every chat.
 * COUNTS ONLY — no names or other personal identifiers ever leave the database here.
 */
async function buildOpsSnapshot(db) {
  const today = practiceToday();
  const parts = [];

  // ── Today's appointments by status ──
  try {
    const { data: appts } = await db
      .from('appointments')
      .select('status')
      .eq('practice_id', PRACTICE_ID)
      .eq('appointment_date', today)
      .is('deleted_at', null)
      .limit(2000);
    const c = { pending: 0, confirmed: 0, completed: 0, cancelled: 0, no_show: 0 };
    for (const a of (appts || [])) if (a.status in c) c[a.status]++;
    parts.push(
      `Today (${today}) appointments:`,
      `- expected/booked today: ${c.pending + c.confirmed + c.completed}`,
      `- shown up (completed): ${c.completed}`,
      `- still scheduled (pending or confirmed): ${c.pending + c.confirmed}`,
      `- no-shows: ${c.no_show}`,
      `- cancelled: ${c.cancelled}`,
      `- reschedules: NOT tracked separately`,
    );
  } catch (e) { console.error('[ops] appointments', e); }

  // ── This week's appointments (Mon–Sun, practice tz) ──
  try {
    const now = practiceNow();
    const dow = now.getUTCDay();                          // 0=Sun … 6=Sat (already SAST)
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const weekStart = monday.toISOString().slice(0, 10);
    const weekEnd   = sunday.toISOString().slice(0, 10);

    const { data: wk } = await db
      .from('appointments')
      .select('status')
      .eq('practice_id', PRACTICE_ID)
      .gte('appointment_date', weekStart)
      .lte('appointment_date', weekEnd)
      .is('deleted_at', null)
      .limit(5000);
    const c = { pending: 0, confirmed: 0, completed: 0, cancelled: 0, no_show: 0 };
    for (const a of (wk || [])) if (a.status in c) c[a.status]++;
    parts.push(
      '',
      `This week (${weekStart} to ${weekEnd}) appointments:`,
      `- booked this week (excl. cancelled): ${c.pending + c.confirmed + c.completed}`,
      `- completed so far: ${c.completed}`,
      `- still upcoming (pending or confirmed): ${c.pending + c.confirmed}`,
      `- no-shows: ${c.no_show}`,
      `- cancelled: ${c.cancelled}`,
    );
  } catch (e) { console.error('[ops] week appointments', e); }

  // ── New vs existing patients ──
  try {
    const [total, newType, newToday] = await Promise.all([
      db.from('patients').select('id', { count: 'exact', head: true })
        .eq('practice_id', PRACTICE_ID).is('deleted_at', null),
      db.from('patients').select('id', { count: 'exact', head: true })
        .eq('practice_id', PRACTICE_ID).is('deleted_at', null).eq('patient_type', 'new'),
      db.from('patients').select('id', { count: 'exact', head: true })
        .eq('practice_id', PRACTICE_ID).is('deleted_at', null).gte('created_at', today),
    ]);
    const tot = total.count || 0, nw = newType.count || 0;
    parts.push(
      '',
      'Patients:',
      `- total patients: ${tot}`,
      `- marked "new": ${nw}`,
      `- marked "existing": ${Math.max(0, tot - nw)}`,
      `- registered today: ${newToday.count || 0}`,
    );
  } catch (e) { console.error('[ops] patients', e); }

  // ── Reviews summary + recent anonymous snippets ──
  try {
    const { data: revs } = await db
      .from('contact_submissions')
      .select('message, created_at')
      .eq('practice_id', PRACTICE_ID)
      .eq('phone', REVIEW_PHONE)
      .order('created_at', { ascending: false })
      .limit(MAX_REVIEWS);

    const parsed = (revs || []).map(r => {
      let p = {}; try { p = JSON.parse(r.message); } catch {}
      return {
        rating: Number(p.rating) || 0,
        text:   (p.text || '').replace(/\s+/g, ' ').trim(),
        date:   r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '?',
      };
    });
    const rated = parsed.filter(r => r.rating > 0);
    const avg   = rated.length ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1) : 'n/a';
    parts.push(
      '',
      `Reviews (latest ${parsed.length}):`,
      `- average rating: ${avg}/5`,
      `- good (4-5 stars): ${rated.filter(r => r.rating >= 4).length}`,
      `- neutral (3 stars): ${rated.filter(r => r.rating === 3).length}`,
      `- bad (1-2 stars): ${rated.filter(r => r.rating <= 2).length}`,
    );
    const snippets = parsed.filter(r => r.text).slice(0, 8);
    if (snippets.length) {
      parts.push('Recent review comments (anonymous — never attribute to a named person):');
      for (const r of snippets) parts.push(`- [${r.date}] ${r.rating || '?'} stars: ${r.text.slice(0, 240)}`);
    }
  } catch (e) { console.error('[ops] reviews', e); }

  if (!parts.length) return null;
  return 'CLINIC STATS (the only clinic-specific data you may use):\n' + parts.join('\n');
}

/** Staff-only operational assistant (Gemini). Auth + rate limit handled by the caller. */
async function handleChat(req, res, db) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[chat] GEMINI_API_KEY is not set');
    return res.status(500).json({
      error: 'AI assistant is not configured. Please set GEMINI_API_KEY.',
    });
  }

  const body = await parseBody(req);
  const rawMessages = Array.isArray(body.messages) ? body.messages : null;
  if (!rawMessages || !rawMessages.length) {
    return res.status(400).json({ error: 'messages must be a non-empty array' });
  }

  // Sanitise + trim conversation history, mapped to Gemini's `contents` format.
  const contents = rawMessages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_TURNS)
    .map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content.slice(0, MAX_MESSAGE_CHARS) }],
    }));

  if (!contents.length) {
    return res.status(400).json({ error: 'No valid messages provided' });
  }

  // System instruction = guardrails + aggregate clinic stats (counts only, no PII).
  let systemText = SYSTEM_PROMPT;
  try {
    const ops = await buildOpsSnapshot(db);
    if (ops) systemText += '\n\n' + ops;
  } catch (e) {
    console.error('[chat] ops snapshot failed', e); // non-fatal — answer without stats
  }

  try {
    const resp = await fetch(`${GEMINI_URL(GEMINI_MODEL)}?key=${encodeURIComponent(apiKey)}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents,
        tools: [{ google_search: {} }],          // web-search grounding
        generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error(`[chat] Gemini ${resp.status} ${errText.slice(0, 400)}`);
      return res.status(503).json({ error: 'The AI assistant is busy right now. Please try again in a moment.' });
    }

    const data = await resp.json();
    const cand = data?.candidates?.[0];
    let reply = (cand?.content?.parts || []).map(p => p.text).filter(Boolean).join('').trim();

    if (!reply) {
      console.error('[chat] empty Gemini reply', JSON.stringify(data).slice(0, 400));
      return res.status(503).json({ error: 'The AI assistant could not respond. Please try again.' });
    }

    // When the answer was grounded via Google Search, surface the sources.
    const chunks = cand?.groundingMetadata?.groundingChunks || [];
    const urls   = [...new Set(chunks.map(c => c?.web?.uri).filter(Boolean))].slice(0, 3);
    if (urls.length) reply += '\n\nSources:\n' + urls.map(u => `• ${u}`).join('\n');

    return res.status(200).json({ reply, model: GEMINI_MODEL });
  } catch (e) {
    console.error('[chat] Gemini request failed', e);
    return res.status(503).json({ error: 'The AI assistant is busy right now. Please try again in a moment.' });
  }
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
