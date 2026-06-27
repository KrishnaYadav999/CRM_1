import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import api, { clearStoredSession, hasStoredAuthToken } from '../services/api'

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

    api.get('/auth/me')
      .then((response) => {
        if (response.data?.user) {
          localStorage.setItem('user', JSON.stringify(response.data.user))
        }
        setState({ loading: false, allowed: true })
      })
      .catch(() => {
        clearStoredSession()
        setState({ loading: false, allowed: false })
      })
  }, [])

  if (state.loading) {
    return <div className="min-h-screen bg-[#eef7f5]" />
  }

  return state.allowed ? children : <Navigate to="/" replace />
}
