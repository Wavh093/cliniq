-- ============================================================
-- OH Dental Studio — Migration 002: Functions & Triggers
-- ============================================================

-- ── updated_at auto-stamp ─────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_updated_at_practices
  BEFORE UPDATE ON practices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_staff
  BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_practice_schedule
  BEFORE UPDATE ON practice_schedule
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_services
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_patients
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_appointments
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_inventory_items
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_service_inventory_map
  BEFORE UPDATE ON service_inventory_map
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── auth_practice_id() ────────────────────────────────────────
-- Helper used in every RLS policy. Returns the practice_id that
-- belongs to the currently authenticated staff member.
-- SECURITY DEFINER so it can read the staff table without
-- triggering RLS on that table during the lookup itself.
CREATE OR REPLACE FUNCTION auth_practice_id()
RETURNS UUID AS $$
  SELECT practice_id
  FROM   staff
  WHERE  user_id = auth.uid()
    AND  active  = true
  LIMIT  1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── auth_staff_role() ─────────────────────────────────────────
-- Returns the role of the currently authenticated staff member.
CREATE OR REPLACE FUNCTION auth_staff_role()
RETURNS TEXT AS $$
  SELECT role
  FROM   staff
  WHERE  user_id = auth.uid()
    AND  active  = true
  LIMIT  1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── audit trigger ─────────────────────────────────────────────
-- Attached to any table that needs immutable change history.
CREATE OR REPLACE FUNCTION write_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  v_practice_id UUID;
  v_record_id   UUID;
  v_old         JSONB;
  v_new         JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_practice_id := OLD.practice_id;
    v_record_id   := OLD.id;
    v_old         := to_jsonb(OLD);
    v_new         := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_practice_id := NEW.practice_id;
    v_record_id   := NEW.id;
    v_old         := NULL;
    v_new         := to_jsonb(NEW);
  ELSE   -- UPDATE
    v_practice_id := NEW.practice_id;
    v_record_id   := NEW.id;
    v_old         := to_jsonb(OLD);
    v_new         := to_jsonb(NEW);
  END IF;

  INSERT INTO audit_log (practice_id, table_name, record_id, action, old_data, new_data, changed_by)
  VALUES (v_practice_id, TG_TABLE_NAME, v_record_id, TG_OP, v_old, v_new, auth.uid());

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach audit logging to sensitive tables
CREATE TRIGGER audit_patients
  AFTER INSERT OR UPDATE OR DELETE ON patients
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER audit_appointments
  AFTER INSERT OR UPDATE OR DELETE ON appointments
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER audit_inventory_items
  AFTER INSERT OR UPDATE OR DELETE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

-- ── denormalise patient snapshot on booking ───────────────────
-- When an appointment is inserted, copy the patient's current
-- name/email/phone into the appointment row for immutable history.
CREATE OR REPLACE FUNCTION snapshot_patient_on_booking()
RETURNS TRIGGER AS $$
DECLARE
  p patients%ROWTYPE;
BEGIN
  IF NEW.patient_id IS NOT NULL THEN
    SELECT * INTO p FROM patients WHERE id = NEW.patient_id;
    NEW.patient_first_name := p.first_name;
    NEW.patient_last_name  := p.last_name;
    NEW.patient_email      := p.email;
    NEW.patient_phone      := p.phone;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_snapshot_patient
  BEFORE INSERT ON appointments
  FOR EACH ROW EXECUTE FUNCTION snapshot_patient_on_booking();

-- ── inventory running balance ─────────────────────────────────
-- Keeps inventory_items.current_qty in sync whenever a
-- transaction is recorded. Prevents manual balance drift.
CREATE OR REPLACE FUNCTION update_inventory_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Capture the qty before the change and record it on the transaction
  SELECT current_qty INTO NEW.qty_before
  FROM   inventory_items
  WHERE  id = NEW.item_id;

  NEW.qty_after := NEW.qty_before + NEW.qty;

  -- Apply the delta to the master balance
  UPDATE inventory_items
  SET    current_qty = NEW.qty_after,
         updated_at  = now()
  WHERE  id = NEW.item_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_balance
  BEFORE INSERT ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION update_inventory_balance();

-- ── appointment status timestamps ────────────────────────────
-- Auto-stamp confirmed_at / completed_at / cancelled_at
-- when the status column changes.
CREATE OR REPLACE FUNCTION stamp_appointment_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'confirmed'  AND OLD.status <> 'confirmed'  THEN
    NEW.confirmed_at  := now();
  END IF;
  IF NEW.status = 'completed'  AND OLD.status <> 'completed'  THEN
    NEW.completed_at  := now();
  END IF;
  IF NEW.status = 'cancelled'  AND OLD.status <> 'cancelled'  THEN
    NEW.cancelled_at  := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_appointment_status_timestamps
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION stamp_appointment_status();

-- ── compute_available_slots() ────────────────────────────────
-- Returns bookable time slots for a given practice + date,
-- excluding slots that already have a confirmed/pending booking.
-- Used by /api/bookings to serve real availability.
CREATE OR REPLACE FUNCTION compute_available_slots(
  p_practice_id UUID,
  p_date        DATE,
  p_duration    INTEGER DEFAULT 30   -- desired slot duration in minutes
)
RETURNS TABLE (slot_time TIME) AS $$
DECLARE
  sched      practice_schedule%ROWTYPE;
  slot_start TIME;
BEGIN
  -- Look up the schedule for this day of the week
  SELECT * INTO sched
  FROM   practice_schedule
  WHERE  practice_id = p_practice_id
    AND  day_of_week = EXTRACT(DOW FROM p_date)::INTEGER;

  -- No schedule row or closed → return nothing
  IF NOT FOUND OR sched.is_closed THEN
    RETURN;
  END IF;

  -- Walk through every slot_duration block in the open window
  slot_start := sched.open_time;
  WHILE slot_start + (p_duration || ' minutes')::INTERVAL <= sched.close_time LOOP
    -- Only yield if no overlapping confirmed/pending appointment exists
    IF NOT EXISTS (
      SELECT 1 FROM appointments a
      WHERE  a.practice_id     = p_practice_id
        AND  a.appointment_date = p_date
        AND  a.status NOT IN ('cancelled', 'no_show')
        AND  a.appointment_time < slot_start + (p_duration || ' minutes')::INTERVAL
        AND  a.appointment_time + (a.duration_minutes || ' minutes')::INTERVAL > slot_start
    ) THEN
      slot_time := slot_start;
      RETURN NEXT;
    END IF;

    slot_start := slot_start + (sched.slot_duration || ' minutes')::INTERVAL;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;
