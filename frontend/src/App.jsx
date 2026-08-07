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
import Quotations from './pages/Quotations'
import AnnualReturns from './pages/AnnualReturns'
import CalendarTodo from './pages/CalendarTodo'
import Notifications from './pages/Notifications'
import PendingApproval from './pages/PendingApproval'
import NotFound from './pages/NotFound'
import AssistantPage from './pages/AssistantPage'
import ProformaInvoices from './pages/ProformaInvoices'
import ComplianceHealthDashboard from './pages/ComplianceHealthDashboard'
import PendingLeads from './pages/PendingLeads'
import HelpYourself from './pages/HelpYourself'
import SupportTickets from './pages/SupportTickets'
import api, { API_ENDPOINTS, hasStoredAuthToken } from './services/api'

function ActiveCrmTracker() {
  useEffect(() => {
    let timer
    const isActive = () => hasStoredAuthToken() && document.visibilityState === 'visible' && document.hasFocus()
    const heartbeat = () => { if (isActive()) api.post(API_ENDPOINTS.auth.activityHeartbeat).catch(() => {}) }
    const refresh = () => {
      clearInterval(timer)
      if (isActive()) { heartbeat(); timer = setInterval(heartbeat, 15000) }
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('blur', refresh)
    document.addEventListener('visibilitychange', refresh)
    refresh()
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('blur', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  return null
}

function App(){
  return (
    <div className="min-h-screen bg-emerald-50">
      <ScrollToTop />
      <ActiveCrmTracker />
      <Routes>
        <Route path="/" element={<Login/>} />
        <Route path="/verify" element={<VerifyOtp/>} />
        <Route path="/forgot-password" element={<ForgotPassword/>} />
        <Route path="/forget-password" element={<Navigate to="/forgot-password" replace />} />
        <Route path="/forgotpassword" element={<Navigate to="/forgot-password" replace />} />
        <Route path="/dashboard" element={<ProtectedRoute><AdminDashboard/></ProtectedRoute>} />
        <Route path="/dashboard/users" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><AdminDashboard/></ProtectedRoute>} />
        <Route path="/pending-approval" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><PendingApproval/></ProtectedRoute>} />
        <Route path="/pending-leads" element={<Navigate to="/pending-leads/open" replace />} />
        <Route path="/pending-leads/open" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><PendingLeads mode="open"/></ProtectedRoute>} />
        <Route path="/pending-leads/closed" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><PendingLeads mode="closed"/></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications/></ProtectedRoute>} />
        <Route path="/announcements" element={<ProtectedRoute><Notifications mode="announcements"/></ProtectedRoute>} />
        <Route path="/calendar" element={<ProtectedRoute><CalendarTodo/></ProtectedRoute>} />
        <Route path="/assistant" element={<ProtectedRoute><AssistantPage/></ProtectedRoute>} />
        <Route path="/sales/lead-generation" element={<ProtectedRoute><LeadGeneration/></ProtectedRoute>} />
        <Route path="/sales/compliance-health-report/:leadId" element={<ProtectedRoute><LeadGeneration/></ProtectedRoute>} />
        <Route path="/compliance/health-report" element={<ProtectedRoute><ComplianceHealthDashboard/></ProtectedRoute>} />
        <Route path="/sales/client-master" element={<ProtectedRoute><ClientMaster/></ProtectedRoute>} />
        <Route path="/sales/client-annual-returns/:clientKey" element={<ProtectedRoute><ClientMaster/></ProtectedRoute>} />
        <Route path="/sales/client-data-processing/:clientKey/:annualYear" element={<ProtectedRoute><ClientMaster/></ProtectedRoute>} />
        <Route path="/sales/annual-returns" element={<ProtectedRoute><AnnualReturns/></ProtectedRoute>} />
        <Route path="/sales/quotations" element={<ProtectedRoute><Quotations/></ProtectedRoute>} />
        <Route path="/sales/proforma-invoices" element={<ProtectedRoute><ProformaInvoices/></ProtectedRoute>} />
        <Route path="/help-yourself" element={<ProtectedRoute><HelpYourself/></ProtectedRoute>} />
        <Route path="/support-tickets" element={<ProtectedRoute><SupportTickets/></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  )
}

export default App
