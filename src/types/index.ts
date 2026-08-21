export type Role = 'owner' | 'manager' | 'driver' | 'sales'
export type Language = 'en' | 'ar'
export type PaymentMethod = 'cash' | 'other'
export type DeliveryDay = 'Saturday' | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday'

export interface Profile {
  id: string
  name: string
  role: Role
  language_preference: Language
  active: boolean
  created_at: string
}

export interface Customer {
  id: string
  name_en: string
  name_ar: string | null
  area: string | null
  location_url: string | null
  price_per_bottle: number | null
  price_1_5l: number | null
  price_500ml: number | null
  price_250ml: number | null
  delivery_days: DeliveryDay[]
  assigned_driver_id: string | null
  active: boolean
  sort_order: number
  contact: string | null
  is_new: boolean
  created_at: string
}

export interface CustomerBalance extends Customer {
  bottles_owed: number
  money_owed: number
}

export interface Meeting {
  id: string
  sales_id: string
  contact_name: string
  contact_phone: string | null
  area: string | null
  notes: string | null
  status: 'open' | 'closed'
  delivery_day: string | null
  customer_id: string | null
  closed_at: string | null
  meeting_date: string | null
  meeting_time: string | null
  created_at: string
}

export interface Delivery {
  id: string
  customer_id: string
  driver_id: string | null
  date: string
  empties_returned: number
  bottles_delivered: number
  bottles_1_5l: number
  bottles_500ml: number
  bottles_250ml: number
  price_per_bottle_at_time: number | null
  amount_charged: number | null
  note: string | null
  created_at: string
}

export interface Payment {
  id: string
  customer_id: string
  amount: number
  date: string
  method: PaymentMethod
  note: string | null
  recorded_by: string | null
  created_at: string
}

export const DELIVERY_DAYS: DeliveryDay[] = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

export const SALES_AREAS = ['Mafraq', 'Abu Dhabi', 'Musaffah', 'Baniyas', 'Shakhboot', 'Shawamikh', 'MBZ', 'Shabiya'] as const
export type SalesArea = typeof SALES_AREAS[number]

export const JS_DAY_TO_DELIVERY_DAY: Record<number, DeliveryDay> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
}

export interface Expense {
  id: string
  driver_id: string
  date: string
  amount: number
  description: string
  created_at: string
}

export function toLocalISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayLocalISO(): string {
  return toLocalISO(new Date())
}

export function getDeliveryDayForDate(dateStr: string): DeliveryDay {
  const d = new Date(dateStr + 'T12:00:00')
  return JS_DAY_TO_DELIVERY_DAY[d.getDay()]
}

export function getTodayDeliveryDay(): DeliveryDay {
  return getDeliveryDayForDate(todayLocalISO())
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount) + ' AED'
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
