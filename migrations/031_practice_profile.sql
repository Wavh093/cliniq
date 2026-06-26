-- Migration 031: Practice profile fields
-- Adds doctor/clinician info and practice number for use on sick notes, prescriptions, etc.

ALTER TABLE practices
  ADD COLUMN IF NOT EXISTS doctor_first_name    TEXT,
  ADD COLUMN IF NOT EXISTS doctor_last_name     TEXT,
  ADD COLUMN IF NOT EXISTS doctor_qualification TEXT,
  ADD COLUMN IF NOT EXISTS institution          TEXT,
  ADD COLUMN IF NOT EXISTS practice_number      TEXT,
  ADD COLUMN IF NOT EXISTS logo_data            TEXT;
