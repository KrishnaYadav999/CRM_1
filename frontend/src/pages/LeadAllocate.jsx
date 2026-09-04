import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, RefreshCw, Search, ShieldCheck, UserCheck, UserPlus, Users } from 'lucide-react'
import DashboardShell from '../components/dashboard/DashboardShell'
import ProfileModal from '../components/dashboard/ProfileModal'
import api, { API_ENDPOINTS } from '../services/api'

function idOf(value) {
  return String(value?._id || value?.id || value || '').trim()
}

function ownerId(lead) {
  return idOf(lead.generatedForUser) || idOf(lead.createdBy)
}

function ownerName(lead) {
  return lead.generatedForUser?.name || lead.generatedForName || lead.createdBy?.name || lead.createdByName || lead.createdByEmail || lead.importedCreatedBy || 'Not allocated'
}

export default function LeadAllocate() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [leads, setLeads] = useState([])
  const [admins, setAdmins] = useState([])
  const [search, setSearch] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [message, setMessage] = useState(null)

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const [meResult, leadResult, userResult] = await Promise.all([
        api.get(API_ENDPOINTS.auth.me),
        api.get(API_ENDPOINTS.leads.list),
        api.get(API_ENDPOINTS.auth.users)
      ])
      setCurrentUser(meResult.data?.user || meResult.data)
      setLeads(leadResult.data?.leads || [])
      const users = userResult.data?.users || userResult.data || []
      setAdmins(users.filter((user) => user.isActive !== false))
    } catch (error) {
      setMessage({ kind: 'error', text: error.response?.data?.error || 'Unable to load lead allocation data.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return leads.filter((lead) => {
      const currentOwner = ownerId(lead)
      if (ownerFilter === 'unassigned' && currentOwner) return false
      if (ownerFilter !== 'all' && ownerFilter !== 'unassigned' && currentOwner !== ownerFilter) return false
      if (!query) return true
      return [lead.leadCode, lead.company, lead.contactPerson, lead.mobileNo1, lead.emails, ownerName(lead), lead.status]
        .some((value) => String(value || '').toLowerCase().includes(query))
    })
  }, [leads, ownerFilter, search])

  const counts = useMemo(() => ({
    total: leads.length,
    allocated: leads.filter((lead) => ownerId(lead)).length,
    unassigned: leads.filter((lead) => !ownerId(lead)).length
  }), [leads])

  const allocate = async (lead, userId) => {
    if (!userId || savingId) return
    const leadId = idOf(lead)
    try {
      setSavingId(leadId)
      const result = await api.patch(API_ENDPOINTS.leads.allocation(leadId), { userId })
      setLeads((current) => current.map((item) => idOf(item) === leadId ? result.data.lead : item))
      setMessage({ kind: 'success', text: result.data.message || 'Lead allocation saved in database.' })
    } catch (error) {
      setMessage({ kind: 'error', text: error.response?.data?.error || 'Unable to allocate this lead.' })
    } finally {
      setSavingId('')
    }
  }

  const logout = async () => {
    await api.post(API_ENDPOINTS.auth.logout, {}).catch(() => {})
    localStorage.clear()
    navigate('/')
  }

  return <DashboardShell currentUser={currentUser} onOpenProfile={() => setProfileOpen(true)} onLogout={logout}>
    <main className="min-h-screen bg-[linear-gradient(180deg,#eef7ff_0%,#f8fafc_46%,#f1f5f9_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[28px] border border-white bg-white/90 p-6 shadow-[0_20px_70px_rgba(15,23,42,.08)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-200"><UserPlus className="h-8 w-8" /></span>
            <div><div className="mb-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-[.2em] text-indigo-700 ring-1 ring-indigo-200"><ShieldCheck className="h-3.5 w-3.5" /> Admin controlled</div><h1 className="text-3xl font-black tracking-tight text-slate-950">Lead <span className="text-indigo-600">Allocate</span></h1><p className="mt-2 text-sm font-semibold text-slate-500">Admin and Super Admin can allocate sales ownership to any active CRM user. Every change is saved directly in the database and reflected in Sales MIS.</p></div>
          </div>
          <div className="flex gap-2"><button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700"><ArrowLeft className="h-4 w-4" /> Back</button><button type="button" onClick={() => load(true)} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button></div>
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          {[[Users, 'Total leads', counts.total, 'from live database'], [UserCheck, 'Allocated', counts.allocated, 'admin owner assigned'], [UserPlus, 'Unassigned', counts.unassigned, 'needs an owner']].map(([Icon, label, value, hint]) => <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-indigo-600 shadow-sm"><Icon className="h-5 w-5" /></span><div><div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div><div className="text-2xl font-black text-slate-950">{value}</div></div></div><div className="mt-2 text-xs font-semibold text-slate-400">{hint}</div></div>)}
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lead code, company, contact or owner..." className="w-full rounded-2xl border border-slate-200 py-3 pl-11 pr-4 text-sm font-semibold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></label>
          <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none"><option value="all">All owners</option><option value="unassigned">Unassigned</option>{admins.map((admin) => <option key={idOf(admin)} value={idOf(admin)}>{admin.name || admin.email}</option>)}</select>
        </div>
      </section>

      {message && <div className={`mx-auto mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${message.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>{message.text}</div>}
      <section className="mt-5 overflow-hidden rounded-[28px] border border-white bg-white shadow-[0_20px_70px_rgba(15,23,42,.08)]">
        <div className="border-b border-slate-200 px-5 py-4 text-sm font-black text-slate-700">Showing {rows.length} of {leads.length} leads · {admins.length} active CRM users available</div>
        <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-indigo-50 text-left text-[10px] font-black uppercase tracking-[.16em] text-indigo-900"><tr><th className="px-5 py-4">Lead / Company</th><th className="px-5 py-4">Contact</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Current owner</th><th className="px-5 py-4">Allocate to user</th></tr></thead><tbody className="divide-y divide-slate-100">
          {loading && <tr><td colSpan="5" className="px-5 py-16 text-center font-bold text-indigo-600"><RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />Loading live leads...</td></tr>}
          {!loading && !rows.length && <tr><td colSpan="5" className="px-5 py-16 text-center font-bold text-slate-500">No matching leads found.</td></tr>}
          {!loading && rows.map((lead) => <tr key={idOf(lead)} className="hover:bg-slate-50"><td className="px-5 py-4"><div className="font-black text-slate-950">{lead.company || 'Unnamed company'}</div><div className="mt-1 text-xs font-bold text-indigo-600">{lead.leadCode || '-'}</div></td><td className="px-5 py-4"><div className="font-bold text-slate-700">{lead.contactPerson || '-'}</div><div className="text-xs text-slate-500">{lead.mobileNo1 || lead.emails || '-'}</div></td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600">{lead.status || lead.workflowStatus || 'Open'}</span></td><td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black ${ownerId(lead) ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'}`}>{ownerId(lead) && <CheckCircle2 className="h-3.5 w-3.5" />}{ownerName(lead)}</span></td><td className="px-5 py-4"><select disabled={savingId === idOf(lead)} value={ownerId(lead)} onChange={(event) => allocate(lead, event.target.value)} className="min-w-[230px] rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-100"><option value="">Select active CRM user</option>{admins.map((admin) => <option key={idOf(admin)} value={idOf(admin)}>{admin.name || admin.email} · {String(admin.role).toUpperCase()}</option>)}</select></td></tr>)}
        </tbody></table></div>
      </section>
      {profileOpen && <ProfileModal user={currentUser} saving={false} onClose={() => setProfileOpen(false)} onLogout={logout} onSave={() => {}} onUpdatePassword={() => {}} />}
    </main>
  </DashboardShell>
}
