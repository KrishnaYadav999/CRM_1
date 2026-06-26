import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import BrandLoader from './BrandLoader'
import api from '../services/api'

export default function ProtectedRoute({ children }) {
  const [state, setState] = useState({ loading: true, allowed: false })

  useEffect(() => {
    api.get('/auth/me')
      .then((response) => {
        if (response.data?.user) {
          localStorage.setItem('user', JSON.stringify(response.data.user))
        }
        setState({ loading: false, allowed: true })
      })
      .catch(() => {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        setState({ loading: false, allowed: false })
      })
  }, [])

  if (state.loading) {
    return <BrandLoader message="Checking secure access" />
  }

  return state.allowed ? children : <Navigate to="/" replace />
}
