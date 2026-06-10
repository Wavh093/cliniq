-- ============================================================
-- Migration 025 — Push notification triggers via pg_net
-- ============================================================
-- Prerequisites:
--   1. Add NOTIFY_SECRET to Vercel env vars (any random string).
--   2. Replace <YOUR_NOTIFY_SECRET> below with that SAME value.
--   3. Run this entire script in the Supabase SQL editor.
-- ============================================================

-- Enable pg_net (ships with every Supabase project)
CREATE EXTENSION IF NOT EXISTS pg_net;


-- ── Config table (replaces ALTER DATABASE which needs superuser) ──
-- Stores the webhook secret so triggers can read it without
-- hardcoding it in function bodies. RLS blocks all client access.
CREATE TABLE IF NOT EXISTS public._app_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE public._app_config ENABLE ROW LEVEL SECURITY;

-- Deny all direct access from anon / authenticated roles
DROP POLICY IF EXISTS "_app_config_no_access" ON public._app_config;
CREATE POLICY "_app_config_no_access"
  ON public._app_config
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false);

-- !! Replace <YOUR_NOTIFY_SECRET> with the value you set in Vercel !!
INSERT INTO public._app_config (key, value)
  VALUES ('notify_secret', '<YOUR_NOTIFY_SECRET>')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;


-- ── Helper: read a config value ───────────────────────────────
-- SECURITY DEFINER so triggers (which run as invoker) can still
-- read the table even though clients cannot.
CREATE OR REPLACE FUNCTION public.fn_get_config(p_key text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT value FROM public._app_config WHERE key = p_key LIMIT 1;
$$;


-- ── 1. New patient notification ───────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_notify_new_patient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text := fn_get_config('notify_secret');
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
    headers := json_build_object(
                 'Content-Type',      'application/json',
                 'x-webhook-secret',  v_secret
               )::jsonb
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the INSERT because of a notification error
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
  v_secret       text := fn_get_config('notify_secret');
  v_patient_name text;
BEGIN
  -- Only fire when amount_paid goes from 0 / NULL → positive
  IF COALESCE(NEW.amount_paid, 0) > 0
     AND COALESCE(OLD.amount_paid, 0) = 0
  THEN
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
      headers := json_build_object(
                   'Content-Type',     'application/json',
                   'x-webhook-secret', v_secret
                 )::jsonb
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
