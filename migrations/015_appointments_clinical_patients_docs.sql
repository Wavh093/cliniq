-- Migration 015: Clinical codes on appointments + consent docs on patients
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/hkmxsbopmvlprzktppzq/sql/new

-- ── Appointments: ICD-10 codes, tariff codes, clinical notes ──────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS icd10_codes   text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tariff_codes  text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS clinical_notes text;

-- ── Patients: consent document store ─────────────────────────────
-- Each entry: { id, name, doc_type, url, storage_path, notes, uploaded_at }
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS consent_docs jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── Supabase Storage: create consent-docs bucket ─────────────────
-- Run this block to create the private storage bucket.
-- If you prefer to create it via the Supabase dashboard (Storage → New bucket),
-- name it "consent-docs" and keep it PRIVATE.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'consent-docs',
  'consent-docs',
  false,
  5242880,   -- 5 MB max per file
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policy: only service-role (server-side API) can read/write.
-- Admins upload via the /api/patients endpoint which uses the service-role key.
-- DROP first so this script is safe to re-run.
DROP POLICY IF EXISTS "service-role full access" ON storage.objects;
CREATE POLICY "service-role full access"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'consent-docs')
  WITH CHECK (bucket_id = 'consent-docs');
