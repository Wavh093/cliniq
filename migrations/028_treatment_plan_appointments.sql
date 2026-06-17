-- Migration 028: Treatment Plan ↔ Appointment integration
-- Links every treatment plan session to a real appointment so sessions
-- inherit full appointment functionality (dental chart, docs, billing).
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/bbstaqlvhsxlkwgeqdqy/sql/new

-- ── 1. Reverse FK on appointments ─────────────────────────────────
-- Lets the appointment detail screen know it belongs to a treatment plan.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS treatment_plan_session_id uuid
    REFERENCES treatment_plan_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appt_tp_session
  ON appointments(treatment_plan_session_id)
  WHERE treatment_plan_session_id IS NOT NULL;

-- ── 2. Service per session ────────────────────────────────────────
ALTER TABLE treatment_plan_sessions
  ADD COLUMN IF NOT EXISTS service_id uuid
    REFERENCES services(id) ON DELETE SET NULL;

-- ── 3. Bidirectional status sync trigger ──────────────────────────
-- When an appointment's status changes and it belongs to a treatment
-- plan session, keep the session status in sync automatically.
CREATE OR REPLACE FUNCTION sync_appointment_to_session_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.treatment_plan_session_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'completed' THEN
    UPDATE treatment_plan_sessions
    SET status = 'completed'
    WHERE id = NEW.treatment_plan_session_id AND status <> 'completed';
  ELSIF NEW.status IN ('no_show', 'cancelled') THEN
    UPDATE treatment_plan_sessions
    SET status = 'missed'
    WHERE id = NEW.treatment_plan_session_id AND status NOT IN ('completed', 'missed');
  ELSIF NEW.status = 'confirmed' THEN
    UPDATE treatment_plan_sessions
    SET status = 'scheduled'
    WHERE id = NEW.treatment_plan_session_id AND status = 'rescheduled';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_appt_to_session ON appointments;
CREATE TRIGGER trg_sync_appt_to_session
  AFTER UPDATE OF status ON appointments
  FOR EACH ROW
  WHEN (NEW.treatment_plan_session_id IS NOT NULL)
  EXECUTE FUNCTION sync_appointment_to_session_status();

-- ── 4. Grants ─────────────────────────────────────────────────────
-- Columns inherit table-level grants; no extra GRANT needed.

-- ── Verification ──────────────────────────────────────────────────
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'appointments' AND column_name = 'treatment_plan_session_id';
--
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'treatment_plan_sessions' AND column_name = 'service_id';
