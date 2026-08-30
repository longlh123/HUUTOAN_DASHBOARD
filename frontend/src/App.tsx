import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/AuthContext'
import { AppLayout } from './components/AppLayout'
import { SalesDashboard } from './pages/SalesDashboard'
import { DailyReportPage } from './pages/DailyReportPage'
import { ReconciliationPage } from './pages/ReconciliationPage'
import { ProjectTrackingPage } from './pages/ProjectTrackingPage'
import { ProjectTimelinePage } from './pages/ProjectTimelinePage'
import { WeeklyPulsePage } from './pages/WeeklyPulsePage'
import { FinancePulsePage } from './pages/FinancePulsePage'
import { ServicesDashboard } from './pages/ServicesDashboard'
import { FinanceDashboard } from './pages/FinanceDashboard'
import { KpiSettingsPage } from './pages/KpiSettingsPage'
import { UsersPage } from './pages/UsersPage'
import { RequestTypePage } from './pages/RequestTypePage'
import { DeviceDashboard } from './pages/DeviceDashboard'
import { InvoicesPage } from './pages/InvoicesPage'
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
            <Route path="/dashboard/sales/weekly-pulse" element={<WeeklyPulsePage />} />
            <Route path="/dashboard/sales/daily-report" element={<DailyReportPage />} />
            <Route path="/dashboard/sales/reconciliation" element={<ReconciliationPage />} />
            <Route path="/dashboard/sales/projects" element={<ProjectTrackingPage />} />
            <Route path="/dashboard/sales/projects/:code" element={<ProjectTimelinePage />} />
            <Route path="/dashboard/services" element={<ServicesDashboard />} />
            <Route path="/dashboard/finance"   element={<FinanceDashboard />} />
            <Route path="/dashboard/finance/weekly-pulse" element={<FinancePulsePage />} />
            <Route path="/dashboard/devices"  element={<DeviceDashboard />} />
            <Route path="/invoices"                element={<InvoicesPage />} />
            <Route path="/settings/kpi"            element={<KpiSettingsPage />} />
            <Route path="/users"                   element={<UsersPage />} />
            <Route path="/analytics/request-type"  element={<RequestTypePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
