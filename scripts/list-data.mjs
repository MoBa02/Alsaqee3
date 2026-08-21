// scripts/list-data.mjs
// Lists all non-ZZTEST data in the DB so we can identify manual-test rows.
// Read-only. Doesn't delete anything.
//
// Usage (PowerShell):
//   $env:DATABASE_URL = "postgresql://postgres:PASS@db.PROJECT.supabase.co:5432/postgres"
//   node scripts/list-data.mjs

import pg from 'pg'
const { Client } = pg

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) {
  console.error('Set DATABASE_URL first.')
  process.exit(1)
}

async function main() {
  const c = new Client({ connectionString: DB_URL })
  await c.connect()
  try {
    console.log('\n═══ EMPLOYEES (profiles + auth email) ═══')
    const { rows: emps } = await c.query(`
      SELECT p.id, p.name, p.role, p.active, u.email, p.created_at
      FROM public.profiles p
      LEFT JOIN auth.users u ON u.id = p.id
      WHERE p.name NOT LIKE 'ZZTEST_%'
      ORDER BY p.created_at
    `)
    for (const r of emps) {
      console.log(`  ${r.role.padEnd(8)} ${r.active ? 'ACTIVE' : 'INACTIVE'}  ${(r.name || '').padEnd(28)} ${r.email || ''}  ${r.id}`)
    }
    console.log(`  → ${emps.length} employees`)

    console.log('\n═══ CUSTOMERS ═══')
    const { rows: custs } = await c.query(`
      SELECT id, name_en, area, active, is_new, assigned_driver_id, created_at
      FROM public.customers
      WHERE name_en NOT LIKE 'ZZTEST_%'
      ORDER BY created_at
    `)
    for (const r of custs) {
      console.log(`  ${r.active ? 'ACTIVE  ' : 'INACTIVE'} ${r.is_new ? 'NEW ' : '    '} ${(r.name_en || '').padEnd(35)} area=${(r.area || '-').padEnd(12)} ${r.id}`)
    }
    console.log(`  → ${custs.length} customers`)

    console.log('\n═══ MEETINGS ═══')
    const { rows: mtgs } = await c.query(`
      SELECT m.id, m.contact_name, m.area, m.status, m.created_at,
             p.name AS sales_name
      FROM public.meetings m
      LEFT JOIN public.profiles p ON p.id = m.sales_id
      WHERE m.contact_name NOT LIKE 'ZZTEST_%'
      ORDER BY m.created_at DESC
    `)
    for (const r of mtgs) {
      console.log(`  ${r.status.padEnd(6)}  ${(r.contact_name || '').padEnd(28)} area=${(r.area || '-').padEnd(10)} sales=${(r.sales_name || '-').padEnd(20)} ${r.id}`)
    }
    console.log(`  → ${mtgs.length} meetings`)

    console.log('\n═══ DELIVERIES (non-ZZTEST customers) ═══')
    const { rows: dcount } = await c.query(`
      SELECT c.name_en, COUNT(*) AS n, MIN(d.date) AS first_date, MAX(d.date) AS last_date, SUM(d.amount_charged) AS revenue
      FROM public.deliveries d
      JOIN public.customers c ON c.id = d.customer_id
      WHERE c.name_en NOT LIKE 'ZZTEST_%'
      GROUP BY c.name_en
      ORDER BY MAX(d.date) DESC
    `)
    for (const r of dcount) {
      console.log(`  ${(r.name_en || '').padEnd(35)} count=${String(r.n).padEnd(4)} dates=${r.first_date?.toISOString().slice(0,10)} → ${r.last_date?.toISOString().slice(0,10)}  revenue=${Number(r.revenue ?? 0).toFixed(2)} AED`)
    }
    console.log(`  → ${dcount.length} customers with delivery history`)

    console.log('\n═══ PAYMENTS (non-ZZTEST customers) ═══')
    const { rows: pcount } = await c.query(`
      SELECT c.name_en, COUNT(*) AS n, SUM(p.amount) AS total
      FROM public.payments p
      JOIN public.customers c ON c.id = p.customer_id
      WHERE c.name_en NOT LIKE 'ZZTEST_%'
      GROUP BY c.name_en
      ORDER BY SUM(p.amount) DESC
    `)
    for (const r of pcount) {
      console.log(`  ${(r.name_en || '').padEnd(35)} count=${String(r.n).padEnd(4)} total=${Number(r.total ?? 0).toFixed(2)} AED`)
    }
    console.log(`  → ${pcount.length} customers with payment history`)

    console.log('\n═══ EXPENSES (non-ZZTEST drivers) ═══')
    const { rows: ex } = await c.query(`
      SELECT p.name AS driver, COUNT(*) AS n, SUM(e.amount) AS total
      FROM public.expenses e
      JOIN public.profiles p ON p.id = e.driver_id
      WHERE p.name NOT LIKE 'ZZTEST_%'
      GROUP BY p.name
      ORDER BY SUM(e.amount) DESC
    `)
    for (const r of ex) {
      console.log(`  ${(r.driver || '').padEnd(28)} count=${String(r.n).padEnd(4)} total=${Number(r.total ?? 0).toFixed(2)} AED`)
    }
    console.log(`  → ${ex.length} drivers with expense history`)
  } finally {
    await c.end()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
