import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Delivery, Payment, Customer, getDeliveryDayForDate, todayLocalISO, formatCurrency } from '@/types'

interface Summary {
  bottlesDelivered: number
  bottles1_5l: number
  bottles500ml: number
  bottles250ml: number
  emptiesCollected: number
  cashCollected: number
  revenue: number
  stopsCompleted: number
  stopsTotal: number
}

export default function DriverSummary() {
  const { t } = useTranslation()
  const { profile } = useAuth()

  const [date, setDate] = useState(todayLocalISO())
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [date, profile])

  async function load() {
    if (!profile) return
    setLoading(true)

    const isOwner = profile.role === 'owner'
    const displayDay = getDeliveryDayForDate(date)

    // Get all customers for the selected date's route
    let custQuery = supabase
      .from('customers')
      .select('id')
      .eq('active', true)

    if (!isOwner) {
      custQuery = custQuery.eq('assigned_driver_id', profile.id)
    }

    if (displayDay) {
      custQuery = custQuery.contains('delivery_days', [displayDay])
    }

    const { data: custs } = await custQuery
    const customerIds = (custs ?? []).map((c: Pick<Customer, 'id'>) => c.id)
    const stopsTotal = customerIds.length

    if (customerIds.length === 0) {
      setSummary({ bottlesDelivered: 0, bottles1_5l: 0, bottles500ml: 0, bottles250ml: 0, emptiesCollected: 0, cashCollected: 0, revenue: 0, stopsCompleted: 0, stopsTotal: 0 })
      setLoading(false)
      return
    }

    // Get deliveries for this date
    let delivQuery = supabase
      .from('deliveries')
      .select('*')
      .eq('date', date)
      .in('customer_id', customerIds)

    if (!isOwner) {
      delivQuery = delivQuery.eq('driver_id', profile.id)
    }

    const { data: deliveries } = await delivQuery

    // Get payments for this date
    let paymQuery = supabase
      .from('payments')
      .select('*')
      .eq('date', date)
      .in('customer_id', customerIds)

    if (!isOwner) {
      paymQuery = paymQuery.eq('recorded_by', profile.id)
    }

    const { data: payments } = await paymQuery

    const dList = (deliveries ?? []) as Delivery[]
    const pList = (payments ?? []) as Payment[]

    setSummary({
      bottlesDelivered: dList.reduce((s, d) => s + d.bottles_delivered, 0),
      bottles1_5l: dList.reduce((s, d) => s + (d.bottles_1_5l ?? 0), 0),
      bottles500ml: dList.reduce((s, d) => s + (d.bottles_500ml ?? 0), 0),
      bottles250ml: dList.reduce((s, d) => s + (d.bottles_250ml ?? 0), 0),
      emptiesCollected: dList.reduce((s, d) => s + d.empties_returned, 0),
      cashCollected: pList.filter((p) => p.method === 'cash').reduce((s, p) => s + Number(p.amount), 0),
      revenue: dList.reduce((s, d) => s + Number(d.amount_charged ?? 0), 0),
      stopsCompleted: dList.length,
      stopsTotal,
    })

    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">{t('summary.todaySummary')}</h2>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {summary ? (
        <div className="space-y-3">
          {/* Stops progress */}
          <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">{t('summary.stopsCompleted')}</span>
              <span className="text-2xl font-bold text-primary-600">
                {summary.stopsCompleted}/{summary.stopsTotal}
              </span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full transition-all"
                style={{ width: `${summary.stopsTotal > 0 ? (summary.stopsCompleted / summary.stopsTotal) * 100 : 0}%` }}
              />
            </div>
            {summary.stopsTotal - summary.stopsCompleted > 0 && (
              <p className="text-xs text-gray-400 mt-1 text-end">
                {summary.stopsTotal - summary.stopsCompleted} {t('summary.stopsRemaining')}
              </p>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label={t('summary.bottlesDelivered')} value={summary.bottlesDelivered} icon="🫙" color="bg-blue-50 text-blue-700" />
            <StatCard label={t('summary.emptiesCollected')} value={summary.emptiesCollected} icon="📦" color="bg-purple-50 text-purple-700" />
            {summary.bottles1_5l > 0 && (
              <StatCard label="1.5L" value={summary.bottles1_5l} icon="🧴" color="bg-sky-50 text-sky-700" />
            )}
            {summary.bottles500ml > 0 && (
              <StatCard label="500mL" value={summary.bottles500ml} icon="🧴" color="bg-sky-50 text-sky-700" />
            )}
            {summary.bottles250ml > 0 && (
              <StatCard label="250mL" value={summary.bottles250ml} icon="🧴" color="bg-sky-50 text-sky-700" />
            )}
            <StatCard label={t('summary.cashCollected')} value={formatCurrency(summary.cashCollected)} icon="💵" color="bg-green-50 text-green-700" />
            <StatCard label={t('summary.revenueToday')} value={formatCurrency(summary.revenue)} icon="📈" color="bg-orange-50 text-orange-700" />
          </div>

          {summary.stopsCompleted === 0 && (
            <p className="text-center text-gray-400 text-sm py-4">{t('summary.noDeliveries')}</p>
          )}
        </div>
      ) : (
        <p className="text-center text-gray-400 py-8">{t('summary.noDeliveries')}</p>
      )}
    </div>
  )
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  return (
    <div className={`${color} rounded-2xl p-4`}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs font-medium mt-0.5 opacity-80">{label}</div>
    </div>
  )
}
