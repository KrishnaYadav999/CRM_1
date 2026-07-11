import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, Clock3, Edit3, Eye, FileText, RefreshCw, RotateCcw, Search, X, XCircle, Users } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import DashboardShell from '../components/dashboard/DashboardShell';
import ProfileModal from '../components/dashboard/ProfileModal';
import BrandLoader from '../components/BrandLoader';
import ToastMessage from '../components/ToastMessage';
import { adminRoles } from '../constants/dashboard';
import api, { storeSessionUser } from '../services/api';
import { API_ENDPOINTS } from '../services/apiEndpoints';

const rowsPerPage = 5;
const PENDING_APPROVAL_CACHE_KEY = 'crm.pendingApproval.cache.v2';
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
  const canApprove = adminRoles.includes(currentUser?.role);

  const allApprovalRows = useMemo(() => [...pendingClients, ...pendingQuotations], [pendingClients, pendingQuotations]);
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
    typeFilter === 'quotations' ? [] : pendingClients.filter(filterRow)
  ), [pendingClients, searchTerm, statusFilter, piboFilter, typeFilter]);
  const filteredQuotations = useMemo(() => (
    typeFilter === 'clients' ? [] : pendingQuotations.filter(filterRow)
  ), [pendingQuotations, searchTerm, statusFilter, piboFilter, typeFilter]);
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
    if (tab === 'quotations' || tab === 'clients') setActiveTab(tab);
  }, [location.search]);

  useEffect(() => {
    setClientPage(1);
    setQuotePage(1);
  }, [searchTerm, typeFilter, statusFilter, piboFilter]);

  function resetFilters() {
    setSearchTerm('');
    setTypeFilter('all');
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
      if (cached.currentUser) setCurrentUser(cached.currentUser);
      setLoading(false);
    } else if (!options.silent && !currentUser) {
      setLoading(true);
    }
    setError('');

    try {
      const [meResult, approvalsResult] = await Promise.allSettled([
        api.get(API_ENDPOINTS.auth.me, authRequestConfig),
        api.get(API_ENDPOINTS.clients.pendingApprovals, dataRequestConfig)
      ]);

      const meResponse = meResult.status === 'fulfilled' ? meResult.value : null;
      const approvalsResponse = approvalsResult.status === 'fulfilled' ? approvalsResult.value : null;

      if (meResponse?.data?.user) {
        setCurrentUser(meResponse.data.user);
        storeSessionUser(meResponse.data.user);
      }

      if (!approvalsResponse) {
        throw approvalsResult.reason || new Error('Unable to load pending approvals');
      }

      const snapshot = {
        currentUser: meResponse?.data?.user || currentUser || cached?.currentUser || cachedApprovalData?.currentUser || null,
        pendingClients: approvalsResponse.data.pendingClients || [],
        pendingQuotations: approvalsResponse.data.pendingQuotations || [],
        debug: approvalsResponse.data.debug || null
      };
      setPendingClients(snapshot.pendingClients);
      setPendingQuotations(snapshot.pendingQuotations);
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

  async function updateApproval(row, status) {
    if (!canApprove) return;
    const id = row?.id;
    setSavingId(`${id}-${status}`);
    setError('');
    setNotice('');

    try {
      await api.patch(API_ENDPOINTS.clients.approval(id), {
        status,
        approvalRecordId: row?.approvalRecordId,
        source: row?.source,
        uniqueId: row?.uniqueId,
        clientName: row?.clientName || row?.companyName,
        piboCategory: row?.piboCategory,
        eprCategory: row?.eprCategory,
        createdBy: row?.createdBy,
        payload: row?.payload
      });
      setNotice(`Approval ${status.toLowerCase()} successfully.`);
      await loadPage({ force: true, silent: true });
    } catch (err) {
      setError(readError(err, 'Unable to update approval.'));
    } finally {
      setSavingId('');
    }
  }

  async function updateQuotationApproval(row, status) {
    if (!canApprove) return;
    const id = row?.id;
    setSavingId(`quote-${id}-${status}`);
    setError('');
    setNotice('');

    try {
      await api.patch(API_ENDPOINTS.quotations.approval(id), {
        status,
        approvalRecordId: row?.approvalRecordId,
        remarks: `${status === 'APPROVED' ? 'Approved' : 'Rejected'} from Pending Approval`
      });
      setNotice(`Quotation ${status.toLowerCase()} successfully.`);
      await loadPage({ force: true, silent: true });
    } catch (err) {
      setError(readError(err, 'Unable to update quotation approval.'));
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
    if (!canApprove) return;
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
            <Metric icon={Users} label="Pending Clients" value={pendingClients.length} hint="Needs your review" tone="mint" />
            <Metric icon={FileText} label="Pending Quotations" value={pendingQuotations.length} hint="Needs your review" tone="blue" />
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
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter approval type">
                <option value="all">All Types</option>
                <option value="clients">Clients</option>
                <option value="quotations">Quotations</option>
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter approval status">
                <option value="all">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
              <select value={piboFilter} onChange={(event) => setPiboFilter(event.target.value)} aria-label="Filter PIBO category">
                <option value="all">All PIBO Category</option>
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
                <ApprovalTab
                  active={activeTab === 'clients'}
                  icon={Clock3}
                  label="Pending Clients"
                  count={filteredClients.length}
                  onClick={() => setActiveTab('clients')}
                />
                <ApprovalTab
                  active={activeTab === 'quotations'}
                  icon={FileText}
                  label="Pending Quotations"
                  count={filteredQuotations.length}
                  onClick={() => setActiveTab('quotations')}
                />
              </div>
            </div>

            {activeTab === 'clients' ? (
              <ApprovalTable
                title="Pending Clients"
                columns={['Client Name', 'Approval Status', 'PIBO Category', 'EPR Category', 'Created By', 'Request Date', 'Actions']}
                emptyText="No pending clients found."
                page={clientPage}
                totalPages={clientTotalPages}
                showing={visibleClients.length}
                total={filteredClients.length}
                onPrev={() => setClientPage((value) => Math.max(1, value - 1))}
                onNext={() => setClientPage((value) => Math.min(clientTotalPages, value + 1))}
                actions={canApprove ? (
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
                    <Cell strong>{client.clientName}</Cell>
                    <Cell>{statusBadge(client.approvalStatus)}</Cell>
                    <Cell>{client.piboCategory}</Cell>
                    <Cell>{client.eprCategory}</Cell>
                    <Cell>{client.createdBy}</Cell>
                    <Cell>{[formatApprovalValue(client.requestDate), formatApprovalValue(client.requestTime)].filter((item) => item !== '-').join(' ')}</Cell>
                    <ActionCell row={client} savingId={savingId} onUpdate={updateApproval} canApprove={canApprove} />
                  </tr>
                ))}
              </ApprovalTable>
            ) : (
              <ApprovalTable
                title="Pending Quotations"
                columns={['User Name', 'Lead Generated By', 'Company Name', 'Contact Person', 'Mobile No.1', 'Quotation Date', 'Service', 'Category', 'PIBO Category', 'Basic Amount', 'Approval Status', 'Approval Type', 'Created By', 'Actions']}
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
                    <Cell strong>{quote.basicAmount}</Cell>
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

  if (!canApprove) {
    return (
      <td className="whitespace-nowrap px-4 py-3.5">
        <span className="pending-admin-only">Admin only</span>
      </td>
    );
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

  return (
    <td>
      <div className="pending-row-actions pending-row-actions-wrap">
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
          onClick={() => onRevise(row)}
          className="pending-action pending-action-revise"
        >
          <Edit3 className="h-3.5 w-3.5" />
          Revise
        </button>
        {canApprove ? (
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
        ) : (
          <span className="pending-admin-only">Admin only</span>
        )}
      </div>
    </td>
  );
}
