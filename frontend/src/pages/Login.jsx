import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, KeyRound, Mail, ShieldCheck } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import ToastMessage from '../components/ToastMessage'
import api, { readApiError } from '../services/api'
import { API_ENDPOINTS } from '../services/apiEndpoints'

export default function Login(){
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleSubmit(e){
    e.preventDefault()
    setLoading(true)
    setError('')
    try{
      const res = await api.post(API_ENDPOINTS.auth.requestOtp, { email, password })
      localStorage.setItem('login_email', email)
      if (import.meta.env.DEV && res.data?.devOtp) {
        localStorage.setItem('dev_otp', res.data.devOtp)
      } else {
        localStorage.removeItem('dev_otp')
      }
      navigate('/verify', { state: { email } })
    }catch(err){
      console.error(err)
      setError(readApiError(err, 'Unable to send OTP'))
    }finally{ setLoading(false) }
  }

  return (
    <AuthLayout
      eyebrow="Admin approved login"
      title="Sign in to CRM"
      subtitle="Enter your registered work email and password. We will send a secure one-time code for this session."
    >
      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <label className="block">
          <span className="text-sm font-black text-slate-700">Work email</span>
          <div className="group mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 shadow-sm transition duration-300 focus-within:-translate-y-0.5 focus-within:border-emerald-500 focus-within:bg-white focus-within:shadow-lg focus-within:shadow-emerald-900/10 focus-within:ring-4 focus-within:ring-emerald-100">
            <Mail className="h-5 w-5 text-emerald-600 transition duration-300 group-focus-within:scale-110" />
            <input
              type="email"
              placeholder="name@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-slate-400"
            />
          </div>
        </label>
        <label className="block">
          <span className="text-sm font-black text-slate-700">Password</span>
          <div className="auth-password-field group mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm transition duration-300 focus-within:-translate-y-0.5 focus-within:border-emerald-500 focus-within:bg-white focus-within:shadow-lg focus-within:shadow-emerald-900/10 focus-within:ring-4 focus-within:ring-emerald-100">
            <span className="auth-input-icon">
              <KeyRound className="h-5 w-5 text-emerald-600 transition duration-300 group-focus-within:scale-110" />
            </span>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-w-0 flex-1 bg-transparent py-1.5 font-semibold outline-none placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className={`auth-eye-button ${showPassword ? 'auth-eye-button-active' : ''}`}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              <span />
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs font-extrabold text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Secure password is protected during OTP verification.
          </div>
          <div className="mt-3 text-right">
            <Link to="/forgot-password" className="text-sm font-black text-emerald-700 hover:text-emerald-900">Forgot password?</Link>
          </div>
        </label>
        {error && <ToastMessage type="error">{error}</ToastMessage>}
        <button className="btn-lift group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-700 via-teal-700 to-sky-700 px-5 py-4 font-black text-white shadow-xl shadow-emerald-900/20 transition disabled:cursor-not-allowed disabled:opacity-70" disabled={loading}>
          <span className="absolute inset-0 -translate-x-full bg-white/20 transition duration-700 group-hover:translate-x-full" />
          <span className="relative">{loading ? 'Sending OTP...' : 'Send OTP'}</span>
          <ArrowRight className="relative h-5 w-5 transition duration-300 group-hover:translate-x-1" />
        </button>
      </form>
    </AuthLayout>
  )
}
