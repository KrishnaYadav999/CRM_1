import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  Activity, ArrowUpDown, Building2, CalendarDays, CheckCircle2, Clock3, Download, Eye, FileSpreadsheet,
  Lightbulb, Loader2, Monitor, RefreshCw, RotateCcw, Search, ShieldAlert,
  TicketCheck, Timer, UserCheck, Users, X, FileText, BarChart3
} from 'lucide-react'
import DashboardShell from '../components/dashboard/DashboardShell'
import UserWorkDrilldown from '../components/dashboard/UserWorkDrilldown'
import api from '../services/api'
import { API_ENDPOINTS } from '../services/apiEndpoints'
import {
  downloadOperationMisPdf, downloadProductivityPdf, downloadSalesMisPdf, exportProductivityExcel,
  formatDateTime, formatDuration, formatReportDate, REPORT_TITLE
} from '../utils/productivityReportExports'

const roleLabels = { superadmin: 'Super Admin', admin: 'Admin', manager: 'Manager', operation: 'Operation', sales: 'Sales', compliance: 'Compliance', accounts: 'Accounts' }
const defaultRange = () => ({ from: inputDate(-6), to: inputDate(0), search: '', role: 'all', user: 'all', risk: 'all', status: 'all' })

function inputDate(offsetDays = 0) {
  const value = new Date(Date.now() + offsetDays * 86400000)
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
  const pick = (type) => parts.find((item) => item.type === type)?.value || ''
  return `${pick('year')}-${pick('month')}-${pick('day')}`
}

function entityId(value) {
  if (value && typeof value === 'object') return String(value._id || value.id || '')
  return String(value || '')
}

function displayText(value, fallback = '-') {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'object') return String(value.name || value.email || value.label || value._id || value.id || fallback)
  return String(value)
}

function dateInReportRange(value, from, to) {
  const date = String(value || '').slice(0, 10)
  return Boolean(date && date >= from && date <= to)
}

function fallbackCompletion(data = {}) {
  let filled = 0
  let total = 0
  const visit = (value, key = '') => {
    if (/password|otp|token|secret/i.test(key)) return
    if (Array.isArray(value)) { value.forEach((item) => visit(item, key)); return }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value).filter(([field]) => !/^(_id|createdAt|updatedAt)$/i.test(field))
      if (entries.some(([field]) => /^(url|secureUrl|dataUrl|path|publicId|name|fileName)$/i.test(field))) {
        total += 1
        if (entries.some(([field, item]) => /^(url|secureUrl|dataUrl|path|publicId|name|fileName)$/i.test(field) && item)) filled += 1
        return
      }
      entries.forEach(([field, item]) => visit(item, field))
      return
    }
    total += 1
    if (value !== undefined && value !== null && String(value).trim() !== '') filled += 1
  }
  visit(data)
  return { filled, missing: Math.max(0, total - filled) }
}

function buildFallbackMisReport({ users = [], leads = [], clients = [], teams = [], from, to }) {
  const periodClients = clients.filter((client) => dateInReportRange(client.createdAt, from, to))
  const identity = (value) => String(entityId(value) || '').trim().toLowerCase().replace(/\s+/g, ' ')
  const rows = users.map((account) => {
    const id = entityId(account._id || account.id)
    const aliases = new Set([id, account.crmUserId, account.email, account.name].map(identity).filter(Boolean))
    const ownedLeads = leads.filter((lead) => [lead.createdBy, lead.createdByCrmUserId, lead.createdByEmail, lead.createdByName, lead.importedCreatedBy].map(identity).some((value) => aliases.has(value)))
    const ownedClients = periodClients.filter((client) => entityId(client.createdBy) === id)
    const completion = ownedClients.map((client) => fallbackCompletion(client.data || {}))
    const clientFieldsFilled = completion.reduce((sum, item) => sum + item.filled, 0)
    const clientFieldsMissing = completion.reduce((sum, item) => sum + item.missing, 0)
    const closedLeads = ownedLeads.filter((lead) => lead.closedBy || lead.closedAt || /closed/i.test(String(lead.status || ''))).length
    return {
      id, name: displayText(account.name || account.email, 'Unnamed user'), email: displayText(account.email, ''),
      role: String(account.role || '').toLowerCase(), team: displayText(account.team, 'No team assigned'), managerId: entityId(account.managerId),
      active: account.isActive !== false, online: false, presence: account.lastLogin ? 'Offline' : 'Never Logged In', lastLogin: account.lastLogin || null,
      lastActivity: account.lastLogin || null, totalLeads: ownedLeads.length, closedLeads, openLeads: Math.max(0, ownedLeads.length - closedLeads),
      clientMasters: ownedClients.length, clientFieldsFilled, clientFieldsMissing,
      draftClients: ownedClients.filter((client) => String(client.workflowStatus || 'draft').toLowerCase() === 'draft').length,
      submittedClients: ownedClients.filter((client) => String(client.workflowStatus || '').toLowerCase() === 'submitted').length,
      clientCompletionPercentage: clientFieldsFilled + clientFieldsMissing ? Math.round(clientFieldsFilled / (clientFieldsFilled + clientFieldsMissing) * 100) : 0,
      activeSeconds: 0, openSeconds: 0, awaySeconds: 0, activityCount: 0, sessions: 0, score: 0,
      tickets: { total: 0, open: 0, resolved: 0 }, risk: { key: account.lastLogin ? 'healthy' : 'never', level: account.lastLogin ? 'Low Risk' : 'Never Logged In', reason: account.lastLogin ? 'Fallback MIS data' : 'No successful CRM login recorded', rank: account.lastLogin ? 1 : 5 },
      recentActions: [], timeline: [], latestAccess: null
    }
  })
  return { period: { from, to }, users: rows, summary: summarize(rows), misAccess: { isAdmin: true, scope: 'all', showSales: true, showQuotations: true, operationTeams: teams.map((team) => ({ id: entityId(team._id || team.id), name: displayText(team.name, 'Operations Team'), managerId: entityId(team.manager), operationHeadId: entityId(team.operationHead), memberIds: (team.members || []).map(entityId) })) } }
}

function riskTone(key) {
  return {
    healthy: 'bg-emerald-100 text-emerald-800 ring-emerald-200', away: 'bg-orange-100 text-orange-800 ring-orange-200',
    stale: 'bg-amber-100 text-amber-800 ring-amber-200', never: 'bg-rose-100 text-rose-800 ring-rose-200',
    inactive: 'bg-slate-200 text-slate-700 ring-slate-300'
  }[key] || 'bg-slate-100 text-slate-700 ring-slate-200'
}

function presenceTone(value) {
  return {
    Active: 'bg-emerald-100 text-emerald-800', Away: 'bg-orange-100 text-orange-800',
    Offline: 'bg-slate-100 text-slate-600', 'Never Logged In': 'bg-rose-100 text-rose-700'
  }[value] || 'bg-slate-100 text-slate-600'
}

function summarize(rows) {
  return rows.reduce((summary, row) => ({
    totalUsers: summary.totalUsers + 1, activeUsers: summary.activeUsers + (row.active ? 1 : 0),
    onlineNow: summary.onlineNow + (row.online ? 1 : 0), activeSeconds: summary.activeSeconds + row.activeSeconds,
    awaySeconds: summary.awaySeconds + row.awaySeconds, actions: summary.actions + row.activityCount,
    totalLeads: summary.totalLeads + row.totalLeads, closedLeads: summary.closedLeads + row.closedLeads,
    supportTickets: summary.supportTickets + row.tickets.total, totalSessions: summary.totalSessions + row.sessions
  }), { totalUsers: 0, activeUsers: 0, onlineNow: 0, activeSeconds: 0, awaySeconds: 0, actions: 0, totalLeads: 0, closedLeads: 0, supportTickets: 0, totalSessions: 0 })
}

function topRow(rows, selector) {
  return rows.length ? [...rows].sort((a, b) => selector(b) - selector(a))[0] : null
}

function buildOperationGroups(rows, teams = []) {
  if (teams.length) return teams.map((team) => {
    const managerId = entityId(team.managerId)
    const manager = rows.find((row) => entityId(row.id) === managerId) || null
    const memberIds = new Set((team.memberIds || []).map(entityId))
    const members = rows.filter((row) => memberIds.has(entityId(row.id)) && entityId(row.id) !== managerId)
    const people = [...(manager ? [manager] : []), ...members]
    const filled = people.reduce((sum, row) => sum + Number(row.clientFieldsFilled || 0), 0)
    const missing = people.reduce((sum, row) => sum + Number(row.clientFieldsMissing || 0), 0)
    return { id: String(team.id), name: team.name, manager, members, clientMasters: people.reduce((sum, row) => sum + Number(row.clientMasters || 0), 0), filled, missing, draftClients: people.reduce((sum, row) => sum + Number(row.draftClients || 0), 0), submittedClients: people.reduce((sum, row) => sum + Number(row.submittedClients || 0), 0), percentage: filled + missing ? Math.round((filled / (filled + missing)) * 100) : 0 }
  })
  const managers = rows.filter((row) => String(row.role).toLowerCase() === 'manager')
  const operationUsers = rows.filter((row) => String(row.role).toLowerCase() === 'operation')
  const groups = managers.map((manager, index) => {
    const members = operationUsers.filter((row) => String(row.managerId || '') === String(manager.id))
    const people = [manager, ...members]
    const filled = people.reduce((sum, row) => sum + Number(row.clientFieldsFilled || 0), 0)
    const missing = people.reduce((sum, row) => sum + Number(row.clientFieldsMissing || 0), 0)
    return {
      id: String(manager.id), name: manager.team || `Team ${String.fromCharCode(65 + index)}`,
      manager, members, clientMasters: people.reduce((sum, row) => sum + Number(row.clientMasters || 0), 0),
      filled, missing, draftClients: people.reduce((sum, row) => sum + Number(row.draftClients || 0), 0), submittedClients: people.reduce((sum, row) => sum + Number(row.submittedClients || 0), 0), percentage: filled + missing ? Math.round((filled / (filled + missing)) * 100) : 0
    }
  })
  const assigned = new Set(groups.flatMap((group) => group.members.map((row) => String(row.id))))
  const unassigned = operationUsers.filter((row) => !assigned.has(String(row.id)))
  if (unassigned.length) {
    const filled = unassigned.reduce((sum, row) => sum + Number(row.clientFieldsFilled || 0), 0)
    const missing = unassigned.reduce((sum, row) => sum + Number(row.clientFieldsMissing || 0), 0)
    groups.push({ id: 'unassigned', name: 'Unassigned Operations', manager: null, members: unassigned,
      clientMasters: unassigned.reduce((sum, row) => sum + Number(row.clientMasters || 0), 0), filled, missing,
      draftClients: unassigned.reduce((sum, row) => sum + Number(row.draftClients || 0), 0), submittedClients: unassigned.reduce((sum, row) => sum + Number(row.submittedClients || 0), 0), percentage: filled + missing ? Math.round((filled / (filled + missing)) * 100) : 0 })
  }
  return groups
}

function MetricCard({ label, value, note, icon: Icon, tone, loading }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-500">{label}</p>{loading ? <div className="mt-3 h-7 w-24 animate-pulse rounded-lg bg-slate-100" /> : <p className="mt-2 truncate text-2xl font-black text-slate-950">{value}</p>}</div><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span></div>
    <p className="mt-3 truncate text-[11px] font-bold text-slate-500">{note}</p>
  </article>
}

function MisOverviewCard({ title, subtitle, icon: Icon, tone, metrics, loading }) {
  const tones = {
    emerald: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-emerald-700',
    blue: 'border-blue-200 bg-gradient-to-br from-blue-50 to-white text-blue-700',
    orange: 'border-orange-200 bg-gradient-to-br from-orange-50 to-white text-orange-600',
    violet: 'border-violet-200 bg-gradient-to-br from-violet-50 to-white text-violet-700'
  }
  return <article className={`rounded-2xl border p-4 shadow-sm ${tones[tone]}`}>
    <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/80 shadow-sm"><Icon className="h-5 w-5" /></span><div><h2 className="font-black text-slate-950">{title}</h2><p className="text-[10px] font-bold text-slate-500">{subtitle}</p></div></div>
    <div className="mt-4 grid grid-cols-2 gap-3">{metrics.map(([label, value]) => <div key={label} className="border-l border-current/20 pl-3"><small className="block text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</small>{loading ? <div className="mt-2 h-5 w-14 animate-pulse rounded bg-slate-200" /> : <strong className="mt-1 block text-lg text-slate-950">{value}</strong>}</div>)}</div>
  </article>
}

function SortHeading({ label, value, sort, onSort, align = 'left' }) {
  return <th className={`sticky top-0 z-10 bg-slate-50 px-3 py-3 ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}><button type="button" onClick={() => onSort(value)} className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-emerald-700">{label}<ArrowUpDown className={`h-3 w-3 ${sort.key === value ? 'text-emerald-600' : 'text-slate-300'}`} /></button></th>
}

export default function SuperAdminDashboard({ misPage = false }) {
  const navigate = useNavigate()
  const [user] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'))
  const currentRole = String(user?.role || '').trim().toLowerCase().replace(/[\s_-]+/g, '')
  const currentUserIsAdmin = ['admin', 'superadmin'].includes(currentRole)
  const [report, setReport] = useState({ period: { from: inputDate(-6), to: inputDate(0) }, summary: {}, users: [] })
  const [draftFilters, setDraftFilters] = useState(defaultRange)
  const [appliedFilters, setAppliedFilters] = useState(defaultRange)
  const [sort, setSort] = useState({ key: 'risk', direction: 'desc' })
  const [loading, setLoading] = useState(true)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [exportingExcel, setExportingExcel] = useState(false)
  const [generatingMisPdf, setGeneratingMisPdf] = useState('')
  const [error, setError] = useState('')
  const [exportError, setExportError] = useState('')
  const [selected, setSelected] = useState(null)
  const [workReportUser, setWorkReportUser] = useState(null)
  const [quotations, setQuotations] = useState([])

  async function loadProductivityReport(timeout = 60000) {
    return api.get(API_ENDPOINTS.auth.userProductivityReport, {
      params: { from: appliedFilters.from, to: appliedFilters.to },
      timeout
    })
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      let reportResult
      try { reportResult = await loadProductivityReport(60000) }
      catch (firstError) {
        if (firstError?.code !== 'ECONNABORTED' && firstError?.message !== 'Network Error') throw firstError
        reportResult = await loadProductivityReport(90000)
      }
      setReport(reportResult.data || reportResult)
    } catch (requestError) {
      if (misPage && currentUserIsAdmin) {
        const fallbackResults = await Promise.allSettled([
          api.get(API_ENDPOINTS.auth.users, { timeout: 30000 }), api.get(API_ENDPOINTS.leads.list, { timeout: 30000 }),
          api.get(API_ENDPOINTS.clients.list, { timeout: 30000 }), api.get(API_ENDPOINTS.teams.list, { timeout: 30000 })
        ])
        const [usersResult, leadsResult, clientsResult, teamsResult] = fallbackResults
        const users = usersResult.status === 'fulfilled' ? usersResult.value.data?.users || [] : []
        const leads = leadsResult.status === 'fulfilled' ? leadsResult.value.data?.leads || [] : []
        const clients = clientsResult.status === 'fulfilled' ? clientsResult.value.data?.clients || [] : []
        const teams = teamsResult.status === 'fulfilled' ? teamsResult.value.data?.teams || [] : []
        if (users.length) {
          setReport(buildFallbackMisReport({ users, leads, clients, teams, from: appliedFilters.from, to: appliedFilters.to }))
          setError('Live activity telemetry is temporarily unavailable. Sales and Operation MIS are showing current CRM records.')
        } else setError(requestError?.response?.data?.error || 'Unable to load MIS data. Please try again.')
      } else setError(requestError?.response?.data?.error || 'Unable to load the user activity report. Please try again.')
    } finally { setLoading(false) }
    if (misPage && currentUserIsAdmin) {
      api.get(API_ENDPOINTS.quotations.list, { timeout: 30000 })
        .then((result) => setQuotations(result.data?.quotations || []))
        .catch((quotationError) => console.error('Unable to load Quotation MIS', quotationError))
    }
  }

  useEffect(() => { load() }, [appliedFilters.from, appliedFilters.to])

  useEffect(() => {
    if (draftFilters.from > draftFilters.to) {
      setError('From Date cannot be after To Date.')
      return undefined
    }
    setError('')
    const timer = window.setTimeout(() => setAppliedFilters((current) => (
      current.from === draftFilters.from && current.to === draftFilters.to
        && current.search === draftFilters.search && current.role === draftFilters.role
        && current.user === draftFilters.user && current.risk === draftFilters.risk
        && current.status === draftFilters.status ? current : { ...draftFilters }
    )), 200)
    return () => window.clearTimeout(timer)
  }, [draftFilters])

  const rows = useMemo(() => (report.users || []).map((row) => ({ ...row, roleLabel: roleLabels[row.role] || row.role || '-' })), [report.users])
  const salesMisRows = useMemo(() => rows.filter((row) => String(row.role).toLowerCase() === 'sales'), [rows])
  const misAccess = report.misAccess || { isAdmin: true, scope: 'all', showSales: true, showQuotations: true, operationTeams: [] }
  const operationsOnlyMis = misPage && !misAccess.isAdmin
  const misTitle = operationsOnlyMis
    ? (misAccess.scope === 'operation-head' ? 'Complete Operations MIS' : `${misAccess.operationTeams?.[0]?.name || 'Team'} Operations MIS`)
    : 'Complete MIS'
  const operationGroups = useMemo(() => buildOperationGroups(rows, misAccess.operationTeams), [rows, misAccess.operationTeams])
  const quotationMisRows = useMemo(() => [...quotations].sort((left, right) => new Date(right.quotationDate || right.createdAt || 0) - new Date(left.quotationDate || left.createdAt || 0)), [quotations])
  const salesTotals = useMemo(() => salesMisRows.reduce((total, row) => ({ leads: total.leads + Number(row.totalLeads || 0), open: total.open + Number(row.openLeads || 0), closed: total.closed + Number(row.closedLeads || 0) }), { leads: 0, open: 0, closed: 0 }), [salesMisRows])
  const operationTotals = useMemo(() => operationGroups.reduce((total, group) => ({ clients: total.clients + Number(group.clientMasters || 0), submitted: total.submitted + Number(group.submittedClients || 0), filled: total.filled + Number(group.filled || 0), missing: total.missing + Number(group.missing || 0) }), { clients: 0, submitted: 0, filled: 0, missing: 0 }), [operationGroups])
  const quotationTotals = useMemo(() => ({ total: quotationMisRows.length, open: quotationMisRows.filter((row) => ['draft', 'submitted', 'sent'].includes(String(row.status || '').toLowerCase())).length, converted: quotationMisRows.filter((row) => ['approved', 'converted'].includes(String(row.status || '').toLowerCase())).length }), [quotationMisRows])
  const roles = useMemo(() => [...new Set(rows.map((row) => row.role).filter(Boolean))].sort(), [rows])
  const visible = useMemo(() => {
    const search = appliedFilters.search.trim().toLowerCase()
    const filtered = rows.filter((row) => (!search || `${row.name} ${row.email} ${row.roleLabel}`.toLowerCase().includes(search))
      && (appliedFilters.role === 'all' || row.role === appliedFilters.role)
      && (appliedFilters.user === 'all' || String(row.id) === appliedFilters.user)
      && (appliedFilters.risk === 'all' || row.risk.key === appliedFilters.risk)
      && (appliedFilters.status === 'all' || (appliedFilters.status === 'online' ? row.online : row.presence.toLowerCase() === appliedFilters.status)))
    const selectors = {
      score: (row) => row.score, activeSeconds: (row) => row.activeSeconds, awaySeconds: (row) => row.awaySeconds,
      totalLeads: (row) => row.totalLeads, closedLeads: (row) => row.closedLeads,
      tickets: (row) => row.tickets.total, risk: (row) => row.risk.rank, sessions: (row) => row.sessions
    }
    const selector = selectors[sort.key] || selectors.risk
    return filtered.sort((a, b) => (selector(a) - selector(b)) * (sort.direction === 'asc' ? 1 : -1) || a.name.localeCompare(b.name))
  }, [rows, appliedFilters, sort])
  const summary = useMemo(() => summarize(visible), [visible])
  const insights = useMemo(() => ({
    mostActive: topRow(visible, (row) => row.activeSeconds), highestScore: topRow(visible, (row) => row.score),
    mostLeads: topRow(visible, (row) => row.totalLeads), mostTickets: topRow(visible, (row) => row.tickets.total)
  }), [visible])
  const attention = ['never', 'stale', 'away', 'inactive'].map((key) => ({ key, count: rows.filter((row) => row.risk.key === key).length, label: { never: 'Never logged in', stale: 'Medium risk / stale', away: 'High away ratio', inactive: 'Inactive accounts' }[key] }))
  const chart = [...visible].sort((a, b) => b.activeSeconds - a.activeSeconds).slice(0, 8).map((row) => ({ name: (row.name || 'User').split(' ')[0], Active: Math.round(row.activeSeconds / 60), Away: Math.round(row.awaySeconds / 60) }))

  function resetFilters() {
    const next = defaultRange()
    setDraftFilters(next)
    setAppliedFilters(next)
    setSort({ key: 'risk', direction: 'desc' })
  }

  function changeSort(key) {
    setSort((current) => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }))
  }

  async function downloadPdf() {
    if (generatingPdf) return
    setGeneratingPdf(true)
    setExportError('')
    try { await downloadProductivityPdf({ rows: visible, summary, period: report.period, insights }) }
    catch (pdfError) { console.error('Unable to generate productivity PDF', pdfError); setExportError('Unable to generate the report. Please try again.') }
    finally { setGeneratingPdf(false) }
  }

  async function downloadExcel() {
    if (exportingExcel) return
    setExportingExcel(true)
    setExportError('')
    try { await exportProductivityExcel({ rows: visible, summary, period: report.period }) }
    catch (excelError) { console.error('Unable to export productivity Excel', excelError); setExportError('Unable to export Excel. Please try again.') }
    finally { setExportingExcel(false) }
  }

  async function downloadMisPdf(type) {
    if (generatingMisPdf) return
    setGeneratingMisPdf(type)
    setExportError('')
    try {
      if (type === 'sales') await downloadSalesMisPdf({ rows: salesMisRows, period: report.period })
      else await downloadOperationMisPdf({ groups: operationGroups, period: report.period })
    } catch (pdfError) {
      console.error(`Unable to generate ${type} MIS PDF`, pdfError)
      setExportError(`Unable to generate the ${type === 'sales' ? 'Sales' : 'Operation'} MIS report. Please try again.`)
    } finally { setGeneratingMisPdf('') }
  }

  const cards = [
    ['Total Users', summary.totalUsers, `${summary.activeUsers} active accounts`, Users, 'bg-indigo-50 text-indigo-700'],
    ['Online Now', summary.onlineNow, 'Latest heartbeat status', UserCheck, 'bg-emerald-50 text-emerald-700'],
    ['Active CRM Time', formatDuration(summary.activeSeconds), `${formatReportDate(report.period.from)} - ${formatReportDate(report.period.to)}`, Timer, 'bg-cyan-50 text-cyan-700'],
    ['Away Time', formatDuration(summary.awaySeconds), 'Away from active CRM tab', Clock3, 'bg-orange-50 text-orange-700'],
    ['Closed Leads', summary.closedLeads, `${summary.totalLeads} leads in period`, CheckCircle2, 'bg-teal-50 text-teal-700'],
    ['Support Tickets Raised', summary.supportTickets, 'Created in selected period', TicketCheck, 'bg-emerald-50 text-emerald-700'],
    ['Total Sessions', summary.totalSessions, 'CRM login sessions', Monitor, 'bg-slate-100 text-slate-700']
  ]

  return <DashboardShell currentUser={user}>
    <div className="min-h-screen bg-[#f3f8f6] p-4 lg:p-6">
      <div className="w-full">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div><p className="text-[10px] font-black uppercase tracking-[.24em] text-orange-500">{misPage ? 'Management information system' : 'Super admin control center'}</p><h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">{misPage ? misTitle : REPORT_TITLE}</h1><p className="mt-2 text-sm font-semibold text-slate-500">Report Period: {formatReportDate(report.period.from)} - {formatReportDate(report.period.to)} · {misPage ? (operationsOnlyMis ? 'Operations and Client Master completion for your authorised team scope.' : 'Sales, Operations and Quotation MIS in one place.') : 'user presence, CRM activity, leads, tickets and risk.'}</p></div>
          <div className="flex flex-wrap gap-2"><button onClick={load} disabled={loading} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-teal-700 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>{!misPage && <><button onClick={downloadExcel} disabled={loading || exportingExcel} className="inline-flex h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 text-sm font-black text-emerald-700 disabled:opacity-50">{exportingExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}{exportingExcel ? 'Exporting...' : 'Export Excel'}</button><button onClick={downloadPdf} disabled={loading || generatingPdf} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#075848] px-4 text-sm font-black text-white disabled:opacity-50">{generatingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{generatingPdf ? 'Generating PDF...' : 'Download PDF'}</button><button onClick={() => navigate('/dashboard/users')} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"><Users className="h-4 w-4" />User Management</button></>}</div>
        </header>

        {misPage && <section className="mt-5 flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
          <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-700">MIS Report Period</p><p className="mt-1 text-sm font-semibold text-slate-500">Select the period used by your authorised MIS reports.</p></div>
          <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">From Date<input type="date" value={draftFilters.from} onChange={(event) => setDraftFilters((current) => ({ ...current, from: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold normal-case" /></label>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">To Date<input type="date" value={draftFilters.to} onChange={(event) => setDraftFilters((current) => ({ ...current, to: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold normal-case" /></label>
          </div>
        </section>}

        {misPage && <section className="mt-4 grid gap-4 md:grid-cols-2">
          <MisOverviewCard title="Sales MIS" subtitle="Complete lead ownership" icon={Users} tone="emerald" loading={loading} metrics={[["Total Leads", salesTotals.leads], ["Open Leads", salesTotals.open], ["Closed Leads", salesTotals.closed], ["Close Rate", `${salesTotals.leads ? ((salesTotals.closed / salesTotals.leads) * 100).toFixed(1) : 0}%`]]} />
          <MisOverviewCard title="Operation MIS" subtitle="Submitted Client Masters only" icon={Building2} tone="blue" loading={loading} metrics={[["Submitted Clients", operationTotals.clients], ["In Workflow", operationTotals.submitted], ["Operation Teams", operationGroups.length], ["Completion", `${operationTotals.filled + operationTotals.missing ? Math.round(operationTotals.filled / (operationTotals.filled + operationTotals.missing) * 100) : 0}%`]]} />
          <MisOverviewCard title="Quotation MIS" subtitle="Commercial performance" icon={FileText} tone="orange" loading={loading} metrics={[["Total", quotationTotals.total], ["Open", quotationTotals.open], ["Converted", quotationTotals.converted], ["Conversion", `${quotationTotals.total ? ((quotationTotals.converted / quotationTotals.total) * 100).toFixed(1) : 0}%`]]} />
          <MisOverviewCard title="Overall Summary" subtitle="Live CRM overview" icon={BarChart3} tone="violet" loading={loading} metrics={[["CRM Users", rows.length], ["Active Users", rows.filter((row) => row.active).length], ["Clients", operationTotals.clients], ["Quotations", quotationTotals.total]]} />
        </section>}

        <section className={`${misPage ? 'hidden' : ''} mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm`}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">From Date<input type="date" value={draftFilters.from} onChange={(event) => setDraftFilters((current) => ({ ...current, from: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold normal-case" /></label>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">To Date<input type="date" value={draftFilters.to} onChange={(event) => setDraftFilters((current) => ({ ...current, to: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold normal-case" /></label>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Role<select value={draftFilters.role} onChange={(event) => setDraftFilters((current) => ({ ...current, role: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold normal-case"><option value="all">All roles</option>{roles.map((role) => <option key={role} value={role}>{roleLabels[role] || role}</option>)}</select></label>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">User<select value={draftFilters.user} onChange={(event) => setDraftFilters((current) => ({ ...current, user: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold normal-case"><option value="all">All users</option>{rows.map((row) => <option key={String(row.id)} value={String(row.id)}>{row.name}</option>)}</select></label>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Risk Level<select value={draftFilters.risk} onChange={(event) => setDraftFilters((current) => ({ ...current, risk: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold normal-case"><option value="all">All risk levels</option><option value="healthy">Low Risk</option><option value="stale">Medium Risk</option><option value="away">High Risk</option><option value="never">Never Logged In</option><option value="inactive">Inactive Account</option></select></label>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Online Status<select value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold normal-case"><option value="all">All statuses</option><option value="online">Online</option><option value="active">Active</option><option value="away">Away</option><option value="offline">Offline</option><option value="never logged in">Never Logged In</option></select></label>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Search<div className="relative mt-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={draftFilters.search} onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Name, email or role" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-semibold outline-none focus:border-emerald-500 focus:bg-white" /></div></label>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2"><button onClick={resetFilters} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-600"><RotateCcw className="h-4 w-4" />Reset Filters</button></div>
        </section>

        {(error || exportError) && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error || exportError}</div>}
        <section className={`${misPage ? 'hidden' : ''} mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8`}>{cards.map(([label, value, note, Icon, tone]) => <MetricCard key={label} label={label} value={value} note={note} icon={Icon} tone={tone} loading={loading} />)}</section>

        <section className={`${misPage ? 'hidden' : ''} mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]`}>
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-black text-slate-950">Active vs Away Time</h2><p className="text-xs font-semibold text-slate-500">Top users in selected period · minutes</p></div><Activity className="h-5 w-5 text-emerald-600" /></div><div className="mt-3 h-60">{chart.length ? <ResponsiveContainer><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={10} /><YAxis fontSize={10} /><Tooltip /><Legend /><Bar dataKey="Active" fill="#059669" radius={[5, 5, 0, 0]} /><Bar dataKey="Away" fill="#f97316" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="grid h-full place-items-center text-sm font-bold text-slate-400">No chart data for selected period.</div>}</div></article>
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-orange-500" /><div><h2 className="font-black text-slate-950">Admin Attention</h2><p className="text-xs font-semibold text-slate-500">Accounts to review</p></div></div><div className="mt-3 space-y-2">{attention.map((item) => <button key={item.key} onClick={() => { const next = { ...draftFilters, risk: item.key }; setDraftFilters(next); setAppliedFilters(next) }} className="flex w-full items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-left hover:border-emerald-200"><span className="text-xs font-black text-slate-700">{item.label}</span><strong className="text-lg text-slate-950">{item.count}</strong></button>)}</div></aside>
        </section>

        {misPage && misAccess.showSales && <section className="mt-4 overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-5 py-4">
            <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><Users className="h-5 w-5" /></span><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-700">Department MIS</p><h2 className="text-xl font-black text-slate-950">Sales MIS</h2><p className="text-xs font-semibold text-slate-500">Only Sales users · live lead status for the selected report period</p></div></div>
            <button type="button" onClick={() => downloadMisPdf('sales')} disabled={loading || Boolean(generatingMisPdf)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#075848] px-4 text-sm font-black text-white disabled:opacity-50">{generatingMisPdf === 'sales' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{generatingMisPdf === 'sales' ? 'Generating...' : 'Download Sales PDF'}</button>
          </header>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Sr. No.</th><th className="px-5 py-3">User Name</th><th className="px-5 py-3 text-right">Total Leads</th><th className="px-5 py-3 text-right">Lead Open</th><th className="px-5 py-3 text-right">Lead Close</th><th className="px-5 py-3">Close Rate</th></tr></thead><tbody>
            {loading ? <tr><td colSpan="6" className="p-5"><div className="h-12 animate-pulse rounded-xl bg-slate-100" /></td></tr> : salesMisRows.map((row, index) => { const rate = row.totalLeads ? Math.round((row.closedLeads / row.totalLeads) * 100) : 0; return <tr key={String(row.id)} className="border-t border-slate-100 font-semibold text-slate-700 hover:bg-emerald-50/50"><td className="px-5 py-4 font-black text-slate-400">{index + 1}</td><td className="px-5 py-4"><button type="button" onClick={() => setWorkReportUser(row)} className="text-left"><strong className="block text-slate-950 hover:text-emerald-700">{row.name}</strong><small className="text-slate-500">{row.email}</small></button></td><td className="px-5 py-4 text-right text-lg font-black text-slate-950">{row.totalLeads}</td><td className="px-5 py-4 text-right text-lg font-black text-orange-600">{row.openLeads}</td><td className="px-5 py-4 text-right text-lg font-black text-emerald-700">{row.closedLeads}</td><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="h-2 w-28 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${rate}%` }} /></div><strong className="text-emerald-800">{rate}%</strong></div></td></tr> })}
            {!loading && !salesMisRows.length && <tr><td colSpan="6" className="p-10 text-center font-bold text-slate-400">No Sales users found.</td></tr>}
          </tbody></table></div>
        </section>}

        {misPage && <section className="mt-4 overflow-hidden rounded-2xl border border-cyan-200 bg-white shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-100 bg-gradient-to-r from-cyan-50 to-white px-5 py-4">
            <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-100 text-cyan-700"><Building2 className="h-5 w-5" /></span><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-700">Team hierarchy MIS</p><h2 className="text-xl font-black text-slate-950">Operation MIS</h2><p className="text-xs font-semibold text-slate-500">Team → Manager → Users · Client Master data completion analysis</p></div></div>
            <button type="button" onClick={() => downloadMisPdf('operation')} disabled={loading || Boolean(generatingMisPdf)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-cyan-700 px-4 text-sm font-black text-white disabled:opacity-50">{generatingMisPdf === 'operation' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{generatingMisPdf === 'operation' ? 'Generating...' : 'Download Operation PDF'}</button>
          </header>
          <div className="overflow-x-auto"><table className="w-full min-w-[940px] text-sm"><thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Team / User</th><th className="px-5 py-3">Level</th><th className="px-5 py-3">Reports To</th><th className="px-5 py-3 text-right">Submitted Clients</th><th className="px-5 py-3 text-right">Total Submitted</th><th className="px-5 py-3">Completion</th></tr></thead><tbody>
            {operationGroups.flatMap((group) => {
              const people = [...(group.manager ? [group.manager] : []), ...group.members]
              const teamRow = <tr key={`team-${group.id}`} className="border-t-2 border-cyan-100 bg-cyan-50/70 font-black text-slate-900"><td className="px-5 py-4"><span className="inline-flex items-center gap-2"><Building2 className="h-4 w-4 text-cyan-700" />{group.name}</span></td><td className="px-5 py-4"><span className="rounded-full bg-cyan-100 px-2.5 py-1 text-[10px] uppercase text-cyan-800">Team Total</span></td><td className="px-5 py-4">{group.manager?.name || '-'}</td><td className="px-5 py-4 text-right text-lg">{group.clientMasters}</td><td className="px-5 py-4 text-right text-emerald-700">{group.submittedClients || 0}</td><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="h-2 w-32 overflow-hidden rounded-full bg-white ring-1 ring-cyan-100"><div className="h-full rounded-full bg-cyan-600" style={{ width: `${group.percentage}%` }} /></div><strong>{group.percentage}%</strong></div></td></tr>
              const peopleRows = people.map((row) => <tr key={`${group.id}-${row.id}`} className="border-t border-slate-100 font-semibold text-slate-700 hover:bg-slate-50"><td className="py-3 pl-10 pr-5"><button type="button" onClick={() => setWorkReportUser({ ...row, initialView: "clients" })} className="block text-left font-black text-slate-950 hover:text-cyan-700 hover:underline">{row.name}</button><small className="text-slate-500">{row.email}</small></td><td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${row === group.manager ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>{row === group.manager ? 'Manager' : 'User'}</span></td><td className="px-5 py-3">{row === group.manager ? '—' : group.manager?.name || 'Not assigned'}</td><td className="px-5 py-3 text-right font-black">{row.clientMasters || 0}</td><td className="px-5 py-3 text-right font-black text-emerald-700">{row.submittedClients || 0}</td><td className="px-5 py-3"><div className="flex items-center gap-3"><div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${row.clientCompletionPercentage || 0}%` }} /></div><strong>{row.clientCompletionPercentage || 0}%</strong></div></td></tr>)
              return [teamRow, ...peopleRows]
            })}
            {!loading && !operationGroups.length && <tr><td colSpan="7" className="p-10 text-center font-bold text-slate-400">No Operation teams found.</td></tr>}
          </tbody></table></div>
        </section>}

        {misPage && misAccess.showQuotations && <section className="mt-4 overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-100 bg-gradient-to-r from-orange-50 to-white px-5 py-4">
            <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-100 text-orange-700"><FileText className="h-5 w-5" /></span><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-orange-700">Commercial MIS</p><h2 className="text-xl font-black text-slate-950">Quotation MIS</h2><p className="text-xs font-semibold text-slate-500">All quotations · latest quotation first</p></div></div>
            <button type="button" onClick={() => navigate('/sales/quotations')} className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-black text-white">Open Quotations</button>
          </header>
          <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Quotation</th><th className="px-5 py-3">Company</th><th className="px-5 py-3">Lead Code</th><th className="px-5 py-3">Prepared By</th><th className="px-5 py-3">Date</th><th className="px-5 py-3 text-right">Items</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3">Status</th></tr></thead><tbody>
            {quotationMisRows.map((row, index) => <tr key={entityId(row._id || row.id) || index} className={`border-t border-slate-100 font-semibold text-slate-700 hover:bg-orange-50/50 ${index === 0 ? 'bg-orange-50/60' : ''}`}><td className="px-5 py-3"><strong className="text-orange-700">{displayText(row.quotationNumber)}</strong>{index === 0 && <small className="ml-2 rounded-full bg-orange-500 px-2 py-1 text-[9px] font-black uppercase text-white">Latest</small>}</td><td className="px-5 py-3 font-black text-slate-950">{displayText(row.companyName || row.leadDetails?.companyName)}</td><td className="px-5 py-3">{displayText(row.leadCode || row.leadDetails?.leadCode)}</td><td className="px-5 py-3">{displayText(row.preparedBy || row.createdByName || row.createdBy)}</td><td className="px-5 py-3">{formatReportDate(row.quotationDate || row.createdAt)}</td><td className="px-5 py-3 text-right font-black">{row.items?.length || 0}</td><td className="px-5 py-3 text-right font-black text-orange-700">₹{(Number(row.grandTotal) || 0).toLocaleString('en-IN')}</td><td className="px-5 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-700">{displayText(row.status, 'draft')}</span></td></tr>)}
            {!loading && !quotationMisRows.length && <tr><td colSpan="8" className="p-10 text-center font-bold text-slate-400">No quotations found.</td></tr>}
          </tbody></table></div>
        </section>}

        <section onClickCapture={(event) => { const cell = event.target.closest('td'); if (!cell || cell.cellIndex !== 1) return; const tableRow = cell.closest('tr'); const index = tableRow ? tableRow.sectionRowIndex : -1; if (index >= 0 && visible[index]) setWorkReportUser(visible[index]) }} className={`${misPage ? 'hidden' : ''} mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h2 className="text-lg font-black text-slate-950">{REPORT_TITLE}</h2><p className="text-xs font-semibold text-slate-500">{visible.length} users · Report Period: {formatReportDate(report.period.from)} - {formatReportDate(report.period.to)}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Live aggregated data</span></div>
          <div className="max-h-[720px] overflow-auto"><table className="w-full min-w-[1750px] text-left text-sm"><thead><tr><th className="sticky top-0 z-10 bg-slate-50 px-3 py-3 text-center text-[10px] font-black uppercase text-slate-500">Sr. No.</th><th className="sticky top-0 z-10 bg-slate-50 px-3 py-3 text-[10px] font-black uppercase text-slate-500">User Name</th><th className="sticky top-0 z-10 bg-slate-50 px-3 py-3 text-[10px] font-black uppercase text-slate-500">Role</th><th className="sticky top-0 z-10 bg-slate-50 px-3 py-3 text-[10px] font-black uppercase text-slate-500">Status</th><SortHeading label="Productivity Score" value="score" sort={sort} onSort={changeSort} align="center" /><SortHeading label="Total Leads" value="totalLeads" sort={sort} onSort={changeSort} align="right" /><SortHeading label="Closed Leads" value="closedLeads" sort={sort} onSort={changeSort} align="right" /><SortHeading label="Active Time" value="activeSeconds" sort={sort} onSort={changeSort} align="right" /><SortHeading label="Away Time" value="awaySeconds" sort={sort} onSort={changeSort} align="right" /><SortHeading label="Sessions" value="sessions" sort={sort} onSort={changeSort} align="right" /><SortHeading label="Support Tickets Raised" value="tickets" sort={sort} onSort={changeSort} align="right" /><th className="sticky top-0 z-10 bg-slate-50 px-3 py-3 text-[10px] font-black uppercase text-slate-500">Last Activity</th><SortHeading label="Risk Level" value="risk" sort={sort} onSort={changeSort} /><th className="sticky top-0 z-10 bg-slate-50 px-3 py-3 text-center text-[10px] font-black uppercase text-slate-500">Details</th></tr></thead><tbody>
            {loading ? Array.from({ length: 6 }).map((_, index) => <tr key={index} className="border-t border-slate-100"><td colSpan="14" className="px-4 py-3"><div className="h-10 animate-pulse rounded-xl bg-slate-100" /></td></tr>) : visible.map((row, index) => <tr key={String(row.id)} className="border-t border-slate-100 font-semibold text-slate-700 odd:bg-white even:bg-slate-50/50 hover:bg-emerald-50/60"><td className="px-3 py-3 text-center font-black text-slate-400">{index + 1}</td><td className="px-3 py-3"><strong className="block text-slate-950">{row.name}</strong><small className="text-slate-500">{row.email}</small></td><td className="px-3"><strong>{row.roleLabel}</strong><small className="block text-slate-500">{row.team || 'No team assigned'}</small></td><td className="px-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${presenceTone(row.presence)}`}>{row.presence}</span></td><td className="px-3 text-center"><strong className="text-slate-950">{row.score}/100</strong><div className="mx-auto mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${row.score}%` }} /></div></td><td className="px-3 text-right font-black">{row.totalLeads}</td><td className="px-3 text-right font-black text-emerald-700">{row.closedLeads}</td><td className="px-3 text-right font-black text-emerald-700">{formatDuration(row.activeSeconds)}</td><td className="px-3 text-right font-black text-orange-700">{formatDuration(row.awaySeconds)}</td><td className="px-3 text-right font-black">{row.sessions}</td><td className="px-3 text-right"><strong className="text-emerald-800">{row.tickets.total}</strong><small className="block text-slate-500">Open {row.tickets.open} · Resolved {row.tickets.resolved}</small></td><td className="px-3 text-xs">{formatDateTime(row.lastActivity)}</td><td className="px-3"><span title={row.risk.reason} className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${riskTone(row.risk.key)}`}>{row.risk.level}</span><small className="mt-1 block max-w-[170px] text-slate-500">{row.risk.reason}</small></td><td className="px-3 text-center"><button onClick={() => setSelected(row)} title="View user activity details" className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-emerald-700 hover:border-emerald-300"><Eye className="h-4 w-4" /></button></td></tr>)}
            {!loading && !visible.length && <tr><td colSpan="14" className="p-14 text-center"><Activity className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-black text-slate-500">No user activity found for the selected period.</p><p className="mt-1 text-xs text-slate-400">Reset filters or choose a different date range.</p></td></tr>}
          </tbody></table></div>
        </section>
      </div>
    </div>

    {workReportUser && <UserWorkDrilldown user={workReportUser} from={report.period.from} to={report.period.to} initialView={workReportUser.initialView || 'sales'} onClose={() => setWorkReportUser(null)} />}
    {selected && <div className="fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><aside className="ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"><header className="border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-white p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-700">User activity profile</p><h2 className="mt-1 text-2xl font-black text-slate-950">{selected.name}</h2><p className="text-sm font-semibold text-slate-500">{selected.email} · {selected.roleLabel}</p></div><button onClick={() => setSelected(null)} className="grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-500 shadow-sm"><X className="h-5 w-5" /></button></div><div className="mt-4 grid grid-cols-4 gap-2"><div className="rounded-xl bg-white p-3"><small className="font-black uppercase text-slate-400">Score</small><strong className="mt-1 block text-lg">{selected.score}/100</strong></div><div className="rounded-xl bg-white p-3"><small className="font-black uppercase text-slate-400">Sessions</small><strong className="mt-1 block text-lg">{selected.sessions}</strong></div><div className="rounded-xl bg-white p-3"><small className="font-black uppercase text-slate-400">Actions</small><strong className="mt-1 block text-lg">{selected.activityCount}</strong></div><div className="rounded-xl bg-white p-3"><small className="font-black uppercase text-slate-400">Tickets</small><strong className="mt-1 block text-lg">{selected.tickets.total}</strong></div></div></header><div className="flex-1 space-y-5 overflow-y-auto p-5"><section><h3 className="flex items-center gap-2 text-sm font-black text-slate-950"><CalendarDays className="h-4 w-4 text-emerald-600" />Daily timeline</h3><div className="mt-3 space-y-2">{selected.timeline.length ? selected.timeline.map((day) => <article key={day.date} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><strong>{formatReportDate(day.date)}</strong><span className="text-xs font-bold text-slate-500">{day.actions} actions</span></div><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><p><span className="block font-black uppercase text-slate-400">First login</span>{formatDateTime(day.firstLogin)}</p><p><span className="block font-black uppercase text-slate-400">Last activity</span>{formatDateTime(day.lastSeen)}</p><p><span className="block font-black uppercase text-slate-400">Active</span>{formatDuration(day.activeSeconds)}</p><p><span className="block font-black uppercase text-slate-400">Away</span>{formatDuration(day.awaySeconds)}</p></div><p className="mt-3 text-xs font-bold text-slate-500">Modules: {day.modules.join(', ') || 'No module actions'}</p></article>) : <p className="rounded-xl bg-slate-50 p-5 text-sm font-bold text-slate-500">No sessions in selected period.</p>}</div></section><section><h3 className="flex items-center gap-2 text-sm font-black text-slate-950"><Activity className="h-4 w-4 text-violet-600" />Recent CRM actions</h3><div className="mt-3 space-y-2">{selected.recentActions.length ? selected.recentActions.map((action, index) => <article key={action.id || index} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex justify-between gap-3"><strong className="text-xs text-emerald-800">{action.module}</strong><small className="text-slate-400">{formatDateTime(action.occurredAt)}</small></div><p className="mt-1 text-sm font-semibold text-slate-700">{action.description}</p></article>) : <p className="rounded-xl bg-slate-50 p-5 text-sm font-bold text-slate-500">No recorded actions.</p>}</div></section><section className="rounded-2xl border border-slate-200 p-4"><h3 className="flex items-center gap-2 text-sm font-black"><Monitor className="h-4 w-4 text-slate-500" />Latest access</h3><p className="mt-3 text-xs font-bold text-slate-600">IP: {selected.latestAccess?.ipAddress || '-'}</p><p className="mt-1 break-words text-xs font-bold text-slate-600">Device: {selected.latestAccess?.device || '-'}</p></section><section className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><h3 className="flex items-center gap-2 text-sm font-black text-emerald-900"><Lightbulb className="h-4 w-4" />Risk assessment</h3><p className="mt-2 text-sm font-black text-slate-800">{selected.risk.level}</p><p className="mt-1 text-xs font-semibold text-slate-600">{selected.risk.reason}</p></section></div><footer className="grid gap-2 border-t border-slate-200 p-4 sm:grid-cols-2"><button onClick={() => navigate('/dashboard/users')} className="h-11 rounded-xl border border-emerald-200 font-black text-emerald-700">View Full Logs</button><button onClick={() => navigate('/dashboard/users')} className="h-11 rounded-xl bg-[#075848] font-black text-white">Open User Management</button></footer></aside></div>}
  </DashboardShell>
}
