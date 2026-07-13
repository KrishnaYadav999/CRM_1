import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileClock,
  FileText,
  Gauge,
  Eye,
  FolderOpen,
  ListChecks,
  Mail,
  PieChart,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Target,
  TrendingUp,
  UserRound,
  Users,
  X,
  Zap
} from 'lucide-react'
import AddUserModal from '../components/dashboard/AddUserModal'
import CreateTeamModal from '../components/dashboard/CreateTeamModal'
import EditUserModal from '../components/dashboard/EditUserModal'
import KpiSummary from '../components/dashboard/KpiSummary'
import ProfileModal from '../components/dashboard/ProfileModal'
import Sidebar from '../components/dashboard/Sidebar'
import Topbar from '../components/dashboard/Topbar'
import UserActionsMenu from '../components/dashboard/UserActionsMenu'
import UserDetailsModal from '../components/dashboard/UserDetailsModal'
import PremiumQuotationModal from '../components/PremiumQuotationModal'
import ToastMessage from '../components/ToastMessage'
import { adminRoles, defaultUserForm, roleLabels } from '../constants/dashboard'
import api, { storeSessionUser } from '../services/api'
import { API_ENDPOINTS } from '../services/apiEndpoints'
import { fetchCcpClients, fetchCcpLeads } from '../services/ccpApi'
import { mergeClientSources } from '../features/clientMaster/clientMaster.utils'

const CALENDAR_TODO_STORAGE_KEY = 'crm.calendar.todos.v1'
const DASHBOARD_CACHE_KEY = 'crm.dashboard.cache.v3'
const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000
const DASHBOARD_REQUEST_TIMEOUT_MS = 4500

function readSessionCache(key, ttlMs = DASHBOARD_CACHE_TTL_MS) {
  const stores = [sessionStorage, localStorage].filter(Boolean)
  for (const store of stores) {
    try {
      const parsed = JSON.parse(store.getItem(key) || 'null')
      if (!parsed || Date.now() - Number(parsed.savedAt || 0) > ttlMs) continue
      return parsed.data || null
    } catch {
      // Try the next cache store.
    }
  }
  return null
}

function writeSessionCache(key, data) {
  const payload = JSON.stringify({ savedAt: Date.now(), data })
  for (const store of [sessionStorage, localStorage].filter(Boolean)) {
    try {
      store.setItem(key, payload)
    } catch {
      // Cache is only for faster navigation.
    }
  }
}

function readCalendarTodoItems() {
  const items = []
  const seen = new Set()
  for (const store of [localStorage, sessionStorage].filter(Boolean)) {
    try {
      const parsed = JSON.parse(store.getItem(CALENDAR_TODO_STORAGE_KEY) || '[]')
      if (!Array.isArray(parsed)) continue
      parsed.forEach((item, index) => {
        const key = String(item.id || item._id || `${item.title || ''}-${item.scheduledDate || ''}-${item.scheduledTime || ''}-${index}`)
        if (seen.has(key)) return
        seen.add(key)
        items.push(item)
      })
    } catch {
      // Try the next browser store.
    }
  }
  return items
}

function isCalendarFollowUp(item = {}) {
  return item.type === 'follow-up' || item.category === 'Follow-Up'
}

function calendarItemBelongsToUser(item = {}, user = {}) {
  const safeUser = user || {}
  const role = normalizeKey(safeUser.role)
  if (adminRoles.includes(safeUser.role) || role === 'manager' || role.includes('operation head')) return true
  const userTokens = [safeUser.name, safeUser.email, safeUser.firstName && safeUser.lastName ? `${safeUser.firstName} ${safeUser.lastName}` : '', safeUser._id, safeUser.id]
    .filter(Boolean)
    .map((value) => normalizeKey(value))
  if (!userTokens.length) return true
  const ownerTokens = [item.assignedTo, item.assignedToName, item.assignedToEmail, item.assignedToId, item.createdBy, item.owner, item.scheduledBy]
    .filter(Boolean)
    .map((value) => normalizeKey(value))
  if (!ownerTokens.length) return true
  return ownerTokens.some((owner) => userTokens.some((token) => owner === token || owner.includes(token) || token.includes(owner)))
}

function getLeadFollowUpCompany(lead = {}) {
  return displayValue(lead.companyName || lead.company || lead.clientName || lead['Company Name'] || lead.Company || lead.leadCompanyName, 'Lead follow-up')
}

function getLeadFollowUpOwner(lead = {}) {
  return displayValue(lead.assignedToName || lead.assignedTo || lead.ownerName || lead.createdByName || lead.createdBy || lead.leadGeneratedBy, 'Unassigned')
}

function buildLeadFollowUpItems(leads = []) {
  return leads
    .filter((lead) => lead.nextFollowUpDate || lead['Next Follow-Up Date'])
    .map((lead, index) => {
      const scheduledDate = lead.nextFollowUpDate || lead['Next Follow-Up Date']
      const scheduledTime = lead.nextFollowUpTime || lead['Next Follow-Up Time'] || ''
      const company = getLeadFollowUpCompany(lead)
      return {
        id: `lead-follow-up-${lead._id || lead.id || lead.leadCode || lead.leadNumber || index}`,
        title: lead.followUpTitle || `Follow up with ${company}`,
        description: lead.followUpRemarks || lead['Follow-Up Remarks'] || lead.remarks || '',
        clientName: lead.clientName || '',
        leadCompanyName: company,
        leadNumber: lead.leadCode || lead.leadNumber || lead['Lead Number'] || '',
        assignedTo: getLeadFollowUpOwner(lead),
        assignedToName: getLeadFollowUpOwner(lead),
        scheduledDate,
        scheduledTime,
        priority: lead.priority || 'Medium',
        category: 'Follow-Up',
        status: lead.followUpStatus || lead.status || 'open',
        type: 'follow-up',
        source: 'lead'
      }
    })
}

function getCalendarFollowUpsForUser(user = {}, extraItems = []) {
  const safeUser = user || {}
  const seen = new Set()
  return [...readCalendarTodoItems(), ...extraItems]
    .filter(isCalendarFollowUp)
    .filter((item) => normalizeKey(item.status) !== 'completed')
    .filter((item) => calendarItemBelongsToUser(item, safeUser))
    .filter((item, index) => {
      const key = String(item.id || item._id || `${item.title || ''}-${item.scheduledDate || ''}-${item.scheduledTime || ''}-${index}`)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => `${a.scheduledDate || ''} ${a.scheduledTime || ''}`.localeCompare(`${b.scheduledDate || ''} ${b.scheduledTime || ''}`))
}

function getCalendarFollowUpCompany(item = {}) {
  return displayValue(item.clientName || item.leadCompanyName || item.leadNumber || item.clientNumber, 'Follow-up')
}

function getCalendarFollowUpOwner(item = {}) {
  return displayValue(item.assignedToName || item.assignedTo || item.createdBy, 'SM')
}

function formatDateTime(value) {
  if (!value) return 'No login yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No login yet'
  return new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

function formatShortDate(value) {
  if (!value) return 'Not available'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not available'
  return new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date)
}

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function parseDateKey(value) {
  const date = new Date(`${value || ''}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function diffDays(fromValue, toValue) {
  const from = parseDateKey(fromValue)
  const to = parseDateKey(toValue)
  if (!from || !to) return 0
  return Math.round((to - from) / 86400000)
}

function getFollowUpTone(item = {}, todayKey = dateKey()) {
  if (normalizeKey(item.status) === 'completed') return 'done'
  if (item.scheduledDate && item.scheduledDate < todayKey) return 'overdue'
  if ((item.history || []).length) return 'revised'
  return 'open'
}

function getFollowUpStatusLabel(item = {}, todayKey = dateKey()) {
  const tone = getFollowUpTone(item, todayKey)
  if (tone === 'done') return 'Completed'
  if (tone === 'overdue') return 'Overdue'
  if (tone === 'revised') return 'Revised'
  return 'Open'
}

function getFollowUpProgress(item = {}, todayKey = dateKey()) {
  if (normalizeKey(item.status) === 'completed') return 100
  if (item.scheduledDate && item.scheduledDate < todayKey) return 20
  if ((item.history || []).length) return 55
  return 35
}

function formatPoDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date).replace(/\//g, '-')
}

function parseFinancialYearStart(value = '') {
  const match = String(value || '').match(/(20\d{2})/)
  return match ? Number(match[1]) : null
}

function formatFinancialYear(startYear) {
  return `${startYear}-${String(startYear + 1).slice(-2)}`
}

function getLatestCompletedFinancialYearStart(date = new Date()) {
  const currentFinancialYearStart = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1
  return currentFinancialYearStart - 1
}

function buildOperationsAnnualYearOptions(row = {}) {
  const latestStart = getLatestCompletedFinancialYearStart()
  const starts = (row.annualReturns || [])
    .map((annualRow) => parseFinancialYearStart(annualRow.annualYear || annualRow.year))
    .filter(Boolean)
  const firstStart = parseFinancialYearStart(row.firstAnnualReturnYear || row.annualYear) || Math.min(...starts, latestStart - 2)
  const startYear = Math.min(firstStart, latestStart)

  return Array.from({ length: latestStart - startYear + 1 }, (_, index) => {
    const year = startYear + index
    const label = formatFinancialYear(year)
    const filing = (row.annualReturns || []).find((annualRow) => {
      return formatFinancialYear(parseFinancialYearStart(annualRow.annualYear || annualRow.year) || 0) === label
    })

    return {
      label,
      period: 'April - March',
      status: year === latestStart ? 'Current hub' : 'Open hub',
      completed: filing ? getAnnualTabCompletedCount(filing) : 0
    }
  })
}

function splitName(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] || 'User',
    lastName: parts.slice(1).join(' ') || '-'
  }
}

function buildUserSyncNotice(ccpSync, successMessage) {
  if (!ccpSync) return successMessage
  if (ccpSync.ok) return `${successMessage} CCP sync completed.`

  const reason = ccpSync.error || ccpSync.message || 'CCP sync failed'
  if (ccpSync.status === 409) {
    return `${successMessage} CCP sync duplicate email issue: ${reason}`
  }
  return `${successMessage} CCP sync pending: ${reason}`
}

function readClientData(client = {}) {
  return client.data && typeof client.data === 'object' ? client.data : client
}

function getVisibilityStatus(client = {}) {
  return String(client.adminControls?.visibilityStatus || readClientData(client).adminControls?.visibilityStatus || '').trim().toUpperCase()
}

function getClientName(client = {}) {
  const data = readClientData(client)
  return data.basic?.clientLegalName || data.basic?.tradeName || client.clientName || client.companyName || 'Untitled client'
}

function getClientCategory(client = {}) {
  const data = readClientData(client)
  return data.basic?.piboCategory || client.piboCategory || 'Unassigned'
}

function isOperationsUser(user = {}) {
  const role = String(user.role || '').toLowerCase()
  const team = String(user.team || '').toLowerCase()
  return ['operation', 'admin', 'superadmin', 'manager'].includes(role) || team.includes('operation')
}

function isSalesDashboardUser(user = {}) {
  return normalizeKey(user?.role) === 'sales'
}

function canSwitchDashboard(user = {}) {
  const role = normalizeKey(user?.role)
  return adminRoles.map(normalizeKey).includes(role) || role === 'superadmin' || role === 'super admin'
}

function getLeadOwnerName(lead = {}) {
  return lead.assignedTo?.name || lead.assignedToText || lead.createdBy?.name || lead.createdBy?.email || lead.referredBy || 'Unassigned'
}

function getLeadCompanyName(lead = {}) {
  return lead.company || lead.companyName || lead.leadDetails?.companyName || ''
}

function leadConvertedToClientMaster(lead = {}, clients = []) {
  const status = normalizeKey(lead.status || lead.stage || lead.leadStatus || '')
  if (lead.existingClient === 'Yes' || status.includes('existing') || status.includes('convert')) return true
  const leadName = getLeadCompanyName(lead)
  if (!leadName) return false
  return clients.some((client) => businessNamesMatch(getClientName(client), leadName))
}

function getLeadMergeKey(item = {}) {
  return String(item?._id || item?.id || item?.sourceLeadId || item?.leadCode || item?.company || item?.companyName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function mergeLeadSources(crmLeads = [], ccpLeads = []) {
  const merged = []
  const indexByKey = new Map()

  ;[...ccpLeads, ...crmLeads].forEach((item) => {
    const key = getLeadMergeKey(item)
    if (key && indexByKey.has(key)) {
      const index = indexByKey.get(key)
      merged[index] = { ...merged[index], ...item }
      return
    }
    if (key) indexByKey.set(key, merged.length)
    merged.push(item)
  })

  return merged
}

function leadBelongsToSalesUser(lead = {}, user = {}) {
  const role = normalizeKey(user.role)
  if (role !== 'sales') return true
  const userKeys = getUserMatchKeys(user)
  const assigned = lead.assignedTo && typeof lead.assignedTo === 'object' ? lead.assignedTo : {}
  const leadKeys = [
    assigned._id,
    assigned.id,
    assigned.email,
    assigned.name,
    lead.assignedTo,
    lead.assignedToText,
    lead.createdBy?._id,
    lead.createdBy?.id,
    lead.createdBy?.email,
    lead.createdBy?.name,
    lead.referredBy
  ].map(normalizeKey).filter(Boolean)
  return leadKeys.some((key) => userKeys.includes(key))
}

function quotationBelongsToSalesUser(quotation = {}, user = {}) {
  const role = normalizeKey(user.role)
  if (role !== 'sales') return true
  const userKeys = getUserMatchKeys(user)
  const quoteKeys = [
    quotation.createdBy?._id,
    quotation.createdBy?.id,
    quotation.createdBy?.email,
    quotation.createdBy?.name,
    quotation.leadDetails?.referredBy
  ].map(normalizeKey).filter(Boolean)
  return quoteKeys.some((key) => userKeys.includes(key))
}

function getSalesVisibleRecords(records = [], predicate) {
  const filtered = records.filter(predicate)
  return filtered.length || !records.length ? filtered : records
}

function getLeadCreatedDate(lead = {}) {
  return lead.createdAt || lead.createdOn || lead.leadDate || lead.date || lead.updatedAt || ''
}

function isTodayDate(value) {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const today = new Date()
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate()
}

function isDateInSalesPeriod(value, period = 'q1') {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const periodValue = String(period)
  if (periodValue.startsWith('months:')) {
    const selectedMonths = periodValue
      .replace('months:', '')
      .split(',')
      .map((month) => Number(String(month).replace('m', '')))
      .filter((month) => Number.isInteger(month) && month >= 0 && month <= 11)
    return selectedMonths.includes(date.getMonth())
  }
  if (periodValue.startsWith('m')) {
    return date.getMonth() === Number(periodValue.slice(1))
  }
  if (periodValue.startsWith('y')) {
    return date.getFullYear() === Number(periodValue.slice(1))
  }
  const month = date.getMonth()
  const quarterMonths = {
    q1: [3, 4, 5],
    q2: [6, 7, 8],
    q3: [9, 10, 11],
    q4: [0, 1, 2]
  }
  return (quarterMonths[period] || quarterMonths.q1).includes(month)
}

function getQuotationStatusBucket(quote = {}) {
  const status = normalizeKey(quote.quotationStatus || quote.status || quote.approvalStatus || quote.adminApproval || 'draft')
  if (status.includes('expire')) return 'Expired'
  if (status.includes('reply')) return 'Replied'
  if (status.includes('open')) return 'Opened'
  if (status.includes('sent') || status.includes('pending')) return 'Sent'
  if (status.includes('approve')) return 'Approved'
  if (status.includes('draft')) return 'Draft'
  return 'Draft'
}

function getQuotationValue(quote = {}) {
  return (quote.items || []).reduce((sum, item) => sum + (Number(item.basicAmount) || 0), 0)
}

function getQuotationOwnerName(quote = {}) {
  return quote.createdBy?.name || quote.createdBy?.email || quote.leadDetails?.referredBy || 'Unassigned'
}

function getQuotationDate(quote = {}) {
  return quote.createdAt || quote.quotationDate || quote.updatedAt || ''
}

function formatMonthYear(value) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return 'No month'
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(date)
}

function buildSalesValueGroups(quotations = []) {
  const groups = new Map()
  quotations.forEach((quote) => {
    const userName = getQuotationOwnerName(quote)
    const month = formatMonthYear(getQuotationDate(quote))
    const key = `${userName}__${month}`
    const existing = groups.get(key) || { key, userName, month, totalValue: 0, quotations: [] }
    const value = getQuotationValue(quote)
    existing.totalValue += value
    existing.quotations.push({ ...quote, __salesValue: value })
    groups.set(key, existing)
  })
  return [...groups.values()].sort((a, b) => b.totalValue - a.totalValue)
}

function buildSalesValueReportRows(quotations = []) {
  return buildSalesValueGroups(quotations).flatMap((group) => (
    group.quotations.map((quote) => [
      group.userName,
      group.month,
      quote.leadDetails?.companyName || quote.companyName || 'Client',
      formatShortDate(getQuotationDate(quote)),
      formatDashboardInr(quote.__salesValue)
    ])
  ))
}

function getLeadPipelineStage(lead = {}) {
  const status = normalizeKey(lead.status || lead.stage || lead.leadStatus || '')
  if (lead.existingClient === 'Yes' || status.includes('won') || status.includes('existing') || status.includes('convert')) return 'Won'
  if (status.includes('lost') || status.includes('reject')) return 'Lost'
  if (status.includes('negotiation') || status.includes('negotiate')) return 'Negotiation'
  if (status.includes('quotation') || status.includes('quote') || status.includes('proposal')) return 'Quotation'
  if (status.includes('qualified')) return 'Qualified'
  if (status.includes('contact') || status.includes('call') || status.includes('follow')) return 'Contacted'
  return 'New'
}

function quotationMatchesLead(quote = {}, lead = {}) {
  return businessNamesMatch(quote.leadDetails?.companyName || quote.companyName || '', lead.company || lead.companyName || '')
}

function getLeadSalesValue(lead = {}, quotations = []) {
  return quotations
    .filter((quote) => quotationMatchesLead(quote, lead))
    .reduce((sum, quote) => sum + getQuotationValue(quote), 0)
}

function buildDistributionRows(items = [], getLabel, palette = []) {
  const counts = new Map()
  items.forEach((item) => {
    const label = getLabel(item) || 'Others'
    counts.set(label, (counts.get(label) || 0) + 1)
  })
  const total = items.length || 0
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], index) => ({
      label,
      value,
      percent: total ? Math.round((value / total) * 1000) / 10 : 0,
      color: palette[index % palette.length] || '#0f766e'
    }))
}

function getLeadOwnerKeys(lead = {}) {
  const assigned = lead.assignedTo && typeof lead.assignedTo === 'object' ? lead.assignedTo : {}
  return [
    assigned._id,
    assigned.id,
    assigned.email,
    assigned.name,
    lead.assignedTo,
    lead.assignedToText,
    lead.ownerId,
    lead.userId,
    lead.createdBy?._id,
    lead.createdBy?.id,
    lead.createdBy?.email,
    lead.createdBy?.name,
    lead.referredBy
  ].map(normalizeKey).filter(Boolean)
}

function leadMatchesAnyUserKey(lead = {}, allowedKeys = new Set()) {
  return getLeadOwnerKeys(lead).some((key) => allowedKeys.has(key))
}

function buildOperationsLeadAnalytics(leads = [], users = [], currentUser = {}) {
  const role = normalizeKey(currentUser?.role)
  const canSeeAll = adminRoles.includes(currentUser?.role) || role === 'admin' || role === 'superadmin'
  const canSeeTeam = role === 'manager' || role.includes('operation head')
  let visibleLeads = leads
  let visibleUsers = users

  if (!canSeeAll && canSeeTeam) {
    const allowedKeys = new Set(getUserMatchKeys(currentUser))
    visibleUsers = users.filter((user) => userBelongsToManager(user, currentUser) || getUserId(user) === getUserId(currentUser))
    visibleUsers.flatMap(getUserMatchKeys).forEach((key) => allowedKeys.add(key))
    visibleLeads = leads.filter((lead) => leadMatchesAnyUserKey(lead, allowedKeys))
  } else if (!canSeeAll && !role.includes('compliance')) {
    const allowedKeys = new Set(getUserMatchKeys(currentUser))
    visibleUsers = users.filter((user) => getUserMatchKeys(user).some((key) => allowedKeys.has(key)))
    visibleLeads = leads.filter((lead) => leadMatchesAnyUserKey(lead, allowedKeys))
  }

  const userCounts = new Map()
  visibleLeads.forEach((lead) => {
    const ownerKeys = getLeadOwnerKeys(lead)
    const matchedUser = users.find((user) => getUserMatchKeys(user).some((key) => ownerKeys.includes(key)))
    const id = matchedUser ? (getUserId(matchedUser) || getUserName(matchedUser)) : getLeadOwnerName(lead)
    const name = matchedUser ? getUserName(matchedUser) : getLeadOwnerName(lead)
    const existing = userCounts.get(id) || { id, name, leads: 0 }
    existing.leads += 1
    userCounts.set(id, existing)
  })

  if (canSeeAll || canSeeTeam) {
    visibleUsers.forEach((user) => {
      const id = getUserId(user)
      if (id && !userCounts.has(id)) userCounts.set(id, { id, name: getUserName(user), leads: 0 })
    })
  }

  const ownerRows = [...userCounts.values()]
    .sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name))
    .slice(0, 10)
    .map((row, index) => ({ ...row, fill: ['#0f9f83', '#2563eb', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6'][index % 6] }))

  const stageRows = buildDistributionRows(
    visibleLeads,
    getLeadPipelineStage,
    ['#0f9f83', '#2563eb', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#64748b']
  )

  return {
    leads: visibleLeads,
    ownerRows,
    stageRows,
    assignedTotal: visibleLeads.filter((lead) => normalizeKey(getLeadOwnerName(lead)) !== 'unassigned').length,
    unassignedTotal: visibleLeads.filter((lead) => normalizeKey(getLeadOwnerName(lead)) === 'unassigned').length
  }
}

const salesCommunicationModes = ['TeleCalling', 'Referral', 'Physical Visit', 'Campaign', 'Existing Client', 'Web Database']
const salesLeadStatuses = ['Potential - Interested', 'Potential - Not Interested', 'Need Assistance', 'Lost', 'Existing Client']

function normalizeSalesMatrixValue(value = '', fallback = 'Unassigned') {
  return String(value || fallback).trim() || fallback
}

function findSalesMatrixBucket(value = '', buckets = [], fallback = 'Unassigned') {
  const normalized = normalizeKey(value)
  return buckets.find((bucket) => normalizeKey(bucket) === normalized) || fallback
}

function buildSalesLeadMatrixRows(leads = []) {
  const rows = new Map()
  leads.forEach((lead) => {
    const owner = getLeadOwnerName(lead)
    const key = normalizeKey(owner) || 'unassigned'
    const existing = rows.get(key) || {
      key,
      owner: normalizeSalesMatrixValue(owner),
      communication: Object.fromEntries(salesCommunicationModes.map((mode) => [mode, 0])),
      statuses: Object.fromEntries(salesLeadStatuses.map((status) => [status, 0])),
      total: 0
    }
    const communicationMode = findSalesMatrixBucket(lead.communicationMode || lead.clientCommunicationMode || lead.mode, salesCommunicationModes)
    const status = findSalesMatrixBucket(lead.status || lead.leadStatus || lead.stage, salesLeadStatuses)
    if (existing.communication[communicationMode] !== undefined) existing.communication[communicationMode] += 1
    if (existing.statuses[status] !== undefined) existing.statuses[status] += 1
    existing.total += 1
    rows.set(key, existing)
  })
  return [...rows.values()].sort((a, b) => b.total - a.total || a.owner.localeCompare(b.owner))
}

function buildConicGradient(rows = []) {
  if (!rows.length) return '#e2e8f0'
  let cursor = 0
  const stops = rows.map((row) => {
    const start = cursor
    cursor += row.percent
    return `${row.color} ${start}% ${cursor}%`
  })
  return `conic-gradient(${stops.join(', ')})`
}

function buildCategoryRows(clients = []) {
  const counts = new Map()
  clients.forEach((client) => {
    const category = getClientCategory(client)
    counts.set(category, (counts.get(category) || 0) + 1)
  })
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

function buildTeamRows(users = [], clients = [], annualReturns = []) {
  const teams = new Map()
  users.forEach((user) => {
    const team = user.team || 'No team assigned'
    if (!teams.has(team)) teams.set(team, { label: team, users: 0, clients: 0, annualReturns: 0 })
    teams.get(team).users += 1
  })
  clients.forEach((client) => {
    const team = client.adminControls?.assignedTeam || client.data?.importMeta?.team || 'No team assigned'
    if (!teams.has(team)) teams.set(team, { label: team, users: 0, clients: 0, annualReturns: 0 })
    teams.get(team).clients += 1
  })
  annualReturns.forEach((row) => {
    const team = row.adminControls?.assignedTeam || 'No team assigned'
    if (!teams.has(team)) teams.set(team, { label: team, users: 0, clients: 0, annualReturns: 0 })
    teams.get(team).annualReturns += 1
  })
  return [...teams.values()].sort((a, b) => (b.clients + b.annualReturns + b.users) - (a.clients + a.annualReturns + a.users))
}

function buildRecentOperations(clients = [], annualReturns = [], pendingClients = [], pendingQuotations = []) {
  const clientItems = clients.slice(0, 4).map((client) => ({
    id: `client-${client._id || client.id || getClientName(client)}`,
    title: getClientName(client),
    subtitle: `Client status: ${getVisibilityStatus(client) || 'Draft'}`,
    date: client.updatedAt || client.createdAt,
    tone: 'teal'
  }))
  const annualItems = annualReturns.slice(0, 4).map((row) => ({
    id: `annual-${row._id || row.clientKey || row.clientName}-${row.annualYear}`,
    title: row.clientName || 'Annual return',
    subtitle: `Annual return ${row.annualYear || '-'} - ${row.status || 'draft'}`,
    date: row.updatedAt || row.savedAt,
    tone: 'emerald'
  }))
  const approvalItems = [...pendingClients.slice(0, 2), ...pendingQuotations.slice(0, 2)].map((row, index) => ({
    id: `approval-${row.id || row._id || index}`,
    title: row.clientName || row.companyName || row.userName || 'Approval request',
    subtitle: row.approvalType || row.approvalStatus || 'Pending approval',
    date: row.createdAt || row.requestDate || row.updatedAt,
    tone: 'orange'
  }))
  return [...approvalItems, ...annualItems, ...clientItems].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
}

function buildWorkflowRows({ leads = [], clients = [], quotations = [], annualReturns = [], pendingTotal = 0 }) {
  const max = Math.max(leads.length, clients.length, quotations.length, annualReturns.length, pendingTotal, 1)
  return [
    { label: 'Lead intake', value: leads.length, note: 'CRM lead records', tone: 'teal' },
    { label: 'Client master', value: clients.length, note: 'Client files in operations', tone: 'emerald' },
    { label: 'Approval queue', value: pendingTotal, note: 'Items waiting action', tone: 'orange' },
    { label: 'Quotations', value: quotations.length, note: 'Commercial requests', tone: 'indigo' },
    { label: 'Annual returns', value: annualReturns.length, note: 'Filing workspaces', tone: 'teal' }
  ].map((row) => ({ ...row, percent: Math.round((row.value / max) * 100) }))
}

function buildAttentionItems({ analytics, clients = [], inactiveUsers = 0 }) {
  const items = [
    {
      title: 'Approval queue',
      value: analytics.pendingTotal,
      detail: analytics.pendingTotal ? 'Needs decision from operations/admin' : 'Queue is clear',
      severity: analytics.pendingTotal > 0 ? 'high' : 'good'
    },
    {
      title: 'Annual drafts',
      value: analytics.annualDraft,
      detail: analytics.annualDraft ? 'Draft filings need completion' : 'No open annual drafts',
      severity: analytics.annualDraft > 0 ? 'medium' : 'good'
    },
    {
      title: 'Discontinued clients',
      value: analytics.discontinuedClients,
      detail: 'Review visibility before operational planning',
      severity: analytics.discontinuedClients > 0 ? 'medium' : 'good'
    },
    {
      title: 'Inactive operation users',
      value: inactiveUsers,
      detail: 'Capacity unavailable in operations team',
      severity: inactiveUsers > 0 ? 'low' : 'good'
    }
  ]

  if (!clients.length) {
    items.unshift({
      title: 'Client pipeline',
      value: 0,
      detail: 'No client master records loaded',
      severity: 'medium'
    })
  }

  return items
}

function percent(value, total) {
  return total ? Math.round((value / total) * 100) : 0
}

function normalizeText(value = '') {
  return displayValue(value).trim().toLowerCase()
}

function normalizeKey(value = '') {
  return normalizeText(value).replace(/\s+/g, ' ')
}

function displayValue(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((item) => displayValue(item)).filter(Boolean).join(', ') || fallback
  if (typeof value === 'object') {
    return value.name || value.email || value.label || value.title || value.companyName || value.clientName || value._id || value.id || fallback
  }
  return fallback
}

function normalizeBusinessKey(value = '') {
  return normalizeText(value)
    .replace(/\b(m\s*s|ms|m\/s|shree|shri|sri)\b/g, ' ')
    .replace(/\b(private|limited|pvt|ltd|llp|company|co|industries|industry|enterprise|enterprises)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeDigits(value = '') {
  return String(value || '').replace(/\D+/g, '')
}

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase()
}

function compactName(value = '') {
  return normalizeBusinessKey(value).replace(/\s+/g, '')
}

function businessNamesMatch(left = '', right = '') {
  const a = normalizeBusinessKey(left)
  const b = normalizeBusinessKey(right)
  if (!a || !b) return false
  if (a === b) return true

  const compactA = compactName(a)
  const compactB = compactName(b)
  if (!compactA || !compactB) return false
  if (compactA === compactB) return true
  if (compactA.length >= 8 && compactB.includes(compactA)) return true
  if (compactB.length >= 8 && compactA.includes(compactB)) return true

  const aTokens = new Set(a.split(' ').filter((token) => token.length > 2))
  const bTokens = b.split(' ').filter((token) => token.length > 2)
  const matches = bTokens.filter((token) => aTokens.has(token)).length
  return matches >= 2 && matches >= Math.min(aTokens.size, bTokens.length) - 1
}

function getUserId(user = {}) {
  const safeUser = user || {}
  return String(safeUser._id || safeUser.id || safeUser.userId || '').trim()
}

function getUserName(user = {}) {
  const safeUser = user || {}
  return safeUser.name || safeUser.email || 'Unassigned'
}

function getUserMatchKeys(user = {}) {
  const safeUser = user || {}
  return [
    safeUser._id,
    safeUser.id,
    safeUser.userId,
    safeUser.ccpUserId,
    safeUser.email,
    safeUser.name
  ].map(normalizeKey).filter(Boolean)
}

function getClientCode(client = {}) {
  const data = readClientData(client)
  return data.importMeta?.uniqueId || data.importMeta?.leadNumber || data.importMeta?.ccpClientId || client.clientCode || client.leadCode || client.code || '-'
}

function getClientFirstAnnualYear(client = {}) {
  const data = readClientData(client)
  return data.basic?.firstAnnualReturnYear || data.firstAnnualReturnYear || client.firstAnnualReturnYear || ''
}

function getClientMatchKeys(client = {}) {
  const data = readClientData(client)
  const lead = typeof client.selectedLead === 'object' ? client.selectedLead : {}
  const companyKeys = [
    getClientName(client),
    data.basic?.clientLegalName,
    data.basic?.tradeName
  ].map(normalizeBusinessKey).filter(Boolean).map((value) => `company:${value}`)
  return [
    client._id,
    client.id,
    client.clientKey,
    client.client,
    getClientCode(client),
    getClientName(client),
    data.importMeta?.uniqueId,
    data.importMeta?.leadNumber,
    data.importMeta?.ccpClientId,
    lead._id,
    lead.id,
    lead.leadCode,
    ...companyKeys
  ].map((value) => String(value || '').startsWith('company:') ? value : normalizeKey(value)).filter(Boolean)
}

function getClientDedupeKey(client = {}) {
  const data = readClientData(client)
  const company = normalizeKey(getClientName(client))
  const category = normalizeKey(getClientCategory(client))
  const assigned = getAssignedUserKeysFromClient(client).join('|')
  const strongCode = normalizeKey(data.importMeta?.uniqueId || data.importMeta?.leadNumber || data.importMeta?.ccpClientId || '')
  if (company && company !== 'untitled client') return [company, category, assigned].filter(Boolean).join('::')
  return strongCode || normalizeKey(client._id || client.id || getClientCode(client))
}

function getAssignedUserKeysFromClient(client = {}) {
  const data = readClientData(client)
  const admin = client.adminControls || data.adminControls || {}
  const importMeta = data.importMeta || {}
  const assigned = admin.assignedTo && typeof admin.assignedTo === 'object' ? admin.assignedTo : {}
  return [
    admin.assignedTo,
    assigned._id,
    assigned.id,
    assigned.name,
    assigned.email,
    admin.assignedUser,
    admin.user,
    admin.userId,
    admin.managerId,
    importMeta.assignedTo,
    importMeta.user,
    importMeta.userName,
    client.assignedTo,
    client.assignedUser,
    client.userName,
    client.user?.name,
    client.user?.email,
    client.user?._id
  ].map(normalizeKey).filter(Boolean)
}

function resolveAssignedUser(client = {}, users = [], fallbackUser = null) {
  const assignedKeys = getAssignedUserKeysFromClient(client)
  const matched = users.find((user) => getUserMatchKeys(user).some((key) => assignedKeys.includes(key)))
  if (matched) return matched
  return fallbackUser || null
}

function getAnnualReturnClientKeys(row = {}) {
  const client = row.client && typeof row.client === 'object' ? row.client : {}
  const clientData = row.clientData && typeof row.clientData === 'object' ? row.clientData : {}
  return [
    row.clientKey,
    row.client,
    row.clientId,
    row.clientName,
    row.companyName,
    row.atplCode,
    row.uniqueId,
    row.leadNumber,
    client._id,
    client.id,
    client.name,
    client.clientName,
    clientData.importMeta?.uniqueId,
    clientData.importMeta?.leadNumber,
    clientData.importMeta?.ccpClientId
  ].map(normalizeKey).filter(Boolean)
}

function getQuotationClientKeys(row = {}) {
  const client = row.client && typeof row.client === 'object' ? row.client : {}
  const lead = row.lead && typeof row.lead === 'object' ? row.lead : {}
  const details = row.leadDetails || {}
  const companyKeys = [
    row.companyName,
    details.companyName,
    client.clientName,
    client.companyName
  ].map(normalizeBusinessKey).filter(Boolean).map((value) => `company:${value}`)
  return [
    row.client,
    row.clientId,
    row.clientKey,
    row.clientName,
    row.companyName,
    details.companyName,
    row.leadCode,
    details.leadCode,
    row.atplCode,
    row.uniqueId,
    row.leadNumber,
    client._id,
    client.id,
    client.clientName,
    client.companyName,
    lead._id,
    lead.id,
    lead.leadCode,
    ...companyKeys
  ].map((value) => String(value || '').startsWith('company:') ? value : normalizeKey(value)).filter(Boolean)
}

function quotationMatchesClientLoose(quote = {}, client = {}) {
  const data = readClientData(client)
  const details = quote.leadDetails || {}
  const quoteNames = [
    quote.companyName,
    quote.clientName,
    details.companyName,
    quote.leadName
  ].filter(Boolean)
  const clientNames = [
    getClientName(client),
    data.basic?.clientLegalName,
    data.basic?.tradeName
  ].filter(Boolean)
  if (quoteNames.some((quoteName) => clientNames.some((clientName) => businessNamesMatch(quoteName, clientName)))) return true

  const quotePhones = [
    quote.mobileNo1,
    quote.mobileNo2,
    quote.mobile,
    quote.phone,
    details.mobileNo1,
    details.mobileNo2,
    details.mobile,
    details.phone
  ].map(normalizeDigits).filter((value) => value.length >= 8)
  const clientPhones = [
    data.otp?.mobile,
    data.otp?.mobileNo,
    data.authorised?.mobile,
    data.authorised?.mobileNo,
    data.coordinating?.mobile,
    data.coordinating?.mobileNo,
    client.mobileNo1,
    client.mobileNo2,
    client.mobile,
    client.phone
  ].map(normalizeDigits).filter((value) => value.length >= 8)
  if (quotePhones.some((phone) => clientPhones.some((clientPhone) => phone.endsWith(clientPhone) || clientPhone.endsWith(phone)))) return true

  const quoteEmails = [
    quote.email,
    quote.emailId,
    details.email,
    details.emailId
  ].map(normalizeEmail).filter(Boolean)
  const clientEmails = [
    data.otp?.email,
    data.authorised?.email,
    data.coordinating?.email,
    client.email,
    client.emailId
  ].map(normalizeEmail).filter(Boolean)
  if (quoteEmails.some((email) => clientEmails.includes(email))) return true

  const quoteTokens = getQuotationClientKeys(quote)
  const clientTokens = getClientMatchKeys(client)
  return quoteTokens.some((key) => clientTokens.includes(key))
}

function getAnnualWorkflowStage(row = {}) {
  const workflow = row.approvalWorkflow || row.workflow || {}
  const status = normalizeKey(workflow.status || row.status || '')
  if (status === 'complete' || status.includes('approved by compliance')) return 'complete'
  if (status.includes('compliance') && !status.includes('reject')) return 'compliance'
  if (status.includes('manager') && !status.includes('reject')) return 'manager'
  return normalizeKey(workflow.currentStage || row.currentStage || row.stage || status || 'user')
}

function isAnnualReturnDone(row = {}) {
  const stage = getAnnualWorkflowStage(row)
  const status = normalizeKey(row.status || row.approvalWorkflow?.status || '')
  return stage === 'complete' || ['filed', 'submitted', 'closed', 'approved', 'complete'].some((item) => status.includes(item))
}

function isAnnualCompliancePending(row = {}) {
  const stage = getAnnualWorkflowStage(row)
  const status = normalizeKey(row.status || row.approvalWorkflow?.status || '')
  return stage === 'compliance' || status.includes('compliance_pending') || status.includes('pending with compliance')
}

function getAnnualTabCompletedCount(row = {}) {
  const completedTabs = row?.draft?.__completedTabs && typeof row.draft.__completedTabs === 'object' && !Array.isArray(row.draft.__completedTabs)
    ? row.draft.__completedTabs
    : {}
  const tabIds = ['basic', 'financials', 'data', 'cpcbLetter']
  const tabCount = tabIds.filter((tabId) => completedTabs[tabId]).length
  if (tabCount) return tabCount
  return isAnnualReturnDone(row) ? 4 : 0
}

function getAnnualRowsCompletedCount(rows = []) {
  if (!rows.length) return 0
  return Math.max(...rows.map(getAnnualTabCompletedCount), 0)
}

function getLatestOperationAnnualReturn(rows = []) {
  return [...rows]
    .filter((row) => parseFinancialYearStart(row.annualYear || row.year))
    .sort((left, right) => {
      return parseFinancialYearStart(right.annualYear || right.year) - parseFinancialYearStart(left.annualYear || left.year)
    })[0] || rows[0] || null
}

function getLatestAvailableAnnualYear(firstAnnualReturnYear = '') {
  const firstStart = parseFinancialYearStart(firstAnnualReturnYear)
  const latestStart = getLatestCompletedFinancialYearStart()
  if (!firstStart) return formatFinancialYear(latestStart)
  return formatFinancialYear(firstStart > latestStart ? firstStart : latestStart)
}

function getFileDisplayValue(value) {
  if (!value) return ''
  if (Array.isArray(value)) return value.map(getFileDisplayValue).filter(Boolean).join(', ')
  if (typeof value === 'object') return value.name || value.fileName || value.originalName || value.url || value.fileUrl || value.path || value.dataUrl || ''
  return String(value)
}

function getFileUrl(value) {
  if (!value) return ''
  if (typeof value === 'object') return value.dataUrl || value.url || value.fileUrl || value.path || ''
  return String(value)
}

function getPoValue(...values) {
  return values.find((value) => {
    if (Array.isArray(value)) return value.length
    if (value && typeof value === 'object') return Boolean(getFileDisplayValue(value))
    return String(value || '').trim()
  }) || ''
}

function getAnnualReturnDraftValue(row = {}, key = '') {
  const draft = row?.draft && typeof row.draft === 'object' ? row.draft : {}
  const aliases = {
    'financials.compliancePoNo': ['Compliance PO No.'],
    'financials.compliancePoDate': ['Compliance PO Date'],
    'financials.compliancePoFile': ['Upload Compliance PO']
  }
  return [key, ...(aliases[key] || [])].map((item) => draft[item]).find((value) => getPoValue(value)) || ''
}

function getCompliancePoDetails(client = {}, quotations = [], annualReturns = []) {
  const data = readClientData(client)
  const quoteWithPo = quotations.find((quote) => getPoValue(
    quote.compliancePoNo,
    quote.compliancePoDate,
    quote.compliancePoFile,
    quote.poNo,
    quote.poNumber,
    quote.purchaseOrderNo,
    quote.purchaseOrder?.number,
    quote.purchaseOrder?.date,
    quote.purchaseOrder?.document,
    quote.poDocument
  )) || {}
  const annualWithPo = annualReturns.find((row) => getPoValue(
    row.financials?.compliancePoNo,
    row.financials?.poNo,
    row.financials?.compliancePoDate,
    row.financials?.poDate,
    row.financials?.compliancePoFile,
    row.financials?.poDocument,
    getAnnualReturnDraftValue(row, 'financials.compliancePoNo'),
    getAnnualReturnDraftValue(row, 'financials.compliancePoDate'),
    getAnnualReturnDraftValue(row, 'financials.compliancePoFile')
  )) || {}
  const purchaseOrder = quoteWithPo.purchaseOrder && typeof quoteWithPo.purchaseOrder === 'object' ? quoteWithPo.purchaseOrder : {}
  const poNo = getPoValue(
    data.financials?.compliancePoNo,
    data.financials?.poNo,
    data.financials?.poNumber,
    data.validation?.poNumber,
    data.validation?.poNo,
    quoteWithPo.compliancePoNo,
    quoteWithPo.poNo,
    quoteWithPo.poNumber,
    quoteWithPo.purchaseOrderNo,
    purchaseOrder.number,
    annualWithPo.financials?.compliancePoNo,
    annualWithPo.financials?.poNo,
    getAnnualReturnDraftValue(annualWithPo, 'financials.compliancePoNo')
  )
  const poDate = getPoValue(
    data.financials?.compliancePoDate,
    data.financials?.poDate,
    data.validation?.poDate,
    quoteWithPo.compliancePoDate,
    quoteWithPo.poDate,
    quoteWithPo.purchaseOrderDate,
    purchaseOrder.date,
    annualWithPo.financials?.compliancePoDate,
    annualWithPo.financials?.poDate,
    getAnnualReturnDraftValue(annualWithPo, 'financials.compliancePoDate')
  )
  const poFile = getPoValue(
    data.financials?.compliancePoFile,
    data.financials?.poDocument,
    data.validation?.poDocument,
    quoteWithPo.compliancePoFile,
    quoteWithPo.poDocument,
    purchaseOrder.document,
    purchaseOrder.file,
    annualWithPo.financials?.compliancePoFile,
    annualWithPo.financials?.poDocument,
    getAnnualReturnDraftValue(annualWithPo, 'financials.compliancePoFile')
  )

  const hasPo = Boolean(poNo || poDate || getFileDisplayValue(poFile))
  return {
    poNo,
    poDate,
    poFile,
    fileName: getFileDisplayValue(poFile),
    fileUrl: getFileUrl(poFile),
    source: hasPo ? (annualWithPo._id ? 'Annual Return upload' : quoteWithPo._id || quoteWithPo.id ? 'Quotation / PO data' : 'Client Master') : '',
    hasPo
  }
}

function getPerformanceTone(value = 0) {
  if (value >= 100) return 'complete'
  if (value > 90) return 'good'
  if (value > 75) return 'warn'
  return 'risk'
}

function buildPiboCategoryCards(clients = []) {
  const required = ['Producer', 'Brand Owner', 'Importer', 'SIMP', 'Recycler', 'PWP', 'Refurbisher']
  const counts = new Map(required.map((label) => [normalizeKey(label), { label, value: 0 }]))
  clients.forEach((client) => {
    const label = client.category || getClientCategory(client) || 'Unassigned'
    const key = normalizeKey(label)
    const existing = counts.get(key) || { label, value: 0 }
    existing.value += 1
    counts.set(key, existing)
  })
  return [...counts.values()].sort((a, b) => required.indexOf(a.label) - required.indexOf(b.label))
}

function buildManagerCards(users = [], rows = []) {
  const managerRoles = ['manager', 'operation head', 'operations head', 'admin', 'superadmin']
  return users
    .filter((user) => managerRoles.includes(normalizeKey(user.role)))
    .map((manager) => {
      const managerId = getUserId(manager)
      const teamUsers = users.filter((user) => String(user.managerId || user.operationHeadId || '') === managerId)
      const userIds = new Set([managerId, ...teamUsers.map(getUserId)].filter(Boolean))
      const managerRows = rows.filter((row) => userIds.has(getUserId(row.user)))
      const total = managerRows.reduce((sum, row) => sum + row.annualTotal, 0)
      const done = managerRows.reduce((sum, row) => sum + row.annualDone, 0)
      return {
        id: managerId || manager.email || manager.name,
        name: getUserName(manager),
        users: teamUsers.length,
        total,
        done,
        percent: percent(done, total)
      }
    })
    .filter((row) => row.users || row.total)
}

function mergeOperationRow(existing = {}, incoming = {}) {
  const annualReturns = [...new Map([...(existing.annualReturns || []), ...(incoming.annualReturns || [])].map((row) => [row._id || `${row.clientKey || row.clientName}-${row.annualYear || row.year}`, row])).values()]
  const quotations = [...new Map([...(existing.quotations || []), ...(incoming.quotations || [])].map((row) => [row._id || row.id || row.quotationNo || JSON.stringify(row), row])).values()]
  const displayAnnualReturn = getLatestOperationAnnualReturn(annualReturns)
  const annualYear = displayAnnualReturn?.annualYear || displayAnnualReturn?.year || existing.annualYear || incoming.annualYear || getLatestAvailableAnnualYear(existing.firstAnnualReturnYear || incoming.firstAnnualReturnYear)
  const annualDone = displayAnnualReturn ? getAnnualTabCompletedCount(displayAnnualReturn) : Math.max(existing.annualDone || 0, incoming.annualDone || 0)
  const annualTotal = 4
  const poDetails = existing.hasPo ? existing.poDetails : incoming.poDetails
  return {
    ...existing,
    ...incoming,
    atplCode: existing.atplCode && existing.atplCode !== '-' ? existing.atplCode : incoming.atplCode,
    quotations,
    quoteCount: quotations.length,
    hasQuotation: quotations.length > 0,
    poDetails,
    hasPo: Boolean(existing.hasPo || incoming.hasPo),
    annualReturns,
    annualDone,
    annualTotal,
    annualPercent: percent(annualDone, annualTotal),
    annualYear,
    firstAnnualReturnYear: existing.firstAnnualReturnYear || incoming.firstAnnualReturnYear,
    compliancePending: Boolean(existing.compliancePending || incoming.compliancePending),
    user: existing.user || incoming.user,
    userName: existing.userName && existing.userName !== 'Unassigned' ? existing.userName : incoming.userName,
    assignedKeys: [...new Set([...(existing.assignedKeys || []), ...(incoming.assignedKeys || [])])]
  }
}

function dedupeOperationRows(rows = []) {
  const byKey = new Map()
  rows.forEach((row) => {
    const key = row.dedupeKey || row.id
    byKey.set(key, byKey.has(key) ? mergeOperationRow(byKey.get(key), row) : row)
  })
  return [...byKey.values()]
}

function buildOperationsRows({ clients = [], annualReturns = [], quotations = [], users = [] }) {
  const annualByClientKey = new Map()
  annualReturns.forEach((row) => {
    getAnnualReturnClientKeys(row).forEach((key) => {
      const rows = annualByClientKey.get(key) || []
      rows.push(row)
      annualByClientKey.set(key, rows)
    })
  })
  const quotationsByClientKey = new Map()
  quotations.forEach((quote) => {
    getQuotationClientKeys(quote).forEach((key) => {
      const rows = quotationsByClientKey.get(key) || []
      rows.push(quote)
      quotationsByClientKey.set(key, rows)
    })
  })

  const rows = clients.map((client) => {
    const keys = getClientMatchKeys(client)
    const clientAnnualReturns = [...new Map(keys.flatMap((key) => annualByClientKey.get(key) || []).map((row) => [row._id || `${row.clientKey}-${row.annualYear}`, row])).values()]
    const keyedQuotations = keys.flatMap((key) => quotationsByClientKey.get(key) || [])
    const looseQuotations = quotations.filter((quote) => quotationMatchesClientLoose(quote, client))
    const clientQuotations = [...new Map([...keyedQuotations, ...looseQuotations].map((row) => [row._id || row.id || row.quotationNumber || row.quotationNo || JSON.stringify(row), row])).values()]
    const user = resolveAssignedUser(client, users) || null
    const annualTotal = 4
    const firstAnnualReturnYear = getClientFirstAnnualYear(client)
    const displayAnnualReturn = getLatestOperationAnnualReturn(clientAnnualReturns)
    const annualYear = displayAnnualReturn?.annualYear || displayAnnualReturn?.year || getLatestAvailableAnnualYear(firstAnnualReturnYear)
    const annualDone = displayAnnualReturn ? getAnnualTabCompletedCount(displayAnnualReturn) : 0
    const compliancePending = clientAnnualReturns.some(isAnnualCompliancePending)
    const poDetails = getCompliancePoDetails(client, clientQuotations, clientAnnualReturns)
    const operationRow = {
      id: client._id || client.id || getClientCode(client) || getClientName(client),
      client,
      dedupeKey: getClientDedupeKey(client),
      clientKey: client._id || client.id || client.clientKey || getClientCode(client),
      atplCode: getClientCode(client),
      companyName: getClientName(client),
      category: getClientCategory(client),
      quotations: clientQuotations,
      quoteCount: clientQuotations.length,
      hasQuotation: clientQuotations.length > 0,
      poDetails,
      hasPo: poDetails.hasPo,
      annualDone,
      annualTotal,
      annualPercent: percent(annualDone, annualTotal),
      annualReturns: clientAnnualReturns,
      annualYear,
      firstAnnualReturnYear,
      compliancePending,
      user,
      userName: user ? getUserName(user) : (getAssignedUserKeysFromClient(client)[0] || 'Unassigned'),
      assignedKeys: getAssignedUserKeysFromClient(client)
    }
    console.debug('[OperationsTable:row-match]', {
      atplCode: operationRow.atplCode,
      companyName: operationRow.companyName,
      clientKeys: keys,
      quotationCount: operationRow.quoteCount,
      quotations: clientQuotations.map((quote) => ({
        id: quote._id || quote.id,
        quotationNumber: quote.quotationNumber || quote.quotationNo,
        companyName: quote.companyName || quote.leadDetails?.companyName,
        leadCode: quote.leadCode || quote.leadDetails?.leadCode
      })),
      hasPo: operationRow.hasPo,
      poDetails: operationRow.poDetails
    })
    return operationRow
  })
  const dedupedRows = dedupeOperationRows(rows)
  console.debug('[OperationsTable:quotation-summary]', {
    totalClients: clients.length,
    totalQuotations: quotations.length,
    matchedRows: dedupedRows.filter((row) => row.hasQuotation).length,
    unmatchedRows: dedupedRows.filter((row) => !row.hasQuotation).map((row) => ({
      atplCode: row.atplCode,
      companyName: row.companyName
    }))
  })
  return dedupedRows
}

function userBelongsToManager(user = {}, manager = {}) {
  const managerId = getUserId(manager)
  const managerKeys = getUserMatchKeys(manager)
  const reportingKeys = [user.managerId, user.operationHeadId, user.reportingTo, user.manager?._id, user.manager?.id, user.manager?.name, user.manager?.email].map(normalizeKey).filter(Boolean)
  return Boolean(managerId && reportingKeys.includes(normalizeKey(managerId))) || reportingKeys.some((key) => managerKeys.includes(key))
}

function getScopedOperationsRows(rows = [], users = [], currentUser = {}) {
  const role = normalizeKey(currentUser?.role)
  const currentUserId = getUserId(currentUser)
  if (adminRoles.includes(currentUser?.role) || role === 'superadmin' || role === 'admin') return rows
  if (role.includes('compliance')) return rows.filter((row) => row.compliancePending)
  const currentUserKeys = getUserMatchKeys(currentUser)
  if (role === 'manager' || role.includes('operation head')) {
    const allowedKeys = new Set(
      users
        .filter((user) => userBelongsToManager(user, currentUser) || getUserId(user) === currentUserId)
        .flatMap(getUserMatchKeys)
    )
    currentUserKeys.forEach((key) => allowedKeys.add(key))
    return rows.filter((row) => getUserMatchKeys(row.user).some((key) => allowedKeys.has(key)) || (row.assignedKeys || []).some((key) => allowedKeys.has(key)))
  }
  return rows.filter((row) => getUserMatchKeys(row.user).some((key) => currentUserKeys.includes(key)) || (row.assignedKeys || []).some((key) => currentUserKeys.includes(key)))
}

function getLeadUserKey(lead = {}, users = []) {
  const ownerKeys = getLeadOwnerKeys(lead)
  const matchedUser = users.find((user) => getUserMatchKeys(user).some((key) => ownerKeys.includes(key)))
  if (matchedUser) return getUserId(matchedUser) || getUserName(matchedUser)
  return getLeadOwnerName(lead) || 'unassigned'
}

function getLeadUserName(lead = {}, users = []) {
  const ownerKeys = getLeadOwnerKeys(lead)
  const matchedUser = users.find((user) => getUserMatchKeys(user).some((key) => ownerKeys.includes(key)))
  return matchedUser ? getUserName(matchedUser) : getLeadOwnerName(lead)
}

function getOperationRowUserKeys(row = {}) {
  return [
    getUserId(row.user),
    row.userName,
    ...(row.assignedKeys || [])
  ].map(normalizeKey).filter(Boolean)
}

function getCompletedAnnualFilingCountForRow(row = {}) {
  const completedFilings = (row.annualReturns || []).filter((annualRow) => {
    return getAnnualTabCompletedCount(annualRow) >= 4 || isAnnualReturnDone(annualRow)
  }).length
  if (completedFilings) return completedFilings
  return (row.annualTotal && row.annualDone >= row.annualTotal) ? 1 : 0
}

function buildUserPerformanceCards(rows = [], users = [], currentUser = {}, leads = []) {
  const userRows = new Map()
  leads.forEach((lead) => {
    const key = getLeadUserKey(lead, users) || 'unassigned'
    const existing = userRows.get(key) || {
      id: key,
      name: getLeadUserName(lead, users) || 'Unassigned',
      done: 0,
      total: 0,
      pendingCompliance: 0,
      matchKeys: []
    }
    existing.total += 1
    existing.matchKeys = [...new Set([...existing.matchKeys, ...getLeadOwnerKeys(lead), normalizeKey(key), normalizeKey(existing.name)])]
    userRows.set(key, existing)
  })

  rows.forEach((row) => {
    const key = getUserId(row.user) || row.userName || 'unassigned'
    const existing = userRows.get(key) || {
      id: key,
      name: row.userName || 'Unassigned',
      done: 0,
      total: 0,
      pendingCompliance: 0,
      matchKeys: []
    }
    existing.done += getCompletedAnnualFilingCountForRow(row)
    if (!existing.total) existing.total += 1
    if (row.compliancePending) existing.pendingCompliance += 1
    existing.matchKeys = [...new Set([...existing.matchKeys, ...getOperationRowUserKeys(row), normalizeKey(key), normalizeKey(existing.name)])]
    userRows.set(key, existing)
  })

  const role = normalizeKey(currentUser?.role)
  if (role === 'manager' || role.includes('operation head') || adminRoles.includes(currentUser?.role)) {
    users.forEach((user) => {
      const id = getUserId(user)
      if (!id || userRows.has(id)) return
      if (adminRoles.includes(currentUser?.role) || userBelongsToManager(user, currentUser) || id === getUserId(currentUser)) {
        userRows.set(id, { id, name: getUserName(user), done: 0, total: 0, pendingCompliance: 0, matchKeys: getUserMatchKeys(user) })
      }
    })
  }

  return [...userRows.values()]
    .map((row) => {
      const safeDone = Math.min(row.done, row.total || row.done)
      const completion = percent(safeDone, row.total)
      return { ...row, done: safeDone, leadTotal: row.total, percent: completion, tone: getPerformanceTone(completion) }
    })
    .sort((a, b) => b.total - a.total || b.percent - a.percent)
}

function buildClientOwnershipAnalytics(rows = []) {
  const buckets = new Map()
  rows.forEach((row) => {
    const id = getUserId(row.user) || normalizeKey(row.userName) || 'unassigned'
    const name = row.userName || getUserName(row.user) || 'Unassigned'
    const bucket = buckets.get(id) || { id, name, total: 0, completed: 0, pending: 0, annualDone: 0, annualTotal: 0, dataComplete: 0, dataPartial: 0, dataMissing: 0, completenessTotal: 0, companies: [] }
    const completed = getCompletedAnnualFilingCountForRow(row) > 0
    const profile = getClientDataCompleteness(row.client || {})
    bucket.total += 1
    bucket.completed += completed ? 1 : 0
    bucket.pending += completed ? 0 : 1
    bucket.annualDone += Number(row.annualDone || 0)
    bucket.annualTotal += Number(row.annualTotal || 0)
    bucket.completenessTotal += profile.percent
    bucket.dataComplete += profile.status === 'complete' ? 1 : 0
    bucket.dataPartial += profile.status === 'partial' ? 1 : 0
    bucket.dataMissing += profile.status === 'missing' ? 1 : 0
    const clientUpdatedAt = row.client?.updatedAt || row.client?.data?.updatedAt || row.client?.createdAt
    const clientCreatedAt = row.client?.createdAt || row.client?.data?.createdAt || clientUpdatedAt
    const daysPending = getDaysSince(clientCreatedAt)
    const freshnessDays = getDaysSince(clientUpdatedAt)
    const stage = completed
      ? 'Completed'
      : row.compliancePending
        ? 'Compliance Review'
        : row.annualDone > 0
          ? 'Annual Processing'
          : profile.percent >= 75
            ? 'Data Review'
            : 'Data Capture'
    const approvalStatus = row.client?.adminControls?.approvalStatus || readClientData(row.client || {}).adminControls?.approvalStatus || 'Pending'
    const riskReasons = []
    if (profile.percent < 50) riskReasons.push('Data incomplete')
    if (!row.hasQuotation) riskReasons.push('Quotation missing')
    if (!row.hasPo) riskReasons.push('PO missing')
    if (row.annualDone > 0 && row.annualDone < row.annualTotal && daysPending > 30) riskReasons.push('Annual return overdue')
    if (normalizeKey(approvalStatus).includes('reject')) riskReasons.push('Approval rejected')
    if (freshnessDays > 30) riskReasons.push('No recent activity')
    const riskScore = Math.min(100, riskReasons.length * 18 + Math.min(30, Math.floor(daysPending / 15) * 5))
    const risk = riskScore >= 70 ? 'Critical' : riskScore >= 45 ? 'High Risk' : riskScore >= 20 ? 'Attention Required' : 'Healthy'
    const timeline = buildCompanyActivityTimeline(row, { clientCreatedAt, clientUpdatedAt, stage, approvalStatus })
    bucket.companies.push({
      id: row.id,
      name: row.companyName,
      category: row.category,
      stage,
      annualDone: row.annualDone,
      annualTotal: row.annualTotal,
      annualYear: row.annualYear,
      compliancePending: row.compliancePending,
      hasQuotation: row.hasQuotation,
      hasPo: row.hasPo,
      approvalStatus,
      workflowStatus: row.client?.workflowStatus || 'draft',
      clientCreatedAt,
      clientUpdatedAt,
      daysPending,
      freshnessDays,
      risk,
      riskScore,
      riskReasons,
      timeline,
      ...profile
    })
    buckets.set(id, bucket)
  })
  return [...buckets.values()]
    .map((item) => ({
      ...item,
      completion: percent(item.completed, item.total),
      workProgress: percent(item.annualDone, item.annualTotal)
      , averageDataFill: item.total ? Math.round(item.completenessTotal / item.total) : 0,
      overdue: item.companies.filter((company) => company.daysPending > 30 && company.stage !== 'Completed').length,
      stale: item.companies.filter((company) => company.freshnessDays > 30).length,
      highRisk: item.companies.filter((company) => ['High Risk', 'Critical'].includes(company.risk)).length,
      performanceScore: calculateEmployeePerformanceScore(item)
    }))
    .sort((a, b) => b.total - a.total || b.completion - a.completion)
}

function getDaysSince(value) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return 0
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))
}

function formatAnalyticsDate(value) {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime()) ? 'Not available' : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function calculateEmployeePerformanceScore(item = {}) {
  const total = item.total || 0
  const dataScore = total ? item.completenessTotal / total : 0
  const completionScore = percent(item.completed, total)
  const annualScore = percent(item.annualDone, item.annualTotal)
  const agingPenalty = total ? Math.min(100, (item.companies || []).reduce((sum, company) => sum + Math.min(company.daysPending, 60), 0) / total * 1.6) : 0
  const riskPenalty = total ? percent((item.companies || []).filter((company) => ['High Risk', 'Critical'].includes(company.risk)).length, total) : 0
  return Math.max(0, Math.min(100, Math.round(dataScore * .35 + completionScore * .3 + annualScore * .25 + (100 - agingPenalty) * .05 + (100 - riskPenalty) * .05)))
}

function buildCompanyActivityTimeline(row = {}, meta = {}) {
  const events = []
  if (meta.clientCreatedAt) events.push({ label: 'Client created', date: meta.clientCreatedAt, tone: 'blue' })
  if (row.userName) events.push({ label: `Assigned to ${row.userName}`, date: meta.clientCreatedAt, tone: 'teal' })
  if (meta.clientUpdatedAt && meta.clientUpdatedAt !== meta.clientCreatedAt) events.push({ label: 'Client data updated', date: meta.clientUpdatedAt, tone: 'teal' })
  const quoteDate = row.quotations?.map((quote) => quote.updatedAt || quote.createdAt || quote.quotationDate).filter(Boolean).sort().at(-1)
  if (quoteDate) events.push({ label: 'Quotation prepared', date: quoteDate, tone: 'violet' })
  if (row.hasPo) events.push({ label: 'Compliance PO available', date: meta.clientUpdatedAt, tone: 'green' })
  const annual = row.annualReturns?.slice().sort((a, b) => new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0)).at(-1)
  if (annual) events.push({ label: `Annual return ${row.annualDone}/${row.annualTotal}`, date: annual.updatedAt || annual.createdAt, tone: 'orange' })
  if (meta.stage === 'Compliance Review') events.push({ label: 'Submitted for compliance review', date: annual?.updatedAt, tone: 'orange' })
  if (meta.stage === 'Completed') events.push({ label: 'Processing completed', date: annual?.updatedAt || meta.clientUpdatedAt, tone: 'green' })
  return events.filter((event) => event.date).sort((a, b) => new Date(a.date) - new Date(b.date))
}

const CLIENT_DATA_CHECKS = [
  { label: 'Legal name', paths: ['basic.clientLegalName', 'basic.tradeName', 'clientName', 'companyName'] },
  { label: 'PIBO category', paths: ['basic.piboCategory', 'piboCategory'] },
  { label: 'EPR category', paths: ['basic.eprCategory', 'eprCategory'] },
  { label: 'GST number', paths: ['basic.gstNumber', 'validation.gstNumber', 'gstNumber'] },
  { label: 'PAN number', paths: ['basic.panNumber', 'validation.panNumber', 'panNumber'] },
  { label: 'Registered address', paths: ['basic.registeredAddress', 'address.registeredAddress', 'registeredAddress.addressLine1', 'addressLine1'] },
  { label: 'State', paths: ['basic.state', 'address.state', 'registeredAddress.state', 'state'] },
  { label: 'City', paths: ['basic.city', 'address.city', 'registeredAddress.city', 'city'] },
  { label: 'Contact person', paths: ['contact.contactPerson', 'basic.authorisedPersonName', 'contactPerson'] },
  { label: 'Email', paths: ['contact.email', 'contact.emails', 'basic.authorisedPersonEmail', 'email', 'emails'] },
  { label: 'Mobile', paths: ['contact.mobileNo1', 'contact.mobile', 'basic.otpMobile', 'mobileNo1', 'mobile'] },
  { label: 'CPCB registration', paths: ['cpcb.registrationNumber', 'basic.cpcbRegistrationNumber', 'data.registrationNumber'] }
]

function readPath(source, path) {
  return path.split('.').reduce((value, key) => value?.[key], source)
}

function hasClientValue(value) {
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === 'object') return Object.values(value).some(hasClientValue)
  return value !== undefined && value !== null && String(value).trim() !== '' && String(value).trim() !== '-'
}

function getClientDataCompleteness(client = {}) {
  const data = readClientData(client)
  const checks = CLIENT_DATA_CHECKS.map((check) => ({ ...check, filled: check.paths.some((path) => hasClientValue(readPath(data, path)) || hasClientValue(readPath(client, path))) }))
  const filled = checks.filter((item) => item.filled).length
  const total = checks.length
  const completeness = percent(filled, total)
  return {
    percent: completeness,
    filled,
    totalFields: total,
    status: completeness >= 75 ? 'complete' : completeness >= 30 ? 'partial' : 'missing',
    missingFields: checks.filter((item) => !item.filled).map((item) => item.label)
    , filledFields: checks.filter((item) => item.filled).map((item) => item.label)
  }
}

function getPiboTypes(value = '') {
  const category = normalizeKey(value)
  const types = []
  if (category.includes('producer')) types.push('Producer')
  if (category.includes('importer')) types.push('Importer')
  if (category.includes('brand owner') || category.includes('brandowner')) types.push('Brand Owner')
  return types.length ? types : ['Other / Unassigned']
}

function ClientOwnershipAnalyticsModal({ rows = [], onClose }) {
  const [selectedId, setSelectedId] = useState('all')
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [stageFilter, setStageFilter] = useState('all')
  const [riskFilter, setRiskFilter] = useState('all')
  const [ageFilter, setAgeFilter] = useState('all')
  const [dataFilter, setDataFilter] = useState('all')
  const [piboFilter, setPiboFilter] = useState('all')
  const [compareA, setCompareA] = useState('')
  const [compareB, setCompareB] = useState('')
  const analytics = useMemo(() => buildClientOwnershipAnalytics(rows), [rows])
  const selected = selectedId === 'all' ? null : analytics.find((item) => String(item.id) === String(selectedId))
  const allCompanies = useMemo(() => analytics.flatMap((item) => item.companies.map((company) => ({ ...company, assignee: item.name, assigneeId: item.id }))), [analytics])
  const filteredCompanies = useMemo(() => allCompanies.filter((company) => {
    const selectedMatch = selectedId === 'all' || String(company.assigneeId) === String(selectedId)
    const stageMatch = stageFilter === 'all' || company.stage === stageFilter
    const riskMatch = riskFilter === 'all' || company.risk === riskFilter
    const dataMatch = dataFilter === 'all' || company.status === dataFilter
    const ageMatch = ageFilter === 'all' || (ageFilter === '0-7' && company.daysPending <= 7) || (ageFilter === '8-15' && company.daysPending >= 8 && company.daysPending <= 15) || (ageFilter === '16-30' && company.daysPending >= 16 && company.daysPending <= 30) || (ageFilter === '30+' && company.daysPending > 30)
    const piboMatch = piboFilter === 'all' || getPiboTypes(company.category).includes(piboFilter)
    return selectedMatch && stageMatch && riskMatch && dataMatch && ageMatch && piboMatch
  }), [ageFilter, allCompanies, dataFilter, piboFilter, riskFilter, selectedId, stageFilter])
  const total = selected?.total ?? analytics.reduce((sum, item) => sum + item.total, 0)
  const completed = selected?.completed ?? analytics.reduce((sum, item) => sum + item.completed, 0)
  const pending = selected?.pending ?? analytics.reduce((sum, item) => sum + item.pending, 0)
  const rate = percent(completed, total)
  const dataComplete = selected?.dataComplete ?? analytics.reduce((sum, item) => sum + item.dataComplete, 0)
  const dataPartial = selected?.dataPartial ?? analytics.reduce((sum, item) => sum + item.dataPartial, 0)
  const dataMissing = selected?.dataMissing ?? analytics.reduce((sum, item) => sum + item.dataMissing, 0)
  const averageDataFill = selected?.averageDataFill ?? (total ? Math.round(analytics.reduce((sum, item) => sum + item.completenessTotal, 0) / total) : 0)
  const donutRows = [{ name: 'Completed', value: completed, color: '#12a67d' }, { name: 'Pending', value: pending, color: '#f59e0b' }].filter((item) => item.value)
  const chartRows = (selected ? [selected] : analytics).slice(0, 10)
  const agingBuckets = [
    { label: '0–7 days', value: filteredCompanies.filter((item) => item.daysPending <= 7).length, tone: 'good' },
    { label: '8–15 days', value: filteredCompanies.filter((item) => item.daysPending >= 8 && item.daysPending <= 15).length, tone: 'blue' },
    { label: '16–30 days', value: filteredCompanies.filter((item) => item.daysPending >= 16 && item.daysPending <= 30).length, tone: 'warn' },
    { label: '30+ days', value: filteredCompanies.filter((item) => item.daysPending > 30).length, tone: 'risk' }
  ]
  const missingFieldRows = CLIENT_DATA_CHECKS.map((check) => ({ name: check.label, count: filteredCompanies.filter((company) => company.missingFields.includes(check.label)).length })).sort((a, b) => b.count - a.count).slice(0, 5)
  const funnelRows = [
    { label: 'Total Clients', value: filteredCompanies.length },
    { label: 'Data Filled', value: filteredCompanies.filter((item) => item.percent >= 75).length },
    { label: 'Quotation Ready', value: filteredCompanies.filter((item) => item.hasQuotation).length },
    { label: 'PO Received', value: filteredCompanies.filter((item) => item.hasPo).length },
    { label: 'Annual Started', value: filteredCompanies.filter((item) => item.annualDone > 0).length },
    { label: 'Completed', value: filteredCompanies.filter((item) => item.stage === 'Completed').length }
  ]
  const comparison = [analytics.find((item) => String(item.id) === String(compareA)), analytics.find((item) => String(item.id) === String(compareB))].filter(Boolean)
  const rankedEmployees = analytics.slice().sort((a, b) => b.performanceScore - a.performanceScore || b.completed - a.completed || b.averageDataFill - a.averageDataFill || a.name.localeCompare(b.name))
  const piboSourceCompanies = selected ? allCompanies.filter((company) => String(company.assigneeId) === String(selected.id)) : allCompanies
  const piboRows = ['Producer', 'Importer', 'Brand Owner', 'Other / Unassigned'].map((type) => {
    const companies = piboSourceCompanies.filter((company) => getPiboTypes(company.category).includes(type))
    const completedCount = companies.filter((company) => company.stage === 'Completed').length
    return {
      type,
      total: companies.length,
      completed: completedCount,
      pending: Math.max(0, companies.length - completedCount),
      dataFill: companies.length ? Math.round(companies.reduce((sum, company) => sum + company.percent, 0) / companies.length) : 0,
      annualProgress: companies.length ? Math.round(companies.reduce((sum, company) => sum + percent(company.annualDone, company.annualTotal), 0) / companies.length) : 0
    }
  }).filter((item) => item.total || item.type !== 'Other / Unassigned')

  function exportManagementReport() {
    const rowsToExport = filteredCompanies.map((company) => ({ Assignee: company.assignee, Company: company.name, Category: company.category, Stage: company.stage, Risk: company.risk, 'Days Pending': company.daysPending, 'Data Filled %': company.percent, 'Filled Fields': company.filledFields.join(', '), 'Missing Fields': company.missingFields.join(', '), Quotation: company.hasQuotation ? 'Available' : 'Missing', 'Compliance PO': company.hasPo ? 'Available' : 'Missing', 'Annual Progress': `${company.annualDone}/${company.annualTotal}`, Approval: company.approvalStatus, 'Last Updated': formatAnalyticsDate(company.clientUpdatedAt) }))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rowsToExport), 'Client Analytics')
    XLSX.writeFile(workbook, `client-analytics-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <motion.div className="client-analytics-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <motion.section className="client-analytics-modal" initial={{ opacity: 0, y: 24, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: .98 }} transition={{ type: 'spring', stiffness: 360, damping: 30 }}>
        <header className="client-analytics-head">
          <div><span>Operations intelligence</span><h2>Client Ownership Analytics</h2><p>Assignee-wise workload, completion and pending client analysis</p></div>
          <div className="client-analytics-head-actions">
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} aria-label="Filter assignee"><option value="all">All assignees</option>{analytics.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <button type="button" onClick={onClose} aria-label="Close analytics"><X className="h-5 w-5" /></button>
          </div>
        </header>
        <div className="client-analytics-body">
          <div className="client-analytics-toolbar"><div><select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="all">All stages</option>{['Data Capture', 'Data Review', 'Annual Processing', 'Compliance Review', 'Completed'].map((value) => <option key={value}>{value}</option>)}</select><select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}><option value="all">All risks</option>{['Healthy', 'Attention Required', 'High Risk', 'Critical'].map((value) => <option key={value}>{value}</option>)}</select><select value={dataFilter} onChange={(event) => setDataFilter(event.target.value)}><option value="all">All data quality</option><option value="complete">Fully filled</option><option value="partial">Partial</option><option value="missing">Not filled</option></select><select value={piboFilter} onChange={(event) => setPiboFilter(event.target.value)}><option value="all">All PIBO types</option><option>Producer</option><option>Importer</option><option>Brand Owner</option><option>Other / Unassigned</option></select><select value={ageFilter} onChange={(event) => setAgeFilter(event.target.value)}><option value="all">All aging</option><option value="0-7">0–7 days</option><option value="8-15">8–15 days</option><option value="16-30">16–30 days</option><option value="30+">30+ days</option></select></div><div><button type="button" onClick={exportManagementReport}>Export Excel</button><button type="button" onClick={() => window.print()}>Print / PDF</button></div></div>
          <div className="client-analytics-kpis">
            <article><span>Total Clients</span><strong>{total}</strong><small>{selected?.name || `${analytics.length} assignees`}</small></article>
            <article className="done"><span>Completed</span><strong>{completed}</strong><small>{rate}% completion rate</small></article>
            <article className="pending"><span>Pending</span><strong>{pending}</strong><small>{percent(pending, total)}% needs action</small></article>
            <article className="rate"><span>Performance</span><strong>{rate}%</strong><small>{rate >= 75 ? 'Healthy delivery' : rate >= 45 ? 'Needs attention' : 'Critical backlog'}</small></article>
          </div>
          <div className="client-data-quality-strip">
            <div><span>Company data quality</span><strong>{averageDataFill}%</strong><small>Average fields filled</small></div>
            <div className="complete"><span>Fully filled</span><strong>{dataComplete}</strong><small>75% or more data</small></div>
            <div className="partial"><span>Partially filled</span><strong>{dataPartial}</strong><small>30–74% data</small></div>
            <div className="missing"><span>Not filled</span><strong>{dataMissing}</strong><small>Less than 30% data</small></div>
          </div>
          <article className="pibo-assignee-analytics"><header><div><span>PIBO portfolio intelligence</span><h3>{selected?.name || 'Operations team'} — category-wise completion</h3></div><small>Click a category to filter companies</small></header><div className="pibo-assignee-grid">{piboRows.map((item) => <button type="button" className={`pibo-assignee-card ${normalizeKey(item.type).replace(/\s+/g, '-')} ${piboFilter === item.type ? 'selected' : ''}`} key={item.type} onClick={() => setPiboFilter(piboFilter === item.type ? 'all' : item.type)}><header><span>{item.type}</span><strong>{item.total}</strong></header><div className="pibo-counts"><p><b>{item.completed}</b><span>Completed</span></p><p><b>{item.pending}</b><span>Pending</span></p></div><div className="pibo-progress"><span>Data fill <b>{item.dataFill}%</b></span><i><em style={{ width: `${item.dataFill}%` }} /></i></div><div className="pibo-progress annual"><span>Annual progress <b>{item.annualProgress}%</b></span><i><em style={{ width: `${item.annualProgress}%` }} /></i></div></button>)}</div></article>
          <div className="client-intelligence-grid"><article className="aging-panel"><header><div><span>Aging & SLA</span><h3>Pending company aging</h3></div><b>{filteredCompanies.filter((item) => item.daysPending > 30).length} breached</b></header><div>{agingBuckets.map((item) => <section className={item.tone} key={item.label}><strong>{item.value}</strong><span>{item.label}</span><i style={{ width: `${percent(item.value, Math.max(filteredCompanies.length, 1))}%` }} /></section>)}</div><footer>Oldest: {filteredCompanies.slice().sort((a, b) => b.daysPending - a.daysPending)[0]?.name || 'No company'} · {filteredCompanies.slice().sort((a, b) => b.daysPending - a.daysPending)[0]?.daysPending || 0} days</footer></article><article className="data-gap-panel"><header><div><span>Missing data intelligence</span><h3>Top 5 data gaps</h3></div></header><div>{missingFieldRows.map((item) => <section key={item.name}><span>{item.name}</span><div><i style={{ width: `${percent(item.count, Math.max(filteredCompanies.length, 1))}%` }} /></div><strong>{item.count}</strong><small>{percent(item.count, Math.max(filteredCompanies.length, 1))}%</small></section>)}</div></article></div>
          <article className="client-funnel-panel"><header><div><span>Stage funnel</span><h3>Client readiness and delivery conversion</h3></div><small>Applied filters: {filteredCompanies.length} companies</small></header><div>{funnelRows.map((item, index) => <section key={item.label} style={{ '--funnel-width': `${Math.max(28, percent(item.value, Math.max(funnelRows[0].value, 1)))}%` }}><div><b>{item.value}</b><span>{item.label}</span></div>{index < funnelRows.length - 1 && <small>{percent(funnelRows[index + 1].value, Math.max(item.value, 1))}% move forward</small>}</section>)}</div></article>
          <div className="employee-intelligence"><article><header><div><span>Employee score</span><h3>Weighted performance</h3></div><small>Data 35% · Completion 30% · Annual 25% · Risk/Aging 10%</small></header><div>{analytics.slice(0, 8).map((item) => <section key={item.id}><strong>{item.name}</strong><div><i style={{ width: `${item.performanceScore}%` }} /></div><b>{item.performanceScore}</b><small>{item.highRisk} risk · {item.overdue} overdue</small></section>)}</div></article><article><header><div><span>Workload balance</span><h3>Capacity recommendation</h3></div></header><div className="workload-cards">{analytics.slice(0, 6).map((item) => { const average = analytics.length ? analytics.reduce((sum, row) => sum + row.total, 0) / analytics.length : 0; const load = item.total > average * 1.25 ? 'Overloaded' : item.total < average * .7 ? 'Under-utilized' : 'Balanced'; return <section className={normalizeKey(load)} key={item.id}><strong>{item.name}</strong><b>{item.total} clients</b><span>{load}</span></section> })}</div></article></div>
          <article className="employee-ranking"><header><div><span>Performance leaderboard</span><h3>Operations employee ranking</h3></div><small>Score → completed clients → data quality</small></header>{rankedEmployees.length ? <><div className="ranking-podium">{rankedEmployees.slice(0, 3).map((item, index) => <section className={`rank-${index + 1}`} key={item.id}><div className="rank-medal"><span>{index === 0 ? '★' : index + 1}</span></div><em>Rank {index + 1}</em><h4>{item.name}</h4><strong>{item.performanceScore}<small>/100</small></strong><div><span>{item.total} clients</span><span>{item.completed} completed</span><span>{item.averageDataFill}% data</span></div><i><b style={{ width: `${item.performanceScore}%` }} /></i></section>)}</div>{rankedEmployees.length > 3 && <div className="ranking-list">{rankedEmployees.slice(3).map((item, index) => <section key={item.id}><b>{index + 4}</b><div><strong>{item.name}</strong><span>{item.completed}/{item.total} completed · {item.averageDataFill}% data filled</span></div><div className="ranking-list-meter"><i style={{ width: `${item.performanceScore}%` }} /></div><em>{item.performanceScore}</em><small>{item.highRisk ? `${item.highRisk} risk` : 'Healthy'}</small></section>)}</div>}</> : <p className="comparison-empty">No employee performance data available.</p>}</article>
          <article className="employee-comparison"><header><div><span>Comparison mode</span><h3>Compare two employees</h3></div><div><select value={compareA} onChange={(event) => setCompareA(event.target.value)}><option value="">Employee A</option>{analytics.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={compareB} onChange={(event) => setCompareB(event.target.value)}><option value="">Employee B</option>{analytics.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div></header>{comparison.length ? <div>{comparison.map((item) => <section key={item.id}><h4>{item.name}</h4><p><span>Clients</span><b>{item.total}</b></p><p><span>Data filled</span><b>{item.averageDataFill}%</b></p><p><span>Completed</span><b>{item.completed}</b></p><p><span>Overdue</span><b>{item.overdue}</b></p><p><span>Score</span><b>{item.performanceScore}/100</b></p></section>)}</div> : <p className="comparison-empty">Select employees to compare performance.</p>}</article>
          <div className="client-analytics-charts">
            <article className="client-analytics-chart-card wide"><header><div><span>Workload comparison</span><h3>Clients by assignee</h3></div><b>Top {chartRows.length}</b></header><div className="client-analytics-bar"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartRows} margin={{ top: 12, right: 12, left: -18, bottom: 2 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7eeec" /><XAxis dataKey="name" tick={{ fontSize: 10, fill: '#667085', fontWeight: 700 }} axisLine={false} tickLine={false} interval={0} /><YAxis tick={{ fontSize: 10, fill: '#98a2b3' }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="completed" name="Completed" stackId="clients" fill="#12a67d" radius={[0, 0, 4, 4]} /><Bar dataKey="pending" name="Pending" stackId="clients" fill="#f4b544" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></article>
            <article className="client-analytics-chart-card"><header><div><span>Portfolio health</span><h3>Completion split</h3></div></header><div className="client-analytics-donut"><ResponsiveContainer width="100%" height="100%"><RechartsPieChart><Pie data={donutRows.length ? donutRows : [{ name: 'No data', value: 1, color: '#e5e7eb' }]} dataKey="value" nameKey="name" innerRadius={62} outerRadius={84} paddingAngle={4} stroke="#fff" strokeWidth={4}>{(donutRows.length ? donutRows : [{ color: '#e5e7eb' }]).map((item) => <Cell key={item.name || item.color} fill={item.color} />)}</Pie><Tooltip /></RechartsPieChart></ResponsiveContainer><div><strong>{rate}%</strong><span>complete</span></div></div><footer><span><i className="done" />Completed {completed}</span><span><i className="pending" />Pending {pending}</span></footer></article>
          </div>
          <article className="client-analytics-matrix"><header><div><span>Assignee performance matrix</span><h3>Who has how many companies and how much data is filled</h3></div><small>Click an assignee for company-level details</small></header><div className="client-analytics-table-wrap"><table><thead><tr><th>Assignee</th><th>Companies</th><th>Data filled</th><th>Full / Partial / Empty</th><th>Annual progress</th><th>Completion</th></tr></thead><tbody>{analytics.map((item) => <tr key={item.id} onClick={() => setSelectedId(String(item.id))}><td><b>{item.name}</b></td><td>{item.total}</td><td><div className="client-progress data"><i style={{ width: `${item.averageDataFill}%` }} /></div><small>{item.averageDataFill}%</small></td><td><span className="quality-count good">{item.dataComplete}</span><span className="quality-count warn">{item.dataPartial}</span><span className="quality-count risk">{item.dataMissing}</span></td><td><div className="client-progress"><i style={{ width: `${item.workProgress}%` }} /></div><small>{item.workProgress}%</small></td><td><strong className={item.completion >= 75 ? 'good' : item.completion >= 45 ? 'warn' : 'risk'}>{item.completion}%</strong></td></tr>)}</tbody></table></div></article>
          {selected && <article className="company-data-drilldown"><header><div><span>Company drill-down</span><h3>{selected.name}: {filteredCompanies.length} visible companies</h3></div><button type="button" onClick={() => { setSelectedId('all'); setSelectedCompany(null) }}>View all assignees</button></header><div className="company-data-grid">{filteredCompanies.map((company) => <button type="button" className={`company-data-card ${company.status}`} key={company.id} onClick={() => setSelectedCompany(company)}><div><strong>{company.name}</strong><span>{company.category || 'Unassigned category'}</span></div><b>{company.percent}%</b><div className="company-data-meter"><i style={{ width: `${company.percent}%` }} /></div><footer><span>{company.filled}/{company.totalFields} critical fields</span><em>{company.status === 'complete' ? 'Data filled' : company.status === 'partial' ? 'Partial data' : 'Not filled'}</em></footer>{company.missingFields.length > 0 && <small>Missing: {company.missingFields.slice(0, 3).join(', ')}{company.missingFields.length > 3 ? ` +${company.missingFields.length - 3}` : ''}</small>}<mark>View full analysis →</mark></button>)}</div></article>}
          <AnimatePresence>{selectedCompany && <CompanyDataAnalysis company={selectedCompany} onClose={() => setSelectedCompany(null)} />}</AnimatePresence>
        </div>
      </motion.section>
    </motion.div>
  )
}

function CompanyDataAnalysis({ company, onClose }) {
  const navigate = useNavigate()
  const stages = ['Data Capture', 'Data Review', 'Annual Processing', 'Compliance Review', 'Completed']
  const activeIndex = Math.max(0, stages.indexOf(company.stage))
  const nextAction = company.missingFields.length
    ? `Fill ${company.missingFields.slice(0, 2).join(' and ')}`
    : !company.hasQuotation
      ? 'Create and attach quotation'
      : !company.hasPo
        ? 'Add compliance PO details'
        : company.annualDone < company.annualTotal
          ? 'Complete remaining annual return sections'
          : company.compliancePending
            ? 'Complete compliance review'
            : 'No immediate action required'
  return (
    <motion.div className="company-analysis-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <motion.article className="company-analysis-panel" initial={{ opacity: 0, y: 18, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: .98 }}>
        <header><div><span>Company data intelligence</span><h2>{company.name}</h2><p>{company.category} · FY {company.annualYear || 'Not selected'}</p></div><button type="button" onClick={onClose}><X className="h-5 w-5" /></button></header>
        <div className="company-analysis-body">
          <div className="company-analysis-summary"><div><span>Data filled</span><strong>{company.percent}%</strong><small>{company.filled}/{company.totalFields} critical fields</small></div><div><span>Current stage</span><strong className="stage">{company.stage}</strong><small>Workflow: {company.workflowStatus}</small></div><div><span>Annual progress</span><strong>{company.annualDone}/{company.annualTotal}</strong><small>{percent(company.annualDone, company.annualTotal)}% processing</small></div><div><span>Approval</span><strong className="stage">{company.approvalStatus}</strong><small>{company.compliancePending ? 'Waiting compliance review' : 'No compliance hold'}</small></div></div>
          <section className="company-stage-flow">{stages.map((stage, index) => <div className={`${index < activeIndex ? 'done' : index === activeIndex ? 'active' : ''}`} key={stage}><i>{index < activeIndex ? '✓' : index + 1}</i><span>{stage}</span></div>)}</section>
          <div className="company-analysis-grid"><section><header><span>Filled data</span><b>{company.filled}</b></header><div className="field-chip-grid">{company.filledFields.map((field) => <em className="filled" key={field}><CheckCircle2 className="h-3.5 w-3.5" />{field}</em>)}</div></section><section><header><span>Missing data</span><b>{company.missingFields.length}</b></header><div className="field-chip-grid">{company.missingFields.length ? company.missingFields.map((field) => <em className="missing" key={field}><ShieldAlert className="h-3.5 w-3.5" />{field}</em>) : <em className="filled"><CheckCircle2 className="h-3.5 w-3.5" />All critical fields filled</em>}</div></section></div>
          <div className="company-readiness"><div><span>Quotation</span><strong className={company.hasQuotation ? 'yes' : 'no'}>{company.hasQuotation ? 'Available' : 'Missing'}</strong></div><div><span>Compliance PO</span><strong className={company.hasPo ? 'yes' : 'no'}>{company.hasPo ? 'Available' : 'Missing'}</strong></div><div><span>Recommended next action</span><strong>{nextAction}</strong></div></div>
          <div className="company-freshness-row"><div><span>Created</span><strong>{formatAnalyticsDate(company.clientCreatedAt)}</strong><small>{company.daysPending} days in pipeline</small></div><div className={company.freshnessDays > 30 ? 'stale' : ''}><span>Last updated</span><strong>{formatAnalyticsDate(company.clientUpdatedAt)}</strong><small>{company.freshnessDays > 30 ? `Stale for ${company.freshnessDays} days` : `${company.freshnessDays} days ago`}</small></div><div className={`risk-${normalizeKey(company.risk).replace(/\s+/g, '-')}`}><span>Risk classification</span><strong>{company.risk}</strong><small>{company.riskReasons.join(', ') || 'No material risks'}</small></div></div>
          <section className="company-activity"><header><span>Company activity timeline</span><b>{company.timeline.length} events</b></header><div>{company.timeline.map((event, index) => <article key={`${event.label}-${index}`}><i className={event.tone} /><div><strong>{event.label}</strong><small>{formatAnalyticsDate(event.date)}</small></div></article>)}</div></section>
          <section className="company-action-centre"><header><span>Action centre</span><small>Continue work without leaving the analysis context</small></header><div><button type="button" onClick={() => navigate('/sales/client-master')}>Open Client Master</button><button type="button" onClick={() => navigate(`/sales/client-data-processing/${encodeURIComponent(company.id)}/${encodeURIComponent(company.annualYear || '2025-26')}`)}>Open Annual Return</button><button type="button" onClick={() => navigate('/sales/quotations?mode=add')}>Create Quotation</button><button type="button" onClick={() => navigate('/calendar')}>Open Calendar</button><button type="button" onClick={() => navigate('/calendar')}>Add Follow-up</button><button type="button" onClick={() => window.print()}>Print Summary</button></div></section>
        </div>
      </motion.article>
    </motion.div>
  )
}

function buildManagerPerformanceCards(users = [], rows = []) {
  return buildManagerCards(users, rows).map((row) => ({ ...row, tone: getPerformanceTone(row.percent) }))
}

function PerformanceCard({ item, type = 'user', selected = false, onClick }) {
  const isUserPerformance = type === 'user'
  const content = (
    <>
      <div>
        <span>{type === 'manager' ? 'Manager' : 'User'}</span>
        <strong>{item.name}</strong>
        <p>{item.done}/{item.total} {isUserPerformance ? 'annual returns completed' : 'filings completed'}</p>
      </div>
      <div className="operations-performance-meter">
        <b>{item.percent}%</b>
        <i><em style={{ width: `${item.percent}%` }} /></i>
      </div>
      {item.pendingCompliance ? <small>{item.pendingCompliance} waiting compliance approval</small> : <small>{isUserPerformance ? 'Lead to annual return progress' : 'Assigned filing progress'}</small>}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`operations-performance-card operations-performance-clickable operations-performance-${item.tone} ${selected ? 'operations-performance-selected' : ''}`}
      >
        {content}
      </button>
    )
  }

  return (
    <article className={`operations-performance-card operations-performance-${item.tone}`}>
      {content}
    </article>
  )
}

function buildControlSignals({ analytics, clients = [], quotations = [], pendingClients = [], pendingQuotations = [], activeUsers = 0 }) {
  return [
    {
      label: 'Live client control',
      value: `${analytics.clientCompletion}%`,
      detail: `${analytics.liveClients}/${clients.length} clients live`,
      tone: analytics.clientCompletion >= 70 ? 'good' : analytics.clientCompletion >= 35 ? 'warn' : 'risk'
    },
    {
      label: 'Approval pressure',
      value: analytics.pendingTotal,
      detail: `${pendingClients.length} client and ${pendingQuotations.length} quotation approvals`,
      tone: analytics.pendingTotal ? 'risk' : 'good'
    },
    {
      label: 'Filing closure',
      value: `${analytics.annualCompletion}%`,
      detail: `${analytics.annualFiled} filed, ${analytics.annualDraft} drafts`,
      tone: analytics.annualCompletion >= 75 ? 'good' : analytics.annualDraft ? 'warn' : 'good'
    },
    {
      label: 'Team capacity',
      value: activeUsers,
      detail: `${activeUsers} active operations users`,
      tone: activeUsers ? 'good' : 'warn'
    },
    {
      label: 'Quote movement',
      value: percent(analytics.sentQuotes, quotations.length) + '%',
      detail: `${analytics.sentQuotes} sent or approved`,
      tone: quotations.length && analytics.sentQuotes === 0 ? 'warn' : 'good'
    }
  ]
}

function ActionTile({ title, value, note, icon: Icon, tone, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`operations-action-tile operations-action-${tone}`}>
      <span><Icon className="h-5 w-5" /></span>
      <div>
        <strong>{value}</strong>
        <p>{title}</p>
        <small>{note}</small>
      </div>
      <ArrowUpRight className="operations-action-arrow h-4 w-4" />
    </button>
  )
}

function OperationsScore({ score, pendingTotal }) {
  return (
    <div className="operations-score-card">
      <div className="operations-score-ring" style={{ '--score': `${score}%` }}>
        <span>{score}</span>
      </div>
      <div>
        <p>Operations Score</p>
        <strong>{score >= 80 ? 'Strong control' : score >= 55 ? 'Needs focus' : 'Needs attention'}</strong>
        <small>{pendingTotal ? `${pendingTotal} approval items need action` : 'Approval queue is clear'}</small>
      </div>
      <Target className="h-5 w-5" />
    </div>
  )
}

function OperationsMetric({ metric }) {
  const Icon = metric.icon
  return (
    <article className={`operations-metric operations-metric-${metric.tone}`}>
      <span><Icon className="h-5 w-5" /></span>
      <div>
        <p>{metric.label}</p>
        <strong>{metric.value}</strong>
        <small>{metric.note}</small>
      </div>
    </article>
  )
}

function PanelHeader({ icon: Icon, title, note }) {
  return (
    <div className="operations-panel-head">
      <div>
        <span><Icon className="h-4 w-4" /></span>
        <strong>{title}</strong>
      </div>
      <p>{note}</p>
    </div>
  )
}

function AdminDashboardSkeleton() {
  return (
    <main className="min-h-screen bg-[#eef7f5] pt-16 text-slate-900">
      <section className="admin-dashboard-skeleton operations-dashboard" aria-label="Loading dashboard">
        <div className="operations-hero admin-skeleton-hero">
          <span className="admin-skeleton-block admin-skeleton-icon" />
          <div className="admin-skeleton-copy">
            <i className="admin-skeleton-line admin-skeleton-line-lg" />
            <i className="admin-skeleton-line admin-skeleton-line-sm" />
          </div>
          <span className="admin-skeleton-block admin-skeleton-button" />
        </div>

        <section className="operations-panel operations-snapshot-panel">
          <div className="admin-skeleton-panel-head">
            <i className="admin-skeleton-block" />
            <div>
              <span className="admin-skeleton-line admin-skeleton-line-md" />
              <span className="admin-skeleton-line admin-skeleton-line-sm" />
            </div>
          </div>
          <div className="operations-snapshot-grid">
            {[0, 1, 2].map((item) => (
              <article key={item} className="operations-kpi-card admin-skeleton-card">
                <i className="admin-skeleton-line admin-skeleton-line-sm" />
                <strong className="admin-skeleton-number" />
                <span className="admin-skeleton-meter" />
              </article>
            ))}
          </div>
        </section>

        <div className="operations-dashboard-row operations-dashboard-row-followup">
          <section className="dashboard-followup-flow admin-skeleton-flow">
            <div className="followup-flow-head">
              <div>
                <span className="admin-skeleton-line admin-skeleton-line-sm" />
                <strong className="admin-skeleton-line admin-skeleton-line-lg" />
              </div>
              <span className="admin-skeleton-block admin-skeleton-button" />
            </div>
            <div className="followup-flow-table admin-skeleton-timeline">
              <div className="followup-flow-month">
                <span className="admin-skeleton-line admin-skeleton-line-xs" />
                <strong className="admin-skeleton-line admin-skeleton-line-md" />
                <span className="admin-skeleton-line admin-skeleton-line-xs" />
              </div>
              <div className="followup-flow-head-row">
                {['wbs', 'task', 'assigned', 'done', 'timeline'].map((item) => <span key={item} className="admin-skeleton-line" />)}
              </div>
              <div className="followup-flow-body">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="admin-skeleton-row">
                    <span />
                    <strong />
                    <em />
                    <i />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <section className="operations-panel operations-pibo-chart-panel admin-skeleton-pibo">
          <div className="admin-skeleton-panel-head">
            <i className="admin-skeleton-block" />
            <div>
              <span className="admin-skeleton-line admin-skeleton-line-md" />
              <span className="admin-skeleton-line admin-skeleton-line-sm" />
            </div>
          </div>
          <div className="operations-pibo-chart-layout">
            <div className="operations-pibo-bar-card-modern admin-skeleton-chart-card">
              <div className="operations-pibo-modern-chart">
                {[0, 1, 2, 3, 4, 5].map((item) => <span key={item} style={{ width: `${36 + item * 9}%` }} />)}
              </div>
              <div className="operations-pibo-bar-legend">
                {[0, 1, 2, 3, 4, 5].map((item) => <span key={item} className="admin-skeleton-pill" />)}
              </div>
            </div>
            <div className="operations-lead-chart-card operations-lead-pie-card-featured admin-skeleton-chart-card">
              <div className="admin-skeleton-donut" />
              <div className="admin-skeleton-pill-list">
                <span />
                <span />
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}

function WorkflowFunnel({ rows }) {
  return (
    <div className="operations-funnel">
      {rows.map((row) => (
        <div key={row.label} className={`operations-funnel-row operations-funnel-${row.tone}`}>
          <div>
            <strong>{row.label}</strong>
            <span>{row.note}</span>
          </div>
          <div className="operations-funnel-track"><i style={{ width: `${row.percent}%` }} /></div>
          <b>{row.value}</b>
        </div>
      ))}
    </div>
  )
}

function AttentionItem({ item }) {
  return (
    <div className={`operations-attention-item operations-attention-${item.severity}`}>
      <span>{item.severity === 'good' ? <CheckCircle2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}</span>
      <div>
        <strong>{item.title}</strong>
        <p>{item.detail}</p>
      </div>
      <b>{item.value}</b>
    </div>
  )
}

function ProgressCard({ label, value, caption }) {
  return (
    <div className="operations-progress-card">
      <div className="operations-progress-ring" style={{ '--value': `${Math.min(100, Math.max(0, value))}%` }}>
        <span>{value}%</span>
      </div>
      <div>
        <strong>{label}</strong>
        <p>{caption}</p>
      </div>
    </div>
  )
}

function DataBar({ label, value, total }) {
  const percent = total ? Math.round((value / total) * 100) : 0
  return (
    <div className="operations-data-bar">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <i><b style={{ width: `${percent}%` }} /></i>
    </div>
  )
}

function QueueCard({ label, value, icon: Icon }) {
  return (
    <div className="operations-queue-card">
      <Icon className="h-5 w-5" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function EmptyOperationState({ label }) {
  return <div className="operations-empty">{label}</div>
}

function OperationsChartStudio({ workflowRows = [], score = 0 }) {
  const workflowPeak = Math.max(...workflowRows.map((row) => row.value), 1)

  return (
    <motion.section
      className="operations-chart-studio"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay: 0.08 }}
    >
      <div className="operations-chart-studio-head">
        <div>
          <span>Command Analytics</span>
          <strong>Operations performance map</strong>
        </div>
        <p>{score}% operational readiness</p>
      </div>

      <div className="operations-chart-studio-grid">
        <article className="operations-planner-card">
          <div className="operations-chart-card-head">
            <div><Activity className="h-4 w-4" /><strong>Workflow Timeline</strong></div>
            <span>Live counts</span>
          </div>
          <div className="operations-planner-table">
            <div className="operations-planner-head">
              <span>WBS</span><span>Task</span><span>Done</span><span>Progress</span>
            </div>
            {workflowRows.map((row, index) => (
              <motion.div key={row.label} className="operations-planner-row" initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.32, delay: index * 0.04 }}>
                <span>{index + 1}</span>
                <strong>{row.label}</strong>
                <em>{row.value}</em>
                <div>
                  <i style={{ left: `${Math.min(62, index * 12)}%`, width: `${Math.max(12, (row.value / workflowPeak) * 34)}%` }}>
                    <b className={`operations-planner-tone-${row.tone}`} />
                  </i>
                  <aside className="operations-planner-analysis">
                    <strong>{row.label}</strong>
                    <span>{row.value} records</span>
                    <p>{row.percent}% of current workflow peak</p>
                    <small>{row.note}</small>
                  </aside>
                </div>
              </motion.div>
            ))}
          </div>
        </article>
      </div>
    </motion.section>
  )
}

function getFollowUpAssigneeTokens(item = {}) {
  const assigned = item.assignedTo && typeof item.assignedTo === 'object' ? item.assignedTo : {}
  const createdBy = item.createdBy && typeof item.createdBy === 'object' ? item.createdBy : {}
  return [
    item.assignedToName,
    item.assignedToEmail,
    item.assignedToId,
    item.ownerName,
    item.ownerEmail,
    item.ownerId,
    item.scheduledBy,
    item.createdByName,
    item.createdByEmail,
    item.createdById,
    assigned.name,
    assigned.email,
    assigned._id,
    assigned.id,
    createdBy.name,
    createdBy.email,
    createdBy._id,
    createdBy.id,
    typeof item.assignedTo === 'string' ? item.assignedTo : '',
    typeof item.createdBy === 'string' ? item.createdBy : ''
  ].filter(Boolean).map((value) => normalizeKey(value))
}

function resolveFollowUpAssignee(item = {}, users = []) {
  const assigned = item.assignedTo && typeof item.assignedTo === 'object' ? item.assignedTo : null
  const createdBy = item.createdBy && typeof item.createdBy === 'object' ? item.createdBy : null
  const tokens = getFollowUpAssigneeTokens(item)
  const matchedUser = users.find((user) => getUserMatchKeys(user).some((key) => tokens.includes(key)))
  const source = matchedUser || assigned || createdBy || {}
  const rawName = item.assignedToName || source.name || source.fullName || source.email || (typeof item.assignedTo === 'string' ? item.assignedTo : '') || item.createdByName || (typeof item.createdBy === 'string' ? item.createdBy : '')
  const looksLikeId = /^[a-f0-9]{16,}$/i.test(String(rawName || '').trim())
  return {
    name: looksLikeId ? 'Unassigned' : displayValue(rawName, 'Unassigned'),
    email: source.email || item.assignedToEmail || item.createdByEmail || '',
    avatarUrl: source.avatarUrl || source.avatar || source.profileImage || ''
  }
}

function UserAvatar({ user, className = '' }) {
  const name = displayValue(user?.name || user?.email, 'U')
  const initial = name.charAt(0).toUpperCase()
  return (
    <span className={`followup-flow-avatar ${className}`}>
      {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initial}
    </span>
  )
}

function DashboardFollowUpTimeline({ items = [], users = [], onView, onCalendar }) {
  const todayKey = dateKey()
  const sortedItems = [...items]
    .filter((item) => normalizeKey(item.status) !== 'completed')
    .sort((a, b) => `${a.scheduledDate || ''} ${a.scheduledTime || ''}`.localeCompare(`${b.scheduledDate || ''} ${b.scheduledTime || ''}`))
    .slice(0, 4)
  const dateKeys = [todayKey, ...sortedItems.map((item) => item.scheduledDate).filter(Boolean)].sort()
  const startKey = dateKeys[0] || todayKey
  const endKey = dateKeys[dateKeys.length - 1] || todayKey
  const totalDays = Math.max(8, diffDays(startKey, endKey) + 4)
  const timelineDays = Array.from({ length: Math.min(10, totalDays + 1) }, (_, index) => {
    const date = parseDateKey(startKey) || new Date()
    date.setDate(date.getDate() + index)
    return dateKey(date)
  })
  const todayOffset = Math.max(0, Math.min(100, (diffDays(startKey, todayKey) / Math.max(1, timelineDays.length - 1)) * 100))
  const dayLabel = (value) => {
    const date = parseDateKey(value)
    if (!date) return { date: 'N/A', day: '' }
    return {
      date: new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit' }).format(date),
      day: new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date)
    }
  }

  return (
    <motion.section className="followup-flow-board dashboard-followup-flow" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.36, delay: 0.1 }}>
      <div className="followup-flow-head">
        <div>
          <span>Follow-Up Flow</span>
          <strong>Scheduled follow-up timeline</strong>
        </div>
        <div className="followup-flow-actions">
          <p>{items.length} active follow-ups</p>
          <button type="button" onClick={onCalendar}>Calendar</button>
        </div>
      </div>
      <div className="followup-flow-table">
        <div className="followup-flow-month">
          <span>{formatShortDate(startKey)} - {formatShortDate(endKey)}</span>
          <strong>Follow-Up Window</strong>
        </div>
        <div className="followup-flow-head-row">
          <span>WBS</span>
          <span>Task</span>
          <span>Assigned</span>
          <span>Priority</span>
          <span>Status</span>
          <span>Timeline</span>
        </div>
        <div className="followup-flow-date-row">
          {timelineDays.map((value) => {
            const label = dayLabel(value)
            return (
              <span key={value} className={value === todayKey ? 'followup-flow-date-today' : ''}>
                <b>{label.date}</b>
                <small>{label.day}</small>
              </span>
            )
          })}
        </div>
        <div className="followup-flow-body">
          <i className="followup-flow-today" style={{ left: `${todayOffset}%`, '--today-left': `calc(${todayOffset}% + ${626 * (1 - todayOffset / 100)}px)` }}><b>Today</b></i>
          {sortedItems.length ? sortedItems.map((item, index) => {
            const tone = getFollowUpTone(item, todayKey)
            const offset = Math.max(0, Math.min(82, (diffDays(startKey, item.scheduledDate) / Math.max(1, timelineDays.length - 1)) * 100))
            const width = normalizeKey(item.status) === 'completed' ? 18 : tone === 'overdue' ? 18 : 28 + (index % 2) * 8
            const assignee = resolveFollowUpAssignee(item, users)
            const title = displayValue(item.title, `Follow up with ${getCalendarFollowUpCompany(item)}`)
            const priority = displayValue(item.priority, tone === 'overdue' ? 'High' : 'Medium')
            const status = displayValue(getFollowUpStatusLabel(item, todayKey), 'Open')
            return (
              <motion.div
                key={item.id || item._id || `${title}-${index}`}
                className={`followup-flow-row followup-flow-row-${tone}`}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.26, delay: index * 0.035 }}
              >
                <span>{`OPS-${String(index + 1).padStart(2, '0')}`}</span>
                <strong>{title}</strong>
                <div className="followup-flow-assignee">
                  <UserAvatar user={assignee} />
                  <em>{assignee.name}</em>
                </div>
                <mark className={`followup-flow-priority followup-flow-priority-${normalizeKey(priority)}`}>{priority}</mark>
                <mark className={`followup-flow-status followup-flow-status-${tone}`}>{status}</mark>
                <div className="followup-flow-track">
                  <i style={{ left: `${offset}%`, width: `${width}%` }}>
                    <b>{status}</b>
                  </i>
                  <aside className="followup-flow-analysis">
                    <strong>{title}</strong>
                    <span>{formatShortDate(item.scheduledDate)} {item.scheduledTime || 'All day'}</span>
                    <p>Status: {getFollowUpStatusLabel(item, todayKey)}</p>
                    <small>{item.description || getCalendarFollowUpCompany(item) || 'Pending follow-up action'}</small>
                  </aside>
                </div>
              </motion.div>
            )
          }) : <div className="followup-flow-empty">No follow-ups found. Add a Follow-Up to see the flow.</div>}
        </div>
      </div>
      <button type="button" className="sales-donut-link" onClick={onView}>View All Follow-ups <ArrowUpRight className="h-3.5 w-3.5" /></button>
    </motion.section>
  )
}

function OperationsLeadAnalytics({ analytics, piboCards = [], convertedLeadCount = 0, annualReturnStats = {}, followUps = [], onViewFollowUps, onOpenCalendar }) {
  const piboTotal = piboCards.reduce((sum, row) => sum + row.value, 0)
  const barRows = piboCards.length
    ? piboCards.map((row, index) => ({
      id: row.label,
      name: row.label,
      value: row.value,
      percent: percent(row.value, piboTotal),
      fill: ['#0f9f83', '#2563eb', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#64748b', '#84cc16', '#f97316'][index % 9]
    }))
    : [{ id: 'empty', name: 'No PIBO data', value: 0, percent: 0, fill: '#cbd5e1' }]
  const totalLeads = analytics.leads.length
  const remainingLeads = Math.max(0, totalLeads - convertedLeadCount)
  const leadPieRows = totalLeads
    ? [
      { label: 'Converted Lead', value: convertedLeadCount, percent: percent(convertedLeadCount, totalLeads), color: '#0f9f83' },
      { label: 'Remaining Lead', value: remainingLeads, percent: percent(remainingLeads, totalLeads), color: '#facc15' }
    ]
    : [{ label: 'No Leads', value: 1, color: '#e2e8f0' }]
  return (
    <div className="operations-analytics-stack">
      <section className="operations-panel operations-pibo-chart-panel">
        <PanelHeader icon={PieChart} title="PIBO Category" note="Category wise current table count" />
        <div className="operations-pibo-chart-layout">
          <div className="operations-pibo-bar-card operations-pibo-bar-card-modern">
            <div className="operations-pibo-bar-card-head">
              <div>
                <strong>PIBO Category Split</strong>
                <p>Animated category wise client distribution</p>
              </div>
              <span>{piboTotal} clients</span>
            </div>
            <div className="operations-pibo-modern-chart">
              <ResponsiveContainer width="100%" height={Math.max(270, barRows.length * 32)}>
                <BarChart data={barRows} layout="vertical" margin={{ top: 6, right: 44, left: 18, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="4 6" horizontal={false} stroke="#d8ebe7" />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={{ stroke: '#dbe7e5' }} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 900 }} />
                  <YAxis dataKey="name" type="category" width={210} tickLine={false} axisLine={false} tick={{ fill: '#26384d', fontSize: 10, fontWeight: 950 }} />
                  <Bar dataKey="value" radius={[0, 12, 12, 0]} barSize={15} animationDuration={1100} animationEasing="ease-out" label={{ position: 'right', fill: '#0f172a', fontSize: 12, fontWeight: 950 }}>
                    {barRows.map((row) => <Cell key={row.id} fill={row.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="operations-pibo-bar-legend">
              {barRows.map((row) => (
                <span key={row.id}><i style={{ background: row.fill }} />{row.name}: {row.value}</span>
              ))}
            </div>
          </div>

          <article className="operations-lead-chart-card operations-lead-pie-card operations-lead-pie-card-featured">
            <div className="operations-lead-chart-head">
              <div>
                <strong>Lead Conversion Pie</strong>
                <p>Total leads and converted leads in Client Master</p>
              </div>
              <span>{convertedLeadCount} converted</span>
            </div>
            <div className="operations-lead-pie-wrap">
              <div className="operations-lead-pie">
                <ResponsiveContainer width="100%" height={230}>
                  <RechartsPieChart>
                    <Pie
                      data={leadPieRows}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={54}
                      outerRadius={88}
                      paddingAngle={totalLeads ? 3 : 0}
                      stroke="none"
                      animationDuration={1100}
                      animationEasing="ease-out"
                    >
                      {leadPieRows.map((row) => <Cell key={row.label} fill={row.color} />)}
                    </Pie>
                    <Tooltip
                      cursor={false}
                      contentStyle={{ border: '1px solid #bfdbfe', borderRadius: 12, boxShadow: '0 18px 36px rgba(15, 23, 42, 0.16)', fontWeight: 900 }}
                      formatter={(value, name, item) => [`${value} leads (${item?.payload?.percent || 0}%)`, item?.payload?.label || name]}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
                <div className="operations-lead-pie-center">
                  <strong>{totalLeads}</strong>
                  <span>Leads</span>
                </div>
                </div>
                <div className="operations-lead-legend">
                <div title={`Converted Lead: ${totalLeads} (100%)`}>
                  <span style={{ background: '#facc15' }} />
                  <p>Remaining Lead</p>
                  <strong>{totalLeads}</strong>
                  <small>100%</small>
                </div>
                <div className="operations-lead-legend-muted" title={`Total Lead: ${convertedLeadCount} (${percent(convertedLeadCount, totalLeads)}%)`}>
                  <span style={{ background: '#0f9f83' }} />
                  <p>
Converted Lead</p>
                  <strong>{convertedLeadCount}</strong>
                  <small>{percent(convertedLeadCount, totalLeads)}%</small>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  )
}

function OperationsAnnualReturnProgress({ annualReturnStats = {} }) {
  const [hoveredAnnualRow, setHoveredAnnualRow] = useState(null)
  const annualTotal = annualReturnStats.total || 0
  const annualCompleted = annualReturnStats.completed || 0
  const annualPending = annualReturnStats.pending || 0
  const annualRejected = annualReturnStats.rejected || annualReturnStats.overdue || 0
  const annualPercent = percent(annualCompleted, annualTotal)
  const annualRows = [
    { label: 'Completed', value: annualCompleted, percent: percent(annualCompleted, annualTotal), color: '#0f9f83' },
    { label: 'Pending', value: annualPending, percent: percent(annualPending, annualTotal), color: '#facc15' },
    { label: 'Rejected', value: annualRejected, percent: percent(annualRejected, annualTotal), color: '#ef4444' }
  ]
  const annualPieRows = annualTotal
    ? annualRows.filter((row) => row.value > 0)
    : [{ label: 'No Annual Returns', value: 1, percent: 0, color: '#e2e8f0' }]
  const activeAnnualRow = hoveredAnnualRow || { label: 'Completed', percent: annualPercent }

  return (
    <article className="operations-lead-chart-card operations-annual-return-card">
      <div className="operations-lead-chart-head">
        <div>
          <strong>Annual Return Progress</strong>
          <p>Completed, pending and rejected annual return work</p>
        </div>
        <span>{annualTotal} total</span>
      </div>
      <div className="operations-annual-return-body">
        <div className="operations-annual-donut">
          <ResponsiveContainer width="100%" height={210}>
            <RechartsPieChart>
              <Pie
                data={annualPieRows}
                dataKey="value"
                nameKey="label"
                innerRadius={60}
                outerRadius={86}
                startAngle={180}
                endAngle={0}
                paddingAngle={annualTotal && annualPieRows.length > 1 ? 4 : 0}
                minAngle={annualTotal ? 8 : 0}
                cornerRadius={10}
                stroke="#ffffff"
                strokeWidth={annualTotal ? 4 : 0}
                animationDuration={900}
              >
                {annualPieRows.map((row) => <Cell key={row.label} fill={row.color} />)}
              </Pie>
            </RechartsPieChart>
          </ResponsiveContainer>
          <div className="operations-lead-pie-center">
            <strong>{activeAnnualRow.percent}%</strong>
            <span>{activeAnnualRow.label}</span>
          </div>
        </div>
        <div className="operations-annual-legend">
          {annualRows.map((row) => (
            <div
              key={row.label}
              data-percent={`${row.percent}%`}
              aria-label={`${row.label}: ${row.value} (${row.percent}%)`}
              onMouseEnter={() => setHoveredAnnualRow(row)}
              onMouseLeave={() => setHoveredAnnualRow(null)}
              onFocus={() => setHoveredAnnualRow(row)}
              onBlur={() => setHoveredAnnualRow(null)}
              tabIndex={0}
            >
              <span style={{ background: row.color }} />
              <p>{row.label}</p>
              <strong>{row.value}</strong>
              <small>({row.percent}%)</small>
            </div>
          ))}
        </div>
      </div>
    </article>
  )
}

function ControlSignal({ signal }) {
  return (
    <div className={`operations-control-signal operations-control-${signal.tone}`}>
      <span>{signal.label}</span>
      <strong>{signal.value}</strong>
      <small>{signal.detail}</small>
    </div>
  )
}

function CommandStat({ label, value, note, icon: Icon }) {
  return (
    <div className="operations-command-stat">
      <Icon className="h-4 w-4" />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </div>
  )
}

function formatDashboardInr(value) {
  return (Number(value) || 0).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

function getQuotationTotal(quotation = {}) {
  return (quotation.items || []).reduce((sum, item) => sum + (Number(item.basicAmount) || 0), 0)
}

function getMeaningfulQuotationItems(items = []) {
  return items.filter((item) => {
    return [
      item.serviceCategory,
      item.servicesForYear,
      item.eprCategory,
      item.piboCategory,
      item.unit,
      item.basicAmount
    ].some((value) => String(value || '').trim() && String(value || '').trim() !== '-')
  })
}

function getLatestQuotationItem(items = []) {
  const meaningfulItems = getMeaningfulQuotationItems(items)
  return meaningfulItems[meaningfulItems.length - 1] || items[items.length - 1] || {}
}

function QuotationDetailsModal({ row, onClose }) {
  const quotations = Array.isArray(row?.quotations) ? row.quotations : []
  const quotation = quotations[0] || {}
  const details = quotation.leadDetails || {}
  const items = Array.isArray(quotation.items) ? quotation.items : []
  const latestItem = getLatestQuotationItem(items)
  const meaningfulItems = getMeaningfulQuotationItems(items)
  const totalAmount = Number(latestItem.basicAmount) || getQuotationTotal(quotation)
  const revisionCount = Math.max(quotations.length, meaningfulItems.length || items.length)
  const userName = quotation.createdBy?.name || quotation.createdBy?.email || details.referredBy || row?.userName || '-'

  return (
    <PremiumQuotationModal
      open
      onClose={onClose}
      companyName={details.companyName || row?.companyName || 'Quotation Details'}
      quotationNumber={quotation.quotationNumber || quotation.quotationNo || 'Quotation'}
      totalAmount={totalAmount}
      revisionCount={revisionCount}
      userName={userName}
      piboCategory={latestItem.piboCategory || row?.category || '-'}
      serviceCategory={latestItem.serviceCategory || '-'}
      items={items}
    />
  )
}

function AnimatedInrAmount({ value }) {
  const animatedValue = useCountUpNumber(Number(value) || 0)
  return <span className="count-up-number">{formatDashboardInr(animatedValue)}</span>
}

function PoDetailsModal({ row, onClose }) {
  const po = row?.poDetails || {}
  const fileHref = po.fileUrl || ''
  const hasPo = Boolean(po.hasPo)

  return (
    <div className="operations-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="operations-po-modal operations-po-modal-v2" role="dialog" aria-modal="true" aria-label="Compliance PO Details" onClick={(event) => event.stopPropagation()}>
        <div className="operations-po-modal-head operations-po-modal-head-v2">
          <div>
            <span>PO Status</span>
            <h3>{row?.companyName || 'Compliance PO Details'}</h3>
            <p>{row?.atplCode || '-'} - {po.source || 'No PO source found'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Compliance PO Details">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={`operations-po-status-hero ${hasPo ? 'operations-po-status-hero-yes' : 'operations-po-status-hero-no'}`}>
          <span><FileCheck2 className="h-5 w-5" /></span>
          <div>
            <small>Current PO Decision</small>
            <strong>{hasPo ? 'PO available' : 'PO not available'}</strong>
          </div>
          <em>{hasPo ? 'Yes' : 'No'}</em>
        </div>

        <div className="operations-po-detail-grid operations-po-detail-grid-v2">
          <div className="operations-po-detail-row operations-po-detail-row-v2">
            <span><FileText className="h-4 w-4" /></span>
            <div>
              <small>Compliance PO No.</small>
              <strong>{po.poNo || '-'}</strong>
            </div>
          </div>
          <div className="operations-po-detail-row operations-po-detail-row-v2">
            <span><CalendarDays className="h-4 w-4" /></span>
            <div>
              <small>Compliance PO Date</small>
              <strong>{po.poDate ? formatPoDate(po.poDate) : 'dd-mm-yyyy'}</strong>
            </div>
          </div>
          <div className="operations-po-detail-row operations-po-detail-row-v2 operations-po-detail-row-wide">
            <span><FolderOpen className="h-4 w-4" /></span>
            <div>
              <small>Upload Compliance PO</small>
              {fileHref ? (
                <a href={fileHref} target="_blank" rel="noreferrer">{po.fileName || 'View uploaded file / folder'}</a>
              ) : (
                <strong>No file uploaded</strong>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AnnualReturnYearModal({ row, onClose, onSelectYear }) {
  const years = buildOperationsAnnualYearOptions(row)

  return (
    <div className="operations-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="operations-annual-modal" role="dialog" aria-modal="true" aria-label="Select Annual Return Year" onClick={(event) => event.stopPropagation()}>
        <div className="operations-annual-modal-head">
          <div>
            <span>Annual Return Hubs</span>
            <h3>{row?.companyName || 'Select annual return year'}</h3>
            <p>{row?.atplCode || '-'} - EPR Year - April - March</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Annual Return Year Picker">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="operations-annual-table-card">
          <table className="operations-annual-year-table">
            <thead>
              <tr>
                <th>EPR Year</th>
                <th>Period</th>
                <th>Hub Status</th>
                <th>Completion</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {years.map((year, index) => {
                const percentReady = percent(year.completed, 4)
                const isCurrent = year.status === 'Current hub'
                return (
                  <tr key={year.label} style={{ '--delay': `${index * 55}ms` }}>
                    <td>
                      <div className="operations-annual-year-cell">
                        <span><CalendarDays className="h-4 w-4" /></span>
                        <strong>{year.label}</strong>
                      </div>
                    </td>
                    <td>{year.period}</td>
                    <td>
                      <span className={`operations-annual-hub-pill ${isCurrent ? 'operations-annual-hub-current' : ''}`}>
                        {year.status}
                      </span>
                    </td>
                    <td>
                      <div className="operations-annual-progress-cell">
                        <div>
                          <strong>{year.completed}/4</strong>
                          <span>{percentReady}% ready</span>
                        </div>
                        <i><em style={{ width: `${percentReady}%` }} /></i>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => onSelectYear(year.label)}
                        className="operations-annual-view-action"
                        aria-label={`View annual return ${year.label}`}
                        title={`View ${year.label}`}
                      >
                        <Eye className="h-4 w-4" />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SalesAnalyticsBars({ title, subtitle, rows = [], tone = 'teal', delay = 0 }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  return (
    <motion.article className={`sales-mix-card sales-mix-${tone}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .42, delay }}>
      <header><div><span>{subtitle}</span><h3>{title}</h3></div><b>{total}</b></header>
      <div className="sales-mix-bars">
        {rows.length ? rows.map((row, index) => {
          const percentValue = Math.round((row.value / Math.max(total, 1)) * 100)
          return (
            <div className="sales-mix-row" key={`${row.label}-${index}`} title={`${row.label}: ${row.value} (${percentValue}%)`}>
              <strong>{row.label}</strong>
              <div><motion.i initial={{ width: 0 }} animate={{ width: `${Math.max(4, (row.value / max) * 100)}%` }} transition={{ duration: .72, delay: delay + index * .055, ease: [0.22, 1, 0.36, 1] }} /></div>
              <em>{row.value}</em><small>{percentValue}%</small>
            </div>
          )
        }) : <p className="sales-mix-empty">No data available yet</p>}
      </div>
    </motion.article>
  )
}

function SalesMixAnalytics({ analytics, total }) {
  return (
    <section className="sales-mix-section">
      <div className="sales-mix-top-grid">
        <SalesAnalyticsBars title="Top Industries" subtitle="Market concentration" rows={analytics.industries} tone="blue" delay={.06} />
        <SalesAnalyticsBars title="PIBO Category" subtitle="Compliance segments" rows={analytics.pibo} tone="violet" delay={.11} />
        <SalesAnalyticsBars title="Top States by Leads" subtitle="Geographic demand" rows={analytics.states} tone="green" delay={.16} />
      </div>
      <div className="sales-mix-bottom-grid">
        <SalesAnalyticsBars title="Team Workload · Leads Assigned" subtitle="Ownership balance" rows={analytics.workload} tone="amber" delay={.2} />
        <SalesAnalyticsBars title="Services Offered" subtitle="Solution portfolio" rows={analytics.services} tone="teal" delay={.25} />
      </div>
    </section>
  )
}

function SalesDashboard({ leads = [], quotations = [], clients = [], currentUser = {}, onOpenTodayLeads, onOpenSalesValue }) {
  const navigate = useNavigate()
  const [reportModal, setReportModal] = useState(null)
  const [salesValueModalOpen, setSalesValueModalOpen] = useState(false)
  const [leadSourcePeriod, setLeadSourcePeriod] = useState('q1')
  const [quotationPeriod, setQuotationPeriod] = useState('q1')
  const scopedLeads = useMemo(() => getSalesVisibleRecords(leads, (lead) => leadBelongsToSalesUser(lead, currentUser)), [currentUser, leads])
  const scopedQuotations = useMemo(() => getSalesVisibleRecords(quotations, (quote) => quotationBelongsToSalesUser(quote, currentUser)), [currentUser, quotations])
  const periodLeads = useMemo(() => scopedLeads.filter((lead) => isDateInSalesPeriod(getLeadCreatedDate(lead), leadSourcePeriod)), [leadSourcePeriod, scopedLeads])
  const periodQuotations = useMemo(() => scopedQuotations.filter((quote) => isDateInSalesPeriod(getQuotationDate(quote), quotationPeriod)), [quotationPeriod, scopedQuotations])
  const todayLeads = useMemo(() => scopedLeads.filter((lead) => isTodayDate(getLeadCreatedDate(lead))), [scopedLeads])
  const convertedLeads = useMemo(() => scopedLeads.filter((lead) => leadConvertedToClientMaster(lead, clients)), [clients, scopedLeads])
  const quotationSent = scopedQuotations.filter((quote) => ['Sent', 'Opened', 'Replied', 'Approved'].includes(getQuotationStatusBucket(quote)))
  const quotationApproved = scopedQuotations.filter((quote) => normalizeKey(quote.approvalStatus || quote.adminApproval || quote.status).includes('approve'))
  const salesValue = scopedQuotations.reduce((sum, quote) => sum + getQuotationValue(quote), 0)
  const pipelineStages = ['New', 'Contacted', 'Qualified', 'Quotation', 'Negotiation', 'Won', 'Lost']
  const pipelineRows = pipelineStages.map((stage) => {
    const stageLeads = scopedLeads.filter((lead) => getLeadPipelineStage(lead) === stage)
    return {
      stage,
      leads: stageLeads,
      value: stageLeads.reduce((sum, lead) => sum + getLeadSalesValue(lead, scopedQuotations), 0)
    }
  })
  const revenueRows = ['Approved', 'Sent', 'Opened', 'Replied', 'Draft', 'Expired'].map((stage) => ({
    stage,
    value: scopedQuotations
      .filter((quote) => getQuotationStatusBucket(quote) === stage)
      .reduce((sum, quote) => sum + getQuotationValue(quote), 0)
  }))
  const leadSourceRows = buildDistributionRows(
    periodLeads,
    (lead) => lead.source || lead.leadSource || 'Others',
    ['#0f9f83', '#45b8ad', '#8b5cf6', '#f59e0b', '#ef4444', '#9ca3af']
  )
  const quotationRows = buildDistributionRows(
    periodQuotations,
    getQuotationStatusBucket,
    ['#0f9f83', '#2563eb', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6']
  )
  const recentQuotes = [...scopedQuotations]
    .sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0))
    .slice(0, 5)
  const calendarFollowUps = useMemo(() => getCalendarFollowUpsForUser(currentUser, buildLeadFollowUpItems(leads)), [currentUser, leads])
  const followUps = calendarFollowUps.slice(0, 5)
  const allActivities = [
    ...scopedLeads.map((lead) => ({
      type: 'New Lead Created',
      lead: lead.company || lead.companyName || '-',
      owner: getLeadOwnerName(lead),
      stage: getLeadPipelineStage(lead),
      amount: getLeadSalesValue(lead, scopedQuotations),
      date: getLeadCreatedDate(lead),
      nextStep: 'Call / qualify lead'
    })),
    ...scopedQuotations.map((quote) => ({
      type: 'Quotation Sent',
      lead: quote.leadDetails?.companyName || quote.companyName || '-',
      owner: getQuotationOwnerName(quote),
      stage: getQuotationStatusBucket(quote),
      amount: getQuotationValue(quote),
      date: getQuotationDate(quote),
      nextStep: getQuotationStatusBucket(quote) === 'Approved' ? 'Handover to operations' : 'Follow up'
    }))
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  const recentActivities = allActivities.slice(0, 6)

  const metrics = [
    { label: 'Total Lead', value: scopedLeads.length, note: 'Assigned sales leads', icon: Users, tone: 'teal' },
    { label: 'Quotation Sent', value: quotationSent.length, note: 'Sent / opened / replied', icon: FileText, tone: 'blue' },
    { label: 'Converted Lead', value: convertedLeads.length, note: 'Lead converted in Client Master', icon: TrendingUp, tone: 'orange' },
    {
      label: 'Sales Value',
      value: salesValue,
      note: 'Quotation value',
      icon: CircleDollarSign,
      tone: 'indigo',
      formatter: formatDashboardInr,
      onClick: () => setSalesValueModalOpen(true)
    },
    { label: 'Today Lead', value: todayLeads.length, note: 'Generated today', icon: CalendarDays, tone: 'pink', onClick: onOpenTodayLeads }
  ]

  const salesMixAnalytics = useMemo(() => {
    const firstValue = (record, keys, fallback = 'Others') => {
      for (const key of keys) {
        const value = key.split('.').reduce((next, part) => next?.[part], record)
        if (Array.isArray(value) && value.length) return value.join(', ')
        if (String(value || '').trim()) return String(value).trim()
      }
      return fallback
    }
    const distribution = (records, keys, limit = 6) => {
      const counts = new Map()
      records.forEach((record) => {
        const raw = firstValue(record, keys)
        const values = raw.split(/[,|/]+/).map((value) => value.trim()).filter(Boolean)
        ;(values.length ? values : ['Others']).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1))
      })
      const sorted = [...counts].sort((a, b) => b[1] - a[1])
      const shown = sorted.slice(0, limit)
      const remainder = sorted.slice(limit).reduce((sum, [, value]) => sum + value, 0)
      if (remainder) shown.push(['Others', remainder])
      return shown.map(([label, value]) => ({ label, value }))
    }
    return {
      industries: distribution(scopedLeads, ['industry', 'industryType', 'businessType', 'sector', 'companyIndustry']),
      pibo: distribution(scopedLeads, ['piboCategory', 'piboType', 'category', 'leadDetails.piboCategory']),
      states: distribution(scopedLeads, ['state', 'address.state', 'registeredState', 'companyState', 'location.state']),
      workload: distribution(scopedLeads, ['assignedToName', 'ownerName', 'createdByName', 'referredBy', 'assignedTo.name'], 8),
      services: distribution(scopedLeads, ['serviceOffered', 'services', 'eprCategory', 'serviceCategory', 'leadDetails.eprCategory'])
    }
  }, [scopedLeads])

  return (
    <motion.div
      className="sales-dashboard"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="sales-hero">
        <div>
          <p className="operations-eyebrow">Sales command center</p>
          <h1>Sales Dashboard</h1>
          <p>Lead generation, quotations, conversion, source mix and today follow-up visibility.</p>
        </div>
      </div>

      <div className="sales-metric-grid">
        {metrics.map((metric, index) => <SalesMetricCard key={metric.label} metric={metric} index={index} />)}
      </div>

      <SalesMixAnalytics analytics={salesMixAnalytics} total={scopedLeads.length} />

      <SalesLeadBreakdownTable rows={buildSalesLeadMatrixRows(scopedLeads)} />

      <div className="sales-insight-grid">
        <SalesDonutCard
          title="Lead Sources"
          total={periodLeads.length}
          centerLabel="Total Leads"
          rows={leadSourceRows}
          actionLabel="View Full Report"
          icon={Target}
          period={leadSourcePeriod}
          onPeriodChange={setLeadSourcePeriod}
          onView={() => setReportModal({
            title: 'Lead Sources',
            subtitle: `${periodLeads.length} leads in selected period`,
            columns: ['Referred By', 'Date', 'Lead Source', 'Company'],
            rows: periodLeads.map((lead) => [
              getLeadOwnerName(lead),
              formatShortDate(getLeadCreatedDate(lead)),
              lead.source || lead.leadSource || '-',
              getLeadCompanyName(lead) || '-'
            ])
          })}
        />
        <SalesFollowUps
          leads={followUps}
          onCalendar={() => navigate('/calendar')}
          onView={() => setReportModal({
            title: 'Follow-ups',
            subtitle: `${calendarFollowUps.length} calendar follow-up records`,
            columns: ['Date', 'Time', 'Title', 'Company', 'Owner', 'Priority', 'Status'],
            rows: calendarFollowUps.map((item) => [
              formatShortDate(item.scheduledDate),
              item.scheduledTime || 'No time',
              displayValue(item.title, '-'),
              getCalendarFollowUpCompany(item),
              getCalendarFollowUpOwner(item),
              displayValue(item.priority, 'Medium'),
              displayValue(item.status, 'open')
            ]),
            actionLabel: 'Open Calendar',
            onAction: () => navigate('/calendar')
          })}
        />
        <SalesDonutCard
          title="Quotation Status"
          total={periodQuotations.length}
          centerLabel="Total Quotations"
          rows={quotationRows}
          actionLabel="View All Quotations"
          icon={FileCheck2}
          period={quotationPeriod}
          onPeriodChange={setQuotationPeriod}
          onView={() => setReportModal({
            title: 'Quotation Status',
            subtitle: `${periodQuotations.length} quotations in selected period`,
            columns: ['Company', 'Status', 'Owner', 'Value', 'Date'],
            rows: periodQuotations.map((quote) => [
              quote.leadDetails?.companyName || quote.companyName || '-',
              getQuotationStatusBucket(quote),
              getQuotationOwnerName(quote),
              formatDashboardInr(getQuotationValue(quote)),
              formatShortDate(getQuotationDate(quote))
            ])
          })}
        />
      </div>

      <SalesRecentActivity
        rows={recentActivities}
        onView={() => setReportModal({
          title: 'Recent Sales Activity',
          subtitle: `${allActivities.length} activity records`,
          columns: ['Date & Time', 'Activity', 'Lead / Account', 'Owner', 'Stage', 'Amount', 'Next Step'],
          rows: allActivities.map((row) => [
            formatDateTime(row.date),
            row.type,
            row.lead,
            row.owner,
            row.stage,
            formatDashboardInr(row.amount),
            row.nextStep
          ])
        })}
      />

      <AnimatePresence>
        {reportModal && <SalesReportModal report={reportModal} onClose={() => setReportModal(null)} />}
      </AnimatePresence>
      <AnimatePresence>
        {salesValueModalOpen && <SalesValueModal quotations={scopedQuotations} onClose={() => setSalesValueModalOpen(false)} />}
      </AnimatePresence>
    </motion.div>
  )
}

function SalesLeadBreakdownTable({ rows = [] }) {
  const rowsPerPage = 5
  const totals = rows.reduce((acc, row) => {
    salesCommunicationModes.forEach((mode) => { acc.communication[mode] += row.communication[mode] || 0 })
    salesLeadStatuses.forEach((status) => { acc.statuses[status] += row.statuses[status] || 0 })
    acc.total += row.total
    return acc
  }, {
    communication: Object.fromEntries(salesCommunicationModes.map((mode) => [mode, 0])),
    statuses: Object.fromEntries(salesLeadStatuses.map((status) => [status, 0])),
    total: 0
  })

  return (
    <motion.section className="sales-lead-breakdown-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.36, delay: 0.08 }}>
      <div className="sales-section-head">
        <div><ListChecks className="h-4 w-4" /><strong>Lead Breakdown</strong></div>
        <p>{rows.length > rowsPerPage ? `Showing first ${rowsPerPage}, scroll for ${rows.length - rowsPerPage} more` : `${rows.length} rows`}</p>
      </div>
      <div className="sales-lead-breakdown-wrap">
        <table className="sales-lead-breakdown-table">
          <thead>
            <tr>
              <th rowSpan={2}>Referred By</th>
              <th colSpan={salesCommunicationModes.length}>Lead Client Communication Mode</th>
              <th colSpan={salesLeadStatuses.length}>Lead Status</th>
              <th rowSpan={2}>Total</th>
            </tr>
            <tr>
              {salesCommunicationModes.map((mode) => <th key={mode}>{mode}</th>)}
              {salesLeadStatuses.map((status) => <th key={status}>{status}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.key}>
                <td><strong>{row.owner}</strong></td>
                {salesCommunicationModes.map((mode) => <td key={mode}><span>{row.communication[mode] || 0}</span></td>)}
                {salesLeadStatuses.map((status) => <td key={status}><span>{row.statuses[status] || 0}</span></td>)}
                <td><b>{row.total}</b></td>
              </tr>
            )) : (
              <tr><td colSpan={salesCommunicationModes.length + salesLeadStatuses.length + 2}><EmptyOperationState label="No lead breakdown found" /></td></tr>
            )}
          </tbody>
          {rows.length ? (
            <tfoot>
              <tr>
                <td>Total</td>
                {salesCommunicationModes.map((mode) => <td key={mode}>{totals.communication[mode]}</td>)}
                {salesLeadStatuses.map((status) => <td key={status}>{totals.statuses[status]}</td>)}
                <td>{totals.total}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </motion.section>
  )
}

function SalesMetricCard({ metric, index = 0 }) {
  const Icon = metric.icon
  const isNumberValue = typeof metric.value === 'number'
  const animatedValue = useAnimatedNumber(isNumberValue ? metric.value : 0)
  const displayValue = isNumberValue ? (metric.formatter ? metric.formatter(animatedValue) : animatedValue) : metric.value
  const content = (
    <>
      <span><Icon className="h-5 w-5" /></span>
      <div>
        <p>{metric.label}</p>
        <strong>{displayValue}</strong>
        <small>{metric.note}</small>
      </div>
    </>
  )
  if (metric.onClick) {
    return (
      <motion.button
        type="button"
        onClick={metric.onClick}
        className={`sales-metric-card sales-metric-${metric.tone}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, delay: index * 0.045 }}
        whileHover={{ y: -4, scale: 1.01 }}
        whileTap={{ scale: 0.985 }}
      >
        {content}
      </motion.button>
    )
  }
  return (
    <motion.article
      className={`sales-metric-card sales-metric-${metric.tone}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: index * 0.045 }}
      whileHover={{ y: -4, scale: 1.01 }}
    >
    {content}
  </motion.article>
  )
}

function SalesPipelineBoard({ rows = [], quotations = [] }) {
  return (
    <motion.section className="sales-pipeline-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.36, delay: 0.12 }}>
      <div className="sales-section-head">
        <div><Target className="h-4 w-4" /><strong>Lead Pipeline</strong></div>
        <p>{rows.reduce((sum, row) => sum + row.leads.length, 0)} leads across sales stages</p>
      </div>
      <div className="sales-pipeline-board">
        {rows.map((row, index) => (
          <motion.div key={row.stage} className="sales-pipeline-column" style={{ '--stage-color': ['#06b6d4', '#10b981', '#8b5cf6', '#f59e0b', '#14b8a6', '#22c55e', '#ef4444'][index] }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.18 + index * 0.035 }}>
            <div className="sales-pipeline-column-head">
              <strong>{row.stage}</strong>
              <span>{row.leads.length} Leads</span>
            </div>
            <div className="sales-pipeline-leads">
              {row.leads.slice(0, 3).map((lead, leadIndex) => {
                const amount = getLeadSalesValue(lead, quotations)
                return (
                  <motion.article key={lead._id || lead.id || leadIndex} className="sales-pipeline-lead" whileHover={{ y: -3 }}>
                    <strong>{lead.company || lead.companyName || 'Lead'}</strong>
                    <span>{formatDashboardInr(amount)}</span>
                    <small>{(lead.company || 'LD').slice(0, 2).toUpperCase()}</small>
                  </motion.article>
                )
              })}
              {!row.leads.length && <div className="sales-pipeline-empty">No leads</div>}
            </div>
            {row.leads.length > 3 && <button type="button" className="sales-pipeline-more">+ {row.leads.length - 3} more</button>}
          </motion.div>
        ))}
      </div>
    </motion.section>
  )
}

function SalesRevenueForecast({ rows = [], totalValue = 0 }) {
  const activeRows = rows.filter((row) => row.value > 0)
  const chartColors = ['#22c55e', '#f59e0b', '#8b5cf6', '#3b82f6', '#ef4444', '#14b8a6', '#64748b']
  const chartRows = activeRows.map((row, index) => ({
    name: row.stage,
    value: row.value,
    color: chartColors[index % chartColors.length]
  }))
  return (
    <motion.section className="sales-revenue-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.36, delay: 0.16 }}>
      <div className="sales-section-head">
        <div><TrendingUp className="h-4 w-4" /><strong>Revenue Forecast</strong></div>
        <select value="quarter" onChange={() => {}} aria-label="Revenue period"><option value="quarter">This Quarter</option></select>
      </div>
      <div className="sales-revenue-total">
        <span>Forecasted Revenue</span>
        <strong>{formatDashboardInr(totalValue)}</strong>
        <em>Live quotation value</em>
      </div>
      <div className="sales-revenue-chart">
        {chartRows.length ? (
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={chartRows} margin={{ top: 12, right: 10, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#e7f0ee" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 800 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 800 }} tickFormatter={(value) => formatDashboardInr(value)} />
              <Tooltip
                cursor={{ fill: 'rgba(15, 118, 110, 0.07)' }}
                formatter={(value) => [formatDashboardInr(value), 'Value']}
                contentStyle={{ border: '1px solid #d8e7e4', borderRadius: 12, boxShadow: '0 14px 34px rgba(15, 23, 42, 0.12)', fontWeight: 800 }}
              />
              <Bar dataKey="value" radius={[10, 10, 3, 3]} animationDuration={950} animationEasing="ease-out">
                {chartRows.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyOperationState label="No revenue forecast yet" />
        )}
      </div>
      <div className="sales-revenue-stack">
        {(activeRows.length ? activeRows : rows.slice(0, 4)).map((row, index) => (
          <span key={row.stage} style={{ width: `${percent(row.value, totalValue) || (activeRows.length ? 0 : 25)}%`, background: ['#22c55e', '#f59e0b', '#8b5cf6', '#3b82f6', '#ef4444'][index % 5] }} />
        ))}
      </div>
      <div className="sales-revenue-list">
        {(activeRows.length ? activeRows : rows.slice(0, 4)).map((row) => (
          <div key={row.stage}>
            <span>{row.stage}</span>
            <strong>{formatDashboardInr(row.value)}</strong>
          </div>
        ))}
      </div>
    </motion.section>
  )
}

function SalesFollowUps({ leads = [], onView, onCalendar }) {
  const visibleFollowUps = leads.slice(0, 5)
  return (
    <motion.section className="sales-follow-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.36, delay: 0.2 }}>
      <div className="sales-section-head">
        <div><CalendarDays className="h-4 w-4" /><strong>Follow-ups</strong></div>
        <button type="button" onClick={onCalendar}>View Calendar</button>
      </div>
      <div className="sales-follow-list">
        {visibleFollowUps.length ? visibleFollowUps.map((lead, index) => {
          const followDate = lead.scheduledDate || getLeadCreatedDate(lead) || Date.now()
          const followTitle = lead.title || `Follow up with ${lead.company || lead.companyName || 'Lead'}`
          const company = getCalendarFollowUpCompany(lead)
          const owner = getCalendarFollowUpOwner(lead)
          const initials = owner.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'SM'
          const priority = lead.priority || (index < 2 ? 'High' : index < 4 ? 'Medium' : 'Low')
          return (
          <motion.article key={lead._id || lead.id || index} className="sales-follow-item" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.28, delay: index * 0.035 }} whileHover={{ x: 4 }}>
            <time><strong>{String(new Date(followDate).getDate()).padStart(2, '0')}</strong><span>{new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(followDate))}</span></time>
            <div>
              <strong>{followTitle}</strong>
              <span>{company}</span>
            </div>
            <small>{initials}</small>
            <em className={`sales-follow-priority-${String(priority).toLowerCase()}`}>{priority}</em>
          </motion.article>
          )
        }) : <EmptyOperationState label="No follow-ups found" />}
      </div>
      <button type="button" className="sales-donut-link" onClick={onView}>View All Follow-ups <ArrowUpRight className="h-3.5 w-3.5" /></button>
    </motion.section>
  )
}

function SalesRecentActivity({ rows = [], onView }) {
  return (
    <motion.section className="sales-recent-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.36, delay: 0.24 }}>
      <div className="sales-section-head">
        <div><Clock3 className="h-4 w-4" /><strong>Recent Sales Activity</strong></div>
        <button type="button" onClick={onView}>View All Activities</button>
      </div>
      <div className="sales-activity-table">
        <table>
          <thead>
            <tr><th>Date & Time</th><th>Activity</th><th>Lead / Account</th><th>Owner</th><th>Stage</th><th>Amount</th><th>Next Step</th></tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row, index) => (
              <tr key={`${row.type}-${index}`}>
                <td>{formatDateTime(row.date)}</td>
                <td>{row.type}</td>
                <td>{row.lead}</td>
                <td>{row.owner}</td>
                <td><span>{row.stage}</span></td>
                <td>{formatDashboardInr(row.amount)}</td>
                <td>{row.nextStep}</td>
              </tr>
            )) : <tr><td colSpan={7}><EmptyOperationState label="No recent sales activity" /></td></tr>}
          </tbody>
        </table>
      </div>
    </motion.section>
  )
}

function SalesDonutCard({ title, total, centerLabel, rows = [], actionLabel, icon: Icon, onView, period = 'q1', onPeriodChange }) {
  const [showAllRows, setShowAllRows] = useState(false)
  const [monthMenuOpen, setMonthMenuOpen] = useState(false)
  const monthMenuRef = useRef(null)
  const chartRows = rows.length ? rows : [{ label: 'No data', value: 1, color: '#e2e8f0', percent: '0.0' }]
  const visibleRows = showAllRows ? rows : rows.slice(0, 5)
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth()
  const periodValue = String(period)
  const periodMode = periodValue.startsWith('months:') || periodValue.startsWith('m') ? 'month' : periodValue.startsWith('y') ? 'year' : 'quarter'
  const monthOptions = [
    ['m0', 'Jan'],
    ['m1', 'Feb'],
    ['m2', 'Mar'],
    ['m3', 'Apr'],
    ['m4', 'May'],
    ['m5', 'Jun'],
    ['m6', 'Jul'],
    ['m7', 'Aug'],
    ['m8', 'Sep'],
    ['m9', 'Oct'],
    ['m10', 'Nov'],
    ['m11', 'Dec']
  ]
  const yearOptions = Array.from({ length: 5 }, (_, index) => currentYear - index)
  const selectedMonths = periodValue.startsWith('months:')
    ? periodValue.replace('months:', '').split(',').filter(Boolean)
    : periodValue.startsWith('m')
      ? [periodValue]
      : []
  const selectedMonthLabel = selectedMonths.length
    ? monthOptions
      .filter(([value]) => selectedMonths.includes(value))
      .map(([, label]) => label)
      .join(', ')
    : 'Select months'

  useEffect(() => {
    if (!monthMenuOpen) return undefined
    function handlePointerDown(event) {
      if (monthMenuRef.current && !monthMenuRef.current.contains(event.target)) {
        setMonthMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [monthMenuOpen])

  function changePeriodMode(nextMode) {
    if (nextMode === 'month') onPeriodChange?.(`months:m${currentMonth}`)
    else if (nextMode === 'year') onPeriodChange?.(`y${currentYear}`)
    else onPeriodChange?.('q1')
  }

  function toggleMonth(monthValue) {
    const nextMonths = selectedMonths.includes(monthValue)
      ? selectedMonths.filter((value) => value !== monthValue)
      : [...selectedMonths, monthValue]
    const orderedMonths = monthOptions.map(([value]) => value).filter((value) => nextMonths.includes(value))
    onPeriodChange?.(`months:${orderedMonths.join(',')}`)
  }

  return (
    <motion.section
      className="sales-donut-card sales-donut-card-animated"
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: false, amount: 0.42 }}
      transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
    >
      <div className="sales-donut-head">
        <div><Icon className="h-4 w-4" /><strong>{title}</strong></div>
        <div className="sales-period-controls">
          <select value={periodMode} onChange={(event) => changePeriodMode(event.target.value)} aria-label={`${title} period type`}>
            <option value="quarter">Quarter</option>
            <option value="month">Month</option>
            <option value="year">Year</option>
          </select>
          {periodMode === 'quarter' && (
            <select value={period} onChange={(event) => onPeriodChange?.(event.target.value)} aria-label={`${title} quarter`}>
              <option value="q1">Q1 Apr-Jun</option>
              <option value="q2">Q2 Jul-Sep</option>
              <option value="q3">Q3 Oct-Dec</option>
              <option value="q4">Q4 Jan-Mar</option>
            </select>
          )}
          {periodMode === 'month' && (
            <div className="sales-month-dropdown" ref={monthMenuRef}>
              <button
                type="button"
                className="sales-month-trigger"
                aria-label={`${title} months`}
                aria-expanded={monthMenuOpen}
                onClick={() => setMonthMenuOpen((open) => !open)}
              >
                <span>{selectedMonthLabel}</span>
                <span>{selectedMonths.length ? `${selectedMonths.length}` : ''}</span>
              </button>
              {monthMenuOpen && (
                <div className="sales-month-menu">
                  {monthOptions.map(([value, label]) => (
                    <label key={value} className="sales-month-option">
                      <input
                        type="checkbox"
                        checked={selectedMonths.includes(value)}
                        onChange={() => toggleMonth(value)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          {periodMode === 'year' && (
            <select value={period} onChange={(event) => onPeriodChange?.(event.target.value)} aria-label={`${title} year`}>
              {yearOptions.map((year) => <option key={year} value={`y${year}`}>{year}</option>)}
            </select>
          )}
        </div>
      </div>
      <div className="sales-donut-body">
        <div className="sales-rechart-donut">
          <ResponsiveContainer width="100%" height={184}>
            <RechartsPieChart>
              <Pie
                key={`${title}-${period}-${chartRows.map((row) => `${row.label}:${row.value}`).join('|')}`}
                data={chartRows}
                dataKey="value"
                nameKey="label"
                innerRadius={54}
                outerRadius={80}
                paddingAngle={rows.length > 1 ? 3 : 0}
                stroke="none"
                animationBegin={140}
                animationDuration={1250}
                animationEasing="ease-out"
                startAngle={450}
                endAngle={90}
              >
                {chartRows.map((row) => <Cell key={row.label} fill={row.color} />)}
              </Pie>
            </RechartsPieChart>
          </ResponsiveContainer>
          <div className="sales-chart-center"><strong>{total}</strong><span>{centerLabel}</span></div>
        </div>
        <div className="sales-donut-legend">
          {rows.length ? visibleRows.map((row, index) => (
            <div key={row.label} style={{ '--legend-index': index }}>
              <span style={{ background: row.color }} />
              <p>{row.label}</p>
              <strong>{row.value}</strong>
              <small>({row.percent}%)</small>
            </div>
          )) : <EmptyOperationState label="No data found" />}
          {rows.length > 5 && (
            <button type="button" className="sales-donut-show-more" onClick={() => setShowAllRows((value) => !value)}>
              {showAllRows ? 'Show less' : `Show more (${rows.length - 5})`}
            </button>
          )}
        </div>
      </div>
      <button type="button" className="sales-donut-link" onClick={onView}>{actionLabel} <ArrowUpRight className="h-3.5 w-3.5" /></button>
    </motion.section>
  )
}

function SalesReportModal({ report = {}, onClose }) {
  const rows = Array.isArray(report.rows) ? report.rows : []
  const columns = Array.isArray(report.columns) ? report.columns : []
  return (
    <motion.div className="operations-modal-backdrop" role="presentation" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="sales-report-modal"
        role="dialog"
        aria-modal="true"
        aria-label={report.title || 'Sales Report'}
        onClick={(event) => event.stopPropagation()}
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="sales-today-modal-head">
          <div>
            <span>Sales Report</span>
            <h3>{report.title || 'Report'}</h3>
            <p>{report.subtitle || `${rows.length} records`}</p>
          </div>
          <div className="sales-report-modal-actions">
            {report.actionLabel && (
              <button type="button" className="sales-report-primary-action" onClick={() => { onClose(); report.onAction?.(); }}>
                <CalendarDays className="h-4 w-4" />
                {report.actionLabel}
              </button>
            )}
            <button type="button" className="sales-report-close-action" onClick={onClose} aria-label="Close Sales Report"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="sales-report-table">
          <table>
            <thead>
              <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}
                </tr>
              )) : <tr><td colSpan={columns.length || 1}><EmptyOperationState label="No records found" /></td></tr>}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  )
}

function useAnimatedNumber(value = 0) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    let frameId = 0
    const startTime = performance.now()
    const duration = 760

    function tick(now) {
      const progress = Math.min((now - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(Math.round(value * eased))
      if (progress < 1) frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [value])

  return displayValue
}

function TodayLeadsModal({ leads = [], onClose }) {
  return (
    <motion.div className="operations-modal-backdrop" role="presentation" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="sales-today-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Today Lead Details"
        onClick={(event) => event.stopPropagation()}
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="sales-today-modal-head">
          <div>
            <span>Today Lead</span>
            <h3>Lead Generated Today</h3>
            <p>{leads.length} lead records</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Today Lead Popup"><X className="h-5 w-5" /></button>
        </div>
        <div className="sales-today-table">
          <table>
            <thead>
              <tr><th>Company Name</th><th>Referred By</th><th>Date</th><th>Lead Source</th></tr>
            </thead>
            <tbody>
              {leads.length ? leads.map((lead, index) => (
                <tr key={lead._id || lead.id || index}>
                  <td>{getLeadCompanyName(lead) || '-'}</td>
                  <td>{getLeadOwnerName(lead)}</td>
                  <td>{formatShortDate(getLeadCreatedDate(lead))}</td>
                  <td>{lead.source || lead.leadSource || '-'}</td>
                </tr>
              )) : <tr><td colSpan={4}><EmptyOperationState label="No lead generated today" /></td></tr>}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  )
}

function SalesValueModal({ quotations = [], onClose }) {
  const [openGroupKey, setOpenGroupKey] = useState('')
  const groups = useMemo(() => buildSalesValueGroups(quotations), [quotations])
  const totalValue = groups.reduce((sum, group) => sum + group.totalValue, 0)

  return (
    <motion.div className="operations-modal-backdrop" role="presentation" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="sales-value-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Sales Value Details"
        onClick={(event) => event.stopPropagation()}
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="sales-value-drawer-head sales-value-modal-head">
          <div>
            <span>Sales Value</span>
            <h3>{formatDashboardInr(totalValue)}</h3>
            <p>User wise monthly quotation value</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Sales Value Popup"><X className="h-5 w-5" /></button>
        </div>

        <div className="sales-value-summary">
          <div><span>Users</span><strong>{new Set(groups.map((group) => group.userName)).size}</strong></div>
          <div><span>Months</span><strong>{new Set(groups.map((group) => group.month)).size}</strong></div>
          <div><span>Quotations</span><strong>{quotations.length}</strong></div>
        </div>

        <div className="sales-value-table-wrap">
          <table className="sales-value-table">
            <thead>
              <tr><th>User Name</th><th>Month</th><th>Total Value</th></tr>
            </thead>
            <tbody>
              {groups.length ? groups.map((group) => {
                const open = openGroupKey === group.key
                return (
                  <React.Fragment key={group.key}>
                    <tr>
                      <td>
                        <button type="button" className="sales-value-user-toggle" onClick={() => setOpenGroupKey(open ? '' : group.key)}>
                          <span>{open ? '-' : '+'}</span>
                          <strong>{group.userName}</strong>
                        </button>
                      </td>
                      <td>{group.month}</td>
                      <td>{formatDashboardInr(group.totalValue)}</td>
                    </tr>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.tr className="sales-value-detail-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <td colSpan={3}>
                            <table>
                              <thead>
                                <tr><th>Client Name</th><th>Date</th><th>Sales Value</th></tr>
                              </thead>
                              <tbody>
                                {group.quotations.map((quote, index) => (
                                  <tr key={quote._id || quote.id || index}>
                                    <td>{quote.leadDetails?.companyName || quote.companyName || 'Client'}</td>
                                    <td>{formatShortDate(getQuotationDate(quote))}</td>
                                    <td>{formatDashboardInr(quote.__salesValue)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                )
              }) : <tr><td colSpan={3}><EmptyOperationState label="No sales value found" /></td></tr>}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  )
}

function SalesValueDrawer({ quotations = [], onClose }) {
  const [openGroupKey, setOpenGroupKey] = useState('')
  const groups = useMemo(() => buildSalesValueGroups(quotations), [quotations])
  const totalValue = groups.reduce((sum, group) => sum + group.totalValue, 0)

  return (
    <motion.div className="sales-drawer-backdrop" role="presentation" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.aside
        className="sales-value-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Sales Value Details"
        onClick={(event) => event.stopPropagation()}
        initial={{ x: 56, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 42, opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="sales-value-drawer-head">
          <div>
            <span>Sales Value</span>
            <h3>{formatDashboardInr(totalValue)}</h3>
            <p>User wise monthly quotation value</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Sales Value Drawer"><X className="h-5 w-5" /></button>
        </div>

        <div className="sales-value-summary">
          <div><span>Users</span><strong>{new Set(groups.map((group) => group.userName)).size}</strong></div>
          <div><span>Months</span><strong>{new Set(groups.map((group) => group.month)).size}</strong></div>
          <div><span>Quotations</span><strong>{quotations.length}</strong></div>
        </div>

        <div className="sales-value-table-wrap">
          <table className="sales-value-table">
            <thead>
              <tr><th>User Name</th><th>Month</th><th>Total Value</th></tr>
            </thead>
            <tbody>
              {groups.length ? groups.map((group) => {
                const open = openGroupKey === group.key
                return (
                  <React.Fragment key={group.key}>
                    <tr>
                      <td>
                        <button type="button" className="sales-value-user-toggle" onClick={() => setOpenGroupKey(open ? '' : group.key)}>
                          <span>{open ? '-' : '+'}</span>
                          <strong>{group.userName}</strong>
                        </button>
                      </td>
                      <td>{group.month}</td>
                      <td>{formatDashboardInr(group.totalValue)}</td>
                    </tr>
                    <AnimatePresence initial={false}>
                      {open && (
                      <motion.tr className="sales-value-detail-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <td colSpan={3}>
                          <table>
                            <thead>
                              <tr><th>Client Name</th><th>Date</th><th>Sales Value</th></tr>
                            </thead>
                            <tbody>
                              {group.quotations.map((quote, index) => (
                                <tr key={quote._id || quote.id || index}>
                                  <td>{quote.leadDetails?.companyName || quote.companyName || 'Client'}</td>
                                  <td>{formatShortDate(getQuotationDate(quote))}</td>
                                  <td>{formatDashboardInr(quote.__salesValue)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </motion.tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                )
              }) : <tr><td colSpan={3}><EmptyOperationState label="No sales value found" /></td></tr>}
            </tbody>
          </table>
        </div>
      </motion.aside>
    </motion.div>
  )
}

export default function AdminDashboard() {
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null }
  })
  const [users, setUsers] = useState([])
  const [teams, setTeams] = useState([])
  const [clients, setClients] = useState([])
  const [leads, setLeads] = useState([])
  const [quotations, setQuotations] = useState([])
  const [annualReturns, setAnnualReturns] = useState([])
  const [pendingClients, setPendingClients] = useState([])
  const [pendingQuotations, setPendingQuotations] = useState([])
  const [form, setForm] = useState(defaultUserForm)
  const [loading, setLoading] = useState(() => !currentUser)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [rowsPerPage, setRowsPerPage] = useState(8)
  const [operationsRowsPerPage, setOperationsRowsPerPage] = useState(5)
  const [operationsPage, setOperationsPage] = useState(1)
  const [selectedPerformanceUserId, setSelectedPerformanceUserId] = useState('')
  const [selectedPiboCategory, setSelectedPiboCategory] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [teamModalOpen, setTeamModalOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeActionUser, setActiveActionUser] = useState(null)
  const [detailsUser, setDetailsUser] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [editForm, setEditForm] = useState(defaultUserForm)
  const [profileOpen, setProfileOpen] = useState(false)
  const [poDetailsRow, setPoDetailsRow] = useState(null)
  const [quotationDetailsRow, setQuotationDetailsRow] = useState(null)
  const [annualReturnRow, setAnnualReturnRow] = useState(null)
  const [todayLeadsOpen, setTodayLeadsOpen] = useState(false)
  const [salesValueDrawerOpen, setSalesValueDrawerOpen] = useState(false)
  const [operationsReportModal, setOperationsReportModal] = useState(null)
  const [clientAnalyticsOpen, setClientAnalyticsOpen] = useState(false)
  const [dashboardMode, setDashboardMode] = useState('operations')
  const navigate = useNavigate()
  const location = useLocation()
  const isUserManagementView = location.pathname === '/dashboard/users'

  const routeRole = normalizeKey(currentUser?.role)
  const canManageUsers = adminRoles.includes(currentUser?.role) || routeRole === 'manager' || routeRole.includes('operation head')

  useEffect(() => {
    if (!sidebarOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [sidebarOpen])

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const text = `${user.name || ''} ${user.email || ''} ${user.role || ''} ${user.team || ''}`.toLowerCase()
      const matchesSearch = text.includes(query.toLowerCase())
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && user.isActive) ||
        (statusFilter === 'inactive' && !user.isActive)

      return matchesSearch && matchesStatus
    })
  }, [query, statusFilter, users])

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / rowsPerPage))
  const visibleUsers = filteredUsers.slice((page - 1) * rowsPerPage, page * rowsPerPage)
  const operationUsers = users.filter((user) => isOperationsUser(user))
  const activeUsers = operationUsers.filter((user) => user.isActive).length
  const inactiveUsers = operationUsers.filter((user) => !user.isActive).length
  const userById = useMemo(() => new Map(users.map((user) => [String(user._id || user.id), user])), [users])

  const operationAnalytics = useMemo(() => {
    const liveClients = clients.filter((client) => getVisibilityStatus(client) === 'LIVE').length
    const discontinuedClients = clients.filter((client) => getVisibilityStatus(client) === 'DISCONTINUED').length
    const annualFiled = annualReturns.filter((row) => ['filed', 'submitted', 'closed'].includes(String(row.status || '').toLowerCase())).length
    const annualDraft = annualReturns.filter((row) => !['filed', 'submitted', 'closed'].includes(String(row.status || '').toLowerCase())).length
    const sentQuotes = quotations.filter((quote) => ['sent', 'approved'].includes(String(quote.status || quote.approvalStatus || '').toLowerCase())).length
    const draftQuotes = quotations.filter((quote) => String(quote.status || '').toLowerCase() === 'draft').length
    const pendingTotal = pendingClients.length + pendingQuotations.length
    const clientCompletion = clients.length ? Math.round((liveClients / clients.length) * 100) : 0
    const annualCompletion = annualReturns.length ? Math.round((annualFiled / annualReturns.length) * 100) : 0

    return {
      liveClients,
      discontinuedClients,
      annualFiled,
      annualDraft,
      sentQuotes,
      draftQuotes,
      pendingTotal,
      clientCompletion,
      annualCompletion
    }
  }, [annualReturns, clients, pendingClients.length, pendingQuotations.length, quotations])

  const operationsMetrics = [
    { label: 'Operations Clients', value: clients.length, note: `${operationAnalytics.liveClients} live`, icon: ClipboardCheck, tone: 'teal' },
    { label: 'Pending Approvals', value: operationAnalytics.pendingTotal, note: `${pendingClients.length} clients, ${pendingQuotations.length} quotations`, icon: ShieldAlert, tone: 'orange' },
    { label: 'Annual Returns', value: annualReturns.length, note: `${operationAnalytics.annualFiled} filed`, icon: FileCheck2, tone: 'emerald' },
    { label: 'Operations Team', value: operationUsers.length, note: `${activeUsers} active, ${inactiveUsers} inactive`, icon: Users, tone: 'indigo' }
  ]

  const categoryRows = useMemo(() => buildCategoryRows(clients), [clients])
  const teamRows = useMemo(() => buildTeamRows(operationUsers, clients, annualReturns), [operationUsers, clients, annualReturns])
  const recentOperations = useMemo(() => buildRecentOperations(clients, annualReturns, pendingClients, pendingQuotations), [annualReturns, clients, pendingClients, pendingQuotations])
  const workflowRows = useMemo(() => buildWorkflowRows({
    leads,
    clients,
    quotations,
    annualReturns,
    pendingTotal: operationAnalytics.pendingTotal
  }), [annualReturns, clients, leads, operationAnalytics.pendingTotal, quotations])
  const attentionItems = useMemo(() => buildAttentionItems({
    analytics: operationAnalytics,
    clients,
    inactiveUsers
  }), [clients, inactiveUsers, operationAnalytics])
  const controlSignals = useMemo(() => buildControlSignals({
    analytics: operationAnalytics,
    clients,
    quotations,
    pendingClients,
    pendingQuotations,
    activeUsers
  }), [activeUsers, clients, operationAnalytics, pendingClients, pendingQuotations, quotations])
  const allOperationsRows = useMemo(() => buildOperationsRows({
    clients,
    annualReturns,
    quotations,
    users,
    currentUser
  }), [annualReturns, clients, currentUser, quotations, users])
  const scopedOperationsRows = useMemo(
    () => getScopedOperationsRows(allOperationsRows, users, currentUser),
    [allOperationsRows, currentUser, users]
  )
  const scopedOperationAnalytics = useMemo(() => {
    const annualTotal = scopedOperationsRows.reduce((sum, row) => sum + row.annualTotal, 0)
    const annualDone = scopedOperationsRows.reduce((sum, row) => sum + row.annualDone, 0)
    const compliancePending = scopedOperationsRows.filter((row) => row.compliancePending).length
    const poMissing = scopedOperationsRows.filter((row) => !row.hasPo).length
    const quoteMissing = scopedOperationsRows.filter((row) => !row.hasQuotation).length
    const annualCompletion = percent(annualDone, annualTotal)
    const base = Math.round((100 + annualCompletion) / 2)
    const penalty = Math.min(45, compliancePending * 6 + poMissing * 1 + quoteMissing * 1)
    return {
      annualCompletion,
      compliancePending,
      score: Math.max(0, Math.min(100, base - penalty + (compliancePending ? 0 : 8)))
    }
  }, [scopedOperationsRows])
  const operationsScore = scopedOperationAnalytics.score
  const piboCards = useMemo(() => buildPiboCategoryCards(allOperationsRows), [allOperationsRows])
  const operationsLeadAnalytics = useMemo(
    () => buildOperationsLeadAnalytics(leads, users, currentUser),
    [currentUser, leads, users]
  )
  const leadFollowUpItems = useMemo(() => buildLeadFollowUpItems(leads), [leads])
  const operationsFollowUps = useMemo(
    () => getCalendarFollowUpsForUser(currentUser, leadFollowUpItems),
    [currentUser, leadFollowUpItems]
  )
  const convertedOperationsLeadCount = useMemo(
    () => operationsLeadAnalytics.leads.filter((lead) => leadConvertedToClientMaster(lead, clients)).length,
    [clients, operationsLeadAnalytics.leads]
  )
  const operationsAnnualReturnStats = useMemo(() => {
    const total = scopedOperationsRows.reduce((sum, row) => sum + (row.annualTotal || 0), 0)
    const completed = scopedOperationsRows.reduce((sum, row) => sum + (row.annualDone || 0), 0)
    const rejected = scopedOperationsRows.filter((row) => row.compliancePending).length
    return {
      total,
      completed,
      rejected,
      pending: Math.max(0, total - completed - rejected)
    }
  }, [scopedOperationsRows])
  const userPerformanceCards = useMemo(
    () => buildUserPerformanceCards(scopedOperationsRows, users, currentUser, operationsLeadAnalytics.leads),
    [currentUser, operationsLeadAnalytics.leads, scopedOperationsRows, users]
  )
  const selectedPerformanceUser = useMemo(
    () => userPerformanceCards.find((item) => String(item.id) === String(selectedPerformanceUserId)) || null,
    [selectedPerformanceUserId, userPerformanceCards]
  )
  const selectedPerformanceRows = useMemo(
    () => {
      if (!selectedPerformanceUser) return []
      const selectedKeys = new Set((selectedPerformanceUser.matchKeys || [selectedPerformanceUser.id, selectedPerformanceUser.name]).map(normalizeKey).filter(Boolean))
      return scopedOperationsRows.filter((row) => getOperationRowUserKeys(row).some((key) => selectedKeys.has(key)))
    },
    [scopedOperationsRows, selectedPerformanceUser]
  )
  const selectedOperationsRows = useMemo(() => {
    if (selectedPiboCategory) {
      return allOperationsRows.filter((row) => normalizeKey(row.category) === normalizeKey(selectedPiboCategory))
    }
    if (selectedPerformanceUser) return selectedPerformanceRows
    return scopedOperationsRows
  }, [allOperationsRows, scopedOperationsRows, selectedPerformanceRows, selectedPerformanceUser, selectedPiboCategory])
  const selectedOperationsTitle = selectedPiboCategory
    ? `${selectedPiboCategory} Clients`
    : selectedPerformanceUser
      ? `${selectedPerformanceUser.name} Clients`
      : 'Operations Client Table'
  const selectedOperationsNote = selectedPiboCategory
    ? `${selectedOperationsRows.length} ${selectedPiboCategory} clients in Client Master`
    : selectedPerformanceUser
      ? `${selectedOperationsRows.length} clients, ${selectedPerformanceUser.done}/${selectedPerformanceUser.total} annual returns completed`
      : `${scopedOperationsRows.length} visible clients`
  const managerPerformanceCards = useMemo(
    () => buildManagerPerformanceCards(users, scopedOperationsRows),
    [scopedOperationsRows, users]
  )
  const compliancePendingRows = useMemo(() => scopedOperationsRows.filter((row) => row.compliancePending), [scopedOperationsRows])
  const operationsTotalPages = operationsRowsPerPage === 'all' ? 1 : Math.max(1, Math.ceil(selectedOperationsRows.length / operationsRowsPerPage))
  const visibleOperationsRows = operationsRowsPerPage === 'all'
    ? selectedOperationsRows
    : selectedOperationsRows.slice((operationsPage - 1) * operationsRowsPerPage, operationsPage * operationsRowsPerPage)
  const operationsRoleLabel = normalizeKey(currentUser?.role).includes('compliance')
    ? 'Compliance approval view'
    : adminRoles.includes(currentUser?.role)
      ? 'All users'
      : normalizeKey(currentUser?.role) === 'manager'
        ? 'Manager team'
        : 'My assigned clients'
  const currentRole = normalizeKey(currentUser?.role)
  const showDashboardSwitcher = !isUserManagementView && canSwitchDashboard(currentUser)
  const isSalesDashboardView = !isUserManagementView && (isSalesDashboardUser(currentUser) || (showDashboardSwitcher && dashboardMode === 'sales'))
  const salesScopedLeads = useMemo(() => getSalesVisibleRecords(leads, (lead) => leadBelongsToSalesUser(lead, currentUser)), [currentUser, leads])
  const salesTodayLeads = useMemo(() => salesScopedLeads.filter((lead) => isTodayDate(getLeadCreatedDate(lead))), [salesScopedLeads])
  const salesScopedQuotations = useMemo(() => getSalesVisibleRecords(quotations, (quote) => quotationBelongsToSalesUser(quote, currentUser)), [currentUser, quotations])
  const canSeeTeamPerformance = adminRoles.includes(currentUser?.role) || currentRole === 'manager' || currentRole.includes('operation head')

  useEffect(() => {
    loadDashboard()
  }, [location.pathname])

  useEffect(() => {
    setPage(1)
  }, [query, rowsPerPage, statusFilter])

  useEffect(() => {
    setOperationsPage(1)
  }, [operationsRowsPerPage, selectedOperationsRows.length, selectedPiboCategory, selectedPerformanceUserId])

  useEffect(() => {
    if (selectedPerformanceUserId && !userPerformanceCards.some((item) => String(item.id) === String(selectedPerformanceUserId))) {
      setSelectedPerformanceUserId('')
    }
  }, [selectedPerformanceUserId, userPerformanceCards])

  useEffect(() => {
    if (selectedPiboCategory && !piboCards.some((item) => normalizeKey(item.label) === normalizeKey(selectedPiboCategory))) {
      setSelectedPiboCategory('')
    }
  }, [piboCards, selectedPiboCategory])

  function applyDashboardData(snapshot = {}) {
    if (snapshot.currentUser) setCurrentUser(snapshot.currentUser)
    setUsers(snapshot.users || [])
    setTeams(snapshot.teams || [])
    setClients(snapshot.clients || [])
    setLeads(snapshot.leads || [])
    setQuotations(snapshot.quotations || [])
    setAnnualReturns(snapshot.annualReturns || [])
    setPendingClients(snapshot.pendingClients || [])
    setPendingQuotations(snapshot.pendingQuotations || [])
  }

  async function loadDashboard(options = {}) {
    const cacheKey = `${DASHBOARD_CACHE_KEY}:${location.pathname}`
    const cached = !options.force ? readSessionCache(cacheKey) : null
    const requestConfig = { timeout: DASHBOARD_REQUEST_TIMEOUT_MS }
    if (cached) {
      applyDashboardData(cached)
      setLoading(false)
    } else if (!currentUser) {
      setLoading(true)
    }
    setError('')

    try {
      const meResponse = await api.get(API_ENDPOINTS.auth.me, requestConfig)
      const user = meResponse.data.user
      setCurrentUser(user)
      storeSessionUser(user)
      setLoading(false)

      if (isUserManagementView) {
        if (adminRoles.includes(user.role)) {
          const [usersResponse, teamsResponse] = await Promise.all([
            api.get(API_ENDPOINTS.auth.adminUsers, requestConfig),
            api.get(API_ENDPOINTS.teams.list, requestConfig)
          ])
          const snapshot = {
            currentUser: user,
            users: usersResponse.data.users || [],
            teams: teamsResponse.data.teams || [],
            clients: [],
            leads: [],
            quotations: [],
            annualReturns: [],
            pendingClients: [],
            pendingQuotations: []
          }
          applyDashboardData(snapshot)
          writeSessionCache(cacheKey, snapshot)
        } else {
          const usersResponse = await api.get(API_ENDPOINTS.auth.users, requestConfig)
          const snapshot = {
            currentUser: user,
            users: usersResponse.data.users || [user],
            teams: [],
            clients: [],
            leads: [],
            quotations: [],
            annualReturns: [],
            pendingClients: [],
            pendingQuotations: []
          }
          applyDashboardData(snapshot)
          writeSessionCache(cacheKey, snapshot)
        }
        return
      }

      const [clientsResult, ccpClientsResult, leadsResult, ccpLeadsResult, quotationsResult, annualReturnsResult, approvalsResult] = await Promise.allSettled([
        api.get(API_ENDPOINTS.clients.list, requestConfig),
        fetchCcpClients(),
        api.get(API_ENDPOINTS.leads.list, requestConfig),
        fetchCcpLeads(),
        api.get(API_ENDPOINTS.quotations.list, requestConfig),
        api.get(API_ENDPOINTS.annualReturns.list, requestConfig),
        api.get(API_ENDPOINTS.clients.pendingApprovals, requestConfig)
      ])

      const crmClients = clientsResult.status === 'fulfilled' ? (clientsResult.value.data.clients || []) : []
      const ccpClients = ccpClientsResult.status === 'fulfilled' && ccpClientsResult.value.data?.ok !== false
        ? (ccpClientsResult.value.data.clients || [])
        : []
      const mergedClients = mergeClientSources(crmClients, ccpClients)
      const nextClients = mergedClients.length ? mergedClients : (cached?.clients || [])
      const freshLeads = mergeLeadSources(
        leadsResult.status === 'fulfilled' ? (leadsResult.value.data.leads || []) : [],
        ccpLeadsResult.status === 'fulfilled' && ccpLeadsResult.value.data?.ok !== false ? (ccpLeadsResult.value.data.leads || []) : []
      )
      const nextLeads = freshLeads.length ? freshLeads : (cached?.leads || [])
      const nextQuotations = quotationsResult.status === 'fulfilled' ? (quotationsResult.value.data.quotations || []) : []
      const nextAnnualReturns = annualReturnsResult.status === 'fulfilled' ? (annualReturnsResult.value.data.annualReturns || []) : []
      const approvals = approvalsResult.status === 'fulfilled' ? approvalsResult.value.data : {}
      const nextPendingClients = approvals.pendingClients || []
      const nextPendingQuotations = approvals.pendingQuotations || []

      let nextUsers = []
      let nextTeams = []
      if (adminRoles.includes(user.role)) {
        const [usersResponse, teamsResponse] = await Promise.all([
          api.get(API_ENDPOINTS.auth.adminUsers, requestConfig),
          api.get(API_ENDPOINTS.teams.list, requestConfig)
        ])
        nextUsers = usersResponse.data.users || []
        nextTeams = teamsResponse.data.teams || []
      } else {
        const usersResponse = await api.get(API_ENDPOINTS.auth.users, requestConfig)
        nextUsers = usersResponse.data.users || [user]
        nextTeams = []
      }
      const snapshot = {
        currentUser: user,
        users: nextUsers,
        teams: nextTeams,
        clients: nextClients,
        leads: nextLeads,
        quotations: nextQuotations,
        annualReturns: nextAnnualReturns,
        pendingClients: nextPendingClients,
        pendingQuotations: nextPendingQuotations
      }
      applyDashboardData(snapshot)
      writeSessionCache(cacheKey, snapshot)
    } catch (err) {
      if (!cached) setError(err?.response?.data?.error || 'Unable to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateUser(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')

    const name = `${form.firstName} ${form.lastName}`.trim()

    try {
      const response = await api.post(API_ENDPOINTS.auth.createUser, {
        name,
        email: form.email,
        password: form.password,
        avatarUrl: form.avatarUrl,
        role: form.role,
        team: form.team,
        teamId: form.teamId,
        managerId: form.managerId,
        operationHeadId: form.operationHeadId,
        isActive: form.isActive
      })
      setUsers((prevUsers) => [response.data.user, ...prevUsers])
      setForm(defaultUserForm)
      setModalOpen(false)
      setNotice(buildUserSyncNotice(response.data.ccpSync, 'New user added successfully. They can login with OTP from the sign-in page.'))
    } catch (err) {
      setError(err?.response?.data?.error || 'Unable to create user')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateTeam(teamForm) {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      const response = await api.post(API_ENDPOINTS.teams.create, teamForm)
      setTeams((prevTeams) => [response.data.team, ...prevTeams])
      setTeamModalOpen(false)
      setNotice('Team created successfully. Manager can now see selected users plus their own data.')
    } catch (err) {
      setError(err?.response?.data?.error || 'Unable to create team')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateUser(event) {
    event.preventDefault()
    if (!editingUser) return

    setSaving(true)
    setError('')
    setNotice('')

    const name = `${editForm.firstName} ${editForm.lastName}`.trim()
    const id = editingUser._id || editingUser.id

    try {
      const response = await api.put(API_ENDPOINTS.auth.adminUser(id), {
        name,
        email: editForm.email,
        avatarUrl: editForm.avatarUrl,
        role: editForm.role,
        team: editForm.team,
        teamId: editForm.teamId,
        managerId: editForm.managerId,
        operationHeadId: editForm.operationHeadId,
        isActive: editForm.isActive
      })
      const updatedUser = response.data.user
      setUsers((prevUsers) =>
        prevUsers.map((user) => ((user._id || user.id) === id ? { ...user, ...updatedUser, _id: updatedUser._id || updatedUser.id || id } : user))
      )
      setEditingUser(null)
      setEditForm(defaultUserForm)
      setNotice(buildUserSyncNotice(response.data.ccpSync, 'User updated successfully.'))
    } catch (err) {
      setError(err?.response?.data?.error || 'Unable to update user')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateProfile(profile) {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      const response = await api.put(API_ENDPOINTS.auth.me, profile)
      const updatedUser = response.data.user
      setCurrentUser(updatedUser)
      setUsers((prevUsers) =>
        prevUsers.map((user) => ((user._id || user.id) === (updatedUser._id || updatedUser.id) ? { ...user, ...updatedUser } : user))
      )
      setNotice('Profile updated successfully.')
    } catch (err) {
      setError(err?.response?.data?.error || 'Unable to update profile')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdatePassword(passwords) {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      await api.put(API_ENDPOINTS.auth.password, passwords)
      setNotice('Password updated successfully.')
    } catch (err) {
      const message = err?.response?.data?.error || 'Unable to update password'
      setError(message)
      throw new Error(message)
    } finally {
      setSaving(false)
    }
  }

  function openDetails(user) {
    setActiveActionUser(null)
    setDetailsUser(user)
  }

  function openEdit(user) {
    const name = splitName(user.name)
    setActiveActionUser(null)
    setDetailsUser(null)
    setEditingUser(user)
    setEditForm({
      firstName: name.firstName === '-' ? '' : name.firstName,
      lastName: name.lastName === '-' ? '' : name.lastName,
      email: user.email || '',
      avatarUrl: user.avatarUrl || '',
      role: user.role || 'operation',
        team: user.team || 'No team assigned',
        teamId: user.teamId || '',
        managerId: user.managerId || '',
        operationHeadId: user.operationHeadId || '',
        isActive: Boolean(user.isActive)
    })
  }

  function handleLogout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('login_email')
    navigate('/', { replace: true })
  }

  function closeModal() {
    if (saving) return
    setModalOpen(false)
    setForm(defaultUserForm)
  }

  function openAnnualReturn(row = {}) {
    if (row.clientKey) {
      setAnnualReturnRow(row)
      return
    }
    navigate('/sales/annual-returns')
  }

  function openAnnualReturnYear(yearLabel) {
    if (!annualReturnRow?.clientKey || !yearLabel) return
    navigate(`/sales/client-data-processing/${encodeURIComponent(annualReturnRow.clientKey)}/${encodeURIComponent(yearLabel)}`)
  }

  function openQuotation(row = {}) {
    if (!row.hasQuotation) return
    setQuotationDetailsRow(row)
  }

  function openPoDetails(row = {}) {
    console.debug('[OperationsTable:po-view-click]', {
      atplCode: row.atplCode,
      companyName: row.companyName,
      hasPo: row.hasPo,
      poDetails: row.poDetails
    })
    setPoDetailsRow(row)
  }

  if (loading) {
    return <AdminDashboardSkeleton />
  }

  return (
    <main className="min-h-screen bg-[#eef7f5] pt-16 text-slate-900">
      <Topbar
        currentUser={currentUser}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenSidebar={() => setSidebarOpen(true)}
        onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
        sidebarCollapsed={sidebarCollapsed}
        onLogout={handleLogout}
      />
      <div className="flex min-h-[calc(100vh-4rem)]">
        <aside
          className={`fixed bottom-0 left-0 top-16 z-40 w-[296px] border-r border-emerald-100 bg-white shadow-xl shadow-emerald-900/5 transition-all duration-300 ease-out lg:translate-x-0 ${
            sidebarCollapsed ? 'lg:w-[84px]' : 'lg:w-[296px]'
          } ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <Sidebar
            currentUser={currentUser}
            collapsed={sidebarCollapsed}
            dashboardMode={dashboardMode}
            onDashboardModeChange={setDashboardMode}
            onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
            onClose={() => setSidebarOpen(false)}
            onLogout={handleLogout}
          />
        </aside>

        {sidebarOpen && (
          <button
            type="button"
            className="fixed bottom-0 left-0 right-0 top-16 z-30 bg-slate-950/30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          />
        )}

        <section className={`min-w-0 flex-1 transition-all duration-300 ease-out ${sidebarCollapsed ? 'lg:ml-[84px]' : 'lg:ml-[296px]'}`}>
          <div className="px-4 py-6 sm:px-6 lg:px-8">
            <div className={isUserManagementView ? 'space-y-6' : 'operations-dashboard'}>
              {!isUserManagementView && (
                <>
                {isSalesDashboardView ? (
                  <SalesDashboard
                    leads={leads}
                    quotations={quotations}
                    clients={clients}
                    currentUser={currentUser}
                    onOpenTodayLeads={() => setTodayLeadsOpen(true)}
                    onOpenSalesValue={() => setSalesValueDrawerOpen(true)}
                  />
                ) : (
                  <>
              <div className="operations-hero">
                <div className="flex min-w-0 items-center gap-4">
                  <span className="operations-hero-icon"><Activity className="h-6 w-6" /></span>
                  <div className="min-w-0">
                    <h1>Operations Dashboard</h1>
                    <div className="operations-hero-meta">
                      <span><Users className="h-3.5 w-3.5" /> {clients.length.toLocaleString('en-IN')} clients</span>
                      <span><FileText className="h-3.5 w-3.5" /> {quotations.length.toLocaleString('en-IN')} quotations</span>
                      <span><CalendarDays className="h-3.5 w-3.5" /> {operationsFollowUps.length.toLocaleString('en-IN')} follow-ups</span>
                    </div>
                  </div>
                </div>
                <div className="operations-hero-actions">
                  <button
                    type="button"
                    onClick={() => setClientAnalyticsOpen(true)}
                    className="operations-client-analytics-button btn-lift"
                  >
                    <BarChart3 className="h-4 w-4" />
                    Client Analytics
                  </button>
                  <button
                    type="button"
                    onClick={() => loadDashboard({ force: true })}
                    className="btn-lift inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-teal-200 bg-white px-4 font-black text-teal-700 shadow-sm transition hover:bg-teal-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </button>
                </div>
              </div>

              {error && <ToastMessage type="error" className="mt-5">{error}</ToastMessage>}
              {notice && <ToastMessage type="success" className="mt-5">{notice}</ToastMessage>}

              <section className="operations-panel operations-snapshot-panel">
                <PanelHeader icon={PieChart} title="Operations Snapshot" note="Lead, conversion and annual return overview" />
                <div className="operations-snapshot-grid">
                  <article className="operations-kpi-card operations-kpi-card-blue">
                    <div className="operations-kpi-content">
                      <strong>{clients.length.toLocaleString('en-IN')}</strong>
                      <span>Total Clients</span>
                      <small>12% vs last month</small>
                    </div>
                    <div className="operations-kpi-icon"><Users className="h-5 w-5" /></div>
                    <i aria-hidden="true" />
                  </article>
                  <article className="operations-kpi-card operations-kpi-card-green">
                    <div className="operations-kpi-content">
                      <strong>{quotations.filter((quote) => !['approved', 'rejected', 'closed'].includes(String(quote.status || quote.approvalStatus || '').toLowerCase())).length.toLocaleString('en-IN')}</strong>
                      <span>Open Quotations</span>
                      <small>8% vs last month</small>
                    </div>
                    <div className="operations-kpi-icon"><FileText className="h-5 w-5" /></div>
                    <i aria-hidden="true" />
                  </article>
                  <article className="operations-kpi-card operations-kpi-card-cyan">
                    <div className="operations-kpi-content">
                      <strong>{operationsFollowUps.filter((item) => item.scheduledDate === dateKey()).length.toLocaleString('en-IN')}</strong>
                      <span>Today's Follow-ups</span>
                      <small>0% vs yesterday</small>
                    </div>
                    <div className="operations-kpi-icon"><CalendarDays className="h-5 w-5" /></div>
                    <i aria-hidden="true" />
                  </article>
                  <article className="operations-kpi-card operations-kpi-card-violet">
                    <div className="operations-kpi-content">
                      <strong>{activeUsers.toLocaleString('en-IN')}</strong>
                      <span>Active Users</span>
                      <small>6% vs last month</small>
                    </div>
                    <div className="operations-kpi-icon"><UserRound className="h-5 w-5" /></div>
                    <i aria-hidden="true" />
                  </article>
                </div>
              </section>

              <div className="operations-dashboard-row operations-dashboard-row-followup">
                <DashboardFollowUpTimeline
                  items={operationsFollowUps}
                  users={users}
                  onCalendar={() => navigate('/calendar')}
                  onView={() => setOperationsReportModal({
                    title: 'Follow-ups',
                    subtitle: `${operationsFollowUps.length} calendar follow-up records`,
                    columns: ['Date', 'Time', 'Title', 'Company', 'Owner', 'Priority', 'Status'],
                    rows: operationsFollowUps.map((item) => [
                      formatShortDate(item.scheduledDate),
                      item.scheduledTime || 'No time',
                      displayValue(item.title, '-'),
                      getCalendarFollowUpCompany(item),
                      getCalendarFollowUpOwner(item),
                      displayValue(item.priority, 'Medium'),
                      displayValue(item.status, 'open')
                    ]),
                    actionLabel: 'Open Calendar',
                    onAction: () => navigate('/calendar')
                  })}
                />

              </div>

              <OperationsLeadAnalytics
                analytics={operationsLeadAnalytics}
                piboCards={piboCards}
                convertedLeadCount={convertedOperationsLeadCount}
                annualReturnStats={operationsAnnualReturnStats}
                followUps={operationsFollowUps}
                onOpenCalendar={() => navigate('/calendar')}
                onViewFollowUps={() => setOperationsReportModal({
                  title: 'Follow-ups',
                  subtitle: `${operationsFollowUps.length} calendar follow-up records`,
                  columns: ['Date', 'Time', 'Title', 'Company', 'Owner', 'Priority', 'Status'],
                  rows: operationsFollowUps.map((item) => [
                    formatShortDate(item.scheduledDate),
                    item.scheduledTime || 'No time',
                    displayValue(item.title, '-'),
                    getCalendarFollowUpCompany(item),
                    getCalendarFollowUpOwner(item),
                    displayValue(item.priority, 'Medium'),
                    displayValue(item.status, 'open')
                  ]),
                  actionLabel: 'Open Calendar',
                  onAction: () => navigate('/calendar')
                })}
              />

              {canSeeTeamPerformance && (
                <div className="operations-dashboard-row operations-dashboard-row-annual">
                  <OperationsAnnualReturnProgress annualReturnStats={operationsAnnualReturnStats} />
                  <section className="operations-panel operations-performance-panel">
                    <PanelHeader icon={TrendingUp} title="Annual Return Performance" note="Team wise annual return completion" />
                    <div className="operations-performance-grid">
                      {userPerformanceCards.length ? userPerformanceCards.slice(0, 5).map((item) => (
                        <PerformanceCard
                          key={item.id}
                          item={item}
                          selected={String(selectedPerformanceUserId) === String(item.id)}
                          onClick={() => {
                            setSelectedPiboCategory('')
                            setSelectedPerformanceUserId((current) => String(current) === String(item.id) ? '' : item.id)
                          }}
                        />
                      )) : <EmptyOperationState label="No annual return ownership found" />}
                    </div>
                    {userPerformanceCards.length > 5 && (
                      <button
                        type="button"
                        className="operations-performance-more"
                        onClick={() => setOperationsReportModal({
                          title: 'Remaining Annual Return Users',
                          subtitle: `${userPerformanceCards.length - 5} users outside the top 5 performance cards`,
                          columns: ['User', 'Completed', 'Assigned Leads', 'Progress', 'Pending Compliance'],
                          rows: userPerformanceCards.slice(5).map((item) => [
                            item.name,
                            item.done,
                            item.total,
                            `${item.percent}%`,
                            item.pendingCompliance || 0
                          ])
                        })}
                      >
                        <strong>{userPerformanceCards.length - 5} more users</strong>
                        <span>{userPerformanceCards.slice(5).reduce((sum, item) => sum + (item.total || 0), 0)} leads in remaining team workload</span>
                      </button>
                    )}
                  </section>
                </div>
              )}

              {canSeeTeamPerformance && (
                <section className="operations-panel">
                  <PanelHeader icon={Users} title="Manager Workload" note="Manager wise users and annual return progress" />
                  <div className="operations-performance-grid">
                    {managerPerformanceCards.length ? managerPerformanceCards.map((item) => (
                      <PerformanceCard key={item.id} item={item} type="manager" />
                    )) : <EmptyOperationState label="No manager workload found" />}
                  </div>
                </section>
              )}

              {normalizeKey(currentUser?.role).includes('compliance') && (
                <section className="operations-panel">
                  <PanelHeader icon={ShieldAlert} title="Compliance Approval Required" note={`${compliancePendingRows.length} annual returns waiting for approval`} />
                  <div className="operations-approval-users">
                    {compliancePendingRows.length ? compliancePendingRows.map((row) => (
                      <div key={`${row.id}-approval`} className="operations-approval-user">
                        <span><UserRound className="h-4 w-4" /></span>
                        <strong>{row.userName}</strong>
                        <p>{row.companyName}</p>
                      </div>
                    )) : <EmptyOperationState label="No annual return approval pending" />}
                  </div>
                </section>
              )}

              <section className="operations-panel">
                <div className="operations-table-head">
                  <PanelHeader icon={ListChecks} title={selectedOperationsTitle} note={selectedOperationsNote} />
                  <div className="operations-table-controls">
                    {(selectedPiboCategory || selectedPerformanceUser) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPiboCategory('')
                          setSelectedPerformanceUserId('')
                        }}
                        className="operations-view-button"
                      >
                        Clear filter
                      </button>
                    )}
                    <span>Rows</span>
                    <select
                      value={operationsRowsPerPage}
                      onChange={(event) => setOperationsRowsPerPage(event.target.value === 'all' ? 'all' : Number(event.target.value))}
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none focus:border-emerald-300"
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={15}>15</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value="all">All</option>
                    </select>
                  </div>
                </div>
                <div className="operations-table-wrap">
                  <table className="operations-table">
                    <thead>
                      <tr>
                        {['ATPL Code', 'Company Name', 'EPR Year', 'PIBO', 'Quotation', 'PO', 'Annual Return', 'Compliance', 'Action'].map((header) => <th key={header}>{header}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleOperationsRows.length ? visibleOperationsRows.map((row) => (
                        <tr key={row.id}>
                          <td><strong>{row.atplCode}</strong></td>
                          <td>
                            <div className="operations-company-cell">
                              <strong>{row.companyName}</strong>
                              <span>{row.userName}</span>
                            </div>
                          </td>
                          <td>
                            <div className="operations-epr-year-cell">
                              <span><CalendarDays className="h-3.5 w-3.5" /></span>
                              <div>
                                <strong>{row.annualYear || '-'}</strong>
                                <small>April - March</small>
                              </div>
                            </div>
                          </td>
                          <td>{row.category}</td>
                          <td>
                            <span className={`operations-status-pill ${row.hasQuotation ? 'operations-status-yes' : 'operations-status-no'}`}>
                              {row.hasQuotation ? 'Yes' : 'No'}{row.quoteCount ? ` (${row.quoteCount})` : ''}
                            </span>
                            <button
                              type="button"
                              onClick={() => openQuotation(row)}
                              disabled={!row.hasQuotation}
                              className={`operations-inline-view ${!row.hasQuotation ? 'operations-inline-view-muted' : ''}`}
                              title={row.hasQuotation ? 'View mapped quotation' : 'No quotation found for this client'}
                            >
                              <Eye className="h-3.5 w-3.5" /> View
                            </button>
                          </td>
                          <td>
                            <div className="operations-po-cell">
                              <span className={`operations-status-pill ${row.hasPo ? 'operations-status-yes' : 'operations-status-no'}`}>
                                {row.hasPo ? 'Yes' : 'No'}
                              </span>
                              <button
                                type="button"
                                onClick={() => openPoDetails(row)}
                                className={`operations-inline-view ${!row.hasPo ? 'operations-inline-view-muted' : ''}`}
                                title="View Compliance PO details"
                              >
                                <Eye className="h-3.5 w-3.5" /> View
                              </button>
                            </div>
                          </td>
                          <td>
                            <div className={`operations-annual-cell operations-performance-${getPerformanceTone(row.annualPercent)}`}>
                              <strong>{row.annualDone}/{row.annualTotal}</strong>
                              <span>{row.annualPercent}%</span>
                              <i><em style={{ width: `${row.annualPercent}%` }} /></i>
                            </div>
                          </td>
                          <td>
                            <span className={`operations-status-pill ${row.compliancePending ? 'operations-status-no' : 'operations-status-yes'}`}>
                              {row.compliancePending ? 'Pending' : 'Clear'}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => openAnnualReturn(row)}
                              className="operations-view-button"
                              title="View Annual Return"
                            >
                              <Eye className="h-3.5 w-3.5" /> Annual Return
                            </button>
                          </td>
                        </tr>
                      )) : (
                        <tr><td colSpan={9}><EmptyOperationState label="No operation data found for this selection" /></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="operations-pagination">
                  <span>Page {operationsPage} of {operationsTotalPages}</span>
                  <div>
                    <button type="button" disabled={operationsPage <= 1} onClick={() => setOperationsPage((value) => Math.max(1, value - 1))}>Previous</button>
                    <button type="button" disabled={operationsPage >= operationsTotalPages} onClick={() => setOperationsPage((value) => Math.min(operationsTotalPages, value + 1))}>Next</button>
                  </div>
                </div>
              </section>
                  </>
                )}
                </>
              )}

              {isUserManagementView && (
                <>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <button
                        type="button"
                        onClick={() => navigate('/dashboard')}
                        className="btn-lift grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-emerald-100 bg-white text-emerald-700 shadow-sm hover:bg-emerald-50"
                        aria-label="Back to dashboard"
                        title="Back"
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </button>
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-700">Admin User Master</p>
                        <h1 className="mt-1 text-3xl font-black leading-tight text-slate-950">Admin Users</h1>
                      </div>
                    </div>
                  {canManageUsers && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setTeamModalOpen(true)}
                        className="btn-lift inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-200 bg-white px-4 text-sm font-black text-emerald-700 shadow-sm hover:bg-emerald-50"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Create Team
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalOpen(true)}
                        className="btn-lift inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-5 text-sm font-black text-white shadow-lg shadow-emerald-900/20 hover:bg-emerald-800"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Create Admin User
                      </button>
                    </div>
                  )}
                  </div>

                  <KpiSummary
                    metrics={[
                      { label: 'Active Users', value: users.filter((user) => user.isActive).length, note: 'Ready for assignment', icon: CheckCircle2, valueClass: 'text-slate-900', iconClass: 'bg-emerald-50 text-emerald-700' },
                      { label: 'Inactive Users', value: users.filter((user) => !user.isActive).length, note: 'Needs attention', icon: ShieldAlert, valueClass: 'text-amber-600', iconClass: 'bg-amber-50 text-amber-600' }
                    ]}
                  />

                  {error && <ToastMessage type="error">{error}</ToastMessage>}
                  {notice && <ToastMessage type="success">{notice}</ToastMessage>}

              <section id="user-management" className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
                <div className="flex flex-col gap-4 border-b border-emerald-100 p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
                  <label className="relative block w-full xl:max-w-sm">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="h-11 w-full rounded-2xl border border-transparent bg-slate-100 pl-11 pr-4 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-200 focus:bg-white focus:ring-4 focus:ring-emerald-50"
                      placeholder="Search user"
                    />
                  </label>

                  <div className="flex flex-wrap gap-3">
                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 outline-none focus:border-emerald-300">
                      <option value="all">All</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => loadDashboard({ force: true })}
                      className="btn-lift inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 text-sm font-black text-emerald-700 hover:bg-emerald-50"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Refresh
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
                  <span className="text-sm font-black text-slate-900">Rows per page</span>
                  <select value={rowsPerPage} onChange={(event) => setRowsPerPage(Number(event.target.value))} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none focus:border-emerald-300">
                    <option value={8}>8</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                  </select>
                </div>

                <div className="grid gap-3 px-4 pb-5 sm:px-5 md:grid-cols-2 2xl:grid-cols-4">
                  {visibleUsers.length ? visibleUsers.map((user) => {
                    const id = user._id || user.id
                    const initial = (user.name || user.email || 'U').slice(0, 1).toUpperCase()
                    return (
                      <article key={id} className="relative overflow-visible rounded-xl border border-emerald-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-900/10">
                        <div className="min-h-24 rounded-t-xl bg-emerald-50 p-4">
                          <span className={`inline-flex rounded-lg px-4 py-2 text-sm font-black ${user.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {user.isActive ? 'Active' : 'Inactive'}
                          </span>
                          <div className="absolute right-5 top-4">
                            <UserActionsMenu
                              open={String(activeActionUser || '') === String(id)}
                              onToggle={() => setActiveActionUser((value) => (String(value || '') === String(id) ? null : id))}
                              onView={() => openDetails(user)}
                              onEdit={() => openEdit(user)}
                              label={`Actions for ${user.name || user.email || 'user'}`}
                            />
                          </div>
                        </div>
                        <div className="-mt-11 px-4 pb-4 text-center">
                          <div className="mx-auto grid h-24 w-24 place-items-center overflow-hidden rounded-3xl border-4 border-white bg-gradient-to-br from-teal-700 to-sky-700 text-3xl font-black text-white shadow-lg shadow-slate-900/20">
                            {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : initial}
                          </div>
                          <h3 className="mt-4 truncate text-xl font-black text-slate-950">{user.name || 'Unnamed user'}</h3>
                          <p className="mt-1 text-sm font-black text-indigo-600">{roleLabels[user.role] || user.role || '-'}</p>

                          <div className="mt-6 rounded-xl bg-slate-50 p-4 text-left">
                            <div className="grid grid-cols-2 gap-4 border-b border-slate-200 pb-3">
                              <div>
                                <p className="text-xs font-bold text-slate-500">Department</p>
                                <p className="mt-1 truncate text-sm font-black text-slate-950">{user.team || 'No team assigned'}</p>
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-500">Created Date</p>
                                <p className="mt-1 text-sm font-black text-slate-950">{formatShortDate(user.createdAt)}</p>
                              </div>
                            </div>
                            <div className="mt-3 grid gap-2 text-sm font-bold text-slate-600">
                              <p className="flex min-w-0 items-center gap-2">
                                <Mail className="h-4 w-4 shrink-0 text-indigo-600" />
                                <span className="truncate">{user.email || '-'}</span>
                              </p>
                              <p className="flex min-w-0 items-center gap-2">
                                <CalendarDays className="h-4 w-4 shrink-0 text-indigo-600" />
                                <span className="truncate">Last login: {formatDateTime(user.lastLogin)}</span>
                              </p>
                            </div>
                          </div>
                        </div>
                      </article>
                    )
                  }) : <EmptyOperationState label="No users match current filters" />}
                </div>

                <div className="flex flex-col gap-3 border-t border-emerald-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <p className="text-sm font-bold text-slate-500">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((value) => Math.max(1, value - 1))}
                      className="btn-lift min-h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                      className="btn-lift min-h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </section>
                </>
              )}
            </div>
          </div>
        </section>
      </div>

      {poDetailsRow && <PoDetailsModal row={poDetailsRow} onClose={() => setPoDetailsRow(null)} />}
      {quotationDetailsRow && <QuotationDetailsModal row={quotationDetailsRow} onClose={() => setQuotationDetailsRow(null)} />}
      <AnimatePresence>
        {operationsReportModal && <SalesReportModal report={operationsReportModal} onClose={() => setOperationsReportModal(null)} />}
      </AnimatePresence>
      <AnimatePresence>
        {todayLeadsOpen && <TodayLeadsModal leads={salesTodayLeads} onClose={() => setTodayLeadsOpen(false)} />}
      </AnimatePresence>
      {annualReturnRow && (
        <AnnualReturnYearModal
          row={annualReturnRow}
          onClose={() => setAnnualReturnRow(null)}
          onSelectYear={openAnnualReturnYear}
        />
      )}
      <AnimatePresence>
        {clientAnalyticsOpen && (
          <ClientOwnershipAnalyticsModal rows={scopedOperationsRows} onClose={() => setClientAnalyticsOpen(false)} />
        )}
      </AnimatePresence>
      {modalOpen && (
        <AddUserModal
          form={form}
          saving={saving}
          error={error}
          onChange={setForm}
          onClose={closeModal}
          onSubmit={handleCreateUser}
          teams={teams}
        />
      )}
      {teamModalOpen && (
        <CreateTeamModal
          users={users}
          saving={saving}
          error={error}
          onClose={() => {
            if (saving) return
            setTeamModalOpen(false)
          }}
          onSubmit={handleCreateTeam}
        />
      )}
      {detailsUser && (
        <UserDetailsModal
          user={detailsUser}
          onClose={() => setDetailsUser(null)}
          onEdit={() => openEdit(detailsUser)}
        />
      )}
      {editingUser && (
        <EditUserModal
          form={editForm}
          saving={saving}
          onChange={setEditForm}
          onClose={() => {
            if (saving) return
            setEditingUser(null)
            setEditForm(defaultUserForm)
          }}
          onSubmit={handleUpdateUser}
        />
      )}
      {profileOpen && (
        <ProfileModal
          user={currentUser}
          saving={saving}
          onClose={() => setProfileOpen(false)}
          onLogout={handleLogout}
          onSave={handleUpdateProfile}
          onUpdatePassword={handleUpdatePassword}
        />
      )}
    </main>
  )
}
