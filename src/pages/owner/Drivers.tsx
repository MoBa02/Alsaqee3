import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { Profile, DELIVERY_DAYS, DeliveryDay } from '@/types'
import ConfirmDialog from '@/components/ConfirmDialog'

export default function Drivers() {
  const { t } = useTranslation()
  const [drivers, setDrivers] = useState<Array<Profile & { customer_count: number }>>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [confirmToggle, setConfirmToggle] = useState<Profile | null>(null)
  const [assignTarget, setAssignTarget] = useState<(Profile & { customer_count: number }) | null>(null)

  // Add-driver form state
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: drvs } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'driver')
      .order('name')

    const driverList = (drvs ?? []) as Profile[]

    const { data: counts } = await supabase
      .from('customers')
      .select('assigned_driver_id')
      .eq('active', true)
      .not('assigned_driver_id', 'is', null)

    const countMap: Record<string, number> = {}
    for (const row of (counts ?? [])) {
      const id = (row as { assigned_driver_id: string }).assigned_driver_id
      countMap[id] = (countMap[id] ?? 0) + 1
    }

    setDrivers(driverList.map((d) => ({ ...d, customer_count: countMap[d.id] ?? 0 })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    if (!name.trim()) { setFormError('Name is required'); return }
    if (!email.trim()) { setFormError('Email is required'); return }
    if (password.length < 6) { setFormError('Password must be at least 6 characters'); return }

    setSaving(true)
    setFormError('')

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const { data: { session } } = await supabase.auth.getSession()

    const res = await fetch(`${supabaseUrl}/functions/v1/create-driver`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
    })

    const result = await res.json()
    setSaving(false)

    if (!res.ok) {
      setFormError(result.error ?? 'Failed to create driver account.')
      return
    }

    setShowForm(false)
    setName(''); setEmail(''); setPassword(''); setFormError('')
    load()
  }

  async function toggleActive(driver: Profile) {
    await supabase.from('profiles').update({ active: !driver.active }).eq('id', driver.id)
    setConfirmToggle(null)
    load()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-48 text-gray-400">{t('common.loading')}</div>
  }

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">{t('drivers.title')}</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 bg-primary-600 text-white text-sm font-medium px-3 py-2 rounded-xl hover:bg-primary-700 transition-colors"
        >
          + {t('drivers.addDriver')}
        </button>
      </div>

      {/* Add Driver Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <h3 className="font-semibold text-gray-800">{t('drivers.addDriver')}</h3>
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{formError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('drivers.name')}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Driver name" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('drivers.email')}</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="driver@example.com" dir="ltr" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('drivers.password')}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="••••••" />
            <p className="text-xs text-gray-400 mt-1">{t('drivers.passwordHint')}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
            <strong>Note:</strong> Requires the <code>create-driver</code> Edge Function to be deployed.
            You can also create accounts via Supabase Dashboard → Authentication → Users.
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => { setShowForm(false); setFormError('') }} className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50">
              {t('common.cancel')}
            </button>
            <button onClick={handleCreate} disabled={saving} className="flex-1 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 disabled:opacity-60">
              {saving ? t('drivers.saving') : t('common.save')}
            </button>
          </div>
        </div>
      )}

      {/* Driver list */}
      {drivers.length === 0 ? (
        <p className="text-center text-gray-400 py-8">{t('drivers.noDrivers')}</p>
      ) : (
        <div className="space-y-2">
          {drivers.map((driver) => (
            <div key={driver.id} className={`bg-white rounded-2xl border border-gray-100 p-4 ${!driver.active ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{driver.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {driver.customer_count} {t('drivers.assignedCustomers')}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    onClick={() => setAssignTarget(assignTarget?.id === driver.id ? null : driver)}
                    className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg transition-colors font-medium"
                  >
                    Assign customers
                  </button>
                  <button
                    onClick={() => setConfirmToggle(driver)}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                      driver.active
                        ? 'bg-red-50 hover:bg-red-100 text-red-600'
                        : 'bg-green-50 hover:bg-green-100 text-green-600'
                    }`}
                  >
                    {driver.active ? t('drivers.deactivate') : t('drivers.activate')}
                  </button>
                </div>
              </div>

              {/* Inline bulk-assign panel */}
              {assignTarget?.id === driver.id && (
                <BulkAssignPanel
                  driver={driver}
                  onDone={() => { setAssignTarget(null); load() }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {confirmToggle && (
        <ConfirmDialog
          open={true}
          message={confirmToggle.active ? t('drivers.confirmDeactivate') : t('drivers.confirmActivate')}
          onConfirm={() => toggleActive(confirmToggle)}
          onCancel={() => setConfirmToggle(null)}
        />
      )}
    </div>
  )
}

// ── Bulk Assign Panel ────────────────────────────────────────────────
function BulkAssignPanel({ driver, onDone }: { driver: Profile; onDone: () => void }) {
  const [selectedDays, setSelectedDays] = useState<DeliveryDay[]>([...DELIVERY_DAYS])
  const [onlyUnassigned, setOnlyUnassigned] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState('')

  function toggleDay(day: DeliveryDay) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  async function handleAssign() {
    if (selectedDays.length === 0) return
    setSaving(true)
    setResult('')

    // Fetch matching customers
    let q = supabase
      .from('customers')
      .select('id')
      .eq('active', true)
      .overlaps('delivery_days', selectedDays)

    if (onlyUnassigned) {
      q = q.is('assigned_driver_id', null)
    }

    const { data: matches } = await q
    const ids = (matches ?? []).map((r: { id: string }) => r.id)

    if (ids.length === 0) {
      setResult('No matching customers found.')
      setSaving(false)
      return
    }

    await supabase
      .from('customers')
      .update({ assigned_driver_id: driver.id })
      .in('id', ids)

    setResult(`✓ Assigned ${ids.length} customers to ${driver.name}`)
    setSaving(false)
    setTimeout(onDone, 1200)
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
      <p className="text-sm font-medium text-gray-700">Assign all customers for:</p>

      {/* Day toggles */}
      <div className="flex flex-wrap gap-2">
        {DELIVERY_DAYS.map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => toggleDay(day)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              selectedDays.includes(day)
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {day.slice(0, 3)}
          </button>
        ))}
      </div>

      {/* Only unassigned toggle */}
      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={onlyUnassigned}
          onChange={(e) => setOnlyUnassigned(e.target.checked)}
          className="rounded"
        />
        Only customers without a driver
      </label>

      {result && (
        <p className={`text-sm font-medium ${result.startsWith('✓') ? 'text-green-600' : 'text-gray-500'}`}>
          {result}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onDone}
          className="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-600 text-sm font-medium hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleAssign}
          disabled={saving || selectedDays.length === 0}
          className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? 'Assigning…' : `Assign to ${driver.name}`}
        </button>
      </div>
    </div>
  )
}

const inputCls = 'w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white'
