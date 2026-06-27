import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import BrandLoader from './components/BrandLoader'
import ProtectedRoute from './components/ProtectedRoute'
import ScrollToTop from './components/ScrollToTop'

const Login = lazy(() => import('./pages/Login'))
const VerifyOtp = lazy(() => import('./pages/VerifyOtp'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const LeadGeneration = lazy(() => import('./pages/LeadGeneration'))
const ClientMaster = lazy(() => import('./pages/ClientMaster'))
const Quotations = lazy(() => import('./pages/Quotations'))
const AnnualReturns = lazy(() => import('./pages/AnnualReturns'))
const CalendarTodo = lazy(() => import('./pages/CalendarTodo'))
const Notifications = lazy(() => import('./pages/Notifications'))
const PendingApproval = lazy(() => import('./pages/PendingApproval'))
const NotFound = lazy(() => import('./pages/NotFound'))

function App(){
  return (
    <div className="min-h-screen bg-emerald-50">
      <ScrollToTop />
      <Suspense fallback={<BrandLoader message="Opening CRM workspace" />}>
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
      </Suspense>
    </div>
  )
}

export default App
