-- ============================================================
-- Migration 026 — AI assistant request log
-- ============================================================
-- Purpose: tracks AI requests for rate limiting (max 10/hr/practice).
-- Records older than 2 hours are automatically cleaned up by the API.
--
-- Run this entire script in the Supabase SQL editor.
-- No environment variables required for this migration.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_requests (
  id           uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_id  uuid         NOT NULL,
  created_at   timestamptz  DEFAULT now() NOT NULL
);

-- Index for fast rate-limit window queries: (practice_id, created_at)
CREATE INDEX IF NOT EXISTS idx_ai_requests_practice_created
  ON public.ai_requests (practice_id, created_at DESC);

-- Block all direct client access — the API uses the service-role key only
ALTER TABLE public.ai_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "_ai_requests_no_access" ON public.ai_requests;
CREATE POLICY "_ai_requests_no_access"
  ON public.ai_requests
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false);

COMMENT ON TABLE public.ai_requests IS
  'Rate-limit log for /api/ai-ask: max 10 requests per rolling hour per practice. '
  'The API auto-deletes records older than 2 hours.';
