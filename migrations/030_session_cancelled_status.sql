-- Migration 030: Add 'cancelled' to treatment_plan_sessions status CHECK
-- Run in Supabase SQL Editor.

ALTER TABLE treatment_plan_sessions DROP CONSTRAINT IF EXISTS treatment_plan_sessions_status_check;
ALTER TABLE treatment_plan_sessions ADD CONSTRAINT treatment_plan_sessions_status_check
  CHECK (status IN ('scheduled','completed','missed','rescheduled','cancelled'));
