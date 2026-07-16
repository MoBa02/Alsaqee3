-- ============================================================
-- Migration 005: Driver daily expenses
-- ============================================================

CREATE TABLE IF NOT EXISTS public.expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  amount      NUMERIC(10,2) NOT NULL,
  description TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS expenses_driver_date_idx ON public.expenses (driver_id, date);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses_driver_own" ON public.expenses
  FOR ALL USING (public.is_driver() AND driver_id = auth.uid());

CREATE POLICY "expenses_admin_select" ON public.expenses
  FOR SELECT USING (public.is_owner_or_manager());

GRANT SELECT, INSERT, DELETE ON public.expenses TO authenticated;
