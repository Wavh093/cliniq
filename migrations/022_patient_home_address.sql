-- Migration 022: Add home_address column to patients
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/hkmxsbopmvlprzktppzq/sql/new

-- Adds a street address line to the patients table.
-- (suburb, city, postal_code, province already exist from earlier migrations)

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS home_address text;

-- No default needed; existing rows keep NULL (shown as blank in the UI).
