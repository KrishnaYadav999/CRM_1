import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, ChevronDown, Download, Edit3, Eye, FileText, Filter, MoreHorizontal, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import DashboardShell from '../components/dashboard/DashboardShell';
import ProfileModal from '../components/dashboard/ProfileModal';
import api from '../services/api';
import { API_ENDPOINTS } from '../services/apiEndpoints';
import { fetchCcpLeads } from '../services/ccpApi';

const ANANT_LOGO_URL = 'https://crm.ananttattva.com/assets/at-logo-CTH78yrR.svg';

const emptyLeadDetails = {
  referredBy: '',
  salutation: '',
  contactPerson: '',
  designation: '',
  mobileNo1: '',
  mobileNo2: '',
  companyName: '',
  addressLine1: '',
  addressLine2: '',
  addressLine3: '',
  state: '',
  city: '',
  pinCode: ''
};

const emptyItem = {
  serviceCategory: '',
  servicesForYear: '',
  eprCategory: '',
  piboCategory: '',
  unit: '',
  basicAmount: ''
};

const emptyQuotation = {
  leadId: '',
  leadCode: '',
  leadDetails: emptyLeadDetails,
  validUntil: '',
  items: [],
  terms: [],
  status: 'draft'
};

const serviceCategoryOptions = [
  'CASE REPRESENTATION',
  'CAT-1-EOL CREDIT',
  'CAT-1-RECYCLING CREDIT',
  'CAT-2-EOL CREDIT',
  'CAT-2-RECYCLING CREDIT',
  'CAT-3-EOL CREDIT',
  'CAT-3-RECYCLING CREDIT',
  'CATEGORY 1',
  'CATEGORY 2',
  'CATEGORY 3',
  'CGWA NOC FRESH',
  'CONSULTANCY FEE',
  'CPCB NOTICE REPLY',
  'CTE & CTO NEW REGISTRATION',
  'CTE-CONSENT TO ESTABLISH',
  'CTO-CONSENT TO OPERATE',
  'CTO-RENEWAL',
  'E-WASTE CREDIT',
  'ENVIRONMENT STATEMENT',
  'EPR CREDIT RE',
  'EPR CREDIT REVERSE',
  'EPR ETP PORTAL HANDLING',
  'EPR LOGIN SURRENDER',
  'GOVT. REPRESENTATION',
  'KAVACH AUDIT',
  'MATERIAL WASTE MANAGEMENT',
  'PLANT AUDIT',
  'PORTAL HEALTH REPORT'
];

const yearOptions = ['2022-23', '2023-24', '2024-25', '2025-26', '2026-27', '2027-28', '2028-29', '2029-30'];
const eprCategoryOptions = ['EPR - Plastic Waste', 'EPR - E-Waste', 'EPR - Battery Waste', 'EPR - Paper Waste', 'EPR - Water Waste', 'EPR - C&D Waste', 'EPR - Tyre Waste', 'EPR - Used Oil Waste', 'EPR - End of Life Vehicles', 'EPR - Non Ferrous'];
const piboCategoryOptions = ['Importer', 'Producer', 'Brand Owner', 'SIMP (legacy)', 'SIMP - Producer', 'SIMP - Importer', 'SIMP - Manufacturer', 'SIMP - Seller', 'PWP', 'Refurbisher', 'Recycler', 'impo'];

function mapLeadToDetails(lead) {
  return {
    referredBy: lead?.referredBy || '',
    salutation: lead?.salutation || '',
    contactPerson: lead?.contactPerson || '',
    designation: lead?.designation || '',
    mobileNo1: lead?.mobileNo1 || '',
    mobileNo2: lead?.mobileNo2 || '',
    companyName: lead?.company || '',
    addressLine1: lead?.addressLine1 || '',
    addressLine2: lead?.addressLine2 || '',
    addressLine3: lead?.addressLine3 || '',
    state: lead?.state || '',
    city: lead?.city || '',
    pinCode: lead?.pinCode || ''
  };
}

function normalizeSearchValue(value) {
  return String(value || '').trim().toLowerCase();
}

function contextMatchesQuotation(row, context) {
  if (!context) return true;
  const details = row.leadDetails || {};
  const contextLeadId = normalizeSearchValue(context.leadId);
  const contextLeadCode = normalizeSearchValue(context.leadCode);
  const contextCompany = normalizeSearchValue(context.clientName);
  const contextYear = normalizeSearchValue(context.annualYear);
  const rowLeadId = normalizeSearchValue(row.leadId);
  const rowLeadCode = normalizeSearchValue(row.leadCode);
  const rowCompany = normalizeSearchValue(details.companyName);
  const leadMatched = Boolean(
    (contextLeadId && rowLeadId && contextLeadId === rowLeadId) ||
    (contextLeadCode && rowLeadCode && contextLeadCode === rowLeadCode) ||
    (contextCompany && rowCompany && contextCompany === rowCompany)
  );
  const itemYears = (row.items || []).map((item) => normalizeSearchValue(item.servicesForYear)).filter(Boolean);
  const yearMatched = !contextYear || !itemYears.length || itemYears.includes(contextYear);
  return leadMatched && yearMatched;
}

function buildQuotationFromContext(context) {
  if (!context) return { ...emptyQuotation, leadDetails: { ...emptyLeadDetails }, items: [], terms: [] };
  return {
    ...emptyQuotation,
    leadId: context.leadId || '',
    leadCode: context.leadCode || '',
    leadDetails: {
      ...emptyLeadDetails,
      contactPerson: context.contactPerson || '',
      designation: context.designation || '',
      mobileNo1: context.mobileNo1 || '',
      mobileNo2: context.mobileNo2 || '',
      companyName: context.clientName || '',
      addressLine1: context.addressLine1 || '',
      addressLine2: context.addressLine2 || '',
      addressLine3: context.addressLine3 || '',
      state: context.state || '',
      city: context.city || '',
      pinCode: context.pinCode || ''
    },
    items: [{
      ...emptyItem,
      servicesForYear: context.annualYear || '',
      eprCategory: context.eprCategory || '',
      piboCategory: context.piboCategory || ''
    }],
    terms: []
  };
}

function normalizeQuotationSnapshot(row) {
  if (!row) return null;
  return {
    ...row,
    _id: row._id || row.quotationId || row.id,
    id: row.id || row.quotationId || row._id,
    quotationNumber: row.quotationNumber || row.uniqueId || '',
    leadId: row.leadId || '',
    leadCode: row.leadCode || '',
    leadDetails: {
      ...emptyLeadDetails,
      ...(row.leadDetails || {}),
      contactPerson: row.leadDetails?.contactPerson || row.contactPerson || '',
      mobileNo1: row.leadDetails?.mobileNo1 || row.mobileNo1 || '',
      companyName: row.leadDetails?.companyName || row.companyName || ''
    },
    validUntil: row.validUntil || '',
    items: Array.isArray(row.items) && row.items.length
      ? row.items
      : [{
          serviceCategory: row.service || '',
          servicesForYear: row.servicesForYear || '',
          eprCategory: row.category || row.eprCategory || '',
          piboCategory: row.piboCategory || '',
          unit: row.unit || '',
          basicAmount: row.basicAmount || ''
        }],
    terms: Array.isArray(row.terms) ? row.terms : [],
    status: row.status || 'draft'
  };
}

function readQuotationStatus(row = {}) {
  const status = String(row.status || row.quotationStatus || 'draft').trim().toLowerCase();
  return ['approved', 'rejected', 'closed'].includes(status) ? 'closed' : 'open';
}

function readAdminApprovalStatus(row = {}) {
  const status = String(row.approvalStatus || row.adminApproval || row.status || 'approved').trim().toLowerCase();
  if (status.includes('reject')) return 'rejected';
  return 'approved';
}

function getLeadMergeKey(lead = {}) {
  return String(lead._id || lead.id || lead.sourceLeadId || lead.leadCode || lead.company || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function mergeLeadLists(...lists) {
  const merged = [];
  const indexByKey = new Map();
  lists.flat().filter(Boolean).forEach((lead) => {
    const key = getLeadMergeKey(lead);
    if (key && indexByKey.has(key)) {
      const index = indexByKey.get(key);
      merged[index] = { ...merged[index], ...lead };
      return;
    }
    if (key) indexByKey.set(key, merged.length);
    merged.push(lead);
  });
  return merged;
}

export default function Quotations() {
  const [currentUser, setCurrentUser] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [leads, setLeads] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [quotation, setQuotation] = useState(emptyQuotation);
  const [editingId, setEditingId] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [query, setQuery] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [quotationStatusFilter, setQuotationStatusFilter] = useState('');
  const [adminApprovalFilter, setAdminApprovalFilter] = useState('');
  const [expandedId, setExpandedId] = useState('');
  const [menuId, setMenuId] = useState('');
  const [previewQuotation, setPreviewQuotation] = useState(null);
  const [detailQuotation, setDetailQuotation] = useState(null);
  const [successModal, setSuccessModal] = useState(null);
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const [itemDrafts, setItemDrafts] = useState({});
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const quotationContext = location.state?.quotationContext || null;

  const selectedLead = useMemo(() => {
    if (!quotation.leadId) return null;
    return leads.find((lead) => String(lead._id || lead.id) === String(quotation.leadId));
  }, [leads, quotation.leadId]);
  const fetchedQuoteDetailsLocked = Boolean(selectedLead || quotationContext);

  const userOptions = useMemo(() => {
    const names = quotations
      .map((row) => row.createdBy?.name || row.createdBy?.email || row.leadDetails?.referredBy || '')
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    return [...new Set(names)].sort();
  }, [quotations]);

  const filteredQuotations = useMemo(() => {
    const term = query.trim().toLowerCase();
    return quotations.filter((row) => {
      if (!contextMatchesQuotation(row, quotationContext)) return false;
      const userName = row.createdBy?.name || row.createdBy?.email || row.leadDetails?.referredBy || '';
      const firstItem = row.items?.[0] || {};
      const haystack = [
        row.quotationNumber,
        row.leadDetails?.companyName,
        row.leadDetails?.contactPerson,
        row.leadDetails?.mobileNo1,
        row.leadDetails?.mobileNo2,
        firstItem.serviceCategory,
        firstItem.eprCategory,
        firstItem.piboCategory,
        userName
      ].join(' ').toLowerCase();
      const matchesQuotationStatus = !quotationStatusFilter || readQuotationStatus(row) === quotationStatusFilter;
      const matchesAdminApproval = !adminApprovalFilter || readAdminApprovalStatus(row) === adminApprovalFilter;
      return (!term || haystack.includes(term)) && (!userFilter || userName === userFilter) && matchesQuotationStatus && matchesAdminApproval;
    });
  }, [adminApprovalFilter, query, quotationContext, quotationStatusFilter, quotations, userFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredQuotations.length / rowsPerPage));
  const visibleQuotations = filteredQuotations.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  useEffect(() => {
    loadPage();
  }, []);

  useEffect(() => {
    const mode = new URLSearchParams(location.search).get('mode');
    if (mode === 'add') startNew(quotationContext);
  }, [location.search, quotationContext]);

  useEffect(() => {
    const editQuotationId = location.state?.editQuotationId;
    const previewQuotationId = location.state?.previewQuotationId;
    const quotationSnapshot = normalizeQuotationSnapshot(location.state?.quotationSnapshot);
    if ((!editQuotationId && !previewQuotationId) || (!quotations.length && !quotationSnapshot)) return;
    if (previewQuotationId) {
      const previewKey = String(previewQuotationId).trim();
      const target = quotations.find((row) => {
        const keys = [row._id, row.id, row.quotationId, row.quotationNumber, row.quotationNo, row.uniqueId]
          .map((value) => String(value || '').trim())
          .filter(Boolean);
        return keys.includes(previewKey);
      }) || quotationSnapshot;
      if (target) {
        setPreviewQuotation(normalizeQuotationSnapshot(target));
        navigate(location.pathname, { replace: true, state: {} });
      }
      return;
    }
    const target = quotations.find((row) => String(row._id || row.id) === String(editQuotationId)) || quotationSnapshot;
    if (target) {
      editQuotation(target);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate, quotations]);

  useEffect(() => {
    setPage(1);
  }, [adminApprovalFilter, query, quotationStatusFilter, rowsPerPage, userFilter]);

  async function loadPage() {
    setLoading(true);
    setError('');
    try {
      const meResponse = await api.get(API_ENDPOINTS.auth.me);
      const me = meResponse.data.user;
      const [crmLeadsResult, ccpLeadsResult, quotationsResponse] = await Promise.all([
        api.get(API_ENDPOINTS.leads.list).catch(() => ({ data: { leads: [] } })),
        fetchCcpLeads(),
        api.get(API_ENDPOINTS.quotations.list)
      ]);
      setCurrentUser(me);
      setLeads(mergeLeadLists(crmLeadsResult.data.leads || [], ccpLeadsResult.data.leads || []));
      setQuotations(quotationsResponse.data.quotations || []);
    } catch (err) {
      setError(err?.response?.data?.error || 'Unable to load quotations.');
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('login_email');
    navigate('/', { replace: true });
  }

  function startNew(context = null) {
    setQuotation(buildQuotationFromContext(context));
    setEditingId('');
    setNotice('');
    setError('');
    setViewMode('form');
  }

  function showQuotationList() {
    setViewMode('list');
    setDetailQuotation(null);
    if (location.search) navigate('/sales/quotations', { replace: true });
  }

  function showQuotationDetail(row) {
    setPreviewQuotation(row);
    setMenuId('');
  }

  function editQuotation(row) {
    setQuotation({
      leadId: row.leadId || '',
      leadCode: row.leadCode || '',
      leadDetails: { ...emptyLeadDetails, ...(row.leadDetails || {}) },
      validUntil: row.validUntil || '',
      items: Array.isArray(row.items) ? row.items.map((item) => ({ ...emptyItem, ...item, basicAmount: item.basicAmount || '' })) : [],
      terms: Array.isArray(row.terms) ? row.terms : [],
      status: row.status || 'draft'
    });
    setEditingId(row._id || row.id);
    setNotice('');
    setError('');
    setDetailQuotation(null);
    setViewMode('form');
  }

  function selectLead(leadId) {
    const lead = leads.find((item) => String(item._id || item.id) === String(leadId));
    setQuotation((current) => ({
      ...current,
      leadId,
      leadCode: lead?.leadCode || '',
      leadDetails: mapLeadToDetails(lead)
    }));
  }

  function setLeadDetail(field, value) {
    setQuotation((current) => ({
      ...current,
      leadDetails: { ...current.leadDetails, [field]: value }
    }));
  }

  function setItem(index, field, value) {
    setQuotation((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item)
    }));
  }

  function addItem() {
    setQuotation((current) => {
      const nextIndex = current.items.length;
      setEditingItemIndex(nextIndex);
      setItemDrafts((drafts) => ({ ...drafts, [nextIndex]: emptyItem }));
      return { ...current, items: [...current.items, emptyItem] };
    });
  }

  function removeItem(index) {
    setQuotation((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));
    setEditingItemIndex(null);
    setItemDrafts({});
  }

  function startEditItem(index) {
    setEditingItemIndex(index);
    setItemDrafts((drafts) => ({ ...drafts, [index]: { ...emptyItem, ...(quotation.items[index] || {}) } }));
  }

  function setItemDraft(index, field, value) {
    setItemDrafts((drafts) => ({
      ...drafts,
      [index]: { ...emptyItem, ...(drafts[index] || {}), [field]: value }
    }));
  }

  function saveItem(index) {
    const draft = { ...emptyItem, ...(itemDrafts[index] || {}) };
    setQuotation((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? draft : item)
    }));
    setEditingItemIndex(null);
  }

  function cancelItemEdit(index) {
    const original = quotation.items[index] || {};
    const isEmpty = Object.values(original).every((value) => String(value || '').trim() === '');
    if (isEmpty) removeItem(index);
    else setEditingItemIndex(null);
  }

  function addTerm() {
    setQuotation((current) => ({ ...current, terms: [...current.terms, ''] }));
  }

  function setTerm(index, value) {
    setQuotation((current) => ({
      ...current,
      terms: current.terms.map((term, termIndex) => termIndex === index ? value : term)
    }));
  }

  function removeTerm(index) {
    setQuotation((current) => ({ ...current, terms: current.terms.filter((_, termIndex) => termIndex !== index) }));
  }

  async function saveQuotation(status = quotation.status) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = { ...quotation, status };
      const response = editingId
        ? await api.put(API_ENDPOINTS.quotations.detail(editingId), payload)
        : await api.post(API_ENDPOINTS.quotations.create, payload);
      setSuccessModal({
        title: editingId ? 'Quotation Updated Successfully!' : 'Quotation Created Successfully!',
        message: `${response.data.quotation?.quotationNumber || 'Quotation'} has been saved and sent to Pending Approval.`
      });
      setQuotation({ ...emptyQuotation, leadDetails: { ...emptyLeadDetails }, items: [], terms: [] });
      setEditingId('');
      setViewMode('list');
      if (location.search) navigate('/sales/quotations', { replace: true });
      await loadPage();
    } catch (err) {
      setError(err?.response?.data?.error || 'Unable to save quotation.');
    } finally {
      setSaving(false);
    }
  }

  if (viewMode === 'list') {
    return (
      <DashboardShell currentUser={currentUser} onOpenProfile={() => setProfileOpen(true)} onLogout={handleLogout}>
        <div className="bg-[#f5f7fb] px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" onClick={() => navigate('/dashboard')} className="btn-lift grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-orange-600 shadow-sm" title="Back">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-3">
                  <h1 className="text-3xl font-black text-slate-950">Quotations</h1>
                  <span className="text-sm font-black text-slate-500">Total: {filteredQuotations.length}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by Company Name..." className="h-11 w-64 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold outline-none placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100" />
              <select value={userFilter} onChange={(event) => setUserFilter(event.target.value)} className="h-11 w-60 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100">
                <option value="">Filter by User</option>
                {userOptions.map((user) => <option key={user} value={user}>{user}</option>)}
              </select>
              <div className="relative">
                <button type="button" onClick={() => setFilterOpen((value) => !value)} className="btn-lift inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">
                  <Filter className="h-4 w-4" /> Quotation filter
                </button>
                {filterOpen && (
                  <QuotationFilterPopover
                    quotationStatusFilter={quotationStatusFilter}
                    adminApprovalFilter={adminApprovalFilter}
                    onQuotationStatusChange={setQuotationStatusFilter}
                    onAdminApprovalChange={setAdminApprovalFilter}
                    onClear={() => {
                      setQuery('');
                      setUserFilter('');
                      setQuotationStatusFilter('');
                      setAdminApprovalFilter('');
                    }}
                  />
                )}
              </div>
              <button type="button" onClick={loadPage} className="btn-lift inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button type="button" onClick={() => startNew(quotationContext)} className="btn-lift inline-flex h-11 items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-black text-white shadow-lg shadow-orange-500/20">
                <Plus className="h-4 w-4" /> New
              </button>
            </div>
          </div>

          {quotationContext && (
            <div className="mt-5 flex flex-col gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-black text-orange-700 sm:flex-row sm:items-center sm:justify-between">
              <span>Showing quotations for {quotationContext.clientName || 'selected client'}{quotationContext.annualYear ? ` (${quotationContext.annualYear})` : ''}.</span>
              <button type="button" onClick={() => navigate('/sales/quotations', { replace: true, state: {} })} className="btn-lift h-9 rounded-lg border border-orange-200 bg-white px-3 text-xs font-black text-orange-700">Show All</button>
            </div>
          )}

          {(error || notice) && (
            <div className={`mt-5 rounded-lg border px-4 py-3 font-bold ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {error || notice}
            </div>
          )}

          <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5">
            <div className="hidden-scrollbar max-h-[610px] overflow-auto">
              <table className="w-full min-w-[1720px] table-fixed text-left text-sm">
                <thead className="sticky top-0 z-20 bg-slate-50 text-xs font-black uppercase tracking-[0.06em] text-slate-600 shadow-sm">
                  <tr>
                    {[
                      ['Quotation No.', 'w-[150px]'],
                      ['User Name', 'w-[160px]'],
                      ['Lead Generated By', 'w-[190px]'],
                      ['Company Name', 'w-[220px]'],
                      ['Contact Person', 'w-[170px]'],
                      ['Mobile No.1', 'w-[140px]'],
                      ['Mobile No.2', 'w-[140px]'],
                      ['Service Category', 'w-[210px]'],
                      ['EPR Category', 'w-[190px]'],
                      ['Unit', 'w-[100px]'],
                      ['PIBO Category', 'w-[180px]'],
                      ['Basic Amount (INR)', 'w-[170px]'],
                      ['Admin Approval', 'w-[160px]'],
                      ['Quotation Status', 'w-[170px]'],
                      ['Items', 'w-[110px]'],
                      ['Actions', 'w-[110px]']
                    ].map(([header, width]) => (
                      <th key={header} className={`border-r border-slate-100 px-4 py-5 last:border-r-0 ${width}`}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loading ? (
                    <tr><td colSpan={16} className="px-5 py-14 text-center font-black text-slate-400">Loading quotations...</td></tr>
                  ) : visibleQuotations.length === 0 ? (
                    <tr><td colSpan={16} className="px-5 py-14 text-center font-black text-slate-400">No quotations found.</td></tr>
                  ) : visibleQuotations.map((row) => (
                    <React.Fragment key={row._id || row.id}>
                      <QuotationTableRow
                        row={row}
                        expanded={expandedId === (row._id || row.id)}
                        menuOpen={menuId === (row._id || row.id)}
                        onToggleItems={() => setExpandedId((current) => current === (row._id || row.id) ? '' : (row._id || row.id))}
                        onToggleMenu={() => setMenuId((current) => current === (row._id || row.id) ? '' : (row._id || row.id))}
                        onEdit={() => editQuotation(row)}
                        onPreview={() => showQuotationDetail(row)}
                      />
                      {expandedId === (row._id || row.id) && (
                        <tr>
                          <td colSpan={16} className="bg-slate-50 px-20 py-5">
                            <QuotationItemsPanel items={row.items || []} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <QuotationPager
              page={page}
              rowsPerPage={rowsPerPage}
              setPage={setPage}
              setRowsPerPage={setRowsPerPage}
              total={filteredQuotations.length}
              totalPages={totalPages}
              showing={visibleQuotations.length}
            />
          </section>
        </div>
        {detailQuotation && (
          <QuotationDetailModal
            quotation={detailQuotation}
            revisionCount={Math.max(0, filteredQuotations.filter((row) => normalizeSearchValue(row.leadDetails?.companyName) === normalizeSearchValue(detailQuotation.leadDetails?.companyName)).length - 1)}
            onClose={() => setDetailQuotation(null)}
            onRevise={() => editQuotation(detailQuotation)}
          />
        )}
        {previewQuotation && <QuotationPreviewDrawer quotation={previewQuotation} onClose={() => setPreviewQuotation(null)} />}
        {successModal && (
          <SuccessDialog
            title={successModal.title}
            message={successModal.message}
            onClose={() => setSuccessModal(null)}
          />
        )}
        {profileOpen && <ProfileModal user={currentUser} saving={false} onClose={() => setProfileOpen(false)} onLogout={handleLogout} onSave={() => {}} onUpdatePassword={() => {}} />}
      </DashboardShell>
    );
  }

  return (
    <DashboardShell currentUser={currentUser} onOpenProfile={() => setProfileOpen(true)} onLogout={handleLogout}>
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
          <button type="button" onClick={showQuotationList} className="btn-lift inline-flex h-11 w-11 items-center justify-center rounded-lg border border-emerald-100 bg-white text-orange-600 shadow-sm">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">Quotation Desk</p>
            <h1 className="mt-1 text-3xl font-black text-slate-950">{editingId ? 'Edit Quotation' : 'Create Quotation'}</h1>
          </div>
          </div>
          <button type="button" onClick={showQuotationList} className="btn-lift inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 font-black text-slate-700 shadow-sm">
            <Eye className="h-4 w-4" /> View Quotations
          </button>
        </div>

        {(error || notice) && (
          <div className={`mt-5 rounded-lg border px-4 py-3 font-bold ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {error || notice}
          </div>
        )}

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-emerald-700" />
            <h2 className="text-lg font-black text-slate-950">Auto-Fetched Quote Details</h2>
          </div>
          <div className="mt-5">
            <Field label="Select Lead">
              <select value={quotation.leadId} onChange={(event) => selectLead(event.target.value)} disabled={fetchedQuoteDetailsLocked} className="form-input max-w-xl disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500">
                <option value="">Select lead to auto-fetch details</option>
                {leads.map((lead) => (
                  <option key={lead._id || lead.id} value={lead._id || lead.id}>{lead.leadCode || 'Lead'} - {lead.company || 'Untitled company'}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['referredBy', 'Referred By'],
              ['salutation', 'Salutation'],
              ['contactPerson', 'Contact Person'],
              ['designation', 'Designation'],
              ['mobileNo1', 'Mobile No. 1'],
              ['mobileNo2', 'Mobile No. 2'],
              ['companyName', 'Company Name'],
              ['addressLine1', 'Address Line 1'],
              ['addressLine2', 'Address Line 2'],
              ['addressLine3', 'Address Line 3'],
              ['state', 'State'],
              ['city', 'City'],
              ['pinCode', 'Pincode']
            ].map(([field, label]) => (
              <Field key={field} label={label}>
                <input value={quotation.leadDetails[field] || ''} onChange={(event) => setLeadDetail(field, event.target.value)} className="form-input bg-slate-50 font-black uppercase text-slate-500 read-only:cursor-not-allowed read-only:bg-slate-100" placeholder={label} readOnly={fetchedQuoteDetailsLocked} />
              </Field>
            ))}
          </div>
          {selectedLead && <p className="mt-4 text-sm font-bold text-emerald-700">Lead details auto-fetched from {selectedLead.leadCode || selectedLead.company}.</p>}
          {!selectedLead && quotationContext && <p className="mt-4 text-sm font-bold text-emerald-700">Client details auto-fetched from {quotationContext.clientName || 'selected client'}.</p>}
        </section>

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-950">Manual Quote Details</h2>
              <p className="text-sm font-bold text-slate-500">Only this section is editable while fetched lead data stays fixed.</p>
            </div>
          </div>
          <div className="mt-5 max-w-sm">
            <Field label="Quotation Valid Until" required>
              <input type="date" value={quotation.validUntil} onChange={(event) => setQuotation((current) => ({ ...current, validUntil: event.target.value }))} className="form-input" />
            </Field>
          </div>

          <div className="mt-8 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="font-black text-slate-900">Quotation Items</h3>
              <button type="button" onClick={addItem} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 font-black text-white">
                <Plus className="h-4 w-4" /> Add Row
              </button>
            </div>
            <div className="overflow-auto p-4">
              {quotation.items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center font-black text-slate-400">No quotation items added.</div>
              ) : (
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
                    <tr>
                      {['Sr.No', 'Service Category', 'Services for the Year', 'EPR Category', 'PIBO Category', 'Unit', 'Basic Amount (INR)', 'Actions'].map((header) => (
                        <th key={header} className="px-3 py-3">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {quotation.items.map((item, index) => (
                      <tr key={index} className="align-middle">
                        <td className="px-3 py-4 text-center font-black">{index + 1}</td>
                        {editingItemIndex === index ? (
                          <>
                            <td className="px-3 py-4"><QuoteSelect value={itemDrafts[index]?.serviceCategory || ''} options={serviceCategoryOptions} placeholder="CONSULTANCY FEE" onChange={(value) => setItemDraft(index, 'serviceCategory', value)} /></td>
                            <td className="px-3 py-4"><QuoteSelect value={itemDrafts[index]?.servicesForYear || ''} options={yearOptions} placeholder="2025-26" onChange={(value) => setItemDraft(index, 'servicesForYear', value)} /></td>
                            <td className="px-3 py-4"><QuoteSelect value={itemDrafts[index]?.eprCategory || ''} options={eprCategoryOptions} placeholder="EPR - PLASTIC WASTE" onChange={(value) => setItemDraft(index, 'eprCategory', value)} /></td>
                            <td className="px-3 py-4"><QuoteSelect value={itemDrafts[index]?.piboCategory || ''} options={piboCategoryOptions} placeholder="IMPORTER" onChange={(value) => setItemDraft(index, 'piboCategory', value)} /></td>
                            <td className="px-3 py-4"><input value={itemDrafts[index]?.unit || ''} onChange={(event) => setItemDraft(index, 'unit', event.target.value)} className="h-10 w-36 rounded-lg border border-slate-300 bg-white px-3 font-black outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="1" /></td>
                            <td className="px-3 py-4">
                              <div className="flex h-10 min-w-48 overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
                                <span className="grid w-10 place-items-center border-r border-slate-200 font-black text-slate-800">₹</span>
                                <input type="number" value={itemDrafts[index]?.basicAmount || ''} onChange={(event) => setItemDraft(index, 'basicAmount', event.target.value)} className="min-w-0 flex-1 px-3 font-black outline-none" placeholder="20000" />
                              </div>
                            </td>
                            <td className="px-3 py-4">
                              <div className="flex items-center gap-2">
                                <button type="button" onClick={() => saveItem(index)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-black text-white"><Save className="h-4 w-4" /> Save</button>
                                <button type="button" onClick={() => cancelItemEdit(index)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700"><X className="h-4 w-4" /> Cancel</button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-4 font-black uppercase">{item.serviceCategory || '-'}</td>
                            <td className="px-3 py-4 font-black">{item.servicesForYear || '-'}</td>
                            <td className="px-3 py-4 font-black uppercase">{item.eprCategory || '-'}</td>
                            <td className="px-3 py-4 font-black uppercase">{item.piboCategory || '-'}</td>
                            <td className="px-3 py-4 font-black uppercase">{item.unit || '-'}</td>
                            <td className="px-3 py-4 font-black text-orange-600">{formatInr(item.basicAmount)}</td>
                            <td className="px-3 py-4">
                              <div className="flex items-center gap-3">
                                <button type="button" onClick={() => startEditItem(index)} className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-sm font-black text-blue-600 hover:bg-blue-50"><Edit3 className="h-4 w-4" /> Edit</button>
                                <button type="button" onClick={() => removeItem(index)} className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-sm font-black text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Terms & Conditions</h2>
          <div className="mt-4 space-y-3">
            {quotation.terms.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center font-black text-slate-400">No terms added.</div>
            ) : quotation.terms.map((term, index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="w-8 text-right font-black text-slate-900">{index + 1}.</span>
                <input value={term} onChange={(event) => setTerm(index, event.target.value)} className="form-input flex-1 font-black" placeholder="Enter term or condition" />
                <button type="button" onClick={() => removeTerm(index)} className="inline-flex h-10 items-center gap-2 rounded-lg px-3 font-black text-red-500 hover:bg-red-50">
                  <X className="h-4 w-4" /> Remove
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addTerm} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 font-black text-slate-700 hover:bg-slate-50">
            <Plus className="h-4 w-4" /> Add Term
          </button>
        </section>

        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" disabled={saving} onClick={() => saveQuotation('draft')} className="btn-lift inline-flex min-h-11 items-center gap-2 rounded-lg bg-orange-500 px-6 font-black text-white shadow-lg shadow-orange-500/20 disabled:opacity-60">
            <Save className="h-4 w-4" /> {editingId ? 'Update Quotation' : 'Save Quotation'}
          </button>
          <button type="button" onClick={showQuotationList} className="btn-lift min-h-11 rounded-lg border border-slate-200 bg-white px-5 font-black text-slate-600">Cancel</button>
        </div>
      </div>
      {successModal && (
        <SuccessDialog
          title={successModal.title}
          message={successModal.message}
          onClose={() => setSuccessModal(null)}
        />
      )}
      {profileOpen && <ProfileModal user={currentUser} saving={false} onClose={() => setProfileOpen(false)} onLogout={handleLogout} onSave={() => {}} onUpdatePassword={() => {}} />}
    </DashboardShell>
  );
}

function SuccessDialog({ title, message, onClose }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/45 px-4 backdrop-blur-sm animate-[fadeIn_.18s_ease-out]">
      <div className="w-full max-w-md rounded-[26px] bg-white p-7 text-center shadow-2xl shadow-slate-950/25 animate-[app-loader-card-in_.32s_cubic-bezier(.22,1,.36,1)]">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <Check className="h-8 w-8" />
        </div>
        <h2 className="mt-5 text-xl font-black text-slate-950">{title}</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-500">{message}</p>
        <button type="button" onClick={onClose} className="btn-lift mt-6 h-12 w-full rounded-full bg-emerald-300 font-black text-slate-900 shadow-lg shadow-emerald-300/30">
          Dismiss
        </button>
      </div>
    </div>
  );
}

function QuotationTableRow({ row, expanded, menuOpen, onToggleItems, onToggleMenu, onEdit, onPreview }) {
  const item = row.items?.[0] || {};
  const itemCount = row.items?.length || 0;
  const userName = row.createdBy?.name || row.createdBy?.email || row.leadDetails?.referredBy || '-';
  const leadBy = row.leadDetails?.referredBy || userName;

  return (
    <tr className="relative bg-white transition hover:bg-slate-50">
      <td className="px-4 py-5 font-black text-blue-600">{row.quotationNumber || '-'}</td>
      <td className="px-4 py-5 font-black uppercase text-slate-600">{userName}</td>
      <td className="px-4 py-5 font-black uppercase text-slate-600">{leadBy || '-'}</td>
      <td className="px-4 py-5 font-black uppercase text-slate-700">{row.leadDetails?.companyName || '-'}</td>
      <td className="px-4 py-5 font-black uppercase text-slate-600">{row.leadDetails?.contactPerson || '-'}</td>
      <td className="px-4 py-5 font-black text-slate-600">{row.leadDetails?.mobileNo1 || '-'}</td>
      <td className="px-4 py-5 font-black text-slate-600">{row.leadDetails?.mobileNo2 || '-'}</td>
      <td className="px-4 py-5 font-black uppercase text-slate-600">{item.serviceCategory || '-'}</td>
      <td className="px-4 py-5 font-black uppercase text-slate-600">{item.eprCategory || '-'}</td>
      <td className="px-4 py-5 font-black uppercase text-slate-600">{item.unit || '-'}</td>
      <td className="px-4 py-5 font-black uppercase text-slate-600">{item.piboCategory || '-'}</td>
      <td className="px-4 py-5 font-black text-blue-600">{formatInr(item.basicAmount)}</td>
      <td className="px-4 py-5">
        <span className={`rounded-full border px-4 py-2 text-xs font-black ${readAdminApprovalStatus(row) === 'rejected' ? 'border-red-200 bg-red-50 text-red-600' : 'border-lime-300 bg-lime-50 text-lime-700'}`}>
          {readAdminApprovalStatus(row) === 'rejected' ? 'Rejected' : 'Approved'}
        </span>
      </td>
      <td className="px-4 py-5">
        <span className={`rounded-full border px-4 py-2 text-xs font-black ${readQuotationStatus(row) === 'closed' ? 'border-red-200 bg-red-50 text-red-600' : 'border-blue-300 bg-blue-50 text-blue-600'}`}>
          {readQuotationStatus(row) === 'closed' ? 'Closed' : 'Open'}
        </span>
      </td>
      <td className="px-4 py-5">
        <button type="button" onClick={onToggleItems} className="inline-flex items-center gap-2 text-sm font-black text-blue-600">
          <ChevronDown className={`h-4 w-4 transition ${expanded ? 'rotate-180' : '-rotate-90'}`} />
          <span>{itemCount}<br />{itemCount === 1 ? 'item' : 'items'}</span>
        </button>
      </td>
      <td className="px-4 py-5">
        <div className="relative">
          <button type="button" onClick={onToggleMenu} className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100" title="Actions">
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-10 z-30 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white py-2 shadow-xl">
              <button type="button" onClick={onPreview} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-black text-slate-700 hover:bg-slate-50"><Eye className="h-4 w-4" /> Preview</button>
              <button type="button" onClick={onEdit} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-black text-slate-700 hover:bg-slate-50"><Edit3 className="h-4 w-4" /> Revise</button>
              <button type="button" onClick={onPreview} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-black text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" /> Download</button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function QuotationItemsPanel({ items }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="bg-slate-50 text-xs font-black uppercase text-slate-600">
          <tr>
            {['Service Category', 'Services for the Year', 'EPR Category', 'PIBO Category', 'Unit', 'Amount (INR)'].map((header) => (
              <th key={header} className="border-r border-slate-100 px-4 py-4 last:border-r-0">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-8 text-center font-black text-slate-400">No items added.</td></tr>
          ) : items.map((item, index) => (
            <tr key={index} className="font-black uppercase text-slate-600">
              <td className="px-4 py-4">{item.serviceCategory || '-'}</td>
              <td className="px-4 py-4">{item.servicesForYear || '-'}</td>
              <td className="px-4 py-4">{item.eprCategory || '-'}</td>
              <td className="px-4 py-4">{item.piboCategory || '-'}</td>
              <td className="px-4 py-4">{item.unit || '-'}</td>
              <td className="px-4 py-4">{formatInr(item.basicAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuotationPager({ page, rowsPerPage, setPage, setRowsPerPage, total, totalPages, showing }) {
  const start = total ? (page - 1) * rowsPerPage + 1 : 0;
  const end = total ? start + showing - 1 : 0;
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => index + 1);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
      <span className="font-black text-slate-900">{start}-{end} of {total} quotations</span>
      <button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="px-2 font-black text-slate-400 disabled:opacity-40">‹</button>
      <div className="flex items-center gap-2">
        {pages.map((item) => (
          <button key={item} type="button" onClick={() => setPage(item)} className={`grid h-8 w-8 place-items-center rounded-lg text-sm font-black ${page === item ? 'border border-blue-600 text-blue-600' : 'text-slate-900 hover:bg-slate-100'}`}>{item}</button>
        ))}
        {totalPages > 6 && <span className="font-black text-slate-400">...</span>}
        {totalPages > 5 && <button type="button" onClick={() => setPage(totalPages)} className="grid h-8 w-8 place-items-center rounded-lg text-sm font-black text-slate-900 hover:bg-slate-100">{totalPages}</button>}
      </div>
      <button type="button" disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="px-2 font-black text-slate-400 disabled:opacity-40">›</button>
      <select value={rowsPerPage} onChange={(event) => setRowsPerPage(Number(event.target.value))} className="h-10 rounded-lg border border-slate-200 bg-white px-3 font-black outline-none">
        {[10, 25, 50, 100].map((count) => <option key={count} value={count}>{count} / page</option>)}
      </select>
    </div>
  );
}

function QuotationFilterPopover({ quotationStatusFilter, adminApprovalFilter, onQuotationStatusChange, onAdminApprovalChange, onClear }) {
  return (
    <div className="absolute right-0 top-14 z-40 w-[342px] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-2xl shadow-slate-900/15 animate-[app-loader-card-in_.2s_cubic-bezier(.22,1,.36,1)]">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
        <h3 className="text-base font-black">Filters</h3>
        <button type="button" onClick={onClear} className="rounded-lg px-2 py-1 text-xs font-black text-slate-500 hover:bg-slate-100">Clear</button>
      </div>

      <div className="border-b border-slate-100 px-4 py-4">
        <p className="mb-3 font-black text-slate-800">Quotation status</p>
        <div className="space-y-3">
          <FilterRadio checked={quotationStatusFilter === 'open'} label="Open" tone="blue" onClick={() => onQuotationStatusChange(quotationStatusFilter === 'open' ? '' : 'open')} />
          <FilterRadio checked={quotationStatusFilter === 'closed'} label="Closed" tone="red" onClick={() => onQuotationStatusChange(quotationStatusFilter === 'closed' ? '' : 'closed')} />
        </div>
      </div>

      <div className="px-4 py-4">
        <p className="mb-3 font-black text-slate-800">Admin approval</p>
        <div className="space-y-3">
          <FilterRadio checked={!adminApprovalFilter} label="All (approved and rejected)" tone="slate" onClick={() => onAdminApprovalChange('')} />
          <FilterRadio checked={adminApprovalFilter === 'approved'} label="Approved" tone="green" onClick={() => onAdminApprovalChange(adminApprovalFilter === 'approved' ? '' : 'approved')} />
          <FilterRadio checked={adminApprovalFilter === 'rejected'} label="Rejected" tone="red" onClick={() => onAdminApprovalChange(adminApprovalFilter === 'rejected' ? '' : 'rejected')} />
        </div>
      </div>
    </div>
  );
}

function FilterRadio({ checked, label, tone, onClick }) {
  const pillClass = tone === 'blue'
    ? 'border-sky-300 bg-sky-50 text-sky-600'
    : tone === 'green'
      ? 'border-lime-300 bg-lime-50 text-lime-600'
      : tone === 'red'
        ? 'border-red-200 bg-red-50 text-red-500'
        : 'border-transparent bg-transparent text-slate-600';

  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 text-left">
      <span className={`grid h-5 w-5 place-items-center rounded-full border ${checked ? 'border-blue-600' : 'border-slate-300'}`}>
        {checked && <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />}
      </span>
      <span className={`rounded-md border px-3 py-1 text-sm font-black ${pillClass}`}>{label}</span>
    </button>
  );
}

function QuotationDetailModal({ quotation, revisionCount = 0, onClose, onRevise }) {
  const details = quotation.leadDetails || {};
  const items = Array.isArray(quotation.items) ? quotation.items : [];
  const meaningfulItems = items.filter((item) => [
    item.serviceCategory,
    item.servicesForYear,
    item.eprCategory,
    item.piboCategory,
    item.unit,
    item.basicAmount
  ].some((value) => String(value || '').trim() && String(value || '').trim() !== '-'));
  const latestItem = meaningfulItems[meaningfulItems.length - 1] || items[items.length - 1] || {};
  const userName = quotation.createdBy?.name || quotation.createdBy?.email || details.referredBy || '-';
  const totalAmount = Number(latestItem.basicAmount) || items.reduce((sum, item) => sum + (Number(item.basicAmount) || 0), 0);
  const displayRevisionCount = Math.max(revisionCount, meaningfulItems.length || items.length);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/45 px-4 py-5 backdrop-blur-sm animate-[fadeIn_.18s_ease-out]" role="presentation" onClick={onClose}>
      <div className="w-full max-w-5xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/25 animate-[app-loader-card-in_.28s_cubic-bezier(.22,1,.36,1)]" role="dialog" aria-modal="true" aria-label="Quotation Details" onClick={(event) => event.stopPropagation()}>
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-gradient-to-r from-teal-50 via-white to-orange-50 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#30737B]">Quotation Details</p>
            <h2 className="mt-1 truncate text-xl font-black text-slate-950">{details.companyName || 'Quotation'}</h2>
            <p className="mt-1 text-sm font-black text-slate-500">{quotation.quotationNumber || quotation.uniqueId || '-'}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onRevise} className="btn-lift inline-flex min-h-10 items-center gap-2 rounded-lg border border-orange-300 bg-white px-4 text-sm font-black text-orange-600">
              <Edit3 className="h-4 w-4" /> Revise
            </button>
            <button type="button" onClick={onClose} className="btn-lift grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600" aria-label="Close quotation details">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="max-h-[calc(100vh-150px)] overflow-auto p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <QuoteModalStat label="Company Name" value={details.companyName || '-'} />
            <QuoteModalStat label="User Name" value={userName} />
            <QuoteModalStat label="Basic Amount (INR)" value={formatInr(totalAmount)} tone="amount" />
            <QuoteModalStat label="PIBO Category" value={latestItem.piboCategory || '-'} />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <QuoteModalStat label="Number of Revision" value={displayRevisionCount} tone="revision" />
            <QuoteModalStat label="Service Category" value={latestItem.serviceCategory || '-'} />
            <QuoteModalStat label="EPR Category" value={latestItem.eprCategory || '-'} />
          </div>

          <DetailSection title="Quotation Items">
            <div className="overflow-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-black text-slate-600">
                  <tr>
                    {['Sr.No', 'Service Category', 'Services for the Year', 'EPR Category', 'PIBO Category', 'Unit', 'Basic Amount (INR)'].map((header) => (
                      <th key={header} className="border-b border-r border-slate-200 px-4 py-4 last:border-r-0">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.length ? items.map((item, index) => (
                    <tr key={index} className="font-black uppercase text-slate-700">
                      <td className="border-b border-r border-slate-100 px-4 py-4 text-center">{index + 1}</td>
                      <td className="border-b border-r border-slate-100 px-4 py-4">{item.serviceCategory || '-'}</td>
                      <td className="border-b border-r border-slate-100 px-4 py-4">{item.servicesForYear || '-'}</td>
                      <td className="border-b border-r border-slate-100 px-4 py-4">{item.eprCategory || '-'}</td>
                      <td className="border-b border-r border-slate-100 px-4 py-4">{item.piboCategory || '-'}</td>
                      <td className="border-b border-r border-slate-100 px-4 py-4">{item.unit || '-'}</td>
                      <td className="border-b border-slate-100 px-4 py-4 text-right text-orange-600">{formatInr(item.basicAmount)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={7} className="px-4 py-10 text-center font-black text-slate-400">No quotation items added.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </DetailSection>
        </div>
      </div>
    </div>
  );
}

function QuoteModalStat({ label, value, tone = 'default' }) {
  const toneClass = tone === 'amount' ? 'text-orange-600' : tone === 'revision' ? 'text-blue-600' : 'text-slate-950';
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <span className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{label}</span>
      <strong className={`mt-2 block break-words text-base font-black uppercase ${toneClass}`}>{value || '-'}</strong>
    </div>
  );
}

function QuotationDetailPage({ quotation, onBack, onRevise }) {
  const details = quotation.leadDetails || {};
  const items = Array.isArray(quotation.items) ? quotation.items : [];
  const terms = Array.isArray(quotation.terms) ? quotation.terms : [];
  const firstItem = items[0] || {};
  const createdDate = formatDisplayDate(quotation.createdAt);
  const infoRows = [
    ['Salutation', details.salutation || '-'],
    ['Contact Person', details.contactPerson || '-'],
    ['Designation', details.designation || '-'],
    ['Company Name', details.companyName || '-'],
    ['Address Line 1', details.addressLine1 || '-'],
    ['Address Line 2', details.addressLine2 || '-'],
    ['Address Line 3', details.addressLine3 || '-'],
    ['City', details.city || '-'],
    ['State', details.state || '-'],
    ['Pincode', details.pinCode || '-'],
    ['Referred By', details.referredBy || quotation.createdBy?.name || quotation.createdBy || '-'],
    ['Quotation Number', quotation.quotationNumber || quotation.uniqueId || '-'],
    ['Service Category', firstItem.serviceCategory || '-'],
    ['EPR Category', firstItem.eprCategory || '-'],
    ['PIBO Category', firstItem.piboCategory || '-'],
    ['Quantity/Unit', firstItem.unit || '-'],
    ['Basic Amount (INR)', formatInr(firstItem.basicAmount)],
    ['Quotation Valid Until', quotation.validUntil || '-'],
    ['Quotation Date', createdDate]
  ];

  return (
    <div className="min-h-screen bg-white px-3 py-5 sm:px-5 lg:px-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="btn-lift grid h-9 w-9 place-items-center rounded-lg border border-orange-200 bg-white text-orange-600 shadow-sm" title="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-xl font-black text-slate-950">Quote Details</h1>
        </div>
        <button type="button" onClick={onRevise} className="btn-lift inline-flex min-h-10 items-center gap-2 rounded-lg border border-orange-300 bg-white px-4 text-sm font-black text-orange-600">
          <Edit3 className="h-4 w-4" />
          Revise
        </button>
      </div>

      <DetailSection title="Quotation Information">
        <div className="grid overflow-hidden rounded-lg border border-slate-200 md:grid-cols-2">
          {infoRows.map(([label, value]) => (
            <React.Fragment key={`${label}-${value}`}>
              <div className="border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black text-slate-600">{label}</div>
              <div className="border-b border-slate-200 px-4 py-3 text-xs font-black uppercase text-slate-950">{value}</div>
            </React.Fragment>
          ))}
        </div>
      </DetailSection>

      <DetailSection title="Quotation Items">
        <div className="overflow-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black text-slate-600">
              <tr>
                {['Sr.No', 'Service Category', 'Services for the Year', 'EPR Category', 'PIBO Category', 'Unit', 'Basic Amount (INR)'].map((header) => (
                  <th key={header} className="border-b border-r border-slate-200 px-4 py-4 last:border-r-0">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length ? items.map((item, index) => (
                <tr key={index} className="font-black uppercase text-slate-700">
                  <td className="border-b border-r border-slate-100 px-4 py-4 text-center">{index + 1}</td>
                  <td className="border-b border-r border-slate-100 px-4 py-4">{item.serviceCategory || '-'}</td>
                  <td className="border-b border-r border-slate-100 px-4 py-4">{item.servicesForYear || '-'}</td>
                  <td className="border-b border-r border-slate-100 px-4 py-4">{item.eprCategory || '-'}</td>
                  <td className="border-b border-r border-slate-100 px-4 py-4">{item.piboCategory || '-'}</td>
                  <td className="border-b border-r border-slate-100 px-4 py-4">{item.unit || '-'}</td>
                  <td className="border-b border-slate-100 px-4 py-4 text-right text-orange-600">{formatInr(item.basicAmount)}</td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="px-4 py-10 text-center font-black text-slate-400">No quotation items added.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </DetailSection>

      <DetailSection title="Terms and Conditions">
        <div className="space-y-2 rounded-lg border border-slate-200 p-4 text-xs font-bold leading-6 text-slate-950">
          {terms.length ? terms.map((term, index) => <p key={index}>{index + 1}. {term}</p>) : <p>No terms added.</p>}
        </div>
      </DetailSection>

      <DetailSection title="Quote History">
        <div className="space-y-4 rounded-lg border border-slate-200 p-4">
          <HistoryRow tone="emerald" title="Quote created / updated" by={quotation.createdBy?.name || quotation.createdBy?.email || details.referredBy || '-'} date={createdDate} status={quotation.status || 'draft'} />
          <HistoryRow tone="blue" title="Quote sent to pending approval" by={quotation.createdBy?.name || quotation.createdBy?.email || details.referredBy || '-'} date={createdDate} status="PENDING" />
        </div>
      </DetailSection>
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <section className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-sm font-black text-slate-950">{title}</h2>
      {children}
    </section>
  );
}

function HistoryRow({ tone, title, by, date, status }) {
  const classes = tone === 'emerald'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-blue-200 bg-blue-50 text-blue-700';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${classes}`}>{String(status || '').toUpperCase()}</span>
          <p className="mt-3 text-sm font-black text-slate-950">{title}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">By: {by || '-'}</p>
        </div>
        <p className="text-xs font-black text-slate-500">{date || '-'}</p>
      </div>
    </div>
  );
}

function QuotationPreviewDrawer({ quotation, onClose }) {
  const details = quotation.leadDetails || {};
  const items = quotation.items || [];
  const date = quotation.createdAt ? new Date(quotation.createdAt).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');

  function handleDownloadPdf() {
    const printWindow = window.open('', '_blank', 'width=980,height=900');
    if (!printWindow) return;

    printWindow.document.open();
    printWindow.document.write(buildQuotationPrintHtml(quotation));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
    }, 450);
  }

  return (
    <div className="fixed inset-0 z-[90] overflow-hidden">
      <button type="button" aria-label="Close quotation preview" onClick={onClose} className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm animate-[fadeIn_.18s_ease-out]" />
      <aside className="relative ml-auto flex h-full w-full max-w-5xl animate-[drawerIn_.28s_cubic-bezier(.22,1,.36,1)] flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl shadow-slate-950/25">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-4 shadow-sm backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={onClose} className="btn-lift grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:text-orange-600" title="Close">
              <X className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-500">Document Preview</p>
              <h2 className="truncate text-xl font-black text-slate-950">{quotation.quotationNumber || 'Quotation Preview'}</h2>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-lift min-h-10 rounded-lg border border-slate-200 bg-white px-5 font-black text-slate-700">Close</button>
            <button type="button" onClick={handleDownloadPdf} className="btn-lift inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-5 font-black text-white"><Download className="h-4 w-4" />Download PDF</button>
          </div>
        </div>
        <div className="hidden-scrollbar flex-1 overflow-auto bg-[radial-gradient(circle_at_top_left,#fff7ed_0,#f8fafc_36%,#eef2f7_100%)] p-5 sm:p-8">
          <section className="mx-auto min-h-[900px] max-w-[760px] rounded-sm border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/15">
            <div className="flex items-center justify-between pb-7">
              <img src={ANANT_LOGO_URL} alt="Anant Tattva" className="h-14 w-32 object-contain object-left" />
              <div className="text-xl font-black uppercase tracking-[0.2em] text-orange-500">Quotation</div>
            </div>
            <div className="border-t border-slate-950 pt-5">
              <div className="grid gap-8 md:grid-cols-2">
                <div className="text-[11px] font-bold leading-5 text-slate-950">
                  <p className="font-black">From:</p>
                  <p>Krunal Goda</p>
                  <p>AnantTattva Private Limited</p>
                  <p>Office No.12 &14, Midas Building, Sahar Plaza JB Nagar, Andheri East, Mumbai - 400059</p>
                </div>
                <div className="text-right text-[11px] font-normal leading-5 text-slate-950">
                  <p>Quotation Date: {date}</p>
                  <p>Quotation No.: {quotation.quotationNumber || '-'}</p>
                  <p>Quotation Valid Until: {quotation.validUntil || '-'}</p>
                  <p>Created: {date}</p>
                  <p>Prepared By: {quotation.createdBy?.name || '-'}</p>
                </div>
              </div>
            </div>
            <div className="mt-5 border-t border-slate-200 pt-4 text-[11px] font-bold leading-5 text-slate-950">
              <p className="font-black">To:</p>
              <p>{details.salutation || ''} {details.contactPerson || '-'} {details.designation ? `- ${details.designation}` : ''}</p>
              <p>Mobile No.1: {details.mobileNo1 || '-'}</p>
              <p>{details.companyName || '-'}</p>
              <p>{[details.addressLine1, details.addressLine2, details.addressLine3].filter(Boolean).join(', ') || '-'}</p>
              <p>State: {details.state || '-'}</p>
              <p>City: {details.city || '-'}</p>
              <p>Pincode: {details.pinCode || '-'}</p>
            </div>
            <div className="mt-5 overflow-hidden border border-slate-950">
              <table className="w-full text-[11px]">
                <thead className="bg-orange-500 text-left text-[10px] font-black uppercase text-white">
                  <tr>
                    {['Service Category', 'Services for the Year', 'EPR Category', 'PIBO Category', 'Unit', 'Basic Amount (INR)'].map((header) => <th key={header} className="border-r border-slate-950 px-2 py-2 last:border-r-0">{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={index} className="font-black uppercase">
                      <td className="border-r border-t border-slate-950 px-2 py-2">{item.serviceCategory || '-'}</td>
                      <td className="border-r border-t border-slate-950 px-2 py-2">{item.servicesForYear || '-'}</td>
                      <td className="border-r border-t border-slate-950 px-2 py-2">{item.eprCategory || '-'}</td>
                      <td className="border-r border-t border-slate-950 px-2 py-2">{item.piboCategory || '-'}</td>
                      <td className="border-r border-t border-slate-950 px-2 py-2 text-center">{item.unit || '-'}</td>
                      <td className="border-t border-slate-950 px-2 py-2 text-right">{formatInr(item.basicAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 text-[10px] font-bold leading-5 text-slate-950">
              <p className="font-black">Terms & Conditions:</p>
              {(quotation.terms || []).length ? quotation.terms.map((term, index) => <p key={index}>{index + 1}. {term}</p>) : <p>No terms added.</p>}
            </div>
            <div className="mt-5 text-[10px] font-bold leading-5 text-slate-950">
              <p className="font-black text-red-600">Important Note:</p>
              <p>1. GST tax will be extra @ 18%.</p>
              <p>2. Any Government Charges to be paid by Client directly.</p>
            </div>
            <div className="mt-6 border-t border-slate-950 pt-3 text-center">
              <p className="text-[10px] font-black text-slate-950">For more details please contact us on : info@ananttattva.com | +91 8169727341 / 9004005520</p>
              <p className="mt-5 text-[10px] font-black text-slate-950">This is a computer-generated quotation and does not require a signature.</p>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function formatInr(value) {
  return (Number(value) || 0).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDisplayDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildQuotationPrintHtml(quotation) {
  const details = quotation.leadDetails || {};
  const items = quotation.items || [];
  const createdDate = quotation.createdAt ? new Date(quotation.createdAt).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');
  const rows = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.serviceCategory || '-')}</td>
      <td>${escapeHtml(item.servicesForYear || '-')}</td>
      <td>${escapeHtml(item.eprCategory || '-')}</td>
      <td>${escapeHtml(item.piboCategory || '-')}</td>
      <td class="center">${escapeHtml(item.unit || '-')}</td>
      <td class="amount">${escapeHtml(formatInr(item.basicAmount))}</td>
    </tr>
  `).join('');
  const terms = (quotation.terms || []).length
    ? quotation.terms.map((term, index) => `<p>${index + 1}. ${escapeHtml(term)}</p>`).join('')
    : '<p>No terms added.</p>';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(quotation.quotationNumber || 'Quotation')}</title>
    <style>
      @page { size: A4; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #fff; color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 10px; font-weight: 400; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { width: 100%; min-height: 100vh; padding: 0; }
      .header { display: flex; align-items: center; justify-content: space-between; padding: 12px 0 24px; border-bottom: 1px solid #020617; }
      .logo { width: 105px; height: 42px; object-fit: contain; object-position: left center; }
      .title { color: #f97316; font-size: 18px; font-weight: 900; letter-spacing: 4px; text-transform: uppercase; }
      .top { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 16px 0 16px; border-bottom: 1px solid #d1d5db; line-height: 1.5; }
      .right { text-align: right; }
      .amount { text-align: right; }
      .to { padding: 15px 0 12px; line-height: 1.55; }
      .label { font-weight: 900; }
      .strong { font-weight: 800; }
      .value { font-weight: 400; }
      p { margin: 0 0 4px; }
      table { width: 100%; border-collapse: collapse; margin-top: 4px; }
      th { background: #f97316; color: white; border: 1px solid #020617; padding: 8px 7px; text-align: left; font-size: 10px; font-weight: 900; }
      td { border: 1px solid #020617; padding: 7px; font-size: 10px; font-weight: 500; text-transform: uppercase; }
      td.amount { font-weight: 800; }
      .center { text-align: center; }
      .terms { margin-top: 16px; line-height: 1.45; }
      .terms p { margin: 2px 0; font-weight: 400; }
      .important { margin-top: 14px; line-height: 1.55; }
      .important-title { color: #ef0000; font-weight: 900; }
      .footer { margin-top: 16px; border-top: 1px solid #020617; padding-top: 14px; text-align: center; font-weight: 900; }
      .signature { margin-top: 16px; }
      @media print {
        html, body { width: 210mm; min-height: 297mm; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="header">
        <img class="logo" src="${ANANT_LOGO_URL}" alt="Anant Tattva">
        <div class="title">Quotation</div>
      </section>
      <section class="top">
        <div>
          <p class="label">From:</p>
          <p>Krunal Goda</p>
          <p class="strong">AnantTattva Private Limited</p>
          <p>Office No.12 &14, Midas Building, Sahar Plaza JB Nagar, Next to J B Nagar Metro Chakala, Andheri East, Mumbai - 400059</p>
        </div>
        <div class="right">
          <p>Quotation Date: ${escapeHtml(createdDate)}</p>
          <p>Quotation No.: ${escapeHtml(quotation.quotationNumber || '-')}</p>
          <p>Quotation Valid Until: ${escapeHtml(quotation.validUntil || '-')}</p>
          <p>Created: ${escapeHtml(createdDate)}</p>
          <p>Prepared By: ${escapeHtml(quotation.createdBy?.name || '-')}</p>
        </div>
      </section>
      <section class="to">
        <p class="label">To:</p>
        <p>${escapeHtml(details.salutation || '')} ${escapeHtml(details.contactPerson || '-')} ${details.designation ? `- ${escapeHtml(details.designation)}` : ''}</p>
          <p><span class="strong">Mobile No.1:</span> ${escapeHtml(details.mobileNo1 || '-')}</p>
          <p class="strong">${escapeHtml(details.companyName || '-')}</p>
        <p>${escapeHtml([details.addressLine1, details.addressLine2, details.addressLine3].filter(Boolean).join(', ') || '-')}</p>
        <p><span class="strong">State:</span> ${escapeHtml(details.state || '-')}</p>
        <p><span class="strong">City:</span> ${escapeHtml(details.city || '-')}</p>
        <p><span class="strong">Pincode:</span> ${escapeHtml(details.pinCode || '-')}</p>
      </section>
      <table>
        <thead>
          <tr><th>Service Category</th><th>Services for the Year</th><th>EPR Category</th><th>PIBO Category</th><th>Unit</th><th>Basic Amount (INR)</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6" class="center">No quotation items added.</td></tr>'}</tbody>
      </table>
      <section class="terms">
        <p class="label">Terms & Conditions:</p>
        ${terms}
      </section>
      <section class="important">
        <p class="important-title">Important Note:</p>
        <p>1. GST tax will be extra @ 18%.</p>
        <p>2. Any Government Charges to be paid by Client directly.</p>
      </section>
      <section class="footer">
        <p>For more details please contact us on : info@ananttattva.com | +91 8169727341 / 9004005520</p>
        <p class="signature">This is a computer-generated quotation and does not require a signature.</p>
      </section>
    </main>
  </body>
</html>`;
}

function QuoteSelect({ value, options, placeholder, onChange }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 min-w-44 rounded-lg border border-slate-300 bg-white px-3 text-sm font-black uppercase text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label} {required && <span className="text-red-500">*</span>}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
