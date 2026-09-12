import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import BrandLoader from './BrandLoader'
import api, { clearStoredSession, hasStoredAuthToken, storeSessionUser } from '../services/api'
import { API_ENDPOINTS } from '../services/apiEndpoints'
import { hasAnyRole } from '../constants/dashboard'

export default function ProtectedRoute({ children, allowedRoles }) {
  const roleAllowed = (user) => !allowedRoles?.length || hasAnyRole(user, allowedRoles)
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
      .catch((error) => {
        const status = error?.response?.status
        if (status === 401 || status === 403) {
          clearStoredSession()
          setState({ loading: false, allowed: false })
          return
        }
        // Preserve a valid cached session during temporary 429/5xx outages.
        // The API interceptor will still clear genuinely invalid tokens.
        try {
          const storedUser = JSON.parse(localStorage.getItem('user') || 'null')
          setState({ loading: false, allowed: Boolean(storedUser) && roleAllowed(storedUser), authenticated: Boolean(storedUser) })
        } catch {
          setState({ loading: false, allowed: false })
        }
      })
  }, [])

  if (state.loading) {
    return <BrandLoader message="Checking secure access" />
  }

  if (state.allowed) return children
  return <Navigate to={state.authenticated ? '/dashboard' : '/login'} replace />
}
