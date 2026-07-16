-- ============================================================
-- Water Delivery Management App - Database Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- ── Profiles (extends auth.users) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'driver')),
  language_preference TEXT NOT NULL DEFAULT 'en' CHECK (language_preference IN ('en', 'ar')),
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Customers ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en             TEXT NOT NULL,
  name_ar             TEXT,
  area                TEXT,
  location_url        TEXT,
  price_per_bottle    NUMERIC(10,2),
  delivery_days       TEXT[] NOT NULL DEFAULT '{}',
  assigned_driver_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customers_delivery_days_gin ON public.customers USING GIN (delivery_days);
CREATE INDEX IF NOT EXISTS customers_driver_idx ON public.customers (assigned_driver_id);

-- ── Deliveries ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deliveries (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id               UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  driver_id                 UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  date                      DATE NOT NULL DEFAULT CURRENT_DATE,
  empties_returned          INTEGER NOT NULL DEFAULT 0,
  bottles_delivered         INTEGER NOT NULL DEFAULT 0,
  price_per_bottle_at_time  NUMERIC(10,2),
  amount_charged            NUMERIC(10,2),
  note                      TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (customer_id, date)
);

CREATE INDEX IF NOT EXISTS deliveries_customer_idx ON public.deliveries (customer_id);
CREATE INDEX IF NOT EXISTS deliveries_date_idx ON public.deliveries (date);

-- ── Payments ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount       NUMERIC(10,2) NOT NULL,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  method       TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash', 'other')),
  note         TEXT,
  recorded_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_customer_idx ON public.payments (customer_id);
CREATE INDEX IF NOT EXISTS payments_date_idx ON public.payments (date);

-- ── Customer Balances View ───────────────────────────────────
-- security_invoker=true means RLS on base tables is enforced
CREATE OR REPLACE VIEW public.customer_balances
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.name_en,
  c.name_ar,
  c.area,
  c.location_url,
  c.price_per_bottle,
  c.delivery_days,
  c.assigned_driver_id,
  c.active,
  c.sort_order,
  c.created_at,
  COALESCE(d_agg.bottles_delivered_total, 0) - COALESCE(d_agg.empties_returned_total, 0) AS bottles_owed,
  COALESCE(d_agg.amount_charged_total, 0) - COALESCE(p_agg.payments_total, 0) AS money_owed
FROM public.customers c
LEFT JOIN (
  SELECT
    customer_id,
    SUM(bottles_delivered)  AS bottles_delivered_total,
    SUM(empties_returned)   AS empties_returned_total,
    SUM(amount_charged)     AS amount_charged_total
  FROM public.deliveries
  GROUP BY customer_id
) d_agg ON d_agg.customer_id = c.id
LEFT JOIN (
  SELECT
    customer_id,
    SUM(amount) AS payments_total
  FROM public.payments
  GROUP BY customer_id
) p_agg ON p_agg.customer_id = c.id;

-- ── Auto-create profile on signup ────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'driver')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments   ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user an owner?
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'owner'
  );
$$;

-- ── Profiles RLS ─────────────────────────────────────────────
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_owner());

CREATE POLICY "profiles_insert_owner" ON public.profiles
  FOR INSERT WITH CHECK (public.is_owner());

CREATE POLICY "profiles_update_own_or_owner" ON public.profiles
  FOR UPDATE USING (id = auth.uid() OR public.is_owner());

-- ── Customers RLS ────────────────────────────────────────────
-- Owner: full access
CREATE POLICY "customers_owner_all" ON public.customers
  FOR ALL USING (public.is_owner());

-- Driver: read only their assigned customers
CREATE POLICY "customers_driver_select" ON public.customers
  FOR SELECT USING (
    NOT public.is_owner()
    AND assigned_driver_id = auth.uid()
    AND active = TRUE
  );

-- ── Deliveries RLS ───────────────────────────────────────────
CREATE POLICY "deliveries_owner_all" ON public.deliveries
  FOR ALL USING (public.is_owner());

-- Driver: read/write deliveries for their customers
CREATE POLICY "deliveries_driver_select" ON public.deliveries
  FOR SELECT USING (
    NOT public.is_owner()
    AND customer_id IN (
      SELECT id FROM public.customers
      WHERE assigned_driver_id = auth.uid() AND active = TRUE
    )
  );

CREATE POLICY "deliveries_driver_insert" ON public.deliveries
  FOR INSERT WITH CHECK (
    NOT public.is_owner()
    AND customer_id IN (
      SELECT id FROM public.customers
      WHERE assigned_driver_id = auth.uid() AND active = TRUE
    )
  );

CREATE POLICY "deliveries_driver_update" ON public.deliveries
  FOR UPDATE USING (
    NOT public.is_owner()
    AND customer_id IN (
      SELECT id FROM public.customers
      WHERE assigned_driver_id = auth.uid() AND active = TRUE
    )
  );

-- ── Payments RLS ─────────────────────────────────────────────
CREATE POLICY "payments_owner_all" ON public.payments
  FOR ALL USING (public.is_owner());

CREATE POLICY "payments_driver_select" ON public.payments
  FOR SELECT USING (
    NOT public.is_owner()
    AND customer_id IN (
      SELECT id FROM public.customers
      WHERE assigned_driver_id = auth.uid() AND active = TRUE
    )
  );

CREATE POLICY "payments_driver_insert" ON public.payments
  FOR INSERT WITH CHECK (
    NOT public.is_owner()
    AND customer_id IN (
      SELECT id FROM public.customers
      WHERE assigned_driver_id = auth.uid() AND active = TRUE
    )
  );

-- Grant SELECT on view to authenticated users
GRANT SELECT ON public.customer_balances TO authenticated;
