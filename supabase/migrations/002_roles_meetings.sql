-- ============================================================
-- Migration 002: New roles (manager, sales) + meetings table
-- Run in Supabase SQL Editor AFTER 001_schema.sql
-- ============================================================

-- ── 1. Extend role constraint ────────────────────────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'manager', 'driver', 'sales'));

-- ── 2. New columns on customers ──────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS contact   TEXT,
  ADD COLUMN IF NOT EXISTS is_new    BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 3. Meetings table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meetings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contact_name   TEXT NOT NULL,
  contact_phone  TEXT,
  area           TEXT,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  delivery_day   TEXT,                                          -- filled on close (for Abu Dhabi: Sunday|Monday)
  customer_id    UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  closed_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meetings_sales_idx  ON public.meetings (sales_id);
CREATE INDEX IF NOT EXISTS meetings_status_idx ON public.meetings (status);

-- ── 4. Role-helper functions ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'owner');
$$;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'manager');
$$;

CREATE OR REPLACE FUNCTION public.is_owner_or_manager()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'manager'));
$$;

CREATE OR REPLACE FUNCTION public.is_driver()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'driver');
$$;

CREATE OR REPLACE FUNCTION public.is_sales()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'sales');
$$;

-- ── 5. Recreate customer_balances view (adds contact + is_new) ─
-- DROP first because CREATE OR REPLACE cannot insert columns before existing ones
DROP VIEW IF EXISTS public.customer_balances;
CREATE VIEW public.customer_balances
WITH (security_invoker = true) AS
SELECT
  c.id, c.name_en, c.name_ar, c.area, c.location_url,
  c.price_per_bottle, c.delivery_days, c.assigned_driver_id,
  c.active, c.sort_order, c.contact, c.is_new, c.created_at,
  COALESCE(d_agg.bottles_delivered_total, 0) - COALESCE(d_agg.empties_returned_total, 0) AS bottles_owed,
  COALESCE(d_agg.amount_charged_total,   0) - COALESCE(p_agg.payments_total,          0) AS money_owed
FROM public.customers c
LEFT JOIN (
  SELECT customer_id,
    SUM(bottles_delivered) AS bottles_delivered_total,
    SUM(empties_returned)  AS empties_returned_total,
    SUM(amount_charged)    AS amount_charged_total
  FROM public.deliveries GROUP BY customer_id
) d_agg ON d_agg.customer_id = c.id
LEFT JOIN (
  SELECT customer_id, SUM(amount) AS payments_total
  FROM public.payments GROUP BY customer_id
) p_agg ON p_agg.customer_id = c.id;

-- ── 6. Drop old policies ─────────────────────────────────────
DROP POLICY IF EXISTS "profiles_select_own"          ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_owner"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_owner" ON public.profiles;
DROP POLICY IF EXISTS "customers_owner_all"          ON public.customers;
DROP POLICY IF EXISTS "customers_driver_select"      ON public.customers;
DROP POLICY IF EXISTS "deliveries_owner_all"         ON public.deliveries;
DROP POLICY IF EXISTS "deliveries_driver_select"     ON public.deliveries;
DROP POLICY IF EXISTS "deliveries_driver_insert"     ON public.deliveries;
DROP POLICY IF EXISTS "deliveries_driver_update"     ON public.deliveries;
DROP POLICY IF EXISTS "payments_owner_all"           ON public.payments;
DROP POLICY IF EXISTS "payments_driver_select"       ON public.payments;
DROP POLICY IF EXISTS "payments_driver_insert"       ON public.payments;

-- ── 7. Profiles RLS ──────────────────────────────────────────
-- own row always visible; owner sees all; manager sees non-owner/non-manager
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (
  id = auth.uid()
  OR public.is_owner()
  OR (public.is_manager() AND role NOT IN ('owner','manager'))
);
-- owner inserts anyone; manager inserts driver/sales only
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (
  public.is_owner()
  OR (public.is_manager() AND role IN ('driver','sales'))
);
-- owner updates anyone; manager updates driver/sales; self-update for language pref
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (
  id = auth.uid()
  OR public.is_owner()
  OR (public.is_manager() AND role IN ('driver','sales'))
);

-- ── 8. Customers RLS ─────────────────────────────────────────
CREATE POLICY "customers_admin_all" ON public.customers
  FOR ALL USING (public.is_owner_or_manager());

CREATE POLICY "customers_driver_select" ON public.customers
  FOR SELECT USING (
    public.is_driver() AND assigned_driver_id = auth.uid() AND active = TRUE
  );

-- Sales: read (for duplicate check) + insert (close deal)
CREATE POLICY "customers_sales_read" ON public.customers
  FOR SELECT USING (public.is_sales());

CREATE POLICY "customers_sales_insert" ON public.customers
  FOR INSERT WITH CHECK (public.is_sales());

-- ── 9. Deliveries RLS ────────────────────────────────────────
CREATE POLICY "deliveries_admin_all" ON public.deliveries
  FOR ALL USING (public.is_owner_or_manager());

CREATE POLICY "deliveries_driver_select" ON public.deliveries
  FOR SELECT USING (
    public.is_driver()
    AND customer_id IN (
      SELECT id FROM public.customers
      WHERE assigned_driver_id = auth.uid() AND active = TRUE
    )
  );
CREATE POLICY "deliveries_driver_insert" ON public.deliveries
  FOR INSERT WITH CHECK (
    public.is_driver()
    AND customer_id IN (
      SELECT id FROM public.customers
      WHERE assigned_driver_id = auth.uid() AND active = TRUE
    )
  );
CREATE POLICY "deliveries_driver_update" ON public.deliveries
  FOR UPDATE USING (
    public.is_driver()
    AND customer_id IN (
      SELECT id FROM public.customers
      WHERE assigned_driver_id = auth.uid() AND active = TRUE
    )
  );

-- Sales: read-only for bottles report
CREATE POLICY "deliveries_sales_select" ON public.deliveries
  FOR SELECT USING (public.is_sales());

-- ── 10. Payments RLS ─────────────────────────────────────────
CREATE POLICY "payments_admin_all" ON public.payments
  FOR ALL USING (public.is_owner_or_manager());

CREATE POLICY "payments_driver_select" ON public.payments
  FOR SELECT USING (
    public.is_driver()
    AND customer_id IN (
      SELECT id FROM public.customers
      WHERE assigned_driver_id = auth.uid() AND active = TRUE
    )
  );
CREATE POLICY "payments_driver_insert" ON public.payments
  FOR INSERT WITH CHECK (
    public.is_driver()
    AND customer_id IN (
      SELECT id FROM public.customers
      WHERE assigned_driver_id = auth.uid() AND active = TRUE
    )
  );

-- ── 11. Meetings RLS ─────────────────────────────────────────
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meetings_sales_all" ON public.meetings
  FOR ALL USING (public.is_sales() AND sales_id = auth.uid());

CREATE POLICY "meetings_admin_select" ON public.meetings
  FOR SELECT USING (public.is_owner_or_manager());

-- ── 12. Grants ───────────────────────────────────────────────
GRANT SELECT              ON public.customer_balances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO authenticated;
