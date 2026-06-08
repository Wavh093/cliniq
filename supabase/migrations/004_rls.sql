-- ============================================================
-- OH Dental Studio — Migration 004: Row-Level Security
--
-- Pattern: every policy calls auth_practice_id() which resolves
-- the currently-authenticated Supabase user → their staff row
-- → their practice_id. This means:
--   • unauthenticated requests get zero rows
--   • staff only ever see their own practice's data
--   • no cross-tenant data leakage possible at the DB layer
-- ============================================================

-- ── practices ─────────────────────────────────────────────────
ALTER TABLE practices ENABLE ROW LEVEL SECURITY;

-- Staff can read their own practice's row
CREATE POLICY "staff: read own practice"
  ON practices FOR SELECT
  USING (id = auth_practice_id());

-- Only admin role can update practice settings
CREATE POLICY "admin: update own practice"
  ON practices FOR UPDATE
  USING (id = auth_practice_id() AND auth_staff_role() = 'admin');

-- ── staff ─────────────────────────────────────────────────────
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff: read own practice staff"
  ON staff FOR SELECT
  USING (practice_id = auth_practice_id());

-- Admin can insert/update/delete staff members
CREATE POLICY "admin: manage staff"
  ON staff FOR ALL
  USING  (practice_id = auth_practice_id() AND auth_staff_role() = 'admin')
  WITH CHECK (practice_id = auth_practice_id() AND auth_staff_role() = 'admin');

-- ── practice_schedule ─────────────────────────────────────────
ALTER TABLE practice_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff: read schedule"
  ON practice_schedule FOR SELECT
  USING (practice_id = auth_practice_id());

CREATE POLICY "admin: manage schedule"
  ON practice_schedule FOR ALL
  USING  (practice_id = auth_practice_id() AND auth_staff_role() = 'admin')
  WITH CHECK (practice_id = auth_practice_id() AND auth_staff_role() = 'admin');

-- ── services ──────────────────────────────────────────────────
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff: read services"
  ON services FOR SELECT
  USING (practice_id = auth_practice_id());

CREATE POLICY "admin: manage services"
  ON services FOR ALL
  USING  (practice_id = auth_practice_id() AND auth_staff_role() = 'admin')
  WITH CHECK (practice_id = auth_practice_id() AND auth_staff_role() = 'admin');

-- ── patients ──────────────────────────────────────────────────
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- All staff can read patients (dentist needs them for appointments)
CREATE POLICY "staff: read patients"
  ON patients FOR SELECT
  USING (practice_id = auth_practice_id() AND deleted_at IS NULL);

-- Receptionist and admin can create patients
CREATE POLICY "receptionist: insert patients"
  ON patients FOR INSERT
  WITH CHECK (
    practice_id = auth_practice_id()
    AND auth_staff_role() IN ('admin', 'receptionist')
  );

-- Receptionist and admin can update patients
CREATE POLICY "receptionist: update patients"
  ON patients FOR UPDATE
  USING (
    practice_id = auth_practice_id()
    AND auth_staff_role() IN ('admin', 'receptionist')
  );

-- Soft delete only — no hard deletes by any role
-- (Hard deletes must be done directly in Supabase dashboard by owner)
CREATE POLICY "admin: soft delete patients"
  ON patients FOR UPDATE
  USING (practice_id = auth_practice_id() AND auth_staff_role() = 'admin');

-- ── appointments ──────────────────────────────────────────────
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff: read appointments"
  ON appointments FOR SELECT
  USING (practice_id = auth_practice_id() AND deleted_at IS NULL);

CREATE POLICY "receptionist: insert appointments"
  ON appointments FOR INSERT
  WITH CHECK (
    practice_id = auth_practice_id()
    AND auth_staff_role() IN ('admin', 'receptionist')
  );

CREATE POLICY "staff: update appointments"
  ON appointments FOR UPDATE
  USING (practice_id = auth_practice_id());

-- ── contact_submissions ───────────────────────────────────────
ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff: read contact submissions"
  ON contact_submissions FOR SELECT
  USING (practice_id = auth_practice_id());

CREATE POLICY "staff: update contact submission status"
  ON contact_submissions FOR UPDATE
  USING (practice_id = auth_practice_id());

-- Inserts come from the public API route (service role key),
-- so no authenticated-user INSERT policy needed here.

-- ── inventory_items ───────────────────────────────────────────
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff: read inventory"
  ON inventory_items FOR SELECT
  USING (practice_id = auth_practice_id() AND deleted_at IS NULL);

CREATE POLICY "admin: manage inventory items"
  ON inventory_items FOR ALL
  USING  (practice_id = auth_practice_id() AND auth_staff_role() = 'admin')
  WITH CHECK (practice_id = auth_practice_id() AND auth_staff_role() = 'admin');

-- ── inventory_transactions ────────────────────────────────────
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff: read inventory transactions"
  ON inventory_transactions FOR SELECT
  USING (practice_id = auth_practice_id());

-- All staff can record stock movements (dentists log actuals)
CREATE POLICY "staff: insert inventory transaction"
  ON inventory_transactions FOR INSERT
  WITH CHECK (practice_id = auth_practice_id());

-- Transactions are immutable — no UPDATE or DELETE policies

-- ── service_inventory_map ─────────────────────────────────────
ALTER TABLE service_inventory_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff: read service inventory map"
  ON service_inventory_map FOR SELECT
  USING (practice_id = auth_practice_id());

CREATE POLICY "admin: manage service inventory map"
  ON service_inventory_map FOR ALL
  USING  (practice_id = auth_practice_id() AND auth_staff_role() = 'admin')
  WITH CHECK (practice_id = auth_practice_id() AND auth_staff_role() = 'admin');

-- ── appointment_actuals ───────────────────────────────────────
ALTER TABLE appointment_actuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff: read actuals"
  ON appointment_actuals FOR SELECT
  USING (practice_id = auth_practice_id());

-- Dentists and admin log actuals after completing an appointment
CREATE POLICY "dentist: insert actuals"
  ON appointment_actuals FOR INSERT
  WITH CHECK (
    practice_id = auth_practice_id()
    AND auth_staff_role() IN ('admin', 'dentist')
  );

-- ── audit_log ─────────────────────────────────────────────────
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- All staff can read the audit log for their practice
CREATE POLICY "staff: read audit log"
  ON audit_log FOR SELECT
  USING (practice_id = auth_practice_id());

-- Audit log rows are written by SECURITY DEFINER triggers only.
-- No INSERT/UPDATE/DELETE policies for regular users.
