import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, CalendarDays, CheckCircle2, Clock3, Download, Eye, FolderOpen, Gauge, Monitor, RefreshCw, Search, ShieldAlert, Timer, UserCheck, Users, UserX, X, Zap } from 'lucide-react'
import DashboardShell from '../components/dashboard/DashboardShell'
import api from '../services/api'
import { API_ENDPOINTS } from '../services/apiEndpoints'

const roleLabels = { superadmin: 'Super Admin', admin: 'Admin', manager: 'Manager', operation: 'Operation', sales: 'Sales', compliance: 'Compliance', accounts: 'Accounts' }

function duration(seconds = 0) {
  const total = Math.max(0, Number(seconds) || 0)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  return `${hours}h ${minutes}m`
}

function dateTime(value) {
  if (!value) return 'No login yet'
  return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function dateKey(value) {
  if (!value) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value))
  const pick = (type) => parts.find((item) => item.type === type)?.value || ''
  return `${pick('year')}-${pick('month')}-${pick('day')}`
}

function inputDate(offsetDays = 0) {
  const value = new Date(Date.now() + offsetDays * 86400000)
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
  const pick = (type) => parts.find((item) => item.type === type)?.value || ''
  return `${pick('year')}-${pick('month')}-${pick('day')}`
}

function userRisk(row) {
  if (!row.active) return { key: 'inactive', label: 'Inactive account', tone: 'bg-slate-100 text-slate-700', rank: 4 }
  if (!row.lastLogin) return { key: 'never', label: 'Never logged in', tone: 'bg-rose-100 text-rose-700', rank: 5 }
  const staleDays = Math.floor((Date.now() - new Date(row.lastLogin).getTime()) / 86400000)
  if (staleDays >= 7) return { key: 'stale', label: `${staleDays}d inactive`, tone: 'bg-amber-100 text-amber-800', rank: 3 }
  if (row.openSeconds > 1800 && row.awayRatio >= 0.7) return { key: 'away', label: 'High away ratio', tone: 'bg-orange-100 text-orange-700', rank: 2 }
  return { key: 'healthy', label: 'Low risk', tone: 'bg-emerald-100 text-emerald-700', rank: 1 }
}

function productivityScore(row) {
  const focus = row.openSeconds ? Math.min(50, Math.round((row.activeSeconds / row.openSeconds) * 50)) : 0
  const activity = Math.min(25, Math.round(Math.log10(row.activityCount + 1) * 10))
  const output = Math.min(25, row.closedLeads * 3)
  return Math.min(100, focus + activity + output)
}

function dailyTimeline(sessions = []) {
  const groups = new Map()
  for (const session of sessions) {
    const day = dateKey(session.loginAt || session.lastActivityAt)
    if (!day) continue
    const endAt = session.logoutAt || session.offlineSince || session.lastActivityAt
    const current = groups.get(day) || { date: day, firstLogin: session.loginAt, lastSeen: endAt, activeSeconds: 0, awaySeconds: 0, actions: 0, modules: new Set(), online: false }
    if (new Date(session.loginAt).getTime() < new Date(current.firstLogin).getTime()) current.firstLogin = session.loginAt
    if (new Date(endAt).getTime() > new Date(current.lastSeen).getTime()) current.lastSeen = endAt
    current.activeSeconds += Number(session.activeSeconds) || 0
    current.awaySeconds += Math.max(0, (Number(session.durationSeconds) || 0) - (Number(session.activeSeconds) || 0))
    current.actions += Number(session.activityCount) || 0
    current.online = current.online || session.sessionStatus === 'Online'
    ;(session.activities || []).forEach((item) => item.module && current.modules.add(item.module))
    groups.set(day, current)
  }
  return [...groups.values()].map((item) => ({ ...item, modules: [...item.modules] })).sort((a, b) => b.date.localeCompare(a.date))
}

function MetricCard({ label, value, note, icon: Icon, tone }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-slate-950">{value}</p></div><span className={`grid h-10 w-10 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span></div>
    <p className="mt-3 text-[11px] font-bold text-slate-500">{note}</p>
  </article>
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate()
  const [user] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'))
  const [data, setData] = useState({ summary: {}, users: [] })
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [filters, setFilters] = useState({ from: inputDate(-6), to: inputDate(0), search: '', role: 'all', risk: 'all' })

  async function load() {
    setLoading(true); setError('')
    try {
      const [overview, audit] = await Promise.all([
        api.get(API_ENDPOINTS.auth.superAdminOverview),
        api.get(API_ENDPOINTS.auth.auditLogs, { params: { from: filters.from, to: filters.to }, timeout: 20000 })
      ])
      setData(overview.data || overview)
      setLogs((audit.data || audit).rows || [])
    } catch (err) { setError(err?.response?.data?.error || 'Unable to load super admin analytics.') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filters.from, filters.to])

  const rows = useMemo(() => (data.users || []).map((row) => {
    const own = logs.filter((item) => String(item.userId) === String(row.id))
    const latest = [...own].sort((a, b) => new Date(b.loginAt || 0) - new Date(a.loginAt || 0))[0]
    const activeSeconds = own.reduce((sum, item) => sum + (Number(item.activeSeconds) || 0), 0)
    const openSeconds = own.reduce((sum, item) => sum + (Number(item.durationSeconds) || 0), 0)
    const activityCount = own.reduce((sum, item) => sum + (Number(item.activityCount) || 0), 0)
    const awaySeconds = Math.max(0, openSeconds - activeSeconds)
    const enriched = {
      ...row, own, latest, activeSeconds, openSeconds, awaySeconds, activityCount,
      sessions: own.length,
      online: latest?.sessionStatus === 'Online',
      presence: latest?.sessionStatus || 'No session',
      awayRatio: openSeconds ? awaySeconds / openSeconds : 0,
      modules: [...new Set(own.flatMap((item) => (item.activities || []).map((activity) => activity.module).filter(Boolean)))],
      recentActions: own.flatMap((item) => item.activities || []).sort((a, b) => new Date(b.occurredAt || 0) - new Date(a.occurredAt || 0)).slice(0, 12)
    }
    enriched.score = productivityScore(enriched)
    enriched.risk = userRisk(enriched)
    enriched.timeline = dailyTimeline(own)
    return enriched
  }), [data.users, logs])

  const visible = rows.filter((row) => {
    const search = filters.search.trim().toLowerCase()
    return (!search || `${row.name} ${row.email} ${row.role} ${row.team}`.toLowerCase().includes(search))
      && (filters.role === 'all' || row.role === filters.role)
      && (filters.risk === 'all' || row.risk.key === filters.risk)
  }).sort((a, b) => b.risk.rank - a.risk.rank || b.score - a.score)

  const summary = useMemo(() => ({
    online: rows.filter((row) => row.online).length,
    activeSeconds: rows.reduce((sum, row) => sum + row.activeSeconds, 0),
    awaySeconds: rows.reduce((sum, row) => sum + row.awaySeconds, 0),
    actions: rows.reduce((sum, row) => sum + row.activityCount, 0),
    attention: rows.filter((row) => row.risk.key !== 'healthy').length
  }), [rows])

  const attention = ['never', 'stale', 'away', 'inactive'].map((key) => ({ key, count: rows.filter((row) => row.risk.key === key).length, label: { never: 'Never logged in', stale: 'Stale accounts', away: 'High away ratio', inactive: 'Inactive accounts' }[key] }))
  const chart = [...rows].sort((a, b) => b.activeSeconds - a.activeSeconds).slice(0, 8).map((row) => ({ name: (row.name || 'User').split(' ')[0], Active: Math.round(row.activeSeconds / 60), Away: Math.round(row.awaySeconds / 60), Actions: row.activityCount, Closed: row.closedLeads }))
  const roles = [...new Set(rows.map((row) => row.role).filter(Boolean))]

  async function downloadPdf() {
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ orientation: 'landscape' })
    pdf.setFontSize(17); pdf.text('AnantTattva Super Admin User Activity Report', 14, 16)
    pdf.setFontSize(9); pdf.text(`${filters.from} to ${filters.to} | Users ${visible.length} | Online ${summary.online} | Actions ${summary.actions}`, 14, 23)
    let y = 33
    visible.forEach((row) => {
      if (y > 190) { pdf.addPage(); y = 16 }
      pdf.text(`${row.name} | ${roleLabels[row.role] || row.role || '-'} | Score ${row.score} | Leads ${row.totalLeads} (Closed ${row.closedLeads}) | Active ${duration(row.activeSeconds)} | Away ${duration(row.awaySeconds)} | ${row.sessions} sessions / ${row.activityCount} actions | Risk: ${row.risk.label}`, 14, y)
      y += 7
    })
    pdf.save(`AnantTattva_User_Activity_${filters.from}_${filters.to}.pdf`)
  }

  const cards = [
    ['Total Users', data.summary.users || 0, `${data.summary.activeUsers || 0} active accounts`, Users, 'bg-indigo-50 text-indigo-700'],
    ['Online Now', summary.online, 'Based on latest heartbeat', UserCheck, 'bg-emerald-50 text-emerald-700'],
    ['Active CRM Time', duration(summary.activeSeconds), `${filters.from} to ${filters.to}`, Timer, 'bg-cyan-50 text-cyan-700'],
    ['Away Time', duration(summary.awaySeconds), 'Hidden tab / other website', Clock3, 'bg-orange-50 text-orange-700'],
    ['CRM Actions', summary.actions.toLocaleString('en-IN'), 'Recorded user actions', Zap, 'bg-violet-50 text-violet-700'],
    ['Closed Leads', data.summary.closedLeads || 0, `${summary.attention} users need attention`, CheckCircle2, 'bg-teal-50 text-teal-700']
  ]

  return <DashboardShell currentUser={user}>
    <div className="min-h-screen bg-[#f3f8f6] p-4 lg:p-6">
      <div className="mx-auto max-w-[1700px]">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div><p className="text-[10px] font-black uppercase tracking-[.24em] text-orange-500">Super admin control center</p><h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">User Activity & Productivity</h1><p className="mt-2 text-sm font-semibold text-slate-500">Real-time user presence, CRM behavior, lead output and account-risk reporting.</p></div>
          <div className="flex flex-wrap gap-2"><button onClick={load} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-teal-700"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button><button onClick={downloadPdf} disabled={!visible.length} className="inline-flex h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 text-sm font-black text-emerald-700 disabled:opacity-50"><Download className="h-4 w-4" />Export Report</button><button onClick={() => navigate('/dashboard/users')} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#075848] px-4 text-sm font-black text-white"><Users className="h-4 w-4" />User Management</button></div>
        </header>

        <section className="mt-5 grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-2 xl:grid-cols-[1fr_1fr_2fr_1fr_1fr]">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">From<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold normal-case" /></label>
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">To<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold normal-case" /></label>
          <label className="relative self-end"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search user, email, role or team" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-semibold outline-none focus:border-emerald-500 focus:bg-white" /></label>
          <select value={filters.role} onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value }))} className="h-10 self-end rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold"><option value="all">All roles</option>{roles.map((role) => <option key={role} value={role}>{roleLabels[role] || role}</option>)}</select>
          <select value={filters.risk} onChange={(event) => setFilters((current) => ({ ...current, risk: event.target.value }))} className="h-10 self-end rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold"><option value="all">All risk levels</option><option value="healthy">Low risk</option><option value="away">High away ratio</option><option value="stale">Stale accounts</option><option value="never">Never logged in</option><option value="inactive">Inactive accounts</option></select>
        </section>

        {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div>}
        <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{cards.map(([label, value, note, Icon, tone]) => <MetricCard key={label} label={label} value={value} note={note} icon={Icon} tone={tone} />)}</section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_310px]">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-black text-slate-950">Active vs Away Time</h2><p className="text-xs font-semibold text-slate-500">Top users by time in selected period · minutes</p></div><Activity className="h-5 w-5 text-emerald-600" /></div><div className="mt-3 h-64"><ResponsiveContainer><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={10} /><YAxis fontSize={10} /><Tooltip /><Legend /><Bar dataKey="Active" fill="#059669" radius={[5,5,0,0]} /><Bar dataKey="Away" fill="#f97316" radius={[5,5,0,0]} /></BarChart></ResponsiveContainer></div></article>
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-black text-slate-950">Lead Output vs CRM Activity</h2><p className="text-xs font-semibold text-slate-500">Closed leads and recorded actions</p></div><Gauge className="h-5 w-5 text-violet-600" /></div><div className="mt-3 h-64"><ResponsiveContainer><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={10} /><YAxis fontSize={10} /><Tooltip /><Legend /><Bar dataKey="Actions" fill="#7c3aed" radius={[5,5,0,0]} /><Bar dataKey="Closed" fill="#14b8a6" radius={[5,5,0,0]} /></BarChart></ResponsiveContainer></div></article>
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-orange-500" /><div><h2 className="font-black text-slate-950">Admin Attention</h2><p className="text-xs font-semibold text-slate-500">Accounts to review</p></div></div><div className="mt-3 space-y-2">{attention.map((item) => <button key={item.key} onClick={() => setFilters((current) => ({ ...current, risk: current.risk === item.key ? 'all' : item.key }))} className="flex w-full items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-left"><span className="text-xs font-black text-slate-700">{item.label}</span><strong className="text-lg text-slate-950">{item.count}</strong></button>)}</div></aside>
        </section>

        <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h2 className="text-lg font-black text-slate-950">User Activity & Productivity Report</h2><p className="text-xs font-semibold text-slate-500">{visible.length} users · score combines focus time, actions and closed-lead output.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Live audit data</span></div>
          <div className="overflow-auto"><table className="w-full min-w-[1450px] text-left text-sm"><thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500"><tr>{['User','Role / Team','Presence','Productivity Score','Leads','Active Time','Away Time','Sessions / Actions','Last Login','Risk','Details'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody>{visible.map((row) => <tr key={row.id} className="border-t border-slate-100 font-semibold text-slate-700 hover:bg-emerald-50/30"><td className="px-4 py-3"><strong className="block text-slate-950">{row.name}</strong><small className="text-slate-500">{row.email}</small></td><td className="px-4"><strong>{roleLabels[row.role] || row.role || '-'}</strong><small className="block text-slate-500">{row.team || 'No team assigned'}</small></td><td className="px-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${row.online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{row.online ? 'Online' : row.presence}</span></td><td className="px-4"><strong className="text-slate-950">{row.score}</strong><div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${row.score}%` }} /></div></td><td className="px-4"><strong>Total {row.totalLeads}</strong><small className="block text-emerald-700">Closed {row.closedLeads} · Open {row.openLeads}</small></td><td className="px-4 font-black text-emerald-700">{duration(row.activeSeconds)}</td><td className="px-4 font-black text-orange-700">{duration(row.awaySeconds)}</td><td className="px-4"><strong>{row.sessions} sessions</strong><small className="block">{row.activityCount} CRM actions</small></td><td className="px-4 text-xs">{dateTime(row.lastLogin)}</td><td className="px-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${row.risk.tone}`}>{row.risk.label}</span></td><td className="px-4"><button onClick={() => setSelected(row)} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-emerald-700"><Eye className="h-4 w-4" /></button></td></tr>)}{!loading && !visible.length && <tr><td colSpan="11" className="p-12 text-center font-black text-slate-400">No users match these filters.</td></tr>}</tbody></table></div>
        </section>
      </div>
    </div>

    {selected && <div className="fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><aside className="ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"><header className="border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-white p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-700">User audit profile</p><h2 className="mt-1 text-2xl font-black text-slate-950">{selected.name}</h2><p className="text-sm font-semibold text-slate-500">{selected.email} · {roleLabels[selected.role] || selected.role}</p></div><button onClick={() => setSelected(null)} className="grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-500 shadow-sm"><X className="h-5 w-5" /></button></div><div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-xl bg-white p-3"><small className="font-black uppercase text-slate-400">Score</small><strong className="mt-1 block text-xl">{selected.score}</strong></div><div className="rounded-xl bg-white p-3"><small className="font-black uppercase text-slate-400">Sessions</small><strong className="mt-1 block text-xl">{selected.sessions}</strong></div><div className="rounded-xl bg-white p-3"><small className="font-black uppercase text-slate-400">Actions</small><strong className="mt-1 block text-xl">{selected.activityCount}</strong></div></div></header><div className="flex-1 space-y-5 overflow-y-auto p-5"><section><h3 className="flex items-center gap-2 text-sm font-black text-slate-950"><CalendarDays className="h-4 w-4 text-emerald-600" />Daily timeline</h3><div className="mt-3 space-y-2">{selected.timeline.length ? selected.timeline.map((day) => <article key={day.date} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><strong>{new Date(`${day.date}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong><span className={`rounded-full px-2 py-1 text-[10px] font-black ${day.online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{day.online ? 'Online' : 'Offline'}</span></div><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><p><span className="block font-black uppercase text-slate-400">First login</span>{dateTime(day.firstLogin)}</p><p><span className="block font-black uppercase text-slate-400">Offline / Last seen</span>{day.online ? 'Currently online' : dateTime(day.lastSeen)}</p><p><span className="block font-black uppercase text-slate-400">Active</span>{duration(day.activeSeconds)}</p><p><span className="block font-black uppercase text-slate-400">Away</span>{duration(day.awaySeconds)}</p></div><p className="mt-3 text-xs font-bold text-slate-500">Modules: {day.modules.join(', ') || 'No module actions'}</p></article>) : <p className="rounded-xl bg-slate-50 p-5 text-sm font-bold text-slate-500">No sessions in selected period.</p>}</div></section><section><h3 className="flex items-center gap-2 text-sm font-black text-slate-950"><Activity className="h-4 w-4 text-violet-600" />Recent CRM actions</h3><div className="mt-3 space-y-2">{selected.recentActions.length ? selected.recentActions.map((action, index) => <article key={action.id || index} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex justify-between gap-3"><strong className="text-xs text-emerald-800">{action.module}</strong><small className="text-slate-400">{dateTime(action.occurredAt)}</small></div><p className="mt-1 text-sm font-semibold text-slate-700">{action.description}</p></article>) : <p className="rounded-xl bg-slate-50 p-5 text-sm font-bold text-slate-500">No recorded actions.</p>}</div></section><section className="rounded-2xl border border-slate-200 p-4"><h3 className="flex items-center gap-2 text-sm font-black"><Monitor className="h-4 w-4 text-slate-500" />Latest access</h3><p className="mt-3 text-xs font-bold text-slate-600">IP: {selected.latest?.ipAddress || '-'}</p><p className="mt-1 break-words text-xs font-bold text-slate-600">Device: {selected.latest?.device || '-'}</p></section></div><footer className="grid gap-2 border-t border-slate-200 p-4 sm:grid-cols-2"><button onClick={() => navigate('/dashboard/users')} className="h-11 rounded-xl border border-emerald-200 font-black text-emerald-700">View Full Logs</button><button onClick={() => navigate('/dashboard/users')} className="h-11 rounded-xl bg-[#075848] font-black text-white">Open User Management</button></footer></aside></div>}
  </DashboardShell>
}
