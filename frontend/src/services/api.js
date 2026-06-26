import axios from 'axios'

const productionBaseURL = 'https://crm-1-eight.vercel.app/api'
const defaultBaseURL = import.meta.env.DEV ? 'http://localhost:5000/api' : productionBaseURL
const configuredBaseURL = import.meta.env.VITE_CRM_API_URL || import.meta.env.VITE_API_URL
const baseURL =
  configuredBaseURL?.includes('localhost:8081')
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
}

export function hasStoredAuthToken() {
  return getStoredToken().split('.').length === 3
}

export function readApiError(error, fallback = 'Something went wrong') {
  const data = error?.response?.data
  const message = data?.error || data?.message || error?.message

  if (typeof message === 'string') return message
  if (message && typeof message === 'object') return message.message || message.code || fallback
  return fallback
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
