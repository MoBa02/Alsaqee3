import { ReactNode, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import LanguageToggle from './LanguageToggle'

interface Props {
  children: ReactNode
}

const ADMIN_TABS = [
  { to: '/route',     labelKey: 'nav.myRoute',    icon: '🗺️' },
  { to: '/customers', labelKey: 'nav.customers',  icon: '👥' },
  { to: '/payments',  labelKey: 'nav.payments',   icon: '💰' },
  { to: '/reports',   labelKey: 'nav.reports',    icon: '📈' },
  { to: '/employees', labelKey: 'nav.employees',  icon: '🚐' },
]

const DRIVER_TABS = [
  { to: '/route',   labelKey: 'nav.myRoute', icon: '🗺️' },
  { to: '/summary', labelKey: 'nav.summary', icon: '📊' },
]

const SALES_TABS = [
  { to: '/meetings', labelKey: 'nav.meetings', icon: '🤝' },
  { to: '/reports',  labelKey: 'nav.reports',  icon: '📈' },
]

export default function Layout({ children }: Props) {
  const { t } = useTranslation()
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const role = profile?.role
  const tabs =
    role === 'owner' || role === 'manager' ? ADMIN_TABS :
    role === 'sales' ? SALES_TABS :
    DRIVER_TABS

  const headerTitle =
    role === 'driver' ? t('route.todaysRoute') :
    role === 'sales'  ? t('meetings.title') :
    t('auth.appName')

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-primary-600 text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-lg truncate">💧 {headerTitle}</span>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-lg hover:bg-white/20 transition-colors"
              aria-label="Menu"
            >
              <span className="w-5 h-0.5 bg-white rounded-full"></span>
              <span className="w-5 h-0.5 bg-white rounded-full"></span>
              <span className="w-5 h-0.5 bg-white rounded-full"></span>
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="absolute top-14 end-0 w-48 bg-white shadow-lg rounded-bl-xl z-50 border border-gray-100">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-900 truncate">{profile?.name}</p>
              <p className="text-xs text-gray-500 capitalize">{profile?.role}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full text-start px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              {t('auth.signOut')}
            </button>
          </div>
        )}
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
      )}

      <main className="flex-1 max-w-2xl mx-auto w-full pb-20">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 shadow-lg">
        <div className="max-w-2xl mx-auto flex">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors min-h-[56px] ${
                  isActive
                    ? 'text-primary-600 border-t-2 border-primary-600'
                    : 'text-gray-500 hover:text-gray-700 border-t-2 border-transparent'
                }`
              }
              onClick={() => setMenuOpen(false)}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className="leading-none mt-0.5">{t(tab.labelKey)}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
