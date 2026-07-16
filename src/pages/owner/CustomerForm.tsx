import { useState, FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { Customer, Profile, DELIVERY_DAYS, DeliveryDay } from '@/types'

interface Props {
  customer: Customer | null
  drivers: Profile[]
  onClose: () => void
  onSaved: () => void
}

export default function CustomerForm({ customer, drivers, onClose, onSaved }: Props) {
  const { t } = useTranslation()
  const isAddMode = !customer

  const [nameEn, setNameEn] = useState(customer?.name_en ?? '')
  const [nameAr, setNameAr] = useState(customer?.name_ar ?? '')
  const [area, setArea] = useState(customer?.area ?? '')
  const [locationUrl, setLocationUrl] = useState(customer?.location_url ?? '')
  const [price, setPrice] = useState(customer?.price_per_bottle?.toString() ?? '')
  const [price1_5l, setPrice1_5l] = useState(customer?.price_1_5l?.toString() ?? '')
  const [price500ml, setPrice500ml] = useState(customer?.price_500ml?.toString() ?? '')
  const [price250ml, setPrice250ml] = useState(customer?.price_250ml?.toString() ?? '')
  const [selectedDays, setSelectedDays] = useState<DeliveryDay[]>(customer?.delivery_days ?? [])
  const [driverId, setDriverId] = useState(customer?.assigned_driver_id ?? '')
  const [contact, setContact] = useState(customer?.contact ?? '')
  const [isNew, setIsNew] = useState(customer?.is_new ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function toggleDay(day: DeliveryDay) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!nameEn.trim()) { setError('English name is required'); return }
    if (selectedDays.length === 0) { setError('Select at least one delivery day'); return }

    setSaving(true)
    setError('')

    const payload = {
      name_en: nameEn.trim(),
      name_ar: nameAr.trim() || null,
      area: area.trim() || null,
      location_url: locationUrl.trim() || null,
      price_per_bottle: price ? parseFloat(price) : null,
      price_1_5l: price1_5l ? parseFloat(price1_5l) : null,
      price_500ml: price500ml ? parseFloat(price500ml) : null,
      price_250ml: price250ml ? parseFloat(price250ml) : null,
      delivery_days: selectedDays,
      assigned_driver_id: driverId || null,
      contact: contact.trim() || null,
      is_new: isNew,
    }

    if (isAddMode) {
      const { error: err } = await supabase.from('customers').insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase
        .from('customers')
        .update(payload)
        .eq('id', customer.id)
      if (err) { setError(err.message); setSaving(false); return }
    }

    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center sm:items-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">
            {isAddMode ? t('customers.addCustomer') : t('customers.editCustomer')}
          </h3>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <Field label={t('customers.nameEn')} required>
            <input
              type="text"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              className={inputCls}
              placeholder="e.g. Ahmed Store"
              dir="ltr"
            />
          </Field>

          <Field label={t('customers.nameAr')}>
            <input
              type="text"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              className={inputCls}
              placeholder="e.g. محل أحمد"
              dir="rtl"
            />
          </Field>

          <Field label={t('customers.area')}>
            <input
              type="text"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className={inputCls}
              placeholder="e.g. Musaffah"
            />
          </Field>

          <Field label={t('customers.mapLink')}>
            <input
              type="url"
              value={locationUrl}
              onChange={(e) => setLocationUrl(e.target.value)}
              className={inputCls}
              placeholder="https://maps.app.goo.gl/..."
              dir="ltr"
            />
          </Field>

          <Field label={t('customers.pricePerBottle')}>
            <input
              type="number"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={inputCls}
              placeholder="e.g. 15"
              min="0"
              step="0.5"
            />
          </Field>

          <div className="grid grid-cols-3 gap-2">
            <Field label={t('customers.price1_5l')}>
              <input
                type="number"
                inputMode="decimal"
                value={price1_5l}
                onChange={(e) => setPrice1_5l(e.target.value)}
                className={inputCls}
                placeholder="0"
                min="0"
                step="0.25"
              />
            </Field>
            <Field label={t('customers.price500ml')}>
              <input
                type="number"
                inputMode="decimal"
                value={price500ml}
                onChange={(e) => setPrice500ml(e.target.value)}
                className={inputCls}
                placeholder="0"
                min="0"
                step="0.25"
              />
            </Field>
            <Field label={t('customers.price250ml')}>
              <input
                type="number"
                inputMode="decimal"
                value={price250ml}
                onChange={(e) => setPrice250ml(e.target.value)}
                className={inputCls}
                placeholder="0"
                min="0"
                step="0.25"
              />
            </Field>
          </div>

          <Field label={t('customers.deliveryDays')} required>
            <div className="flex flex-wrap gap-2 mt-1">
              {DELIVERY_DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                    selectedDays.includes(day)
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t(`days.${day}`)}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t('customers.assignedDriver')}>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className={inputCls}
            >
              <option value="">{t('customers.unassigned')}</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>

          <Field label={t('route.contact')}>
            <input
              type="tel"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className={inputCls}
              placeholder="+971 50 000 0000"
              dir="ltr"
            />
          </Field>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isNew}
              onChange={(e) => setIsNew(e.target.checked)}
              className="rounded w-4 h-4"
            />
            <span className="text-sm font-medium text-gray-700">{t('route.newCustomer')}</span>
          </label>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 disabled:opacity-60 transition-colors"
            >
              {saving ? t('common.loading') : t('customers.saveCustomer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputCls = 'w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}
