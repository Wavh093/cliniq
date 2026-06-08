-- ════════════════════════════════════════════════════════════
-- Test data for Treatment Plan payment feature
-- Run AFTER migration 019_treatment_plan_payments.sql
-- Creates realistic past + upcoming sessions on existing plans.
-- Safe to run multiple times — uses IF NOT EXISTS guards via CTEs.
-- ════════════════════════════════════════════════════════════

-- ── What this creates ────────────────────────────────────────
-- For EACH existing active treatment plan it will add up to 4
-- sessions covering every scenario we need to test:
--   Session 1 → PAST · COMPLETED · Fully paid (card)
--   Session 2 → PAST · COMPLETED · Partially paid (cash)
--   Session 3 → TODAY + 7 days · SCHEDULED · No payment yet
--   Session 4 → TODAY + 21 days · SCHEDULED · No payment
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  plan_rec RECORD;
  pid      uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  FOR plan_rec IN
    SELECT id, total_sessions
    FROM   treatment_plans
    WHERE  practice_id = pid
    AND    status IN ('active','paused')
    LIMIT  5          -- cap at 5 plans to avoid flooding
  LOOP

    -- Skip if this plan already has sessions
    IF EXISTS (
      SELECT 1 FROM treatment_plan_sessions WHERE plan_id = plan_rec.id
    ) THEN CONTINUE; END IF;

    -- ── Session 1: past completed, FULLY PAID ────────────────
    INSERT INTO treatment_plan_sessions
      (plan_id, session_number, session_date, status,
       amount_charged, amount_paid, payment_method, payment_notes, paid_at)
    VALUES
      (plan_rec.id, 1,
       (CURRENT_DATE - INTERVAL '21 days')::date,
       'completed',
       850.00, 850.00, 'card',
       'Paid in full at session. Receipt #C-0041.',
       (NOW() - INTERVAL '21 days'));

    -- ── Session 2: past completed, PARTIALLY PAID ────────────
    INSERT INTO treatment_plan_sessions
      (plan_id, session_number, session_date, status,
       amount_charged, amount_paid, payment_method, payment_notes, paid_at)
    VALUES
      (plan_rec.id, 2,
       (CURRENT_DATE - INTERVAL '7 days')::date,
       'completed',
       950.00, 500.00, 'cash',
       'Patient paid deposit R500. Balance R450 due at next visit.',
       (NOW() - INTERVAL '7 days'));

    -- ── Session 3: upcoming (next week), SCHEDULED, no payment
    INSERT INTO treatment_plan_sessions
      (plan_id, session_number, session_date, status)
    VALUES
      (plan_rec.id, 3,
       (CURRENT_DATE + INTERVAL '7 days')::date,
       'scheduled');

    -- ── Session 4: future, SCHEDULED, no payment ────────────
    -- Only add if plan has room for more sessions
    IF plan_rec.total_sessions >= 4 THEN
      INSERT INTO treatment_plan_sessions
        (plan_id, session_number, session_date, status)
      VALUES
        (plan_rec.id, 4,
         (CURRENT_DATE + INTERVAL '21 days')::date,
         'scheduled');
    END IF;

  END LOOP;
END $$;

-- ── Verification ─────────────────────────────────────────────
SELECT
  tp.title                          AS plan,
  p.first_name || ' ' || p.last_name AS patient,
  tps.session_number                AS "sess#",
  tps.session_date                  AS date,
  tps.status,
  tps.amount_charged,
  tps.amount_paid,
  tps.payment_method
FROM treatment_plan_sessions tps
JOIN treatment_plans   tp ON tp.id = tps.plan_id
JOIN patients           p ON  p.id = tp.patient_id
WHERE tp.practice_id = '00000000-0000-0000-0000-000000000001'
ORDER BY tp.title, tps.session_number;
