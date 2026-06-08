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
 */
const { adminClient, cors, parseBody, PRACTICE_ID, requireAuth } = require('./_lib/supabase');
const { rateLimit } = require('./_lib/rateLimit');

const REVIEW_PHONE = '__review__'; // sentinel that distinguishes reviews from real contact msgs

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
