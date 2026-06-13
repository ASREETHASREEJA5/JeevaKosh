import { useQuery } from '@tanstack/react-query'
import { Activity, Building2, CheckCircle, FileText, Pill } from 'lucide-react'
import { fetchHospitals } from '../../api'
import { PageHeader, StatCard } from './Layout'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function Overview() {
  const { user } = useAuth()
  const { data: hospitals = [], isPending } = useQuery({
    queryKey: ['hospitals'],
    queryFn: fetchHospitals,
  })

  const totalPrescriptions = hospitals.reduce((s, h) => s + h.total_prescriptions, 0)
  const totalReports = hospitals.reduce((s, h) => s + h.total_reports, 0)

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={`Good ${getGreeting()}, ${user?.name?.split(' ')[0] ?? 'Doctor'} 👋`}
        subtitle="Here's an overview of your medical repository."
      />

      {/* Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        <StatCard
          label="Hospitals"
          value={isPending ? '—' : hospitals.length}
          icon={<Building2 className="w-6 h-6" />}
          color="brand"
        />
        <StatCard
          label="Prescriptions"
          value={isPending ? '—' : totalPrescriptions}
          icon={<Pill className="w-6 h-6" />}
          color="teal"
        />
        <StatCard
          label="Reports"
          value={isPending ? '—' : totalReports}
          icon={<FileText className="w-6 h-6" />}
          color="amber"
        />
        <StatCard
          label="Total Documents"
          value={isPending ? '—' : totalPrescriptions + totalReports}
          icon={<CheckCircle className="w-6 h-6" />}
          color="emerald"
        />
      </div>

      {/* Recent hospitals */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" />
            Recent Hospitals
          </h2>
          <Link
            to="/dashboard/hospitals"
            className="text-xs text-brand-600 font-semibold hover:underline"
          >
            View all →
          </Link>
        </div>

        {isPending ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : hospitals.length === 0 ? (
          <div className="py-16 flex flex-col items-center text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <Building2 className="w-8 h-8 text-slate-400" />
            </div>
            <p className="font-medium text-slate-700 mb-1">No hospitals yet</p>
            <p className="text-sm text-slate-400 mb-5">
              Create your first hospital folder to start uploading records.
            </p>
            <Link
              to="/dashboard/hospitals"
              className="px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition"
            >
              Add Hospital
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {hospitals.slice(0, 5).map(h => (
              <Link
                key={h.id}
                to={`/dashboard/hospitals/${h.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 group-hover:text-brand-600 transition">
                      {h.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {h.total_prescriptions} prescription{h.total_prescriptions !== 1 ? 's' : ''} ·{' '}
                      {h.total_reports} report{h.total_reports !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-slate-300 group-hover:text-brand-400 transition">→</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick start banner (shown when empty) */}
      {!isPending && hospitals.length === 0 && (
        <div className="mt-6 bg-gradient-to-r from-brand-600 to-teal-500 rounded-2xl p-6 text-white flex items-center gap-5">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="font-bold text-lg mb-0.5">Quick Start Guide</p>
            <p className="text-brand-100 text-sm">
              1. Create a hospital → 2. Open Prescriptions or Reports folder → 3. Upload a file → OCR runs automatically.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
