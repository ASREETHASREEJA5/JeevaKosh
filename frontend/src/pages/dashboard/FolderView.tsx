import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  ImageIcon,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  deleteDocument,
  fetchDocuments,
  fetchHospital,
  fetchOcrResult,
  fetchOcrStatus,
  fetchReportFolderDocuments,
  fetchReportFolders,
  previewUrl,
  retryOcr,
  uploadDocument,
  uploadToReportFolder,
  type Document,
  type OcrStatus,
} from '../../api'
import { PageHeader } from './Layout'

// ── Status badge ──────────────────────────────────────────────────────────────

const statusConfig = {
  pending:    { label: 'Pending',    cls: 'bg-slate-100 text-slate-500',   icon: <Clock className="w-3 h-3" /> },
  processing: { label: 'Processing', cls: 'bg-amber-100 text-amber-600',   icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  completed:  { label: 'Completed',  cls: 'bg-emerald-100 text-emerald-600', icon: <CheckCircle2 className="w-3 h-3" /> },
  failed:     { label: 'Failed',     cls: 'bg-rose-100 text-rose-500',     icon: <AlertCircle className="w-3 h-3" /> },
}

function StatusBadge({ status }: { status: Document['ocr_status'] }) {
  const cfg = statusConfig[status] ?? statusConfig.pending
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

// ── File size formatter ───────────────────────────────────────────────────────

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── JSON Tree viewer ──────────────────────────────────────────────────────────

function JsonTree({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  if (data === null || data === undefined) {
    return <span className="text-slate-400 italic text-xs">null</span>
  }
  if (typeof data === 'boolean') {
    return <span className="text-purple-600 text-xs">{String(data)}</span>
  }
  if (typeof data === 'number') {
    return <span className="text-blue-600 text-xs">{data}</span>
  }
  if (typeof data === 'string') {
    return <span className="text-emerald-700 text-xs break-all">"{data}"</span>
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-slate-400 text-xs">[]</span>
    const key = `arr_${depth}`
    const open = !collapsed[key]
    return (
      <span>
        <button onClick={() => setCollapsed(c => ({ ...c, [key]: open }))} className="text-slate-400 hover:text-slate-700 mr-1">
          {open ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronRight className="w-3 h-3 inline" />}
        </button>
        <span className="text-slate-500 text-xs">[{data.length}]</span>
        {open && (
          <div className="ml-4 border-l border-slate-100 pl-3 mt-1 space-y-1">
            {data.map((item, i) => (
              <div key={i} className="flex gap-1 text-xs">
                <span className="text-slate-400 shrink-0">{i}:</span>
                <JsonTree data={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    )
  }
  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>).filter(([, v]) => v !== null)
    if (entries.length === 0) return <span className="text-slate-400 text-xs">{'{}'}</span>
    const key = `obj_${depth}`
    const open = !collapsed[key]
    return (
      <span>
        <button onClick={() => setCollapsed(c => ({ ...c, [key]: open }))} className="text-slate-400 hover:text-slate-700 mr-1">
          {open ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronRight className="w-3 h-3 inline" />}
        </button>
        <span className="text-slate-500 text-xs">{'{…}'}</span>
        {open && (
          <div className="ml-4 border-l border-slate-100 pl-3 mt-1 space-y-1">
            {entries.map(([k, v]) => (
              <div key={k} className="flex gap-1 flex-wrap text-xs">
                <span className="text-slate-600 font-medium shrink-0">{k}:</span>
                <JsonTree data={v} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    )
  }
  return <span className="text-xs">{String(data)}</span>
}

// ── Upload zone ───────────────────────────────────────────────────────────────

function UploadZone({
  uploadFn,
  invalidateKeys,
  onUploaded,
}: {
  uploadFn: (file: File, onProgress: (pct: number) => void) => Promise<Document>
  invalidateKeys: string[][]
  onUploaded: (doc: Document) => void
}) {
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: (file: File) => uploadFn(file, pct => setProgress(pct)),
    onSuccess: doc => {
      invalidateKeys.forEach(key => qc.invalidateQueries({ queryKey: key }))
      toast.success(`"${doc.stored_filename}" uploaded — OCR starting…`)
      setProgress(null)
      onUploaded(doc)
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Upload failed.')
      setProgress(null)
    },
  })

  function handleFile(file: File) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(file.type)) {
      return toast.error('Only JPEG, PNG, WebP, or PDF files are allowed.')
    }
    if (file.size > 20 * 1024 * 1024) {
      return toast.error('File must be smaller than 20 MB.')
    }
    mutation.mutate(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [])

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !mutation.isPending && inputRef.current?.click()}
      className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition mb-6 ${
        dragging
          ? 'border-brand-400 bg-brand-50'
          : mutation.isPending
          ? 'border-slate-200 bg-slate-50 cursor-not-allowed'
          : 'border-slate-200 hover:border-brand-300 hover:bg-brand-50/40'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.pdf"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />

      {mutation.isPending ? (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          <p className="text-sm font-medium text-slate-700">
            Uploading… {progress !== null ? `${progress}%` : ''}
          </p>
          {progress !== null && (
            <div className="w-48 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-500 flex items-center justify-center">
            <Upload className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">
              Drag & drop a file, or <span className="text-brand-600">click to browse</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">JPEG · PNG · WebP · PDF &nbsp;|&nbsp; max 20 MB</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Document detail slide-over ────────────────────────────────────────────────

function DocumentDrawer({
  doc,
  onClose,
  onDeleted,
}: {
  doc: Document
  onClose: () => void
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const [liveStatus, setLiveStatus] = useState(doc.ocr_status)
  const [ocrData, setOcrData] = useState<Record<string, unknown> | null>(
    doc.ocr_data as Record<string, unknown> | null,
  )
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch OCR result once completed
  async function loadOcrResult() {
    try {
      const result = await fetchOcrResult(doc.id)
      setOcrData(result.ocr_data as Record<string, unknown>)
      setLiveStatus('completed')
    } catch { /* ignore */ }
  }

  // Poll status while pending/processing
  useEffect(() => {
    if (liveStatus === 'completed' || liveStatus === 'failed') {
      if (liveStatus === 'completed' && !ocrData) loadOcrResult()
      return
    }

    pollingRef.current = setInterval(async () => {
      try {
        const s: OcrStatus = await fetchOcrStatus(doc.id)
        setLiveStatus(s.ocr_status)
        if (s.ocr_status === 'completed') {
          clearInterval(pollingRef.current!)
          qc.invalidateQueries({ queryKey: ['documents', doc.hospital_id, doc.folder] })
          loadOcrResult()
        } else if (s.ocr_status === 'failed') {
          clearInterval(pollingRef.current!)
          qc.invalidateQueries({ queryKey: ['documents', doc.hospital_id, doc.folder] })
        }
      } catch { /* ignore */ }
    }, 3000)

    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [doc.id, liveStatus])

  const deleteMutation = useMutation({
    mutationFn: () => deleteDocument(doc.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', doc.hospital_id, doc.folder] })
      qc.invalidateQueries({ queryKey: ['hospital', doc.hospital_id] })
      qc.invalidateQueries({ queryKey: ['hospitals'] })
      toast.success('Document deleted.')
      onDeleted()
    },
    onError: () => toast.error('Failed to delete document.'),
  })

  const retryMutation = useMutation({
    mutationFn: () => retryOcr(doc.id),
    onSuccess: () => {
      setLiveStatus('pending')
      toast.success('OCR re-queued.')
    },
    onError: () => toast.error('Failed to retry OCR.'),
  })

  const isImage = doc.mime_type.startsWith('image/')
  const isPdf = doc.mime_type === 'application/pdf'
  const fileUrl = previewUrl(doc.id)

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative ml-auto w-full max-w-xl bg-white h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate text-sm">{doc.stored_filename}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {fmtSize(doc.file_size)} ·{' '}
              {new Date(doc.upload_date).toLocaleString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
              title="Open in new tab"
            >
              <ZoomIn className="w-4 h-4" />
            </a>
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {/* Preview */}
          <div className="border-b border-slate-100">
            {isImage && (
              <div className="flex items-center justify-center bg-slate-50 p-4" style={{ minHeight: 240 }}>
                <img
                  src={fileUrl}
                  alt={doc.stored_filename}
                  className="max-h-72 object-contain rounded-lg shadow"
                />
              </div>
            )}
            {isPdf && (
              <div className="bg-slate-50" style={{ height: 300 }}>
                <iframe
                  src={fileUrl}
                  className="w-full h-full border-0 rounded-none"
                  title={doc.stored_filename}
                />
              </div>
            )}
            {!isImage && !isPdf && (
              <div className="flex items-center justify-center bg-slate-50 py-10">
                <FileText className="w-12 h-12 text-slate-300" />
              </div>
            )}
          </div>

          {/* OCR section */}
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                OCR Extraction
                <StatusBadge status={liveStatus} />
              </h4>
              {liveStatus === 'failed' && (
                <button
                  onClick={() => retryMutation.mutate()}
                  disabled={retryMutation.isPending}
                  className="flex items-center gap-1.5 text-xs text-brand-600 font-semibold hover:underline"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${retryMutation.isPending ? 'animate-spin' : ''}`} />
                  Retry OCR
                </button>
              )}
            </div>

            {(liveStatus === 'pending' || liveStatus === 'processing') && (
              <div className="flex flex-col items-center py-10 gap-3 text-center">
                <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
                <p className="text-sm text-slate-500">
                  {liveStatus === 'pending' ? 'Queued for extraction…' : 'Extracting content…'}
                </p>
                <p className="text-xs text-slate-400">This may take 15–60 seconds.</p>
              </div>
            )}

            {liveStatus === 'failed' && (
              <div className="bg-rose-50 text-rose-700 rounded-xl p-4 text-sm">
                <p className="font-semibold mb-1 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" /> Extraction failed
                </p>
                <p className="text-xs opacity-80">{doc.ocr_error ?? 'Unknown error.'}</p>
              </div>
            )}

            {liveStatus === 'completed' && ocrData && (
              <div className="bg-slate-50 rounded-xl p-4 text-xs leading-relaxed overflow-x-auto">
                <JsonTree data={ocrData} />
              </div>
            )}

            {liveStatus === 'completed' && !ocrData && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main FolderView page ──────────────────────────────────────────────────────

export default function FolderView() {
  // reportFolderId is only present for report sub-folder routes
  const { hospitalId, reportFolderId } = useParams<{
    hospitalId: string
    reportFolderId?: string
  }>()
  const isPrescriptions = !reportFolderId
  const [selected, setSelected] = useState<Document | null>(null)

  const { data: hospital } = useQuery({
    queryKey: ['hospital', hospitalId],
    queryFn: () => fetchHospital(hospitalId!),
    enabled: !!hospitalId,
  })

  // Fetch the report sub-folder name when in report mode
  const { data: reportFolders = [] } = useQuery({
    queryKey: ['reportFolders', hospitalId],
    queryFn: () => fetchReportFolders(hospitalId!),
    enabled: !!hospitalId && !isPrescriptions,
  })
  const currentRf = reportFolders.find(rf => rf.id === reportFolderId)

  // Documents query — different API depending on context
  const { data: docs = [], isPending } = useQuery({
    queryKey: isPrescriptions
      ? ['documents', hospitalId, 'prescriptions']
      : ['rfDocs', hospitalId, reportFolderId],
    queryFn: isPrescriptions
      ? () => fetchDocuments(hospitalId!, 'prescriptions')
      : () => fetchReportFolderDocuments(hospitalId!, reportFolderId!),
    enabled: !!hospitalId && (isPrescriptions ? true : !!reportFolderId),
    refetchInterval: (query) => {
      const data = query.state.data as Document[] | undefined
      const hasActive = data?.some(
        d => d.ocr_status === 'pending' || d.ocr_status === 'processing',
      )
      return hasActive ? 5000 : false
    },
  })

  // Build upload function + cache invalidation keys based on context
  const uploadFn = isPrescriptions
    ? (file: File, onProgress: (p: number) => void) =>
        uploadDocument(hospitalId!, 'prescriptions', file, onProgress)
    : (file: File, onProgress: (p: number) => void) =>
        uploadToReportFolder(hospitalId!, reportFolderId!, file, onProgress)

  const invalidateKeys: string[][] = isPrescriptions
    ? [
        ['documents', hospitalId!, 'prescriptions'],
        ['hospital', hospitalId!],
        ['hospitals'],
      ]
    : [
        ['rfDocs', hospitalId!, reportFolderId!],
        ['reportFolders', hospitalId!],
        ['hospital', hospitalId!],
        ['hospitals'],
      ]

  const pageTitle = isPrescriptions
    ? 'Prescriptions'
    : currentRf?.name ?? 'Report Folder'

  const backLink = isPrescriptions
    ? { to: `/dashboard/hospitals/${hospitalId}`, label: hospital?.name ?? 'Hospital' }
    : { to: `/dashboard/hospitals/${hospitalId}/reports`, label: 'Reports' }

  const folderIcon = isPrescriptions
    ? <span className="text-teal-600">💊</span>
    : <span className="text-amber-500">📋</span>

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={pageTitle}
        subtitle={hospital?.name ?? ''}
        back={backLink}
      >
        <div className="flex items-center gap-2 text-sm text-slate-500 bg-white border border-slate-100 rounded-xl px-4 py-2">
          {folderIcon}
          {docs.length} file{docs.length !== 1 ? 's' : ''}
        </div>
      </PageHeader>

      {/* Show subfolder context tag for reports */}
      {!isPrescriptions && currentRf && (
        <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2 mb-5 text-sm text-amber-700">
          <span className="font-semibold">Report type:</span>
          <span>{currentRf.name}</span>
          <span className="text-amber-400 text-xs">· set automatically on all uploads</span>
        </div>
      )}

      <UploadZone
        uploadFn={uploadFn}
        invalidateKeys={invalidateKeys}
        onUploaded={doc => setSelected(doc)}
      />

      {isPending ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-white border border-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            {isPrescriptions
              ? <ImageIcon className="w-8 h-8 text-slate-400" />
              : <FileText className="w-8 h-8 text-slate-400" />}
          </div>
          <p className="font-medium text-slate-700">No files yet</p>
          <p className="text-sm text-slate-400 mt-1">Upload a file above to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_auto] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>File</span>
            <span>Uploaded</span>
            <span>Size</span>
            <span>OCR Status</span>
          </div>
          <div className="divide-y divide-slate-50">
            {docs.map(doc => (
              <button
                key={doc.id}
                onClick={() => setSelected(doc)}
                className="w-full text-left grid grid-cols-[1fr_auto] sm:grid-cols-[2fr_1fr_1fr_auto] gap-4 items-center px-5 py-4 hover:bg-slate-50 transition group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-slate-400">
                    {doc.mime_type === 'application/pdf'
                      ? <FileText className="w-4 h-4" />
                      : <ImageIcon className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 group-hover:text-brand-600 transition truncate">
                      {doc.stored_filename}
                    </p>
                    {doc.original_filename !== doc.stored_filename && (
                      <p className="text-xs text-slate-400 truncate">
                        Original: {doc.original_filename}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-xs text-slate-400 hidden sm:block">
                  {new Date(doc.upload_date).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </span>
                <span className="text-xs text-slate-400 hidden sm:block">{fmtSize(doc.file_size)}</span>
                <StatusBadge status={doc.ocr_status} />
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <DocumentDrawer
          doc={selected}
          onClose={() => setSelected(null)}
          onDeleted={() => setSelected(null)}
        />
      )}
    </div>
  )
}
