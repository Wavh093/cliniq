-- Migration 017: Branches
-- Adds a branches table and links appointments to a branch.
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/hkmxsbopmvlprzktppzq/sql/new

-- ── 1. Branches table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  name        text NOT NULL,
  address     text,
  phone       text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches FORCE ROW LEVEL SECURITY;

-- Staff can read/write branches for their practice
DROP POLICY IF EXISTS "staff_all_branches" ON branches;
CREATE POLICY "staff_all_branches" ON branches
  USING (practice_id = (
    SELECT practice_id FROM staff WHERE user_id = auth.uid() LIMIT 1
  ))
  WITH CHECK (practice_id = (
    SELECT practice_id FROM staff WHERE user_id = auth.uid() LIMIT 1
  ));

-- Seed the default branch for OH Dental Studio
INSERT INTO branches (id, practice_id, name, address, phone)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'Main Practice',
  '23 Voortrekker Road, Krugersdorp',
  '011 660 2400'
) ON CONFLICT DO NOTHING;

-- ── 2. Add branch_id to appointments ─────────────────────────────
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);

-- Index for faster lookup
CREATE INDEX IF NOT EXISTS idx_appointments_branch_id ON appointments(branch_id);

-- ── 3. Grant permissions ──────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON branches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON branches TO service_role;
