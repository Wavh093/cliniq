-- Migration 035: time_blocks now actually affect patient booking availability
--
-- migrations/032_time_blocks.sql added the time_blocks table (incl. recurring
-- fields: is_recurring, recurrence_day_of_week, recurrence_start_time,
-- recurrence_end_time), but compute_available_slots() was never updated to
-- check it — so blocking a slot in the admin UI had no effect on what
-- patients could book. This redefines the function to also exclude slots
-- covered by an active time_blocks row, either a one-off date/time range
-- or a weekly recurring day+time rule.
--
-- One-off blocks are assumed same-day (matches the admin "Block Time" modal,
-- which only ever sets a single date) — start/end time-of-day are compared
-- directly rather than handling multi-day spans.

CREATE OR REPLACE FUNCTION compute_available_slots(
  p_practice_id UUID,
  p_date        DATE,
  p_duration    INTEGER DEFAULT 30   -- desired slot duration in minutes
)
RETURNS TABLE (slot_time TIME) AS $$
DECLARE
  sched      practice_schedule%ROWTYPE;
  slot_start TIME;
  slot_end   TIME;
BEGIN
  -- Look up the schedule for this day of the week
  SELECT * INTO sched
  FROM   practice_schedule
  WHERE  practice_id = p_practice_id
    AND  day_of_week = EXTRACT(DOW FROM p_date)::INTEGER;

  -- No schedule row or closed → return nothing
  IF NOT FOUND OR sched.is_closed THEN
    RETURN;
  END IF;

  -- Walk through every slot_duration block in the open window
  slot_start := sched.open_time;
  WHILE slot_start + (p_duration || ' minutes')::INTERVAL <= sched.close_time LOOP
    slot_end := slot_start + (p_duration || ' minutes')::INTERVAL;

    -- Only yield if no overlapping confirmed/pending appointment exists,
    -- and no time_blocks row (one-off or recurring) covers this slot.
    IF NOT EXISTS (
      SELECT 1 FROM appointments a
      WHERE  a.practice_id     = p_practice_id
        AND  a.appointment_date = p_date
        AND  a.status NOT IN ('cancelled', 'no_show')
        AND  a.appointment_time < slot_end
        AND  a.appointment_time + (a.duration_minutes || ' minutes')::INTERVAL > slot_start
    )
    AND NOT EXISTS (
      SELECT 1 FROM time_blocks tb
      WHERE tb.practice_id = p_practice_id
        AND (
          (
            tb.is_recurring
            AND tb.recurrence_day_of_week = EXTRACT(DOW FROM p_date)::INTEGER
            AND tb.recurrence_start_time < slot_end
            AND tb.recurrence_end_time   > slot_start
          )
          OR
          (
            NOT tb.is_recurring
            AND tb.start_datetime::date = p_date
            AND tb.start_datetime::time < slot_end
            AND tb.end_datetime::time   > slot_start
          )
        )
    ) THEN
      slot_time := slot_start;
      RETURN NEXT;
    END IF;

    slot_start := slot_start + (sched.slot_duration || ' minutes')::INTERVAL;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;
