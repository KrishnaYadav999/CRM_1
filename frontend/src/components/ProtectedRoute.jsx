import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import BrandLoader from './BrandLoader'
import api, { clearStoredSession, hasStoredAuthToken, storeSessionUser } from '../services/api'
import { API_ENDPOINTS } from '../services/apiEndpoints'

export default function ProtectedRoute({ children }) {
  const [state, setState] = useState(() => {
    if (!hasStoredAuthToken()) return { loading: true, allowed: false }
    try {
      return localStorage.getItem('user') ? { loading: false, allowed: true } : { loading: true, allowed: false }
    } catch {
      return { loading: true, allowed: false }
    }
  })

  useEffect(() => {
    if (!hasStoredAuthToken()) {
      clearStoredSession()
      setState({ loading: false, allowed: false })
      return
    }

    api.get(API_ENDPOINTS.auth.me)
      .then((response) => {
        if (response.data?.user) {
          storeSessionUser(response.data.user)
        }
        setState({ loading: false, allowed: true })
      })
      .catch(() => {
        clearStoredSession()
        setState({ loading: false, allowed: false })
      })
  }, [])

  if (state.loading) {
    return <BrandLoader message="Checking secure access" />
  }

  return state.allowed ? children : <Navigate to="/" replace />
}
