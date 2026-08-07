import React, { useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Clock3, FilePlus2, RefreshCw, UserRound, X } from 'lucide-react';
import DashboardShell from '../components/dashboard/DashboardShell';
import api from '../services/api';
import { API_ENDPOINTS } from '../services/apiEndpoints';

function idFor(row = {}) { return row._id || row.id || row.sourceLeadId || row.leadCode || ''; }
function dateFor(row = {}) { return row.createdAt || row.importedCreatedAt || row.leadDate || ''; }
const PENDING_AFTER_MS = 15 * 60 * 1000;
function allServices(row = {}) {
  return Array.isArray(row.serviceSelections) && row.serviceSelections.length ? row.serviceSelections : [row];
}
function allAssignments(row = {}) {
  return Array.isArray(row.assignments) && row.assignments.length ? row.assignments : [row];
}
function serviceClosed(row = {}, index = 0) {
  const service = allServices(row)[index] || {};
  const assignment = allAssignments(row)[index] || {};
  return Boolean(
    service.closedBy || service.closedByText || service.closedAt
    || assignment.closedBy || assignment.closedByText || assignment.closedAt
    || (allServices(row).length === 1 && (row.closedBy || row.closedByText || row.closedAt))
  );
}
function servicesForMode(row = {}, mode = 'open') {
  return allServices(row).map((service, index) => ({
    service,
    assignment: allAssignments(row)[index] || {},
    originalIndex: index,
    closed: serviceClosed(row, index)
  })).filter((item) => mode === 'closed' ? item.closed : !item.closed);
}
function pendingDraft(row) {
  const date = new Date(dateFor(row) || 0);
  return Boolean(date.getTime() && Date.now() - date.getTime() >= PENDING_AFTER_MS && servicesForMode(row, 'open').length);
}
function closedLead(row) {
  return servicesForMode(row, 'closed').length > 0;
}
function filterDateFor(row, mode) { return mode === 'closed' ? (row.closedAt || row.updatedAt || dateFor(row)) : dateFor(row); }
function monthKey(input) {
  const date = new Date(input || 0);
  return date.getTime() ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : '';
}
function value(input) { return input === null || input === undefined || input === '' ? '-' : typeof input === 'object' ? (input.name || input.email || '-') : String(input); }
function normalizeIdentity(input) { return String(input || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' '); }
function quotationMatchesLead(quotation = {}, lead = {}) {
  const quotationIds = [quotation.leadId, quotation.leadRef?._id, quotation.leadRef, quotation.leadCode, quotation.businessLeadCode].map(normalizeIdentity).filter(Boolean);
  const leadIds = [idFor(lead), lead.sourceLeadId, lead.leadCode, lead.businessLeadCode].map(normalizeIdentity).filter(Boolean);
  if (quotationIds.some((token) => leadIds.includes(token))) return true;
  return Boolean(normalizeIdentity(quotation.companyName || quotation.leadDetails?.companyName) && normalizeIdentity(quotation.companyName || quotation.leadDetails?.companyName) === normalizeIdentity(lead.company));
}
function quotationBasicAmount(quotation = {}) {
  if (!quotation || !quotation.pricingMode) return null;
  if (quotation.pricingMode === 'combined') return Number(quotation.combinedBasicAmount || quotation.grandTotal || 0);
  return (quotation.items || []).reduce((sum, item) => sum + ((Number(item.unit) || 1) * (Number(item.basicAmount) || 0)), 0);
}
function formatInr(input) {
  const amount = Number(input);
  return Number.isFinite(amount) ? `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';
}
function pendingFor(row) {
  const elapsed = Math.max(0, Date.now() - new Date(dateFor(row) || 0).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ${minutes % 60} min`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

function formatHistoryDate(input) {
  const date = new Date(input || 0);
  if (!date.getTime()) return { date: 'Date unavailable', time: '' };
  return {
    date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  };
}

function historyTone(item = {}) {
  const type = `${item.type || ''} ${item.title || ''}`.toLowerCase();
  if (type.includes('approved') || type.includes('closed')) return { icon: CheckCircle2, badge: 'Completed', colors: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-600 ring-emerald-100' };
  if (type.includes('quotation') || type.includes('created')) return { icon: FilePlus2, badge: 'Created', colors: 'border-sky-200 bg-sky-50 text-sky-700', dot: 'bg-sky-600 ring-sky-100' };
  return { icon: Activity, badge: 'Updated', colors: 'border-violet-200 bg-violet-50 text-violet-700', dot: 'bg-violet-600 ring-violet-100' };
}

function readableField(input) {
  return String(input || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function PendingLeads({ mode = 'open' }) {
  const [currentUser, setCurrentUser] = useState(() => { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; } });
  const [leads, setLeads] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState('all');
  const [dayFilter, setDayFilter] = useState('all');
  const monthOptions = useMemo(() => [...new Set(leads.map((row) => monthKey(filterDateFor(row, mode))).filter(Boolean))].sort().reverse(), [leads, mode]);
  const rows = useMemo(() => leads.filter((row) => {
    const role = String(currentUser?.role || '').trim().toLowerCase();
    const admin = ['admin', 'superadmin', 'super admin'].includes(role);
    const mine = [row.createdBy, row.createdByCrmUserId, row.createdByEmail, row.createdByName, row.importedCreatedBy, row.assignedTo?._id, row.assignedToText, row.assignedStaff, row.assignedStaffText, ...(row.assignments || []).flatMap((item) => [item.assignedTo, item.assignedToText, item.assignedStaff, item.assignedStaffText])].map(normalizeIdentity);
    const identities = [currentUser?._id, currentUser?.id, currentUser?.crmUserId, currentUser?.email, currentUser?.name].map(normalizeIdentity).filter(Boolean);
    if (!admin && !identities.some((id) => mine.includes(id))) return false;
    if (mode === 'closed' ? !closedLead(row) : !pendingDraft(row)) return false;
    const relevantDate = new Date(filterDateFor(row, mode) || 0);
    if (monthFilter !== 'all' && monthKey(relevantDate) !== monthFilter) return false;
    if (dayFilter !== 'all') {
      const elapsedDays = (Date.now() - relevantDate.getTime()) / (24 * 60 * 60 * 1000);
      if (elapsedDays < 0 || elapsedDays > Number(dayFilter)) return false;
    }
    return true;
  }), [currentUser, dayFilter, leads, mode, monthFilter]);

  async function load() {
    setLoading(true);
    const [me, result, quotationResult] = await Promise.allSettled([api.get(API_ENDPOINTS.auth.me), api.get(API_ENDPOINTS.leads.list), api.get(API_ENDPOINTS.quotations.list)]);
    if (me.status === 'fulfilled') setCurrentUser(me.value.data?.user);
    setLeads(result.status === 'fulfilled' ? (result.value.data?.leads || []) : []);
    setQuotations(quotationResult.status === 'fulfilled' ? (quotationResult.value.data?.quotations || []) : []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function view(row) {
    setSelected(row);
    setHistory([]);
    const result = await Promise.allSettled([
      api.get(API_ENDPOINTS.leads.history(idFor(row)), { params: { leadCode: row.leadCode, company: row.company } })
    ]);
    setHistory(result.flatMap((item) => item.status === 'fulfilled' ? (item.value.data?.events || []) : []).sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)));
  }

  return <DashboardShell currentUser={currentUser}>
    <div className="p-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">Lead Review</p><h1 className="text-3xl font-black">{mode === 'closed' ? 'Lead Close' : 'Lead Open'}</h1><p className="mt-1 font-bold text-slate-500">{mode === 'closed' ? 'Closed leads visible within your assigned scope.' : 'Visible unclosed leads pending for 15 minutes or more.'}</p></div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-[10px] font-black uppercase tracking-wider text-slate-500">Month<select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"><option value="all">All Months</option>{monthOptions.map((month) => <option key={month} value={month}>{new Date(`${month}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</option>)}</select></label>
          <label className="grid gap-1 text-[10px] font-black uppercase tracking-wider text-slate-500">Days<select value={dayFilter} onChange={(event) => setDayFilter(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"><option value="all">All Days</option><option value="7">Last 7 Days</option><option value="15">Last 15 Days</option></select></label>
          <button onClick={load} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 font-black text-white"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        </div>
      </div>
      <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5">
        <table className="w-full min-w-[1450px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{['Sr. No.', mode === 'closed' ? 'Closed Date' : 'Lead Date', mode === 'closed' ? 'Lead Status' : 'Pending For', 'Lead Generated By', 'Company', 'Services', 'Service Added By', 'Financial Years', 'Quotation Basic Amount (INR)'].map((item) => <th className="px-4 py-4" key={item}>{item}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => {
            const matchingServices = servicesForMode(row, mode);
            const quotation = [...quotations].filter((item) => quotationMatchesLead(item, row)).sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0))[0];
            const contributors = [...new Set(matchingServices.map(({ service }) => service.createdByName || service.createdByEmail || row.importedCreatedBy || row.createdByName || row.createdByEmail).filter(Boolean))];
            return <tr className="border-t border-slate-100 hover:bg-emerald-50/30" key={idFor(row)}><td className="px-4 py-4 font-black">{index + 1}</td><td className="px-4 py-4">{value(filterDateFor(row, mode)).slice(0, 10)}</td><td className="px-4 py-4"><span className={`rounded-full px-3 py-1 font-black ${mode === 'closed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{mode === 'closed' ? 'Closed' : pendingFor(row)}</span></td><td className="px-4 py-4">{value(row.importedCreatedBy || row.createdByName || row.createdByEmail)}</td><td className="px-4 py-4"><button type="button" onClick={() => view(row)} className="text-left font-black text-slate-950 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-700">{value(row.company)}</button></td><td className="px-4 py-4">{value([...new Set(matchingServices.map(({ service }) => service.servicesOffered).filter(Boolean))].join(', '))}</td><td className="px-4 py-4"><div className="flex flex-wrap gap-1.5">{contributors.length ? contributors.map((name) => <span key={name} className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-black text-sky-700">{name}</span>) : '-'}</div></td><td className="px-4 py-4">{value([...new Set(matchingServices.map(({ service }) => service.firstAnnualReturnYearApplicable).filter(Boolean))].join(', '))}</td><td className="px-4 py-4 font-black text-emerald-700">{quotation ? formatInr(quotationBasicAmount(quotation)) : '-'}</td></tr>;
          })}{!rows.length && <tr><td colSpan={9} className="p-12 text-center font-black text-slate-400">{loading ? 'Loading leads...' : mode === 'closed' ? 'No closed leads found.' : 'No leads pending for 15 minutes.'}</td></tr>}</tbody>
        </table>
      </div>
    </div>
    {selected && <PendingLeadModal lead={selected} history={history} mode={mode} onClose={() => setSelected(null)} />}
  </DashboardShell>;
}

function PendingLeadModal({ lead, history, mode, onClose }) {
  const matchingRows = servicesForMode(lead, mode);
  const services = matchingRows.map((item) => item.service);
  const assignments = matchingRows.map((item) => item.assignment);
  return <div className="fixed inset-0 z-[100] overflow-auto bg-slate-950/55 p-4 backdrop-blur-sm sm:p-6">
    <section className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-start justify-between border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-sky-50 p-6">
        <div><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">{mode === 'closed' ? 'Closed Services' : 'Open Services'}</p><h2 className="mt-1 text-2xl font-black text-slate-950">{lead.company || 'Pending Lead'}</h2><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600 shadow-sm">{lead.leadCode || idFor(lead)}</span><span className={`rounded-full px-3 py-1 text-xs font-black ${mode === 'closed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{mode === 'closed' ? 'Closed' : `Pending ${pendingFor(lead)}`}</span><span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">{matchingRows.length} service{matchingRows.length === 1 ? '' : 's'}</span></div></div>
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm"><X className="h-5 w-5" /></button>
      </header>
      <div className="space-y-6 p-5 sm:p-6">
        <InfoGrid title="Lead Overview" rows={[['Lead Date', dateFor(lead)], ['Generated By', lead.importedCreatedBy || lead.createdByName || lead.createdByEmail], ['Communication Mode', lead.communicationMode], ['Status', lead.status], ['Contact Person', lead.contactPerson], ['Primary Email', lead.emails]]} />
        <DataTable title="Service & Applicant" headers={['#', 'Industry Type', 'Service Category', 'Applicant Type', 'Sub Applicant Type', 'Services Offered', 'Applicable Services', 'Financial Year']} rows={services.map((row, index) => [index + 1, row.industryType, row.eprCategory, row.applicantType, row.piboCategory, row.servicesOffered, row.applicableService, row.firstAnnualReturnYearApplicable])} />
        <DataTable title="Assignment Information" headers={['#', 'Closed By', 'Manager', 'Manager Email', 'Staff', 'Staff Email']} rows={assignments.map((row, index) => [index + 1, row.closedByText || row.closedBy?.name, row.assignedToText || row.assignedTo?.name, row.assignedToEmail || row.assignedTo?.email, row.assignedStaffText || row.assignedStaff?.name, row.assignedStaffEmail || row.assignedStaff?.email])} />
        <HistoryTimeline history={history} />
      </div>
    </section>
  </div>;
}

function InfoGrid({ title, rows }) {
  return <section><h3 className="mb-3 text-lg font-black text-slate-950">{title}</h3><div className="grid overflow-hidden rounded-2xl border border-slate-200 sm:grid-cols-2 lg:grid-cols-3">{rows.map(([label, item]) => <div key={label} className="border-b border-r border-slate-100 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 break-words text-sm font-bold text-slate-800">{value(item)}</p></div>)}</div></section>;
}

function DataTable({ title, headers, rows, emptyText = 'No records available.' }) {
  return <section><h3 className="mb-3 text-lg font-black text-slate-950">{title}</h3><div className="overflow-auto rounded-2xl border border-slate-200"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr>{headers.map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-slate-100 hover:bg-emerald-50/30">{row.map((item, index) => <td key={index} className={`px-4 py-3 ${index === 0 ? 'font-black' : ''}`}>{value(item)}</td>)}</tr>) : <tr><td colSpan={headers.length} className="p-8 text-center font-bold text-slate-400">{emptyText}</td></tr>}</tbody></table></div></section>;
}

function HistoryTimeline({ history = [] }) {
  return <section className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white shadow-sm">
    <header className="flex flex-col gap-4 border-b border-slate-200 bg-white/90 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-700">Activity timeline</p><h3 className="mt-1 text-xl font-black text-slate-950">Full Follow-up History</h3><p className="mt-1 text-sm font-semibold text-slate-500">Every important action for this lead, newest first.</p></div>
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><Activity className="h-5 w-5 text-emerald-600" /><div><strong className="block text-lg leading-none text-slate-950">{history.length}</strong><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total events</span></div></div>
    </header>
    {history.length ? <div className="p-5 sm:p-6">
      <div className="relative space-y-4 before:absolute before:bottom-7 before:left-[19px] before:top-7 before:w-px before:bg-gradient-to-b before:from-emerald-300 before:via-slate-200 before:to-transparent">
        {history.map((item, index) => {
          const tone = historyTone(item);
          const Icon = tone.icon;
          const formatted = formatHistoryDate(item.at);
          const description = String(item.description || 'No additional details recorded.');
          const updatedFields = description.startsWith('Updated ') ? description.slice(8).split(',').map((field) => readableField(field.trim())).filter(Boolean) : [];
          return <article key={item.id || `${item.type || item.title}-${item.at || index}`} className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-4">
            <span className={`relative z-10 grid h-10 w-10 place-items-center rounded-full text-white ring-4 ${tone.dot}`}><Icon className="h-4 w-4" /></span>
            <div className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-900/5 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${tone.colors}`}>{tone.badge}</span><h4 className="mt-2 text-base font-black text-slate-950">{item.title || readableField(item.type) || 'Lead activity'}</h4></div>
                <div className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-slate-500"><Clock3 className="h-4 w-4 text-slate-400" /><div><time className="block text-xs font-black text-slate-700">{formatted.date}</time><span className="block text-[10px] font-bold">{formatted.time}</span></div></div>
              </div>
              {updatedFields.length ? <details className="mt-4 rounded-xl border border-violet-100 bg-violet-50/50 p-3"><summary className="cursor-pointer select-none text-xs font-black text-violet-700">{updatedFields.length} fields updated · View details</summary><div className="mt-3 flex flex-wrap gap-1.5">{updatedFields.map((field) => <span key={field} className="rounded-lg border border-violet-100 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-600">{field}</span>)}</div></details> : <p className="mt-3 break-words text-sm font-semibold leading-6 text-slate-600">{description}</p>}
              <footer className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs font-bold text-slate-500"><span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-emerald-700"><UserRound className="h-3.5 w-3.5" /></span><span>Action by <strong className="text-slate-800">{value(item.actor)}</strong></span></footer>
            </div>
          </article>;
        })}
      </div>
    </div> : <div className="grid min-h-52 place-items-center p-8 text-center"><div><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Activity className="h-6 w-6" /></span><h4 className="mt-4 font-black text-slate-700">No history available</h4><p className="mt-1 text-sm font-semibold text-slate-400">New lead actions will appear here automatically.</p></div></div>}
  </section>;
}
