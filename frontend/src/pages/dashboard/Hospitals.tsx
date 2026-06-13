import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, FileText, Pill, Plus, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { createHospital, deleteHospital, fetchHospitals } from '../../api'
import { PageHeader } from './Layout'

function CreateModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => createHospital(name.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hospitals'] })
      toast.success('Hospital created!')
      onClose()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Failed to create hospital.')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-slate-900">Add Hospital</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block text-sm font-medium text-slate-700 mb-1.5">Hospital name</label>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name.trim() && mutation.mutate()}
          placeholder="e.g. Apollo Hospital Chennai"
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent mb-5"
        />

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
            {mutation.isPending ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <><Plus className="w-4 h-4" /> Create</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Hospitals() {
  const [showModal, setShowModal] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: hospitals = [], isPending } = useQuery({
    queryKey: ['hospitals'],
    queryFn: fetchHospitals,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteHospital(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hospitals'] })
      toast.success('Hospital deleted.')
      setDeleteId(null)
    },
    onError: () => toast.error('Failed to delete hospital.'),
  })

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Hospitals"
        subtitle="Manage your hospital folders and their medical records."
      >
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition"
        >
          <Plus className="w-4 h-4" /> Add Hospital
        </button>
      </PageHeader>

      {isPending ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 bg-white rounded-2xl border border-slate-100 animate-pulse" />
          ))}
        </div>
      ) : hospitals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-2xl bg-brand-50 flex items-center justify-center mb-5">
            <Building2 className="w-10 h-10 text-brand-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">No hospitals yet</h3>
          <p className="text-slate-400 text-sm mb-6 max-w-xs">
            Create a hospital folder to start organising prescriptions and reports.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 transition"
          >
            <Plus className="w-4 h-4" /> Create First Hospital
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {hospitals.map(h => (
            <div
              key={h.id}
              className="bg-white rounded-2xl border border-slate-100 hover:border-brand-200 hover:shadow-md transition group overflow-hidden"
            >
              <Link to={`/dashboard/hospitals/${h.id}`} className="block p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <span className="text-xs text-slate-300 group-hover:text-brand-400 transition font-medium">
                    {new Date(h.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </span>
                </div>
                <h3 className="font-bold text-slate-900 mb-1 group-hover:text-brand-700 transition leading-tight">
                  {h.name}
                </h3>
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Pill className="w-3.5 h-3.5 text-teal-500" />
                    {h.total_prescriptions} prescription{h.total_prescriptions !== 1 ? 's' : ''}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <FileText className="w-3.5 h-3.5 text-amber-500" />
                    {h.total_reports} report{h.total_reports !== 1 ? 's' : ''}
                  </div>
                </div>
              </Link>
              <div className="px-5 py-3 border-t border-slate-50 flex justify-end">
                <button
                  onClick={() => setDeleteId(h.id)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-500 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && <CreateModal onClose={() => setShowModal(false)} />}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setDeleteId(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-slate-900 mb-2">Delete hospital?</h3>
            <p className="text-sm text-slate-500 mb-5">
              This will permanently delete all documents and OCR data for this hospital.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
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
