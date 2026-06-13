import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { Building2, FileText, Pill } from 'lucide-react'
import { fetchHospital } from '../../api'
import { PageHeader } from './Layout'

const folders = [
  {
    key: 'prescriptions',
    label: 'Prescriptions',
    description: 'Upload prescription images or PDFs. AI extracts medicine names, dosages, and instructions.',
    icon: <Pill className="w-8 h-8" />,
    color: 'teal',
    bg: 'bg-teal-50',
    text: 'text-teal-600',
    border: 'border-teal-100 hover:border-teal-300',
    badge: 'bg-teal-100 text-teal-700',
  },
  {
    key: 'reports',
    label: 'Reports',
    description: 'Create folders by test type (Blood Test, Kidney Function, etc.) and upload reports. The folder name sets the OCR report type automatically.',
    icon: <FileText className="w-8 h-8" />,
    color: 'amber',
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    border: 'border-amber-100 hover:border-amber-300',
    badge: 'bg-amber-100 text-amber-700',
  },
]

export default function HospitalDetail() {
  const { hospitalId } = useParams<{ hospitalId: string }>()

  const { data: hospital, isPending, error } = useQuery({
    queryKey: ['hospital', hospitalId],
    queryFn: () => fetchHospital(hospitalId!),
    enabled: !!hospitalId,
  })

  if (isPending) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="h-8 w-48 bg-slate-100 rounded-lg animate-pulse mb-8" />
        <div className="grid md:grid-cols-2 gap-6">
          {[1, 2].map(i => <div key={i} className="h-48 bg-white border border-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (error || !hospital) {
    return (
      <div className="p-6 lg:p-8 text-center">
        <p className="text-slate-500">Hospital not found.</p>
      </div>
    )
  }

  const counts: Record<string, number> = {
    prescriptions: hospital.total_prescriptions,
    reports: hospital.total_reports,
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader
        title={hospital.name}
        subtitle={`Created ${new Date(hospital.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`}
        back={{ to: '/dashboard/hospitals', label: 'All Hospitals' }}
      >
        <div className="flex items-center gap-2 text-sm text-slate-500 bg-white border border-slate-100 rounded-xl px-4 py-2">
          <Building2 className="w-4 h-4 text-brand-400" />
          {hospital.total_prescriptions + hospital.total_reports} total document
          {hospital.total_prescriptions + hospital.total_reports !== 1 ? 's' : ''}
        </div>
      </PageHeader>

      <p className="text-sm text-slate-400 mb-6 font-medium uppercase tracking-widest">
        Select a folder
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        {folders.map(f => (
          <Link
            key={f.key}
            to={`/dashboard/hospitals/${hospitalId}/${f.key}`}
            className={`group bg-white rounded-2xl border-2 ${f.border} transition p-7 flex flex-col`}
          >
            <div className={`w-16 h-16 rounded-2xl ${f.bg} ${f.text} flex items-center justify-center mb-5 group-hover:scale-105 transition`}>
              {f.icon}
            </div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xl font-bold text-slate-900">{f.label}</h3>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${f.badge}`}>
                {counts[f.key]} file{counts[f.key] !== 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed flex-1">{f.description}</p>
            <div className={`mt-5 text-sm font-semibold ${f.text} group-hover:translate-x-1 transition`}>
              Open folder →
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
