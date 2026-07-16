import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { Language } from '@/types'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import DriverRoute from '@/pages/driver/DriverRoute'
import DriverSummary from '@/pages/driver/DriverSummary'
import OwnerRoute from '@/pages/owner/OwnerRoute'
import Customers from '@/pages/owner/Customers'
import Payments from '@/pages/owner/Payments'
import Reports from '@/pages/owner/Reports'
import Employees from '@/pages/owner/Employees'
import Meetings from '@/pages/sales/Meetings'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-lg">Loading…</div>
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { profile } = useAuth()
  const { setLanguage } = useLang()
  const role = profile?.role

  useEffect(() => {
    if (profile?.language_preference) {
      setLanguage(profile.language_preference as Language)
    }
  }, [profile?.id])

  // Don't render role-based routes until profile is loaded
  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-lg">Loading…</div>
      </div>
    )
  }

  if (role === 'driver') {
    return (
      <Layout>
        <Routes>
          <Route path="/route" element={<DriverRoute />} />
          <Route path="/summary" element={<DriverSummary />} />
          <Route path="*" element={<Navigate to="/route" replace />} />
        </Routes>
      </Layout>
    )
  }

  if (role === 'sales') {
    return (
      <Layout>
        <Routes>
          <Route path="/meetings" element={<Meetings />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="*" element={<Navigate to="/meetings" replace />} />
        </Routes>
      </Layout>
    )
  }

  // owner + manager share the same set of tabs
  return (
    <Layout>
      <Routes>
        <Route path="/route" element={<OwnerRoute />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="*" element={<Navigate to="/route" replace />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <AppRoutes />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
