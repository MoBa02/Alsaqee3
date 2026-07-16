import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { CustomerBalance, Delivery, Payment, formatCurrency, formatDate } from '@/types'

type SortMode = 'debt' | 'name'

export default function Payments() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { language } = useLang()

  const [customers, setCustomers] = useState<CustomerBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>('debt')
  const [ledgerCustomer, setLedgerCustomer] = useState<CustomerBalance | null>(null)
  const [payModal, setPayModal] = useState<CustomerBalance | null>(null)

  const displayName = (c: CustomerBalance) =>
    language === 'ar' ? (c.name_ar || c.name_en) : c.name_en

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('customer_balances')
      .select('*')
      .eq('active', true)
    setCustomers((data ?? []) as CustomerBalance[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = customers
    .filter((c) => {
      const q = search.toLowerCase()
      if (!q) return true
      return c.name_en.toLowerCase().includes(q) || (c.name_ar ?? '').includes(q)
    })
    .sort((a, b) => {
      if (sort === 'debt') return b.money_owed - a.money_owed
      return displayName(a).localeCompare(displayName(b))
    })

  if (loading) {
    return <div className="flex items-center justify-center h-48 text-gray-400">{t('common.loading')}</div>
  }

  return (
    <div className="px-4 py-4 space-y-3">
      <h2 className="text-lg font-bold text-gray-800">{t('payments.title')}</h2>

      {/* Summary chips */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        <div className="shrink-0 bg-red-50 rounded-xl px-4 py-3 text-center">
          <p className="text-xs text-red-600 font-medium">{t('payments.moneyOwed')}</p>
          <p className="text-lg font-bold text-red-700">
            {formatCurrency(filtered.filter((c) => c.money_owed > 0).reduce((s, c) => s + c.money_owed, 0))}
          </p>
        </div>
        <div className="shrink-0 bg-orange-50 rounded-xl px-4 py-3 text-center">
          <p className="text-xs text-orange-600 font-medium">{t('customers.bottlesOwed')}</p>
          <p className="text-lg font-bold text-orange-700">
            {filtered.filter((c) => c.bottles_owed > 0).reduce((s, c) => s + c.bottles_owed, 0)} 🫙
          </p>
        </div>
      </div>

      {/* Search + sort */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('payments.searchPlaceholder')}
            className="w-full border border-gray-300 rounded-xl ps-9 pe-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
        >
          <option value="debt">{t('payments.sortByDebt')}</option>
          <option value="name">{t('payments.sortByName')}</option>
        </select>
      </div>

      <div className="space-y-2">
        {filtered.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 leading-tight">{displayName(c)}</p>
                {c.area && <p className="text-xs text-gray-500 mt-0.5">{c.area}</p>}
                <div className="flex flex-wrap gap-2 mt-2">
                  {c.money_owed > 0 && (
                    <span className="text-sm font-bold text-red-600">
                      {t('payments.moneyOwed')} {formatCurrency(c.money_owed)}
                    </span>
                  )}
                  {c.money_owed < 0 && (
                    <span className="text-sm font-bold text-green-600">
                      {formatCurrency(Math.abs(c.money_owed))} {t('payments.inCredit')}
                    </span>
                  )}
                  {c.money_owed === 0 && (
                    <span className="text-sm text-gray-400">✓ settled</span>
                  )}
                  {c.bottles_owed > 0 && (
                    <span className="text-xs text-blue-600">{c.bottles_owed} 🫙 {t('payments.bottlesOut')}</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button
                  onClick={() => setPayModal(c)}
                  className="text-xs bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  + {t('payments.recordPayment')}
                </button>
                <button
                  onClick={() => setLedgerCustomer(c)}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {t('payments.viewLedger')}
                </button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-gray-400 py-8">{t('payments.noDebt')}</p>
        )}
      </div>

      {/* Payment modal */}
      {payModal && (
        <PaymentModal
          customer={payModal}
          userId={profile?.id ?? ''}
          onClose={() => setPayModal(null)}
          onSaved={() => { setPayModal(null); load() }}
          displayName={displayName(payModal)}
        />
      )}

      {/* Ledger modal */}
      {ledgerCustomer && (
        <LedgerModal
          customer={ledgerCustomer}
          displayName={displayName(ledgerCustomer)}
          onClose={() => setLedgerCustomer(null)}
        />
      )}
    </div>
  )
}

// ── Payment Modal ───────────────────────────────────────────────────
function PaymentModal({
  customer, userId, onClose, onSaved, displayName,
}: {
  customer: CustomerBalance
  userId: string
  onClose: () => void
  onSaved: () => void
  displayName: string
}) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'cash' | 'other'>('cash')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return }
    setSaving(true)
    const { error: err } = await supabase.from('payments').insert({
      customer_id: customer.id,
      amount: amt,
      date,
      method,
      note: note.trim() || null,
      recorded_by: userId,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center sm:items-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-xl">
        <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{t('payments.recordPayment')}</p>
            <p className="font-bold text-gray-900">{displayName}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">✕</button>
        </div>
        <div className="p-4 space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200">{error}</div>}

          {customer.money_owed > 0 && (
            <div className="bg-red-50 rounded-xl px-4 py-3 text-sm">
              <span className="text-red-600 font-medium">Currently owes: {formatCurrency(customer.money_owed)}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('payments.amount')}</label>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-2xl font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="0"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('payments.method')}</label>
            <div className="flex rounded-xl overflow-hidden border border-gray-300">
              {(['cash', 'other'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`flex-1 py-3 text-sm font-medium transition-colors ${method === m ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {t(`payments.${m}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('payments.date')}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('payments.note')}</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Optional note…"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors">
              {t('common.cancel')}
            </button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium disabled:opacity-60 transition-colors">
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Ledger Modal ────────────────────────────────────────────────────
function LedgerModal({
  customer, displayName, onClose,
}: {
  customer: CustomerBalance
  displayName: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<Array<{ date: string; type: 'delivery' | 'payment'; label: string; amount: number; bottles?: number }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: deliveries }, { data: payments }] = await Promise.all([
        supabase.from('deliveries').select('*').eq('customer_id', customer.id).order('date', { ascending: false }),
        supabase.from('payments').select('*').eq('customer_id', customer.id).order('date', { ascending: false }),
      ])

      const rows: typeof entries = []
      for (const d of (deliveries ?? []) as Delivery[]) {
        rows.push({
          date: d.date,
          type: 'delivery',
          label: `${d.bottles_delivered} bottles`,
          amount: Number(d.amount_charged ?? 0),
          bottles: d.bottles_delivered,
        })
      }
      for (const p of (payments ?? []) as Payment[]) {
        rows.push({
          date: p.date,
          type: 'payment',
          label: p.method === 'cash' ? 'Cash' : 'Other',
          amount: Number(p.amount),
        })
      }
      rows.sort((a, b) => b.date.localeCompare(a.date))
      setEntries(rows)
      setLoading(false)
    }
    load()
  }, [customer.id])

  let runningBalance = 0
  const entriesWithBalance = entries.map((e) => {
    if (e.type === 'delivery') runningBalance += e.amount
    else runningBalance -= e.amount
    return { ...e, balance: runningBalance }
  }).reverse()

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center sm:items-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <p className="text-sm text-gray-500">{t('payments.ledgerTitle')}</p>
            <p className="font-bold text-gray-900">{displayName}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">✕</button>
        </div>

        {/* Balance summary */}
        <div className="flex gap-3 p-4 border-b border-gray-100 shrink-0">
          <div className={`flex-1 rounded-xl p-3 text-center ${customer.money_owed > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
            <p className="text-xs text-gray-500 mb-0.5">{t('payments.balance')}</p>
            <p className={`font-bold ${customer.money_owed > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(Math.abs(customer.money_owed))}
            </p>
          </div>
          <div className="flex-1 rounded-xl p-3 text-center bg-blue-50">
            <p className="text-xs text-gray-500 mb-0.5">{t('customers.bottlesOwed')}</p>
            <p className="font-bold text-blue-600">{customer.bottles_owed} 🫙</p>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <p className="text-center text-gray-400 py-8">{t('common.loading')}</p>
          ) : entries.length === 0 ? (
            <p className="text-center text-gray-400 py-8">{t('payments.noHistory')}</p>
          ) : (
            <div className="space-y-2">
              {[...entriesWithBalance].reverse().map((e, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${e.type === 'delivery' ? 'bg-blue-100' : 'bg-green-100'}`}>
                    {e.type === 'delivery' ? '🫙' : '💵'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {e.type === 'delivery' ? `${t('payments.deliveryOn')} — ${e.label}` : `${t('payments.paymentOn')} (${e.label})`}
                    </p>
                    <p className="text-xs text-gray-400">{formatDate(e.date)}</p>
                  </div>
                  <div className="text-end shrink-0">
                    <p className={`text-sm font-bold ${e.type === 'delivery' ? 'text-red-500' : 'text-green-600'}`}>
                      {e.type === 'delivery' ? '+' : '−'}{formatCurrency(e.amount)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
