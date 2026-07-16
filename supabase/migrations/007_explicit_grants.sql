-- ============================================================
-- Migration 007: Explicit PostgREST grants for October 2026
--
-- Supabase is removing implicit role inheritance for existing
-- free projects on 2026-10-30. Tables need explicit grants or
-- the Data API (PostgREST) loses access to them.
--
-- Safe to run multiple times — GRANT is idempotent.
-- RLS policies remain the row-level enforcement layer.
-- ============================================================

-- Schema access (PostgREST needs this for introspection)
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Tables that were missing explicit grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deliveries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments   TO authenticated;

-- Already granted in earlier migrations — restating for completeness
-- meetings:          SELECT, INSERT, UPDATE, DELETE TO authenticated  (migration 002)
-- expenses:          SELECT, INSERT, DELETE         TO authenticated  (migration 005)
-- customer_balances: SELECT                         TO authenticated  (migration 001+002)
