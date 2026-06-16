-- Patient documents (sick notes, referral letters generated from mobile)
CREATE TABLE IF NOT EXISTS patient_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  patient_id      UUID REFERENCES patients(id) ON DELETE SET NULL,
  appointment_id  UUID REFERENCES appointments(id) ON DELETE SET NULL,
  type            TEXT NOT NULL CHECK (type IN ('sick_note', 'referral_letter')),
  title           TEXT NOT NULL,
  html_content    TEXT NOT NULL,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_documents_patient_idx     ON patient_documents (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS patient_documents_appointment_idx  ON patient_documents (appointment_id);
CREATE INDEX IF NOT EXISTS patient_documents_practice_idx    ON patient_documents (practice_id, created_at DESC);

ALTER TABLE patient_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_documents" ON patient_documents
  FOR SELECT USING (
    practice_id IN (SELECT practice_id FROM staff WHERE auth_user_id = auth.uid() AND active = true)
  );

CREATE POLICY "staff_insert_documents" ON patient_documents
  FOR INSERT WITH CHECK (
    practice_id IN (SELECT practice_id FROM staff WHERE auth_user_id = auth.uid() AND active = true)
  );
