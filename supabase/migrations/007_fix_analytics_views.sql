-- ============================================================
-- OH Dental Studio — Migration 007: Fix analytics view columns
--
-- The original views in 005_seed.sql had column names that
-- didn't match what api/analytics.js and admin.html query.
-- This migration drops and recreates the three affected views
-- with the correct column names.
-- ============================================================

-- ── v_monthly_bookings ────────────────────────────────────────
-- One row per practice per month. Aggregated across all services.
-- Columns expected by API: total_bookings, completed, cancelled,
--                          no_show, unique_patients
DROP VIEW IF EXISTS v_monthly_bookings CASCADE;
CREATE VIEW v_monthly_bookings AS
SELECT
  a.practice_id,
  DATE_TRUNC('month', a.appointment_date)          AS month,
  COUNT(*)                                         AS total_bookings,
  COUNT(*) FILTER (WHERE a.status = 'completed')   AS completed,
  COUNT(*) FILTER (WHERE a.status = 'cancelled')   AS cancelled,
  COUNT(*) FILTER (WHERE a.status = 'no_show')     AS no_show,
  COUNT(DISTINCT a.patient_id)                     AS unique_patients
FROM  appointments a
WHERE a.deleted_at IS NULL
GROUP BY 1, 2;

-- ── v_revenue_estimate ────────────────────────────────────────
-- One row per practice per month (completed appointments only).
-- Columns expected by API: total_price_from, avg_price_from,
--                          bookings_with_price
DROP VIEW IF EXISTS v_revenue_estimate CASCADE;
CREATE VIEW v_revenue_estimate AS
SELECT
  a.practice_id,
  DATE_TRUNC('month', a.appointment_date)          AS month,
  COUNT(*)                                         AS total_bookings,
  COALESCE(SUM(s.price_from), 0)                   AS total_price_from,
  COALESCE(AVG(s.price_from), 0)                   AS avg_price_from,
  COUNT(s.price_from)                              AS bookings_with_price
FROM  appointments a
LEFT JOIN services s ON a.service_id = s.id
WHERE a.status     = 'completed'
  AND a.deleted_at IS NULL
GROUP BY 1, 2;

-- ── v_low_stock ───────────────────────────────────────────────
-- Column expected by API: id (was exported as item_id before)
DROP VIEW IF EXISTS v_low_stock CASCADE;
CREATE VIEW v_low_stock AS
SELECT
  practice_id,
  id,
  name,
  category,
  unit,
  current_qty,
  reorder_threshold,
  reorder_qty,
  supplier,
  ROUND((current_qty::numeric / NULLIF(reorder_threshold, 0)) * 100, 1) AS pct_of_threshold
FROM  inventory_items
WHERE active             = true
  AND deleted_at         IS NULL
  AND reorder_threshold  IS NOT NULL
  AND current_qty        <= reorder_threshold
ORDER BY pct_of_threshold ASC;
