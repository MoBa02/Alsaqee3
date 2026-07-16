# Pre-Deployment Safety & Reliability Review
**App:** Water Delivery Manager  
**Reviewer:** Claude (AI-assisted audit)  
**Date:** 2026-07-16

---

## 1. Project Overview

### What it does
A bilingual (EN/AR, with RTL support) Progressive Web App for a UAE water bottle delivery business. Four user roles manage daily driver routes, customer accounts, debt/payment ledgers, sales meeting pipeline, employee accounts, and operational reports.

### Tech stack
| Layer | Library / Tool | Version |
|---|---|---|
| UI Framework | React | 18.3.1 |
| Language | TypeScript | 5.5.4 |
| Build tool | Vite | 5.4.2 |
| Styling | Tailwind CSS | 3.4.10 |
| Routing | react-router-dom | 6.26.2 |
| Backend | Supabase (Auth + PostgreSQL + Edge Functions) | JS SDK 2.45.4 |
| i18n | i18next + react-i18next | 23.16.0 / 15.1.0 |
| Charts | Recharts | 2.12.7 |
| PWA | vite-plugin-pwa + Workbox | 0.20.5 / 7.1.0 |

### Running locally
```
npm install
npm run dev      # Vite dev server
npm run build    # tsc then vite build
npm run preview  # preview the built dist/
```
Requires a `.env` file at the project root with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

### Version control
**There is no git repository.** `git status` returns `fatal: not a git repository`. The project lives only on local disk (`C:\Users\wizmo\OneDrive\Desktop\App`) synced via OneDrive. There is no GitHub remote or commit history.

---

## 2. Architecture

### Folder structure
```
App/
├── .env                        ← live credentials (see §6)
├── .env.example
├── vite.config.ts
├── package.json
├── tsconfig.json
├── public/icons/
├── dist/                       ← built output
├── supabase/
│   ├── migrations/
│   │   ├── 001_schema.sql      ← initial tables + RLS
│   │   ├── 002_roles_meetings.sql
│   │   ├── 003_driver_contact_update.sql
│   │   ├── 004_meeting_datetime.sql
│   │   ├── 005_expenses.sql
│   │   └── 006_product_sizes.sql   ← NOT YET APPLIED
│   └── functions/
│       ├── create-driver/index.ts  ← superseded, may still be deployed
│       └── create-employee/index.ts
└── src/
    ├── main.tsx
    ├── App.tsx                 ← routing hub
    ├── types/index.ts
    ├── lib/supabase.ts
    ├── i18n/en.ts, ar.ts, index.ts
    ├── contexts/
    │   ├── AuthContext.tsx
    │   └── LanguageContext.tsx
    ├── components/
    │   ├── Layout.tsx
    │   ├── StepperInput.tsx
    │   ├── ConfirmDialog.tsx
    │   └── LanguageToggle.tsx
    └── pages/
        ├── Login.tsx
        ├── driver/
        │   ├── DriverRoute.tsx
        │   └── DriverSummary.tsx
        ├── owner/
        │   ├── OwnerRoute.tsx      ← admin route viewer (wraps DriverRoute)
        │   ├── Customers.tsx
        │   ├── CustomerForm.tsx
        │   ├── Payments.tsx
        │   ├── Employees.tsx
        │   └── Reports.tsx
        └── sales/
            └── Meetings.tsx
```

### Routing
`App.tsx` uses React Router v6. All routes except `/login` are wrapped in `<RequireAuth>`, which checks for a Supabase session (not just role). After session is confirmed, `<AppRoutes>` renders one of three route sets depending on `profile.role`:

| Role | Routes |
|---|---|
| `driver` | `/route`, `/summary` |
| `sales` | `/meetings`, `/reports` |
| `owner` / `manager` | `/route`, `/customers`, `/payments`, `/reports`, `/employees` |

There is a null-guard before role routing — if `profile` hasn't loaded yet, a loading spinner is shown to prevent premature redirects.

### Role determination
1. User logs in via `supabase.auth.signInWithPassword`.
2. `AuthContext` immediately fetches the user's row from `public.profiles` using their `auth.uid()`.
3. The `profile.role` value drives all routing and UI decisions client-side.
4. RLS on every table enforces the same constraints server-side.

---

## 3. Data Layer

### Supabase client (`src/lib/supabase.ts`)
```typescript
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```
**Uses the anon/public key only.** The service role key is never in the frontend. The edge function (`create-employee`) reads it from `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`, which Supabase auto-injects at runtime and never leaves the server.

### Full database schema

**`public.profiles`** (extends `auth.users`)
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | FK → auth.users ON DELETE CASCADE |
| name | TEXT NOT NULL | |
| role | TEXT NOT NULL | CHECK IN ('owner','manager','driver','sales') |
| language_preference | TEXT NOT NULL | 'en' or 'ar', default 'en' |
| active | BOOLEAN NOT NULL | default TRUE |
| created_at | TIMESTAMPTZ | |

**`public.customers`**
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name_en | TEXT NOT NULL | |
| name_ar | TEXT | nullable |
| area | TEXT | nullable |
| location_url | TEXT | nullable |
| price_per_bottle | NUMERIC(10,2) | big water price |
| price_1_5l | NUMERIC(10,2) | added in migration 006 |
| price_500ml | NUMERIC(10,2) | added in migration 006 |
| price_250ml | NUMERIC(10,2) | added in migration 006 |
| delivery_days | TEXT[] | GIN-indexed |
| assigned_driver_id | UUID | FK → profiles ON DELETE SET NULL |
| active | BOOLEAN NOT NULL | default TRUE |
| sort_order | INTEGER NOT NULL | default 0 |
| contact | TEXT | added in migration 002 |
| is_new | BOOLEAN NOT NULL | default FALSE, added in migration 002 |
| created_at | TIMESTAMPTZ | |

**`public.deliveries`**
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| customer_id | UUID NOT NULL | FK → customers ON DELETE CASCADE |
| driver_id | UUID | FK → profiles ON DELETE SET NULL |
| date | DATE NOT NULL | |
| empties_returned | INTEGER NOT NULL | default 0 |
| bottles_delivered | INTEGER NOT NULL | default 0 (big water) |
| bottles_1_5l | INTEGER NOT NULL | default 0, added in migration 006 |
| bottles_500ml | INTEGER NOT NULL | default 0, added in migration 006 |
| bottles_250ml | INTEGER NOT NULL | default 0, added in migration 006 |
| price_per_bottle_at_time | NUMERIC(10,2) | snapshot of big water price |
| amount_charged | NUMERIC(10,2) | sum across all sizes |
| note | TEXT | skip reason or other notes |
| created_at | TIMESTAMPTZ | |
| **UNIQUE(customer_id, date)** | | one delivery record per customer per day |

**`public.payments`**
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| customer_id | UUID NOT NULL | FK → customers ON DELETE CASCADE |
| amount | NUMERIC(10,2) NOT NULL | |
| date | DATE NOT NULL | |
| method | TEXT NOT NULL | CHECK IN ('cash','other') |
| note | TEXT | payment method name when method='other' |
| recorded_by | UUID | FK → profiles ON DELETE SET NULL |
| created_at | TIMESTAMPTZ | |

**`public.meetings`**
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| sales_id | UUID NOT NULL | FK → profiles ON DELETE CASCADE |
| contact_name | TEXT NOT NULL | |
| contact_phone | TEXT | |
| area | TEXT | |
| notes | TEXT | |
| status | TEXT NOT NULL | CHECK IN ('open','closed') |
| delivery_day | TEXT | first selected day, stored on close |
| customer_id | UUID | FK → customers ON DELETE SET NULL |
| closed_at | TIMESTAMPTZ | |
| meeting_date | DATE | added in migration 004 |
| meeting_time | TEXT | added in migration 004 |
| created_at | TIMESTAMPTZ | |

**`public.expenses`**
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| driver_id | UUID NOT NULL | FK → profiles ON DELETE CASCADE |
| date | DATE NOT NULL | default CURRENT_DATE |
| amount | NUMERIC(10,2) NOT NULL | |
| description | TEXT NOT NULL | |
| created_at | TIMESTAMPTZ | |

**`public.customer_balances`** (view, `security_invoker=true`)  
Defined in migration 002. Joins `customers` + aggregated `deliveries` + aggregated `payments` to produce `bottles_owed` and `money_owed` per customer. **Critical gap: this view does not include `price_1_5l`, `price_500ml`, or `price_250ml`, which were added in migration 006.** `DriverRoute.tsx` reads customers from this view and uses those three fields for price calculation — they will be `undefined` at runtime. (See §6, issue C2.)

### Supabase calls audit — error checking per file

| File | Operation | Error checked? |
|---|---|---|
| `AuthContext.tsx` | `profiles.select` (fetchProfile) | **No** — silently sets `profile=null` |
| `AuthContext.tsx` | `auth.signInWithPassword` | Yes ✓ |
| `Customers.tsx` | `customer_balances.select` (load) | **No** — silently uses `[]` |
| `Customers.tsx` | `profiles.select` (drivers) | **No** — silently uses `[]` |
| `Customers.tsx` | `customers.update` (toggleActive) | **No** — silently reloads |
| `Customers.tsx` | `customers.select` (BulkDeliveryDaysPanel) | **No** |
| `Customers.tsx` | `customers.update` (BulkDeliveryDaysPanel) | **No** — shows "Updated X customers" even on failure |
| `CustomerForm.tsx` | `customers.insert` / `customers.update` | Yes ✓ |
| `Payments.tsx` | `customer_balances.select` (load) | **No** |
| `Payments.tsx` | `payments.insert` (PaymentModal) | Yes ✓ |
| `Payments.tsx` | `deliveries.select` + `payments.select` (LedgerModal) | **No** |
| `Employees.tsx` | `profiles.select` (load) | **No** |
| `Employees.tsx` | `customers.select` (counts) | **No** |
| `Employees.tsx` | `profiles.update` (toggleActive) | **No** |
| `Employees.tsx` | `customers.select` + `customers.update` (BulkAssignPanel) | **No** on both |
| `Meetings.tsx` | `meetings.select` (load) | **No** |
| `Meetings.tsx` | `meetings.insert` (handleAddMeeting) | Yes ✓ |
| `Meetings.tsx` | `customers.select` (auto-assign driver) | **No** |
| `Meetings.tsx` | `customers.insert` (handleCloseDeal) | Yes ✓ |
| `Meetings.tsx` | `meetings.update` (handleCloseDeal) | Yes ✓ |
| `DriverRoute.tsx` | `customer_balances.select` (load) | Yes ✓ (sets `error` state) |
| `DriverRoute.tsx` | `deliveries.select` (load, existing deliveries) | **No** |
| `DriverRoute.tsx` | `deliveries.update` / `deliveries.insert` (saveStop) | **No** ← **critical** |
| `DriverRoute.tsx` | `payments.insert` (saveStop) | **No** |
| `DriverRoute.tsx` | `expenses.select/insert/delete` (DailyExpenses) | **No** |
| `DriverSummary.tsx` | All 3 queries | **No** |
| `Reports.tsx` | All 4 queries in `loadRange` | **No** |
| `Reports.tsx` | Both queries in `loadSalesStats` | **No** |
| `OwnerRoute.tsx` | `profiles.select` (drivers) | **No** |

### Secrets / environment variables
- `.env` contains the live Supabase project URL and anon key.
- `.env.example` also contains the real anon key (should only contain a placeholder).
- The anon key is a public JWT (safe to expose in a browser app). However both files permanently embed the project reference ID and full URL in plain text on disk.
- **No service role key appears anywhere in frontend code or `.env`.** The edge function accesses it via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` which Supabase injects automatically.
- No database password or other secrets are hardcoded in source files.

---

## 4. Security & Access Control

### RLS status
All tables have RLS enabled:
```sql
-- Confirmed in migration files:
ALTER TABLE public.profiles   ENABLE ROW LEVEL SECURITY;  -- 001
ALTER TABLE public.customers  ENABLE ROW LEVEL SECURITY;  -- 001
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;  -- 001
ALTER TABLE public.payments   ENABLE ROW LEVEL SECURITY;  -- 001
ALTER TABLE public.meetings   ENABLE ROW LEVEL SECURITY;  -- 002
ALTER TABLE public.expenses   ENABLE ROW LEVEL SECURITY;  -- 005
```
The `customer_balances` view uses `security_invoker=true`, so base-table RLS is enforced when the view is queried.

To verify live policies in your Supabase project:
```sql
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Current RLS policies (migration 002 final state)

**profiles:**
- `profiles_select` — own row always; owner sees all; manager sees driver+sales only
- `profiles_insert` — owner can create any role; manager can create driver+sales
- `profiles_update` — self-update (language pref); owner updates any; manager updates driver+sales

**customers:**
- `customers_admin_all` — owner or manager: full CRUD
- `customers_driver_select` — driver: SELECT their assigned active customers only
- `customers_driver_update_contact` — driver: UPDATE their assigned active customers (any column, not just contact — see H2)
- `customers_sales_read` — sales: SELECT all customers (any sales user can read all customer data)
- `customers_sales_insert` — sales: INSERT any customer (for close-deal flow)

**deliveries:**
- `deliveries_admin_all` — owner or manager: full CRUD
- `deliveries_driver_select/insert/update` — driver: only for their assigned customers
- `deliveries_sales_select` — sales: SELECT all delivery history

**payments:**
- `payments_admin_all` — owner or manager: full CRUD
- `payments_driver_select/insert` — driver: only for their assigned customers

**meetings:**
- `meetings_sales_all` — sales: full CRUD on their own meetings only (`sales_id = auth.uid()`)
- `meetings_admin_select` — owner/manager: SELECT all meetings

**expenses:**
- `expenses_driver_own` — driver: full CRUD on their own expenses only (`driver_id = auth.uid()`)
- `expenses_admin_select` — owner/manager: SELECT all expenses

### Role separation: DB vs UI

Role separation is **enforced in both layers**, which is the correct pattern. A driver who manually constructs a request cannot see another driver's customers because the DB returns nothing (RLS blocks it). The React UI layer is defense-in-depth, not the primary enforcement mechanism.

### What a sales user can access

| Action | Result |
|---|---|
| Read own meetings | Yes (intended) |
| Read other sales users' meetings | No — blocked by `sales_id = auth.uid()` in RLS |
| See other users' meeting stats in Reports | No — same RLS applies to Reports queries |
| Read **all customer records** (names, areas, prices, contacts, URLs, assigned drivers) | **Yes** — `customers_sales_read` has no per-sales-person scope |
| Read **all delivery history** for all customers | **Yes** — `deliveries_sales_select` has no per-customer scope |
| Insert customers (close-deal flow) | Yes (intended) |
| Update or delete customers | No |
| Read payments | No |
| Read expenses | No |

The broad SELECT grants on customers and deliveries were necessary for the auto-assign-driver feature in Meetings.tsx. This is a deliberate design trade-off, but the reviewer should be aware that any sales employee can read the full customer list and all-time delivery counts.

### Driver over-permissive UPDATE

`customers_driver_update_contact` (migration 003) allows a driver to UPDATE **any column** on their assigned active customers, not just `contact`. The migration comment acknowledges this: "column-level RLS is not supported in Postgres." A driver could change `price_per_bottle`, `delivery_days`, `area`, or `location_url` for their own customers.

---

## 5. Authentication

### Login
Standard email+password via `supabase.auth.signInWithPassword`. No OAuth, no magic links, no self-service signup UI. The error message shown to users is always generic ("Invalid email or password") regardless of the actual error — correct security practice.

### Session management
Supabase JS SDK v2 stores the JWT and refresh token in `localStorage` automatically. `AuthContext` listens to `onAuthStateChange` to react to token refresh, expiry, or sign-out on any tab.

### Creating new employees
New accounts cannot be created through normal signup. They must be created via the `create-employee` Edge Function, which:
1. Verifies the caller's JWT resolves to an owner or manager profile
2. Validates the requested role (owner role cannot be created via this function)
3. Uses the service-role key (server-side only) to call `auth.admin.createUser` with `email_confirm: true`
4. Upserts a profile row with the correct role

The `handle_new_user()` database trigger fires on every new `auth.users` INSERT and creates a profile defaulting to role `'driver'`. This is a safety net — even if the edge function's profile upsert fails after creating the auth user, the user still gets a valid driver-level profile.

### Password reset
There is no self-service password reset flow in the app. If an employee forgets their password, it must be reset via the Supabase Dashboard.

### Public signup risk
If Supabase Auth "Enable email signups" is turned on in the Dashboard, **anyone can create an account** via the API directly, and they would receive driver-level access via the trigger. Verify in Dashboard → Authentication → Providers → Email that sign-ups are **disabled**.

---

## 6. Known Issues & Risks

### 🔴 Critical

**C1 — `saveStop` silently swallows delivery save errors (`DriverRoute.tsx`)**

The `saveStop` function awaits the delivery insert/update and payment insert but never checks the returned error:
```typescript
// DriverRoute.tsx
if (stop.existingDeliveryId) {
  await supabase.from('deliveries').update(deliveryPayload).eq('id', stop.existingDeliveryId)
} else {
  await supabase.from('deliveries').insert({ customer_id: customer.id, date: today, ...deliveryPayload })
}
// error not destructured — always falls through to "saved: true"
setStops((prev) => ({ ...prev, [customer.id]: { ...prev[customer.id], saved: true } }))
```
If the DB call fails (network hiccup, RLS rejection, constraint violation), the driver's screen shows "Saved ✓" and the stop is marked green, but nothing was written. **The data is lost and neither the driver nor the manager knows.**

---

**C2 — `customer_balances` view is missing the new price columns (migration 006)**

Migration 006 adds `price_1_5l`, `price_500ml`, `price_250ml` to the `customers` table, but the `customer_balances` view (defined in migration 002 and never updated) does not include these columns. `DriverRoute.tsx` reads customers via `customer_balances` and accesses `customer.price_1_5l` etc. — these will be `undefined` at runtime. The price calculation for the three new water sizes in `saveStop` will always produce 0, so `amount_charged` will only reflect big water deliveries regardless of what small sizes are logged.

**Fix — run this SQL after migration 006:**
```sql
DROP VIEW IF EXISTS public.customer_balances;
CREATE VIEW public.customer_balances WITH (security_invoker = true) AS
SELECT
  c.id, c.name_en, c.name_ar, c.area, c.location_url,
  c.price_per_bottle, c.price_1_5l, c.price_500ml, c.price_250ml,
  c.delivery_days, c.assigned_driver_id,
  c.active, c.sort_order, c.contact, c.is_new, c.created_at,
  COALESCE(d_agg.bottles_delivered_total, 0) - COALESCE(d_agg.empties_returned_total, 0) AS bottles_owed,
  COALESCE(d_agg.amount_charged_total, 0) - COALESCE(p_agg.payments_total, 0) AS money_owed
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

GRANT SELECT ON public.customer_balances TO authenticated;
```

---

**C3 — Migration 006 has not been applied to the live database**

`supabase/migrations/006_product_sizes.sql` was created but not yet run. The new size columns don't exist in the DB. Any driver save that includes small-bottle data will fail because the `deliveries` INSERT will include unknown columns (`bottles_1_5l` etc.).

---

### 🟠 High

**H1 — OwnerRoute shows wrong customers when viewing a historical date**

`DriverRoute.tsx` always filters customers by `getTodayDeliveryDay()` (the real current day of the week), regardless of the `overrideDate` prop passed by `OwnerRoute.tsx`. If today is Wednesday and the admin selects last Saturday, the customer list will show Wednesday's customers, but deliveries are fetched for Saturday. The customer list and delivery records won't match.

**H2 — Driver UPDATE policy is broader than intended**

As described in §4, a driver can modify any column on their assigned customers — price, delivery days, area, etc. Postgres does not support column-level RLS restrictions. This is a known limitation noted in the migration comment.

**H3 — No write queue for offline use**

The PWA Workbox config uses `NetworkFirst` for Supabase requests. Reads fall back to cache when offline. But writes have no retry queue — if a driver saves a stop while offline, the request fails silently (compounded by C1 above). The app is not currently safe to use without connectivity.

**H4 — CORS allows any origin in Edge Functions**

Both `create-driver/index.ts` and `create-employee/index.ts` return `Access-Control-Allow-Origin: *`. Calls are still protected by JWT verification, but the wildcard header means the functions respond to preflight requests from any domain. For an internal-only tool, this could be tightened to the specific deployment domain.

---

### 🟡 Medium

**M1 — Widespread silent load failures**

The majority of data-loading calls do not check errors. The pattern `const { data } = await supabase...` discards the `error` field. Users see a blank list with no explanation when a network or auth issue occurs. `DriverRoute.tsx` is the only page that checks and surfaces a load error via state.

**M2 — BulkDeliveryDaysPanel reports success even on failure**

`Customers.tsx` ~line 238:
```typescript
await supabase.from('customers').update({ delivery_days: days }).in('id', ids)
setResult(`✓ Updated ${ids.length} customers in ${area} → ${days.join(', ')}`)
```
The update result is never checked. The UI shows a green success message regardless of whether the write succeeded.

**M3 — `create-driver` Edge Function is an orphan**

`supabase/functions/create-driver/index.ts` still exists and may be deployed. It was superseded by `create-employee` but never retired. It accepts owner credentials and creates driver-only accounts. It is not called by the current UI. If deployed, it is a live endpoint and should be deleted or undeployed.

**M4 — `Meetings.tsx` close-deal area selector references stale field name**

```typescript
// Meetings.tsx line 365
onChange={(e) => setCloseForm((f) => ({ ...f, area: e.target.value, deliveryDay: '' }))}
```
`deliveryDay` was renamed to `deliveryDays` (an array) but this setter still references the old name. TypeScript did not catch this due to structural typing in a spread. At runtime, selecting a city in the close-deal form writes a stale no-op key to state instead of resetting the delivery days selection. This is a minor UX bug — previously selected delivery days won't clear when the user changes the city.

**M5 — No password reset mechanism**

There is no "forgot password" link or admin-triggered reset in the app UI. Admins must use the Supabase Dashboard to reset employee passwords. This should be documented as an operational procedure.

**M6 — `customers_sales_read` RLS has no `active` filter**

```sql
CREATE POLICY "customers_sales_read" ON public.customers
  FOR SELECT USING (public.is_sales());
```
A sales user can read inactive customer records as well. Minor information exposure but unlikely to be a meaningful risk.

---

### 🟢 Low / Notes

**L1 — Login error message hides network failures**

`Login.tsx` always shows the generic "Invalid email or password" string regardless of the actual error from Supabase. This is good security practice but means failed logins due to network errors are indistinguishable from wrong credentials.

**L2 — UNIQUE(customer_id, date) on deliveries**

Only one delivery record per customer per day. If a second save attempt occurs after an initial failed save (that left no DB record), the `saveStop` logic may try to INSERT (since `existingDeliveryId` is null) and succeed. But if a partial record was somehow created, the second attempt will hit the unique constraint and fail — silently, due to C1.

**L3 — Workbox caches Supabase responses for 24 hours**

```javascript
// vite.config.ts
expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 }
```
With `NetworkFirst`, the cache is only used offline. But up to 100 cached responses accumulate per device. Customer list changes made overnight won't be visible until the driver goes online the next morning and the cache is bypassed by a live network response.

---

## 7. Deployment Readiness

### Environment variables required
```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-jwt>
```
Both are already in `.env`. No other env vars are needed at build time.

### Build command
```bash
npm run build   # tsc then vite build → outputs to dist/
```
The build currently passes with zero TypeScript errors. Output is a static SPA suitable for any static host (Vercel, Netlify, Cloudflare Pages, S3 + CDN).

### Pre-deployment checklist

| # | Item | Status |
|---|---|---|
| 1 | Run migration 006 (`006_product_sizes.sql`) in Supabase SQL Editor | ❌ Not done |
| 2 | Recreate `customer_balances` view to include new price columns (SQL in C2 above) | ❌ Not done |
| 3 | Fix `saveStop` to check and surface delivery/payment errors (C1) | ❌ Not done |
| 4 | Fix `OwnerRoute` historical date bug — pass selected date's weekday to customer query (H1) | ❌ Not done |
| 5 | Verify public email signups are **disabled** in Supabase Auth settings | ❓ Unverified |
| 6 | Verify `create-employee` Edge Function is deployed in Supabase Dashboard | ❓ Unverified |
| 7 | Remove or undeploy the old `create-driver` Edge Function (M3) | ❓ Unverified |
| 8 | Replace real credentials in `.env.example` with placeholder text | ❌ Not done |
| 9 | Initialise a git repository and commit all source files | ❌ Not done — no version history exists |

### Blockers before going live

**Items 1, 2, and 3 are hard blockers.**

- Without migration 006, small-bottle delivery saves will fail at the DB level.
- Without the view update (item 2), small-bottle prices calculate as zero even after the migration runs, silently undercharging customers.
- Without error checking on `saveStop` (item 3), any failed delivery save is invisible to both driver and manager, resulting in silent data loss.

---

*All findings are based on static code analysis of the files in `src/` and `supabase/`. No live database was queried during this audit.*
