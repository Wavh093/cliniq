-- Migration 018: Treatment Plans
-- Multi-session treatment tracking with notification support.
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/hkmxsbopmvlprzktppzq/sql/new

-- ── 1. Treatment plans table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS treatment_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text,
  total_sessions  integer NOT NULL DEFAULT 1 CHECK (total_sessions >= 1),
  sessions_done   integer NOT NULL DEFAULT 0 CHECK (sessions_done >= 0),
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','paused','completed','cancelled')),
  next_session_due date,
  notify_patient  boolean NOT NULL DEFAULT false,
  last_notified_at timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Treatment plan sessions (links to appointments) ────────────
CREATE TABLE IF NOT EXISTS treatment_plan_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         uuid NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
  appointment_id  uuid REFERENCES appointments(id) ON DELETE SET NULL,
  session_number  integer NOT NULL,
  session_date    date,
  status          text NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','completed','missed','rescheduled')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Auto-update updated_at ─────────────────────────────────────
CREATE OR REPLACE FUNCTION update_treatment_plan_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_treatment_plan_updated_at ON treatment_plans;
CREATE TRIGGER trg_treatment_plan_updated_at
  BEFORE UPDATE ON treatment_plans
  FOR EACH ROW EXECUTE FUNCTION update_treatment_plan_updated_at();

-- Auto-increment sessions_done when a session is marked completed
CREATE OR REPLACE FUNCTION sync_treatment_plan_progress()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Recalculate sessions_done from actual completed sessions
  UPDATE treatment_plans
  SET sessions_done = (
    SELECT COUNT(*) FROM treatment_plan_sessions
    WHERE plan_id = COALESCE(NEW.plan_id, OLD.plan_id) AND status = 'completed'
  ),
  status = CASE
    WHEN (SELECT COUNT(*) FROM treatment_plan_sessions
          WHERE plan_id = COALESCE(NEW.plan_id, OLD.plan_id) AND status = 'completed')
         >= total_sessions THEN 'completed'
    ELSE status
  END
  WHERE id = COALESCE(NEW.plan_id, OLD.plan_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_plan_progress ON treatment_plan_sessions;
CREATE TRIGGER trg_sync_plan_progress
  AFTER INSERT OR UPDATE OF status ON treatment_plan_sessions
  FOR EACH ROW EXECUTE FUNCTION sync_treatment_plan_progress();

-- ── 4. RLS ────────────────────────────────────────────────────────
ALTER TABLE treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE treatment_plan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_plan_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_all_treatment_plans" ON treatment_plans;
CREATE POLICY "staff_all_treatment_plans" ON treatment_plans
  USING (practice_id = (
    SELECT practice_id FROM staff WHERE user_id = auth.uid() LIMIT 1
  ))
  WITH CHECK (practice_id = (
    SELECT practice_id FROM staff WHERE user_id = auth.uid() LIMIT 1
  ));

DROP POLICY IF EXISTS "staff_all_plan_sessions" ON treatment_plan_sessions;
CREATE POLICY "staff_all_plan_sessions" ON treatment_plan_sessions
  USING (plan_id IN (
    SELECT id FROM treatment_plans WHERE practice_id = (
      SELECT practice_id FROM staff WHERE user_id = auth.uid() LIMIT 1
    )
  ));

-- ── 5. Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_treatment_plans_patient_id ON treatment_plans(patient_id);
CREATE INDEX IF NOT EXISTS idx_treatment_plans_status     ON treatment_plans(status);
CREATE INDEX IF NOT EXISTS idx_tps_plan_id                ON treatment_plan_sessions(plan_id);

-- ── 6. Grants ─────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON treatment_plans         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON treatment_plan_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON treatment_plans         TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON treatment_plan_sessions TO service_role;
