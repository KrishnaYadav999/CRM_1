import React, { useEffect, useMemo, useState } from 'react';
import { Eye, RefreshCw, X } from 'lucide-react';
import DashboardShell from '../components/dashboard/DashboardShell';
import api from '../services/api';
import { API_ENDPOINTS } from '../services/apiEndpoints';
import { fetchCcpLeads, fetchCcpLeadHistory } from '../services/ccpApi';

function idFor(row = {}) { return row._id || row.id || row.sourceLeadId || row.leadCode || ''; }
function dateFor(row = {}) { return row.createdAt || row.importedCreatedAt || row.leadDate || ''; }
const PENDING_AFTER_MS = 15 * 60 * 1000;
function pendingDraft(row) {
  const date = new Date(dateFor(row) || 0);
  const assignmentClosed = (Array.isArray(row.assignments) ? row.assignments : []).some((item) => item?.closedBy || item?.closedByText);
  return date.getTime() && Date.now() - date.getTime() >= PENDING_AFTER_MS && !row.closedBy && !row.closedByText && !assignmentClosed;
}
function closedLead(row) {
  return Boolean(row.closedBy || row.closedByText || row.closedAt || (Array.isArray(row.assignments) && row.assignments.some((item) => item?.closedBy || item?.closedByText)));
}
function filterDateFor(row, mode) { return mode === 'closed' ? (row.closedAt || row.updatedAt || dateFor(row)) : dateFor(row); }
function monthKey(input) {
  const date = new Date(input || 0);
  return date.getTime() ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : '';
}
function value(input) { return input === null || input === undefined || input === '' ? '-' : typeof input === 'object' ? (input.name || input.email || '-') : String(input); }
function pendingFor(row) {
  const elapsed = Math.max(0, Date.now() - new Date(dateFor(row) || 0).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ${minutes % 60} min`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

export default function PendingLeads({ mode = 'open' }) {
  const [currentUser, setCurrentUser] = useState(() => { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; } });
  const [leads, setLeads] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState('all');
  const [dayFilter, setDayFilter] = useState('all');
  const monthOptions = useMemo(() => [...new Set(leads.map((row) => monthKey(filterDateFor(row, mode))).filter(Boolean))].sort().reverse(), [leads, mode]);
  const rows = useMemo(() => leads.filter((row) => {
    if (mode === 'closed' ? !closedLead(row) : !pendingDraft(row)) return false;
    const relevantDate = new Date(filterDateFor(row, mode) || 0);
    if (monthFilter !== 'all' && monthKey(relevantDate) !== monthFilter) return false;
    if (dayFilter !== 'all') {
      const elapsedDays = (Date.now() - relevantDate.getTime()) / (24 * 60 * 60 * 1000);
      if (elapsedDays < 0 || elapsedDays > Number(dayFilter)) return false;
    }
    return true;
  }), [dayFilter, leads, mode, monthFilter]);

  async function load() {
    setLoading(true);
    const [me, result] = await Promise.allSettled([api.get(API_ENDPOINTS.auth.me), fetchCcpLeads()]);
    if (me.status === 'fulfilled') setCurrentUser(me.value.data?.user);
    setLeads(result.status === 'fulfilled' ? (result.value.data?.leads || []) : []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function view(row) {
    setSelected(row);
    setHistory([]);
    const result = await Promise.allSettled([
      api.get(API_ENDPOINTS.leads.history(idFor(row))),
      fetchCcpLeadHistory(idFor(row), { leadCode: row.leadCode, company: row.company })
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
        <table className="w-full min-w-[1150px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{['Sr. No.', mode === 'closed' ? 'Closed Date' : 'Lead Date', mode === 'closed' ? 'Lead Status' : 'Pending For', 'Lead Generated By', 'Company', 'Services', 'Financial Years', 'Action'].map((item) => <th className="px-4 py-4" key={item}>{item}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr className="border-t border-slate-100 hover:bg-emerald-50/30" key={idFor(row)}><td className="px-4 py-4 font-black">{index + 1}</td><td className="px-4 py-4">{value(filterDateFor(row, mode)).slice(0, 10)}</td><td className="px-4 py-4"><span className={`rounded-full px-3 py-1 font-black ${mode === 'closed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{mode === 'closed' ? 'Closed' : pendingFor(row)}</span></td><td className="px-4 py-4">{value(row.importedCreatedBy || row.createdByName || row.createdByEmail)}</td><td className="px-4 py-4 font-black">{value(row.company)}</td><td className="px-4 py-4">{value(row.servicesOffered)}</td><td className="px-4 py-4">{value(row.firstAnnualReturnYearApplicable || row.serviceSelections?.map((item) => item.firstAnnualReturnYearApplicable).filter(Boolean).join(', '))}</td><td className="px-4 py-4"><button onClick={() => view(row)} className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700"><Eye className="h-4 w-4" /></button></td></tr>)}{!rows.length && <tr><td colSpan={9} className="p-12 text-center font-black text-slate-400">{loading ? 'Loading leads...' : mode === 'closed' ? 'No closed leads found.' : 'No leads pending for 15 minutes.'}</td></tr>}</tbody>
        </table>
      </div>
    </div>
    {selected && <PendingLeadModal lead={selected} history={history} onClose={() => setSelected(null)} />}
  </DashboardShell>;
}

function PendingLeadModal({ lead, history, onClose }) {
  const services = Array.isArray(lead.serviceSelections) && lead.serviceSelections.length ? lead.serviceSelections : [lead];
  const assignments = Array.isArray(lead.assignments) && lead.assignments.length ? lead.assignments : [lead];
  return <div className="fixed inset-0 z-[100] overflow-auto bg-slate-950/55 p-4 backdrop-blur-sm sm:p-6">
    <section className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-start justify-between border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-sky-50 p-6">
        <div><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">Complete Lead Data</p><h2 className="mt-1 text-2xl font-black text-slate-950">{lead.company || 'Pending Lead'}</h2><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600 shadow-sm">{lead.leadCode || idFor(lead)}</span><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">Pending {pendingFor(lead)}</span><span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">{lead.status || 'Draft'}</span></div></div>
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm"><X className="h-5 w-5" /></button>
      </header>
      <div className="space-y-6 p-5 sm:p-6">
        <InfoGrid title="Lead Overview" rows={[['Lead Date', dateFor(lead)], ['Generated By', lead.importedCreatedBy || lead.createdByName || lead.createdByEmail], ['Communication Mode', lead.communicationMode], ['Status', lead.status], ['Contact Person', lead.contactPerson], ['Primary Email', lead.emails]]} />
        <DataTable title="Service & Applicant" headers={['#', 'Industry Type', 'EPR Category', 'Applicant Type', 'Sub Applicant Type', 'Services Offered', 'Applicable Services', 'Financial Year']} rows={services.map((row, index) => [index + 1, row.industryType, row.eprCategory, row.applicantType, row.piboCategory, row.servicesOffered, row.applicableService, row.firstAnnualReturnYearApplicable])} />
        <DataTable title="Assignment Information" headers={['#', 'Closed By', 'Manager', 'Manager Email', 'Staff', 'Staff Email']} rows={assignments.map((row, index) => [index + 1, row.closedByText || row.closedBy?.name, row.assignedToText || row.assignedTo?.name, row.assignedToEmail || row.assignedTo?.email, row.assignedStaffText || row.assignedStaff?.name, row.assignedStaffEmail || row.assignedStaff?.email])} />
        <DataTable title="Full Follow-up History" headers={['Event', 'Description', 'Actor', 'Date & Time']} rows={history.map((item) => [item.title || item.type, item.description, item.actor, item.at])} emptyText="No history available." />
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
