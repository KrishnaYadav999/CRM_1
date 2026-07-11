import axios from 'axios'
import { API_ENDPOINTS } from './apiEndpoints'

const productionBaseURL = '/api'
const defaultBaseURL = productionBaseURL
const configuredBaseURL = import.meta.env.VITE_CRM_API_URL || import.meta.env.VITE_API_URL
const baseURL =
  configuredBaseURL?.includes('localhost:8081') || configuredBaseURL?.includes('crm-1-eight.vercel.app')
    ? defaultBaseURL
    : configuredBaseURL || defaultBaseURL

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json'
  }
})

export function getStoredToken() {
  const token = localStorage.getItem('token')
  if (!token || token === 'undefined' || token === 'null') return ''
  return token
}

export function clearStoredSession() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  localStorage.removeItem('login_email')
  localStorage.removeItem('dev_otp')
  try {
    sessionStorage.removeItem('crm.brandLoader.fullShown')
  } catch {
    // session cleanup only
  }
}

export function hasStoredAuthToken() {
  return getStoredToken().split('.').length === 3
}

function sanitizeSessionValue(value, depth = 0) {
  if (depth > 5) return undefined
  if (typeof value === 'string') {
    if (value.startsWith('blob:')) return ''
    if (value.startsWith('data:') && value.length > 50000) return ''
    return value.length > 100000 ? '' : value
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeSessionValue(item, depth + 1)).filter((item) => item !== undefined)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeSessionValue(item, depth + 1)]).filter(([, item]) => item !== undefined))
}

export function storeSessionUser(user) {
  const sanitized = sanitizeSessionValue(user || {})
  localStorage.removeItem('user')
  try {
    localStorage.setItem('user', JSON.stringify(sanitized))
    return sanitized
  } catch {
    const minimal = {
      _id: sanitized?._id || sanitized?.id || '', id: sanitized?.id || sanitized?._id || '',
      name: sanitized?.name || '', firstName: sanitized?.firstName || '', lastName: sanitized?.lastName || '',
      email: sanitized?.email || '', role: sanitized?.role || '', team: sanitized?.team || '',
      teamId: sanitized?.teamId || '', isActive: sanitized?.isActive !== false
    }
    localStorage.setItem('user', JSON.stringify(minimal))
    return minimal
  }
}

export function readApiError(error, fallback = 'Something went wrong') {
  const data = error?.response?.data
  const message = data?.error || data?.message || error?.message

  if (typeof message === 'string') return message
  if (message && typeof message === 'object') return message.message || message.code || fallback
  return fallback
}

export function apiGet(endpoint, config) {
  return api.get(endpoint, config)
}

export function apiPost(endpoint, data, config) {
  return api.post(endpoint, data, config)
}

export function apiPut(endpoint, data, config) {
  return api.put(endpoint, data, config)
}

export function apiPatch(endpoint, data, config) {
  return api.patch(endpoint, data, config)
}

export function apiDelete(endpoint, config) {
  return api.delete(endpoint, config)
}

api.interceptors.request.use((config) => {
  const token = getStoredToken()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearStoredSession()
    }
    return Promise.reject(error)
  }
)

export default api
export { API_ENDPOINTS }
