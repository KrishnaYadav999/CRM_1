import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import BrandLoader from './BrandLoader'
import api, { clearStoredSession, hasStoredAuthToken } from '../services/api'

export default function ProtectedRoute({ children }) {
  const [state, setState] = useState({ loading: true, allowed: false })

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
    return <BrandLoader message="Checking secure access" />
  }

  return state.allowed ? children : <Navigate to="/" replace />
}
