-- Migration 037: practice letterhead + prescription documents
--
-- 1. practices.letterhead_data — a base64 data-URL of a full-width letterhead
--    image, uploaded in web Settings and rendered across the top of generated
--    sick notes, referral letters and prescriptions. Distinct from logo_data
--    (a small mark); letterhead is the printed page header.
-- 2. patient_documents.type — allow 'prescription' alongside the existing
--    sick_note / referral_letter so prescriptions generated on mobile can be
--    stored and printed via document.html like the others.

ALTER TABLE practices
  ADD COLUMN IF NOT EXISTS letterhead_data TEXT;

-- Widen the document-type check constraint. The constraint name is unknown
-- across environments, so drop by discovery then re-add a named one.
DO $$
DECLARE
  con text;
BEGIN
  SELECT conname INTO con
  FROM   pg_constraint
  WHERE  conrelid = 'patient_documents'::regclass
    AND  contype  = 'c'
    AND  pg_get_constraintdef(oid) ILIKE '%type%sick_note%';
  IF con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE patient_documents DROP CONSTRAINT %I', con);
  END IF;
END $$;

ALTER TABLE patient_documents
  ADD CONSTRAINT patient_documents_type_check
  CHECK (type IN ('sick_note', 'referral_letter', 'prescription'));
