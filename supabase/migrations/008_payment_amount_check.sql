-- ============================================================
-- Migration 008: Enforce positive payment amounts at DB level
-- Defence-in-depth — UI already validates, but a bug or direct
-- SQL could otherwise insert a negative payment and silently
-- reduce customer debt.
-- ============================================================

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_amount_positive;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);
