-- ============================================================
-- OH Dental Studio — Migration 011: Medical aid beneficiaries
-- Captures the full membership structure required for claims:
-- who is the main member, what is the patient's dependant code,
-- and the relationship between patient and main member.
-- Also adds pre-auth and claim reference tracking on appointments.
-- ============================================================

-- ── patients: beneficiary / membership detail ──────────────────
ALTER TABLE patients
  -- '01' = main member, '02' = first dependant, etc.
  ADD COLUMN dependant_code         TEXT,

  -- how this patient relates to the main member on the policy
  ADD COLUMN relationship_to_member TEXT CHECK (relationship_to_member IN (
                                      'main_member','spouse','child','parent','other'
                                    )),

  -- main member's SA ID and DOB — required on most medical aid claim forms
  ADD COLUMN main_member_id_number  TEXT,
  ADD COLUMN main_member_dob        DATE,

  -- optional FK if the main member is also a patient in this practice
  ADD COLUMN main_member_patient_id UUID REFERENCES patients(id) ON DELETE SET NULL;

-- ── appointments: medical aid claim tracking ───────────────────
ALTER TABLE appointments
  -- claim reference returned by the medical aid after submission
  ADD COLUMN medical_aid_claim_number TEXT,

  -- pre-authorisation number (required by many medical aids before treatment)
  ADD COLUMN medical_aid_auth_number  TEXT;
