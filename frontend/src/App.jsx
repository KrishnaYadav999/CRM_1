import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import ScrollToTop from './components/ScrollToTop'
import Login from './pages/Login'
import VerifyOtp from './pages/VerifyOtp'
import ForgotPassword from './pages/ForgotPassword'
import AdminDashboard from './pages/AdminDashboard'
import LeadGeneration from './pages/LeadGeneration'
import ClientMaster from './pages/ClientMaster'
import ClientMasterAllocate from './pages/ClientMasterAllocate'
import LeadAllocate from './pages/LeadAllocate'
import HealthReportCheck from './pages/HealthReportCheck'
import Quotations from './pages/Quotations'
import AnnualReturns from './pages/AnnualReturns'
import CalendarTodo from './pages/CalendarTodo'
import Notifications from './pages/Notifications'
import PendingApproval from './pages/PendingApproval'
import ClientComplianceReview from './pages/ClientComplianceReview'
import NotFound from './pages/NotFound'
import AssistantPage from './pages/AssistantPage'
import ProformaInvoices from './pages/ProformaInvoices'
import ComplianceHealthDashboard from './pages/ComplianceHealthDashboard'
import PendingLeads from './pages/PendingLeads'
import HelpYourself from './pages/HelpYourself'
import SupportTickets from './pages/SupportTickets'
import InternalTickets from './pages/InternalTickets'
import SuperAdminDashboard from './pages/SuperAdminDashboard'
import ActivityLogs from './pages/ActivityLogs'
import api, { API_ENDPOINTS, hasStoredAuthToken } from './services/api'
import SupportTicketMilestoneCelebration from './components/SupportTicketMilestoneCelebration'

function ActiveCrmTracker() {
  useEffect(() => {
    let timer
    let idleTimer
    let loggingOut = false
    const IDLE_LOGOUT_MS = 30 * 60 * 1000
    const isActive = () => hasStoredAuthToken() && document.visibilityState === 'visible' && document.hasFocus()
    const heartbeat = (state = 'active') => api.post(API_ENDPOINTS.auth.activityHeartbeat, { state }).catch(() => {})
    const refresh = () => {
      clearInterval(timer)
      if (isActive()) { heartbeat('active'); resetIdleTimer(); timer = setInterval(() => heartbeat('active'), 15000) }
      else if (hasStoredAuthToken()) heartbeat('away')
    }
    const clearLocalSession = () => {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('login_email')
      localStorage.removeItem('dev_otp')
    }
    const logoutForInactivity = async () => {
      if (loggingOut || !hasStoredAuthToken()) return
      loggingOut = true
      clearInterval(timer)
      try { await api.post(API_ENDPOINTS.auth.logout, { reason: 'inactivity' }) } catch {}
      clearLocalSession()
      window.location.replace('/')
    }
    const resetIdleTimer = () => {
      if (!hasStoredAuthToken() || loggingOut) return
      clearTimeout(idleTimer)
      idleTimer = window.setTimeout(logoutForInactivity, IDLE_LOGOUT_MS)
    }
    const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'scroll']
    activityEvents.forEach((eventName) => window.addEventListener(eventName, resetIdleTimer, { passive: true }))
    window.addEventListener('focus', refresh)
    window.addEventListener('blur', refresh)
    document.addEventListener('visibilitychange', refresh)
    refresh()
    resetIdleTimer()
    return () => { clearInterval(timer); clearTimeout(idleTimer); activityEvents.forEach((eventName) => window.removeEventListener(eventName, resetIdleTimer)); window.removeEventListener('focus', refresh); window.removeEventListener('blur', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  return null
}

function App(){
  return (
    <div className="min-h-screen bg-emerald-50">
      <ScrollToTop />
      <ActiveCrmTracker />
      <SupportTicketMilestoneCelebration />
      <Routes>
        <Route path="/" element={<Login/>} />
        <Route path="/verify" element={<VerifyOtp/>} />
        <Route path="/forgot-password" element={<ForgotPassword/>} />
        <Route path="/forget-password" element={<Navigate to="/forgot-password" replace />} />
        <Route path="/forgotpassword" element={<Navigate to="/forgot-password" replace />} />
        <Route path="/dashboard" element={<ProtectedRoute><AdminDashboard/></ProtectedRoute>} />
        <Route path="/dashboard/users" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><AdminDashboard/></ProtectedRoute>} />
        <Route path="/superadmin-dashboard" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><SuperAdminDashboard/></ProtectedRoute>} />
        <Route path="/mis" element={<ProtectedRoute allowedRoles={['admin', 'superadmin', 'manager', 'operation head', 'operations head']}><SuperAdminDashboard misPage /></ProtectedRoute>} />
        <Route path="/dashboard/activity-logs" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><ActivityLogs/></ProtectedRoute>} />
        <Route path="/pending-approval" element={<ProtectedRoute allowedRoles={['admin', 'superadmin', 'compliance']}><PendingApproval/></ProtectedRoute>} />
        <Route path="/pending-approval/clients/:clientId/review" element={<ProtectedRoute allowedRoles={['admin', 'superadmin', 'compliance']}><ClientComplianceReview/></ProtectedRoute>} />
        <Route path="/pending-leads" element={<Navigate to="/pending-leads/open" replace />} />
        <Route path="/pending-leads/open" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><PendingLeads mode="open"/></ProtectedRoute>} />
        <Route path="/pending-leads/closed" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><PendingLeads mode="closed"/></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications/></ProtectedRoute>} />
        <Route path="/announcements" element={<ProtectedRoute><Notifications mode="announcements"/></ProtectedRoute>} />
        <Route path="/calendar" element={<ProtectedRoute><CalendarTodo/></ProtectedRoute>} />
        <Route path="/assistant" element={<ProtectedRoute><AssistantPage/></ProtectedRoute>} />
        <Route path="/sales/lead-generation" element={<ProtectedRoute><LeadGeneration/></ProtectedRoute>} />
        <Route path="/sales/lead-allocate" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><LeadAllocate/></ProtectedRoute>} />
        <Route path="/sales/lead-generation/temporary" element={<ProtectedRoute><LeadGeneration/></ProtectedRoute>} />
        <Route path="/sales/compliance-health-report/:leadId" element={<ProtectedRoute><LeadGeneration/></ProtectedRoute>} />
        <Route path="/compliance/health-report" element={<ProtectedRoute><ComplianceHealthDashboard/></ProtectedRoute>} />
        <Route path="/sales/client-master" element={<ProtectedRoute><ClientMaster/></ProtectedRoute>} />
        <Route path="/sales/client-master-allocate" element={<ProtectedRoute><ClientMasterAllocate/></ProtectedRoute>} />
        <Route path="/sales/health-report-check" element={<ProtectedRoute><HealthReportCheck/></ProtectedRoute>} />
        <Route path="/sales/client-annual-returns/:clientKey" element={<ProtectedRoute><ClientMaster/></ProtectedRoute>} />
        <Route path="/sales/client-data-processing/:clientKey/:annualYear" element={<ProtectedRoute><ClientMaster/></ProtectedRoute>} />
        <Route path="/sales/annual-returns" element={<ProtectedRoute><AnnualReturns/></ProtectedRoute>} />
        <Route path="/sales/quotations" element={<ProtectedRoute><Quotations/></ProtectedRoute>} />
        <Route path="/sales/proforma-invoices" element={<ProtectedRoute><ProformaInvoices/></ProtectedRoute>} />
        <Route path="/help-yourself" element={<ProtectedRoute><HelpYourself/></ProtectedRoute>} />
        <Route path="/support-tickets" element={<ProtectedRoute><SupportTickets/></ProtectedRoute>} />
        <Route path="/internal-tickets" element={<ProtectedRoute><InternalTickets/></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  )
}

export default App
