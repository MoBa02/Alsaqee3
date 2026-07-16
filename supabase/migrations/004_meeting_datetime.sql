-- ============================================================
-- Migration 004: Add date + time fields to meetings
-- Run AFTER 003_driver_contact_update.sql
-- ============================================================

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS meeting_date DATE,
  ADD COLUMN IF NOT EXISTS meeting_time TEXT;
