import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/AuthContext'
import { AppLayout } from './components/AppLayout'
import { SalesDashboard } from './pages/SalesDashboard'
import { ServicesDashboard } from './pages/ServicesDashboard'
import { FinanceDashboard } from './pages/FinanceDashboard'
import { KpiSettingsPage } from './pages/KpiSettingsPage'
import { UsersPage } from './pages/UsersPage'
import { LoginPage } from './pages/LoginPage'
import { AuthCallback } from './pages/AuthCallback'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p className="login-card__sub">Đang tải...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"         element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/" element={<Navigate to="/dashboard/sales" replace />} />
          <Route element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }>
            <Route path="/dashboard/sales"    element={<SalesDashboard />} />
            <Route path="/dashboard/services" element={<ServicesDashboard />} />
            <Route path="/dashboard/finance"  element={<FinanceDashboard />} />
            <Route path="/settings/kpi"       element={<KpiSettingsPage />} />
            <Route path="/users"              element={<UsersPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
