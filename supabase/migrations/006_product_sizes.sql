-- ============================================================
-- Migration 006: Multiple water sizes per delivery
-- ============================================================

-- Add size columns to deliveries (big water is existing bottles_delivered)
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS bottles_1_5l  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bottles_500ml INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bottles_250ml INT NOT NULL DEFAULT 0;

-- Add per-size pricing to customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS price_1_5l  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS price_500ml NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS price_250ml NUMERIC(10,2);
