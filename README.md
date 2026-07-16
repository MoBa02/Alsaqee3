# Water Delivery Manager

A phone-friendly PWA for managing water bottle deliveries, customers, and payments. Built with React + Vite + Supabase.

---

## Quick summary

- **Drivers** log in and see today's route. They record empties returned, bottles delivered, and any payment collected per stop.
- **Owner** manages customers, sees all routes, records payments, and views reports.
- Fully bilingual English / Arabic (RTL) with a toggle button.
- Installs to phone home screen as a PWA.

---

## Prerequisites

- Node.js 18+
- A free [Supabase](https://supabase.com) account
- A free [Vercel](https://vercel.com) account (for deployment)

---

## 1. Set up Supabase

### 1a. Create a project

1. Go to [supabase.com](https://supabase.com) → New project
2. Choose a name, database password, and region (pick one close to UAE: Frankfurt or Singapore)
3. Wait for the project to spin up (~2 minutes)

### 1b. Run the schema

1. In Supabase Dashboard → **SQL Editor** → New query
2. Paste the contents of `supabase/migrations/001_schema.sql`
3. Click **Run**

### 1c. Seed customers

1. SQL Editor → New query
2. Paste the contents of `supabase/seed.sql`
3. Click **Run**

You should now have 94 customers across Saturday–Thursday routes.

### 1d. Create the owner account

1. Supabase Dashboard → **Authentication** → **Users** → **Add user**
2. Enter your email and a strong password → **Create user**
3. Copy the new user's UUID
4. Run this SQL (replace `<UUID>` and `<Your Name>`):

```sql
INSERT INTO public.profiles (id, name, role)
VALUES ('<UUID>', '<Your Name>', 'owner')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = 'owner';
```

### 1e. Get your API keys

Supabase Dashboard → **Settings** → **API**:
- **Project URL** → `VITE_SUPABASE_URL`
- **anon / public key** → `VITE_SUPABASE_ANON_KEY`
- **service_role key** → needed for the Edge Function (keep secret!)

---

## 2. Run locally

```bash
# Clone / open the project folder
cd "path/to/App"

# Copy environment file
copy .env.example .env

# Edit .env with your Supabase keys
# VITE_SUPABASE_URL=https://xxxx.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJ...

npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and sign in with your owner account.

---

## 3. Add drivers

### Option A: Supabase Dashboard (simple)

1. Supabase → Authentication → Users → Add user → set email + password
2. Copy the new UUID, then run:

```sql
INSERT INTO public.profiles (id, name, role)
VALUES ('<UUID>', 'Driver Name', 'driver')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = 'driver';
```

3. In the app → Drivers tab → assign customers to that driver.

### Option B: In-app form (requires Edge Function)

Deploy the Edge Function first (see §4 below), then use the **Drivers** tab → **Add Driver** form.

---

## 4. Deploy the Edge Function (for in-app driver creation)

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project (find project-ref in Supabase dashboard URL)
supabase link --project-ref <your-project-ref>

# Set the service role secret
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Deploy
supabase functions deploy create-driver
```

---

## 5. Deploy to Vercel

### 5a. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/water-delivery-app.git
git push -u origin main
```

### 5b. Deploy on Vercel

1. [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Framework: **Vite** (auto-detected)
3. Add environment variables:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
4. Click **Deploy**

Your app will be live at `https://your-app.vercel.app`.

### 5c. Install on phones

- **Android**: open Chrome → three-dot menu → **Add to Home Screen**
- **iOS**: open Safari → Share button → **Add to Home Screen**

---

## 6. Assign customers to drivers

After creating driver accounts:

1. Sign in as owner → **Customers** tab
2. Tap **Edit** on each customer
3. Set **Assigned Driver** and **Delivery Days**
4. Save

---

## 7. Daily workflow

**Driver:**
1. Opens app → sees today's route automatically (based on weekday + their assignment)
2. Taps each stop card → records empties returned, bottles delivered, payment (if any)
3. Taps **Save stop** → green checkmark appears
4. Can see **Summary** tab for today's totals

**Owner:**
1. Opens app → can view any driver's route for any date
2. **Payments** tab → see all outstanding debts, record lump-sum payments, view full ledger
3. **Reports** tab → daily and weekly breakdowns by driver and customer
4. **Customers** tab → add/edit customers, set prices, assign drivers

---

## 8. Setting bottle prices

After import, all prices are null. Set them per-customer:

1. **Customers** tab → Edit → **Price per Bottle** field
2. Prices are copied at delivery time, so changing a price never rewrites history

---

## Database structure

| Table | Purpose |
|-------|---------|
| `profiles` | Owner + driver accounts (extends Supabase auth) |
| `customers` | All customer data, delivery days, assigned driver |
| `deliveries` | One row per customer per date — bottles delivered, empties returned |
| `payments` | Cash and other payments from customers |
| `customer_balances` | View — computed bottles owed + money owed (never stored) |

**Balances are always derived from source rows** — there is no mutable "balance" field. Totals are always correct and auditable.

---

## Cost expectations

| Service | Plan | Monthly cost |
|---------|------|--------------|
| Supabase | Free | $0 (up to 500 MB DB, 50k auth users) |
| Vercel | Free | $0 (up to 100 GB bandwidth) |
| **Total** | | **$0** for this scale |

As the business grows: Supabase Pro is $25/mo, Vercel Pro is $20/mo.

---

## Backup

Supabase Dashboard → **Settings** → **Database** → **Backups**:
- Free plan: 7-day point-in-time backups
- Manual backup anytime: Dashboard → SQL Editor → run `pg_dump` or use the export feature

For extra safety, schedule a weekly SQL export:
```
Supabase Dashboard → SQL Editor → run query → Export as CSV
```

---

## Troubleshooting

**"No customers today"**: Make sure customers have `delivery_days` set and `assigned_driver_id` pointing to the logged-in driver's profile ID.

**Prices showing "—"**: Set the price per bottle in the Customers tab. Deliveries with no price show zero revenue.

**Driver can see other customers**: Check RLS policies were applied (re-run the schema SQL). Make sure `is_owner()` function exists.

**Arabic not displaying correctly**: The app uses the system font which includes Arabic glyphs on all modern phones. iOS and Android both handle this correctly.
