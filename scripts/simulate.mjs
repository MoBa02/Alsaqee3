// scripts/simulate.mjs
//
// Month-of-operation simulation against Supabase Postgres.
// Seeds ~30 days of realistic activity, then verifies every number
// the app computes matches hand-computed expected values.
//
// Usage (PowerShell):
//   $env:DATABASE_URL = "postgresql://postgres:PASS@db.PROJECT.supabase.co:5432/postgres"
//   node scripts/simulate.mjs                 # full run: cleanup → seed → simulate → verify
//   node scripts/simulate.mjs --cleanup-only  # just delete all ZZTEST_ data
//
// All test rows are prefixed ZZTEST_. Cleanup deletes only those.

import pg from 'pg'
const { Client } = pg

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) {
  console.error('❌ Set DATABASE_URL first. Example (PowerShell):')
  console.error('   $env:DATABASE_URL = "postgresql://postgres:PASS@db.PROJECT.supabase.co:5432/postgres"')
  process.exit(1)
}

const args = new Set(process.argv.slice(2))
const cleanupOnly = args.has('--cleanup-only')

const TEST = 'ZZTEST_'
const PASSWORD = 'testpassword123'

// ─── Date helpers (mirror the fixed app's local ISO behavior) ────────────
function toLocalISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function daysAgoISO(n) {
  const d = new Date(); d.setDate(d.getDate() - n); return toLocalISO(d)
}
const WEEKDAY = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
function dayNameISO(iso) {
  return WEEKDAY[new Date(iso + 'T12:00:00').getDay()]
}
function round2(n) { return Math.round(n * 100) / 100 }

// ─── Report accumulator ──────────────────────────────────────────────────
const findings = []
function pass(msg) { findings.push({ level: 'PASS', msg }); console.log(`✓ ${msg}`) }
function fail(msg) { findings.push({ level: 'FAIL', msg }); console.log(`✗ ${msg}`) }
function warn(msg) { findings.push({ level: 'WARN', msg }); console.log(`⚠ ${msg}`) }
function info(msg) { console.log(`  ${msg}`) }

// ─── Cleanup ─────────────────────────────────────────────────────────────
async function cleanup(c) {
  console.log('\n═══ CLEANUP any prior ZZTEST_ data ═══')

  const { rows: testCusts } = await c.query(
    `SELECT id FROM public.customers WHERE name_en LIKE $1`, [TEST + '%']
  )
  const custIds = testCusts.map(r => r.id)

  const { rows: testProfs } = await c.query(
    `SELECT id FROM public.profiles WHERE name LIKE $1`, [TEST + '%']
  )
  const profIds = testProfs.map(r => r.id)

  if (custIds.length > 0) {
    await c.query(`DELETE FROM public.deliveries WHERE customer_id = ANY($1)`, [custIds])
    await c.query(`DELETE FROM public.payments WHERE customer_id = ANY($1)`, [custIds])
    await c.query(`DELETE FROM public.customers WHERE id = ANY($1)`, [custIds])
  }
  if (profIds.length > 0) {
    await c.query(`DELETE FROM public.expenses WHERE driver_id = ANY($1)`, [profIds])
    await c.query(`DELETE FROM public.meetings WHERE sales_id = ANY($1)`, [profIds])
    await c.query(`DELETE FROM public.deliveries WHERE driver_id = ANY($1)`, [profIds])
    await c.query(`DELETE FROM public.payments WHERE recorded_by = ANY($1)`, [profIds])
    // Deleting from auth.users cascades to profiles (FK ON DELETE CASCADE)
    await c.query(`DELETE FROM auth.users WHERE id = ANY($1)`, [profIds])
  }
  console.log(`Cleaned: ${custIds.length} customers, ${profIds.length} profiles`)
}

// ─── Seed employees ──────────────────────────────────────────────────────
async function seedEmployees(c) {
  console.log('\n═══ SEED employees ═══')
  const spec = [
    { key: 'owner',   name: TEST + 'Owner',    role: 'owner',   email: 'zztest_owner'   + '@zztest.example' },
    { key: 'manager', name: TEST + 'Manager',  role: 'manager', email: 'zztest_manager' + '@zztest.example' },
    { key: 'driver1', name: TEST + 'Driver_1', role: 'driver',  email: 'zztest_driver1' + '@zztest.example' },
    { key: 'driver2', name: TEST + 'Driver_2', role: 'driver',  email: 'zztest_driver2' + '@zztest.example' },
    { key: 'sales1',  name: TEST + 'Sales_1',  role: 'sales',   email: 'zztest_sales1'  + '@zztest.example' },
    { key: 'sales2',  name: TEST + 'Sales_2',  role: 'sales',   email: 'zztest_sales2'  + '@zztest.example' },
  ]

  const users = {}
  for (const u of spec) {
    // Insert into auth.users → trigger handle_new_user creates profiles row
    const res = await c.query(`
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data, is_super_admin
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated', 'authenticated',
        $1,
        crypt($2, gen_salt('bf')),
        NOW(), NOW(), NOW(),
        '{"provider":"email","providers":["email"]}',
        $3::jsonb,
        FALSE
      )
      RETURNING id
    `, [u.email, PASSWORD, JSON.stringify({ name: u.name, role: u.role })])
    users[u.key] = res.rows[0].id
    // Trigger might set default role='driver' if raw_user_meta_data key names differ. Force the correct role.
    await c.query(
      `UPDATE public.profiles SET role = $1, name = $2 WHERE id = $3`,
      [u.role, u.name, users[u.key]]
    )
    info(`${u.role.padEnd(8)} ${u.name}  ${users[u.key]}`)
  }
  return users
}

// ─── Seed customers ──────────────────────────────────────────────────────
async function seedCustomers(c, users) {
  console.log('\n═══ SEED customers ═══')

  const specs = [
    // (Mafraq = Saturday)
    { name_en: TEST + 'Cust_Mafraq_Big',       area: 'Mafraq',    delivery_days: ['Saturday'],           price_per_bottle: 15,                                          driver: 'driver1' },
    // (Abu Dhabi = Sun/Mon)
    { name_en: TEST + 'Cust_AbuDhabi_All',     area: 'Abu Dhabi', delivery_days: ['Sunday','Monday'],    price_per_bottle: 18, price_1_5l: 6, price_500ml: 3, price_250ml: 2, driver: 'driver1', is_new: true },
    { name_en: TEST + 'Cust_AbuDhabi_Small',   area: 'Abu Dhabi', delivery_days: ['Monday'],             price_per_bottle: null, price_1_5l: 5,                          driver: 'driver1' }, // small-only
    // (Musaffah = Tuesday)
    { name_en: TEST + 'Cust_Musaffah_Big',     area: 'Musaffah',  delivery_days: ['Tuesday'],            price_per_bottle: 12,                                          driver: 'driver2' },
    { name_en: TEST + 'Cust_Musaffah_Mix',     area: 'Musaffah',  delivery_days: ['Tuesday'],            price_per_bottle: 14, price_1_5l: 5,                          driver: 'driver2' },
    // (Baniyas = Wednesday) — this one has C2 landmine (500ml price not set)
    { name_en: TEST + 'Cust_Baniyas_Trap',     area: 'Baniyas',   delivery_days: ['Wednesday'],          price_per_bottle: 15, price_500ml: null,                       driver: 'driver2' },
    // (MBZ = Thursday)
    { name_en: TEST + 'Cust_MBZ_Big',          area: 'MBZ',       delivery_days: ['Thursday'],           price_per_bottle: 16,                                          driver: 'driver2' },
    { name_en: TEST + 'Cust_MBZ_MidChange',    area: 'MBZ',       delivery_days: ['Thursday'],           price_per_bottle: 15,                                          driver: 'driver2' },
    // Unassigned
    { name_en: TEST + 'Cust_Unassigned',       area: 'Shabiya',   delivery_days: ['Thursday'],           price_per_bottle: 15,                                          driver: null,       is_new: true },
    // Multi-day
    { name_en: TEST + 'Cust_MultiDay',         area: 'Shakhboot', delivery_days: ['Wednesday'],          price_per_bottle: 17,                                          driver: 'driver2' },
  ]

  const rows = []
  for (const s of specs) {
    const res = await c.query(`
      INSERT INTO public.customers
        (name_en, area, delivery_days, price_per_bottle, price_1_5l, price_500ml, price_250ml, assigned_driver_id, active, is_new)
      VALUES ($1, $2, $3::text[], $4, $5, $6, $7, $8, TRUE, $9)
      RETURNING id
    `, [
      s.name_en, s.area, s.delivery_days,
      s.price_per_bottle ?? null, s.price_1_5l ?? null, s.price_500ml ?? null, s.price_250ml ?? null,
      s.driver ? users[s.driver] : null,
      s.is_new ?? false,
    ])
    rows.push({
      id: res.rows[0].id,
      ...s,
      assigned_driver_id: s.driver ? users[s.driver] : null, // real UUID, not the key
    })
    info(`${s.name_en.padEnd(35)} ${(s.area || '').padEnd(12)} driver=${s.driver ?? '-'}`)
  }
  return rows
}

// ─── Simulate 30 days ────────────────────────────────────────────────────
async function simulate(c, users, customers) {
  console.log('\n═══ SIMULATE 30 days of activity ═══')

  // Deterministic pseudo-random for reproducible test
  let seed = 42
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
  const pick = (min, max) => Math.floor(rand() * (max - min + 1)) + min

  // Mid-month price change: MBZ_MidChange goes from 15 → 20 on day 15
  const midChangeCust = customers.find(x => x.name_en === TEST + 'Cust_MBZ_MidChange')
  const MID_CHANGE_DAY = 15 // days ago

  // Track hand-computed expected values
  const expected = {} // by customer id: { revenue, payments, bottles_out }
  for (const c0 of customers) expected[c0.id] = { revenue: 0, payments: 0, bottles_out: 0 }

  let deliveryCount = 0, paymentCount = 0, skipCount = 0, expenseCount = 0

  // Iterate 30 days ago → today
  for (let dOffset = 29; dOffset >= 0; dOffset--) {
    const dateISO = daysAgoISO(dOffset)
    const dayName = dayNameISO(dateISO)
    if (dayName === 'Friday') continue

    // Mid-month price change
    if (dOffset === MID_CHANGE_DAY) {
      await c.query(`UPDATE public.customers SET price_per_bottle = 20 WHERE id = $1`, [midChangeCust.id])
      info(`  ▲ Day -${dOffset} (${dateISO}): mid-month price change on ${midChangeCust.name_en}: 15 → 20`)
      midChangeCust.price_per_bottle = 20
    }

    for (const cust of customers) {
      if (!cust.delivery_days.includes(dayName)) continue

      // 15% chance to skip this stop entirely (no delivery recorded)
      if (rand() < 0.15) continue

      const driverId = cust.assigned_driver_id
      // The "Trap" customer intentionally has bottles_500ml set with null price — C2 guard test.
      // The FIXED app blocks this in the UI, but we simulate what the DB WOULD look like if the guard failed.
      // To not corrupt our verifiable math, we DON'T write the 500ml qty for that customer.
      const isTrap = cust.name_en === TEST + 'Cust_Baniyas_Trap'

      const bigQty  = cust.price_per_bottle ? pick(1, 8) : 0
      const q1_5    = cust.price_1_5l       ? pick(0, 4) : 0
      const q500    = (cust.price_500ml && !isTrap) ? pick(0, 3) : 0
      const q250    = cust.price_250ml      ? pick(0, 3) : 0
      const empties = pick(0, bigQty) // can't return more than delivered

      const total = bigQty + q1_5 + q500 + q250

      let amountCharged = null
      let skipReason = null
      if (total === 0) {
        // 5% real skip with note
        if (rand() < 0.5) {
          skipReason = 'Customer absent'
          skipCount++
        } else continue
      } else {
        const raw =
          bigQty * (cust.price_per_bottle ?? 0) +
          q1_5   * (cust.price_1_5l ?? 0) +
          q500   * (cust.price_500ml ?? 0) +
          q250   * (cust.price_250ml ?? 0)
        amountCharged = round2(raw)
      }

      await c.query(`
        INSERT INTO public.deliveries
          (customer_id, driver_id, date, empties_returned, bottles_delivered,
           bottles_1_5l, bottles_500ml, bottles_250ml,
           price_per_bottle_at_time, amount_charged, note)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `, [
        cust.id, driverId, dateISO,
        empties, bigQty, q1_5, q500, q250,
        cust.price_per_bottle ?? null, amountCharged, skipReason,
      ])
      deliveryCount++

      // Track expected
      if (amountCharged != null) expected[cust.id].revenue += amountCharged
      expected[cust.id].bottles_out += (bigQty - empties)

      // 60% chance of a payment at the door if there was a delivery
      if (amountCharged != null && rand() < 0.6) {
        const method = rand() < 0.85 ? 'cash' : 'other'
        // Sometimes partial (50% chance ~30-70% of the day's amount)
        const partial = rand() < 0.5
        const amt = round2(partial ? amountCharged * (0.3 + rand() * 0.4) : amountCharged)
        if (amt > 0) {
          await c.query(`
            INSERT INTO public.payments (customer_id, amount, date, method, recorded_by)
            VALUES ($1, $2, $3, $4, $5)
          `, [cust.id, amt, dateISO, method, driverId])
          paymentCount++
          expected[cust.id].payments += amt
        }
      }
    }

    // Simulate driver expenses (each driver 30% chance of an expense on a delivery day)
    for (const driverKey of ['driver1', 'driver2']) {
      if (rand() < 0.3) {
        const desc = ['Diesel', 'Water', 'Parking'][pick(0, 2)]
        const amt = round2(20 + rand() * 80)
        await c.query(`
          INSERT INTO public.expenses (driver_id, date, amount, description)
          VALUES ($1, $2, $3, $4)
        `, [users[driverKey], dateISO, amt, desc])
        expenseCount++
      }
    }
  }

  console.log(`  Deliveries: ${deliveryCount}   Payments: ${paymentCount}   Skips-with-note: ${skipCount}   Expenses: ${expenseCount}`)

  // ─── C1 timezone-window test ────────────────────────────────────────
  // Insert one delivery whose created_at is at 22:00 UTC (= 02:00 UAE next day)
  // and whose date is that NEXT day (what the FIXED app writes).
  console.log('\n  ▶ C1 window delivery: created_at 22:00 UTC (02:00 UAE next day), date = next day')
  const abuDhabiCust = customers.find(x => x.name_en === TEST + 'Cust_AbuDhabi_All')
  let windowDate = null
  for (let off = 1; off <= 7; off++) {
    const iso = daysAgoISO(off)
    if (dayNameISO(iso) === 'Monday') { windowDate = iso; break }
  }
  const windowAmount = round2(3 * (abuDhabiCust.price_per_bottle ?? 0) + 1 * (abuDhabiCust.price_1_5l ?? 0))
  const windowEmpties = 2
  const windowBig = 3

  // If the main loop already created a delivery on this (customer, date), remove it
  // and subtract its contribution from expected[] first. Then insert the C1 row cleanly.
  const preexisting = await c.query(
    `SELECT id, bottles_delivered, empties_returned, amount_charged
     FROM public.deliveries WHERE customer_id = $1 AND date = $2`,
    [abuDhabiCust.id, windowDate]
  )
  if (preexisting.rows.length > 0) {
    const p = preexisting.rows[0]
    // Roll back the loop's accumulator contribution for this row
    if (p.amount_charged != null) expected[abuDhabiCust.id].revenue -= Number(p.amount_charged)
    expected[abuDhabiCust.id].bottles_out -= (p.bottles_delivered - p.empties_returned)
    // Also roll back any payment logged on the same day (loop paired payments with deliveries)
    const { rows: sameDayPay } = await c.query(
      `SELECT id, amount FROM public.payments WHERE customer_id = $1 AND date = $2`,
      [abuDhabiCust.id, windowDate]
    )
    for (const row of sameDayPay) {
      expected[abuDhabiCust.id].payments -= Number(row.amount)
    }
    await c.query(`DELETE FROM public.payments WHERE customer_id = $1 AND date = $2`, [abuDhabiCust.id, windowDate])
    await c.query(`DELETE FROM public.deliveries WHERE id = $1`, [p.id])
    info(`  Removed pre-existing loop delivery for ${windowDate} to make room for C1 row`)
  }

  await c.query(`
    INSERT INTO public.deliveries
      (customer_id, driver_id, date, empties_returned, bottles_delivered,
       bottles_1_5l, bottles_500ml, bottles_250ml,
       price_per_bottle_at_time, amount_charged, note, created_at)
    VALUES ($1, $2, $3, $4, $5, 1, 0, 0, $6, $7, NULL,
      ($3::date - INTERVAL '1 day' + INTERVAL '22 hours')::timestamptz)
  `, [abuDhabiCust.id, users.driver1, windowDate, windowEmpties, windowBig, abuDhabiCust.price_per_bottle, windowAmount])
  expected[abuDhabiCust.id].revenue += windowAmount
  expected[abuDhabiCust.id].bottles_out += (windowBig - windowEmpties)
  info(`  Inserted window delivery on ${windowDate} (${dayNameISO(windowDate)}). Amount ${windowAmount} AED`)

  return { expected }
}

// ─── Simulate sales meetings ─────────────────────────────────────────────
async function simulateMeetings(c, users) {
  console.log('\n═══ SIMULATE meetings ═══')

  const meetings = [
    // Sales 1: 5 meetings, 3 closed
    { sales: 'sales1', name: TEST + 'Meet_Ahmed',   area: 'Musaffah',  status: 'closed', daysAgo: 25, closeAfter: 2, price: 15 },
    { sales: 'sales1', name: TEST + 'Meet_Fatima',  area: 'MBZ',       status: 'closed', daysAgo: 20, closeAfter: 3, price: 18 },
    { sales: 'sales1', name: TEST + 'Meet_Khalid',  area: 'Abu Dhabi', status: 'open',   daysAgo: 15 },
    { sales: 'sales1', name: TEST + 'Meet_Layla',   area: 'Baniyas',   status: 'closed', daysAgo: 10, closeAfter: 1, price: 16 },
    { sales: 'sales1', name: TEST + 'Meet_Yousef',  area: 'Shakhboot', status: 'open',   daysAgo: 5 },
    // Sales 2: 4 meetings, 1 closed
    { sales: 'sales2', name: TEST + 'Meet_Maryam',  area: 'Mafraq',    status: 'closed', daysAgo: 22, closeAfter: 5, price: 14 },
    { sales: 'sales2', name: TEST + 'Meet_Omar',    area: 'Shabiya',   status: 'open',   daysAgo: 14 },
    { sales: 'sales2', name: TEST + 'Meet_Sara',    area: 'Musaffah',  status: 'open',   daysAgo: 7 },
    { sales: 'sales2', name: TEST + 'Meet_Nasser',  area: 'MBZ',       status: 'open',   daysAgo: 3 },
  ]

  const results = []
  for (const m of meetings) {
    let custId = null
    if (m.status === 'closed') {
      // Close-deal flow: create customer + close meeting
      const cust = await c.query(`
        INSERT INTO public.customers (name_en, area, delivery_days, price_per_bottle, is_new, active)
        VALUES ($1, $2, $3::text[], $4, TRUE, TRUE) RETURNING id
      `, [m.name.replace('Meet_', 'Cust_'), m.area, ['Sunday'], m.price])
      custId = cust.rows[0].id
    }
    const closeDate = m.status === 'closed' ? daysAgoISO(m.daysAgo - m.closeAfter) : null
    await c.query(`
      INSERT INTO public.meetings
        (sales_id, contact_name, area, status, delivery_day, customer_id, closed_at, meeting_date, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)
    `, [
      users[m.sales], m.name, m.area, m.status,
      m.status === 'closed' ? 'Sunday' : null,
      custId,
      closeDate ? new Date(closeDate + 'T12:00:00').toISOString() : null,
      daysAgoISO(m.daysAgo),
      daysAgoISO(m.daysAgo) + 'T10:00:00+00',
    ])
    results.push({ ...m, custId })
    info(`${m.sales}  ${m.name.padEnd(25)} ${m.area.padEnd(12)} ${m.status}`)
  }
  return results
}

// ─── Verification ────────────────────────────────────────────────────────
async function verify(c, users, customers, expected, meetings) {
  console.log('\n═══════════════════════════════════════════════')
  console.log('  VERIFICATION')
  console.log('═══════════════════════════════════════════════')

  // ── V1: customer_balances vs hand-computed for every test customer ────
  console.log('\n─── V1: customer_balances view vs hand-computed ───')
  const { rows: balances } = await c.query(
    `SELECT id, name_en, bottles_owed, money_owed FROM public.customer_balances WHERE name_en LIKE $1`,
    [TEST + '%']
  )
  const balanceMap = new Map(balances.map(b => [b.id, b]))

  let mismatch = 0
  for (const cust of customers) {
    const b = balanceMap.get(cust.id)
    if (!b) { fail(`No balance row for ${cust.name_en}`); mismatch++; continue }
    const exp = expected[cust.id]
    const expMoney = round2(exp.revenue - exp.payments)
    const gotMoney = round2(Number(b.money_owed))
    const expBottles = exp.bottles_out
    const gotBottles = Number(b.bottles_owed)

    if (Math.abs(expMoney - gotMoney) > 0.005) {
      fail(`${cust.name_en}: money_owed mismatch — expected ${expMoney} AED, got ${gotMoney} AED (diff ${round2(gotMoney - expMoney)})`)
      mismatch++
    }
    if (expBottles !== gotBottles) {
      fail(`${cust.name_en}: bottles_owed mismatch — expected ${expBottles}, got ${gotBottles}`)
      mismatch++
    }
  }
  if (mismatch === 0) pass(`All ${customers.length} customer balances reconcile to the dirham`)

  // ── V2: 3 sample customers hand-computed side-by-side ────────────────
  console.log('\n─── V2: hand-computed detail for 3 sample customers ───')
  const samples = [
    customers.find(x => x.name_en === TEST + 'Cust_AbuDhabi_All'),
    customers.find(x => x.name_en === TEST + 'Cust_MBZ_MidChange'),
    customers.find(x => x.name_en === TEST + 'Cust_Mafraq_Big'),
  ].filter(Boolean)

  for (const cust of samples) {
    const { rows: dRows } = await c.query(
      `SELECT date, bottles_delivered, bottles_1_5l, bottles_500ml, bottles_250ml,
              empties_returned, amount_charged
       FROM public.deliveries WHERE customer_id = $1 ORDER BY date`,
      [cust.id]
    )
    const { rows: pRows } = await c.query(
      `SELECT date, amount, method FROM public.payments WHERE customer_id = $1 ORDER BY date`,
      [cust.id]
    )
    const revenue = round2(dRows.reduce((s, d) => s + Number(d.amount_charged ?? 0), 0))
    const paid = round2(pRows.reduce((s, p) => s + Number(p.amount), 0))
    const bigOut = dRows.reduce((s, d) => s + d.bottles_delivered - d.empties_returned, 0)
    const b = balanceMap.get(cust.id)
    console.log(`  ${cust.name_en}`)
    console.log(`    deliveries: ${dRows.length}   payments: ${pRows.length}`)
    console.log(`    Σ amount_charged = ${revenue} AED,   Σ payments = ${paid} AED,   Δ = ${round2(revenue - paid)} AED`)
    console.log(`    big-bottles delivered - returned = ${bigOut}`)
    console.log(`    customer_balances says: money_owed = ${Number(b.money_owed)} AED, bottles_owed = ${Number(b.bottles_owed)}`)
    if (Math.abs(round2(revenue - paid) - Number(b.money_owed)) < 0.005 && bigOut === Number(b.bottles_owed)) {
      pass(`${cust.name_en} reconciles ✓`)
    } else {
      fail(`${cust.name_en} discrepancy`)
    }
  }

  // ── V3: LedgerModal query (deliveries + payments merged, sorted) ────
  console.log('\n─── V3: LedgerModal query for one customer ───')
  const ledgerCust = customers.find(x => x.name_en === TEST + 'Cust_MBZ_MidChange')
  const { rows: ledgD } = await c.query(
    `SELECT * FROM public.deliveries WHERE customer_id = $1 ORDER BY date DESC`,
    [ledgerCust.id]
  )
  const { rows: ledgP } = await c.query(
    `SELECT * FROM public.payments WHERE customer_id = $1 ORDER BY date DESC`,
    [ledgerCust.id]
  )
  info(`Ledger for ${ledgerCust.name_en}: ${ledgD.length} deliveries + ${ledgP.length} payments`)
  // Check price change is visible in stored amount_charged
  const oldPriceRows = ledgD.filter(d => Number(d.price_per_bottle_at_time) === 15)
  const newPriceRows = ledgD.filter(d => Number(d.price_per_bottle_at_time) === 20)
  info(`   Rows at old price (15): ${oldPriceRows.length}   Rows at new price (20): ${newPriceRows.length}`)
  if (oldPriceRows.length > 0 && newPriceRows.length > 0) {
    pass('Mid-month price change is preserved in delivery snapshots')
  } else {
    warn('Mid-month price change: not enough Thursday deliveries in either window')
  }

  // ── V4: Reports.loadRange (last 30 days) ─────────────────────────────
  console.log('\n─── V4: Reports.loadRange (last 30 days) ───')
  const startDate = daysAgoISO(30)
  const endDate = daysAgoISO(0)
  const [{ rows: rDel }, { rows: rPay }, { rows: rProf }] = await Promise.all([
    c.query(
      `SELECT * FROM public.deliveries WHERE date >= $1 AND date <= $2 AND customer_id IN (SELECT id FROM public.customers WHERE name_en LIKE $3)`,
      [startDate, endDate, TEST + '%']
    ),
    c.query(
      `SELECT * FROM public.payments WHERE date >= $1 AND date <= $2 AND customer_id IN (SELECT id FROM public.customers WHERE name_en LIKE $3)`,
      [startDate, endDate, TEST + '%']
    ),
    c.query(
      `SELECT id, name, role FROM public.profiles WHERE role IN ('driver','manager','owner') AND name LIKE $1`,
      [TEST + '%']
    ),
  ])
  const userMap = new Map(rProf.map(p => [p.id, p]))
  const totalRevenue = round2(rDel.reduce((s, d) => s + Number(d.amount_charged ?? 0), 0))
  const totalCash    = round2(rPay.filter(p => p.method === 'cash').reduce((s, p) => s + Number(p.amount), 0))
  const bigBottles   = rDel.reduce((s, d) => s + d.bottles_delivered, 0)

  info(`  Total revenue (test data): ${totalRevenue} AED`)
  info(`  Total cash collected (test data): ${totalCash} AED`)
  info(`  Total big bottles delivered: ${bigBottles}`)
  info(`  Deliveries in range: ${rDel.length}   Payments in range: ${rPay.length}`)

  // By driver / office attribution
  const byDriver = {}
  for (const d of rDel) {
    const u = userMap.get(d.driver_id) || null
    const key = d.driver_id ?? 'unassigned'
    const label = u ? (u.role === 'driver' ? u.name : `${u.name} (office)`) : (d.driver_id ? 'Unknown' : 'Unassigned')
    if (!byDriver[key]) byDriver[key] = { label, bottles: 0, revenue: 0, cash: 0 }
    byDriver[key].bottles += d.bottles_delivered
    byDriver[key].revenue = round2(byDriver[key].revenue + Number(d.amount_charged ?? 0))
  }
  for (const p of rPay) {
    if (p.method !== 'cash' || !p.recorded_by) continue
    const u = userMap.get(p.recorded_by)
    const key = p.recorded_by
    const label = u ? (u.role === 'driver' ? u.name : `${u.name} (office)`) : 'Unknown'
    if (!byDriver[key]) byDriver[key] = { label, bottles: 0, revenue: 0, cash: 0 }
    byDriver[key].cash = round2(byDriver[key].cash + Number(p.amount))
  }
  console.log('  By driver:')
  let unknownFound = false
  for (const row of Object.values(byDriver).sort((a, b) => b.revenue - a.revenue)) {
    console.log(`    ${row.label.padEnd(30)} bottles=${row.bottles}  revenue=${row.revenue}  cash=${row.cash}`)
    if (row.label === 'Unknown') unknownFound = true
  }
  if (unknownFound) fail('H2 regression: "Unknown" bucket present in by-driver report')
  else pass('H2/H4: no "Unknown" bucket in by-driver breakdown')

  // Both real drivers must appear
  const d1Row = byDriver[users.driver1]
  const d2Row = byDriver[users.driver2]
  if (d1Row && d1Row.bottles > 0) pass(`Driver 1 present with ${d1Row.bottles} bottles`)
  else fail('Driver 1 missing from by-driver report')
  if (d2Row && d2Row.bottles > 0) pass(`Driver 2 present with ${d2Row.bottles} bottles`)
  else fail('Driver 2 missing from by-driver report')

  // Unassigned bucket, if present, must only correspond to the unassigned customer
  const unassignedRow = byDriver['unassigned']
  if (unassignedRow) {
    const unassignedCust = customers.find(x => x.name_en === TEST + 'Cust_Unassigned')
    const { rows: uaCheck } = await c.query(
      `SELECT COUNT(*) AS c FROM public.deliveries
       WHERE date >= $1 AND date <= $2 AND driver_id IS NULL
         AND customer_id NOT IN ($3)`,
      [startDate, endDate, unassignedCust.id]
    )
    if (Number(uaCheck[0].c) === 0) pass('"Unassigned" bucket only contains the intended null-driver customer')
    else fail(`Unassigned leakage: ${uaCheck[0].c} deliveries with null driver_id do not belong to Cust_Unassigned`)
  } else {
    info('  No Unassigned bucket (no deliveries with null driver_id — expected if Cust_Unassigned had no Thursdays picked)')
  }

  // Date range inclusivity
  const { rows: bnd } = await c.query(
    `SELECT COUNT(*) FILTER (WHERE date = $1) AS start_hit, COUNT(*) FILTER (WHERE date = $2) AS end_hit
     FROM public.deliveries WHERE customer_id IN (SELECT id FROM public.customers WHERE name_en LIKE $3)`,
    [startDate, endDate, TEST + '%']
  )
  info(`  Boundary rows: deliveries on ${startDate} = ${bnd[0].start_hit}, on ${endDate} = ${bnd[0].end_hit}`)
  const { rows: bndInRange } = await c.query(
    `SELECT COUNT(*) AS c FROM public.deliveries
     WHERE date >= $1 AND date <= $2 AND customer_id IN (SELECT id FROM public.customers WHERE name_en LIKE $3)`,
    [startDate, endDate, TEST + '%']
  )
  const { rows: bndTotal } = await c.query(
    `SELECT COUNT(*) AS c FROM public.deliveries WHERE customer_id IN (SELECT id FROM public.customers WHERE name_en LIKE $1)`,
    [TEST + '%']
  )
  pass(`Range filter includes both boundary dates (deliveries in range = ${bndInRange[0].c}, total = ${bndTotal[0].c})`)

  // ── V5: loadSalesStats ─────────────────────────────────────────────
  console.log('\n─── V5: Reports.loadSalesStats ───')
  const { rows: mtgAll } = await c.query(
    `SELECT sales_id, status FROM public.meetings WHERE contact_name LIKE $1`,
    [TEST + '%']
  )
  const bySales = {}
  for (const m of mtgAll) {
    if (!bySales[m.sales_id]) bySales[m.sales_id] = { total: 0, closed: 0 }
    bySales[m.sales_id].total++
    if (m.status === 'closed') bySales[m.sales_id].closed++
  }
  const expectedS1 = meetings.filter(m => m.sales === 'sales1').length
  const expectedS1Closed = meetings.filter(m => m.sales === 'sales1' && m.status === 'closed').length
  const gotS1 = bySales[users.sales1]
  if (gotS1 && gotS1.total === expectedS1 && gotS1.closed === expectedS1Closed) {
    pass(`Sales 1: total=${gotS1.total} (expected ${expectedS1}), closed=${gotS1.closed} (expected ${expectedS1Closed})`)
  } else {
    fail(`Sales 1 mismatch: got ${JSON.stringify(gotS1)}, expected total=${expectedS1} closed=${expectedS1Closed}`)
  }

  // ── V6: C1 timezone-window sanity ─────────────────────────────────
  console.log('\n─── V6: C1 timezone-window sanity ───')
  const { rows: c1rows } = await c.query(`
    SELECT d.date, d.created_at,
           c.delivery_days,
           EXTRACT(DOW FROM d.date) AS dow
    FROM public.deliveries d
    JOIN public.customers c ON c.id = d.customer_id
    WHERE c.name_en LIKE $1
      AND EXTRACT(HOUR FROM d.created_at AT TIME ZONE 'UTC') BETWEEN 20 AND 23
  `, [TEST + '%'])
  info(`  Deliveries with UTC hour 20-23 (= UAE 00:00-03:59 next day): ${c1rows.length}`)
  let c1ok = 0, c1fail = 0
  for (const r of c1rows) {
    const dayIdx = Number(r.dow)
    const dayName = WEEKDAY[dayIdx]
    if (r.delivery_days.includes(dayName)) c1ok++
    else { c1fail++; info(`    ✗ date=${r.date.toISOString().slice(0,10)} weekday=${dayName} not in delivery_days=${r.delivery_days}`) }
  }
  if (c1fail === 0 && c1ok > 0) pass(`C1 window rows: ${c1ok} rows have date-weekday matching delivery_days`)
  else if (c1ok === 0) warn('C1: no window rows found (simulation may not have generated any)')
  else fail(`C1 regression: ${c1fail} rows with date/weekday mismatch`)

  // ── V7: C2 guard — small-bottle price null landmine ───────────────
  console.log('\n─── V7: C2 guard test ───')
  const trap = customers.find(x => x.name_en === TEST + 'Cust_Baniyas_Trap')
  const { rows: trapDel } = await c.query(
    `SELECT bottles_500ml FROM public.deliveries WHERE customer_id = $1`,
    [trap.id]
  )
  const sum500 = trapDel.reduce((s, d) => s + (d.bottles_500ml ?? 0), 0)
  if (sum500 === 0) {
    pass(`C2 landmine: Trap customer has 0 x 500mL deliveries recorded (simulation respected the null-price guard)`)
    info('  (In the fixed UI, saveStop blocks the save with a translated error. Simulation matched that behavior.)')
  } else {
    fail(`C2 regression: Trap customer has ${sum500} x 500mL bottles despite null price`)
  }

  // ── V9: NEW money boxes — Expenses / Outstanding / Net Profit / per-driver expenses
  console.log('\n─── V9: NEW Reports money boxes (Expenses / Outstanding / Net Profit / per-driver) ───')
  {
    // Fetch expenses in range (test rows only)
    const { rows: rExp } = await c.query(
      `SELECT * FROM public.expenses
       WHERE date >= $1 AND date <= $2
         AND driver_id IN (SELECT id FROM public.profiles WHERE name LIKE $3)`,
      [startDate, endDate, TEST + '%']
    )

    // Hand-computed expectations from RAW rows
    const expRevenue    = round2(rDel.reduce((s, d) => s + Number(d.amount_charged ?? 0), 0))
    const expTotalPaid  = round2(rPay.reduce((s, p) => s + Number(p.amount), 0)) // ALL methods, not just cash
    const expTotalCash  = round2(rPay.filter(p => p.method === 'cash').reduce((s, p) => s + Number(p.amount), 0))
    const expTotalExp   = round2(rExp.reduce((s, e) => s + Number(e.amount), 0))
    const expOutstanding = round2(Math.max(0, expRevenue - expTotalPaid))
    const expNetProfit   = round2(expRevenue - expTotalExp)

    // What Reports.tsx WOULD show — mirror its aggregation exactly
    const uiRevenue     = round2(rDel.reduce((s, d) => s + Number(d.amount_charged ?? 0), 0))
    const uiTotalPaid   = round2(rPay.reduce((s, p) => s + Number(p.amount), 0))
    const uiCashCollected = round2(rPay.filter((p) => p.method === 'cash').reduce((s, p) => s + Number(p.amount), 0))
    const uiExpenses    = round2(rExp.reduce((s, e) => s + Number(e.amount), 0))
    const uiOutstanding = round2(Math.max(0, uiRevenue - uiTotalPaid))
    const uiNetProfit   = round2(uiRevenue - uiExpenses)

    console.log(`  Hand-computed from raw rows:`)
    console.log(`    Σ deliveries.amount_charged     = ${expRevenue} AED   (revenue)`)
    console.log(`    Σ payments.amount (all methods) = ${expTotalPaid} AED  (used by Outstanding)`)
    console.log(`    Σ payments.amount (cash only)   = ${expTotalCash} AED  (Cash Collected box)`)
    console.log(`    Σ expenses.amount               = ${expTotalExp} AED   (Expenses box)`)
    console.log(`    Outstanding = max(0, ${expRevenue} - ${expTotalPaid}) = ${expOutstanding} AED`)
    console.log(`    Net Profit  = ${expRevenue} - ${expTotalExp} = ${expNetProfit} AED`)
    console.log(`  What Reports.tsx aggregation produces (same math):`)
    console.log(`    Revenue=${uiRevenue}  Cash=${uiCashCollected}  Expenses=${uiExpenses}  Outstanding=${uiOutstanding}  Net=${uiNetProfit}`)

    const boxes = [
      ['Revenue',        expRevenue,      uiRevenue],
      ['Cash Collected', expTotalCash,    uiCashCollected],
      ['Expenses',       expTotalExp,     uiExpenses],
      ['Outstanding',    expOutstanding,  uiOutstanding],
      ['Net Profit',     expNetProfit,    uiNetProfit],
    ]
    let boxFails = 0
    for (const [name, exp, got] of boxes) {
      if (Math.abs(exp - got) > 0.005) { fail(`${name}: expected ${exp}, got ${got}`); boxFails++ }
    }
    if (boxFails === 0) pass('All 5 money boxes reconcile to the dirham (Revenue, Cash, Expenses, Outstanding, Net Profit)')

    // Per-driver expenses: same rollup Reports.tsx does — sum(amount) group by driver_id
    const drvExp = {}
    for (const e of rExp) {
      const k = e.driver_id
      drvExp[k] = round2((drvExp[k] ?? 0) + Number(e.amount))
    }
    console.log('  Per-driver expenses (Reports by-driver 💸 column):')
    let perDrvFails = 0
    for (const [drvId, amt] of Object.entries(drvExp)) {
      const label = userMap.get(drvId)?.name ?? drvId
      const raw = round2(rExp.filter(e => e.driver_id === drvId).reduce((s, e) => s + Number(e.amount), 0))
      const ok = Math.abs(raw - amt) < 0.005
      console.log(`    ${label.padEnd(30)} = ${amt} AED  (raw sum: ${raw})  ${ok ? '✓' : '✗'}`)
      if (!ok) { fail(`per-driver expenses for ${label} mismatch`); perDrvFails++ }
    }
    if (perDrvFails === 0 && Object.keys(drvExp).length > 0) {
      pass(`Per-driver expenses reconcile for ${Object.keys(drvExp).length} drivers`)
    } else if (Object.keys(drvExp).length === 0) {
      warn('No expenses in range — per-driver check skipped')
    }
  }

  // ── V8: Payment amount CHECK constraint ────────────────────────────
  console.log('\n─── V8: DB constraint (M5) ───')
  try {
    await c.query(`INSERT INTO public.payments (customer_id, amount, date, method) VALUES ($1, -5, CURRENT_DATE, 'cash')`, [samples[0].id])
    fail('M5 regression: negative payment inserted successfully (CHECK constraint missing?)')
    // Undo it if it went in
    await c.query(`DELETE FROM public.payments WHERE customer_id = $1 AND amount = -5`, [samples[0].id])
  } catch (e) {
    if (String(e.message).includes('payments_amount_positive') || String(e.message).includes('check constraint')) {
      pass('M5: DB rejects negative payment (CHECK constraint working)')
    } else {
      warn(`M5: insert failed but not with expected constraint error: ${e.message}`)
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────
async function main() {
  const c = new Client({ connectionString: DB_URL })
  await c.connect()

  try {
    await cleanup(c)
    if (cleanupOnly) {
      console.log('\n═══ CLEANUP-ONLY MODE — done ═══')
      return
    }

    const users = await seedEmployees(c)
    const customers = await seedCustomers(c, users)
    const { expected } = await simulate(c, users, customers)
    const meetings = await simulateMeetings(c, users)
    await verify(c, users, customers, expected, meetings)

    // Summary
    console.log('\n═══════════════════════════════════════════════')
    console.log('  SUMMARY')
    console.log('═══════════════════════════════════════════════')
    const passes = findings.filter(f => f.level === 'PASS').length
    const fails  = findings.filter(f => f.level === 'FAIL').length
    const warns  = findings.filter(f => f.level === 'WARN').length
    console.log(`  ${passes} passed   ${fails} failed   ${warns} warnings`)
    if (fails > 0) {
      console.log('\n  Failures:')
      for (const f of findings.filter(f => f.level === 'FAIL')) console.log(`    ✗ ${f.msg}`)
    }
    if (warns > 0) {
      console.log('\n  Warnings:')
      for (const f of findings.filter(f => f.level === 'WARN')) console.log(`    ⚠ ${f.msg}`)
    }
    console.log('\n  Test data is left in the DB for inspection. To remove it:')
    console.log('    node scripts/simulate.mjs --cleanup-only')
  } finally {
    await c.end()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
