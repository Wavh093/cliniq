-- ============================================================
-- OH Dental Studio — Migration 012: Force Row-Level Security
--
-- ENABLE ROW LEVEL SECURITY (from 004) prevents the *authenticated*
-- and *anon* Postgres roles from bypassing policies.
-- FORCE ROW LEVEL SECURITY additionally prevents the *table owner*
-- (the `postgres` superuser role) from bypassing policies, giving
-- an extra layer of protection against accidental direct-DB access.
--
-- Note: the Supabase `service_role` has the BYPASSRLS privilege at
-- the role level, so it continues to bypass RLS as needed for our
-- server-side API routes. FORCE ROW LEVEL SECURITY does not affect it.
-- ============================================================

ALTER TABLE practices              FORCE ROW LEVEL SECURITY;
ALTER TABLE staff                  FORCE ROW LEVEL SECURITY;
ALTER TABLE practice_schedule      FORCE ROW LEVEL SECURITY;
ALTER TABLE services               FORCE ROW LEVEL SECURITY;
ALTER TABLE patients               FORCE ROW LEVEL SECURITY;
ALTER TABLE appointments           FORCE ROW LEVEL SECURITY;
ALTER TABLE contact_submissions    FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_items        FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE service_inventory_map  FORCE ROW LEVEL SECURITY;
ALTER TABLE appointment_actuals    FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log              FORCE ROW LEVEL SECURITY;
