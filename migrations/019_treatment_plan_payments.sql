-- Migration 019: Treatment Plan Session Payments
-- Adds per-session payment tracking to treatment_plan_sessions.
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/hkmxsbopmvlprzktppzq/sql/new

-- ── 1. Add payment columns to treatment_plan_sessions ────────
ALTER TABLE treatment_plan_sessions
  ADD COLUMN IF NOT EXISTS amount_charged  numeric,
  ADD COLUMN IF NOT EXISTS amount_paid     numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method  text
    CHECK (payment_method IN ('cash','card','eft','medical_aid','other')),
  ADD COLUMN IF NOT EXISTS payment_notes   text,
  ADD COLUMN IF NOT EXISTS paid_at         timestamptz;

-- ── 2. Update RLS WITH CHECK for plan_sessions ───────────────
-- The existing policy covers SELECT/INSERT/UPDATE/DELETE for authenticated
-- staff. No additional policy changes needed — the existing policy
-- "staff_all_plan_sessions" already grants full access to staff.

-- ── 3. Helpful index for payment queries ─────────────────────
CREATE INDEX IF NOT EXISTS idx_tps_payment ON treatment_plan_sessions(plan_id, amount_paid, amount_charged);

-- ── Verification query ────────────────────────────────────────
-- Run this after applying to confirm new columns exist:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'treatment_plan_sessions'
-- ORDER BY ordinal_position;
