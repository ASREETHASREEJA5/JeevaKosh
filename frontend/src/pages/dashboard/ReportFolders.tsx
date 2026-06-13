import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, FolderPlus, Plus, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  createReportFolder,
  deleteReportFolder,
  fetchHospital,
  fetchReportFolders,
  type ReportFolder,
} from '../../api'
import { PageHeader } from './Layout'

// ── Folder color palette (cycles through for variety) ────────────────────────
const PALETTE = [
  { bg: 'bg-blue-50',   text: 'text-blue-600',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700' },
  { bg: 'bg-violet-50', text: 'text-violet-600',  border: 'border-violet-200', badge: 'bg-violet-100 text-violet-700' },
  { bg: 'bg-rose-50',   text: 'text-rose-600',    border: 'border-rose-200',   badge: 'bg-rose-100 text-rose-700' },
  { bg: 'bg-teal-50',   text: 'text-teal-600',    border: 'border-teal-200',   badge: 'bg-teal-100 text-teal-700' },
  { bg: 'bg-amber-50',  text: 'text-amber-600',   border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-700' },
  { bg: 'bg-emerald-50',text: 'text-emerald-600', border: 'border-emerald-200',badge: 'bg-emerald-100 text-emerald-700' },
]

// ── Create folder modal ───────────────────────────────────────────────────────

function CreateModal({ hospitalId, onClose }: { hospitalId: string; onClose: () => void }) {
  const [name, setName] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => createReportFolder(hospitalId, name.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reportFolders', hospitalId] })
      qc.invalidateQueries({ queryKey: ['hospital', hospitalId] })
      toast.success(`"${name.trim()}" folder created!`)
      onClose()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Failed to create folder.')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-slate-900">New Report Folder</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Name it after the test type — this becomes the OCR report category.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Folder name
        </label>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name.trim() && mutation.mutate()}
          placeholder="e.g. Blood Test, Diabetes"
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent mb-5"
        />

        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-5 text-xs text-amber-700">
          <strong>Supported folders:</strong> Blood Test (Hemoglobin, WBC, Platelet, RBC) and
          Diabetes (Fasting Glucose, Post fasting glucose). Other folder names will not be extracted.
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            disabled={!name.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {mutation.isPending
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <><Plus className="w-4 h-4" /> Create</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReportFolders() {
  const { hospitalId } = useParams<{ hospitalId: string }>()
  const [showModal, setShowModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ReportFolder | null>(null)
  const qc = useQueryClient()

  const { data: hospital } = useQuery({
    queryKey: ['hospital', hospitalId],
    queryFn: () => fetchHospital(hospitalId!),
    enabled: !!hospitalId,
  })

  const { data: folders = [], isPending } = useQuery({
    queryKey: ['reportFolders', hospitalId],
    queryFn: () => fetchReportFolders(hospitalId!),
    enabled: !!hospitalId,
  })

  const deleteMutation = useMutation({
    mutationFn: (rf: ReportFolder) => deleteReportFolder(hospitalId!, rf.id),
    onSuccess: (_, rf) => {
      qc.invalidateQueries({ queryKey: ['reportFolders', hospitalId] })
      qc.invalidateQueries({ queryKey: ['hospital', hospitalId] })
      toast.success(`"${rf.name}" deleted.`)
      setDeleteTarget(null)
    },
    onError: () => toast.error('Failed to delete folder.'),
  })

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Reports"
        subtitle={hospital?.name ?? ''}
        back={{ to: `/dashboard/hospitals/${hospitalId}`, label: hospital?.name ?? 'Hospital' }}
      >
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition"
        >
          <FolderPlus className="w-4 h-4" /> New Report Folder
        </button>
      </PageHeader>

      {/* Explainer */}
      <div className="bg-brand-50 border border-brand-100 rounded-2xl px-5 py-4 mb-6 flex items-start gap-3">
        <FileText className="w-5 h-5 text-brand-500 mt-0.5 shrink-0" />
        <p className="text-sm text-brand-800 leading-relaxed">
          Create a folder named <em>Blood Test</em> or <em>Diabetes</em>. OCR extracts only the
          graph-ready values for that type.
        </p>
      </div>

      {isPending ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 bg-white border border-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : folders.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-center">
          <div className="w-20 h-20 rounded-2xl bg-brand-50 flex items-center justify-center mb-5">
            <FolderPlus className="w-10 h-10 text-brand-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">No report folders yet</h3>
          <p className="text-slate-400 text-sm mb-6 max-w-xs">
            Create folders for each test type to keep reports organised and OCR accurate.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 transition"
          >
            <FolderPlus className="w-4 h-4" /> Create First Folder
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {folders.map((rf, idx) => {
            const c = PALETTE[idx % PALETTE.length]
            return (
              <div
                key={rf.id}
                className={`bg-white rounded-2xl border-2 ${c.border} hover:shadow-md transition group overflow-hidden`}
              >
                <Link
                  to={`/dashboard/hospitals/${hospitalId}/reports/${rf.id}`}
                  className="block p-6"
                >
                  <div className={`w-14 h-14 rounded-2xl ${c.bg} ${c.text} flex items-center justify-center mb-4 group-hover:scale-105 transition`}>
                    <FileText className="w-7 h-7" />
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-slate-900 leading-tight group-hover:text-brand-700 transition">
                      {rf.name}
                    </h3>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${c.badge}`}>
                      {rf.total_documents} file{rf.total_documents !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Created {new Date(rf.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </p>
                  <div className={`mt-4 text-sm font-semibold ${c.text} group-hover:translate-x-1 transition`}>
                    Open folder →
                  </div>
                </Link>
                <div className="px-5 py-3 border-t border-slate-50 flex justify-end">
                  <button
                    onClick={() => setDeleteTarget(rf)}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-500 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <CreateModal hospitalId={hospitalId!} onClose={() => setShowModal(false)} />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-slate-900 mb-2">Delete "{deleteTarget.name}"?</h3>
            <p className="text-sm text-slate-500 mb-5">
              This will permanently delete the folder and all{' '}
              <strong>{deleteTarget.total_documents}</strong> document
              {deleteTarget.total_documents !== 1 ? 's' : ''} inside it.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget)}
                disabled={deleteMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-semibold hover:bg-rose-600 disabled:opacity-50 transition"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
