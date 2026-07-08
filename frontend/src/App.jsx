import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import ScrollToTop from './components/ScrollToTop'
import Login from './pages/Login'
import VerifyOtp from './pages/VerifyOtp'
import AdminDashboard from './pages/AdminDashboard'
import LeadGeneration from './pages/LeadGeneration'
import ClientMaster from './pages/ClientMaster'
import Quotations from './pages/Quotations'
import AnnualReturns from './pages/AnnualReturns'
import CalendarTodo from './pages/CalendarTodo'
import Notifications from './pages/Notifications'
import PendingApproval from './pages/PendingApproval'
import NotFound from './pages/NotFound'

function App(){
  return (
    <div className="min-h-screen bg-emerald-50">
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Login/>} />
        <Route path="/verify" element={<VerifyOtp/>} />
        <Route path="/dashboard" element={<ProtectedRoute><AdminDashboard/></ProtectedRoute>} />
        <Route path="/dashboard/users" element={<ProtectedRoute><AdminDashboard/></ProtectedRoute>} />
        <Route path="/pending-approval" element={<ProtectedRoute><PendingApproval/></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications/></ProtectedRoute>} />
        <Route path="/calendar" element={<ProtectedRoute><CalendarTodo/></ProtectedRoute>} />
        <Route path="/sales/lead-generation" element={<ProtectedRoute><LeadGeneration/></ProtectedRoute>} />
        <Route path="/sales/client-master" element={<ProtectedRoute><ClientMaster/></ProtectedRoute>} />
        <Route path="/sales/client-data-processing/:clientKey/:annualYear" element={<ProtectedRoute><ClientMaster/></ProtectedRoute>} />
        <Route path="/sales/annual-returns" element={<ProtectedRoute><AnnualReturns/></ProtectedRoute>} />
        <Route path="/sales/quotations" element={<ProtectedRoute><Quotations/></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  )
}

export default App
