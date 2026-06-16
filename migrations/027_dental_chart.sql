-- Migration 027: Dental chart
-- Creates tooth records, tooth notes, dental scans tables + storage bucket.
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/bbstaqlvhsxlkwgeqdqy/sql/new

-- ── Tooth records ────────────────────────────────────────────────────────────
-- One row per tooth per patient. Updated via upsert when status changes.
CREATE TABLE IF NOT EXISTS patient_tooth_records (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid        NOT NULL REFERENCES practices(id),
  patient_id  uuid        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tooth_fdi   smallint    NOT NULL
              CHECK (
                (tooth_fdi BETWEEN 11 AND 18) OR
                (tooth_fdi BETWEEN 21 AND 28) OR
                (tooth_fdi BETWEEN 31 AND 38) OR
                (tooth_fdi BETWEEN 41 AND 48)
              ),
  status      text        NOT NULL DEFAULT 'healthy'
              CHECK (status IN (
                'healthy','cavity','filled','crown',
                'extraction','implant','missing','bridge','needs_treatment'
              )),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, tooth_fdi)
);

-- ── Tooth notes ──────────────────────────────────────────────────────────────
-- Append-only log. appointment_id is nullable — notes added outside a session
-- are still valid clinical records.
CREATE TABLE IF NOT EXISTS tooth_notes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id    uuid        NOT NULL REFERENCES practices(id),
  patient_id     uuid        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tooth_fdi      smallint    NOT NULL,
  appointment_id uuid        REFERENCES appointments(id) ON DELETE SET NULL,
  note           text        NOT NULL CHECK (length(trim(note)) > 0),
  created_by     uuid        REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Dental scans ─────────────────────────────────────────────────────────────
-- Metadata rows for X-rays / photos stored in the dental-scans bucket.
-- tooth_fdis is a smallint array — a panoramic covers all; a periapical
-- covers 1-2 specific teeth.
CREATE TABLE IF NOT EXISTS dental_scans (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id    uuid        NOT NULL REFERENCES practices(id),
  patient_id     uuid        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id uuid        REFERENCES appointments(id) ON DELETE SET NULL,
  tooth_fdis     smallint[]  NOT NULL DEFAULT '{}',
  file_path      text        NOT NULL,
  mime_type      text        NOT NULL
                 CHECK (mime_type IN ('image/jpeg','image/png','application/pdf')),
  filename       text        NOT NULL,
  notes          text,
  created_by     uuid        REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tooth_records_patient ON patient_tooth_records (patient_id);
CREATE INDEX IF NOT EXISTS idx_tooth_notes_patient   ON tooth_notes (patient_id, tooth_fdi);
CREATE INDEX IF NOT EXISTS idx_dental_scans_patient  ON dental_scans (patient_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE patient_tooth_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tooth_notes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_scans          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service-role full access" ON patient_tooth_records;
DROP POLICY IF EXISTS "service-role full access" ON tooth_notes;
DROP POLICY IF EXISTS "service-role full access" ON dental_scans;

CREATE POLICY "service-role full access" ON patient_tooth_records
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service-role full access" ON tooth_notes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service-role full access" ON dental_scans
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Storage bucket: dental-scans ─────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dental-scans',
  'dental-scans',
  false,
  20971520,   -- 20 MB per file
  ARRAY['image/jpeg','image/png','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users (staff logged into the app) to upload and view.
-- Files are organised as {patient_id}/{timestamp}-{filename} in the bucket.
DROP POLICY IF EXISTS "service-role dental-scans" ON storage.objects;
DROP POLICY IF EXISTS "authenticated upload dental-scans" ON storage.objects;
DROP POLICY IF EXISTS "authenticated read dental-scans"   ON storage.objects;
DROP POLICY IF EXISTS "authenticated delete dental-scans" ON storage.objects;

CREATE POLICY "service-role dental-scans"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'dental-scans')
  WITH CHECK (bucket_id = 'dental-scans');

CREATE POLICY "authenticated upload dental-scans"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dental-scans');

CREATE POLICY "authenticated read dental-scans"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dental-scans');

CREATE POLICY "authenticated delete dental-scans"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'dental-scans');
