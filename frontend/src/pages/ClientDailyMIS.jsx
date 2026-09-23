import React, { useEffect, useMemo, useState } from 'react'
import { Building2, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, Clock3, FileCheck2, Loader2, RefreshCw, Search, Users, X } from 'lucide-react'
import DashboardShell from '../components/dashboard/DashboardShell'
import api, { readApiError } from '../services/api'
import { API_ENDPOINTS } from '../services/apiEndpoints'

const dateText = (value, fallback = '—') => {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

const text = (value, fallback = '—') => String(value || '').trim() || fallback
const clientName = (client = {}) => text(client.data?.basic?.clientLegalName || client.data?.basic?.tradeName || client.data?.companyOverview?.companyName || client.selectedLead?.company, 'Untitled client')
const milestone = (client = {}, key) => client.data?.lifecycle?.milestones?.[key] || {}
const statusTone = (done) => done ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-amber-200'
const userName = (value) => typeof value === 'object' ? text(value?.name || value?.email) : text(value)

function Pill({ done, children }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ring-1 ${statusTone(done)}`}><span className={`h-1.5 w-1.5 rounded-full ${done ? 'bg-emerald-500' : 'bg-amber-500'}`} />{children}</span>
}

function DetailPanel({ client, loading, onClose }) {
  const lead = client?.selectedLead || {}
  const lifecycle = client?.data?.lifecycle || {}
  const followUps = lifecycle.workFollowUps || []
  const leadClosure = milestone(client, 'leadClosure')
  const po = milestone(client, 'poReceived')
  const kickoff = milestone(client, 'kickOffMeeting')
  const timeline = [
    { label: 'Lead closed', date: leadClosure.date || lead.closedAt, done: leadClosure.completed === 'yes' || Boolean(lead.closedAt), note: leadClosure.remark || lead.closedByText || lead.status },
    { label: 'PO received', date: po.date, done: po.completed === 'yes', note: po.remark },
    { label: 'User assigned', date: lead.assignReachedAt || lead.updatedAt || lead.createdAt, done: Boolean(lead.assignedStaff || lead.assignedStaffText), note: lead.assignedStaffText || lead.assignedToText || '' },
    { label: 'Kick-off meeting', date: kickoff.date, done: kickoff.completed === 'yes', note: kickoff.remark },
    { label: 'Client Master complete', date: client.submittedAt || client.updatedAt, done: client.workflowStatus === 'submitted', note: client.workflowStatus === 'submitted' ? 'Submitted and ready for operations' : 'Draft / pending completion' }
  ]

  return <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/40 p-0 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Client daily MIS detail">
    <section className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-[#f7fbfa] shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-emerald-100 bg-gradient-to-r from-emerald-800 to-teal-700 px-6 py-6 text-white">
        <div><p className="text-[10px] font-black uppercase tracking-[.22em] text-emerald-100">Client daily MIS · activity flow</p><h2 className="mt-2 text-2xl font-black tracking-tight">{loading ? 'Loading client…' : clientName(client)}</h2><p className="mt-1 text-sm font-semibold text-emerald-50/80">{text(lead.leadCode, 'No lead code')} · {text(client.data?.basic?.eprCategory || lead.eprCategory, 'Category not set')}</p></div>
        <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/20" aria-label="Close detail"><X className="h-5 w-5" /></button>
      </header>
      {loading ? <div className="grid flex-1 place-items-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-700" /></div> : <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Applicant type</p><p className="mt-2 font-black text-slate-900">{text(client.data?.basic?.applicantType || lead.applicantType)}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sub-applicant type</p><p className="mt-2 font-black text-slate-900">{text(client.data?.basic?.subApplicantType || lead.subApplicantType)}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Assigned user</p><p className="mt-2 font-black text-slate-900">{userName(lead.assignedStaffText || lead.assignedToText || client.adminControls?.assignedTo)}</p></div>
        </div>

        <section className="mt-6 rounded-2xl border border-emerald-100 bg-white p-5"><div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-emerald-700" /><div><h3 className="font-black text-slate-950">Client journey</h3><p className="text-xs font-semibold text-slate-500">Every important handoff with its recorded date.</p></div></div><ol className="mt-5 space-y-0">{timeline.map((item, index) => <li key={item.label} className="relative flex gap-4 pb-5 last:pb-0"><div className="flex flex-col items-center"><span className={`grid h-8 w-8 place-items-center rounded-full ${item.done ? 'bg-emerald-600 text-white' : 'bg-amber-100 text-amber-700'}`}>{item.done ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}</span>{index < timeline.length - 1 && <span className="mt-1 h-full w-px bg-emerald-100" />}</div><div className="min-w-0 flex-1 pt-1"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-black text-slate-800">{item.label}</h4><span className="text-xs font-bold text-slate-500">{dateText(item.date)}</span></div><p className="mt-1 text-sm font-medium text-slate-500">{text(item.note, item.done ? 'Recorded in CRM' : 'Not recorded yet')}</p></div></li>)}</ol></section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4"><ClipboardList className="h-5 w-5 text-orange-600" /><div><h3 className="font-black text-slate-950">Work follow-ups</h3><p className="text-xs font-semibold text-slate-500">Remarks and completion status from the execution desk.</p></div></div>{followUps.length ? <div className="divide-y divide-slate-100">{followUps.map((row, index) => <div key={row.id || index} className="flex flex-wrap items-center gap-3 px-5 py-3"><span className="grid h-7 w-7 place-items-center rounded-lg bg-orange-50 text-xs font-black text-orange-700">{index + 1}</span><p className="min-w-[220px] flex-1 text-sm font-semibold text-slate-700">{text(row.remark, 'No remark added')}</p><span className="text-xs font-bold text-slate-500">{dateText(row.date)}</span><Pill done={row.status === 'Done'}>{row.status || 'Pending'}</Pill></div>)}</div> : <div className="p-8 text-center text-sm font-bold text-slate-400">No work follow-ups recorded for this client.</div>}</section>
      </div>}
    </section>
  </div>
}

export default function ClientDailyMIS() {
  const [user] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'))
  const [clients, setClients] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = async () => { setLoading(true); setError(''); try { const result = await api.get(API_ENDPOINTS.clients.list); setClients(result.data?.clients || []) } catch (requestError) { setError(readApiError(requestError, 'Unable to load Client Daily MIS.')) } finally { setLoading(false) } }
  useEffect(() => { load() }, [])
  const rows = useMemo(() => clients.filter((client) => [clientName(client), client.data?.basic?.applicantType, client.data?.basic?.subApplicantType, client.selectedLead?.company].join(' ').toLowerCase().includes(query.trim().toLowerCase())), [clients, query])
  const complete = clients.filter((client) => client.workflowStatus === 'submitted').length
  const poReceived = clients.filter((client) => milestone(client, 'poReceived').completed === 'yes').length
  const openDetail = async (client) => { setSelected(client); setDetailLoading(true); try { const result = await api.get(API_ENDPOINTS.clients.detail(client._id)); setSelected(result.data?.client || client) } catch (requestError) { setError(readApiError(requestError, 'Unable to load the selected client.')) } finally { setDetailLoading(false) } }

  return <DashboardShell currentUser={user}><div className="min-h-[calc(100vh-5rem)] p-4 sm:p-6 lg:p-8">
    <header className="rounded-3xl bg-gradient-to-br from-[#075848] via-[#08715b] to-[#129083] px-6 py-7 text-white shadow-xl shadow-emerald-950/15 sm:px-8"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center"><div><p className="text-[10px] font-black uppercase tracking-[.26em] text-emerald-100">Management information system</p><h1 className="mt-2 text-3xl font-black tracking-tight">Client Daily MIS</h1><p className="mt-2 max-w-2xl text-sm font-semibold text-emerald-50/85">A live client-wise view of closure, PO, assignment, kick-off, Client Master and execution follow-ups.</p></div><button type="button" onClick={load} disabled={loading} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-black hover:bg-white/20 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh MIS</button></div></header>
    <section className="mt-5 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"><Building2 className="h-5 w-5 text-emerald-700" /><p className="mt-3 text-2xl font-black text-slate-950">{clients.length}</p><p className="text-xs font-black uppercase tracking-wider text-slate-500">Client records</p></div><div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm"><FileCheck2 className="h-5 w-5 text-blue-700" /><p className="mt-3 text-2xl font-black text-slate-950">{complete}</p><p className="text-xs font-black uppercase tracking-wider text-slate-500">Client Masters complete</p></div><div className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm"><CheckCircle2 className="h-5 w-5 text-orange-600" /><p className="mt-3 text-2xl font-black text-slate-950">{poReceived}</p><p className="text-xs font-black uppercase tracking-wider text-slate-500">PO received</p></div></section>
    <section className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center"><div><h2 className="text-lg font-black text-slate-950">Client execution register</h2><p className="mt-1 text-sm font-semibold text-slate-500">Click any client name to open its complete activity flow.</p></div><label className="flex h-11 w-full max-w-sm items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-500"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search client, applicant type…" className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400" /></label></div>
      {error && <div className="mx-5 mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>}
      <div className="overflow-x-auto"><table className="w-full min-w-[1260px] text-left"><thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">Client name</th><th className="px-4 py-4">Applicant type</th><th className="px-4 py-4">Sub-applicant type</th><th className="px-4 py-4">Assigned user</th><th className="px-4 py-4">Lead closure</th><th className="px-4 py-4">PO received</th><th className="px-4 py-4">Kick-off</th><th className="px-4 py-4">Client Master</th><th className="px-4 py-4">Work follow-ups</th><th className="px-5 py-4" /></tr></thead><tbody>{loading ? <tr><td colSpan="10" className="p-12 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-emerald-700" /></td></tr> : rows.map((client) => { const lead = client.selectedLead || {}; const closure = milestone(client, 'leadClosure'); const po = milestone(client, 'poReceived'); const kickoff = milestone(client, 'kickOffMeeting'); const followUps = client.data?.lifecycle?.workFollowUps || []; return <tr key={client._id} className="border-t border-slate-100 text-sm font-semibold text-slate-600 hover:bg-emerald-50/40"><td className="px-5 py-4"><button type="button" onClick={() => openDetail(client)} className="max-w-[250px] text-left font-black text-emerald-800 hover:text-emerald-600 hover:underline">{clientName(client)}</button><p className="mt-1 text-[11px] font-bold text-slate-400">{text(lead.leadCode, 'No lead linked')}</p></td><td className="px-4 py-4">{text(client.data?.basic?.applicantType || lead.applicantType)}</td><td className="px-4 py-4">{text(client.data?.basic?.subApplicantType || lead.subApplicantType)}</td><td className="px-4 py-4">{userName(lead.assignedStaffText || lead.assignedToText || client.adminControls?.assignedTo)}</td><td className="px-4 py-4"><Pill done={closure.completed === 'yes' || Boolean(lead.closedAt)}>{dateText(closure.date || lead.closedAt, 'Pending')}</Pill></td><td className="px-4 py-4"><Pill done={po.completed === 'yes'}>{dateText(po.date, 'Pending')}</Pill></td><td className="px-4 py-4"><Pill done={kickoff.completed === 'yes'}>{dateText(kickoff.date, 'Pending')}</Pill></td><td className="px-4 py-4"><Pill done={client.workflowStatus === 'submitted'}>{client.workflowStatus === 'submitted' ? `Complete · ${dateText(client.submittedAt)}` : 'Draft / pending'}</Pill></td><td className="px-4 py-4"><span className="font-black text-slate-800">{followUps.length}</span><span className="ml-1 text-xs text-slate-400">items</span></td><td className="px-5 py-4"><button type="button" onClick={() => openDetail(client)} className="grid h-9 w-9 place-items-center rounded-xl border border-emerald-200 text-emerald-700 hover:bg-emerald-700 hover:text-white" aria-label={`Open ${clientName(client)}`}><ChevronRight className="h-4 w-4" /></button></td></tr> })}{!loading && !rows.length && <tr><td colSpan="10" className="p-12 text-center font-bold text-slate-400">No client records match this search.</td></tr>}</tbody></table></div>
    </section>
  </div>{selected && <DetailPanel client={selected} loading={detailLoading} onClose={() => setSelected(null)} />}</DashboardShell>
}
