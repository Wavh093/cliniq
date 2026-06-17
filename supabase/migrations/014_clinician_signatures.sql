-- Clinician signatures: one row per user, stores a base64 image used on documents
CREATE TABLE IF NOT EXISTS clinician_signatures (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name   TEXT NOT NULL DEFAULT '',
  signature_data TEXT,                        -- base64 data URL (data:image/...;base64,...)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE clinician_signatures ENABLE ROW LEVEL SECURITY;

-- Any authenticated user in the practice can read all signatures (needed to show previews)
CREATE POLICY "auth_read_clinician_signatures"
  ON clinician_signatures FOR SELECT
  TO authenticated USING (true);

-- Each user can only write their own signature row
CREATE POLICY "own_clinician_signature_write"
  ON clinician_signatures FOR ALL
  TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
