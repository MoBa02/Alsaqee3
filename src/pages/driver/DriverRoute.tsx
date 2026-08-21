import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { Customer, CustomerBalance, Delivery, DeliveryDay, DELIVERY_DAYS, Expense, getDeliveryDayForDate, todayLocalISO, formatCurrency } from '@/types'
import StepperInput from '@/components/StepperInput'

interface StopState {
  empties: number
  bottles: number
  bottles1_5l: number
  bottles500ml: number
  bottles250ml: number
  skipReason: string
  paymentAmount: string
  paymentMethod: 'cash' | 'other'
  paymentNote: string
  saved: boolean
  saving: boolean
  editing: boolean
  existingDeliveryId: string | null
}

function defaultStop(delivery?: Delivery): StopState {
  return {
    empties: delivery?.empties_returned ?? 0,
    bottles: delivery?.bottles_delivered ?? 0,
    bottles1_5l: delivery?.bottles_1_5l ?? 0,
    bottles500ml: delivery?.bottles_500ml ?? 0,
    bottles250ml: delivery?.bottles_250ml ?? 0,
    skipReason: delivery?.note ?? '',
    paymentAmount: '',
    paymentMethod: 'cash',
    paymentNote: '',
    saved: !!delivery,
    saving: false,
    editing: false,
    existingDeliveryId: delivery?.id ?? null,
  }
}

function totalDelivered(stop: StopState) {
  return stop.bottles + stop.bottles1_5l + stop.bottles500ml + stop.bottles250ml
}

// Read-only brief of what was logged for a stop
function StopSummary({ stop }: { stop: StopState }) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-2 gap-2">
      {stop.bottles > 0 && (
        <div className="bg-gray-50 rounded-xl p-2.5 text-center">
          <p className="text-xs text-gray-500 mb-0.5">{t('route.bigWater')} 🫙</p>
          <p className="text-xl font-bold text-gray-800">{stop.bottles}</p>
        </div>
      )}
      {stop.bottles1_5l > 0 && (
        <div className="bg-gray-50 rounded-xl p-2.5 text-center">
          <p className="text-xs text-gray-500 mb-0.5">{t('route.size1_5l')}</p>
          <p className="text-xl font-bold text-gray-800">{stop.bottles1_5l}</p>
        </div>
      )}
      {stop.bottles500ml > 0 && (
        <div className="bg-gray-50 rounded-xl p-2.5 text-center">
          <p className="text-xs text-gray-500 mb-0.5">{t('route.size500ml')}</p>
          <p className="text-xl font-bold text-gray-800">{stop.bottles500ml}</p>
        </div>
      )}
      {stop.bottles250ml > 0 && (
        <div className="bg-gray-50 rounded-xl p-2.5 text-center">
          <p className="text-xs text-gray-500 mb-0.5">{t('route.size250ml')}</p>
          <p className="text-xl font-bold text-gray-800">{stop.bottles250ml}</p>
        </div>
      )}
      {stop.empties > 0 && (
        <div className="bg-gray-50 rounded-xl p-2.5 text-center">
          <p className="text-xs text-gray-500 mb-0.5">{t('route.emptiesReturned')}</p>
          <p className="text-xl font-bold text-gray-800">{stop.empties}</p>
        </div>
      )}
      {totalDelivered(stop) === 0 && (
        <div className="col-span-2 bg-amber-50 rounded-xl p-2.5 text-center">
          <p className="text-xs text-amber-600 font-medium">⚠️ {t('route.notDelivered')}</p>
          {stop.skipReason && <p className="text-xs text-gray-500 mt-0.5">{stop.skipReason}</p>}
        </div>
      )}
    </div>
  )
}

interface Props {
  overrideDriverId?: string
  overrideDate?: string
}

export default function DriverRoute({ overrideDriverId, overrideDate }: Props) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { language } = useLang()

  const isAdmin = profile?.role === 'owner' || profile?.role === 'manager'
  const today = overrideDate ?? todayLocalISO()
  const todayDay = getDeliveryDayForDate(today)
  const targetDriverId = isAdmin ? overrideDriverId : (overrideDriverId ?? profile?.id)

  const [customers, setCustomers] = useState<CustomerBalance[]>([])
  // Extra (emergency) stops: delivered today but not scheduled today
  const [extras, setExtras] = useState<CustomerBalance[]>([])
  // Extra stops picked this session but not yet saved
  const [pendingExtras, setPendingExtras] = useState<CustomerBalance[]>([])
  const [stops, setStops] = useState<Record<string, StopState>>({})
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Emergency delivery picker
  const [showExtraPicker, setShowExtraPicker] = useState(false)
  const [extraDay, setExtraDay] = useState<DeliveryDay | null>(null)
  const [extraCandidates, setExtraCandidates] = useState<CustomerBalance[]>([])
  const [extraLoading, setExtraLoading] = useState(false)

  const displayName = (c: Customer) =>
    language === 'ar' ? (c.name_ar || c.name_en) : c.name_en

  const load = useCallback(async () => {
    if (!todayDay || (!isAdmin && !targetDriverId)) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    const query = supabase
      .from('customer_balances')
      .select('*')
      .contains('delivery_days', [todayDay])
      .eq('active', true)
      .order('sort_order')

    if (targetDriverId) {
      query.eq('assigned_driver_id', targetDriverId)
    }

    const { data: custData, error: custErr } = await query
    if (custErr) { setError(custErr.message); setLoading(false); return }

    const cList = (custData ?? []) as CustomerBalance[]
    setCustomers(cList)

    // All deliveries logged today — covers scheduled stops AND extra (emergency) stops
    const dQuery = supabase.from('deliveries').select('*').eq('date', today)
    if (targetDriverId) {
      dQuery.eq('driver_id', targetDriverId)
    }
    const { data: deliveries } = await dQuery
    const dList = (deliveries ?? []) as Delivery[]
    const deliveryMap = new Map(dList.map((d) => [d.customer_id, d]))

    // Customers delivered today but not on today's schedule = extra stops
    const routeIds = new Set(cList.map((c) => c.id))
    const extraIds = [...deliveryMap.keys()].filter((id) => !routeIds.has(id))
    let extraList: CustomerBalance[] = []
    if (extraIds.length > 0) {
      const { data: extraData } = await supabase
        .from('customer_balances')
        .select('*')
        .in('id', extraIds)
      extraList = (extraData ?? []) as CustomerBalance[]
    }
    setExtras(extraList)
    setPendingExtras((prev) => prev.filter((c) => !routeIds.has(c.id) && !extraIds.includes(c.id)))

    setStops((prev) => {
      const next: Record<string, StopState> = {}
      for (const c of [...cList, ...extraList]) {
        const d = deliveryMap.get(c.id)
        // Keep in-progress (unsaved) input if nothing is recorded in the DB yet
        next[c.id] = d ? defaultStop(d) : (prev[c.id] ?? defaultStop())
      }
      // Keep state for pending extra stops picked this session
      for (const [id, s] of Object.entries(prev)) {
        if (!(id in next)) next[id] = s
      }
      return next
    })

    setLoading(false)
  }, [todayDay, targetDriverId, today, profile])

  useEffect(() => { load() }, [load])

  async function saveStop(customer: CustomerBalance) {
    const stop = stops[customer.id]
    if (!stop) return

    setError('')

    const missingPrices: string[] = []
    if (stop.bottles > 0 && customer.price_per_bottle == null) missingPrices.push(t('route.bigWater'))
    if (stop.bottles1_5l > 0 && customer.price_1_5l == null) missingPrices.push(t('route.size1_5l'))
    if (stop.bottles500ml > 0 && customer.price_500ml == null) missingPrices.push(t('route.size500ml'))
    if (stop.bottles250ml > 0 && customer.price_250ml == null) missingPrices.push(t('route.size250ml'))
    if (missingPrices.length > 0) {
      setError(`${t('route.missingPrice')}: ${missingPrices.join(', ')}`)
      return
    }

    setStops((prev) => ({ ...prev, [customer.id]: { ...prev[customer.id], saving: true } }))

    const bigPrice = customer.price_per_bottle ?? 0
    const p1_5l = customer.price_1_5l ?? 0
    const p500ml = customer.price_500ml ?? 0
    const p250ml = customer.price_250ml ?? 0
    const rawAmount =
      stop.bottles * bigPrice +
      stop.bottles1_5l * p1_5l +
      stop.bottles500ml * p500ml +
      stop.bottles250ml * p250ml
    const amountCharged = Math.round(rawAmount * 100) / 100

    const basePayload = {
      empties_returned: stop.empties,
      bottles_delivered: stop.bottles,
      bottles_1_5l: stop.bottles1_5l,
      bottles_500ml: stop.bottles500ml,
      bottles_250ml: stop.bottles250ml,
      price_per_bottle_at_time: bigPrice || null,
      amount_charged: amountCharged || null,
      note: totalDelivered(stop) === 0 ? (stop.skipReason || null) : null,
    }

    let deliveryError: string | null = null
    if (stop.existingDeliveryId) {
      // Preserve original driver_id on updates so admin edits don't overwrite driver attribution
      const { error } = await supabase.from('deliveries').update(basePayload).eq('id', stop.existingDeliveryId)
      deliveryError = error?.message ?? null
    } else {
      const { error } = await supabase.from('deliveries').insert({
        customer_id: customer.id,
        date: today,
        driver_id: profile?.id,
        ...basePayload,
      })
      deliveryError = error?.message ?? null
    }

    if (deliveryError) {
      setError(`Failed to save stop: ${deliveryError}`)
      setStops((prev) => ({ ...prev, [customer.id]: { ...prev[customer.id], saving: false } }))
      return
    }

    const payAmount = parseFloat(stop.paymentAmount)
    if (!isNaN(payAmount) && payAmount > 0) {
      const { error: paymentError } = await supabase.from('payments').insert({
        customer_id: customer.id,
        amount: payAmount,
        date: today,
        method: stop.paymentMethod,
        note: stop.paymentMethod === 'other' ? (stop.paymentNote || null) : null,
        recorded_by: profile?.id,
      })
      if (paymentError) {
        setError(`Stop saved but payment failed to record: ${paymentError.message}`)
        setStops((prev) => ({ ...prev, [customer.id]: { ...prev[customer.id], saving: false } }))
        return
      }
    }

    setStops((prev) => ({
      ...prev,
      [customer.id]: {
        ...prev[customer.id],
        saving: false,
        saved: true,
        editing: false,
        paymentAmount: '',
        paymentNote: '',
        existingDeliveryId: prev[customer.id].existingDeliveryId,
      },
    }))
    setExpandedId(null)
    load()
  }

  async function loadExtraCandidates(day: DeliveryDay) {
    setExtraDay(day)
    setExtraLoading(true)
    const { data } = await supabase
      .from('customer_balances')
      .select('*')
      .contains('delivery_days', [day])
      .eq('active', true)
      .eq('assigned_driver_id', profile!.id)
      .order('sort_order')
    const existing = new Set([...customers, ...extras, ...pendingExtras].map((c) => c.id))
    setExtraCandidates(((data ?? []) as CustomerBalance[]).filter((c) => !existing.has(c.id)))
    setExtraLoading(false)
  }

  function pickExtraCustomer(c: CustomerBalance) {
    setPendingExtras((prev) => [...prev, c])
    setStops((prev) => ({ ...prev, [c.id]: prev[c.id] ?? defaultStop() }))
    setShowExtraPicker(false)
    setExtraDay(null)
    setExtraCandidates([])
    setExpandedId(c.id)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-48 text-gray-400">{t('common.loading')}</div>
  }

  if (!todayDay) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-500 px-8 text-center">
        <span className="text-5xl">🌙</span>
        <p className="text-lg font-medium">{t('route.fridayOff')}</p>
      </div>
    )
  }

  const allExtras = [...extras, ...pendingExtras]
  const totalStops = customers.length + allExtras.length
  const doneCount = Object.values(stops).filter((s) => s.saved).length

  // Sort by area (no-area last), then sort_order within each area
  const sorted = [...customers].sort((a, b) => {
    const aKey = a.area ?? '￿'
    const bKey = b.area ?? '￿'
    if (aKey !== bKey) return aKey.localeCompare(bKey)
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  })

  const grouped: Array<{ area: string; customers: CustomerBalance[] }> = []
  const areaMap = new Map<string, CustomerBalance[]>()
  for (const c of sorted) {
    const key = c.area ?? ''
    if (!areaMap.has(key)) {
      areaMap.set(key, [])
      grouped.push({ area: key, customers: areaMap.get(key)! })
    }
    areaMap.get(key)!.push(c)
  }

  const renderCard = (customer: CustomerBalance) => {
    const stop = stops[customer.id] ?? defaultStop()
    const isExpanded = expandedId === customer.id
    const isSaved = stop.saved

    return (
      <div
        key={customer.id}
        className={`bg-white rounded-2xl shadow-sm border-2 transition-colors ${
          isSaved ? 'border-green-400' : 'border-gray-100'
        }`}
      >
        <button className="w-full text-start p-4" onClick={() => setExpandedId(isExpanded ? null : customer.id)}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-900 text-base leading-tight">{displayName(customer)}</p>
                {customer.is_new && (
                  <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{t('route.newCustomer')}</span>
                )}
              </div>
              {customer.contact && (
                <p className="text-xs text-gray-400 mt-0.5">📞 {customer.contact}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isSaved && <span className="text-green-600 text-lg">✓</span>}
              <span className="text-gray-400 text-lg">{isExpanded ? '▲' : '▼'}</span>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {customer.money_owed > 0 && (
              <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs font-medium px-2.5 py-1 rounded-full">
                {t('route.owes')} {formatCurrency(customer.money_owed)}
              </span>
            )}
            {customer.money_owed < 0 && (
              <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">
                {formatCurrency(Math.abs(customer.money_owed))} {t('route.credit')}
              </span>
            )}
            {customer.bottles_owed > 0 && (
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-medium px-2.5 py-1 rounded-full">
                {customer.bottles_owed} 🫙 {t('payments.bottlesOut')}
              </span>
            )}
          </div>
        </button>

        {isExpanded && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-4 space-y-4">
            {customer.location_url && (
              <a href={customer.location_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-50 text-primary-600 font-medium hover:bg-blue-100 transition-colors">
                📍 {t('route.navigate')}
              </a>
            )}
            {customer.contact && (
              <a href={`tel:${customer.contact}`}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-green-50 text-green-700 font-medium hover:bg-green-100 transition-colors">
                📞 {customer.contact}
              </a>
            )}

            {isAdmin ? (
              <div className="space-y-2">
                {stop.saved ? (
                  <StopSummary stop={stop} />
                ) : (
                  <p className="text-sm text-gray-400 text-center py-2">{t('route.notLoggedYet')}</p>
                )}
              </div>
            ) : stop.saved && !stop.editing ? (
              // Already saved — show a brief of what was logged + Edit button
              <div className="space-y-3">
                <StopSummary stop={stop} />
                <button
                  onClick={() => setStops((p) => ({ ...p, [customer.id]: { ...p[customer.id], editing: true } }))}
                  className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition-colors"
                >
                  ✏️ {t('common.edit')}
                </button>
              </div>
            ) : (
              <>
                {/* Row 1: Empties + Big Water */}
                <div className="grid grid-cols-2 gap-3">
                  <StepperInput
                    label={`${t('route.emptiesReturned')} 🔙`}
                    value={stop.empties}
                    onChange={(v) => setStops((p) => ({ ...p, [customer.id]: { ...p[customer.id], empties: v, saved: false, editing: true } }))}
                    disabled={stop.saving}
                  />
                  <StepperInput
                    label={`${t('route.bigWater')} 🫙`}
                    value={stop.bottles}
                    onChange={(v) => setStops((p) => ({ ...p, [customer.id]: { ...p[customer.id], bottles: v, saved: false, editing: true } }))}
                    disabled={stop.saving}
                  />
                </div>

                {/* Row 2: Small sizes */}
                <div className="grid grid-cols-3 gap-2">
                  <StepperInput
                    label={t('route.size1_5l')}
                    value={stop.bottles1_5l}
                    onChange={(v) => setStops((p) => ({ ...p, [customer.id]: { ...p[customer.id], bottles1_5l: v, saved: false, editing: true } }))}
                    disabled={stop.saving}
                  />
                  <StepperInput
                    label={t('route.size500ml')}
                    value={stop.bottles500ml}
                    onChange={(v) => setStops((p) => ({ ...p, [customer.id]: { ...p[customer.id], bottles500ml: v, saved: false, editing: true } }))}
                    disabled={stop.saving}
                  />
                  <StepperInput
                    label={t('route.size250ml')}
                    value={stop.bottles250ml}
                    onChange={(v) => setStops((p) => ({ ...p, [customer.id]: { ...p[customer.id], bottles250ml: v, saved: false, editing: true } }))}
                    disabled={stop.saving}
                  />
                </div>

                {/* Reason for no delivery */}
                {totalDelivered(stop) === 0 && (
                  <div>
                    <label className="text-sm text-gray-600 font-medium">{t('route.skipReason')}</label>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {(['skipAbsent', 'skipClosed', 'skipRefused', 'skipOther'] as const).map((key) => {
                        const label = t(`route.${key}`)
                        const active = stop.skipReason === label
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setStops((p) => ({ ...p, [customer.id]: { ...p[customer.id], skipReason: active ? '' : label } }))}
                            disabled={stop.saving}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                              active ? 'bg-primary-600 text-white border-primary-600' : 'bg-gray-50 text-gray-600 border-gray-200'
                            }`}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                    <input
                      type="text"
                      value={stop.skipReason}
                      onChange={(e) => setStops((p) => ({ ...p, [customer.id]: { ...p[customer.id], skipReason: e.target.value } }))}
                      placeholder="e.g. Customer absent, closed…"
                      disabled={stop.saving}
                      className="mt-2 w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                )}

                {/* Itemized price breakdown */}
                {totalDelivered(stop) > 0 && (
                  <div className="bg-gray-50 rounded-xl px-3 py-2 space-y-0.5">
                    {stop.bottles > 0 && customer.price_per_bottle && (
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>{stop.bottles} × {t('route.bigWater')}</span>
                        <span>{formatCurrency(stop.bottles * customer.price_per_bottle)}</span>
                      </div>
                    )}
                    {stop.bottles1_5l > 0 && customer.price_1_5l && (
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>{stop.bottles1_5l} × {t('route.size1_5l')}</span>
                        <span>{formatCurrency(stop.bottles1_5l * customer.price_1_5l)}</span>
                      </div>
                    )}
                    {stop.bottles500ml > 0 && customer.price_500ml && (
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>{stop.bottles500ml} × {t('route.size500ml')}</span>
                        <span>{formatCurrency(stop.bottles500ml * customer.price_500ml)}</span>
                      </div>
                    )}
                    {stop.bottles250ml > 0 && customer.price_250ml && (
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>{stop.bottles250ml} × {t('route.size250ml')}</span>
                        <span>{formatCurrency(stop.bottles250ml * customer.price_250ml)}</span>
                      </div>
                    )}
                    {(() => {
                      const total =
                        stop.bottles * (customer.price_per_bottle ?? 0) +
                        stop.bottles1_5l * (customer.price_1_5l ?? 0) +
                        stop.bottles500ml * (customer.price_500ml ?? 0) +
                        stop.bottles250ml * (customer.price_250ml ?? 0)
                      return total > 0 ? (
                        <div className="flex justify-between text-sm font-semibold text-gray-700 border-t border-gray-200 pt-1 mt-1">
                          <span>Total</span>
                          <span>{formatCurrency(total)}</span>
                        </div>
                      ) : null
                    })()}
                  </div>
                )}

                {/* Payment */}
                <div className="space-y-2">
                  <label className="text-sm text-gray-600 font-medium">
                    {t('route.paymentCollected')} ({t('common.aed')})
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={stop.paymentAmount}
                      onChange={(e) => setStops((p) => ({ ...p, [customer.id]: { ...p[customer.id], paymentAmount: e.target.value, saved: false, editing: true } }))}
                      placeholder="0"
                      disabled={stop.saving}
                      className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-lg font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <div className="flex rounded-xl overflow-hidden border border-gray-300">
                      {(['cash', 'other'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setStops((p) => ({ ...p, [customer.id]: { ...p[customer.id], paymentMethod: m } }))}
                          className={`px-3 py-2 text-sm font-medium transition-colors ${
                            stop.paymentMethod === m ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {t(`route.${m}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Custom method name when "other" is selected */}
                  {stop.paymentMethod === 'other' && (
                    <input
                      type="text"
                      value={stop.paymentNote}
                      onChange={(e) => setStops((p) => ({ ...p, [customer.id]: { ...p[customer.id], paymentNote: e.target.value } }))}
                      placeholder={t('route.paymentMethodName')}
                      disabled={stop.saving}
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  )}
                </div>

                <button
                  onClick={() => saveStop(customer)}
                  disabled={stop.saving}
                  className={`w-full py-4 rounded-xl font-bold text-white text-lg transition-colors ${
                    stop.saving ? 'bg-gray-400' : 'bg-green-500 hover:bg-green-600 active:scale-95'
                  }`}
                >
                  {stop.saving ? t('route.updating') : t('route.saveStop')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="px-4 py-4 space-y-3">
      {/* Day header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">
          {t(`days.${todayDay}`)} — {totalStops} {t('route.stops')}
        </h2>
        <span className="text-sm text-gray-500">
          {doneCount}/{totalStops} {t('route.completed')}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-500"
          style={{ width: `${totalStops > 0 ? (doneCount / totalStops) * 100 : 0}%` }}
        />
      </div>

      {/* Emergency delivery — drivers only */}
      {!isAdmin && (
        <button
          onClick={() => { setShowExtraPicker(true); setExtraDay(null); setExtraCandidates([]) }}
          className="w-full py-3 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 text-amber-700 font-semibold text-sm hover:bg-amber-100 transition-colors"
        >
          🚨 + {t('route.extraDelivery')}
        </button>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      {customers.length === 0 && allExtras.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-500 px-8 text-center">
          <span className="text-5xl">📋</span>
          <p className="text-lg font-medium">{t('route.noCustomersToday')}</p>
        </div>
      )}

      {/* Customer cards grouped by area */}
      {grouped.map(({ area, customers: areaCustomers }) => (
        <div key={area}>
          {area && (
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 pt-2 pb-1">{area}</p>
          )}
          <div className="space-y-3">
            {areaCustomers.map(renderCard)}
          </div>
        </div>
      ))}

      {/* Extra (emergency) stops */}
      {allExtras.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-500 uppercase tracking-wider px-1 pt-2 pb-1">
            🚨 {t('route.extraSection')}
          </p>
          <div className="space-y-3">
            {allExtras.map(renderCard)}
          </div>
        </div>
      )}

      {/* Daily expenses — drivers only */}
      {!isAdmin && profile?.id && (
        <DailyExpenses driverId={profile.id} date={today} />
      )}

      {/* Emergency delivery picker modal */}
      {showExtraPicker && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center sm:items-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[85vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">🚨 {t('route.extraDelivery')}</h3>
              <button
                onClick={() => { setShowExtraPicker(false); setExtraDay(null); setExtraCandidates([]) }}
                className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('route.extraPickDay')}</label>
                <div className="flex flex-wrap gap-2">
                  {DELIVERY_DAYS.filter((d) => d !== todayDay).map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => loadExtraCandidates(day)}
                      className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                        extraDay === day
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {t(`days.${day}`)}
                    </button>
                  ))}
                </div>
              </div>

              {extraDay && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('route.extraPickCustomer')}</label>
                  {extraLoading ? (
                    <p className="text-sm text-gray-400 text-center py-4">{t('common.loading')}</p>
                  ) : extraCandidates.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">{t('route.extraNoCustomers')}</p>
                  ) : (
                    <div className="space-y-2">
                      {extraCandidates.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => pickExtraCustomer(c)}
                          className="w-full text-start bg-gray-50 hover:bg-amber-50 border border-gray-200 rounded-xl px-4 py-3 transition-colors"
                        >
                          <p className="font-semibold text-gray-900 text-sm">{displayName(c)}</p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {c.area && (
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{c.area}</span>
                            )}
                            <span className="text-xs text-gray-400">
                              {c.delivery_days.map((d) => t(`days.${d}`)).join(' · ')}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Daily Expenses Component ──────────────────────────────────────────────────
function DailyExpenses({ driverId, date }: { driverId: string; date: string }) {
  const { t } = useTranslation()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)

  const QUICK_DESCS = ['Diesel', 'Water', 'Parking', 'Toll', 'Other']

  async function loadExpenses() {
    setLoading(true)
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('driver_id', driverId)
      .eq('date', date)
      .order('created_at')
    setExpenses((data ?? []) as Expense[])
    setLoading(false)
  }

  useEffect(() => { loadExpenses() }, [driverId, date])

  async function handleAdd() {
    const amt = parseFloat(amount)
    if (!desc.trim() || isNaN(amt) || amt <= 0) return
    setSaving(true)
    await supabase.from('expenses').insert({ driver_id: driverId, date, amount: amt, description: desc.trim() })
    setDesc(''); setAmount('')
    setSaving(false)
    setShowAdd(false)
    loadExpenses()
  }

  async function handleDelete(id: string) {
    await supabase.from('expenses').delete().eq('id', id)
    loadExpenses()
  }

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mt-2">
      <button
        className="w-full flex items-center justify-between px-4 py-3"
        onClick={() => setShowAdd(!showAdd)}
      >
        <span className="font-semibold text-gray-700 text-sm">💸 {t('route.expenses')}</span>
        <div className="flex items-center gap-2">
          {total > 0 && <span className="text-sm font-medium text-red-600">{total.toFixed(2)} AED</span>}
          <span className="text-gray-400 text-sm">{showAdd ? '▲' : '▼'}</span>
        </div>
      </button>

      {showAdd && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
          {/* Quick pick */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_DESCS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setDesc(q)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                  desc === q ? 'bg-primary-600 text-white border-primary-600' : 'bg-gray-50 text-gray-600 border-gray-200'
                }`}
              >
                {q}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder={t('route.expenseDesc')}
            className={inputCls}
          />
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t('route.expenseAmount')}
              className={`${inputCls} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
            />
            <button
              onClick={handleAdd}
              disabled={saving || !desc.trim() || !amount}
              className="px-4 py-2.5 bg-primary-600 text-white rounded-xl font-medium text-sm hover:bg-primary-700 disabled:opacity-50 shrink-0"
            >
              {t('common.add')}
            </button>
          </div>

          {/* Expense list */}
          {loading ? (
            <p className="text-xs text-gray-400 text-center py-2">{t('common.loading')}</p>
          ) : expenses.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">{t('route.noExpenses')}</p>
          ) : (
            <div className="space-y-1.5">
              {expenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{e.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-red-600">{Number(e.amount).toFixed(2)} AED</span>
                    <button
                      onClick={() => handleDelete(e.id)}
                      className="text-gray-400 hover:text-red-500 text-xs transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              {expenses.length > 0 && (
                <div className="flex justify-between px-3 pt-1 text-sm font-semibold text-gray-700">
                  <span>{t('route.totalExpenses')}</span>
                  <span className="text-red-600">{total.toFixed(2)} AED</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const inputCls = 'w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white'
