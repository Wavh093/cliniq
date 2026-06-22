-- ============================================================
-- OH Dental Studio — Migration 015: Security & Performance advisors
--
-- Resolves all Supabase advisor findings (applied to the remote
-- project via MCP on 2026-06-22; this file mirrors them for repo
-- history / reproducibility):
--   • 5 ERROR  security_definer_view
--   • 11 WARN  function_search_path_mutable
--   • WARN     anon/authenticated_security_definer_function_executable
--   • 3 WARN   auth_rls_initplan
--   • 30 WARN  multiple_permissive_policies
--   • 19 INFO  unindexed_foreign_keys
--
-- NOT addressed here (non-SQL / deliberately deferred):
--   • pg_net extension_in_public  — moving it risks the notify webhook
--   • auth_leaked_password_protection — Auth dashboard toggle
-- ============================================================

-- ── 1. SECURITY DEFINER views → security_invoker ─────────────
-- Practice-scoped analytics views. security_invoker makes them
-- enforce the querying staff member's RLS (correct multi-tenant
-- behaviour); service_role still bypasses RLS as before.
ALTER VIEW v_monthly_bookings    SET (security_invoker = on);
ALTER VIEW v_patient_demographics SET (security_invoker = on);
ALTER VIEW v_inventory_variance  SET (security_invoker = on);
ALTER VIEW v_revenue_estimate    SET (security_invoker = on);
ALTER VIEW v_low_stock           SET (security_invoker = on);

-- ── 2. Pin search_path on mutable-search_path functions ──────
ALTER FUNCTION set_updated_at()                            SET search_path = public;
ALTER FUNCTION snapshot_patient_on_booking()               SET search_path = public;
ALTER FUNCTION write_audit_log()                           SET search_path = public;
ALTER FUNCTION update_inventory_balance()                  SET search_path = public;
ALTER FUNCTION stamp_appointment_status()                  SET search_path = public;
ALTER FUNCTION compute_available_slots(uuid, date, integer) SET search_path = public;
ALTER FUNCTION update_treatment_plan_updated_at()          SET search_path = public;
ALTER FUNCTION sync_treatment_plan_progress()              SET search_path = public;
ALTER FUNCTION sync_appointment_to_session_status()        SET search_path = public;

-- ── 3. Move RLS auth helpers out of the PostgREST-exposed
--       `public` schema so they can't be invoked over /rest/v1/rpc.
--       Existing policies reference them by OID, which survives the
--       move; EXECUTE grants persist. NEW policies must qualify them
--       as private.auth_practice_id() / private.auth_staff_role().
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, anon, service_role;

ALTER FUNCTION public.auth_practice_id() SET SCHEMA private;
ALTER FUNCTION public.auth_staff_role()  SET SCHEMA private;
ALTER FUNCTION private.auth_practice_id() SET search_path = public;
ALTER FUNCTION private.auth_staff_role()  SET search_path = public;

-- ── 4. Revoke client EXECUTE on SECURITY DEFINER functions that
--       only run as triggers or are called internally. ───────────
REVOKE EXECUTE ON FUNCTION write_audit_log()       FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION fn_notify_new_patient() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION fn_notify_payment()     FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION fn_get_config(text)     FROM anon, authenticated, public;

-- ── 5. RLS initplan: evaluate auth.uid() once per query ──────
ALTER POLICY "staff_all_branches" ON branches
  USING      (practice_id = (SELECT s.practice_id FROM staff s WHERE s.user_id = (SELECT auth.uid()) LIMIT 1))
  WITH CHECK (practice_id = (SELECT s.practice_id FROM staff s WHERE s.user_id = (SELECT auth.uid()) LIMIT 1));

ALTER POLICY "staff_all_treatment_plans" ON treatment_plans
  USING      (practice_id = (SELECT s.practice_id FROM staff s WHERE s.user_id = (SELECT auth.uid()) LIMIT 1))
  WITH CHECK (practice_id = (SELECT s.practice_id FROM staff s WHERE s.user_id = (SELECT auth.uid()) LIMIT 1));

ALTER POLICY "staff_all_plan_sessions" ON treatment_plan_sessions
  USING (plan_id IN (
    SELECT tp.id FROM treatment_plans tp
    WHERE tp.practice_id = (SELECT s.practice_id FROM staff s WHERE s.user_id = (SELECT auth.uid()) LIMIT 1)
  ));

-- ── 6. Consolidate overlapping permissive policies ───────────
-- Replace each "admin: manage X" (FOR ALL) + "staff: read X" pair
-- with a single SELECT policy plus admin-only INSERT/UPDATE/DELETE,
-- so no role/action has two permissive policies. Semantics preserved.

-- services
DROP POLICY "admin: manage services" ON services;
DROP POLICY "staff: read services"   ON services;
CREATE POLICY "staff: read services" ON services FOR SELECT
  USING (practice_id = private.auth_practice_id());
CREATE POLICY "admin: insert services" ON services FOR INSERT
  WITH CHECK (practice_id = private.auth_practice_id() AND private.auth_staff_role() = 'admin');
CREATE POLICY "admin: update services" ON services FOR UPDATE
  USING      (practice_id = private.auth_practice_id() AND private.auth_staff_role() = 'admin')
  WITH CHECK (practice_id = private.auth_practice_id() AND private.auth_staff_role() = 'admin');
CREATE POLICY "admin: delete services" ON services FOR DELETE
  USING (practice_id = private.auth_practice_id() AND private.auth_staff_role() = 'admin');

-- practice_schedule
DROP POLICY "admin: manage schedule" ON practice_schedule;
DROP POLICY "staff: read schedule"   ON practice_schedule;
CREATE POLICY "staff: read schedule" ON practice_schedule FOR SELECT
  USING (practice_id = private.auth_practice_id());
CREATE POLICY "admin: insert schedule" ON practice_schedule FOR INSERT
  WITH CHECK (practice_id = private.auth_practice_id() AND private.auth_staff_role() = 'admin');
CREATE POLICY "admin: update schedule" ON practice_schedule FOR UPDATE
  USING      (practice_id = private.auth_practice_id() AND private.auth_staff_role() = 'admin')
  WITH CHECK (practice_id = private.auth_practice_id() AND private.auth_staff_role() = 'admin');
CREATE POLICY "admin: delete schedule" ON practice_schedule FOR DELETE
  USING (practice_id = private.auth_practice_id() AND private.auth_staff_role() = 'admin');

-- service_inventory_map
DROP POLICY "admin: manage service inventory map" ON service_inventory_map;
DROP POLICY "staff: read service inventory map"    ON service_inventory_map;
CREATE POLICY "staff: read service inventory map" ON service_inventory_map FOR SELECT
  USING (practice_id = private.auth_practice_id());
CREATE POLICY "admin: insert service inventory map" ON service_inventory_map FOR INSERT
  WITH CHECK (practice_id = private.auth_practice_id() AND private.auth_staff_role() = 'admin');
CREATE POLICY "admin: update service inventory map" ON service_inventory_map FOR UPDATE
  USING      (practice_id = private.auth_practice_id() AND private.auth_staff_role() = 'admin')
  WITH CHECK (practice_id = private.auth_practice_id() AND private.auth_staff_role() = 'admin');
CREATE POLICY "admin: delete service inventory map" ON service_inventory_map FOR DELETE
  USING (practice_id = private.auth_practice_id() AND private.auth_staff_role() = 'admin');

-- staff
DROP POLICY "admin: manage staff"            ON staff;
DROP POLICY "staff: read own practice staff" ON staff;
CREATE POLICY "staff: read own practice staff" ON staff FOR SELECT
  USING (practice_id = private.auth_practice_id());
CREATE POLICY "admin: insert staff" ON staff FOR INSERT
  WITH CHECK (practice_id = private.auth_practice_id() AND private.auth_staff_role() = 'admin');
CREATE POLICY "admin: update staff" ON staff FOR UPDATE
  USING      (practice_id = private.auth_practice_id() AND private.auth_staff_role() = 'admin')
  WITH CHECK (practice_id = private.auth_practice_id() AND private.auth_staff_role() = 'admin');
CREATE POLICY "admin: delete staff" ON staff FOR DELETE
  USING (practice_id = private.auth_practice_id() AND private.auth_staff_role() = 'admin');

-- inventory_items (admin additionally sees soft-deleted rows)
DROP POLICY "admin: manage inventory items" ON inventory_items;
DROP POLICY "staff: read inventory"         ON inventory_items;
CREATE POLICY "staff: read inventory" ON inventory_items FOR SELECT
  USING (practice_id = private.auth_practice_id()
         AND (deleted_at IS NULL OR private.auth_staff_role() = 'admin'));
CREATE POLICY "admin: insert inventory items" ON inventory_items FOR INSERT
  WITH CHECK (practice_id = private.auth_practice_id() AND private.auth_staff_role() = 'admin');
CREATE POLICY "admin: update inventory items" ON inventory_items FOR UPDATE
  USING      (practice_id = private.auth_practice_id() AND private.auth_staff_role() = 'admin')
  WITH CHECK (practice_id = private.auth_practice_id() AND private.auth_staff_role() = 'admin');
CREATE POLICY "admin: delete inventory items" ON inventory_items FOR DELETE
  USING (practice_id = private.auth_practice_id() AND private.auth_staff_role() = 'admin');

-- patients (only the two UPDATE policies overlapped)
DROP POLICY "admin: soft delete patients"   ON patients;
DROP POLICY "receptionist: update patients" ON patients;
CREATE POLICY "staff: update patients" ON patients FOR UPDATE
  USING (practice_id = private.auth_practice_id()
         AND private.auth_staff_role() = ANY (ARRAY['admin','receptionist']));

-- ── 7. Covering indexes for unindexed foreign keys ───────────
CREATE INDEX IF NOT EXISTS idx_appointment_actuals_logged_by    ON appointment_actuals (logged_by);
CREATE INDEX IF NOT EXISTS idx_appointment_actuals_practice     ON appointment_actuals (practice_id);
CREATE INDEX IF NOT EXISTS idx_appointments_booked_by_staff     ON appointments (booked_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_branches_practice                ON branches (practice_id);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_replied_by   ON contact_submissions (replied_by);
CREATE INDEX IF NOT EXISTS idx_dental_scans_appointment         ON dental_scans (appointment_id);
CREATE INDEX IF NOT EXISTS idx_dental_scans_created_by          ON dental_scans (created_by);
CREATE INDEX IF NOT EXISTS idx_dental_scans_practice            ON dental_scans (practice_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_created_by ON inventory_transactions (created_by);
CREATE INDEX IF NOT EXISTS idx_patient_documents_created_by     ON patient_documents (created_by);
CREATE INDEX IF NOT EXISTS idx_patient_tooth_records_practice   ON patient_tooth_records (practice_id);
CREATE INDEX IF NOT EXISTS idx_patients_main_member             ON patients (main_member_patient_id);
CREATE INDEX IF NOT EXISTS idx_service_inventory_map_practice   ON service_inventory_map (practice_id);
CREATE INDEX IF NOT EXISTS idx_tooth_notes_appointment          ON tooth_notes (appointment_id);
CREATE INDEX IF NOT EXISTS idx_tooth_notes_created_by           ON tooth_notes (created_by);
CREATE INDEX IF NOT EXISTS idx_tooth_notes_practice             ON tooth_notes (practice_id);
CREATE INDEX IF NOT EXISTS idx_tps_appointment                  ON treatment_plan_sessions (appointment_id);
CREATE INDEX IF NOT EXISTS idx_tps_service                      ON treatment_plan_sessions (service_id);
CREATE INDEX IF NOT EXISTS idx_treatment_plans_practice         ON treatment_plans (practice_id);
