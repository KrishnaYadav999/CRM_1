import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import BrandLoader from './BrandLoader'
import api, { clearStoredSession, hasStoredAuthToken, storeSessionUser } from '../services/api'
import { API_ENDPOINTS } from '../services/apiEndpoints'

export default function ProtectedRoute({ children, allowedRoles }) {
  const roleAllowed = (user) => !allowedRoles?.length || allowedRoles.includes(String(user?.role || '').trim().toLowerCase())
  const [state, setState] = useState(() => {
    if (!hasStoredAuthToken()) return { loading: true, allowed: false }
    try {
      const storedUser = JSON.parse(localStorage.getItem('user') || 'null')
      return storedUser ? { loading: false, allowed: roleAllowed(storedUser), authenticated: true } : { loading: true, allowed: false }
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
        setState({ loading: false, allowed: roleAllowed(response.data?.user), authenticated: true })
      })
      .catch(() => {
        clearStoredSession()
        setState({ loading: false, allowed: false })
      })
  }, [])

  if (state.loading) {
    return <BrandLoader message="Checking secure access" />
  }

  if (state.allowed) return children
  return <Navigate to={state.authenticated ? '/dashboard' : '/'} replace />
}
