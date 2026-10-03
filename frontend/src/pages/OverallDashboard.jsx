import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { ArrowLeft, BarChart3, RefreshCw, Search, Users, UserCheck, UserX, Layers } from 'lucide-react'
import DashboardShell from '../components/dashboard/DashboardShell'
import api from '../services/api'

const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'
export default function OverallDashboard() {
  const [user] = useState(() => { try { return JSON.parse(localStorage.getItem('user') || '{}') } catch { return {} } })
  const [data, setData] = useState(null)
  const [year, setYear] = useState('')
  const [type, setType] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const pendingRequest = useRef(null)
  const requestSequence = useRef(0)
  const load = useCallback(async (signal) => {
    if (pendingRequest.current?.year === year && !pendingRequest.current.signal?.aborted) return
    const sequence = ++requestSequence.current
    pendingRequest.current = { year, signal }
    setLoading(true)
    try {
      const response = await api.get('/dashboard-insights/overall', { params: { financialYear: year }, signal, timeout: 25000 })
      if (sequence === requestSequence.current && !signal?.aborted) { setData(response.data); setError('') }
    } catch (err) {
      if (sequence === requestSequence.current && err.code !== 'ERR_CANCELED') setError(err.response?.data?.error || 'Dashboard request timed out or could not load. Please refresh and retry.')
    } finally {
      if (sequence === requestSequence.current) { pendingRequest.current = null; if (!signal?.aborted) setLoading(false) }
    }
  }, [year])
  useEffect(() => { const controller = new AbortController(); load(controller.signal); const timer = setInterval(() => { if (document.visibilityState === 'visible') load(controller.signal) }, 60000); return () => { controller.abort(); clearInterval(timer) } }, [load])
  const selected = data?.groups?.find((group) => group.type === type)
  const clients = useMemo(() => (selected?.clients || []).filter((client) => client.name.toLowerCase().includes(query.toLowerCase())), [selected, query])
  const years = useMemo(() => [...new Set([...(data?.yearOptions || []), ...Array.from({ length: 7 }, (_, index) => `${2024 + index}-${String(2025 + index).slice(-2)}`)])].sort(), [data?.yearOptions])
  const metrics = [['Unique clients', 'clients', Users], ['Active clients', 'active', UserCheck], ['Inactive clients', 'inactive', UserX], ['Closed service uptake', 'services', Layers]]
  return <DashboardShell currentUser={user}><main className="min-h-full space-y-6 bg-slate-50 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-wrap items-center justify-between gap-5 rounded-3xl bg-gradient-to-br from-emerald-950 via-teal-900 to-emerald-700 p-7 text-white shadow-lg">
      <div><p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-200">Portfolio intelligence</p><h1 className="mt-2 flex items-center gap-3 text-3xl font-black"><BarChart3 />Overall Dashboard</h1><p className="mt-2 max-w-2xl text-sm text-emerald-100">Financial year insights from closed purchase orders. Each company counts once per year.</p></div>
      <button type="button" onClick={() => load()} disabled={loading} className="flex items-center gap-2 rounded-xl border border-white/30 px-4 py-3 font-bold disabled:opacity-60"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} />Refresh</button>
    </header>
    <div className="flex flex-wrap items-center justify-between gap-4"><label className="flex items-center gap-3 text-sm font-bold text-slate-700">Financial year<select aria-label="Financial year" value={year || data?.financialYear || ''} onChange={(event) => { setYear(event.target.value); setType(''); setQuery('') }} className="rounded-xl border border-slate-200 bg-white px-4 py-3"><option value="">Latest available</option>{years.map((fy) => <option key={fy}>{fy}</option>)}</select></label><span className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700">{data?.visibility === 'all' ? 'All users · ' : data?.visibility === 'team' ? 'My team & my clients · ' : data?.visibility === 'self' ? 'My clients · ' : ''}Closed POs only · Refreshes every minute</span></div>
    {error && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, key, Icon]) => <section key={key} className={card}><div className="flex items-center justify-between text-slate-500"><p className="text-sm font-bold">{label}</p><Icon className="text-emerald-600" size={21} /></div><p className="mt-3 text-3xl font-black text-slate-900">{loading && !data ? '…' : data?.summary?.[key] ?? '—'}</p><p className="mt-1 text-xs text-slate-400">{data?.financialYear || year || 'Data not loaded'}</p></section>)}</div>
    <div className="grid gap-5 xl:grid-cols-2"><section className={card}><h2 className="font-black text-slate-900">Client portfolio by financial year</h2><p className="mb-5 mt-1 text-xs text-slate-500">Unique companies with closed POs; inactive status is current.</p><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={data?.trends || []}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="year" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="active" name="Active clients" fill="#059669" stackId="clients" radius={[0, 0, 4, 4]} /><Bar dataKey="inactive" name="Inactive clients" fill="#f59e0b" stackId="clients" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></section><section className={card}><h2 className="font-black text-slate-900">Client growth trend</h2><p className="mb-5 mt-1 text-xs text-slate-500">Yearly counts reflect that year's closed PO participation.</p><div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={data?.trends || []}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="year" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Line type="monotone" dataKey="clients" name="Unique clients" stroke="#0f766e" strokeWidth={3} dot={{ r: 5 }} /><Line type="monotone" dataKey="inactive" name="Inactive clients" stroke="#f59e0b" strokeWidth={2} /></LineChart></ResponsiveContainer></div></section></div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-4 border-b p-5"><div><h2 className="text-lg font-black text-slate-900">{type ? `${type} · Client service details` : 'Applicant / Sub-applicant service matrix'}</h2><p className="mt-1 text-xs text-slate-500">{type ? 'Yes / 1 = service has a closed PO in this FY. No / 0 = no closed PO for this service.' : 'Click an applicant type to see clients and their service participation.'}</p></div>{type && <><button type="button" onClick={() => { setType(''); setQuery('') }} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold"><ArrowLeft size={16} />All applicant types</button><label className="flex items-center gap-2 rounded-lg border px-3 py-2"><Search size={16} /><input aria-label="Search clients" placeholder="Search clients" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 outline-none" /></label></>}</div>
      <div className="max-h-[600px] overflow-auto"><table className="w-full border-separate border-spacing-0 text-left text-sm"><thead><tr><th className="sticky left-0 top-0 z-20 min-w-64 border-b bg-slate-100 px-5 py-4">{type ? 'Client' : 'Applicant / Sub-applicant type'}</th><th className="sticky top-0 z-10 min-w-28 border-b bg-slate-100 px-4 py-4">{type ? 'Status' : 'Clients'}</th>{data?.services?.map((service) => <th key={service} className="sticky top-0 z-10 min-w-40 max-w-48 border-b bg-slate-100 px-4 py-4 text-xs">{service}</th>)}</tr></thead><tbody>{(type ? clients : data?.groups || []).map((row) => <tr key={type ? row.key : row.type} className="group"><td className="sticky left-0 z-10 border-b bg-white px-5 py-4 font-bold group-hover:bg-emerald-50">{type ? row.name : <button type="button" onClick={() => setType(row.type)} className="text-emerald-700 underline decoration-emerald-200 underline-offset-4">{row.type}</button>}</td><td className="border-b px-4 py-4">{type ? <span className={`rounded-full px-2 py-1 text-xs font-bold ${row.inactive ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{row.inactive ? 'Inactive' : 'Active'}</span> : <span className="font-black">{row.count}</span>}</td>{data?.services?.map((service) => <td key={service} className="border-b px-4 py-4 text-center"><span className={row.services[service] ? 'font-bold text-emerald-700' : 'text-slate-400'}>{type ? row.services[service] ? 'Yes / 1' : 'No / 0' : row.services[service]}</span></td>)}</tr>)}{type && !clients.length && <tr><td colSpan={(data?.services?.length || 0) + 2} className="p-10 text-center text-slate-500">No clients with closed POs for this selection.</td></tr>}</tbody></table></div>
    </section>
  </main></DashboardShell>
}
