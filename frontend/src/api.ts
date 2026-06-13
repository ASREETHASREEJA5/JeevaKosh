import axios from 'axios'

export const BASE_URL = 'http://localhost:8000'

const api = axios.create({ baseURL: BASE_URL })

// ── Token helpers ─────────────────────────────────────────────────────────────

const TOKEN_KEY = 'jeevakosha_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

// ── Axios interceptors ────────────────────────────────────────────────────────

// Attach Bearer token to every request
api.interceptors.request.use(config => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401: clear the token but do NOT redirect for auth/* endpoints.
// The AuthContext / ProtectedRoute handles the redirect through React Router.
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      const url: string = err.config?.url ?? ''
      const isAuthRoute = url.includes('/auth/')
      clearToken()
      if (!isAuthRoute) {
        // Redirect only for protected API calls (not token-verification calls)
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  },
)

// ── Types ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  name: string
  email: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  user: User
}

export interface Hospital {
  id: string
  name: string
  slug: string
  created_at: string
  total_prescriptions: number
  total_reports: number
}

export interface Document {
  id: string
  hospital_id: string
  hospital_name: string
  folder: 'prescriptions' | 'reports'
  original_filename: string
  stored_filename: string
  mime_type: string
  file_size: number
  upload_date: string
  ocr_status: 'pending' | 'processing' | 'completed' | 'failed'
  ocr_data?: Record<string, unknown> | null
  ocr_error?: string | null
  ocr_completed_at?: string | null
  report_folder_id?: string | null
  report_folder_name?: string | null
}

export interface ReportFolder {
  id: string
  hospital_id: string
  name: string
  slug: string
  created_at: string
  total_documents: number
}

export interface OcrStatus {
  document_id: string
  ocr_status: 'pending' | 'processing' | 'completed' | 'failed'
  ocr_error?: string | null
  ocr_completed_at?: string | null
}

// ── Auth API ──────────────────────────────────────────────────────────────────

export const authRegister = (
  name: string,
  email: string,
  password: string,
): Promise<TokenResponse> =>
  api.post('/auth/register', { name, email, password }).then(r => r.data)

export const authLogin = (
  email: string,
  password: string,
): Promise<TokenResponse> =>
  api.post('/auth/login', { email, password }).then(r => r.data)

export const authMe = (): Promise<User> =>
  api.get('/auth/me').then(r => r.data)

// ── Hospitals API ─────────────────────────────────────────────────────────────

export const fetchHospitals = (): Promise<Hospital[]> =>
  api.get('/hospitals/').then(r => r.data)

export const fetchHospital = (id: string): Promise<Hospital> =>
  api.get(`/hospitals/${id}`).then(r => r.data)

export const createHospital = (name: string): Promise<Hospital> =>
  api.post('/hospitals/', { name }).then(r => r.data)

export const deleteHospital = (id: string): Promise<void> =>
  api.delete(`/hospitals/${id}`).then(r => r.data)

// ── Documents API ─────────────────────────────────────────────────────────────

export const fetchDocuments = (
  hospitalId: string,
  folder: string,
  skip = 0,
  limit = 50,
): Promise<Document[]> =>
  api
    .get(`/hospitals/${hospitalId}/${folder}`, { params: { skip, limit } })
    .then(r => r.data)

export const fetchDocument = (id: string): Promise<Document> =>
  api.get(`/documents/${id}`).then(r => r.data)

export const uploadDocument = (
  hospitalId: string,
  folder: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<Document> => {
  const form = new FormData()
  form.append('file', file)
  return api
    .post(`/hospitals/${hospitalId}/${folder}/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
      },
    })
    .then(r => r.data)
}

export const deleteDocument = (id: string): Promise<void> =>
  api.delete(`/documents/${id}`).then(r => r.data)

// ── Report Folders API ────────────────────────────────────────────────────────

export const fetchReportFolders = (hospitalId: string): Promise<ReportFolder[]> =>
  api.get(`/hospitals/${hospitalId}/reports/folders`).then(r => r.data)

export const createReportFolder = (hospitalId: string, name: string): Promise<ReportFolder> =>
  api.post(`/hospitals/${hospitalId}/reports/folders`, { name }).then(r => r.data)

export const deleteReportFolder = (hospitalId: string, rfId: string): Promise<void> =>
  api.delete(`/hospitals/${hospitalId}/reports/folders/${rfId}`).then(r => r.data)

export const fetchReportFolderDocuments = (
  hospitalId: string,
  rfId: string,
  skip = 0,
  limit = 50,
): Promise<Document[]> =>
  api
    .get(`/hospitals/${hospitalId}/reports/folders/${rfId}/documents`, { params: { skip, limit } })
    .then(r => r.data)

export const uploadToReportFolder = (
  hospitalId: string,
  rfId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<Document> => {
  const form = new FormData()
  form.append('file', file)
  return api
    .post(`/hospitals/${hospitalId}/reports/folders/${rfId}/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
      },
    })
    .then(r => r.data)
}

// ── OCR API ───────────────────────────────────────────────────────────────────

export const fetchOcrStatus = (id: string): Promise<OcrStatus> =>
  api.get(`/documents/${id}/ocr/status`).then(r => r.data)

export const fetchOcrResult = (id: string): Promise<Record<string, unknown>> =>
  api.get(`/documents/${id}/ocr`).then(r => r.data)

export const retryOcr = (id: string): Promise<void> =>
  api.post(`/documents/${id}/ocr/retry`).then(r => r.data)

export const previewUrl = (id: string): string =>
  `${BASE_URL}/documents/${id}/preview?token=${getToken() ?? ''}`
