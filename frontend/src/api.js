import axios from 'axios'

export const BASE_URL = 'http://localhost:8000'

const api = axios.create({ baseURL: BASE_URL })

const TOKEN_KEY = 'jeevakosha_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

api.interceptors.request.use(config => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      const url = err.config?.url ?? ''
      const isAuthRoute = url.includes('/auth/')
      clearToken()
      if (!isAuthRoute) {
        window.location.reload()
      }
    }
    return Promise.reject(err)
  },
)

export const authRegister = (name, email, password) =>
  api.post('/auth/register', { name, email, password }).then(r => r.data)

export const authLogin = (email, password) =>
  api.post('/auth/login', { email, password }).then(r => r.data)

export const authMe = () => api.get('/auth/me').then(r => r.data)

export const fetchHospitals = () => api.get('/hospitals/').then(r => r.data)

export const fetchDashboard = () => api.get('/dashboard/').then(r => r.data)

export const fetchProfile = () => api.get('/profile/').then(r => r.data)

export const updateProfile = (profile) => api.put('/profile/', profile).then(r => r.data)

export const fetchHospital = id => api.get(`/hospitals/${id}`).then(r => r.data)

export const createHospital = name => api.post('/hospitals/', { name }).then(r => r.data)

export const deleteHospital = id => api.delete(`/hospitals/${id}`).then(r => r.data)

export const fetchDocuments = (hospitalId, folder, skip = 0, limit = 50) =>
  api.get(`/hospitals/${hospitalId}/${folder}`, { params: { skip, limit } }).then(r => r.data)

export const fetchDocument = id => api.get(`/documents/${id}`).then(r => r.data)

export const uploadDocument = (hospitalId, folder, file, onProgress) => {
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

export const deleteDocument = id => api.delete(`/documents/${id}`).then(r => r.data)

export const fetchReportFolders = hospitalId =>
  api.get(`/hospitals/${hospitalId}/reports/folders`).then(r => r.data)

export const createReportFolder = (hospitalId, name) =>
  api.post(`/hospitals/${hospitalId}/reports/folders`, { name }).then(r => r.data)

export const deleteReportFolder = (hospitalId, rfId) =>
  api.delete(`/hospitals/${hospitalId}/reports/folders/${rfId}`).then(r => r.data)

export const fetchReportFolderDocuments = (hospitalId, rfId, skip = 0, limit = 50) =>
  api
    .get(`/hospitals/${hospitalId}/reports/folders/${rfId}/documents`, { params: { skip, limit } })
    .then(r => r.data)

export const uploadToReportFolder = (hospitalId, rfId, file, onProgress) => {
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

export async function* streamChat(message, history, signal) {
  const token = getToken()
  const res = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, history }),
    signal,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (payload === '[DONE]') return
      try {
        yield JSON.parse(payload)
      } catch {
        /* skip malformed */
      }
    }
  }
}

export const fetchOcrStatus = id => api.get(`/documents/${id}/ocr/status`).then(r => r.data)

export const fetchOcrResult = id => api.get(`/documents/${id}/ocr`).then(r => r.data)

export const retryOcr = id => api.post(`/documents/${id}/ocr/retry`).then(r => r.data)

export const previewUrl = id => `${BASE_URL}/documents/${id}/preview?token=${getToken() ?? ''}`

export default api
