import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Diamond, Edit3, Eye, FileCheck2, FileText, RefreshCw, RotateCcw, Search, X, XCircle, Users } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import DashboardShell from '../components/dashboard/DashboardShell';
import ProfileModal from '../components/dashboard/ProfileModal';
import ApprovalTabs from '../components/dashboard/ApprovalTabs';
import BrandLoader from '../components/BrandLoader';
import ToastMessage from '../components/ToastMessage';
import { adminRoles, isComplianceRole } from '../constants/dashboard';
import api, { storeSessionUser } from '../services/api';
import { API_ENDPOINTS } from '../services/apiEndpoints';
import { uploadMedia } from '../services/mediaUpload';

const rowsPerPage = 5;
const PENDING_APPROVAL_CACHE_KEY = 'crm.pendingApproval.cache.v3';
const PENDING_APPROVAL_CACHE_TTL_MS = 5 * 60 * 1000;
const PENDING_APPROVAL_AUTH_TIMEOUT_MS = 4500;
const PENDING_APPROVAL_DATA_TIMEOUT_MS = 20000;

function readPendingApprovalCache() {
  try {
    const raw = sessionStorage.getItem(PENDING_APPROVAL_CACHE_KEY) || localStorage.getItem(PENDING_APPROVAL_CACHE_KEY) || 'null';
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - Number(parsed.savedAt || 0) > PENDING_APPROVAL_CACHE_TTL_MS) return null;
    return parsed.data || null;
  } catch {
    return null;
  }
}

function writePendingApprovalCache(data) {
  const payload = JSON.stringify({ savedAt: Date.now(), data });
  try {
    sessionStorage.setItem(PENDING_APPROVAL_CACHE_KEY, payload);
  } catch {
    // Cache is only for faster navigation.
  }
  try {
    localStorage.setItem(PENDING_APPROVAL_CACHE_KEY, payload);
  } catch {
    // Cache is only for faster navigation.
  }
}

function statusBadge(value) {
  const status = String(value || 'PENDING').toUpperCase();
  const tone = status === 'APPROVED' ? 'approved' : status === 'REJECTED' ? 'rejected' : 'pending';
  return <span className={`pending-status pending-status-${tone}`}>{status}</span>;
}

function formatApprovalValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(formatApprovalValue).filter((item) => item && item !== '-').join(', ') || '-';
  if (typeof value === 'object') {
    return value.name || value.fullName || value.email || value.username || value.companyName || value.clientName || value.id || value._id || '-';
  }
  return String(value);
}

function formatAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value || '-';
  return amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PoProof({ row }) {
  const url = String(row?.poFileUrl || row?.poProof?.url || '').trim();
  if (!url) return <span className="text-xs font-semibold text-slate-400">No PO proof</span>;
  const name = String(row?.poFileName || row?.poProof?.fileName || 'PO proof');
  const mime = String(row?.poFileMimeType || row?.poProof?.mimeType || '').toLowerCase();
  const image = mime.startsWith('image/') || /\.(?:png|jpe?g|webp|gif)(?:\?|$)/i.test(url);
  return <div className="mt-2 flex items-center gap-2">
    {image && <a href={url} target="_blank" rel="noreferrer" title="Open full PO proof"><img src={url} alt={name} className="h-14 w-14 rounded-lg border border-slate-200 bg-white object-cover shadow-sm" /></a>}
    <div className="flex flex-col items-start gap-1">
      <a href={url} target="_blank" rel="noreferrer" className="font-black text-blue-600 underline">View PO Proof</a>
      <a href={url} download={name} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-slate-500 hover:text-slate-800">Download · {name}</a>
    </div>
  </div>;
}

function normalizePoApprovalRow(row = {}) {
  const quotationItems = Array.isArray(row.quotationItems) ? row.quotationItems : [];
  const itemTotal = quotationItems.reduce((sum, item) => sum + (Number(item.unit) || 1) * (Number(item.basicAmount) || 0), 0);
  return {
    ...row,
    poAmountValue: Number(row.poAmount) > 0 ? Number(row.poAmount) : null,
    basicAmountValue: itemTotal || Number(row.quotationBasicAmount) || null,
    proofUrl: String(row.poFileUrl || row.poProof?.url || '').trim()
  };
}

function PoApprovalDetails({ row }) {
  const quotationItem = Array.isArray(row?.quotationItems) ? row.quotationItems[0] || {} : {};
  const details = [
    ['FY / Service Period', row?.fy || quotationItem.servicesForYear || quotationItem.financialYear],
    ['Industry Type', quotationItem.industryType],
    ['Business Category', quotationItem.businessCategory],
    ['Service Category', quotationItem.serviceCategory || quotationItem.eprCategory],
    ['Service Start', quotationItem.serviceStartDate],
    ['Service End', quotationItem.serviceEndDate],
    ['Applicant Type', quotationItem.subApplicantType || quotationItem.piboCategory || quotationItem.applicantType],
    ['Unit', quotationItem.unit || '1'],
    ['UOM', quotationItem.unitLabel],
    ['Basic Amount', quotationItem.basicAmount != null ? `₹${Number(quotationItem.basicAmount || 0).toLocaleString('en-IN')}` : null]
  ];
  return <article className="mb-3 min-w-[440px] rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-slate-950">{row?.poNumber || 'PO number unavailable'}</strong><span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700">{row?.currency || 'INR'} {row?.poAmount == null ? '-' : Number(row.poAmount).toLocaleString('en-IN')}</span></div>
    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-3">{details.map(([label, value]) => <div key={label}><small className="block text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</small><span className="text-xs font-bold text-slate-700">{formatApprovalValue(value)}</span></div>)}</div>
    <div className="mt-3 text-[10px] font-bold uppercase text-slate-500">Services: {Array.isArray(row?.services) ? row.services.map((service) => formatApprovalValue(service)).join(', ') || '-' : '-'}</div>
  </article>;
}

function applyBulkLeadCreators(clients = [], leads = []) {
  const byKey = new Map();
  leads.forEach((lead) => {
    [lead._id, lead.id, lead.sourceLeadId, lead.leadCode].forEach((value) => {
      const key = String(value || '').trim().toLowerCase();
      if (key) byKey.set(key, lead);
    });
  });

  return clients.map((row) => {
    const client = row.payload || {};
    const selectedLead = client.selectedLead || {};
    const selectedLeadId = typeof selectedLead === 'object' ? (selectedLead._id || selectedLead.id) : selectedLead;
    const leadNumber = client.data?.importMeta?.leadNumber || row.leadNumber || '';
    const lead = [selectedLeadId, leadNumber]
      .map((value) => byKey.get(String(value || '').trim().toLowerCase()))
      .find(Boolean);
    const isBulkLead = Boolean(String(lead?.sourceLeadId || leadNumber || '').trim());
    const originalCreator = String(lead?.importedCreatedBy || '').trim();
    const assignedName = String(lead?.assignedTo?.name || lead?.assignedToText || lead?.assignedToEmail || '').trim();
    const leadCreator = /^demo(?:\s+demo)?$/i.test(originalCreator) && assignedName ? assignedName : originalCreator;
    return isBulkLead && leadCreator ? { ...row, createdBy: leadCreator, leadCreatedBy: leadCreator } : row;
  });
}

function applyBulkQuotationOwners(quotations = [], leads = []) {
  const byKey = new Map();
  leads.forEach((lead) => {
    [lead._id, lead.id, lead.sourceLeadId, lead.leadCode].forEach((value) => {
      const key = String(value || '').trim().toLowerCase();
      if (key) byKey.set(key, lead);
    });
  });
  return quotations.map((row) => {
    const lead = [row.leadId, row.sourceLeadId, row.businessLeadCode, row.leadCode]
      .map((value) => byKey.get(String(value || '').trim().toLowerCase()))
      .find(Boolean);
    if (!lead?.sourceLeadId) return row;
    const originalCreator = String(lead.importedCreatedBy || '').trim();
    const assignedName = String(lead.assignedTo?.name || lead.assignedToText || lead.assignedToEmail || '').trim();
    const creator = /^demo(?:\s+demo)?$/i.test(originalCreator) && assignedName ? assignedName : originalCreator;
    return {
      ...row,
      userName: assignedName || creator || row.userName,
      leadGeneratedBy: creator || row.leadGeneratedBy,
      createdBy: creator || row.createdBy
    };
  });
}

function hydratePurchaseOrderApprovals(approvals = [], leads = []) {
  return approvals.map((approval) => {
    if (approval.type !== 'purchase_order') return approval;
    const payload = approval.payload || {};
    const approvalLeadKeys = [payload.leadId, payload.leadCode].map((value) => String(value || '')).filter(Boolean);
    const lead = leads.find((row) => [row._id, row.id, row.sourceLeadId, row.leadCode]
      .some((value) => approvalLeadKeys.includes(String(value || ''))));
    if (!lead) return approval;
    const assignments = Array.isArray(lead.assignments) ? lead.assignments : [];
    const assignment = assignments.find((row) => payload.assignedServiceId && String(row?.assignedServiceId || '') === String(payload.assignedServiceId))
      || assignments[Number(payload.assignmentIndex)]
      || {};
    const livePoRows = Array.isArray(assignment.poYearRows) ? assignment.poYearRows.filter((row) => row && (row.poNumber || row.poAmount || row.poFileUrl)) : [];
    return {
      ...approval,
      payload: {
        ...payload,
        leadCode: payload.leadCode || lead.leadCode || '',
        service: payload.service || (lead.serviceSelections || [])[Number(payload.assignmentIndex)] || {},
        poYearRows: livePoRows.length ? livePoRows : (payload.poYearRows || [])
      }
    };
  });
}

function getApprovalStatus(row) {
  return String(row?.approvalStatus || row?.status || 'PENDING').toUpperCase();
}

function rowMatchesSearch(row, query) {
  if (!query.trim()) return true;
  const needle = query.trim().toLowerCase();
  return Object.values(row || {}).some((value) => formatApprovalValue(value).toLowerCase().includes(needle));
}

function readError(err, fallback) {
  return err?.response?.data?.error || fallback;
}

function isSoftApprovalLoadError(err) {
  return err?.code === 'ECONNABORTED' || err?.message === 'Network Error' || !err?.response;
}

export default function PendingApproval() {
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const cachedApprovalData = useMemo(() => readPendingApprovalCache(), []);
  const [pendingClients, setPendingClients] = useState(() => cachedApprovalData?.pendingClients || []);
  const [pendingQuotations, setPendingQuotations] = useState(() => cachedApprovalData?.pendingQuotations || []);
  const [duplicateLeadApprovals, setDuplicateLeadApprovals] = useState([]);
  const [serviceApprovals, setServiceApprovals] = useState([]);
  const [serviceApprovalDetail, setServiceApprovalDetail] = useState(null);
  const [serviceRejection, setServiceRejection] = useState(null);
  const [clientDecision, setClientDecision] = useState(null);
  const [royaltyApprovals, setRoyaltyApprovals] = useState([]);
  const [temporaryApprovals, setTemporaryApprovals] = useState([]);
  const [temporaryDecision, setTemporaryDecision] = useState(null);
  const [poApprovals, setPoApprovals] = useState([]);
  const [poDecision, setPoDecision] = useState(null);
  const [quotationDecision, setQuotationDecision] = useState(null);
  const [approvalInputs, setApprovalInputs] = useState({});
  const [loading, setLoading] = useState(() => !cachedApprovalData && !currentUser);
  const [profileSaving, setProfileSaving] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [debugInfo, setDebugInfo] = useState(null);
  const [activeTab, setActiveTab] = useState('clients');
  const [clientPage, setClientPage] = useState(1);
  const [quotePage, setQuotePage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [piboFilter, setPiboFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const loadRequestRef = useRef(0);
  const navigate = useNavigate();
  const location = useLocation();
  const normalizedRole = String(currentUser?.role || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const canApprove = adminRoles.includes(normalizedRole);
  const isSuperAdmin = normalizedRole === 'superadmin';
  const canApproveTemporary = ['admin', 'superadmin'].includes(normalizedRole);
  const isComplianceApprovalView = isComplianceRole(currentUser?.role) && !canApprove;
  const canApproveClients = canApprove || isComplianceApprovalView;

  useEffect(() => {
    if (location.state?.approvalNotice) setNotice(location.state.approvalNotice);
  }, [location.state?.approvalNotice]);

  const allApprovalRows = useMemo(() => isComplianceApprovalView
    ? pendingClients
    : [...pendingClients, ...pendingQuotations, ...duplicateLeadApprovals, ...serviceApprovals, ...royaltyApprovals, ...temporaryApprovals, ...poApprovals], [isComplianceApprovalView, pendingClients, pendingQuotations, duplicateLeadApprovals, serviceApprovals, royaltyApprovals, temporaryApprovals, poApprovals]);
  const piboOptions = useMemo(() => {
    const values = allApprovalRows
      .map((row) => formatApprovalValue(row?.piboCategory))
      .filter((value) => value && value !== '-');
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  }, [allApprovalRows]);
  const approvalUserName = (row) => formatApprovalValue(row?.createdBy || row?.submittedBy || row?.createdByName || row?.userName || row?.claimedBy || row?.leadGeneratedBy);
  const userOptions = useMemo(() => [...new Set(allApprovalRows.map(approvalUserName).filter((value) => value && value !== '-'))].sort((a, b) => a.localeCompare(b)), [allApprovalRows]);
  const filterRow = (row) => {
    const statusMatches = statusFilter === 'all' || getApprovalStatus(row) === statusFilter;
    const piboMatches = piboFilter === 'all' || formatApprovalValue(row?.piboCategory) === piboFilter;
    const userMatches = userFilter === 'all' || approvalUserName(row) === userFilter;
    return statusMatches && piboMatches && userMatches && rowMatchesSearch(row, searchTerm);
  };
  const filteredClients = useMemo(() => (
    !['all', 'clients'].includes(typeFilter) ? [] : pendingClients.filter(filterRow)
  ), [pendingClients, searchTerm, statusFilter, piboFilter, userFilter, typeFilter]);
  const filteredQuotations = useMemo(() => (
    !['all', 'quotations'].includes(typeFilter) ? [] : pendingQuotations.filter(filterRow)
  ), [pendingQuotations, searchTerm, statusFilter, piboFilter, userFilter, typeFilter]);
  const filteredDuplicateLeads = useMemo(() => !['all', 'duplicates'].includes(typeFilter) ? [] : duplicateLeadApprovals.filter(filterRow), [duplicateLeadApprovals, searchTerm, statusFilter, userFilter, typeFilter]);
  const filteredRoyalty = useMemo(() => !['all', 'royalty'].includes(typeFilter) ? [] : royaltyApprovals.filter(filterRow), [royaltyApprovals, searchTerm, statusFilter, userFilter, typeFilter]);
  const filteredServices = useMemo(() => !['all', 'services'].includes(typeFilter) ? [] : serviceApprovals.filter(filterRow), [serviceApprovals, searchTerm, statusFilter, userFilter, typeFilter]);
  const filteredTemporary = useMemo(() => !['all', 'temporary'].includes(typeFilter) ? [] : temporaryApprovals.filter(filterRow), [temporaryApprovals, searchTerm, statusFilter, userFilter, typeFilter]);
  const filteredPoApprovals = useMemo(() => !['all', 'po'].includes(typeFilter) ? [] : poApprovals.filter(filterRow), [poApprovals, searchTerm, statusFilter, piboFilter, userFilter, typeFilter]);
  const approvedTodayCount = useMemo(() => (
    allApprovalRows.filter((row) => getApprovalStatus(row) === 'APPROVED').length
  ), [allApprovalRows]);
  const rejectedCount = useMemo(() => (
    allApprovalRows.filter((row) => getApprovalStatus(row) === 'REJECTED').length
  ), [allApprovalRows]);

  const clientTotalPages = Math.max(1, Math.ceil(filteredClients.length / rowsPerPage));
  const quoteTotalPages = Math.max(1, Math.ceil(filteredQuotations.length / rowsPerPage));

  const visibleClients = useMemo(() => (
    filteredClients.slice((clientPage - 1) * rowsPerPage, clientPage * rowsPerPage)
  ), [clientPage, filteredClients]);

  const visibleQuotations = useMemo(() => (
    filteredQuotations.slice((quotePage - 1) * rowsPerPage, quotePage * rowsPerPage)
  ), [filteredQuotations, quotePage]);

  const approvalTabs = useMemo(() => {
    const list = [];
    if (canApproveClients) {
      list.push({ id: 'clients', icon: Clock3, label: 'Pending Clients', count: filteredClients.length });
    }
    if (canApproveTemporary) {
      list.push({ id: 'temporary', icon: Users, label: 'Temporary Assignments', count: filteredTemporary.length });
    }
    if (!isComplianceApprovalView) {
      list.push({ id: 'po', icon: FileCheck2, label: 'PO Approval', count: filteredPoApprovals.length });
      list.push({ id: 'quotations', icon: FileText, label: 'Pending Quotations', count: filteredQuotations.length });
      list.push({ id: 'royalty', icon: Users, label: 'Royalty Claims', count: filteredRoyalty.length });
      list.push({ id: 'services', icon: FileText, label: 'Pending Service Approvals', count: filteredServices.length });
      list.push({ id: 'duplicates', icon: Users, label: 'Special Approvals', count: filteredDuplicateLeads.length });
    }
    return list;
  }, [canApproveClients, canApproveTemporary, isComplianceApprovalView, filteredClients.length, filteredTemporary.length, filteredPoApprovals.length, filteredQuotations.length, filteredRoyalty.length, filteredServices.length, filteredDuplicateLeads.length]);

  function handleTabChange(tabId) {
    if (tabId && typeof tabId === 'string') {
      setActiveTab(tabId);
      setTypeFilter(tabId);
    }
  }

  useEffect(() => {
    loadPage({ silent: Boolean(cachedApprovalData) });
  }, []);

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab');
    if (isComplianceApprovalView) {
      setActiveTab('clients');
      setTypeFilter('clients');
      return;
    }
    if (tab === 'clients' || tab === 'quotations' || tab === 'duplicates' || tab === 'royalty' || tab === 'services' || tab === 'po') setActiveTab(tab);
    else setActiveTab('quotations');
  }, [isComplianceApprovalView, location.search, normalizedRole]);

  useEffect(() => {
    setClientPage(1);
    setQuotePage(1);
  }, [searchTerm, typeFilter, statusFilter, piboFilter, userFilter]);

  function resetFilters() {
    setSearchTerm('');
    setTypeFilter(isComplianceApprovalView ? 'clients' : 'all');
    setStatusFilter('all');
    setPiboFilter('all');
    setUserFilter('all');
  }

  function openMetric(type, status = 'PENDING') {
    const preferredTab = type || (canApproveClients ? 'clients' : 'quotations');
    setActiveTab(preferredTab);
    setTypeFilter(preferredTab);
    setStatusFilter(status);
    setSearchTerm('');
    setPiboFilter('all');
    setUserFilter('all');
    document.querySelector('.pending-approval-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadPage(options = {}) {
    const requestId = ++loadRequestRef.current;
    const cached = !options.force ? readPendingApprovalCache() : null;
    const authRequestConfig = { timeout: PENDING_APPROVAL_AUTH_TIMEOUT_MS };
    const dataRequestConfig = {
      timeout: PENDING_APPROVAL_DATA_TIMEOUT_MS,
      params: { _: Date.now() }
    };
    if (cached && !options.force) {
      setPendingClients(cached.pendingClients || []);
      setPendingQuotations(cached.pendingQuotations || []);
      if (cached.currentUser) setCurrentUser((stored) => ({
        ...(stored || {}),
        ...cached.currentUser,
        avatarUrl: cached.currentUser.avatarUrl || stored?.avatarUrl || stored?.avatar || stored?.profileImage || ''
      }));
      setLoading(false);
    } else if (options.force || (!options.silent && !currentUser)) {
      setLoading(true);
    }
    setError('');

    try {
      const [meResult, approvalsResult, duplicateResult] = await Promise.allSettled([
        api.get(API_ENDPOINTS.auth.me, authRequestConfig),
        api.get(API_ENDPOINTS.clients.pendingApprovals, dataRequestConfig),
        api.get(API_ENDPOINTS.leads.duplicateApprovals, dataRequestConfig)
      ]);

      const meResponse = meResult.status === 'fulfilled' ? meResult.value : null;
      const approvalsResponse = approvalsResult.status === 'fulfilled' ? approvalsResult.value : null;
      const crmLeads = [];

      if (meResponse?.data?.user) {
        setCurrentUser(meResponse.data.user);
        storeSessionUser(meResponse.data.user);
      }

      if (!approvalsResponse) {
        throw approvalsResult.reason || new Error('Unable to load pending approvals');
      }
      if (requestId !== loadRequestRef.current) return;

      const snapshot = {
        currentUser: meResponse?.data?.user || currentUser || cached?.currentUser || cachedApprovalData?.currentUser || null,
        pendingClients: applyBulkLeadCreators(approvalsResponse.data.pendingClients || [], crmLeads),
        pendingQuotations: applyBulkQuotationOwners(approvalsResponse.data.pendingQuotations || [], crmLeads),
        debug: approvalsResponse.data.debug || null
      };
      setPendingClients(snapshot.pendingClients);
      setPendingQuotations(snapshot.pendingQuotations);
      const leadApprovals = hydratePurchaseOrderApprovals(duplicateResult.status === 'fulfilled' ? (duplicateResult.value.data?.approvals || []) : [], crmLeads).map((approval) => {
        if (approval.type === 'lead_service') {
          const leadId = String(approval.payload?.leadId || '');
          const matchingLead = crmLeads.find((lead) => [lead._id, lead.id, lead.sourceLeadId, lead.leadCode]
            .some((id) => String(id || '') === leadId));
          const grouped = new Map();
          (matchingLead?.serviceSelections || []).forEach((service) => {
            const owner = String(
              service.createdByName
              || service.createdByEmail
              || matchingLead.importedCreatedBy
              || approval.payload?.originalCreator
              || 'CRM User'
            ).trim();
            if (!grouped.has(owner)) grouped.set(owner, []);
            grouped.get(owner).push(service);
          });
          const serviceGroups = [...grouped.entries()].map(([user, services]) => ({ user, count: services.length, services }));
          return {
            ...approval,
            payload: {
              ...(approval.payload || {}),
              serviceGroups: serviceGroups.length ? serviceGroups : (approval.payload?.groups || [])
            }
          };
        }
        if (approval.type === 'lead_royalty' || approval.payload?.leadAssignedTo) return approval;
        const existingId = String(approval.payload?.existingLeadId || '');
        const matchingLead = crmLeads.find((lead) => [lead._id, lead.id, lead.sourceLeadId, lead.leadCode].some((id) => String(id || '') === existingId));
        const leadAssignedTo = matchingLead?.assignedTo?.name
          || matchingLead?.assignedToText
          || matchingLead?.assignedStaff?.name
          || matchingLead?.assignedStaffText
          || matchingLead?.assignments?.find((item) => item?.assignedToText || item?.assignedStaffText)?.assignedToText
          || matchingLead?.assignments?.find((item) => item?.assignedStaffText)?.assignedStaffText
          || '';
        return leadAssignedTo ? { ...approval, payload: { ...approval.payload, leadAssignedTo } } : approval;
      });
      setDuplicateLeadApprovals(leadApprovals.filter((row) => !['lead_royalty', 'lead_service', 'lead_temporary', 'purchase_order'].includes(row.type)));
      setServiceApprovals(leadApprovals.filter((row) => row.type === 'lead_service'));
      setRoyaltyApprovals(leadApprovals.filter((row) => row.type === 'lead_royalty'));
      setTemporaryApprovals(leadApprovals.filter((row) => row.type === 'lead_temporary'));
      setPoApprovals(leadApprovals.filter((row) => row.type === 'purchase_order'));
      setDebugInfo(snapshot.debug);
      console.info('[PendingApproval:loaded]', {
        clients: snapshot.pendingClients.length,
        quotations: snapshot.pendingQuotations.length,
        debug: snapshot.debug
      });
      writePendingApprovalCache(snapshot);
      setClientPage(1);
      setQuotePage(1);
    } catch (err) {
      if (isSoftApprovalLoadError(err)) {
        const fallback = cached || cachedApprovalData || {};
        setPendingClients(fallback.pendingClients || []);
        setPendingQuotations(fallback.pendingQuotations || []);
        setDebugInfo({
          source: 'browser-cache-fallback',
          message: err?.message || 'Request timed out',
          timeout: PENDING_APPROVAL_DATA_TIMEOUT_MS,
          clients: fallback.pendingClients?.length || 0,
          quotations: fallback.pendingQuotations?.length || 0
        });
        console.info('[PendingApproval:fallback]', err?.message || err, fallback);
        if (fallback.currentUser) setCurrentUser(fallback.currentUser);
      } else {
        setError(readError(err, 'Unable to load pending approvals.'));
        setDebugInfo({
          source: 'error',
          status: err?.response?.status,
          message: readError(err, 'Unable to load pending approvals.')
        });
        console.error('[PendingApproval:error]', err);
      }
    } finally {
      if (!options.silent || !cached) setLoading(false);
    }
  }

  function requestClientDecision(row, status) {
    if (!canApproveClients) return;
    setClientDecision({ row, status, note: '' });
  }

  async function updateApproval(row, status, remarks) {
    if (!canApproveClients) return;
    const decisionNote = String(remarks || '').trim();
    if (!decisionNote || decisionNote.length > 250) return;
    const id = row?.id;
    setSavingId(`${id}-${status}`);
    setError('');
    setNotice('');

    try {
      const response = await api.patch(API_ENDPOINTS.clients.approval(id), {
        status,
        approvalRecordId: row?.approvalRecordId,
        source: row?.source,
        uniqueId: row?.uniqueId,
        clientName: row?.clientName || row?.companyName,
        piboCategory: row?.piboCategory,
        eprCategory: row?.eprCategory,
        createdBy: row?.createdBy,
        remarks: decisionNote,
        payload: row?.payload
      });
      setClientDecision(null);
      const emailMessage = response.data?.notification?.sent
        ? ' Decision email sent to the creator.'
        : ' Decision saved, but the creator email could not be sent; verify the creator email address.';
      setNotice(`${row?.clientName || 'Client Master'} ${status.toLowerCase()} successfully.${emailMessage}`);
      await loadPage({ force: true, silent: true });
    } catch (err) {
      setError(readError(err, 'Unable to update approval.'));
    } finally {
      setSavingId('');
    }
  }

  async function submitClientDecision(event) {
    event.preventDefault();
    const note = String(clientDecision?.note || '').trim();
    if (!clientDecision?.row || !note || note.length > 250) return;
    await updateApproval(clientDecision.row, clientDecision.status, note);
  }

  async function submitTemporaryDecision(event) {
    event.preventDefault();
    const remarks = String(temporaryDecision?.remarks || '').trim();
    const wordCount = remarks ? remarks.split(/\s+/).filter(Boolean).length : 0;
    if (!temporaryDecision?.row || !remarks || wordCount > 250) return;
    const id = temporaryDecision.row._id || temporaryDecision.row.id;
    setSavingId(id);
    setError('');
    try {
      await api.patch(API_ENDPOINTS.leads.temporaryAssignmentDecision(id), { decision: temporaryDecision.decision, remarks });
      setNotice(`Temporary assignment ${temporaryDecision.decision === 'APPROVED' ? 'approved for 7 days' : 'rejected'}. Remarks saved in the database audit trail.`);
      setTemporaryDecision(null);
      await loadPage({ force: true, silent: true });
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      setError(readError(err, 'Unable to save the temporary assignment decision.'));
    } finally {
      setSavingId('');
    }
  }

  async function uploadPoDecisionScreenshot(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSavingId('po-screenshot');
    setError('');
    try {
      const uploaded = await uploadMedia(file, 'crm/leads/po-approval-decisions');
      setPoDecision((current) => ({ ...current, screenshotUrl: uploaded.secureUrl, screenshotName: file.name }));
    } catch (err) {
      setError(readError(err, 'Unable to upload the correction screenshot.'));
    } finally {
      setSavingId('');
      event.target.value = '';
    }
  }

  async function submitPoDecision(event) {
    event.preventDefault();
    const remarks = String(poDecision?.remarks || '').trim();
    if (!poDecision?.row || !remarks) return;
    const id = poDecision.row._id || poDecision.row.id;
    setSavingId(`po-${id}`);
    setError('');
    try {
      await api.patch(API_ENDPOINTS.leads.purchaseOrderApprovalDecision(id), { status: poDecision.status, remarks, screenshotUrl: poDecision.screenshotUrl || '' });
      setNotice(`Purchase Order ${poDecision.status === 'APPROVED' ? 'approved' : poDecision.status === 'REJECTED' ? 'rejected' : 'returned for revision'}. The decision was saved and the responsible users were notified.`);
      setPoDecision(null);
      await loadPage({ force: true, silent: true });
    } catch (err) {
      setError(readError(err, 'Unable to save the Purchase Order decision.'));
    } finally {
      setSavingId('');
    }
  }

  async function updateQuotationApproval(row, status, decision = {}) {
    if (!canApprove) return;
    const id = row?.quotationId || row?._id || row?.id;
    setSavingId(`quote-${id}-${status}`);
    setError('');
    setNotice('');

    try {
      const response = await api.patch(API_ENDPOINTS.quotations.approval(id), {
        status,
        approvalRecordId: row?.approvalRecordId,
        remarks: String(decision.remarks || '').trim() || (status === 'APPROVED' ? 'Approved by Super Admin from Pending Approval' : ''),
        proofUrl: decision.proofUrl || '',
        proofName: decision.proofName || ''
      });
      if (String(response.data?.quotation?.status || '').toUpperCase() !== status) {
        throw new Error(`Quotation status was not saved as ${status}.`);
      }
      setNotice(`Quotation ${status.toLowerCase()} successfully.`);
      await loadPage({ force: true, silent: true });
    } catch (err) {
      setError(readError(err, 'Unable to update quotation approval.'));
    } finally {
      setSavingId('');
    }
  }

  async function uploadQuotationDecisionProof(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSavingId('quotation-proof');
    setError('');
    try {
      const uploaded = await uploadMedia(file, 'crm/quotations/approval-proofs');
      setQuotationDecision((current) => ({ ...current, proofUrl: uploaded.secureUrl, proofName: file.name }));
    } catch (err) {
      setError(readError(err, 'Unable to upload approval proof.'));
    } finally {
      setSavingId('');
      event.target.value = '';
    }
  }

  async function submitQuotationDecision(event) {
    event.preventDefault();
    if (!quotationDecision?.row) return;
    const remarks = String(quotationDecision.remarks || '').trim();
    const adminProofRequired = quotationDecision.status === 'APPROVED' && !isSuperAdmin;
    if (quotationDecision.status === 'REJECTED' && !remarks) return;
    if (adminProofRequired && !quotationDecision.proofUrl) return;
    const decision = quotationDecision;
    setQuotationDecision(null);
    await updateQuotationApproval(decision.row, decision.status, decision);
  }

  function requestQuotationDecision(row, status) {
    if (status === 'APPROVED' && isSuperAdmin) {
      updateQuotationApproval(row, status);
      return;
    }
    setQuotationDecision({ row, status, remarks: '', proofUrl: '', proofName: '' });
  }

  async function updateDuplicateLeadApproval(row, status) {
    const isOriginalCreator = String(row?.payload?.originalCreatorId || '') === String(currentUser?._id || currentUser?.id || '');
    if (!canApprove && !(row?.type === 'lead_service' && isOriginalCreator)) return;
    const id = row?._id || row?.id;
    setSavingId(`${id}-${status}`);
    setError('');
    try {
      const values = approvalInputs[id] || {};
      await api.patch(API_ENDPOINTS.leads.duplicateApproval(id), {
        status,
        selectedUserId: values.selectedUserId,
        claimantRatio: values.claimantRatio,
        originalCreatorRatio: values.originalCreatorRatio,
        remarks: values.decisionReason || `${status === 'APPROVED' ? 'Approved' : 'Rejected'} from Pending Approval`
      });
      setNotice(`${row?.type === 'lead_royalty' ? 'Royalty claim' : row?.type === 'lead_service' ? (canApprove ? 'Final additional-service review' : 'Preliminary additional-service review') : 'Special approval request'} ${status.toLowerCase()} successfully.`);
      await loadPage({ force: true, silent: true });
    } catch (err) {
      setError(readError(err, 'Unable to update duplicate lead approval.'));
    } finally {
      setSavingId('');
    }
  }

  function requestServiceDecision(row, status) {
    if (status === 'REJECTED') {
      setServiceRejection({ row, reason: '' });
      return;
    }
    updateDuplicateLeadApproval(row, status);
  }

  async function submitServiceRejection(event) {
    event.preventDefault();
    const reason = String(serviceRejection?.reason || '').trim();
    if (!reason) return;
    const row = serviceRejection.row;
    const id = row._id || row.id;
    setApprovalInputs((current) => ({ ...current, [id]: { ...(current[id] || {}), decisionReason: reason } }));
    setServiceRejection(null);
    setSavingId(`${id}-REJECTED`);
    setError('');
    try {
      await api.patch(API_ENDPOINTS.leads.duplicateApproval(id), { status: 'REJECTED', remarks: reason });
      setNotice(`${canApprove ? 'Final' : 'Preliminary'} service rejection saved successfully.`);
      await loadPage({ force: true, silent: true });
    } catch (err) {
      setError(readError(err, 'Unable to reject this service approval.'));
    } finally {
      setSavingId('');
    }
  }

  function openQuotationDetails(row) {
    const quotationId = row?._id || row?.quotationId || row?.id;
    if (!quotationId) return;
    navigate('/sales/quotations', {
      state: {
        previewQuotationId: quotationId,
        quotationSnapshot: row,
        fromPendingApproval: true
      }
    });
  }

  function reviseQuotation(row) {
    if (getApprovalStatus(row) === 'PENDING') {
      setNotice('Quotation can be revised only after it is approved or rejected.');
      setError('');
      return;
    }
    const quotationId = row?._id || row?.quotationId || row?.id;
    if (!quotationId) return;
    navigate('/sales/quotations', {
      state: {
        editQuotationId: quotationId,
        quotationSnapshot: row,
        fromPendingApproval: true
      }
    });
  }

  async function approveAllPendingClients() {
    if (!canApproveClients) return;
    if (!pendingClients.length) return;
    setSavingId('approve-all');
    setError('');
    setNotice('');

    try {
      const response = await api.patch(API_ENDPOINTS.clients.approveAllPendingClients, {
        remarks: 'Bulk approved from Pending Approval'
      });
      setNotice(`${response.data.approved || 0} pending client approvals completed.`);
      await loadPage({ force: true, silent: true });
    } catch (err) {
      setError(readError(err, 'Unable to approve all pending clients.'));
    } finally {
      setSavingId('');
    }
  }

  function openClientMaster(row) {
    if (!row?.id) return;
    navigate(`/pending-approval/clients/${row.id}/review`);
  }

  async function approveAllPendingQuotations() {
    if (!canApprove) return;
    if (!pendingQuotations.length) return;
    setSavingId('quote-approve-all');
    setError('');
    setNotice('');

    try {
      const response = await api.patch(API_ENDPOINTS.quotations.approveAllPending, {
        remarks: 'Bulk approved from Pending Approval'
      });
      setNotice(`${response.data.approved || 0} pending quotation approvals completed.`);
      await loadPage({ force: true, silent: true });
    } catch (err) {
      setError(readError(err, 'Unable to approve all pending quotations.'));
    } finally {
      setSavingId('');
    }
  }

  async function handleUpdateProfile(profile) {
    setProfileSaving(true);
    try {
      const response = await api.put(API_ENDPOINTS.auth.me, profile);
      setCurrentUser(response.data.user);
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleUpdatePassword(passwords) {
    setProfileSaving(true);
    try {
      await api.put(API_ENDPOINTS.auth.password, passwords);
    } catch (err) {
      throw new Error(readError(err, 'Unable to update password'));
    } finally {
      setProfileSaving(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('login_email');
    navigate('/', { replace: true });
  }

  if (loading && !currentUser && !pendingClients.length && !pendingQuotations.length) {
    return <BrandLoader message="Loading approval desk" />;
  }

  return (
    <DashboardShell currentUser={currentUser} onOpenProfile={() => setProfileOpen(true)} onLogout={handleLogout}>
      <div className="pending-approval-page">
        <div className="pending-approval-shell">
          <header className="pending-approval-hero">
            <div className="pending-approval-title">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="pending-back-button"
                aria-label="Back"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <p>Approval desk</p>
                <h1>Pending Approval</h1>
                <span>Review client masters and quotation requests with a focused approval workflow.</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => loadPage({ force: true })}
              className={`pending-refresh-button ${loading ? 'pending-refresh-loading' : ''}`}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </header>

          {error && <ToastMessage type="error" className="mt-5">{error}</ToastMessage>}
          {notice && <ToastMessage type="success" className="mt-5">{notice}</ToastMessage>}
          {loading && <div className="page-inline-loader">Refreshing approval data...</div>}

          <div className="pending-metrics">
            {canApproveClients && <Metric icon={Users} label="Pending Clients" value={pendingClients.length} hint="Needs your review" tone="mint" onClick={() => openMetric('clients')} />}
            {!isComplianceApprovalView && <Metric icon={FileText} label="Pending Quotations" value={pendingQuotations.length} hint="Needs your review" tone="blue" onClick={() => openMetric('quotations')} />}
            {!isComplianceApprovalView && <Metric icon={Users} label="Special Approvals" value={duplicateLeadApprovals.filter((row) => getApprovalStatus(row) === 'PENDING').length} hint="Lead review" tone="mint" onClick={() => openMetric('duplicates')} />}
            {!isComplianceApprovalView && <Metric icon={Users} label="Royalty Claims" value={royaltyApprovals.filter((row) => getApprovalStatus(row) === 'PENDING').length} hint="Ratio review" tone="blue" onClick={() => openMetric('royalty')} />}
            <Metric icon={CheckCircle2} label="Approved Today" value={approvedTodayCount} hint="Since midnight" tone="teal" onClick={() => openMetric(null, 'APPROVED')} />
            <Metric icon={XCircle} label="Rejected" value={rejectedCount} hint="Since midnight" tone="rose" onClick={() => openMetric(null, 'REJECTED')} />
          </div>

          <section className="pending-approval-panel">
            <div className="pending-filter-bar">
              <label className="pending-search-field">
                <Search className="h-4 w-4" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search approval..."
                />
              </label>
              {!isComplianceApprovalView && <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter approval type">
                <option value="all">All Types</option>
                <option value="clients">Clients</option>
                <option value="quotations">Quotations</option>
                <option value="duplicates">Special Approvals</option>
                <option value="services">Pending Service Approvals</option>
                <option value="royalty">Royalty Claims</option>
                {canApproveTemporary && <option value="temporary">Temporary Assignments</option>}
              </select>}
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter approval status">
                <option value="all">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
              <select value={piboFilter} onChange={(event) => setPiboFilter(event.target.value)} aria-label="Filter PIBO category">
                <option value="all">All Applicant Types</option>
                {piboOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <select value={userFilter} onChange={(event) => setUserFilter(event.target.value)} aria-label="Filter by user">
                <option value="all">All Users</option>
                {userOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <button type="button" className="pending-reset-button" onClick={resetFilters}>
                <RotateCcw className="h-4 w-4" />
                Reset
              </button>
              <button
                type="button"
                onClick={() => loadPage({ force: true })}
                className={`pending-refresh-button pending-refresh-button-compact ${loading ? 'pending-refresh-loading' : ''}`}
                disabled={loading}
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
            <div className="pending-tabs-wrap">
              <ApprovalTabs
                tabs={approvalTabs}
                activeTab={activeTab}
                onTabChange={handleTabChange}
              />
            </div>

            {activeTab === 'po' ? (
              <ApprovalTable title="Purchase Order Approvals" columns={['Company / Lead', 'Service', 'PO Amount', 'PO Proof', 'Basic Amount (INR)', 'Submitted By', 'Status', 'Actions']} emptyText="No Purchase Orders are waiting for approval." page={1} totalPages={1} showing={filteredPoApprovals.length} total={filteredPoApprovals.length} onPrev={() => {}} onNext={() => {}}>
                {filteredPoApprovals.map((row) => {
                  const id = row._id || row.id;
                  const poRows = (row.payload?.poYearRows || []).map(normalizePoApprovalRow);
                  const renderKey = `${id}-${poRows.map((po) => `${po.poAmountValue || 0}:${po.basicAmountValue || 0}:${po.proofUrl}`).join('|')}`;
                  return <tr key={renderKey}><Cell strong>{row.clientName}<small className="mt-1 block text-xs text-slate-400">{row.payload?.leadCode || row.uniqueId || '-'}</small></Cell><Cell>{row.payload?.service?.servicesOffered || row.payload?.service?.applicableService || row.eprCategory || '-'}</Cell><Cell>{poRows.map((po, index) => <div key={index} className="mb-1 font-black text-emerald-700">{po.poAmountValue ? `₹${po.poAmountValue.toLocaleString('en-IN')}` : '-'}<small className="ml-1 text-slate-400">{po.currency || 'INR'}</small></div>)}</Cell><Cell>{poRows.map((po, index) => <PoProof key={`${po.proofUrl || 'proof'}-${index}`} row={po} />)}</Cell><Cell>{poRows.map((po, index) => <strong key={index} className="block text-slate-900">{po.basicAmountValue ? `₹${po.basicAmountValue.toLocaleString('en-IN')}` : '-'}</strong>)}</Cell><Cell>{row.payload?.poSubmittedByName || row.createdByName || '-'}</Cell><Cell>{statusBadge(row.approvalStatus)}</Cell><Cell><div className="flex flex-wrap gap-2"><button type="button" disabled={row.approvalStatus !== 'PENDING'} onClick={() => setPoDecision({ row, status: 'APPROVED', remarks: '', screenshotUrl: '', screenshotName: '' })} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Approve</button><button type="button" disabled={row.approvalStatus !== 'PENDING'} onClick={() => setPoDecision({ row, status: 'REJECTED', remarks: '', screenshotUrl: '', screenshotName: '' })} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-600 disabled:opacity-40">Reject</button><button type="button" disabled={row.approvalStatus !== 'PENDING'} onClick={() => setPoDecision({ row, status: 'REVISION_REQUIRED', remarks: '', screenshotUrl: '', screenshotName: '' })} className="rounded-lg border border-orange-200 px-3 py-2 text-xs font-black text-orange-600 disabled:opacity-40">Revise</button></div></Cell></tr>;
                })}
              </ApprovalTable>
            ) : activeTab === 'temporary' ? (
              <ApprovalTable title="Temporary User Requests" columns={['Client Name', 'Previous User', 'Temporary User', 'Manager Name', 'Duration', 'Status', 'Decision Remarks', 'Actions']} emptyText="No temporary user requests found." page={1} totalPages={1} showing={filteredTemporary.length} total={filteredTemporary.length} onPrev={() => {}} onNext={() => {}}>
                {filteredTemporary.map((row) => <tr key={row._id || row.id}>
                  <Cell strong>{row.clientName}</Cell><Cell>{row.payload?.permanentUserName || '-'}</Cell><Cell>{row.payload?.temporaryUserName || '-'}</Cell><Cell>{row.payload?.managerName || '-'}</Cell><Cell>{row.payload?.requestedDays || 7} days</Cell><Cell>{statusBadge(row.approvalStatus)}</Cell><Cell>{row.remarks || '-'}</Cell>
                  <Cell><div className="flex gap-2"><button type="button" disabled={savingId === (row._id || row.id) || row.approvalStatus !== 'PENDING'} onClick={() => setTemporaryDecision({ row, decision: 'APPROVED', remarks: '' })} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Approve</button><button type="button" disabled={savingId === (row._id || row.id) || row.approvalStatus !== 'PENDING'} onClick={() => setTemporaryDecision({ row, decision: 'REJECTED', remarks: '' })} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-black text-rose-600 disabled:opacity-50">Reject</button></div></Cell>
                </tr>)}
              </ApprovalTable>
            ) : activeTab === 'clients' ? (
              <ApprovalTable
                title="Pending Clients"
                columns={['Client Name', 'Approval Status', 'Applicant Type', 'Service Category', 'Created By', 'Request Date', 'Actions']}
                emptyText="No pending clients found."
                page={clientPage}
                totalPages={clientTotalPages}
                showing={visibleClients.length}
                total={filteredClients.length}
                onPrev={() => setClientPage((value) => Math.max(1, value - 1))}
                onNext={() => setClientPage((value) => Math.min(clientTotalPages, value + 1))}
                actions={<span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">Full verification required</span>}
              >
                {visibleClients.map((client) => (
                  <tr key={client.id} className={`transition-colors ${getApprovalStatus(client) === 'APPROVED' ? 'bg-emerald-50 hover:bg-emerald-100' : 'bg-rose-50/80 hover:bg-rose-100'}`}>
                    <Cell strong><button type="button" onClick={() => openClientMaster(client)} className="font-black text-emerald-700 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-900">{client.clientName}</button></Cell>
                    <Cell><div className="flex flex-col items-start gap-1">{statusBadge(client.approvalStatus)}{client.reminderFlag === 'RED' && <span className="rounded-full bg-red-100 px-2 py-1 text-[9px] font-black text-red-700">48H RED FLAG</span>}</div></Cell>
                    <Cell>{client.piboCategory}</Cell>
                    <Cell>{client.eprCategory}</Cell>
                    <Cell>{formatApprovalValue(client.createdBy)}</Cell>
                    <Cell>{[formatApprovalValue(client.requestDate), formatApprovalValue(client.requestTime)].filter((item) => item !== '-').join(' ')}</Cell>
                    <Cell><button type="button" onClick={() => openClientMaster(client)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white"><FileCheck2 className="h-4 w-4" />Review</button></Cell>
                  </tr>
                ))}
              </ApprovalTable>
            ) : activeTab === 'services' ? (
              <div className="grid gap-4">
                <div className="rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 px-5 py-4 text-sm font-bold leading-6 text-orange-900 shadow-sm">
                  <span className="mr-2 inline-flex rounded-full bg-orange-600 px-3 py-1 text-xs font-black uppercase tracking-wider text-white">Important</span>
                  This is a preliminary decision made by the assigned user. The final approval authority rests with the Admin/Super Admin.
                </div>
                <ApprovalTable
                title="Pending Service Approvals"
                columns={['Company', 'Service Added By', 'Original Creator', 'Services Added', 'Creator Decision', 'Final Decision', 'Actions']}
                emptyText="No service approval requests found."
                page={1}
                totalPages={1}
                showing={filteredServices.length}
                total={filteredServices.length}
                onPrev={() => {}}
                onNext={() => {}}
              >
                {filteredServices.map((row) => {
                  const id = row._id || row.id;
                  const isCreator = String(row.payload?.originalCreatorId || '') === String(currentUser?._id || currentUser?.id || '');
                  return <tr key={id}>
                    <Cell strong><button type="button" onClick={() => setServiceApprovalDetail(row)} className="font-black text-emerald-700 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-900">{row.clientName}</button></Cell>
                    <Cell>{row.payload?.contributorName || row.createdByName}</Cell>
                    <Cell>{row.payload?.originalCreator || currentUser?.name || '-'}</Cell>
                    <Cell>{row.payload?.addedServices?.length || row.payload?.groups?.reduce((sum, group) => sum + Number(group.count || 0), 0) || '-'}</Cell>
                    <Cell><div className="grid gap-1">
                      {statusBadge(row.payload?.preliminaryStatus)}
                      {Number(row.reminderCount || 0) > 0 && row.payload?.preliminaryStatus === 'PENDING' && (
                        <small className={`max-w-64 font-black ${Number(row.reminderCount) >= 2 ? 'text-red-600' : 'text-amber-600'}`}>
                          {Number(row.reminderCount) >= 2 ? '🚩 RED FLAG — Final reminder sent' : 'Reminder 1 of 2 sent'}
                        </small>
                      )}
                      {row.payload?.autoApproved && <small className="max-w-64 font-black text-blue-700">System preliminary approval after two unanswered reminders</small>}
                      {row.payload?.preliminaryReason && <small className="max-w-64 font-bold text-red-600">{row.payload.preliminaryReason}</small>}
                    </div></Cell>
                    <Cell><div className="grid gap-1">{statusBadge(row.payload?.finalStatus)}{row.payload?.finalReason && <small className="max-w-64 font-bold text-red-600">{row.payload.finalReason}</small>}</div></Cell>
                    <ActionCell row={{ ...row, id }} savingId={savingId} onUpdate={requestServiceDecision} canApprove={canApprove || isCreator} />
                  </tr>;
                })}
                </ApprovalTable>
              </div>
            ) : activeTab === 'duplicates' ? (
              <ApprovalTable
                title="Special Approvals"
                columns={['Company', 'Requested By', 'Reason', 'Email', 'Evidence', 'Select Lead Owner', 'Status', 'Actions']}
                emptyText="No special approval requests found."
                page={1}
                totalPages={1}
                showing={filteredDuplicateLeads.length}
                total={filteredDuplicateLeads.length}
                onPrev={() => {}}
                onNext={() => {}}
              >
                {filteredDuplicateLeads.map((row) => (
                  <tr key={row._id || row.id}>
                    <Cell strong>{row.clientName}</Cell>
                    <Cell>{row.createdByName}</Cell>
                    <Cell>{row.type === 'lead_service' ? `Additional services by ${row.payload?.contributorName || row.createdByName}` : row.payload?.reason}</Cell>
                    <Cell>{row.type === 'lead_service' ? row.payload?.contributorEmail : row.payload?.requesterEmail}</Cell>
                    <Cell>{row.payload?.screenshotUrl ? <a className="font-black text-emerald-700 underline" href={row.payload.screenshotUrl} target="_blank" rel="noreferrer">Open</a> : '-'}</Cell>
                    <Cell>{row.type === 'lead_service' ? `Creator: ${row.payload?.preliminaryStatus || 'PENDING'} / Final: ${row.payload?.finalStatus || 'PENDING'}` : <select className="form-input min-w-44" value={approvalInputs[row._id]?.selectedUserId || row.payload?.selectedUserId || ''} disabled={getApprovalStatus(row) !== 'PENDING'} onChange={(event) => setApprovalInputs((current) => ({ ...current, [row._id]: { ...(current[row._id] || {}), selectedUserId: event.target.value } }))}><option value="">Select user</option>{(row.payload?.candidateUsers || []).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>}</Cell>
                    <Cell>{statusBadge(row.type === 'lead_service' && !canApprove ? row.payload?.preliminaryStatus : row.approvalStatus)}</Cell>
                    <ActionCell row={{ ...row, id: row._id || row.id }} savingId={savingId} onUpdate={updateDuplicateLeadApproval} canApprove={canApprove || (row.type === 'lead_service' && String(row.payload?.originalCreatorId || '') === String(currentUser?._id || currentUser?.id || ''))} />
                  </tr>
                ))}
              </ApprovalTable>
            ) : activeTab === 'royalty' ? (
              <ApprovalTable title="Claim Royalty Approvals" columns={['Company', 'FY', 'Services Offered', 'Service Category', 'Data Flag', 'Original Creator', 'Claimed By', 'Original %', 'Claimant %', 'Status', 'Actions']} emptyText="No royalty claims found." page={1} totalPages={1} showing={filteredRoyalty.length} total={filteredRoyalty.length} onPrev={() => {}} onNext={() => {}}>
                {filteredRoyalty.map((row) => {
                  const id = row._id || row.id;
                  const values = approvalInputs[id] || {};
                  return <tr key={id}>
                    <Cell strong>{row.clientName}</Cell><Cell>{row.payload?.financialYear}</Cell><Cell>{(row.payload?.servicesOffered || []).join(', ') || '-'}</Cell><Cell>{(row.payload?.eprCategories || []).join(', ') || '-'}</Cell><Cell><span className={`rounded-full px-3 py-1 text-xs font-black ${row.payload?.dataFlag === 'GREEN' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`} title={row.payload?.correctionDeadline ? `Correction allowed until ${String(row.payload.correctionDeadline).slice(0, 10)}` : 'Complete'}>{row.payload?.dataFlag || 'RED'}</span></Cell><Cell>{row.payload?.originalCreator}</Cell><Cell>{row.payload?.claimantName}</Cell>
                    <Cell><input className="form-input min-w-24" type="number" min="0" max="100" disabled={getApprovalStatus(row) !== 'PENDING'} value={values.originalCreatorRatio ?? row.payload?.originalCreatorRatio ?? ''} onChange={(event) => setApprovalInputs((current) => ({ ...current, [id]: { ...(current[id] || {}), originalCreatorRatio: event.target.value } }))} /></Cell>
                    <Cell><input className="form-input min-w-24" type="number" min="0" max="100" disabled={getApprovalStatus(row) !== 'PENDING'} value={values.claimantRatio ?? row.payload?.claimantRatio ?? ''} onChange={(event) => setApprovalInputs((current) => ({ ...current, [id]: { ...(current[id] || {}), claimantRatio: event.target.value } }))} /></Cell>
                    <Cell>{statusBadge(row.approvalStatus)}</Cell><ActionCell row={{ ...row, id }} savingId={savingId} onUpdate={updateDuplicateLeadApproval} canApprove={canApprove} />
                  </tr>;
                })}
              </ApprovalTable>
            ) : (
              <ApprovalTable
                title={
                  <>
                    <span className="pending-count-num">{filteredQuotations.length}</span>
                    <span>{filteredQuotations.length === 1 ? ' Quotation Pending' : ' Quotations Pending'}</span>
                  </>
                }
                columns={['User Name', 'Lead Generated By', 'Company Name', 'Contact Person', 'Mobile No.', { label: 'Quotation Date', sortable: true }, 'Service', 'Category', 'Applicant Type', 'Basic Amount', 'Approval Status', 'Approval Type', 'Created By', 'Actions']}
                emptyText="No pending quotations found."
                page={quotePage}
                totalPages={quoteTotalPages}
                showing={visibleQuotations.length}
                total={filteredQuotations.length}
                onPrev={() => setQuotePage((value) => Math.max(1, value - 1))}
                onNext={() => setQuotePage((value) => Math.min(quoteTotalPages, value + 1))}
                actions={isSuperAdmin ? (
                  <button
                    type="button"
                    disabled={!pendingQuotations.length || Boolean(savingId)}
                    onClick={approveAllPendingQuotations}
                    className="pending-approve-all"
                  >
                    {savingId === 'quote-approve-all' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Approve All
                  </button>
                ) : (
                  <span className="pending-admin-only">Admin only</span>
                )}
              >
                {visibleQuotations.map((quote) => (
                  <tr key={quote.id}>
                    <Cell strong>{quote.userName}</Cell>
                    <Cell>{quote.leadGeneratedBy}</Cell>
                    <Cell strong>{quote.companyName}</Cell>
                    <Cell>{quote.contactPerson}</Cell>
                    <Cell>{quote.mobileNo1}</Cell>
                    <Cell>{quote.quotationDate}</Cell>
                    <Cell>{quote.service}</Cell>
                    <Cell>{quote.category}</Cell>
                    <Cell>{quote.piboCategory}</Cell>
                    <Cell strong>{formatAmount(quote.basicAmount)}</Cell>
                    <Cell>{statusBadge(quote.approvalStatus)}</Cell>
                    <Cell>{quote.approvalType}</Cell>
                    <Cell>{formatApprovalValue(quote.createdBy)}</Cell>
                    <QuotationActionCell
                      row={quote}
                      savingId={savingId}
                      onView={openQuotationDetails}
                      onRevise={reviseQuotation}
                      onUpdate={requestQuotationDecision}
                      canApprove={canApprove}
                    />
                  </tr>
                ))}
              </ApprovalTable>
            )}
          </section>
        </div>
      </div>

      {serviceApprovalDetail && (
        <div className="fixed inset-0 z-[10000] grid place-items-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setServiceApprovalDetail(null); }}>
          <div className="max-h-[88vh] w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-orange-50 p-5">
              <div><p className="text-xs font-black uppercase tracking-widest text-emerald-700">Service contribution details</p><h2 className="mt-1 text-2xl font-black text-slate-950">{serviceApprovalDetail.clientName}</h2><p className="mt-1 text-sm font-bold text-slate-500">Lead creator: {serviceApprovalDetail.payload?.originalCreator || '-'}</p></div>
              <button type="button" onClick={() => setServiceApprovalDetail(null)} className="grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-600 shadow"><X className="h-5 w-5" /></button>
            </header>
            <div className="max-h-[70vh] overflow-auto p-5">
              {(serviceApprovalDetail.payload?.serviceGroups || []).length ? <div className="space-y-5">{serviceApprovalDetail.payload.serviceGroups.map((group) => (
                <section key={group.user} className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between bg-slate-50 px-4 py-3"><strong>{group.user}</strong><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">{group.count ?? group.services?.length ?? 0} Services</span></div>
                  <div className="overflow-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-emerald-50 text-xs uppercase text-emerald-800"><tr>{['#', 'Industry', 'Service Category', 'Applicant Type', 'Service', 'Applicable Service', 'Financial Year'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody>{(group.services || []).map((service, index) => <tr key={`${group.user}-${index}`} className="border-t"><td className="px-4 py-3 font-black">{index + 1}</td><td className="px-4 py-3">{service.industryType || '-'}</td><td className="px-4 py-3">{service.eprCategory || '-'}</td><td className="px-4 py-3">{service.applicantType || service.piboCategory || '-'}</td><td className="px-4 py-3 font-bold">{service.servicesOffered || '-'}</td><td className="px-4 py-3">{service.applicableService || '-'}</td><td className="px-4 py-3">{service.firstAnnualReturnYearApplicable || '-'}</td></tr>)}</tbody></table>{!(group.services || []).length && <p className="p-5 text-sm font-bold text-slate-500">Detailed rows are unavailable for this older approval; total count is {group.count || 0}.</p>}</div>
                </section>
              ))}</div> : <div className="p-10 text-center font-bold text-slate-500">No service contribution details are available.</div>}
            </div>
          </div>
        </div>
      )}

      {clientDecision && (
        <div className="pending-decision-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingId) setClientDecision(null); }}>
          <form onSubmit={submitClientDecision} className={`pending-decision-modal ${clientDecision.status === 'APPROVED' ? 'is-approved' : 'is-rejected'}`}>
            <div className="pending-decision-icon">
              {clientDecision.status === 'APPROVED' ? <CheckCircle2 className="h-7 w-7" /> : <XCircle className="h-7 w-7" />}
            </div>
            <button type="button" disabled={Boolean(savingId)} onClick={() => setClientDecision(null)} className="pending-decision-close" aria-label="Close decision dialog"><X className="h-5 w-5" /></button>
            <p className="pending-decision-kicker">Client Master decision</p>
            <h2>{clientDecision.status === 'APPROVED' ? 'Approve client' : 'Reject client'}</h2>
            <strong className="pending-decision-client">{clientDecision.row.clientName}</strong>
            <p className="pending-decision-help">Your note and decision will be saved in the audit trail and emailed to <strong>{formatApprovalValue(clientDecision.row.createdBy) === '-' ? 'the Client Master creator' : formatApprovalValue(clientDecision.row.createdBy)}</strong>.</p>
            <label className="pending-decision-field">
              <span>{clientDecision.status === 'APPROVED' ? 'Approval note' : 'Rejection reason'} <b>*</b></span>
              <textarea
                autoFocus
                required
                maxLength={250}
                rows={5}
                value={clientDecision.note}
                onChange={(event) => setClientDecision((current) => ({ ...current, note: event.target.value }))}
                placeholder={clientDecision.status === 'APPROVED' ? 'Write a clear approval note...' : 'Explain what needs to be corrected...'}
              />
              <small><span>{clientDecision.note.length}/250</span> characters</small>
            </label>
            <div className="pending-decision-actions">
              <button type="button" disabled={Boolean(savingId)} onClick={() => setClientDecision(null)}>Cancel</button>
              <button type="submit" disabled={Boolean(savingId) || !clientDecision.note.trim()}>
                {savingId ? <RefreshCw className="h-4 w-4 animate-spin" /> : clientDecision.status === 'APPROVED' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                Submit {clientDecision.status === 'APPROVED' ? 'Approval' : 'Rejection'}
              </button>
            </div>
          </form>
        </div>
      )}
      {temporaryDecision && (() => {
        const wordCount = String(temporaryDecision.remarks || '').trim().split(/\s+/).filter(Boolean).length;
        return <div className="pending-decision-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingId) setTemporaryDecision(null); }}>
          <form onSubmit={submitTemporaryDecision} className={`pending-decision-modal ${temporaryDecision.decision === 'APPROVED' ? 'is-approved' : 'is-rejected'}`}>
            <div className="pending-decision-icon">{temporaryDecision.decision === 'APPROVED' ? <CheckCircle2 className="h-7 w-7" /> : <XCircle className="h-7 w-7" />}</div>
            <button type="button" disabled={Boolean(savingId)} onClick={() => setTemporaryDecision(null)} className="pending-decision-close" aria-label="Close temporary user decision dialog"><X className="h-5 w-5" /></button>
            <p className="pending-decision-eyebrow">Temporary User Approval</p><h2>{temporaryDecision.decision === 'APPROVED' ? 'Approve temporary user' : 'Reject temporary user'}</h2>
            <strong className="pending-decision-client">{temporaryDecision.row.clientName}</strong>
            <p className="pending-decision-help"><strong>Previous User:</strong> {temporaryDecision.row.payload?.permanentUserName || '-'} · <strong>Temporary User:</strong> {temporaryDecision.row.payload?.temporaryUserName || '-'} · <strong>Manager:</strong> {temporaryDecision.row.payload?.managerName || '-'}</p>
            <label className="pending-decision-field"><span>Decision remarks <b>*</b></span><textarea autoFocus required rows={7} value={temporaryDecision.remarks} onChange={(event) => setTemporaryDecision((current) => ({ ...current, remarks: event.target.value }))} placeholder="Enter clear approval or rejection remarks (maximum 250 words)..." /><small className={wordCount > 250 ? 'text-red-600' : ''}><span>{wordCount}/250</span> words</small></label>
            <div className="pending-decision-actions"><button type="button" disabled={Boolean(savingId)} onClick={() => setTemporaryDecision(null)}>Cancel</button><button type="submit" disabled={Boolean(savingId) || !temporaryDecision.remarks.trim() || wordCount > 250}>{savingId ? <RefreshCw className="h-4 w-4 animate-spin" /> : temporaryDecision.decision === 'APPROVED' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}Submit {temporaryDecision.decision === 'APPROVED' ? 'Approval' : 'Rejection'}</button></div>
          </form>
        </div>;
      })()}
      {poDecision && <div className="pending-decision-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingId) setPoDecision(null); }}><form onSubmit={submitPoDecision} className={`pending-decision-modal ${poDecision.status === 'APPROVED' ? 'is-approved' : 'is-rejected'}`}><button type="button" disabled={Boolean(savingId)} onClick={() => setPoDecision(null)} className="pending-decision-close" aria-label="Close PO decision"><X className="h-5 w-5" /></button><p className="pending-decision-eyebrow">Purchase Order Approval</p><h2>{poDecision.status === 'APPROVED' ? 'Approve Purchase Order' : poDecision.status === 'REJECTED' ? 'Reject Purchase Order' : 'Request quotation and PO revision'}</h2><strong className="pending-decision-client">{poDecision.row.clientName}</strong><p className="pending-decision-help">No image or document is required. Add clear remarks and submit the decision.</p><label className="pending-decision-field"><span>Decision remarks <b>*</b></span><textarea autoFocus required rows={6} value={poDecision.remarks} onChange={(event) => setPoDecision((current) => ({ ...current, remarks: event.target.value }))} placeholder="Clearly explain this PO decision..." /></label><div className="pending-decision-actions"><button type="button" disabled={Boolean(savingId)} onClick={() => setPoDecision(null)}>Cancel</button><button type="submit" disabled={Boolean(savingId) || !poDecision.remarks.trim()}>{savingId ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Submit Decision</button></div></form></div>}

      {quotationDecision && <div className="pending-decision-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingId) setQuotationDecision(null); }}><form onSubmit={submitQuotationDecision} className={`pending-decision-modal ${quotationDecision.status === 'APPROVED' ? 'is-approved' : 'is-rejected'}`}><button type="button" disabled={Boolean(savingId)} onClick={() => setQuotationDecision(null)} className="pending-decision-close" aria-label="Close quotation decision"><X className="h-5 w-5" /></button><p className="pending-decision-eyebrow">Quotation Decision</p><h2>{quotationDecision.status === 'APPROVED' ? 'Upload approval proof' : 'Reject quotation'}</h2><strong className="pending-decision-client">{quotationDecision.row.companyName || '-'}</strong>{quotationDecision.status === 'APPROVED' ? <><p className="pending-decision-help">Admin approval requires supporting proof. Super Admin can approve directly without this step.</p><label className="mt-4 flex min-h-16 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 px-4 font-black text-emerald-700"><FileCheck2 className="mr-2 h-5 w-5" />{quotationDecision.proofName || 'Please upload the approval proof'}<input type="file" accept="image/*,.pdf" className="sr-only" onChange={uploadQuotationDecisionProof} /></label><label className="pending-decision-field mt-4"><span>Approval note</span><textarea rows={4} value={quotationDecision.remarks} onChange={(event) => setQuotationDecision((current) => ({ ...current, remarks: event.target.value }))} placeholder="Add an optional approval note..." /></label></> : <label className="pending-decision-field"><span>Rejection reason <b>*</b></span><textarea autoFocus required rows={7} value={quotationDecision.remarks} onChange={(event) => setQuotationDecision((current) => ({ ...current, remarks: event.target.value }))} placeholder="Please explain why this quotation is being rejected..." /></label>}<div className="pending-decision-actions"><button type="button" disabled={Boolean(savingId)} onClick={() => setQuotationDecision(null)}>Cancel</button><button type="submit" disabled={Boolean(savingId) || (quotationDecision.status === 'APPROVED' && !quotationDecision.proofUrl) || (quotationDecision.status === 'REJECTED' && !quotationDecision.remarks.trim())}>{savingId ? <RefreshCw className="h-4 w-4 animate-spin" /> : quotationDecision.status === 'APPROVED' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}Confirm {quotationDecision.status === 'APPROVED' ? 'Approval' : 'Rejection'}</button></div></form></div>}

      {serviceRejection && (
        <div className="fixed inset-0 z-[10001] grid place-items-center bg-slate-950/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setServiceRejection(null); }}>
          <form onSubmit={submitServiceRejection} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-widest text-red-600">Rejection reason required</p><h2 className="mt-1 text-xl font-black text-slate-950">{serviceRejection.row.clientName}</h2></div><button type="button" onClick={() => setServiceRejection(null)} className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100"><X className="h-5 w-5" /></button></div>
            <label className="mt-5 grid gap-2"><span className="text-sm font-black text-slate-700">Reason for rejection</span><textarea autoFocus required rows={5} value={serviceRejection.reason} onChange={(event) => setServiceRejection((current) => ({ ...current, reason: event.target.value }))} className="rounded-xl border border-slate-300 p-4 text-sm font-semibold outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100" placeholder="Explain clearly why these additional services are being rejected..." /></label>
            <p className="mt-2 text-xs font-bold text-slate-500">This reason will be visible in Pending Approval and emailed to the contributor, Admin and Superadmin.</p>
            <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setServiceRejection(null)} className="min-h-11 rounded-xl border px-5 font-black text-slate-700">Cancel</button><button type="submit" disabled={!serviceRejection.reason.trim()} className="min-h-11 rounded-xl bg-red-600 px-5 font-black text-white disabled:opacity-50">Reject with Reason</button></div>
          </form>
        </div>
      )}

      {profileOpen && (
        <ProfileModal
          user={currentUser}
          saving={profileSaving}
          onClose={() => setProfileOpen(false)}
          onLogout={handleLogout}
          onSave={handleUpdateProfile}
          onUpdatePassword={handleUpdatePassword}
        />
      )}
    </DashboardShell>
  );
}

function Metric({ icon: Icon, label, value, hint = '', tone = 'mint', onClick }) {
  const animatedValue = useCountUp(value);
  return (
    <button type="button" onClick={onClick} className={`pending-metric-card pending-metric-${tone}`} aria-label={`Open ${label}`}>
      <span>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p>{label}</p>
        <strong className="count-up-number">{animatedValue}</strong>
        {hint && <small>{hint}</small>}
      </div>
    </button>
  );
}

function ApprovalTab({ active, icon: Icon, label, count, onClick }) {
  const animatedCount = useCountUp(count);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pending-tab ${active ? 'active' : ''}`}
    >
      <span>
        <Icon className="h-5 w-5 shrink-0" />
        <span>{label}</span>
      </span>
      <i>
        {animatedCount}
      </i>
    </button>
  );
}

function useCountUp(value, duration = 900) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const to = Number(value) || 0;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setDisplayValue(to);
      return undefined;
    }

    const start = performance.now();
    let frameId;

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(to * eased));
      if (progress < 1) frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [duration, value]);

  return displayValue;
}

function ApprovalTable({ title, columns, children, emptyText, page, totalPages, onPrev, onNext, actions = null, showing = 0, total = 0 }) {
  const hasRows = React.Children.count(children) > 0;
  const startEntry = total === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endEntry = Math.min(page * rowsPerPage, total);

  return (
    <div className="pending-table-card">
      <div className="pending-table-head">
        <div className="pending-table-title-wrap">
          <h2 className="pending-table-count-title">{title}</h2>
        </div>
        {actions}
      </div>
      <div className="pending-table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => {
                const isObject = typeof column === 'object' && column !== null;
                const label = isObject ? column.label : column;
                const sortable = isObject ? column.sortable : false;
                return (
                  <th key={label}>
                    <span className="pending-th-content">
                      {label}
                      {sortable && <Diamond className="pending-sort-icon h-3 w-3" />}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {hasRows ? children : (
              <tr>
                <td colSpan={columns.length} className="pending-empty-cell">{emptyText}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pending-pager">
        <span>Showing {startEntry} to {endEntry} of {total} entries</span>
        <div>
          <button type="button" disabled={page === 1} onClick={onPrev}><ChevronLeft className="h-3.5 w-3.5" /></button>
          <strong>{page}</strong>
          <button type="button" disabled={page === totalPages} onClick={onNext}><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </div>
  );
}

function Cell({ children, strong = false }) {
  const hasRenderableElements = React.isValidElement(children)
    || (Array.isArray(children) && children.some((child) => React.isValidElement(child)));
  return (
    <td className={strong ? 'pending-cell-strong' : ''}>
      {hasRenderableElements ? children : formatApprovalValue(children)}
    </td>
  );
}

function ActionCell({ row, savingId, onUpdate, savingPrefix = '', canApprove = false }) {
  const id = row?.id;
  const approving = savingId === `${savingPrefix}${id}-APPROVED`;
  const rejecting = savingId === `${savingPrefix}${id}-REJECTED`;
  const pending = getApprovalStatus(row) === 'PENDING';

  if (!canApprove) {
    return <td aria-label="Approval actions unavailable"><span className="pending-admin-only">Admin only</span></td>;
  }
  if (!pending) {
    return <td><span className="pending-admin-only">Completed</span></td>;
  }

  return (
    <td>
      <div className="pending-row-actions">
        <button
          type="button"
          disabled={Boolean(savingId)}
          onClick={() => onUpdate(row, 'APPROVED')}
          className="pending-action pending-action-approve"
        >
          {approving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Approve
        </button>
        <button
          type="button"
          disabled={Boolean(savingId)}
          onClick={() => onUpdate(row, 'REJECTED')}
          className="pending-action pending-action-reject"
        >
          {rejecting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          Reject
        </button>
      </div>
    </td>
  );
}

function QuotationActionCell({ row, savingId, onView, onRevise, onUpdate, canApprove = false }) {
  const id = row?.id;
  const approving = savingId === `quote-${id}-APPROVED`;
  const rejecting = savingId === `quote-${id}-REJECTED`;
  const revisable = getApprovalStatus(row) !== 'PENDING';

  return (
    <td className="pending-quotation-actions-cell">
      <div className="pending-row-actions pending-quotation-actions">
        <div className="pending-quotation-actions-top">
          <button
            type="button"
            onClick={() => onView(row)}
            className="pending-action pending-action-view"
          >
            <Eye className="h-3.5 w-3.5" />
            View
          </button>
          <button
            type="button"
            disabled={!revisable}
            onClick={() => onRevise(row)}
            title={revisable ? 'Revise quotation' : 'Approve or reject this quotation first'}
            className={`pending-action pending-action-revise ${revisable ? '' : 'cursor-not-allowed opacity-50'}`}
          >
            <Edit3 className="h-3.5 w-3.5" />
            Revise
          </button>
        </div>
        {canApprove && getApprovalStatus(row) === 'PENDING' ? (
          <div className="pending-quotation-actions-bottom">
            <button
              type="button"
              disabled={Boolean(savingId)}
              onClick={() => onUpdate(row, 'APPROVED')}
              className="pending-action pending-action-approve"
            >
              {approving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Approve
            </button>
            <button
              type="button"
              disabled={Boolean(savingId)}
              onClick={() => onUpdate(row, 'REJECTED')}
              className="pending-action pending-action-reject"
            >
              {rejecting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              Reject
            </button>
          </div>
        ) : null}
      </div>
    </td>
  );
}
