-- ============================================================
-- OH Dental Studio — Migration 010: Payment tracking
-- Adds payment columns to appointments for revenue tracking.
-- ============================================================

ALTER TABLE appointments
  ADD COLUMN payment_method   TEXT CHECK (payment_method IN ('cash','card','medical_aid')),
  ADD COLUMN amount_paid      NUMERIC(10,2),
  ADD COLUMN medical_aid_paid BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN payment_notes    TEXT,
  ADD COLUMN paid_at          TIMESTAMPTZ;
