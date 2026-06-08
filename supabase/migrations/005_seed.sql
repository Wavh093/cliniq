-- ============================================================
-- OH Dental Studio — Migration 005: Seed Data
-- practice_id = '00000000-0000-0000-0000-000000000001'
-- Run this after creating the first Supabase Auth user for
-- the practice admin (replace the user_id placeholder below).
-- ============================================================

-- ── Practice #1: OH Dental Studio ────────────────────────────
INSERT INTO practices (
  id, name, slug, email, phone,
  address_line1, city, postal_code, country, timezone, hpcsa_number
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'OH Dental Studio',
  'oh-dental',
  'hello@ohdental.co.za',
  '011 660 2400',
  '23 Voortrekker Road',
  'Krugersdorp',
  '1739',
  'ZA',
  'Africa/Johannesburg',
  NULL   -- fill in HPCSA number when available
);

-- ── Working hours ─────────────────────────────────────────────
-- Mon–Fri 08:00–17:00, Sat 09:00–13:00, Sun closed
-- day_of_week: 0=Sun, 1=Mon … 6=Sat
INSERT INTO practice_schedule (practice_id, day_of_week, open_time, close_time, is_closed, slot_duration)
VALUES
  ('00000000-0000-0000-0000-000000000001', 0, NULL,    NULL,    true,  30),  -- Sun closed
  ('00000000-0000-0000-0000-000000000001', 1, '08:00', '17:00', false, 30),  -- Mon
  ('00000000-0000-0000-0000-000000000001', 2, '08:00', '17:00', false, 30),  -- Tue
  ('00000000-0000-0000-0000-000000000001', 3, '08:00', '17:00', false, 30),  -- Wed
  ('00000000-0000-0000-0000-000000000001', 4, '08:00', '17:00', false, 30),  -- Thu
  ('00000000-0000-0000-0000-000000000001', 5, '08:00', '17:00', false, 30),  -- Fri
  ('00000000-0000-0000-0000-000000000001', 6, '09:00', '13:00', false, 30);  -- Sat

-- ── Services ──────────────────────────────────────────────────
INSERT INTO services (practice_id, name, category, duration_minutes, price_from, price_to)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Checkup & Cleaning',  'general',     45,  650,   900),
  ('00000000-0000-0000-0000-000000000001', 'Whitening',           'cosmetic',    60,  3200,  5000),
  ('00000000-0000-0000-0000-000000000001', 'Veneers',             'cosmetic',    90,  5800,  8500),
  ('00000000-0000-0000-0000-000000000001', 'Crowns & Bridges',    'restorative', 120, 4500,  7000),
  ('00000000-0000-0000-0000-000000000001', 'Root Canal',          'restorative', 90,  3900,  5500),
  ('00000000-0000-0000-0000-000000000001', 'Emergency Visit',     'emergency',   30,  850,   1500),
  ('00000000-0000-0000-0000-000000000001', 'Pediatric Visit',     'pediatric',   30,  450,   700),
  ('00000000-0000-0000-0000-000000000001', 'Removable Dentures',  'prosthetic',  90,  8000,  15000);

-- ── Seed admin staff member ───────────────────────────────────
-- IMPORTANT: Replace '<<AUTH_USER_ID>>' with the UUID of the
-- Supabase Auth user you create for the practice admin.
-- Steps:
--   1. Go to Supabase Dashboard → Authentication → Users → Invite user
--   2. Enter the admin's email
--   3. Copy the user UUID that appears
--   4. Replace the placeholder below and run this INSERT
--
-- INSERT INTO staff (practice_id, user_id, first_name, last_name, email, role)
-- VALUES (
--   '00000000-0000-0000-0000-000000000001',
--   '<<AUTH_USER_ID>>',
--   'Admin',
--   'User',
--   'admin@ohdental.co.za',
--   'admin'
-- );

-- ── Sample inventory items ────────────────────────────────────
-- Starter list — practice can add more via the admin dashboard
INSERT INTO inventory_items (practice_id, name, category, unit, current_qty, reorder_threshold, reorder_qty, cost_per_unit)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Latex gloves (M)',          'ppe',        'box',  20,   5,   10,  85.00),
  ('00000000-0000-0000-0000-000000000001', 'Latex gloves (L)',          'ppe',        'box',  15,   5,   10,  85.00),
  ('00000000-0000-0000-0000-000000000001', 'Face masks (surgical)',     'ppe',        'box',  30,   5,   20,  65.00),
  ('00000000-0000-0000-0000-000000000001', 'Nitrile gloves (M)',        'ppe',        'box',  10,   5,   10,  120.00),
  ('00000000-0000-0000-0000-000000000001', 'Composite resin A1',        'material',   'g',    50,   15,  30,  2.80),
  ('00000000-0000-0000-0000-000000000001', 'Composite resin A2',        'material',   'g',    50,   15,  30,  2.80),
  ('00000000-0000-0000-0000-000000000001', 'Composite resin A3',        'material',   'g',    40,   15,  30,  2.80),
  ('00000000-0000-0000-0000-000000000001', 'Lidocaine 2% cartridges',   'medication', 'unit', 100,  20,  50,  12.50),
  ('00000000-0000-0000-0000-000000000001', 'Articaine 4% cartridges',   'medication', 'unit', 60,   20,  40,  15.00),
  ('00000000-0000-0000-0000-000000000001', 'Dental floss rolls',        'consumable', 'unit', 50,   10,  20,  8.00),
  ('00000000-0000-0000-0000-000000000001', 'Prophy paste (mint)',       'consumable', 'unit', 24,   6,   12,  22.00),
  ('00000000-0000-0000-0000-000000000001', 'Fluoride varnish',          'consumable', 'unit', 30,   8,   20,  18.00),
  ('00000000-0000-0000-0000-000000000001', 'Impression material (alg)', 'material',   'kg',   5,    1,   3,   210.00),
  ('00000000-0000-0000-0000-000000000001', 'Dental cement (GIC)',       'material',   'g',    80,   20,  40,  3.50),
  ('00000000-0000-0000-0000-000000000001', 'Burs (round, assorted)',    'instrument', 'unit', 40,   10,  20,  6.00),
  ('00000000-0000-0000-0000-000000000001', 'Burs (fissure, assorted)',  'instrument', 'unit', 40,   10,  20,  6.00),
  ('00000000-0000-0000-0000-000000000001', 'Disposable saliva ejectors','consumable', 'unit', 200,  50,  100, 0.80),
  ('00000000-0000-0000-0000-000000000001', 'Cotton rolls',              'consumable', 'unit', 500,  100, 200, 0.15),
  ('00000000-0000-0000-0000-000000000001', 'Whitening gel (35% H2O2)', 'material',   'unit', 12,   3,   6,   185.00),
  ('00000000-0000-0000-0000-000000000001', 'Veneer try-in paste',       'material',   'unit', 6,    2,   4,   95.00);

-- ── Analytics views ───────────────────────────────────────────
-- Pre-built views used by the admin dashboard analytics panels.

-- Monthly appointment volume by service
CREATE OR REPLACE VIEW v_monthly_bookings AS
SELECT
  a.practice_id,
  DATE_TRUNC('month', a.appointment_date) AS month,
  s.name                                  AS service_name,
  s.category,
  COUNT(*)                              AS total,
  COUNT(*) FILTER (WHERE a.status = 'completed')  AS completed,
  COUNT(*) FILTER (WHERE a.status = 'cancelled')  AS cancelled,
  COUNT(*) FILTER (WHERE a.status = 'no_show')    AS no_show,
  COUNT(*) FILTER (WHERE p.patient_type = 'new')  AS new_patients,
  COUNT(*) FILTER (WHERE p.patient_type = 'returning') AS returning_patients
FROM       appointments a
LEFT JOIN  services     s ON a.service_id  = s.id
LEFT JOIN  patients     p ON a.patient_id  = p.id
WHERE      a.deleted_at IS NULL
GROUP BY   1, 2, 3, 4;

-- Revenue estimate by month + service (uses price_from as conservative floor)
CREATE OR REPLACE VIEW v_revenue_estimate AS
SELECT
  a.practice_id,
  DATE_TRUNC('month', a.appointment_date) AS month,
  s.name                                  AS service_name,
  s.category,
  COUNT(*)                                AS appointments,
  SUM(s.price_from)                       AS revenue_floor,
  SUM(s.price_to)                         AS revenue_ceiling
FROM      appointments a
JOIN      services     s ON a.service_id = s.id
WHERE     a.status     = 'completed'
  AND     a.deleted_at IS NULL
GROUP BY  1, 2, 3, 4;

-- Patient demographics summary
CREATE OR REPLACE VIEW v_patient_demographics AS
SELECT
  practice_id,
  gender,
  suburb,
  province,
  referral_source,
  DATE_PART('year', AGE(date_of_birth)) AS age,
  CASE
    WHEN DATE_PART('year', AGE(date_of_birth)) < 18  THEN 'under_18'
    WHEN DATE_PART('year', AGE(date_of_birth)) < 35  THEN '18_34'
    WHEN DATE_PART('year', AGE(date_of_birth)) < 50  THEN '35_49'
    WHEN DATE_PART('year', AGE(date_of_birth)) < 65  THEN '50_64'
    ELSE '65_plus'
  END AS age_bucket,
  medical_aid_name IS NOT NULL AS has_medical_aid,
  COUNT(*) OVER (PARTITION BY practice_id) AS total_patients
FROM  patients
WHERE active     = true
  AND deleted_at IS NULL;

-- Inventory consumption: actual vs expected per service
CREATE OR REPLACE VIEW v_inventory_variance AS
SELECT
  aa.practice_id,
  a.service_id,
  s.name          AS service_name,
  ii.name         AS item_name,
  ii.unit,
  AVG(aa.qty_used)         AS avg_actual_qty,
  AVG(sim.expected_qty)    AS avg_expected_qty,
  AVG(aa.qty_used) - AVG(sim.expected_qty) AS avg_variance,
  COUNT(aa.id)             AS data_points
FROM       appointment_actuals  aa
JOIN       appointments         a   ON aa.appointment_id = a.id
JOIN       services             s   ON a.service_id      = s.id
JOIN       inventory_items      ii  ON aa.item_id         = ii.id
LEFT JOIN  service_inventory_map sim
           ON sim.service_id = a.service_id AND sim.item_id = aa.item_id
WHERE      a.status     = 'completed'
  AND      a.deleted_at IS NULL
GROUP BY   1, 2, 3, 4, 5;

-- Low-stock alert view (current_qty <= reorder_threshold)
CREATE OR REPLACE VIEW v_low_stock AS
SELECT
  practice_id,
  id            AS item_id,
  name,
  category,
  unit,
  current_qty,
  reorder_threshold,
  reorder_qty,
  supplier,
  ROUND((current_qty / NULLIF(reorder_threshold, 0)) * 100, 1) AS pct_of_threshold
FROM  inventory_items
WHERE active             = true
  AND deleted_at         IS NULL
  AND reorder_threshold  IS NOT NULL
  AND current_qty        <= reorder_threshold
ORDER BY pct_of_threshold ASC;
