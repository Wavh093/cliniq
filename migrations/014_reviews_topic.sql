-- Migration 014: Allow 'review' as a topic in contact_submissions
-- Run once in Supabase SQL Editor: https://supabase.com/dashboard/project/hkmxsbopmvlprzktppzq/sql/new

-- Drop the existing topic CHECK constraint and recreate it with 'review' added.
-- The constraint name varies — we drop any that exist on this column.
DO $$
DECLARE
  con_name text;
BEGIN
  -- Find and drop the check constraint on topic
  FOR con_name IN
    SELECT conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'contact_submissions'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%topic%'
  LOOP
    EXECUTE format('ALTER TABLE contact_submissions DROP CONSTRAINT %I', con_name);
  END LOOP;
END;
$$;

-- Re-add with 'review' included
ALTER TABLE contact_submissions
  ADD CONSTRAINT contact_submissions_topic_check
    CHECK (topic IN ('general', 'appointment', 'cosmetic', 'emergency', 'medical', 'review'));
