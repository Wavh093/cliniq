-- ============================================================
-- OH Dental Studio — Migration 020: Medical aid split-stream
-- Adds has_medical_aid to patients (explicit flag, cleans up the
-- overloaded relationship_to_member field) and split-stream payment
-- columns to appointments (MA portion + patient co-payment portion).
-- ============================================================

-- ── patients: explicit medical aid flag ─────────────────────
ALTER TABLE patients
  ADD COLUMN has_medical_aid BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any patient who already has a scheme name recorded
UPDATE patients
  SET has_medical_aid = true
  WHERE medical_aid_name IS NOT NULL AND medical_aid_name <> '';

-- ── appointments: split-stream payment columns ───────────────
ALTER TABLE appointments
  ADD COLUMN ma_amount_charged  NUMERIC(10,2),
  ADD COLUMN ma_amount_received NUMERIC(10,2),
  ADD COLUMN ma_status          TEXT CHECK (ma_status IN ('pending','received','partial','rejected')),
  ADD COLUMN patient_portion    NUMERIC(10,2),
  ADD COLUMN patient_method     TEXT CHECK (patient_method IN ('cash','card','eft','other')),
  ADD COLUMN patient_paid_at    TIMESTAMPTZ;
