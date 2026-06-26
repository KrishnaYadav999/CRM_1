import axios from 'axios'

const defaultBaseURL = import.meta.env.DEV ? 'http://localhost:5000/api' : '/api'
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

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

export default api
