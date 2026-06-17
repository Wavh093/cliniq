-- Migration 028b: Fix missing grants on patient_documents
-- The table was created in 013 but GRANTs were omitted.
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/bbstaqlvhsxlkwgeqdqy/sql/new

GRANT SELECT, INSERT, UPDATE, DELETE ON patient_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON patient_documents TO service_role;

-- Reload PostgREST schema cache so the table becomes visible
NOTIFY pgrst, 'reload schema';
