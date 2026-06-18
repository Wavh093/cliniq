-- Migration 029: Patient documents
-- Runnable CREATE for patient_documents (sick notes, referral letters generated
-- from the mobile app). The table previously existed only under
-- supabase/migrations/013, with grants-only in 028b — this is the idempotent
-- runnable version. Mirrors the columns used by api/documents.js.
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/bbstaqlvhsxlkwgeqdqy/sql/new

-- ── Patient documents ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_documents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     uuid        NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  patient_id      uuid        REFERENCES patients(id) ON DELETE SET NULL,
  appointment_id  uuid        REFERENCES appointments(id) ON DELETE SET NULL,
  type            text        NOT NULL CHECK (type IN ('sick_note', 'referral_letter')),
  title           text        NOT NULL,
  html_content    text        NOT NULL,
  created_by      uuid        REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS patient_documents_patient_idx     ON patient_documents (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS patient_documents_appointment_idx ON patient_documents (appointment_id);
CREATE INDEX IF NOT EXISTS patient_documents_practice_idx    ON patient_documents (practice_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- api/documents.js uses the service-role client, so a service_role full-access
-- policy is load-bearing.
ALTER TABLE patient_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service-role full access" ON patient_documents;

CREATE POLICY "service-role full access" ON patient_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Grants ───────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON patient_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON patient_documents TO service_role;

-- Reload PostgREST schema cache so the table becomes visible
NOTIFY pgrst, 'reload schema';
