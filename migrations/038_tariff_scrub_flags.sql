-- Migration 038: tariff-code flags for the claim scrubber
--
-- The claim scrubber (api/_lib/claimScrub.js) validates a claim before it is
-- submitted to a scheme. Two per-code rules need practice-configurable flags:
--   requires_tooth — the code is tooth-specific, so a claim line using it must
--                    carry a tooth number (and, for restorative work, a surface).
--   requires_auth  — the scheme generally wants a pre-authorisation number for
--                    this (usually higher-value) code.
--
-- Both default false. We backfill requires_tooth=true for the categories that
-- are inherently tooth-level as a sensible starting heuristic; practices can
-- refine per code later. These drive WARNINGS in the scrubber, never hard
-- blocks, so an imperfect backfill can't stop a legitimate claim.

ALTER TABLE dental_tariff_codes
  ADD COLUMN IF NOT EXISTS requires_tooth BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_auth  BOOLEAN NOT NULL DEFAULT false;

UPDATE dental_tariff_codes
   SET requires_tooth = true
 WHERE requires_tooth = false
   AND category IN ('Restorative', 'Endodontics', 'Prosthodontics', 'Oral Surgery', 'Periodontics');
