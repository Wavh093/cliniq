-- ============================================================
-- OH Dental Studio — Migration 009
-- Adds needs_patient_link flag to appointments.
-- Set to true when a returning patient books online but no
-- existing record is found by email. Admin resolves by calling
-- the patient and linking via the dashboard.
-- ============================================================

ALTER TABLE appointments
  ADD COLUMN needs_patient_link BOOLEAN NOT NULL DEFAULT false;
