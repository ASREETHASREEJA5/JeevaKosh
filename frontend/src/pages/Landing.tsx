import { Link } from 'react-router-dom'
import {
  Activity,
  FileText,
  FolderOpen,
  Search,
  Shield,
  Zap,
  ChevronRight,
  Building2,
} from 'lucide-react'

const features = [
  {
    icon: <Building2 className="w-6 h-6" />,
    title: 'Hospital Folders',
    desc: 'Organise records by hospital. Each facility gets dedicated Prescriptions and Reports folders automatically.',
  },
  {
    icon: <Zap className="w-6 h-6" />,
    title: 'Instant OCR Extraction',
    desc: 'Upload a scan and our AI extracts structured data from prescriptions and lab reports in seconds.',
  },
  {
    icon: <Search className="w-6 h-6" />,
    title: 'Smart Organisation',
    desc: 'Documents sorted by date with live OCR status. Find any record instantly across all hospitals.',
  },
  {
    icon: <Shield className="w-6 h-6" />,
    title: 'Secure Storage',
    desc: 'All files stored securely in MongoDB GridFS. Role-based access keeps patient data protected.',
  },
  {
    icon: <FileText className="w-6 h-6" />,
    title: 'Structured Data',
    desc: 'Extracted JSON covers medicines, dosages, frequencies, lab values, and radiology findings.',
  },
  {
    icon: <Activity className="w-6 h-6" />,
    title: 'Multi-format Support',
    desc: 'Accepts JPEG, PNG, WebP images and multi-page PDFs. Handles handwritten and printed documents.',
  },
]

const stats = [
  { value: '99%', label: 'Extraction Accuracy' },
  { value: '< 30s', label: 'OCR Processing Time' },
  { value: '20+', label: 'Report Types Supported' },
  { value: '∞', label: 'Documents Stored' },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-slate-900 text-lg tracking-tight">JeevaKosha</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 px-4 py-2 rounded-lg hover:bg-slate-100 transition"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 px-4 py-2 rounded-lg transition"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-24 px-6 bg-gradient-to-br from-brand-50 via-white to-teal-50">
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-flex items-center gap-1.5 bg-brand-100 text-brand-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <Activity className="w-3.5 h-3.5" />
            AI-Powered Medical Repository
          </span>
          <h1 className="text-5xl md:text-6xl font-extrabold text-slate-900 leading-tight mb-6">
            Your Complete{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-teal-500">
              Medical Document
            </span>{' '}
            Repository
          </h1>
          <p className="text-xl text-slate-500 mb-10 max-w-2xl mx-auto leading-relaxed">
            JeevaKosha centralises hospital records, prescriptions, and reports — and extracts
            structured clinical data from every uploaded document using AI OCR.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition shadow-lg shadow-brand-200"
            >
              Start for Free <ChevronRight className="w-4 h-4" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl border border-slate-200 transition"
            >
              <FolderOpen className="w-4 h-4" />
              View Demo
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="py-14 px-6 bg-slate-900">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map(s => (
            <div key={s.label}>
              <p className="text-4xl font-extrabold text-white mb-1">{s.value}</p>
              <p className="text-sm text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Everything you need to manage medical records
            </h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              From upload to structured data extraction — JeevaKosha handles the full lifecycle.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {features.map(f => (
              <div
                key={f.title}
                className="p-6 rounded-2xl border border-slate-100 hover:border-brand-200 hover:shadow-md transition group"
              >
                <div className="w-12 h-12 rounded-xl bg-brand-50 group-hover:bg-brand-100 text-brand-600 flex items-center justify-center mb-4 transition">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{f.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 px-6 bg-gradient-to-r from-brand-600 to-teal-500">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to digitise your medical records?
          </h2>
          <p className="text-brand-100 text-lg mb-8">
            Create a free account and start uploading hospital records in minutes.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-brand-700 font-bold rounded-xl hover:bg-brand-50 transition shadow-xl"
          >
            Create Free Account <ChevronRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-slate-900 py-10 px-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-md bg-brand-600 flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white">JeevaKosha</span>
        </div>
        <p className="text-slate-500 text-sm">
          © {new Date().getFullYear()} JeevaKosha — Medical Repository System
        </p>
      </footer>
    </div>
  )
}
