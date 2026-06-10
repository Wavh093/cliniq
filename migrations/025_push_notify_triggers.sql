-- ============================================================
-- Migration 025 — Push notification triggers via pg_net
-- ============================================================
-- Prerequisites:
--   1. Add NOTIFY_SECRET to Vercel env vars (any random string,
--      e.g. openssl rand -hex 32).  Example: abc123xyz...
--   2. Replace <YOUR_NOTIFY_SECRET> below with that SAME value.
--   3. Run this entire script in the Supabase SQL editor.
--
-- What this does:
--   • Enables the pg_net extension (HTTP calls from DB triggers)
--   • Stores your webhook secret in DB config
--   • Fires POST /api/notify when a new patient is created
--   • Fires POST /api/notify when a session payment is recorded
-- ============================================================

-- Enable pg_net (ships with every Supabase project)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Store the secret so triggers can read it without hardcoding
-- IMPORTANT: replace <YOUR_NOTIFY_SECRET> with your actual secret
ALTER DATABASE postgres
  SET app.settings.notify_secret = '<YOUR_NOTIFY_SECRET>';

-- Reload config so current session picks it up
SELECT pg_reload_conf();


-- ── 1. New patient notification ───────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_notify_new_patient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://cliniq-five.vercel.app/api/notify',
    body    := json_build_object(
                 'type', 'new_patient',
                 'data', json_build_object(
                           'id',   NEW.id::text,
                           'name', NEW.first_name || ' ' || NEW.last_name
                         )
               )::text,
    headers := ('{"Content-Type":"application/json","x-webhook-secret":"'
                || current_setting('app.settings.notify_secret', true)
                || '"}')::jsonb
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never fail the INSERT because of a notification error
  RAISE WARNING '[fn_notify_new_patient] HTTP call failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_patient ON public.patients;
CREATE TRIGGER trg_notify_new_patient
  AFTER INSERT ON public.patients
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.fn_notify_new_patient();


-- ── 2. Payment received notification ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_notify_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_name text;
BEGIN
  -- Only fire when amount_paid goes from 0/NULL to a positive number
  IF COALESCE(NEW.amount_paid, 0) > 0
     AND COALESCE(OLD.amount_paid, 0) = 0
  THEN
    -- Resolve patient name via the linked treatment plan
    SELECT p.first_name || ' ' || p.last_name
      INTO v_patient_name
      FROM treatment_plans tp
      JOIN patients p ON p.id = tp.patient_id
     WHERE tp.id = NEW.plan_id
     LIMIT 1;

    PERFORM net.http_post(
      url     := 'https://cliniq-five.vercel.app/api/notify',
      body    := json_build_object(
                   'type', 'payment',
                   'data', json_build_object(
                             'id',     NEW.id::text,
                             'name',   COALESCE(v_patient_name, 'Unknown'),
                             'amount', NEW.amount_paid::text
                           )
                 )::text,
      headers := ('{"Content-Type":"application/json","x-webhook-secret":"'
                  || current_setting('app.settings.notify_secret', true)
                  || '"}')::jsonb
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[fn_notify_payment] HTTP call failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_payment ON public.treatment_plan_sessions;
CREATE TRIGGER trg_notify_payment
  AFTER UPDATE ON public.treatment_plan_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_payment();
