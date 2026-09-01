import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, ChevronDown, RefreshCw, Search, Users, X } from 'lucide-react';
import DashboardShell from '../components/dashboard/DashboardShell';
import ProfileModal from '../components/dashboard/ProfileModal';
import api, { API_ENDPOINTS } from '../services/api';
import { adminRoles, roleLabels } from '../constants/dashboard';

function clientMasterGroupingIdentityForAllocation({ applicantType = '', subApplicantType = '', plantUnit = '', eprCategory = '', piboCategory = '', servicesOffered = '', servicePeriod = '', financialYear = '', applicantLabel = '' }) {
  const clean = (v = '') => String(v || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return [
    clean(applicantType),
    clean(subApplicantType),
    clean(plantUnit),
    clean(eprCategory),
    clean(piboCategory),
    clean(servicesOffered),
    clean(servicePeriod),
    clean(financialYear),
    clean(applicantLabel)
  ].filter(Boolean).join('::');
}

function extractServicesFromClient(client = {}) {
  const data = client.data || {};
  const rawServices = Array.isArray(client.services) ? client.services : [];
  const serviceMap = new Map();
  const services = rawServices.length ? rawServices.map((s) => {
    const serviceData = (s && typeof s === 'object') ? s : {};
    return Object.assign({}, serviceData, {
      applicantType: serviceData.applicantType || serviceData.piboParent || data.selectedLeadSnapshot?.applicantType || data.selectedLeadSnapshot?.piboParent || data.selectedLeadSnapshot?.piboCategoryParent || '',
      subApplicantType: serviceData.piboCategory || data.selectedLeadSnapshot?.subApplicantType || data.basic?.piboCategory || data.selectedLeadSnapshot?.piboCategory || serviceData.subApplicantType || '',
      servicesOffered: serviceData.servicesOffered || data.selectedLeadSnapshot?.servicesOffered || data.basic?.servicesOffered || '',
      eprCategory: serviceData.eprCategory || data.selectedLeadSnapshot?.eprCategory || data.basic?.eprCategory || serviceData.serviceCategory || '',
      financialYear: serviceData.financialYear || serviceData.servicesForYear || (Array.isArray(serviceData.annualReturnYears) ? serviceData.annualReturnYears[0] : '') || '',
      plantUnit: serviceData.plantUnit || data.selectedLeadSnapshot?.plantUnit || data.basic?.plantUnit || '',
      piboParent: serviceData.piboParent || serviceData.applicantType || data.selectedLeadSnapshot?.piboParent || '',
      piboCategory: serviceData.piboCategory || serviceData.subApplicantType || data.selectedLeadSnapshot?.piboCategory || data.basic?.piboCategory || '',
      assignedServiceId: serviceData.assignedServiceId || data.assignedServiceId || client.assignedServiceId || '',
      serviceCategory: serviceData.serviceCategory || serviceData.eprCategory || data.selectedLeadSnapshot?.eprCategory || data.basic?.eprCategory || ''
    });
  }) : [];
  if (services.length) {
    services.forEach((svc) => {
      const key = clientMasterGroupingIdentityForAllocation({ applicantType: svc.applicantType, subApplicantType: svc.piboCategory, plantUnit: svc.plantUnit, eprCategory: svc.eprCategory || svc.serviceCategory, servicesOffered: svc.servicesOffered, financialYear: svc.financialYear, piboCategory: svc.piboCategory });
      if (!serviceMap.has(key)) serviceMap.set(key, svc);
    });
    return Array.from(serviceMap.values());
  }
  if (data.selectedLeadSnapshot || data.basic || client.applicantType || client.servicesOffered) {
    const synthetic = {
      applicantType: data.selectedLeadSnapshot?.applicantType || data.selectedLeadSnapshot?.piboParent || client.applicantType || client.piboParent || '',
      subApplicantType: data.selectedLeadSnapshot?.subApplicantType || data.basic?.piboCategory || client.piboCategory || '',
      eprCategory: data.selectedLeadSnapshot?.eprCategory || data.basic?.eprCategory || client.eprCategory || '',
      piboCategory: data.basic?.piboCategory || data.selectedLeadSnapshot?.piboCategory || client.piboCategory || '',
      servicesOffered: data.selectedLeadSnapshot?.servicesOffered || data.basic?.servicesOffered || client.servicesOffered || '',
      plantUnit: data.selectedLeadSnapshot?.plantUnit || data.basic?.plantUnit || '',
      financialYear: data.selectedLeadSnapshot?.financialYear || data.basic?.onboardingYear || '',
      assignedServiceId: data.assignedServiceId || client.assignedServiceId || '',
      serviceCategory: data.selectedLeadSnapshot?.serviceCategory || data.selectedLeadSnapshot?.eprCategory || data.basic?.eprCategory || client.eprCategory || ''
    };
    return [synthetic];
  }
  return [];
}

function readClientOverview(client = {}) {
  const data = client.data || {};
  const snap = data.selectedLeadSnapshot || {};
  const basic = data.basic || {};
  const overview = data.companyOverview || {};
  const contact = data.authorisedContact || data.authorizedContact || {};
  const lead = client.selectedLead || {};
  const companyName = basic.clientLegalName || basic.tradeName || data.importMeta?.companyName || snap.companyName || client.companyName || overview.companyName || lead.company || '—';
  const contactPerson = basic.contactPerson || contact.contactPerson || snap.contactPerson || client.contactPerson || lead.contactPerson || '';
  const mobile = basic.mobileNo || contact.mobile || basic.mobileNo1 || basic.mobile || snap.mobileNo1 || lead.mobile || '';
  const email = basic.emailId || contact.email || basic.email || snap.email || lead.email || '';
  const gstin = basic.gstNumber || snap.gstNumber || data.importMeta?.gstNumber || '';
  const state = basic.state || snap.state || lead.state || '';
  const city = basic.city || snap.city || lead.city || '';
  const leadCode = String(data.importMeta?.leadNumber || snap.leadCode || lead.leadCode || client.uniqueId || '').trim();
  return { companyName, contactPerson, mobile, email, gstin, state, city, leadCode };
}

function userDisplay(u) {
  const roleRaw = u ? u.role : '';
  const roleLabel = roleLabels[String(roleRaw || '').toLowerCase()] || String(roleRaw || '').trim();
  const roleText = String(roleLabel || '').toLowerCase().replace(/[\s_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const name = u ? (u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'Unknown') : 'Unknown';
  return roleText ? `${name} · ${roleText}` : name;
}

export default function ClientMasterAllocate() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);
  const [modalClient, setModalClient] = useState(null);
  const [allocationsByKey, setAllocationsByKey] = useState({});
  const handleLogout = async () => { try { await api.post(API_ENDPOINTS.auth.logout || '/auth/logout', {}).catch(() => {}); } catch {} localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/login'; };
  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) setCurrentUser(JSON.parse(raw));
    } catch {}
    loadEverything();
    async function loadEverything() {
      try {
        setLoading(true);
        const [cRes, uRes] = await Promise.all([
          api.get(API_ENDPOINTS.clients.list).catch((e) => ({ data: { clients: [] } })),
          api.get(API_ENDPOINTS.auth.users || API_ENDPOINTS.users).catch((e) => ({ data: { users: [] } }))
        ]);
        const cl = Array.isArray(cRes?.data?.clients) ? cRes.data.clients : (Array.isArray(cRes?.data) ? cRes.data : []);
        const ul = Array.isArray(uRes?.data?.users) ? uRes.data.users : (Array.isArray(uRes?.data) ? uRes.data : []);
        setClients(cl);
        setUsers(ul.filter((u) => u.isActive !== false));
      } catch (e) { console.error(e); } finally { setLoading(false); }
    }
  }, []);
  const roleOk = (user) => {
    const r = String(user?.role || '').toLowerCase();
    return adminRoles.includes(r) || r === 'manager';
  };
  const visibleClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      const o = readClientOverview(c);
      return [o.companyName, o.contactPerson, o.mobile, o.email, o.gstin, o.state, o.city, o.leadCode].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [clients, search]);
  const userList = useMemo(() => users.slice().sort((a, b) => (a.name || `${a.firstName || ''} ${a.lastName || ''}`).localeCompare(b.name || `${b.firstName || ''} ${b.lastName || ''}`)), [users]);
  const openAllocation = (client) => {
    const services = extractServicesFromClient(client);
    const existingAllocs = (client.serviceAllocations && typeof client.serviceAllocations === 'object') ? { ...(client.serviceAllocations.toObject ? client.serviceAllocations.toObject() : client.serviceAllocations) } : {};
    const next = {};
    services.forEach((svc, idx) => {
      const key = clientMasterGroupingIdentityForAllocation({ applicantType: svc.applicantType, subApplicantType: svc.piboCategory, plantUnit: svc.plantUnit, eprCategory: svc.eprCategory || svc.serviceCategory, servicesOffered: svc.servicesOffered, financialYear: svc.financialYear, piboCategory: svc.piboCategory }) || `fallback_${idx}`;
      const entry = existingAllocs[key] || existingAllocs[String(svc.assignedServiceId || idx)] || {};
      next[key] = String(entry.userId || entry.user || entry.assignedTo || '').trim();
    });
    setAllocationsByKey(next);
    setModalClient({ client, services });
  };
  const saveAllocations = async () => {
    if (!modalClient?.client?._id) return;
    try {
      setSaving(true);
      const body = Object.fromEntries(Object.entries(allocationsByKey).filter(([, v]) => v && String(v).trim()));
      const res = await api.put(API_ENDPOINTS.clients.allocations(modalClient.client._id), { allocations: body });
      if (res.data?.ok) {
        const idx = clients.findIndex((c) => String(c._id) === String(modalClient.client._id));
        if (idx >= 0) {
          const patched = [...clients]; patched[idx] = { ...patched[idx], serviceAllocations: res.data.allocations };
          setClients(patched);
        }
        showToast('success', 'Allocations saved', res.data.message || 'Service allocations updated successfully');
        setModalClient(null);
      } else {
        showToast('error', 'Save failed', res.data?.error || res.data?.message || 'Unknown error');
      }
    } catch (e) { showToast('error', 'Save failed', e?.response?.data?.error || e?.message || 'Unknown error'); } finally { setSaving(false); }
  };
  const refresh = async () => {
    try {
      setRefreshing(true);
      const cRes = await api.get(API_ENDPOINTS.clients.list);
      const ul = users;
      const cl = Array.isArray(cRes?.data?.clients) ? cRes.data.clients : (Array.isArray(cRes?.data) ? cRes.data : []);
      setClients(cl);
      setUsers(ul);
      showToast('success', 'Refreshed', `${cl.length} clients loaded`);
    } catch (e) { showToast('error', 'Refresh failed', e?.message || ''); } finally { setRefreshing(false); }
  };
  function showToast(kind, title, message) {
    const id = Date.now();
    setToast({ kind, title, message, id });
    setTimeout(() => { setToast((t) => (t?.id === id ? null : t)); }, 4200);
  }
  if (currentUser && !roleOk(currentUser)) {
    return (
      <DashboardShell currentUser={currentUser} onOpenProfile={() => setProfileOpen(true)} onLogout={handleLogout}>
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-700 shadow-sm">
          <div className="font-black uppercase tracking-wide">Access denied</div>
          <div className="text-sm">This page is only visible to managers and administrators.</div>
        </div></div>
        {profileOpen && <ProfileModal user={currentUser} saving={false} onClose={() => setProfileOpen(false)} onLogout={handleLogout} onSave={() => {}} onUpdatePassword={() => {}} />}
      </DashboardShell>
    );
  }
  const headerExtra = (<div className="mb-5 flex flex-wrap items-center gap-3">
    <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /> Back</button>
    <div className="ml-auto flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-80">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} type="search" placeholder="Search client, contact, GST, mobile, lead code..." className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
      </div>
      <button type="button" onClick={refresh} disabled={refreshing} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh</button>
    </div>
  </div>);
  return (
    <DashboardShell currentUser={currentUser} onOpenProfile={() => setProfileOpen(true)} onLogout={handleLogout}>
      <div className="bg-[#f5f7fb] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-6">
          <div className="flex items-center gap-3">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow"><Users className="h-5 w-5" /></div>
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Customer Hub</div>
            <h1 className="text-xl font-black text-slate-900">Client Master Allocate</h1>
            <p className="text-sm text-slate-500">Allocate each client services (Producer / Brand Owner / Importer etc.) individually to different users. Visible Admin / Managers only.</p>
          </div>
        </div>
        </div>
        {headerExtra}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Company / Lead</th>
                  <th className="px-4 py-3 text-left">Contact</th>
                  <th className="px-4 py-3 text-left">GST / Location</th>
                  <th className="px-4 py-3 text-left">Services</th>
                  <th className="px-4 py-3 text-left">Allocations</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {loading && <tr><td colSpan="6" className="px-4 py-10 text-center text-sm text-slate-500">Loading clients...</td></tr>}
                {!loading && visibleClients.length === 0 && <tr><td colSpan="6" className="px-4 py-10 text-center text-sm text-slate-500">No clients found{search ? ` matching "${search}"` : ''}</td></tr>}
                {!loading && visibleClients.map((client) => {
                  const overview = readClientOverview(client);
                  const services = extractServicesFromClient(client);
                  const allocs = (client.serviceAllocations && typeof client.serviceAllocations === 'object') ? (client.serviceAllocations.toObject ? client.serviceAllocations.toObject() : client.serviceAllocations) : {};
                  const assignedCount = Object.values(allocs).filter((v) => {
                    const uid = (typeof v === 'object' ? (v?.userId || v?.user) : v);
                    return !!String(uid || '').trim();
                  }).length;
                  return (<tr key={String(client._id)} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="font-black text-slate-900">{overview.companyName}</div>
                      <div className="text-[11px] font-black text-emerald-700">{overview.leadCode || String(client.uniqueId || '').trim()}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-slate-800">{overview.contactPerson || '—'}</div>
                      <div className="text-xs text-slate-500">{[overview.mobile, overview.email].filter(Boolean).join(' · ') || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-700">{overview.gstin || '—'}</div>
                      <div className="text-xs text-slate-500">{[overview.city, overview.state].filter(Boolean).join(', ') || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {services.map((svc, i) => (<span key={`svc-${String(client._id)}-s-${i}`} className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 shadow-[0_1px_0_rgba(148,163,184,0.15)]"><span>{svc.piboCategory || svc.subApplicantType || svc.applicantType || 'Service'}</span>{(svc.eprCategory || svc.serviceCategory) ? (<span className="ml-1 text-slate-400">· {svc.eprCategory || svc.serviceCategory}</span>) : null}</span>))}
                        {!services.length && <span className="text-[11px] text-slate-400">—</span>}
                      </div>
                      <div className="mt-0.5 text-[10px] font-black uppercase tracking-wide text-slate-400">{services.length || 0} total services</div>
                    </td>
                    <td className="px-4 py-3">
                      {assignedCount > 0 ? (<div className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700 shadow-[0_1px_0_rgba(16,185,129,0.15)]"><Check className="mr-1 h-3 w-3" />{assignedCount} / {services.length || 1} assigned</div>) : (<span className="text-[11px] font-black uppercase tracking-wide text-rose-600">Unassigned</span>)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => openAllocation(client)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white shadow-sm hover:bg-emerald-700"><Users className="h-3.5 w-3.5" /> Allocate Client</button>
                    </td>
                  </tr>);
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {modalClient && <AllocationModal isOpen onClose={() => !saving && setModalClient(null)} client={modalClient.client} services={modalClient.services} users={userList} values={allocationsByKey} setValues={setAllocationsByKey} saving={saving} onSave={saveAllocations} />}
      {toast && (
        <div className="quotation-approval-toast" role="status" aria-live="polite">
          <div className={`quotation-approval-toast-icon ${toast.kind === 'success' ? '' : ''}`}>
            <Check className="h-5 w-5" />
          </div>
          <div>
            <strong>{toast.title}</strong>
            <p>{toast.message}</p>
            <span>{toast.kind === 'success' ? 'Allocation workflow has been saved.' : 'Please review and retry.'}</span>
          </div>
        </div>
      )}
      {profileOpen && <ProfileModal user={currentUser} saving={false} onClose={() => setProfileOpen(false)} onLogout={handleLogout} onSave={() => {}} onUpdatePassword={() => {}} />}
    </DashboardShell>
  );
}

function AllocationModal({ isOpen, onClose, client, services = [], users = [], values = {}, setValues, saving, onSave }) {
  if (!isOpen || !client) return null;
  const overview = readClientOverview(client);
  const existingAllocs = (client.serviceAllocations && typeof client.serviceAllocations === 'object') ? (client.serviceAllocations.toObject ? client.serviceAllocations.toObject() : client.serviceAllocations) : {};
  const userById = useMemo(() => new Map(users.map((u) => [String(u._id), u])), [users]);
  const rows = services.map((svc, idx) => {
    const key = clientMasterGroupingIdentityForAllocation({ applicantType: svc.applicantType, subApplicantType: svc.piboCategory, plantUnit: svc.plantUnit, eprCategory: svc.eprCategory || svc.serviceCategory, servicesOffered: svc.servicesOffered, financialYear: svc.financialYear, piboCategory: svc.piboCategory }) || `fallback_${idx}`;
    const current = String(values[key] || '').trim();
    const existingEntry = existingAllocs[key] || existingAllocs[String(svc.assignedServiceId || idx)] || null;
    const existingUserId = String(existingEntry?.userId || existingEntry?.assignedTo || '').trim();
    const fallbackText = existingUserId && userById.has(existingUserId) ? userDisplay(userById.get(existingUserId)) : null;
    const selectedUser = current && userById.has(current) ? userById.get(current) : null;
    return { svc, idx, key, current, existingUserId, selectedUser, fallbackText };
  });
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto bg-slate-900/40 px-2 py-4 sm:items-center">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <div>
            <div className="text-[11px] font-black uppercase tracking-widest text-emerald-700">Allocate Services</div>
            <h2 className="text-lg font-black text-slate-900">{overview.companyName}</h2>
            <div className="mt-0.5 text-xs text-slate-500">
              <span className="font-black text-emerald-700">{overview.leadCode || String(client.uniqueId || '').trim()}</span>
              <span className="mx-1.5 text-slate-300">·</span>
              <span>{[overview.contactPerson, overview.mobile].filter(Boolean).join(' · ') || '—'}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3">
            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Service-by-service assignment</div>
            <div className="mt-2 text-xs text-slate-500">Each service (Producer · Brand Owner · Importer etc.) can be allocated to a DIFFERENT user.</div>
          </div>
          <div className="mt-4 space-y-3">
            {rows.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">No services found for this client.</div>}
            {rows.map((row) => (<div key={`allocation-row-${String(client._id)}-${row.idx}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="min-w-[48%] flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center rounded-md bg-slate-900 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-white">{row.svc.piboCategory || row.svc.subApplicantType || row.svc.applicantType || 'Service'}</span>
                  {(row.svc.eprCategory || row.svc.serviceCategory) && <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">{row.svc.eprCategory || row.svc.serviceCategory}</span>}
                  {row.svc.servicesOffered && <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-700">{row.svc.servicesOffered}</span>}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {row.svc.plantUnit ? (<span>Plant · {row.svc.plantUnit}</span>) : null}
                  {row.svc.financialYear ? (<span className={row.svc.plantUnit ? ' ml-1.5' : ''}>FY · {row.svc.financialYear}</span>) : null}
                  {row.existingUserId && row.fallbackText && !row.current ? (<span className="ml-2 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-black text-indigo-700">Previous: {row.fallbackText}</span>) : null}
                  {row.selectedUser ? (<span className="ml-2 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black text-emerald-700">Selected: {userDisplay(row.selectedUser)}</span>) : null}
                </div>
              </div>
              <div className="w-full sm:w-72">
                <div className="relative">
                  <select value={row.current} onChange={(e) => setValues((prev) => ({ ...prev, [row.key]: String(e.target.value || '') }))} className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-700 shadow-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100">
                    <option value="">— Unassigned —</option>
                    {users.map((u) => (<option key={String(u._id)} value={String(u._id)}>{userDisplay(u)}</option>))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
            </div>))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <button type="button" onClick={onClose} disabled={saving} className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-100 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={onSave} disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-70">{saving ? 'Saving…' : (<><Check className="h-3.5 w-3.5" /> Save Allocations</>)}</button>
        </div>
      </div>
    </div>
  );
}
