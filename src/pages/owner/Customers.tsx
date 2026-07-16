import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useLang } from '@/contexts/LanguageContext'
import { CustomerBalance, Profile, SALES_AREAS, DELIVERY_DAYS, DeliveryDay, formatCurrency } from '@/types'
import CustomerForm from './CustomerForm'
import ConfirmDialog from '@/components/ConfirmDialog'

export default function Customers() {
  const { t } = useTranslation()
  const { language } = useLang()

  const [customers, setCustomers] = useState<CustomerBalance[]>([])
  const [drivers, setDrivers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(false)
  const [showOnlyMissingPrices, setShowOnlyMissingPrices] = useState(false)
  const [formCustomer, setFormCustomer] = useState<CustomerBalance | null | 'new'>(null)
  const [confirmToggle, setConfirmToggle] = useState<CustomerBalance | null>(null)
  const [showBulkDays, setShowBulkDays] = useState(false)

  const hasMissingPrices = (c: CustomerBalance) =>
    c.price_per_bottle == null || c.price_1_5l == null || c.price_500ml == null || c.price_250ml == null

  const displayName = (c: CustomerBalance) =>
    language === 'ar' ? (c.name_ar || c.name_en) : c.name_en

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: custs }, { data: drvs }] = await Promise.all([
      supabase.from('customer_balances').select('*').order('sort_order'),
      supabase.from('profiles').select('*').eq('role', 'driver').eq('active', true).order('name'),
    ])
    setCustomers((custs ?? []) as CustomerBalance[])
    setDrivers((drvs ?? []) as Profile[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const activeCustomers = customers.filter((c) => c.active)
  const unassignedCount = activeCustomers.filter((c) => c.assigned_driver_id == null).length
  const missingPriceCount = activeCustomers.filter(hasMissingPrices).length

  const filtered = customers.filter((c) => {
    if (!showInactive && !c.active) return false
    if (showOnlyUnassigned && c.assigned_driver_id != null) return false
    if (showOnlyMissingPrices && !hasMissingPrices(c)) return false
    const q = search.toLowerCase()
    if (!q) return true
    return (
      c.name_en.toLowerCase().includes(q) ||
      (c.name_ar ?? '').includes(q) ||
      (c.area ?? '').toLowerCase().includes(q)
    )
  })

  async function toggleActive(c: CustomerBalance) {
    await supabase.from('customers').update({ active: !c.active }).eq('id', c.id)
    setConfirmToggle(null)
    load()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-48 text-gray-400">{t('common.loading')}</div>
  }

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">{t('customers.title')}</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBulkDays(!showBulkDays)}
            className="flex items-center gap-1 bg-gray-100 text-gray-700 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-200 transition-colors"
            title="Bulk change delivery days"
          >
            📅
          </button>
          <button
            onClick={() => setFormCustomer('new')}
            className="flex items-center gap-1.5 bg-primary-600 text-white text-sm font-medium px-3 py-2 rounded-xl hover:bg-primary-700 transition-colors"
          >
            + {t('customers.addCustomer')}
          </button>
        </div>
      </div>

      {/* Bulk change delivery days panel */}
      {showBulkDays && (
        <BulkDeliveryDaysPanel onDone={() => { setShowBulkDays(false); load() }} />
      )}

      {/* Search */}
      <div className="relative">
        <span className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('customers.searchPlaceholder')}
          className="w-full border border-gray-300 rounded-xl ps-9 pe-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Show inactive toggle */}
      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          className="rounded"
        />
        {t('customers.showInactive')}
      </label>

      {/* Quick filter chips for data-hygiene issues */}
      {(unassignedCount > 0 || missingPriceCount > 0) && (
        <div className="flex flex-wrap gap-2">
          {unassignedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowOnlyUnassigned(!showOnlyUnassigned)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border ${
                showOnlyUnassigned
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
              }`}
            >
              ⚠ {unassignedCount} {t('customers.filterUnassigned')}
            </button>
          )}
          {missingPriceCount > 0 && (
            <button
              type="button"
              onClick={() => setShowOnlyMissingPrices(!showOnlyMissingPrices)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border ${
                showOnlyMissingPrices
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
              }`}
            >
              ⚠ {missingPriceCount} {t('customers.filterMissingPrices')}
            </button>
          )}
        </div>
      )}

      <p className="text-sm text-gray-500">{filtered.length} customers</p>

      {filtered.length === 0 ? (
        <p className="text-center text-gray-400 py-8">{t('customers.noCustomers')}</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const driver = drivers.find((d) => d.id === c.assigned_driver_id)
            return (
              <div
                key={c.id}
                className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-4 ${!c.active ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 leading-tight">{displayName(c)}</p>
                      {c.is_new && (
                        <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
                          {t('route.newCustomer')}
                        </span>
                      )}
                    </div>
                    {language === 'en' && c.name_ar && (
                      <p className="text-sm text-gray-500 font-arabic" dir="rtl">{c.name_ar}</p>
                    )}
                    {language === 'ar' && c.name_en && (
                      <p className="text-sm text-gray-500" dir="ltr">{c.name_en}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {c.area && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{c.area}</span>
                      )}
                      {c.delivery_days.map((day) => (
                        <span key={day} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                          {t(`days.${day}`)}
                        </span>
                      ))}
                      {!c.assigned_driver_id && c.active && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                          ⚠ {t('customers.noDriver')}
                        </span>
                      )}
                      {hasMissingPrices(c) && c.active && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                          ⚠ {t('customers.missingPrices')}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                      {driver && <span>👤 {driver.name}</span>}
                      {c.contact && <span>📞 {c.contact}</span>}
                      {c.price_per_bottle && <span>💰 {formatCurrency(c.price_per_bottle)}/bottle</span>}
                      {c.money_owed > 0 && (
                        <span className="text-red-600 font-medium">Owes {formatCurrency(c.money_owed)}</span>
                      )}
                      {c.bottles_owed > 0 && (
                        <span className="text-blue-600">{c.bottles_owed} 🫙 out</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => setFormCustomer(c)}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      onClick={() => setConfirmToggle(c)}
                      className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                        c.active
                          ? 'bg-red-50 hover:bg-red-100 text-red-600'
                          : 'bg-green-50 hover:bg-green-100 text-green-600'
                      }`}
                    >
                      {c.active ? t('customers.deactivate') : t('customers.activate')}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Customer Form Modal */}
      {formCustomer && (
        <CustomerForm
          customer={formCustomer === 'new' ? null : formCustomer}
          drivers={drivers}
          onClose={() => setFormCustomer(null)}
          onSaved={() => { setFormCustomer(null); load() }}
        />
      )}

      {/* Confirm toggle dialog */}
      {confirmToggle && (
        <ConfirmDialog
          open={true}
          message={confirmToggle.active ? t('customers.confirmDeactivate') : t('customers.confirmActivate')}
          onConfirm={() => toggleActive(confirmToggle)}
          onCancel={() => setConfirmToggle(null)}
        />
      )}
    </div>
  )
}

// ── Bulk change delivery days for an area ───────────────────────────────────
function BulkDeliveryDaysPanel({ onDone }: { onDone: () => void }) {
  const [area, setArea] = useState('')
  const [days, setDays] = useState<DeliveryDay[]>([])
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState('')

  function toggleDay(day: DeliveryDay) {
    setDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day])
  }

  async function handleApply() {
    if (!area) { setResult('Select an area first.'); return }
    if (days.length === 0) { setResult('Select at least one delivery day.'); return }

    setSaving(true)
    setResult('')

    const { data: matches, error: selErr } = await supabase
      .from('customers')
      .select('id')
      .eq('area', area)
      .eq('active', true)

    if (selErr) { setResult(`Error: ${selErr.message}`); setSaving(false); return }

    const ids = (matches ?? []).map((r: { id: string }) => r.id)
    if (ids.length === 0) {
      setResult('No active customers found in that area.')
      setSaving(false)
      return
    }

    const { error: updErr } = await supabase
      .from('customers')
      .update({ delivery_days: days })
      .in('id', ids)

    if (updErr) { setResult(`Error: ${updErr.message}`); setSaving(false); return }

    setResult(`✓ Updated ${ids.length} customers in ${area} → ${days.join(', ')}`)
    setSaving(false)
    setTimeout(onDone, 1500)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-gray-800 text-sm">Bulk change delivery days</p>
        <button onClick={onDone} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Area</label>
        <select
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
        >
          <option value="">— Select area —</option>
          {SALES_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">New delivery days</label>
        <div className="flex flex-wrap gap-2">
          {DELIVERY_DAYS.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                days.includes(day)
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {day.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <p className={`text-sm font-medium ${result.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
          {result}
        </p>
      )}

      <button
        onClick={handleApply}
        disabled={saving || !area || days.length === 0}
        className="w-full py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Applying…' : `Apply to all ${area || 'area'} customers`}
      </button>
    </div>
  )
}
