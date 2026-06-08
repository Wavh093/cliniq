-- ============================================================
-- OH Dental Studio — Migration 008
-- 1. Rename services to match the patient-site display names
--    (fixes booking crash: ilike match was failing for 4 of 8 services)
-- 2. Seed service_inventory_map — expected consumables per procedure
-- ============================================================

-- ── 1. Rename services ────────────────────────────────────────
UPDATE services SET name = 'Checkup & Clean'
  WHERE name = 'Checkup & Cleaning'
    AND practice_id = '00000000-0000-0000-0000-000000000001';

UPDATE services SET name = 'Teeth Whitening'
  WHERE name = 'Whitening'
    AND practice_id = '00000000-0000-0000-0000-000000000001';

UPDATE services SET name = 'Porcelain Veneers'
  WHERE name = 'Veneers'
    AND practice_id = '00000000-0000-0000-0000-000000000001';

UPDATE services SET name = 'Crown & Bridge'
  WHERE name = 'Crowns & Bridges'
    AND practice_id = '00000000-0000-0000-0000-000000000001';

UPDATE services SET name = 'Root Canal Therapy'
  WHERE name = 'Root Canal'
    AND practice_id = '00000000-0000-0000-0000-000000000001';

UPDATE services SET name = 'Paediatric Dentistry'
  WHERE name = 'Pediatric Visit'
    AND practice_id = '00000000-0000-0000-0000-000000000001';

-- 'Removable Dentures' and 'Emergency Visit' already match — no change needed.

-- ── 2. Seed service_inventory_map ────────────────────────────
-- Uses subquery joins so IDs don't need to be hard-coded.
INSERT INTO service_inventory_map (practice_id, service_id, item_id, expected_qty, notes)
SELECT
  '00000000-0000-0000-0000-000000000001',
  s.id,
  i.id,
  vals.qty,
  vals.note
FROM (VALUES
  -- Checkup & Clean
  ('Checkup & Clean',      'Latex gloves (M)',            1.0::numeric, NULL::text),
  ('Checkup & Clean',      'Face masks (surgical)',        1.0,          NULL),
  ('Checkup & Clean',      'Prophy paste (mint)',          1.0,          NULL),
  ('Checkup & Clean',      'Fluoride varnish',             1.0,          NULL),
  ('Checkup & Clean',      'Dental floss rolls',           1.0,          NULL),
  ('Checkup & Clean',      'Disposable saliva ejectors',   2.0,          NULL),
  ('Checkup & Clean',      'Cotton rolls',                 4.0,          NULL),

  -- Teeth Whitening
  ('Teeth Whitening',      'Latex gloves (M)',             1.0,          NULL),
  ('Teeth Whitening',      'Face masks (surgical)',         1.0,          NULL),
  ('Teeth Whitening',      'Whitening gel (35% H2O2)',     1.0,          NULL),
  ('Teeth Whitening',      'Disposable saliva ejectors',   2.0,          NULL),
  ('Teeth Whitening',      'Cotton rolls',                 4.0,          NULL),

  -- Porcelain Veneers
  ('Porcelain Veneers',    'Latex gloves (M)',             1.0,          NULL),
  ('Porcelain Veneers',    'Face masks (surgical)',         1.0,          NULL),
  ('Porcelain Veneers',    'Lidocaine 2% cartridges',      2.0,          NULL),
  ('Porcelain Veneers',    'Impression material (alg)',    0.1,          'kg'),
  ('Porcelain Veneers',    'Composite resin A1',           2.0,          'g'),
  ('Porcelain Veneers',    'Dental cement (GIC)',          2.0,          'g'),
  ('Porcelain Veneers',    'Burs (round, assorted)',       1.0,          NULL),
  ('Porcelain Veneers',    'Veneer try-in paste',          1.0,          NULL),
  ('Porcelain Veneers',    'Disposable saliva ejectors',   4.0,          NULL),
  ('Porcelain Veneers',    'Cotton rolls',                 8.0,          NULL),

  -- Crown & Bridge
  ('Crown & Bridge',       'Latex gloves (M)',             1.0,          NULL),
  ('Crown & Bridge',       'Face masks (surgical)',         1.0,          NULL),
  ('Crown & Bridge',       'Articaine 4% cartridges',      2.0,          NULL),
  ('Crown & Bridge',       'Impression material (alg)',    0.2,          'kg'),
  ('Crown & Bridge',       'Dental cement (GIC)',          5.0,          'g'),
  ('Crown & Bridge',       'Burs (fissure, assorted)',     2.0,          NULL),
  ('Crown & Bridge',       'Disposable saliva ejectors',   4.0,          NULL),
  ('Crown & Bridge',       'Cotton rolls',                 8.0,          NULL),

  -- Root Canal Therapy
  ('Root Canal Therapy',   'Latex gloves (M)',             1.0,          NULL),
  ('Root Canal Therapy',   'Face masks (surgical)',         1.0,          NULL),
  ('Root Canal Therapy',   'Articaine 4% cartridges',      3.0,          NULL),
  ('Root Canal Therapy',   'Burs (round, assorted)',       2.0,          NULL),
  ('Root Canal Therapy',   'Burs (fissure, assorted)',     1.0,          NULL),
  ('Root Canal Therapy',   'Dental cement (GIC)',          3.0,          'g'),
  ('Root Canal Therapy',   'Composite resin A1',           3.0,          'g'),
  ('Root Canal Therapy',   'Disposable saliva ejectors',   4.0,          NULL),
  ('Root Canal Therapy',   'Cotton rolls',                10.0,          NULL),

  -- Emergency Visit
  ('Emergency Visit',      'Latex gloves (M)',             1.0,          NULL),
  ('Emergency Visit',      'Face masks (surgical)',         1.0,          NULL),
  ('Emergency Visit',      'Lidocaine 2% cartridges',      1.0,          NULL),
  ('Emergency Visit',      'Burs (round, assorted)',       1.0,          NULL),
  ('Emergency Visit',      'Dental cement (GIC)',          2.0,          'g'),
  ('Emergency Visit',      'Disposable saliva ejectors',   2.0,          NULL),
  ('Emergency Visit',      'Cotton rolls',                 4.0,          NULL),

  -- Paediatric Dentistry
  ('Paediatric Dentistry', 'Latex gloves (M)',             1.0,          NULL),
  ('Paediatric Dentistry', 'Face masks (surgical)',         1.0,          NULL),
  ('Paediatric Dentistry', 'Lidocaine 2% cartridges',      1.0,          NULL),
  ('Paediatric Dentistry', 'Prophy paste (mint)',           1.0,          NULL),
  ('Paediatric Dentistry', 'Fluoride varnish',              1.0,          NULL),
  ('Paediatric Dentistry', 'Disposable saliva ejectors',   2.0,          NULL),
  ('Paediatric Dentistry', 'Cotton rolls',                 4.0,          NULL),

  -- Removable Dentures
  ('Removable Dentures',   'Latex gloves (M)',             1.0,          NULL),
  ('Removable Dentures',   'Face masks (surgical)',         1.0,          NULL),
  ('Removable Dentures',   'Impression material (alg)',    0.3,          'kg'),
  ('Removable Dentures',   'Dental cement (GIC)',          3.0,          'g'),
  ('Removable Dentures',   'Disposable saliva ejectors',   3.0,          NULL),
  ('Removable Dentures',   'Cotton rolls',                 6.0,          NULL)

) AS vals(svc_name, item_name, qty, note)
JOIN services s
  ON  s.name        = vals.svc_name
  AND s.practice_id = '00000000-0000-0000-0000-000000000001'
JOIN inventory_items i
  ON  i.name        = vals.item_name
  AND i.practice_id = '00000000-0000-0000-0000-000000000001'
ON CONFLICT (service_id, item_id) DO NOTHING;
