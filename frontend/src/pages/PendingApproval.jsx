import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, Clock3, Edit3, Eye, FileText, RefreshCw, RotateCcw, Search, X, XCircle, Users } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import DashboardShell from '../components/dashboard/DashboardShell';
import ProfileModal from '../components/dashboard/ProfileModal';
import BrandLoader from '../components/BrandLoader';
import ToastMessage from '../components/ToastMessage';
import { adminRoles, isComplianceRole } from '../constants/dashboard';
import api, { storeSessionUser } from '../services/api';
import { API_ENDPOINTS } from '../services/apiEndpoints';

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
  const navigate = useNavigate();
  const location = useLocation();
  const normalizedRole = String(currentUser?.role || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const canApprove = adminRoles.includes(normalizedRole);
  const isComplianceApprovalView = isComplianceRole(currentUser?.role) && !canApprove;
  const canApproveClients = canApprove || isComplianceApprovalView;

  const allApprovalRows = useMemo(() => isComplianceApprovalView
    ? pendingClients
    : [...pendingClients, ...pendingQuotations, ...duplicateLeadApprovals, ...serviceApprovals, ...royaltyApprovals], [isComplianceApprovalView, pendingClients, pendingQuotations, duplicateLeadApprovals, serviceApprovals, royaltyApprovals]);
  const piboOptions = useMemo(() => {
    const values = allApprovalRows
      .map((row) => formatApprovalValue(row?.piboCategory))
      .filter((value) => value && value !== '-');
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  }, [allApprovalRows]);
  const filterRow = (row) => {
    const statusMatches = statusFilter === 'all' || getApprovalStatus(row) === statusFilter;
    const piboMatches = piboFilter === 'all' || formatApprovalValue(row?.piboCategory) === piboFilter;
    return statusMatches && piboMatches && rowMatchesSearch(row, searchTerm);
  };
  const filteredClients = useMemo(() => (
    !['all', 'clients'].includes(typeFilter) ? [] : pendingClients.filter(filterRow)
  ), [pendingClients, searchTerm, statusFilter, piboFilter, typeFilter]);
  const filteredQuotations = useMemo(() => (
    !['all', 'quotations'].includes(typeFilter) ? [] : pendingQuotations.filter(filterRow)
  ), [pendingQuotations, searchTerm, statusFilter, piboFilter, typeFilter]);
  const filteredDuplicateLeads = useMemo(() => !['all', 'duplicates'].includes(typeFilter) ? [] : duplicateLeadApprovals.filter(filterRow), [duplicateLeadApprovals, searchTerm, statusFilter, typeFilter]);
  const filteredRoyalty = useMemo(() => !['all', 'royalty'].includes(typeFilter) ? [] : royaltyApprovals.filter(filterRow), [royaltyApprovals, searchTerm, statusFilter, typeFilter]);
  const filteredServices = useMemo(() => !['all', 'services'].includes(typeFilter) ? [] : serviceApprovals.filter(filterRow), [serviceApprovals, searchTerm, statusFilter, typeFilter]);
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
    if (tab === 'clients' || tab === 'quotations' || tab === 'duplicates' || tab === 'royalty' || tab === 'services') setActiveTab(tab);
    else setActiveTab('quotations');
  }, [isComplianceApprovalView, location.search, normalizedRole]);

  useEffect(() => {
    setClientPage(1);
    setQuotePage(1);
  }, [searchTerm, typeFilter, statusFilter, piboFilter]);

  function resetFilters() {
    setSearchTerm('');
    setTypeFilter(isComplianceApprovalView ? 'clients' : 'all');
    setStatusFilter('all');
    setPiboFilter('all');
  }

  async function loadPage(options = {}) {
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
    } else if (!options.silent && !currentUser) {
      setLoading(true);
    }
    setError('');

    try {
      const [meResult, approvalsResult, leadsResult, duplicateResult] = await Promise.allSettled([
        api.get(API_ENDPOINTS.auth.me, authRequestConfig),
        api.get(API_ENDPOINTS.clients.pendingApprovals, dataRequestConfig),
        api.get(API_ENDPOINTS.leads.list, dataRequestConfig),
        api.get(API_ENDPOINTS.leads.duplicateApprovals, dataRequestConfig)
      ]);

      const meResponse = meResult.status === 'fulfilled' ? meResult.value : null;
      const approvalsResponse = approvalsResult.status === 'fulfilled' ? approvalsResult.value : null;
      const crmLeads = leadsResult.status === 'fulfilled' ? (leadsResult.value.data?.leads || []) : [];

      if (meResponse?.data?.user) {
        setCurrentUser(meResponse.data.user);
        storeSessionUser(meResponse.data.user);
      }

      if (!approvalsResponse) {
        throw approvalsResult.reason || new Error('Unable to load pending approvals');
      }

      const snapshot = {
        currentUser: meResponse?.data?.user || currentUser || cached?.currentUser || cachedApprovalData?.currentUser || null,
        pendingClients: applyBulkLeadCreators(approvalsResponse.data.pendingClients || [], crmLeads),
        pendingQuotations: applyBulkQuotationOwners(approvalsResponse.data.pendingQuotations || [], crmLeads),
        debug: approvalsResponse.data.debug || null
      };
      setPendingClients(snapshot.pendingClients);
      setPendingQuotations(snapshot.pendingQuotations);
      const leadApprovals = (duplicateResult.status === 'fulfilled' ? (duplicateResult.value.data?.approvals || []) : []).map((approval) => {
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
      setDuplicateLeadApprovals(leadApprovals.filter((row) => !['lead_royalty', 'lead_service'].includes(row.type)));
      setServiceApprovals(leadApprovals.filter((row) => row.type === 'lead_service'));
      setRoyaltyApprovals(leadApprovals.filter((row) => row.type === 'lead_royalty'));
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

  async function updateQuotationApproval(row, status) {
    if (!canApprove) return;
    const id = row?.quotationId || row?._id || row?.id;
    setSavingId(`quote-${id}-${status}`);
    setError('');
    setNotice('');

    try {
      const response = await api.patch(API_ENDPOINTS.quotations.approval(id), {
        status,
        approvalRecordId: row?.approvalRecordId,
        remarks: `${status === 'APPROVED' ? 'Approved' : 'Rejected'} from Pending Approval`
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
    const selectedLeadId = row?.selectedLeadId || row?.leadId || row?.uniqueId || row?.payload?.selectedLeadId || row?.payload?.selectedLead;
    navigate('/sales/client-master', {
      state: {
        selectedLeadId,
        companyName: row?.clientName || row?.companyName || '',
        fromPendingApproval: true
      }
    });
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
            {canApproveClients && <Metric icon={Users} label="Pending Clients" value={pendingClients.length} hint="Needs your review" tone="mint" />}
            {!isComplianceApprovalView && <Metric icon={FileText} label="Pending Quotations" value={pendingQuotations.length} hint="Needs your review" tone="blue" />}
            {!isComplianceApprovalView && <Metric icon={Users} label="Special Approvals" value={duplicateLeadApprovals.filter((row) => getApprovalStatus(row) === 'PENDING').length} hint="Lead review" tone="mint" />}
            {!isComplianceApprovalView && <Metric icon={Users} label="Royalty Claims" value={royaltyApprovals.filter((row) => getApprovalStatus(row) === 'PENDING').length} hint="Ratio review" tone="blue" />}
            <Metric icon={CheckCircle2} label="Approved Today" value={approvedTodayCount} hint="Since midnight" tone="teal" />
            <Metric icon={XCircle} label="Rejected" value={rejectedCount} hint="Since midnight" tone="rose" />
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
                <option value="services">Service Pending</option>
                <option value="royalty">Royalty Claims</option>
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
              <div className="pending-tabs">
                {canApproveClients && <ApprovalTab
                  active={activeTab === 'clients'}
                  icon={Clock3}
                  label="Pending Clients"
                  count={filteredClients.length}
                  onClick={() => setActiveTab('clients')}
                />}
                {!isComplianceApprovalView && <ApprovalTab
                  active={activeTab === 'quotations'}
                  icon={FileText}
                  label="Pending Quotations"
                  count={filteredQuotations.length}
                  onClick={() => setActiveTab('quotations')}
                />}
                {!isComplianceApprovalView && <ApprovalTab
                  active={activeTab === 'royalty'}
                  icon={Users}
                  label="Royalty Claims"
                  count={filteredRoyalty.length}
                  onClick={() => setActiveTab('royalty')}
                />}
                {!isComplianceApprovalView && <ApprovalTab
                  active={activeTab === 'services'}
                  icon={FileText}
                  label="Service Pending"
                  count={filteredServices.length}
                  onClick={() => setActiveTab('services')}
                />}
                {!isComplianceApprovalView && <ApprovalTab
                  active={activeTab === 'duplicates'}
                  icon={Users}
                  label="Special Approvals"
                  count={filteredDuplicateLeads.length}
                  onClick={() => setActiveTab('duplicates')}
                />}
              </div>
            </div>

            {activeTab === 'clients' ? (
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
                actions={canApproveClients ? (
                  <button
                    type="button"
                    disabled={!pendingClients.length || Boolean(savingId)}
                    onClick={approveAllPendingClients}
                    className="pending-approve-all"
                  >
                    {savingId === 'approve-all' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Approve All
                  </button>
                ) : (
                  <span className="pending-admin-only">Admin only</span>
                )}
              >
                {visibleClients.map((client) => (
                  <tr key={client.id}>
                    <Cell strong><button type="button" onClick={() => openClientMaster(client)} className="font-black text-emerald-700 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-900">{client.clientName}</button></Cell>
                    <Cell>{statusBadge(client.approvalStatus)}</Cell>
                    <Cell>{client.piboCategory}</Cell>
                    <Cell>{client.eprCategory}</Cell>
                    <Cell>{client.createdBy}</Cell>
                    <Cell>{[formatApprovalValue(client.requestDate), formatApprovalValue(client.requestTime)].filter((item) => item !== '-').join(' ')}</Cell>
                    <ActionCell row={client} savingId={savingId} onUpdate={requestClientDecision} canApprove={canApproveClients} />
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
                title="Service Pending Approvals"
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
                title="Pending Quotations"
                columns={['User Name', 'Lead Generated By', 'Company Name', 'Contact Person', 'Mobile No.1', 'Quotation Date', 'Service', 'Category', 'Applicant Type', 'Basic Amount', 'Approval Status', 'Approval Type', 'Created By', 'Actions']}
                emptyText="No pending quotations found."
                page={quotePage}
                totalPages={quoteTotalPages}
                showing={visibleQuotations.length}
                total={filteredQuotations.length}
                onPrev={() => setQuotePage((value) => Math.max(1, value - 1))}
                onNext={() => setQuotePage((value) => Math.min(quoteTotalPages, value + 1))}
                actions={canApprove ? (
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
                    <Cell>{quote.createdBy}</Cell>
                    <QuotationActionCell
                      row={quote}
                      savingId={savingId}
                      onView={openQuotationDetails}
                      onRevise={reviseQuotation}
                      onUpdate={updateQuotationApproval}
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
            <p className="pending-decision-help">Your note and decision will be saved in the audit trail and emailed to <strong>{clientDecision.row.createdBy || 'the Client Master creator'}</strong>.</p>
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

function Metric({ icon: Icon, label, value, hint = '', tone = 'mint' }) {
  const animatedValue = useCountUp(value);
  return (
    <div className={`pending-metric-card pending-metric-${tone}`}>
      <span>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p>{label}</p>
        <strong className="count-up-number">{animatedValue}</strong>
        {hint && <small>{hint}</small>}
      </div>
    </div>
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

  return (
    <div className="pending-table-card">
      <div className="pending-table-head">
        <div>
          <h2>{title}</h2>
          <span>Showing {showing} of {total} entries</span>
        </div>
        {actions}
      </div>
      <div className="pending-table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
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
        <span>Showing {showing} of {total} entries</span>
        <div>
          <button type="button" disabled={page === 1} onClick={onPrev}>‹</button>
          <strong>{page}</strong>
          <button type="button" disabled={page === totalPages} onClick={onNext}>›</button>
        </div>
      </div>
    </div>
  );
}

function Cell({ children, strong = false }) {
  return (
    <td className={strong ? 'pending-cell-strong' : ''}>
      {React.isValidElement(children) ? children : formatApprovalValue(children)}
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
        <button
          type="button"
          onClick={() => onView(row)}
          className="pending-action pending-action-view"
        >
          <Eye className="h-3.5 w-3.5" />
          View Details
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
        {canApprove && getApprovalStatus(row) === 'PENDING' ? (
          <>
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
          </>
        ) : null}
      </div>
    </td>
  );
}
