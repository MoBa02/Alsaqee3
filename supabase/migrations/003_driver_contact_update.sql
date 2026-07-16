-- ============================================================
-- Migration 003: Allow drivers to update contact on their customers
-- Run AFTER 002_roles_meetings.sql
-- ============================================================

-- Drivers can update the contact field on their assigned active customers.
-- We use a broad UPDATE policy (column-level RLS is not supported in Postgres)
-- but limit it to assigned customers only — the same scope as their SELECT.
CREATE POLICY "customers_driver_update_contact" ON public.customers
  FOR UPDATE USING (
    public.is_driver() AND assigned_driver_id = auth.uid() AND active = TRUE
  );
