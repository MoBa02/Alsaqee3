import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Meeting, SALES_AREAS, DELIVERY_DAYS, DeliveryDay, formatDate, todayLocalISO } from '@/types'

type Filter = 'all' | 'open' | 'closed'

interface AddForm {
  contactName: string
  contactPhone: string
  area: string
  notes: string
  meetingDate: string
  meetingTime: string
}

interface EditForm extends AddForm {
  id: string
  status: 'open' | 'closed'
  customerId: string | null
}

interface CloseDealForm {
  nameEn: string
  nameAr: string
  area: string
  contact: string
  price: string
  price1_5l: string
  price500ml: string
  price250ml: string
  deliveryDays: DeliveryDay[]
}

interface AddCustomerForm {
  nameEn: string
  nameAr: string
  area: string
  contact: string
  price: string
  price1_5l: string
  price500ml: string
  price250ml: string
  deliveryDays: DeliveryDay[]
}

const emptyAddCustomer = (): AddCustomerForm => ({
  nameEn: '', nameAr: '', area: '', contact: '',
  price: '', price1_5l: '', price500ml: '', price250ml: '',
  deliveryDays: [],
})

const emptyAdd = (): AddForm => ({
  contactName: '',
  contactPhone: '',
  area: '',
  notes: '',
  meetingDate: todayLocalISO(),
  meetingTime: '',
})

export default function Meetings() {
  const { t } = useTranslation()
  const { profile } = useAuth()

  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [closingMeeting, setClosingMeeting] = useState<Meeting | null>(null)

  const [addForm, setAddForm] = useState<AddForm>(emptyAdd())
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  const [closeForm, setCloseForm] = useState<CloseDealForm>({
    nameEn: '', nameAr: '', area: '', contact: '',
    price: '', price1_5l: '', price500ml: '', price250ml: '',
    deliveryDays: [],
  })
  const [closeSaving, setCloseSaving] = useState(false)
  const [closeError, setCloseError] = useState('')

  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [addCustForm, setAddCustForm] = useState<AddCustomerForm>(emptyAddCustomer())
  const [addCustSaving, setAddCustSaving] = useState(false)
  const [addCustError, setAddCustError] = useState('')

  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [confirmingReopen, setConfirmingReopen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('meetings')
      .select('*')
      .order('created_at', { ascending: false })
    setMeetings((data ?? []) as Meeting[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = meetings.filter((m) => {
    if (filter === 'open') return m.status === 'open'
    if (filter === 'closed') return m.status === 'closed'
    return true
  })

  function set(field: keyof AddForm, value: string) {
    setAddForm((f) => ({ ...f, [field]: value }))
  }

  async function handleAddMeeting() {
    if (!addForm.contactName.trim()) { setAddError(t('meetings.contactName') + ' is required'); return }
    setAddSaving(true)
    setAddError('')

    const { error } = await supabase.from('meetings').insert({
      sales_id: profile!.id,
      contact_name: addForm.contactName.trim(),
      contact_phone: addForm.contactPhone.trim() || null,
      area: addForm.area || null,
      notes: addForm.notes.trim() || null,
      meeting_date: addForm.meetingDate || null,
      meeting_time: addForm.meetingTime || null,
    })

    setAddSaving(false)
    if (error) { setAddError(error.message); return }

    setShowAddForm(false)
    setAddForm(emptyAdd())
    load()
  }

  async function handleAddCustomer() {
    if (!addCustForm.nameEn.trim()) { setAddCustError('Customer name is required'); return }
    if (addCustForm.deliveryDays.length === 0) { setAddCustError('Select at least one delivery day'); return }

    setAddCustSaving(true)
    setAddCustError('')

    let assignedDriverId: string | null = null
    if (addCustForm.area) {
      const { data: areaCusts } = await supabase
        .from('customers')
        .select('assigned_driver_id')
        .eq('area', addCustForm.area)
        .eq('active', true)
        .not('assigned_driver_id', 'is', null)
        .limit(20)

      if (areaCusts && areaCusts.length > 0) {
        const counts: Record<string, number> = {}
        for (const row of areaCusts) {
          const id = (row as { assigned_driver_id: string }).assigned_driver_id
          counts[id] = (counts[id] ?? 0) + 1
        }
        assignedDriverId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      }
    }

    const { error } = await supabase.from('customers').insert({
      name_en: addCustForm.nameEn.trim(),
      name_ar: addCustForm.nameAr.trim() || null,
      area: addCustForm.area || null,
      contact: addCustForm.contact.trim() || null,
      price_per_bottle: addCustForm.price ? parseFloat(addCustForm.price) : null,
      price_1_5l: addCustForm.price1_5l ? parseFloat(addCustForm.price1_5l) : null,
      price_500ml: addCustForm.price500ml ? parseFloat(addCustForm.price500ml) : null,
      price_250ml: addCustForm.price250ml ? parseFloat(addCustForm.price250ml) : null,
      delivery_days: addCustForm.deliveryDays,
      assigned_driver_id: assignedDriverId,
      is_new: true,
      active: true,
    })

    setAddCustSaving(false)
    if (error) { setAddCustError(error.message); return }

    setShowAddCustomer(false)
    setAddCustForm(emptyAddCustomer())
  }

  function openEdit(meeting: Meeting) {
    setEditForm({
      id: meeting.id,
      status: meeting.status,
      customerId: meeting.customer_id,
      contactName: meeting.contact_name,
      contactPhone: meeting.contact_phone ?? '',
      area: meeting.area ?? '',
      notes: meeting.notes ?? '',
      meetingDate: meeting.meeting_date ?? '',
      meetingTime: meeting.meeting_time ?? '',
    })
    setEditError('')
    setConfirmingReopen(false)
    setConfirmingDelete(false)
  }

  async function handleDeleteMeeting() {
    if (!editForm) return
    setEditSaving(true)
    setEditError('')

    // .select('id') returns the deleted rows — if RLS blocks the delete it
    // "succeeds" with 0 rows, so check and surface that instead of failing silently
    const { data, error } = await supabase.from('meetings').delete().eq('id', editForm.id).select('id')

    setEditSaving(false)
    if (error) { setEditError(`Failed to delete meeting: ${error.message}`); return }
    if (!data || data.length === 0) {
      setEditError('Delete was blocked — you can only delete meetings you created.')
      return
    }

    setEditForm(null)
    setConfirmingDelete(false)
    load()
  }

  async function handleSaveEdit() {
    if (!editForm) return
    if (!editForm.contactName.trim()) { setEditError('Contact name is required'); return }

    setEditSaving(true)
    setEditError('')

    const { error } = await supabase
      .from('meetings')
      .update({
        contact_name: editForm.contactName.trim(),
        contact_phone: editForm.contactPhone.trim() || null,
        area: editForm.area || null,
        notes: editForm.notes.trim() || null,
        meeting_date: editForm.meetingDate || null,
        meeting_time: editForm.meetingTime || null,
      })
      .eq('id', editForm.id)

    setEditSaving(false)
    if (error) { setEditError(error.message); return }

    setEditForm(null)
    load()
  }

  async function handleReopen() {
    if (!editForm) return
    setEditSaving(true)
    setEditError('')

    // If there's a linked customer, deactivate it (safe — preserves deliveries/payments)
    if (editForm.customerId) {
      const { error: custErr } = await supabase
        .from('customers')
        .update({ active: false })
        .eq('id', editForm.customerId)
      if (custErr) { setEditError(`Failed to deactivate customer: ${custErr.message}`); setEditSaving(false); return }
    }

    const { error: meetErr } = await supabase
      .from('meetings')
      .update({
        status: 'open',
        customer_id: null,
        closed_at: null,
        delivery_day: null,
      })
      .eq('id', editForm.id)

    setEditSaving(false)
    if (meetErr) { setEditError(`Failed to reopen meeting: ${meetErr.message}`); return }

    setEditForm(null)
    setConfirmingReopen(false)
    load()
  }

  function openCloseDeal(meeting: Meeting) {
    setClosingMeeting(meeting)
    setCloseForm({
      nameEn: meeting.contact_name,
      nameAr: '',
      area: meeting.area ?? '',
      contact: meeting.contact_phone ?? '',
      price: '',
      price1_5l: '',
      price500ml: '',
      price250ml: '',
      deliveryDays: [],
    })
    setCloseError('')
  }

  function toggleCloseDay(day: DeliveryDay) {
    setCloseForm((f) => ({
      ...f,
      deliveryDays: f.deliveryDays.includes(day)
        ? f.deliveryDays.filter((d) => d !== day)
        : [...f.deliveryDays, day],
    }))
  }

  async function handleCloseDeal() {
    if (!closeForm.nameEn.trim()) { setCloseError('Customer name is required'); return }
    if (closeForm.deliveryDays.length === 0) { setCloseError('Select at least one delivery day'); return }

    setCloseSaving(true)
    setCloseError('')

    const deliveryDays = closeForm.deliveryDays

    // Auto-assign driver by most common driver in the same area
    let assignedDriverId: string | null = null
    if (closeForm.area) {
      const { data: areaCusts } = await supabase
        .from('customers')
        .select('assigned_driver_id')
        .eq('area', closeForm.area)
        .eq('active', true)
        .not('assigned_driver_id', 'is', null)
        .limit(20)

      if (areaCusts && areaCusts.length > 0) {
        const counts: Record<string, number> = {}
        for (const row of areaCusts) {
          const id = (row as { assigned_driver_id: string }).assigned_driver_id
          counts[id] = (counts[id] ?? 0) + 1
        }
        assignedDriverId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      }
    }

    const { data: newCust, error: custErr } = await supabase
      .from('customers')
      .insert({
        name_en: closeForm.nameEn.trim(),
        name_ar: closeForm.nameAr.trim() || null,
        area: closeForm.area || null,
        contact: closeForm.contact.trim() || null,
        price_per_bottle: closeForm.price ? parseFloat(closeForm.price) : null,
        price_1_5l: closeForm.price1_5l ? parseFloat(closeForm.price1_5l) : null,
        price_500ml: closeForm.price500ml ? parseFloat(closeForm.price500ml) : null,
        price_250ml: closeForm.price250ml ? parseFloat(closeForm.price250ml) : null,
        delivery_days: deliveryDays,
        assigned_driver_id: assignedDriverId,
        is_new: true,
        active: true,
      })
      .select('id')
      .single()

    if (custErr) { setCloseError(custErr.message); setCloseSaving(false); return }

    const { error: meetErr } = await supabase
      .from('meetings')
      .update({
        status: 'closed',
        customer_id: newCust.id,
        closed_at: new Date().toISOString(),
        delivery_day: deliveryDays[0] ?? null,
      })
      .eq('id', closingMeeting!.id)

    if (meetErr) { setCloseError(meetErr.message); setCloseSaving(false); return }

    setCloseSaving(false)
    setClosingMeeting(null)
    load()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-48 text-gray-400">{t('common.loading')}</div>
  }

  return (
    <div className="px-4 py-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-gray-800 shrink-0">{t('meetings.title')}</h2>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowAddCustomer(true); setAddCustError('') }}
            className="flex items-center gap-1 border border-primary-600 text-primary-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-primary-50 transition-colors"
          >
            + {t('customers.addCustomer')}
          </button>
          <button
            onClick={() => { setShowAddForm(!showAddForm); setAddError('') }}
            className="flex items-center gap-1.5 bg-primary-600 text-white text-sm font-medium px-3 py-2 rounded-xl hover:bg-primary-700 transition-colors"
          >
            + {t('meetings.addMeeting')}
          </button>
        </div>
      </div>

      {/* Add Meeting Form */}
      {showAddForm && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <h3 className="font-semibold text-gray-800">{t('meetings.addMeeting')}</h3>
          {addError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{addError}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('meetings.contactName')} *</label>
            <input
              type="text"
              value={addForm.contactName}
              onChange={(e) => set('contactName', e.target.value)}
              className={inputCls}
              placeholder="Name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('meetings.contactPhone')}</label>
            <input
              type="tel"
              value={addForm.contactPhone}
              onChange={(e) => set('contactPhone', e.target.value)}
              className={inputCls}
              placeholder="+971 50 000 0000"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('meetings.city')}</label>
            <select value={addForm.area} onChange={(e) => set('area', e.target.value)} className={inputCls}>
              <option value="">— Select city —</option>
              {SALES_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('meetings.meetingDate')}</label>
              <input
                type="date"
                value={addForm.meetingDate}
                onChange={(e) => set('meetingDate', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('meetings.meetingTime')}</label>
              <input
                type="time"
                value={addForm.meetingTime}
                onChange={(e) => set('meetingTime', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('meetings.notes')}</label>
            <textarea
              value={addForm.notes}
              onChange={(e) => set('notes', e.target.value)}
              className={`${inputCls} resize-none`}
              rows={2}
              placeholder="Optional notes…"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setShowAddForm(false); setAddError('') }}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleAddMeeting}
              disabled={addSaving}
              className="flex-1 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 disabled:opacity-60"
            >
              {addSaving ? t('meetings.saving') : t('common.save')}
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
        {(['all', 'open', 'closed'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              filter === f ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500'
            }`}
          >
            {t(`meetings.filter${f.charAt(0).toUpperCase() + f.slice(1)}`)}
          </button>
        ))}
      </div>

      {/* Meeting count */}
      <p className="text-xs text-gray-400 px-1">{filtered.length} meeting{filtered.length !== 1 ? 's' : ''}</p>

      {/* Meeting cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400">
          <span className="text-4xl">🤝</span>
          <p>{t('meetings.noMeetings')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => (
            <MeetingCard key={m.id} meeting={m} onCloseDeal={() => openCloseDeal(m)} onEdit={() => openEdit(m)} />
          ))}
        </div>
      )}

      {/* Add Customer Modal */}
      {showAddCustomer && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center sm:items-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{t('customers.addCustomer')}</h3>
              <button onClick={() => setShowAddCustomer(false)} className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">✕</button>
            </div>

            <div className="p-4 space-y-4">
              {addCustError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{addCustError}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('meetings.customerNameEn')} *</label>
                <input
                  type="text"
                  value={addCustForm.nameEn}
                  onChange={(e) => setAddCustForm((f) => ({ ...f, nameEn: e.target.value }))}
                  className={inputCls}
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('meetings.customerNameAr')}</label>
                <input
                  type="text"
                  value={addCustForm.nameAr}
                  onChange={(e) => setAddCustForm((f) => ({ ...f, nameAr: e.target.value }))}
                  className={inputCls}
                  dir="rtl"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('meetings.city')}</label>
                <select
                  value={addCustForm.area}
                  onChange={(e) => setAddCustForm((f) => ({ ...f, area: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">— Select city —</option>
                  {SALES_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('meetings.deliveryDay')} *</label>
                <div className="flex flex-wrap gap-2">
                  {DELIVERY_DAYS.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setAddCustForm((f) => ({
                        ...f,
                        deliveryDays: f.deliveryDays.includes(day)
                          ? f.deliveryDays.filter((d) => d !== day)
                          : [...f.deliveryDays, day],
                      }))}
                      className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                        addCustForm.deliveryDays.includes(day)
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {day.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('meetings.contactPhone')}</label>
                <input
                  type="tel"
                  value={addCustForm.contact}
                  onChange={(e) => setAddCustForm((f) => ({ ...f, contact: e.target.value }))}
                  className={inputCls}
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('customers.pricePerBottle')}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={addCustForm.price}
                  onChange={(e) => setAddCustForm((f) => ({ ...f, price: e.target.value }))}
                  className={inputCls}
                  placeholder="e.g. 15"
                  min="0"
                  step="0.5"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('customers.price1_5l')}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={addCustForm.price1_5l}
                    onChange={(e) => setAddCustForm((f) => ({ ...f, price1_5l: e.target.value }))}
                    className={inputCls}
                    placeholder="0"
                    min="0"
                    step="0.25"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('customers.price500ml')}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={addCustForm.price500ml}
                    onChange={(e) => setAddCustForm((f) => ({ ...f, price500ml: e.target.value }))}
                    className={inputCls}
                    placeholder="0"
                    min="0"
                    step="0.25"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('customers.price250ml')}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={addCustForm.price250ml}
                    onChange={(e) => setAddCustForm((f) => ({ ...f, price250ml: e.target.value }))}
                    className={inputCls}
                    placeholder="0"
                    min="0"
                    step="0.25"
                  />
                </div>
              </div>

              <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700">
                🚐 Driver will be auto-assigned based on the city.
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowAddCustomer(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleAddCustomer}
                  disabled={addCustSaving}
                  className="flex-1 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 disabled:opacity-60"
                >
                  {addCustSaving ? t('meetings.saving') : t('customers.saveCustomer')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Close Deal Modal */}
      {closingMeeting && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center sm:items-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{t('meetings.closeDeal')}</h3>
              <button onClick={() => setClosingMeeting(null)} className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">✕</button>
            </div>

            <div className="p-4 space-y-4">
              {closeError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{closeError}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('meetings.customerNameEn')} *</label>
                <input
                  type="text"
                  value={closeForm.nameEn}
                  onChange={(e) => setCloseForm((f) => ({ ...f, nameEn: e.target.value }))}
                  className={inputCls}
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('meetings.customerNameAr')}</label>
                <input
                  type="text"
                  value={closeForm.nameAr}
                  onChange={(e) => setCloseForm((f) => ({ ...f, nameAr: e.target.value }))}
                  className={inputCls}
                  dir="rtl"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('meetings.city')}</label>
                <select
                  value={closeForm.area}
                  onChange={(e) => setCloseForm((f) => ({ ...f, area: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">— Select city —</option>
                  {SALES_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('meetings.deliveryDay')} *</label>
                <div className="flex flex-wrap gap-2">
                  {DELIVERY_DAYS.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleCloseDay(day)}
                      className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                        closeForm.deliveryDays.includes(day)
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {day.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('meetings.contactPhone')}</label>
                <input
                  type="tel"
                  value={closeForm.contact}
                  onChange={(e) => setCloseForm((f) => ({ ...f, contact: e.target.value }))}
                  className={inputCls}
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('customers.pricePerBottle')}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={closeForm.price}
                  onChange={(e) => setCloseForm((f) => ({ ...f, price: e.target.value }))}
                  className={inputCls}
                  placeholder="e.g. 15"
                  min="0"
                  step="0.5"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('customers.price1_5l')}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={closeForm.price1_5l}
                    onChange={(e) => setCloseForm((f) => ({ ...f, price1_5l: e.target.value }))}
                    className={inputCls}
                    placeholder="0"
                    min="0"
                    step="0.25"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('customers.price500ml')}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={closeForm.price500ml}
                    onChange={(e) => setCloseForm((f) => ({ ...f, price500ml: e.target.value }))}
                    className={inputCls}
                    placeholder="0"
                    min="0"
                    step="0.25"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('customers.price250ml')}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={closeForm.price250ml}
                    onChange={(e) => setCloseForm((f) => ({ ...f, price250ml: e.target.value }))}
                    className={inputCls}
                    placeholder="0"
                    min="0"
                    step="0.25"
                  />
                </div>
              </div>

              <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700">
                🚐 Driver will be auto-assigned based on the city.
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setClosingMeeting(null)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleCloseDeal}
                  disabled={closeSaving}
                  className="flex-1 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-60"
                >
                  {closeSaving ? t('meetings.saving') : t('meetings.closeAndCreate')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Meeting Modal */}
      {editForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center sm:items-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{t('meetings.editMeeting')}</h3>
              <button
                onClick={() => { setEditForm(null); setConfirmingReopen(false); setConfirmingDelete(false) }}
                className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              {editError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{editError}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('meetings.contactName')} *</label>
                <input
                  type="text"
                  value={editForm.contactName}
                  onChange={(e) => setEditForm((f) => f && { ...f, contactName: e.target.value })}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('meetings.contactPhone')}</label>
                <input
                  type="tel"
                  value={editForm.contactPhone}
                  onChange={(e) => setEditForm((f) => f && { ...f, contactPhone: e.target.value })}
                  className={inputCls}
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('meetings.city')}</label>
                <select
                  value={editForm.area}
                  onChange={(e) => setEditForm((f) => f && { ...f, area: e.target.value })}
                  className={inputCls}
                >
                  <option value="">— Select city —</option>
                  {SALES_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('meetings.meetingDate')}</label>
                  <input
                    type="date"
                    value={editForm.meetingDate}
                    onChange={(e) => setEditForm((f) => f && { ...f, meetingDate: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('meetings.meetingTime')}</label>
                  <input
                    type="time"
                    value={editForm.meetingTime}
                    onChange={(e) => setEditForm((f) => f && { ...f, meetingTime: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('meetings.notes')}</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => f && { ...f, notes: e.target.value })}
                  className={`${inputCls} resize-none`}
                  rows={2}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setEditForm(null); setConfirmingReopen(false); setConfirmingDelete(false) }}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={editSaving}
                  className="flex-1 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 disabled:opacity-60"
                >
                  {editSaving ? t('meetings.saving') : t('common.save')}
                </button>
              </div>

              {/* Reopen (closed meetings only) */}
              {editForm.status === 'closed' && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                  <p className="text-sm font-medium text-gray-700">{t('meetings.reopenSection')}</p>
                  {!confirmingReopen ? (
                    <button
                      onClick={() => setConfirmingReopen(true)}
                      className="w-full py-2.5 border border-amber-300 text-amber-700 rounded-xl text-sm font-medium hover:bg-amber-50"
                    >
                      🔓 {t('meetings.reopenDeal')}
                    </button>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                      <p className="text-xs text-amber-800">{t('meetings.reopenWarning')}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmingReopen(false)}
                          className="flex-1 py-2 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600"
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          onClick={handleReopen}
                          disabled={editSaving}
                          className="flex-1 py-2 rounded-lg text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                        >
                          {editSaving ? t('meetings.saving') : t('meetings.confirmReopen')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Delete meeting */}
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                {!confirmingDelete ? (
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    className="w-full py-2.5 border border-red-300 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50"
                  >
                    🗑️ {t('meetings.deleteMeeting')}
                  </button>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                    <p className="text-xs text-red-800">{t('meetings.deleteWarning')}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmingDelete(false)}
                        className="flex-1 py-2 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={handleDeleteMeeting}
                        disabled={editSaving}
                        className="flex-1 py-2 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {editSaving ? t('meetings.saving') : t('meetings.confirmDelete')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MeetingCard({ meeting, onCloseDeal, onEdit }: { meeting: Meeting; onCloseDeal: () => void; onEdit: () => void }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const isOpen = meeting.status === 'open'

  const dateTimeStr = [
    meeting.meeting_date ? new Date(meeting.meeting_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : null,
    meeting.meeting_time ? meeting.meeting_time.slice(0, 5) : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className={`bg-white rounded-2xl border-2 ${isOpen ? 'border-gray-100' : 'border-green-200'}`}>
      <button className="w-full text-start p-4" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 leading-tight">{meeting.contact_name}</p>
            {meeting.contact_phone && (
              <p className="text-xs text-gray-400 mt-0.5">📞 {meeting.contact_phone}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              isOpen ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'
            }`}>
              {isOpen ? t('meetings.open') : t('meetings.closed')}
            </span>
            <span className="text-gray-400 text-sm">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-2">
          {meeting.area && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{meeting.area}</span>
          )}
          {dateTimeStr && (
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">📅 {dateTimeStr}</span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
          {meeting.notes && (
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{meeting.notes}</p>
          )}
          {meeting.contact_phone && (
            <a
              href={`tel:${meeting.contact_phone}`}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors"
            >
              📞 {meeting.contact_phone}
            </a>
          )}
          {isOpen && (
            <div className="flex gap-2">
              <button
                onClick={onEdit}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-medium text-sm hover:bg-gray-200 transition-colors"
              >
                ✏️ {t('common.edit')}
              </button>
              <button
                onClick={onCloseDeal}
                className="flex-1 py-3 rounded-xl bg-primary-600 text-white font-medium text-sm hover:bg-primary-700 transition-colors"
              >
                ✅ {t('meetings.closeDeal')}
              </button>
            </div>
          )}
          {!isOpen && (
            <>
              {meeting.closed_at && (
                <p className="text-xs text-gray-400 text-center">
                  {t('meetings.dealClosed')}: {formatDate(meeting.closed_at)}
                  {meeting.delivery_day && ` · ${meeting.delivery_day}`}
                </p>
              )}
              <button
                onClick={onEdit}
                className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-medium text-sm hover:bg-gray-200 transition-colors"
              >
                ✏️ {t('common.edit')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const inputCls = 'w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white'
