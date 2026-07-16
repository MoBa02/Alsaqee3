import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { Profile, todayLocalISO } from '@/types'
import DriverRoute from '@/pages/driver/DriverRoute'

export default function OwnerRoute() {
  const { t } = useTranslation()
  const [drivers, setDrivers] = useState<Profile[]>([])
  const [selectedDriverId, setSelectedDriverId] = useState<string>('all')
  const [date, setDate] = useState(todayLocalISO())

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .eq('role', 'driver')
      .eq('active', true)
      .order('name')
      .then(({ data }) => setDrivers((data ?? []) as Profile[]))
  }, [])

  return (
    <div>
      {/* Filter bar */}
      <div className="px-4 pt-4 pb-2 space-y-2 bg-gray-50 border-b border-gray-200">
        <div className="flex gap-2">
          <select
            value={selectedDriverId}
            onChange={(e) => setSelectedDriverId(e.target.value)}
            className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
          >
            <option value="all">{t('route.allDrivers')}</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* "All Drivers" → no driver filter, owner sees every customer for the day */}
      {selectedDriverId === 'all' ? (
        <DriverRoute overrideDate={date} />
      ) : (
        <DriverRoute overrideDriverId={selectedDriverId} overrideDate={date} />
      )}
    </div>
  )
}
