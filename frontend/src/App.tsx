import { Navigate, Route, Routes } from 'react-router-dom'
import { Activity } from 'lucide-react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Signup from './pages/Signup'
import DashboardLayout from './pages/dashboard/Layout'
import Overview from './pages/dashboard/Overview'
import Hospitals from './pages/dashboard/Hospitals'
import HospitalDetail from './pages/dashboard/HospitalDetail'
import ReportFolders from './pages/dashboard/ReportFolders'
import FolderView from './pages/dashboard/FolderView'

/** Full-screen spinner shown while verifying the stored JWT on first load. */
function AuthLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center">
        <Activity className="w-7 h-7 text-white animate-pulse" />
      </div>
      <p className="text-slate-400 text-sm">Loading JeevaKosha…</p>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <AuthLoader />
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <AuthLoader />
  return user ? <Navigate to="/dashboard" replace /> : <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login"  element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/signup" element={<GuestRoute><Signup /></GuestRoute>} />
      <Route
        path="/dashboard"
        element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}
      >
        <Route index element={<Overview />} />
        <Route path="hospitals" element={<Hospitals />} />
                  <Route path="hospitals/:hospitalId" element={<HospitalDetail />} />
                  <Route path="hospitals/:hospitalId/prescriptions" element={<FolderView />} />
                  <Route path="hospitals/:hospitalId/reports" element={<ReportFolders />} />
                  <Route path="hospitals/:hospitalId/reports/:reportFolderId" element={<FolderView />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
