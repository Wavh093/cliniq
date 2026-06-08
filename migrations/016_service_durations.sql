-- Migration 016: Correct service durations for cleaning, whitening, paediatric
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/hkmxsbopmvlprzktppzq/sql/new

-- Scale/polish (cleaning) → 25 min
UPDATE services
SET duration_minutes = 25
WHERE practice_id = '00000000-0000-0000-0000-000000000001'
  AND (
    name ILIKE '%scale%'
    OR name ILIKE '%clean%'
    OR name ILIKE '%polish%'
  );

-- Whitening / bleaching → 30 min
UPDATE services
SET duration_minutes = 30
WHERE practice_id = '00000000-0000-0000-0000-000000000001'
  AND (
    name ILIKE '%whiten%'
    OR name ILIKE '%bleach%'
  );

-- Paediatric / children → 30 min
UPDATE services
SET duration_minutes = 30
WHERE practice_id = '00000000-0000-0000-0000-000000000001'
  AND (
    name ILIKE '%paed%'
    OR name ILIKE '%child%'
    OR name ILIKE '%kid%'
    OR category = 'Paediatric'
  );
