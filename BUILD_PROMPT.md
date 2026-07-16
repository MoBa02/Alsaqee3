# Build Prompt: Water Delivery Management Web App

Build a phone-friendly web app (PWA) for a water-bottle delivery business. The owner and a few drivers use it to manage recurring customers, log daily deliveries, track bottles and payments, and view reports. Below is the complete specification. Build it end to end, set up the database, and give me clear instructions to run and deploy it.

---

## 1. Product summary

A water company delivers bottled water to recurring customers. Each customer is served on fixed weekday(s). Drivers follow a daily route, recording for each stop: empty bottles returned, full bottles delivered, and any payment collected. The system tracks revenue (price per bottle varies per customer), a running balance of empty bottles each customer owes, and a running money balance (debt) per customer. History is permanent and automatic. No spreadsheets, no manual resets.

## 2. Users & roles

Two roles:

- **Owner**: full access. Sees all routes, all customers, all money, all reports. Manages customers (which weekday they're on, area, map link, price per bottle, assigned driver). Adds/removes drivers. Can log deliveries for any route.
- **Driver**: sees only their own assigned route for the current day. Records empties returned, bottles delivered, and payment collected per stop. Can navigate via the map link. Cannot see other drivers' routes, revenue reports, or other customers' debt totals.

Auth: email + password login. Role stored per user. Keep it simple; no public signup — the owner creates driver accounts.

## 3. Language / localization

Fully bilingual: **English and Arabic**, user-switchable. Arabic must render right-to-left (RTL). Customer records contain both an English name and an Arabic name (الاسم); show the appropriate one based on selected language, falling back to whichever exists. All UI labels, buttons, and screens must be translated. Numbers and dates localized appropriately.

## 4. Core data model

**users**: id, email, password (hashed), name, role (owner|driver), language preference, created_at.

**customers**: id, name_en, name_ar, area, location_url (map link), price_per_bottle, delivery_days (which weekdays — a customer can be on more than one day), assigned_driver_id (nullable), active (bool), created_at. Note: bottles owed and money owed are NOT stored as fields — they are computed from deliveries + payments (see below) so they're always correct.

**deliveries**: id, customer_id, driver_id, date, empties_returned (int), bottles_delivered (int), price_per_bottle_at_time (copy the price at delivery time so historical revenue stays correct if price changes later), amount_charged (computed = bottles_delivered × price), created_at. One row per customer per delivery day.

**payments**: id, customer_id, amount, date, method (cash|other), note, recorded_by (user id), created_at.

**Computed balances (never stored, always derived):**
- Bottles owed by a customer = SUM(bottles_delivered) − SUM(empties_returned) across all their deliveries.
- Money owed by a customer = SUM(amount_charged across deliveries) − SUM(payments). Positive = customer owes; negative = credit.

This "mix of both" payment model works for everyone: customers who pay cash on delivery just get a payment recorded the same day (balance nets to zero); customers who run a tab accumulate a money-owed balance and settle later with a lump-sum payment. Same model handles both — no separate modes needed.

## 5. Weekday model

Delivery week runs **Saturday → Friday**. Friday is a non-delivery day (no routes). Each customer is assigned one or more weekdays. The "Today" view shows customers whose delivery_days include the current weekday.

## 6. Screens

### Shared
- **Login** screen.
- **Language toggle** (EN / ع) always reachable.
- Saved-to-home-screen PWA: installable, app icon, works on phone browsers (iOS Safari + Android Chrome).

### Driver screens
- **My Route Today**: list of today's assigned customers in delivery order. Each stop is a card showing name (in selected language), area, and a "Navigate" button that opens location_url. Quick number inputs for **empties returned** and **bottles delivered** (big, thumb-friendly steppers). A **payment collected** field (amount + cash/other). Shows that customer's current money-owed balance so the driver knows if they're collecting a debt. A "Save stop" action. Visual checkmark once a stop is logged.
- **Today summary**: bottles delivered, empties collected, cash collected today, stops completed / remaining.

### Owner screens (all of the above for any route, plus:)
- **Customers manager**: searchable list of all customers. Add/edit/deactivate. Fields: name (EN + AR), area, map link, price per bottle, delivery day(s), assigned driver. Bulk-friendly since there are ~100 customers.
- **Payments & debt**: list of customers with money owed, sortable by amount, highlight overdue. Record a payment against any customer. See each customer's ledger (deliveries charged vs. payments made over time).
- **Reports** (simple): daily and weekly totals — revenue, bottles delivered, empties collected, empties still owed, cash collected. Per-driver breakdown. A by-customer view. Keep charts simple (totals + a basic bar/line is plenty for v1).
- **Drivers manager**: create driver accounts, assign customers/days to drivers, deactivate.

### Automatic behavior
- The "Today" view is always live — it derives from the current date and each customer's delivery days. There is nothing to reset and nothing to clear; yesterday's deliveries are already saved as permanent rows. This replaces the old spreadsheet's daily-reset/auto-archive entirely.

## 7. Tech stack (recommended — adjust if you have better)

- **Frontend**: React + Vite, TypeScript, Tailwind for styling. PWA-enabled (manifest + service worker, installable, offline-tolerant for viewing today's route). RTL support for Arabic.
- **Backend + DB + Auth**: Supabase (Postgres + row-level security + auth). Use RLS policies to enforce roles: drivers can only read/write their own route's deliveries and payments; owner can do everything.
- **Hosting**: Vercel (frontend) + Supabase (managed backend). Both have free tiers sufficient for this scale.
- **i18n**: a library like i18next for EN/AR strings.

If a simpler all-in-one approach is better for a solo non-technical operator to maintain, suggest it, but keep the role-based security and real database.

## 8. Security / correctness requirements

- Enforce roles server-side (RLS), not just by hiding UI. A driver must not be able to fetch another route's data even via the API.
- Store price-at-time-of-delivery so changing a customer's price later doesn't rewrite history.
- All money math derived from source rows, never from a mutable "balance" field, so totals are always auditable and correct.
- Hash passwords (Supabase auth handles this).

## 9. Seed data

Seed the database with the owner's real customers (provided separately as a JSON/CSV — ~97 unique customers across Saturday/Monday/Tuesday/Wednesday/Thursday; Sunday currently empty; Friday off). Each has: English name, Arabic name, area, and a map link for most. Price per bottle is not yet set for all — leave nullable and let the owner fill in via the Customers manager. Counts to expect: Saturday 6, Monday 22, Tuesday 24, Wednesday 22, Thursday 23.

## 10. Deliverables

1. Full working codebase (frontend + Supabase schema/migrations + RLS policies + seed script).
2. README with: how to run locally, how to set up the Supabase project, how to deploy to Vercel, how to create the owner account and add drivers, and how to import the customer seed data.
3. The PWA manifest + icons so it installs to a phone home screen.
4. Brief notes on monthly cost expectations and how to back up the database.

## 11. Build order (suggested)

1. Database schema + auth + roles + RLS.
2. Customer manager (owner) + seed import — so real data is in.
3. Driver "My Route Today" flow (the daily core).
4. Payments + debt.
5. Reports.
6. Bilingual/RTL pass + PWA install + polish.

Build it to be genuinely usable by a non-technical owner and drivers on their phones. Prioritize a fast, simple daily route-logging experience above everything else — that's the screen used most.
