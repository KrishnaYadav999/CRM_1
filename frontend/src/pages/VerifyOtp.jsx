import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import ToastMessage from '../components/ToastMessage'
import api, { readApiError } from '../services/api'

export default function VerifyOtp(){
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const email = location.state?.email || localStorage.getItem('login_email') || ''
  const devOtp = import.meta.env.DEV ? localStorage.getItem('dev_otp') : ''

  async function handleVerify(e){
    e.preventDefault()
    setLoading(true)
    setError('')
    try{
      if (!email) {
        setError('Session expired. Please login again.')
        return
      }
      const res = await api.post('/auth/verify-otp', { email, otp })
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      localStorage.removeItem('login_email')
      localStorage.removeItem('dev_otp')
      navigate('/dashboard')
    }catch(err){
      console.error(err)
      setError(readApiError(err, 'Invalid OTP'))
    }finally{ setLoading(false) }
  }

  return (
    <AuthLayout
      eyebrow="OTP verification"
      title="Enter secure OTP"
      subtitle={`Enter the 6-digit code sent to ${email || 'your email address'}.`}
    >
      <form onSubmit={handleVerify} className="mt-8 space-y-5">
        <label className="block">
          <span className="text-sm font-black text-slate-700">Login OTP</span>
          <div className="group mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 shadow-sm transition duration-300 focus-within:-translate-y-0.5 focus-within:border-emerald-500 focus-within:bg-white focus-within:shadow-lg focus-within:shadow-emerald-900/10 focus-within:ring-4 focus-within:ring-emerald-100">
            <ShieldCheck className="h-5 w-5 text-emerald-600 transition duration-300 group-focus-within:scale-110" />
            <input
              type="text"
              inputMode="numeric"
              maxLength="6"
              placeholder="000000"
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              className="min-w-0 flex-1 bg-transparent text-2xl font-black tracking-[0.35em] outline-none placeholder:text-slate-300"
            />
          </div>
        </label>
        {devOtp && <ToastMessage type="warning">Development OTP: {devOtp}</ToastMessage>}
        {error && <ToastMessage type="error">{error}</ToastMessage>}
        <button className="btn-lift relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-700 via-teal-700 to-sky-700 px-5 py-4 font-black text-white shadow-xl shadow-emerald-900/20 transition disabled:cursor-not-allowed disabled:opacity-70" disabled={loading || !email}>
          <span className="relative">{loading ? 'Verifying...' : 'Verify and login'}</span>
        </button>
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-teal-700 hover:text-teal-900">
          <ArrowLeft className="h-4 w-4" />
          Use a different email
        </Link>
      </form>
    </AuthLayout>
  )
}
