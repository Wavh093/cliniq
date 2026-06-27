-- Migration 033: Dental Surface Records
-- Per-surface tooth conditions (Mesial, Distal, Occlusal, Lingual, Buccal).
-- Extends the existing per-tooth status with fine-grained surface-level tracking.

CREATE TABLE IF NOT EXISTS dental_surface_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tooth_fdi   INT  NOT NULL CHECK (tooth_fdi BETWEEN 11 AND 48),
  surface     TEXT NOT NULL CHECK (surface IN ('mesial','distal','occlusal','lingual','buccal')),
  status      TEXT NOT NULL DEFAULT 'healthy'
              CHECK (status IN (
                'healthy','cavity','needs_treatment','filled',
                'crown','extraction','missing','implant','bridge'
              )),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES staff(id),
  UNIQUE (practice_id, patient_id, tooth_fdi, surface)
);

ALTER TABLE dental_surface_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY dental_surface_service_role ON dental_surface_records
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_dental_surface_patient
  ON dental_surface_records (practice_id, patient_id);
