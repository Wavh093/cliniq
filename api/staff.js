'use strict';
/**
 * /api/staff
 *
 * GET  ?resource=config        → { supabaseUrl, supabaseAnon, practice? }  PUBLIC
 * GET  → { staff: [...] }      Auth required.
 * POST { name, email }         → 201 { success: true }  Auth required.
 * DELETE ?id=UUID              → 200 { success: true }  Auth required.
 */
const { createClient } = require('@supabase/supabase-js');
const { adminClient, cors, parseBody, PRACTICE_ID, requireStaff } = require('./_lib/supabase');
const { rateLimit } = require('./_lib/rateLimit');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  // ── GET ?resource=config — public Supabase config + optional practice row ──
  if (req.method === 'GET' && req.query.resource === 'config') {
    if (rateLimit(req, res, 30, 60_000)) return;

    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token) {
      try {
        const anonClient = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_ANON_KEY,
          { auth: { persistSession: false } },
        );
        const { data: { user } } = await anonClient.auth.getUser(token)
          .catch(() => ({ data: { user: null } }));
        if (user) {
          const db = adminClient();
          const { data: practice } = await db
            .from('practices')
            .select('id, name, email, phone, address_line1, hpcsa_number, practice_number, doctor_first_name, doctor_last_name, doctor_qualification, institution')
            .eq('id', PRACTICE_ID)
            .single()
            .catch(() => ({ data: null }));
          return res.status(200).json({
            supabaseUrl:  process.env.SUPABASE_URL,
            supabaseAnon: process.env.SUPABASE_ANON_KEY,
            googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || null,
            practice:     practice || null,
          });
        }
      } catch {
        // Fall through to unauthenticated response
      }
    }
    return res.status(200).json({
      supabaseUrl:  process.env.SUPABASE_URL,
      supabaseAnon: process.env.SUPABASE_ANON_KEY,
      googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || null,
    });
  }

  // All remaining routes require verified practice membership
  const user = await requireStaff(req, res);
  if (!user) return;

  const db = adminClient();

  // ── GET — list all staff ──────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await db
      .from('staff')
      .select('id, auth_user_id, name, email, role, active, created_at')
      .eq('practice_id', PRACTICE_ID)
      .eq('active', true)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[staff GET]', error);
      return res.status(500).json({ error: 'Could not retrieve staff list' });
    }

    return res.status(200).json({ staff: data || [] });
  }

  // ── POST — invite new staff member ────────────────────────────
  if (req.method === 'POST') {
    const body = await parseBody(req);
    const { name, email } = body;

    if (!name?.trim())  return res.status(400).json({ error: 'name is required' });
    if (!email?.trim()) return res.status(400).json({ error: 'email is required' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Check if already a staff member
    const { data: existing } = await db
      .from('staff')
      .select('id')
      .eq('practice_id', PRACTICE_ID)
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: 'A staff member with this email already exists' });
    }

    // Create the Supabase Auth user and send invite email
    const { createClient } = require('@supabase/supabase-js');
    const adminSb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: invited, error: inviteErr } = await adminSb.auth.admin.inviteUserByEmail(
      email.toLowerCase().trim(),
      {
        data: { practice_id: PRACTICE_ID, name: name.trim() },
        redirectTo: `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://oh-dental-studio.vercel.app'}/admin.html`,
      }
    );

    if (inviteErr) {
      console.error('[staff POST] invite error', inviteErr);
      // Supabase returns "User already registered" if the email exists in auth
      if (inviteErr.message?.toLowerCase().includes('already')) {
        return res.status(409).json({ error: 'A user with this email already exists in the system' });
      }
      return res.status(500).json({ error: 'Could not send invite — please try again' });
    }

    // Create staff record
    const { error: staffErr } = await db
      .from('staff')
      .insert({
        practice_id:  PRACTICE_ID,
        auth_user_id: invited.user?.id || null,
        name:         name.trim(),
        email:        email.toLowerCase().trim(),
        role:         'admin',
        active:       true,
      });

    if (staffErr) {
      console.error('[staff POST] staff insert error', staffErr);
      // Non-fatal — user is invited, staff record will sync on next login
    }

    return res.status(201).json({ success: true });
  }

  // ── DELETE — deactivate staff member ─────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id is required' });

    // Prevent self-removal
    const { data: target } = await db
      .from('staff')
      .select('auth_user_id, email')
      .eq('id', id)
      .eq('practice_id', PRACTICE_ID)
      .maybeSingle();

    if (!target) return res.status(404).json({ error: 'Staff member not found' });
    if (target.auth_user_id === user.id) {
      return res.status(400).json({ error: 'You cannot remove your own account' });
    }

    // Soft-deactivate in staff table
    const { error } = await db
      .from('staff')
      .update({ active: false })
      .eq('id', id)
      .eq('practice_id', PRACTICE_ID);

    if (error) {
      console.error('[staff DELETE]', error);
      return res.status(500).json({ error: 'Could not remove staff member' });
    }

    // Also disable in Supabase Auth if we have the auth user id
    if (target.auth_user_id) {
      try {
        const { createClient } = require('@supabase/supabase-js');
        const adminSb = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          { auth: { autoRefreshToken: false, persistSession: false } }
        );
        await adminSb.auth.admin.updateUserById(target.auth_user_id, { ban_duration: '876600h' });
      } catch (authErr) {
        console.error('[staff DELETE] auth ban error (non-fatal)', authErr);
      }
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
