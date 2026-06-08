-- Migration 013: Expo push notification token per staff member
-- Run once in Supabase SQL Editor

ALTER TABLE staff ADD COLUMN IF NOT EXISTS expo_push_token text;
