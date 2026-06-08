-- Migration 024: Medical Aid Claims Module
-- Tables: claims, claim_lines, claim_remittances, pre_auths
-- Apply at: https://supabase.com/dashboard/project/hkmxsbopmvlprzktppzq/sql/new

-- ══════════════════════════════════════════════════════════════════════
--  1. claims — one per billing event submitted to a medical scheme
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS claims (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_id           uuid NOT NULL,
  patient_id            uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  appointment_id        uuid REFERENCES appointments(id) ON DELETE SET NULL,

  -- Scheme info (denormalised at claim creation — stays fixed after submission)
  scheme_name           text NOT NULL,
  scheme_membership_no  text NOT NULL,
  dependant_code        text,
  plan_name             text,

  -- Provider
  treating_provider     text,

  -- Claim detail
  date_of_service       date NOT NULL,
  auth_number           text,                   -- pre-auth number (if applicable)
  claim_reference_number text,                  -- scheme's reference once submitted

  -- Status lifecycle: draft → submitted → partial | paid | rejected | written_off
  status                text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','partial','paid','rejected','written_off')),
  submitted_at          timestamptz,
  settled_at            timestamptz,

  -- Cached financials (kept in sync with claim_lines + claim_remittances)
  total_charged         numeric(10,2) NOT NULL DEFAULT 0,
  total_received        numeric(10,2) NOT NULL DEFAULT 0,

  notes                 text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  deleted_at            timestamptz
);

-- ══════════════════════════════════════════════════════════════════════
--  2. claim_lines — one row per SADA tariff code on a claim
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS claim_lines (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id        uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,

  code            text NOT NULL,          -- SADA procedure code e.g. '8341'
  description     text NOT NULL,
  tooth_number    text,                   -- FDI notation e.g. '21', '46'
  surface         text,                   -- M / D / B / L / O

  qty             integer NOT NULL DEFAULT 1,
  fee_charged     numeric(10,2) NOT NULL, -- what the practice billed

  -- Scheme response (filled when remittance is entered)
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','partial','rejected')),
  amount_approved numeric(10,2),          -- what the scheme approved
  rejection_code  text,                   -- scheme rejection code e.g. 'F03'
  rejection_reason text,                  -- human-readable from remittance advice

  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════
--  3. claim_remittances — each payment received from a scheme for a claim
--     (a claim can have multiple partial remittances)
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS claim_remittances (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_id     uuid NOT NULL,
  claim_id        uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,

  received_at     date NOT NULL,
  amount_received numeric(10,2) NOT NULL,
  remittance_ref  text,                   -- scheme EFT reference / batch number

  notes           text,
  created_at      timestamptz DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════
--  4. pre_auths — pre-authorisation requests sent to schemes
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pre_auths (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_id       uuid NOT NULL,
  patient_id        uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  scheme_name       text NOT NULL,
  membership_no     text NOT NULL,

  requested_codes   jsonb NOT NULL DEFAULT '[]',  -- [{ code, description }]
  requested_amount  numeric(10,2),

  auth_number       text,
  authorised_amount numeric(10,2),

  status            text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','granted','declined','expired')),

  requested_at      date NOT NULL DEFAULT CURRENT_DATE,
  valid_from        date,
  valid_until       date,

  notes             text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════
--  5. Indexes
-- ══════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_claims_practice_id   ON claims(practice_id);
CREATE INDEX IF NOT EXISTS idx_claims_patient_id    ON claims(patient_id);
CREATE INDEX IF NOT EXISTS idx_claims_appointment   ON claims(appointment_id);
CREATE INDEX IF NOT EXISTS idx_claims_status        ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_dos           ON claims(date_of_service);
CREATE INDEX IF NOT EXISTS idx_claim_lines_claim    ON claim_lines(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_remit_claim    ON claim_remittances(claim_id);
CREATE INDEX IF NOT EXISTS idx_pre_auths_practice   ON pre_auths(practice_id);
CREATE INDEX IF NOT EXISTS idx_pre_auths_patient    ON pre_auths(patient_id);
CREATE INDEX IF NOT EXISTS idx_pre_auths_status     ON pre_auths(status);

-- ══════════════════════════════════════════════════════════════════════
--  6. Row Level Security
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE claims             ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_lines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_remittances  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_auths          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "svc_all_claims"        ON claims;
DROP POLICY IF EXISTS "auth_read_claims"       ON claims;
DROP POLICY IF EXISTS "svc_all_lines"          ON claim_lines;
DROP POLICY IF EXISTS "auth_read_lines"        ON claim_lines;
DROP POLICY IF EXISTS "svc_all_remittances"    ON claim_remittances;
DROP POLICY IF EXISTS "auth_read_remittances"  ON claim_remittances;
DROP POLICY IF EXISTS "svc_all_pre_auths"      ON pre_auths;
DROP POLICY IF EXISTS "auth_read_pre_auths"    ON pre_auths;

CREATE POLICY "svc_all_claims"       ON claims            FOR ALL    TO service_role  USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_claims"     ON claims            FOR SELECT TO authenticated USING (practice_id = '00000000-0000-0000-0000-000000000001'::uuid);
CREATE POLICY "svc_all_lines"        ON claim_lines       FOR ALL    TO service_role  USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_lines"      ON claim_lines       FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc_all_remittances"  ON claim_remittances FOR ALL    TO service_role  USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_remittances" ON claim_remittances FOR SELECT TO authenticated USING (practice_id = '00000000-0000-0000-0000-000000000001'::uuid);
CREATE POLICY "svc_all_pre_auths"    ON pre_auths         FOR ALL    TO service_role  USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_pre_auths"  ON pre_auths         FOR SELECT TO authenticated USING (practice_id = '00000000-0000-0000-0000-000000000001'::uuid);
