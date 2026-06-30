-- Migration 034: Per-surface notes on dental_surface_records
-- Allows each tooth surface to carry its own clinical note independently.

ALTER TABLE dental_surface_records ADD COLUMN IF NOT EXISTS notes TEXT;
