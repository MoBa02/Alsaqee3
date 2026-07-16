import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Delivery, Payment, Profile, Customer, Meeting, Expense, formatCurrency, formatDate, toLocalISO, todayLocalISO } from '@/types'

type TopTab = 'driver' | 'sales'

interface RangeStats {
  revenue: number
  bottlesDelivered: number
  bottles1_5l: number
  bottles500ml: number
  bottles250ml: number
  emptiesCollected: number
  cashCollected: number
  expenses: number
  outstanding: number
  stops: number
  byDriver: Array<{ name: string; bottles: number; bottles1_5l: number; bottles500ml: number; bottles250ml: number; revenue: number; cash: number; expenses: number }>
  byCustomer: Array<{ name: string; bottles: number; revenue: number }>
  byDay: Array<{ day: string; bottles: number; revenue: number }>
}

interface SalesPersonStats {
  name: string
  salesId: string
  total: number
  closed: number
  meetings: Meeting[]
}

interface SalesStats {
  total: number
  open: number
  closed: number
  bySales: SalesPersonStats[]
}

function weekAgo() {
  const d = new Date()
  d.setDate(d.getDate() - 6)
  return toLocalISO(d)
}

function firstOfThisMonth() {
  const d = new Date()
  d.setDate(1)
  return toLocalISO(d)
}

function firstOfLastMonth() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1, 1)
  return toLocalISO(d)
}

function lastOfLastMonth() {
  const d = new Date()
  d.setDate(0)
  return toLocalISO(d)
}

export default function Reports() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const isSalesRole = profile?.role === 'sales'
  const isAdmin = profile?.role === 'owner' || profile?.role === 'manager'

  const [topTab, setTopTab] = useState<TopTab>(isSalesRole ? 'sales' : 'driver')
  const [startDate, setStartDate] = useState(weekAgo())
  const [endDate, setEndDate] = useState(todayLocalISO())
  const [stats, setStats] = useState<RangeStats | null>(null)
  const [salesStats, setSalesStats] = useState<SalesStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (topTab === 'sales') loadSalesStats()
    else loadRange()
  }, [topTab, startDate, endDate])

  async function loadRange() {
    setLoading(true)

    const [
      { data: deliveries, error: delErr },
      { data: payments, error: payErr },
      { data: profiles, error: prfErr },
      { data: customers, error: custErr },
      { data: expenses, error: expErr },
    ] = await Promise.all([
      supabase.from('deliveries').select('*').gte('date', startDate).lte('date', endDate),
      supabase.from('payments').select('*').gte('date', startDate).lte('date', endDate),
      supabase.from('profiles').select('id, name, role').in('role', ['driver', 'manager', 'owner']),
      supabase.from('customers').select('id, name_en').eq('active', true),
      supabase.from('expenses').select('*').gte('date', startDate).lte('date', endDate),
    ])

    const firstErr = delErr ?? payErr ?? prfErr ?? custErr ?? expErr
    if (firstErr) {
      console.error('Reports load error:', firstErr)
    }

    const dList = (deliveries ?? []) as Delivery[]
    const pList = (payments ?? []) as Payment[]
    const eList = (expenses ?? []) as Expense[]
    const profList = (profiles ?? []) as Pick<Profile, 'id' | 'name' | 'role'>[]
    const userMap = new Map(profList.map((p) => [p.id, { name: p.name, role: p.role }]))
    const custMap = new Map(((customers ?? []) as Pick<Customer, 'id' | 'name_en'>[]).map((c) => [c.id, c.name_en]))

    const labelFor = (userId: string | null | undefined, fallback: string) => {
      if (!userId) return fallback
      const u = userMap.get(userId)
      if (!u) return 'Unknown'
      return u.role === 'driver' ? u.name : `${u.name} (office)`
    }

    // By driver — deliveries
    const driverMap: Record<string, { name: string; bottles: number; bottles1_5l: number; bottles500ml: number; bottles250ml: number; revenue: number; cash: number; expenses: number }> = {}
    const emptyDriverRow = (name: string) => ({ name, bottles: 0, bottles1_5l: 0, bottles500ml: 0, bottles250ml: 0, revenue: 0, cash: 0, expenses: 0 })
    for (const d of dList) {
      const key = d.driver_id ?? 'unassigned'
      if (!driverMap[key]) driverMap[key] = emptyDriverRow(labelFor(d.driver_id, 'Unassigned'))
      driverMap[key].bottles += d.bottles_delivered
      driverMap[key].bottles1_5l += d.bottles_1_5l ?? 0
      driverMap[key].bottles500ml += d.bottles_500ml ?? 0
      driverMap[key].bottles250ml += d.bottles_250ml ?? 0
      driverMap[key].revenue += Number(d.amount_charged ?? 0)
    }
    for (const p of pList) {
      if (p.method === 'cash' && p.recorded_by) {
        const key = p.recorded_by
        if (!driverMap[key]) driverMap[key] = emptyDriverRow(labelFor(p.recorded_by, 'Unknown'))
        driverMap[key].cash += Number(p.amount)
      }
    }
    for (const e of eList) {
      const key = e.driver_id
      if (!driverMap[key]) driverMap[key] = emptyDriverRow(labelFor(e.driver_id, 'Unknown'))
      driverMap[key].expenses += Number(e.amount)
    }

    // By customer
    const custStatsMap: Record<string, { name: string; bottles: number; revenue: number }> = {}
    for (const d of dList) {
      const key = d.customer_id
      if (!custStatsMap[key]) custStatsMap[key] = { name: custMap.get(key) ?? 'Unknown', bottles: 0, revenue: 0 }
      custStatsMap[key].bottles += d.bottles_delivered
      custStatsMap[key].revenue += Number(d.amount_charged ?? 0)
    }

    // By day (for chart)
    const dayStatsMap: Record<string, { bottles: number; revenue: number }> = {}
    for (const d of dList) {
      const key = d.date
      if (!dayStatsMap[key]) dayStatsMap[key] = { bottles: 0, revenue: 0 }
      dayStatsMap[key].bottles += d.bottles_delivered
      dayStatsMap[key].revenue += Number(d.amount_charged ?? 0)
    }
    const byDay = Object.entries(dayStatsMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        day: new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        bottles: v.bottles,
        revenue: v.revenue,
      }))

    const revenue = dList.reduce((s, d) => s + Number(d.amount_charged ?? 0), 0)
    const cashCollected = pList.filter((p) => p.method === 'cash').reduce((s, p) => s + Number(p.amount), 0)
    const totalPaid = pList.reduce((s, p) => s + Number(p.amount), 0)
    const totalExpenses = eList.reduce((s, e) => s + Number(e.amount), 0)

    setStats({
      revenue,
      bottlesDelivered: dList.reduce((s, d) => s + d.bottles_delivered, 0),
      bottles1_5l: dList.reduce((s, d) => s + (d.bottles_1_5l ?? 0), 0),
      bottles500ml: dList.reduce((s, d) => s + (d.bottles_500ml ?? 0), 0),
      bottles250ml: dList.reduce((s, d) => s + (d.bottles_250ml ?? 0), 0),
      emptiesCollected: dList.reduce((s, d) => s + d.empties_returned, 0),
      cashCollected,
      expenses: totalExpenses,
      outstanding: Math.max(0, revenue - totalPaid),
      stops: dList.length,
      byDriver: Object.values(driverMap).sort((a, b) => b.bottles - a.bottles),
      byCustomer: Object.values(custStatsMap).sort((a, b) => b.bottles - a.bottles),
      byDay,
    })
    setLoading(false)
  }

  async function loadSalesStats() {
    setLoading(true)

    const [{ data: meetings }, { data: salesPeople }] = await Promise.all([
      supabase.from('meetings').select('*'),
      supabase.from('profiles').select('id, name').eq('role', 'sales'),
    ])

    const mList = (meetings ?? []) as Meeting[]
    const salesMap = new Map(((salesPeople ?? []) as Pick<Profile, 'id' | 'name'>[]).map((s) => [s.id, s.name]))

    const bySalesMap: Record<string, SalesPersonStats> = {}
    for (const m of mList) {
      const key = m.sales_id
      if (!bySalesMap[key]) bySalesMap[key] = { name: salesMap.get(key) ?? 'Unknown', salesId: key, total: 0, closed: 0, meetings: [] }
      bySalesMap[key].total++
      bySalesMap[key].meetings.push(m)
      if (m.status === 'closed') bySalesMap[key].closed++
    }

    setSalesStats({
      total: mList.length,
      open: mList.filter((m) => m.status === 'open').length,
      closed: mList.filter((m) => m.status === 'closed').length,
      bySales: Object.values(bySalesMap).sort((a, b) => b.total - a.total),
    })
    setLoading(false)
  }

  return (
    <div className="px-4 py-4 space-y-4">
      <h2 className="text-lg font-bold text-gray-800">{t('reports.title')}</h2>

      {/* Top-level Driver | Sales tab (admin only) */}
      {isAdmin && (
        <div className="flex rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
          {(['driver', 'sales'] as TopTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setTopTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                topTab === tab ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t(`reports.tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}
            </button>
          ))}
        </div>
      )}

      {topTab === 'driver' && (
        <>
          {/* Date range shortcuts */}
          <div className="flex gap-1.5 flex-wrap">
            {([
              { key: 'today',    label: t('reports.rangeToday'),    start: todayLocalISO(),      end: todayLocalISO() },
              { key: 'week',     label: t('reports.rangeWeek'),     start: weekAgo(),            end: todayLocalISO() },
              { key: 'thisMon',  label: t('reports.rangeThisMonth'),start: firstOfThisMonth(),   end: todayLocalISO() },
              { key: 'lastMon',  label: t('reports.rangeLastMonth'),start: firstOfLastMonth(),   end: lastOfLastMonth() },
            ] as const).map((r) => {
              const active = startDate === r.start && endDate === r.end
              return (
                <button
                  key={r.key}
                  onClick={() => { setStartDate(r.start); setEndDate(r.end) }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border ${
                    active ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {r.label}
                </button>
              )
            })}
          </div>

          {/* Date range pickers */}
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={todayLocalISO()}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">{t('common.loading')}</div>
          ) : stats ? (
            <RangeView stats={stats} isSalesRole={isSalesRole} />
          ) : null}
        </>
      )}

      {topTab === 'sales' && (
        loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">{t('common.loading')}</div>
        ) : salesStats ? (
          <SalesView stats={salesStats} isAdmin={isAdmin} />
        ) : null
      )}
    </div>
  )
}

function RangeView({ stats, isSalesRole }: { stats: RangeStats; isSalesRole: boolean }) {
  const { t } = useTranslation()
  const [section, setSection] = useState<'overview' | 'driver' | 'customer'>('overview')

  if (stats.stops === 0) {
    return <p className="text-center text-gray-400 py-8">{t('reports.noData')}</p>
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatBox label={`${t('reports.bottlesDelivered')} — Big`} value={stats.bottlesDelivered} icon="🫙" />
        <StatBox label={t('reports.emptiesCollected')} value={stats.emptiesCollected} icon="📦" />
        {stats.bottles1_5l > 0 && <StatBox label="1.5L" value={stats.bottles1_5l} icon="🧴" />}
        {stats.bottles500ml > 0 && <StatBox label="500mL" value={stats.bottles500ml} icon="🧴" />}
        {stats.bottles250ml > 0 && <StatBox label="250mL" value={stats.bottles250ml} icon="🧴" />}
        {!isSalesRole && (
          <>
            <StatBox label={t('reports.revenue')} value={formatCurrency(stats.revenue)} icon="📈" />
            <StatBox label={t('reports.cashCollected')} value={formatCurrency(stats.cashCollected)} icon="💵" />
            {stats.expenses > 0 && (
              <StatBox label={t('reports.expenses')} value={formatCurrency(stats.expenses)} icon="💸" />
            )}
            {stats.outstanding > 0 && (
              <StatBox label={t('reports.outstanding')} value={formatCurrency(stats.outstanding)} icon="⏳" />
            )}
            <StatBox label={t('reports.netProfit')} value={formatCurrency(stats.revenue - stats.expenses)} icon="🏁" />
          </>
        )}
      </div>

      {/* Bottles by day chart */}
      {stats.byDay.length > 1 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-sm font-medium text-gray-600 mb-3">{t('reports.bottlesDelivered')}</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={stats.byDay} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [`${v} bottles`, '']} />
              <Bar dataKey="bottles" fill="#2563eb" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Sub-tabs (admin only) */}
      {!isSalesRole && (
        <>
          <div className="flex rounded-xl overflow-hidden border border-gray-200 bg-gray-50 text-sm">
            {(['overview', 'driver', 'customer'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`flex-1 py-2 font-medium transition-colors ${section === s ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500'}`}
              >
                {s === 'driver' ? t('reports.byDriver') : s === 'customer' ? t('reports.byCustomer') : 'Overview'}
              </button>
            ))}
          </div>

          {section === 'driver' && (
            <div className="space-y-2">
              {stats.byDriver.map((d, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-3">
                  <p className="font-medium text-gray-800 mb-1">{d.name}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                    <span>🫙 {d.bottles}</span>
                    {d.bottles1_5l > 0 && <span>1.5L: {d.bottles1_5l}</span>}
                    {d.bottles500ml > 0 && <span>500mL: {d.bottles500ml}</span>}
                    {d.bottles250ml > 0 && <span>250mL: {d.bottles250ml}</span>}
                    <span>📈 {formatCurrency(d.revenue)}</span>
                    <span>💵 {formatCurrency(d.cash)}</span>
                    {d.expenses > 0 && <span>💸 {formatCurrency(d.expenses)}</span>}
                  </div>
                </div>
              ))}
              {stats.byDriver.length === 0 && <p className="text-center text-gray-400 py-4">{t('reports.noData')}</p>}
            </div>
          )}

          {section === 'customer' && (
            <div className="space-y-2">
              {stats.byCustomer.slice(0, 40).map((c, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-3">
                  <p className="font-medium text-gray-800 text-sm mb-1 truncate">{c.name}</p>
                  <div className="flex gap-4 text-sm text-gray-500">
                    <span>🫙 {c.bottles}</span>
                    <span>📈 {formatCurrency(c.revenue)}</span>
                  </div>
                </div>
              ))}
              {stats.byCustomer.length === 0 && <p className="text-center text-gray-400 py-4">{t('reports.noData')}</p>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SalesView({ stats, isAdmin }: { stats: SalesStats; isAdmin: boolean }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatBox label={t('reports.totalMeetings')} value={stats.total} icon="🤝" />
        <StatBox label={t('reports.openMeetings')} value={stats.open} icon="🔓" />
        <StatBox label={t('reports.closedDeals')} value={stats.closed} icon="✅" />
      </div>

      {isAdmin && stats.bySales.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-600 mb-2">{t('reports.bySalesPerson')}</p>
          <div className="space-y-2">
            {stats.bySales.map((s) => (
              <div key={s.salesId} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <button
                  onClick={() => setExpanded(expanded === s.salesId ? null : s.salesId)}
                  className="w-full text-left p-3 flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-800">{s.name}</p>
                    <div className="flex gap-4 text-sm text-gray-500 mt-0.5">
                      <span>🤝 {s.total} {t('reports.meetings')}</span>
                      <span>✅ {s.closed} {t('reports.deals')}</span>
                    </div>
                  </div>
                  <span className="text-gray-400 text-sm">{expanded === s.salesId ? '▲' : '▼'}</span>
                </button>

                {expanded === s.salesId && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {s.meetings
                      .sort((a, b) => (b.meeting_date ?? b.created_at).localeCompare(a.meeting_date ?? a.created_at))
                      .map((m) => (
                        <div key={m.id} className="px-3 py-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-medium text-gray-800">{m.contact_name}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              m.status === 'closed'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {m.status === 'closed' ? t('meetings.closed') : t('meetings.open')}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                            {m.area && <span>📍 {m.area}</span>}
                            {m.meeting_date && <span>📅 {formatDate(m.meeting_date)}{m.meeting_time ? ` ${m.meeting_time}` : ''}</span>}
                            {m.contact_phone && (
                              <a href={`tel:${m.contact_phone}`} className="text-blue-500">📞 {m.contact_phone}</a>
                            )}
                          </div>
                          {m.notes && <p className="text-xs text-gray-400 mt-1 italic">{m.notes}</p>}
                        </div>
                      ))}
                    {s.meetings.length === 0 && (
                      <p className="text-center text-gray-400 text-sm py-3">{t('reports.noData')}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-2xl mb-1">{icon}</p>
      <p className="text-xl font-bold text-gray-800">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
