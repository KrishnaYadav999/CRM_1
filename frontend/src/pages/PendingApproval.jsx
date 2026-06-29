import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Clock3, Edit3, Eye, FileText, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import DashboardShell from '../components/dashboard/DashboardShell';
import ProfileModal from '../components/dashboard/ProfileModal';
import BrandLoader from '../components/BrandLoader';
import ToastMessage from '../components/ToastMessage';
import { adminRoles } from '../constants/dashboard';
import api from '../services/api';

const rowsPerPage = 5;
const PENDING_APPROVAL_CACHE_KEY = 'crm.pendingApproval.cache.v2';
const PENDING_APPROVAL_CACHE_TTL_MS = 5 * 60 * 1000;
const PENDING_APPROVAL_REQUEST_TIMEOUT_MS = 4500;

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
  const [activeTab, setActiveTab] = useState('clients');
  const [clientPage, setClientPage] = useState(1);
  const [quotePage, setQuotePage] = useState(1);
  const navigate = useNavigate();
  const location = useLocation();
  const canApprove = adminRoles.includes(currentUser?.role);

  const clientTotalPages = Math.max(1, Math.ceil(pendingClients.length / rowsPerPage));
  const quoteTotalPages = Math.max(1, Math.ceil(pendingQuotations.length / rowsPerPage));

  const visibleClients = useMemo(() => (
    pendingClients.slice((clientPage - 1) * rowsPerPage, clientPage * rowsPerPage)
  ), [clientPage, pendingClients]);

  const visibleQuotations = useMemo(() => (
    pendingQuotations.slice((quotePage - 1) * rowsPerPage, quotePage * rowsPerPage)
  ), [pendingQuotations, quotePage]);

  useEffect(() => {
    loadPage({ silent: Boolean(cachedApprovalData) });
  }, []);

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab');
    if (tab === 'quotations' || tab === 'clients') setActiveTab(tab);
  }, [location.search]);

  async function loadPage(options = {}) {
    const cached = !options.force ? readPendingApprovalCache() : null;
    const requestConfig = { timeout: PENDING_APPROVAL_REQUEST_TIMEOUT_MS };
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
      const [meResponse, approvalsResponse] = await Promise.all([
        api.get('/auth/me', requestConfig),
        api.get('/clients/pending-approvals', requestConfig)
      ]);
      setCurrentUser(meResponse.data.user);
      localStorage.setItem('user', JSON.stringify(meResponse.data.user));
      const snapshot = {
        currentUser: meResponse.data.user,
        pendingClients: approvalsResponse.data.pendingClients || [],
        pendingQuotations: approvalsResponse.data.pendingQuotations || []
      };
      setPendingClients(snapshot.pendingClients);
      setPendingQuotations(snapshot.pendingQuotations);
      writePendingApprovalCache(snapshot);
      setClientPage(1);
      setQuotePage(1);
    } catch (err) {
      if (isSoftApprovalLoadError(err)) {
        const fallback = cached || cachedApprovalData || {};
        setPendingClients(fallback.pendingClients || []);
        setPendingQuotations(fallback.pendingQuotations || []);
        if (fallback.currentUser) setCurrentUser(fallback.currentUser);
      } else {
        setError(readError(err, 'Unable to load pending approvals.'));
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
      await api.patch(`/clients/${id}/approval`, {
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
      await api.patch(`/quotations/${id}/approval`, {
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
      const response = await api.patch('/clients/pending-approvals/clients/approve-all', {
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
      const response = await api.patch('/quotations/pending-approvals/approve-all', {
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
      const response = await api.put('/auth/me', profile);
      setCurrentUser(response.data.user);
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleUpdatePassword(passwords) {
    setProfileSaving(true);
    try {
      await api.put('/auth/me/password', passwords);
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
            <div className="pending-hero-summary">
              <span>Waiting review</span>
              <strong>{pendingClients.length + pendingQuotations.length}</strong>
              <small>{canApprove ? 'Admin approval access enabled' : 'View-only access for this account'}</small>
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
            <Metric icon={Clock3} label="Pending Clients" value={pendingClients.length} />
            <Metric icon={FileText} label="Pending Quotations" value={pendingQuotations.length} />
            <Metric icon={ShieldCheck} label="Total Approvals" value={pendingClients.length + pendingQuotations.length} />
          </div>

          <section className="pending-approval-panel">
            <div className="pending-tabs-wrap">
              <div className="pending-tabs">
                <ApprovalTab
                  active={activeTab === 'clients'}
                  icon={Clock3}
                  label="Pending Clients"
                  count={pendingClients.length}
                  onClick={() => setActiveTab('clients')}
                />
                <ApprovalTab
                  active={activeTab === 'quotations'}
                  icon={FileText}
                  label="Pending Quotations"
                  count={pendingQuotations.length}
                  onClick={() => setActiveTab('quotations')}
                />
              </div>
            </div>

            {activeTab === 'clients' ? (
              <ApprovalTable
                title="Pending Clients"
                columns={['Client Name', 'Approval Status', 'PIBO Category', 'EPR Category', 'Created By', 'Request Date', 'Request Time', 'Actions']}
                emptyText="No pending clients found."
                page={clientPage}
                totalPages={clientTotalPages}
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
                    <Cell>{client.requestDate}</Cell>
                    <Cell>{client.requestTime}</Cell>
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

function Metric({ icon: Icon, label, value }) {
  const animatedValue = useCountUp(value);
  return (
    <div className="pending-metric-card">
      <div>
        <p>{label}</p>
        <span>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <strong className="count-up-number">{animatedValue}</strong>
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

function ApprovalTable({ title, columns, children, emptyText, page, totalPages, onPrev, onNext, actions = null }) {
  const hasRows = React.Children.count(children) > 0;

  return (
    <div className="pending-table-card">
      <div className="pending-table-head">
        <div>
          <h2>{title}</h2>
          <span>Page {page} of {totalPages}</span>
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
        <button type="button" disabled={page === 1} onClick={onPrev}>Prev</button>
        <span>Page {page} of {totalPages}</span>
        <button type="button" disabled={page === totalPages} onClick={onNext}>Next</button>
      </div>
    </div>
  );
}

function Cell({ children, strong = false }) {
  return (
    <td className={strong ? 'pending-cell-strong' : ''}>
      {children || '-'}
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
