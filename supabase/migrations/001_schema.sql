-- ============================================================
-- OH Dental Studio — Migration 001: Schema
-- Every table carries practice_id for multi-tenant isolation.
-- ============================================================

-- ── practices ─────────────────────────────────────────────────
-- Tenant root. One row per practice. OH Dental = practice #1.
CREATE TABLE practices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  email           TEXT,
  phone           TEXT,
  address_line1   TEXT,
  address_line2   TEXT,
  city            TEXT,
  postal_code     TEXT,
  country         TEXT NOT NULL DEFAULT 'ZA',
  timezone        TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
  hpcsa_number    TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── staff ─────────────────────────────────────────────────────
-- Practice staff linked to a Supabase Auth user (auth.users).
-- Roles: admin (full access), receptionist (bookings/patients),
--        dentist (appointments + actuals, read-only inventory).
CREATE TABLE staff (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'receptionist'
                    CHECK (role IN ('admin', 'receptionist', 'dentist')),
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (practice_id, user_id)
);

-- ── practice_schedule ─────────────────────────────────────────
-- Working hours per day of week. Used to compute availability.
-- day_of_week: 0 = Sunday … 6 = Saturday (JS convention).
CREATE TABLE practice_schedule (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  day_of_week     INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time       TIME,
  close_time      TIME,
  is_closed       BOOLEAN NOT NULL DEFAULT false,
  slot_duration   INTEGER NOT NULL DEFAULT 30,   -- minutes per bookable slot
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (practice_id, day_of_week)
);

-- ── services ──────────────────────────────────────────────────
-- Treatment types offered by a practice.
CREATE TABLE services (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'general'
                    CHECK (category IN (
                      'general', 'cosmetic', 'restorative',
                      'emergency', 'pediatric', 'prosthetic', 'orthodontic'
                    )),
  description     TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  price_from      NUMERIC(10,2),
  price_to        NUMERIC(10,2),
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── patients ──────────────────────────────────────────────────
-- Full patient profile. Demographics collected at intake.
-- POPIA consent tracked separately from general consent.
CREATE TABLE patients (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id           UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,

  -- Core identity
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL,
  email                 TEXT,
  phone                 TEXT,
  date_of_birth         DATE,
  gender                TEXT CHECK (gender IN ('male','female','non_binary','prefer_not_to_say')),
  id_number             TEXT,    -- South African ID (13-digit)

  -- Location / demographics
  suburb                TEXT,
  city                  TEXT,
  postal_code           TEXT,
  province              TEXT,

  -- Acquisition
  referral_source       TEXT CHECK (referral_source IN (
                          'google','friend','social_media','signage',
                          'medical_aid','walk_in','repeat','other'
                        )),
  referral_detail       TEXT,    -- e.g. friend's name, specific platform

  -- Medical aid
  medical_aid_name      TEXT,
  medical_aid_number    TEXT,
  medical_aid_plan      TEXT,
  main_member           BOOLEAN DEFAULT true,
  main_member_name      TEXT,

  -- Medical history (stored as arrays for easy querying)
  allergies             TEXT[],
  medications           TEXT[],
  medical_conditions    TEXT[],
  previous_dentist      TEXT,
  dental_anxiety        TEXT CHECK (dental_anxiety IN ('none','mild','moderate','severe')),
  intake_notes          TEXT,

  -- Status
  patient_type          TEXT NOT NULL DEFAULT 'new'
                          CHECK (patient_type IN ('new','returning')),
  active                BOOLEAN NOT NULL DEFAULT true,

  -- Consent (POPIA §11)
  consent_signed        BOOLEAN NOT NULL DEFAULT false,
  consent_date          TIMESTAMPTZ,
  popia_consent         BOOLEAN NOT NULL DEFAULT false,
  popia_consent_date    TIMESTAMPTZ,
  marketing_consent     BOOLEAN NOT NULL DEFAULT false,

  -- Soft delete
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── appointments ──────────────────────────────────────────────
-- Core booking record. Patient details denormalised as a
-- snapshot so history stays accurate after profile changes.
CREATE TABLE appointments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id           UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  patient_id            UUID REFERENCES patients(id) ON DELETE SET NULL,
  service_id            UUID REFERENCES services(id) ON DELETE SET NULL,
  booked_by_staff_id    UUID REFERENCES staff(id) ON DELETE SET NULL,

  -- Scheduling
  appointment_date      DATE NOT NULL,
  appointment_time      TIME NOT NULL,
  duration_minutes      INTEGER NOT NULL DEFAULT 30,

  -- Workflow status
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN (
                            'pending','confirmed','in_progress',
                            'completed','cancelled','no_show'
                          )),

  -- Notes
  patient_notes         TEXT,    -- from patient at booking
  internal_notes        TEXT,    -- from staff

  -- Cancellation
  cancellation_reason   TEXT,
  cancelled_at          TIMESTAMPTZ,

  -- Status timestamps
  confirmed_at          TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,

  -- Email
  confirmation_sent     BOOLEAN NOT NULL DEFAULT false,
  reminder_sent         BOOLEAN NOT NULL DEFAULT false,

  -- Patient snapshot (denormalised for immutable history)
  patient_first_name    TEXT,
  patient_last_name     TEXT,
  patient_email         TEXT,
  patient_phone         TEXT,

  -- Soft delete
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── contact_submissions ───────────────────────────────────────
-- Inbound enquiries from the contact form.
CREATE TABLE contact_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  topic           TEXT,
  message         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','read','replied','archived')),
  replied_by      UUID REFERENCES staff(id) ON DELETE SET NULL,
  replied_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── inventory_items ───────────────────────────────────────────
-- Stock master list. qty is the live running balance.
CREATE TABLE inventory_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id       UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  category          TEXT CHECK (category IN (
                      'consumable','instrument','medication',
                      'ppe','material','equipment','other'
                    )),
  unit              TEXT NOT NULL DEFAULT 'unit',   -- 'ml','g','box','pair','unit'
  current_qty       NUMERIC(10,3) NOT NULL DEFAULT 0,
  reorder_threshold NUMERIC(10,3),
  reorder_qty       NUMERIC(10,3),
  cost_per_unit     NUMERIC(10,2),
  supplier          TEXT,
  supplier_sku      TEXT,
  storage_location  TEXT,
  expiry_tracking   BOOLEAN NOT NULL DEFAULT false,
  active            BOOLEAN NOT NULL DEFAULT true,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── inventory_transactions ────────────────────────────────────
-- Every stock movement. qty_before/after are snapshots so the
-- log is self-contained even if items are later deleted.
CREATE TABLE inventory_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES inventory_items(id),
  type            TEXT NOT NULL
                    CHECK (type IN ('in','out','adjustment','write_off','return')),
  qty             NUMERIC(10,3) NOT NULL,   -- positive = in, negative = out
  qty_before      NUMERIC(10,3) NOT NULL,   -- snapshot before transaction
  qty_after       NUMERIC(10,3) NOT NULL,   -- snapshot after transaction
  unit_cost       NUMERIC(10,2),            -- cost at time of movement (for 'in')
  appointment_id  UUID REFERENCES appointments(id) ON DELETE SET NULL,
  reason          TEXT,
  batch_number    TEXT,
  expiry_date     DATE,
  created_by      UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── service_inventory_map ─────────────────────────────────────
-- Expected consumable quantities per procedure type.
-- Used for reorder forecasting and admin consumption templates.
CREATE TABLE service_inventory_map (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  service_id      UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  expected_qty    NUMERIC(10,3) NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_id, item_id)
);

-- ── appointment_actuals ───────────────────────────────────────
-- Actual materials used in a completed appointment, logged by
-- the dentist. Variance against service_inventory_map = waste/savings.
CREATE TABLE appointment_actuals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  appointment_id  UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES inventory_items(id),
  qty_used        NUMERIC(10,3) NOT NULL,
  notes           TEXT,
  logged_by       UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── audit_log ─────────────────────────────────────────────────
-- Immutable record of all INSERT/UPDATE/DELETE on key tables.
-- Written by triggers; never updated or deleted.
CREATE TABLE audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID REFERENCES practices(id),
  table_name      TEXT NOT NULL,
  record_id       UUID NOT NULL,
  action          TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data        JSONB,
  new_data        JSONB,
  changed_by      UUID,   -- auth.uid() at time of change
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
