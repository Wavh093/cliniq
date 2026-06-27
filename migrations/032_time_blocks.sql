-- Migration 032: Time Blocks
-- Allows staff to block out time (hospital runs, leave, breaks) so those slots
-- are unavailable for patient/admin booking.

CREATE TABLE IF NOT EXISTS time_blocks (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id            UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  staff_id               UUID REFERENCES staff(id) ON DELETE CASCADE,
  start_datetime         TIMESTAMPTZ NOT NULL,
  end_datetime           TIMESTAMPTZ NOT NULL,
  reason                 TEXT,
  is_recurring           BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_day_of_week INT CHECK (recurrence_day_of_week BETWEEN 0 AND 6),
  recurrence_start_time  TIME,
  recurrence_end_time    TIME,
  created_by             UUID REFERENCES staff(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT time_blocks_end_after_start CHECK (end_datetime > start_datetime)
);

ALTER TABLE time_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY time_blocks_service_role ON time_blocks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_time_blocks_practice_date
  ON time_blocks (practice_id, start_datetime);

CREATE INDEX idx_time_blocks_staff
  ON time_blocks (staff_id);
