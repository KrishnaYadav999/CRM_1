import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, FileCheck2, Loader2, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import DashboardShell from '../components/dashboard/DashboardShell';
import PendingApproval from './PendingApproval';
import ArReviewData from './ArReviewData';
import { hasAnyRole } from '../constants/dashboard';
import api from '../services/api';
import './arCompliance.css';
const human = value => String(value || 'NOT_REVIEWED').replaceAll('_', ' ');
const endpoint = id => `/clients/${encodeURIComponent(id)}/ar-compliance`;
function Status({
  value
}) {
  return <span className="ar-status" data-status={value}>{human(value)}</span>;
}
function Progress({
  progress = {}
}) {
  return <div className="ar-progress"><div className="flex items-center justify-between gap-3 text-xs font-bold"><span className="flex items-center gap-2"><ShieldCheck size={17} /> Verification Progress</span><span>{progress.percentage || 0}%</span></div><div className="ar-bar"><span style={{
        width: `${progress.percentage || 0}%`
      }} /></div><p className="ar-muted">{progress.reviewed || 0}/{progress.total || 0} items reviewed · {progress.issues || 0} issues</p></div>;
}
function ReviewItem({
  field,
  saving,
  canReview,
  reviewStage,
  onSave
}) {
  const [status, setStatus] = useState(field.review.status === 'NOT_REVIEWED' ? '' : field.review.status);
  const [remarks, setRemarks] = useState(field.review.remarks || '');
  const [reveal, setReveal] = useState(false);
  const sensitive = /password|secret|token/i.test(field.label);
  return <article className={`ar-field ${field.kind ? 'ar-table-review' : ''}`}>
    <div className="flex items-start justify-between gap-2"><h3>{field.label}</h3><Status value={field.review.status} /></div>
    <div className="ar-value">{sensitive && !reveal ? '••••••••' : <ArReviewData field={field} />}{sensitive && <button className="ml-2 inline-flex items-center gap-1 text-xs text-teal-700" onClick={() => setReveal(value => !value)} aria-label={`${reveal ? 'Hide' : 'Show'} ${field.label}`}><Eye size={14} />{reveal ? 'Hide' : 'Show'}</button>}</div>
    {field.review.stale && <p className="ar-stale">User changed this data. Review the updated {field.kind ? 'table' : 'value'}.</p>}
    <div className="ar-field-controls">
      <label>{field.kind ? 'Table / Excel review' : 'Field review'}<select disabled={!canReview || saving} value={status} onChange={event => setStatus(event.target.value)}><option value="">Select review status</option><option value="VERIFIED">Verified</option><option value="CHANGES_REQUIRED">Changes Required</option></select></label>
      <label>{reviewStage === 'manager' ? 'Manager' : 'Compliance'} remarks *<textarea disabled={!canReview || saving} rows={2} maxLength={2000} value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Verification notes or required corrections…" /></label>
      {field.review.reviewedAt && <p className="ar-saved">Saved {new Date(field.review.reviewedAt).toLocaleString('en-IN')}</p>}
      <button className="ar-save" type="button" disabled={!canReview || saving || !status || !remarks.trim()} onClick={() => onSave(field, status, remarks)}>{saving ? 'Saving…' : field.kind ? 'Save Table Review' : 'Save Field Review'}</button>
    </div>
  </article>;
}
function Workflow({
  payload
}) {
  const {
    workflow,
    managerDecision
  } = payload;
  return <section className="ar-workflow ar-card">
    <div className={`ar-step ${workflow.stage.startsWith('MANAGER') ? 'is-current' : 'is-done'}`}><strong>1. Manager Review</strong><span>{human(workflow.managerStatus)}</span></div><span className="ar-stage-arrow">→</span>
    <div className={`ar-step ${workflow.stage === 'COMPLIANCE_REVIEW' ? 'is-current' : workflow.stage === 'COMPLETED' ? 'is-done' : ''}`}><strong>2. Compliance Review</strong><span>{human(workflow.complianceStatus)}</span></div>
    <p className="ar-muted">Current stage: <b>{workflow.stageLabel}</b>{!payload.canReview && ' · Waiting for the current stage reviewer'}</p>
    {managerDecision?.at && <p className="ar-manager-note"><b>Manager decision:</b> {human(managerDecision.status)} · {managerDecision.by} · {new Date(managerDecision.at).toLocaleString('en-IN')}<br />{managerDecision.remarks}</p>}
  </section>;
}
export function ArComplianceWorkspace({
  clientId
}) {
  const navigate = useNavigate();
  const [payload, setPayload] = useState(null),
    [year, setYear] = useState(() => new URLSearchParams(window.location.search).get('financialYear') || '');
  const [activeKey, setActiveKey] = useState(''),
    [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true),
    [loadVersion, setLoadVersion] = useState(0),
    [saving, setSaving] = useState('');
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [decision, setDecision] = useState(''),
    [finalRemarks, setFinalRemarks] = useState('');
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPayload(null);
    setError('');
    setNotice('');
    setDecision('');
    api.get(endpoint(clientId), {
      params: {
        financialYear: year || undefined
      }
    }).then(({
      data
    }) => {
      if (cancelled) return;
      setPayload(data);
      setActiveKey(data.sections[0]?.key || '');
      setPage(1);
      setFinalRemarks(data.finalRemarks || '');
    }).catch(err => {
      if (!cancelled) setError(err?.response?.data?.error || 'Unable to load AR data.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, year, loadVersion]);
  async function saveItem(field, status, remarks) {
    setSaving(field.key);
    setError('');
    setNotice('');
    try {
      const {
        data
      } = await api.put(`${endpoint(clientId)}/field`, {
        financialYear: payload.financialYear,
        reviewStage: payload.reviewStage,
        key: field.key,
        fingerprint: field.fingerprint,
        status,
        remarks
      });
      setPayload(data);
      setNotice(`${field.kind ? 'Table' : 'Field'} review saved.`);
    } catch (err) {
      setError(err?.response?.data?.error || 'Unable to save review.');
    } finally {
      setSaving('');
    }
  }
  async function submitDecision() {
    setSaving('decision');
    setError('');
    setNotice('');
    try {
      const {
        data
      } = await api.post(`${endpoint(clientId)}/decision`, {
        financialYear: payload.financialYear,
        reviewStage: payload.reviewStage,
        sourceFingerprint: payload.sourceFingerprint,
        decision,
        remarks: finalRemarks
      });
      setPayload(data);
      setFinalRemarks(data.finalRemarks || '');
      setDecision('');
      setNotice(payload.reviewStage === 'manager' && decision === 'APPROVED' ? 'Manager approved. AR data is now with Compliance for review.' : `${payload.reviewStage === 'manager' ? 'Manager' : 'Compliance'} decision saved: ${human(decision)}.`);
    } catch (err) {
      setError(err?.response?.data?.error || 'Unable to save decision.');
    } finally {
      setSaving('');
    }
  }
  const section = payload?.sections.find(item => item.key === activeKey),
    fields = section?.fields || [];
  const pages = Math.max(1, Math.ceil(fields.length / 12)),
    progress = payload?.progress || {};
  const manager = payload?.reviewStage === 'manager',
    canReview = Boolean(payload?.canReview);
  const allReviewed = progress.total > 0 && progress.reviewed === progress.total;
  const validDecision = decision === 'APPROVED' ? progress.verified === progress.total : decision === 'PARTIALLY_APPROVED' ? !manager && progress.verified > 0 && progress.verified < progress.total : decision === 'REJECTED';
  return <div className="ar-review">
    <header className="ar-heading ar-card"><div className="ar-heading-left"><button className="ar-back" aria-label="Back to AR Compliance list" onClick={() => navigate('/compliance/ar')}><ArrowLeft size={18} /></button><div><p className="ar-eyebrow">AR Review Workspace · {manager ? 'Manager' : 'Compliance'}</p><h1>{payload?.client.name || 'Annual Return Review'}</h1><p className="ar-muted flex items-center gap-2"><LockKeyhole size={13} />User data is read-only · {payload?.client.code || '-'}</p></div></div><Progress progress={progress} /></header>
    <div className="ar-card ar-filter mb-3"><label className="ar-year">Financial Year<select value={year || payload?.financialYear || ''} onChange={event => setYear(event.target.value)} disabled={Boolean(saving) || loading}><option value="" disabled>Select financial year</option>{payload?.years.map(value => <option key={value} value={value}>{value}</option>)}</select></label><Status value={payload?.status || 'PENDING'} /><p className="ar-muted">Review fields and complete tables, then record your stage decision.</p></div>
    {payload?.workflow && <Workflow payload={payload} />}
    {error && <div role="alert" className="ar-alert">{error}{!payload && <button className="ml-3 underline" onClick={() => setLoadVersion(value => value + 1)}>Reload data</button>}</div>}{notice && <div role="status" className="ar-notice">{notice}</div>}
    {loading ? <div className="ar-empty"><Loader2 className="mx-auto animate-spin" /><p>Loading saved annual-return data…</p></div> : !payload?.sections.length ? <div className="ar-card ar-empty">AR review becomes available after both Base Data and Portal Upload Excel files are successfully imported.</div> : <>
      <div className="ar-grid"><aside className="ar-card ar-nav"><header><h2>Verification Tabs</h2><p className="ar-muted">Review fields and complete tables</p></header>{payload.sections.map(item => {
            const verified = item.fields.filter(field => field.review.status === 'VERIFIED').length;
            return <button key={item.key} aria-current={activeKey === item.key} disabled={Boolean(saving)} onClick={() => {
              setActiveKey(item.key);
              setPage(1);
            }}><span className="flex items-center justify-between gap-2">{item.label}<span>{Math.round(verified / item.fields.length * 100)}%</span></span><small>{verified}/{item.fields.length} items verified</small><span className="ar-bar"><span style={{
                  width: `${verified / item.fields.length * 100}%`
                }} /></span></button>;
          })}</aside>
        <main className="ar-card overflow-hidden"><header className="ar-section-header"><h2>{section?.label}</h2><p className="ar-muted">Each table or Excel dataset needs one review. Original user data cannot be edited.</p></header><div className="ar-fields">{fields.slice((page - 1) * 12, page * 12).map(field => <ReviewItem key={`${payload.reviewStage}:${payload.financialYear}:${field.key}:${field.fingerprint}:${field.review.reviewedAt || ''}`} field={field} saving={Boolean(saving)} canReview={canReview} reviewStage={payload.reviewStage} onSave={saveItem} />)}</div><div className="ar-pagination"><span>{fields.length} review items · Page {page} of {pages}</span><button disabled={page <= 1 || Boolean(saving)} onClick={() => setPage(value => value - 1)}>Previous</button><button disabled={page >= pages || Boolean(saving)} onClick={() => setPage(value => value + 1)}>Next</button></div></main></div>
      <section className="ar-card ar-final"><label>Final {manager ? 'manager' : 'compliance'} remarks *<textarea disabled={!canReview || Boolean(saving)} rows={3} maxLength={2000} value={finalRemarks} onChange={event => setFinalRemarks(event.target.value)} placeholder="Explain the decision and any corrections…" /><span className="ar-muted">{allReviewed ? 'All review items complete. Select your final decision.' : `Review all ${progress.total} fields and tables before deciding.`}</span></label><div className="grid content-start gap-3"><label>Final {manager ? 'manager' : 'compliance'} decision<select value={decision} onChange={event => setDecision(event.target.value)} disabled={!canReview || Boolean(saving)}><option value="">Select decision</option><option value="APPROVED" disabled={!allReviewed || progress.verified !== progress.total}>Approve</option><option value="REJECTED" disabled={!allReviewed}>Reject</option>{!manager && <option value="PARTIALLY_APPROVED" disabled={!allReviewed || !progress.verified || progress.verified === progress.total}>Partially Approve</option>}</select></label><button type="button" className="ar-save flex items-center gap-2 justify-center w-full" disabled={!canReview || !allReviewed || !validDecision || !finalRemarks.trim() || Boolean(saving)} onClick={submitDecision}><FileCheck2 size={15} />{saving === 'decision' ? 'Saving…' : manager ? 'Save Manager Decision' : 'Save Compliance Decision'}</button></div></section>
    </>}
  </div>;
}
export default function ArComplianceList() {
  const [currentUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [queueTab, setQueueTab] = useState('ar'),
    [rows, setRows] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [status, setStatus] = useState('PENDING'),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1);
  const canCompany = hasAnyRole(currentUser, ['admin', 'superadmin', 'compliance']);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const {
        data
      } = await api.get('/clients/ar-compliance');
      setRows(data.rows || []);
      setPage(1);
    } catch (err) {
      setError(err?.response?.data?.error || 'Unable to load AR clients.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    api.get('/clients/ar-compliance').then(({
      data
    }) => {
      if (!cancelled) setRows(data.rows || []);
    }).catch(() => {
      if (!cancelled) setError('Unable to load AR clients.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const matches = (row, value) => value === 'PENDING' ? ['PENDING', 'IN_REVIEW', 'NOT_READY'].includes(row.status) : row.status === value;
  const filtered = rows.filter(row => matches(row, status) && `${row.clientName} ${row.financialYear} ${row.stageLabel}`.toLowerCase().includes(search.toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  return <DashboardShell currentUser={currentUser}><div className="ar-list ar-review">
    <header className="ar-heading ar-card"><div><p className="ar-eyebrow">Compliance</p><h1>{queueTab === 'company' ? 'Company Compliance' : 'AR Compliance'}</h1><p className="ar-muted">Company verification and annual-return review in one workspace.</p></div>{queueTab === 'ar' && <button className="ar-save flex items-center gap-2" onClick={load} disabled={loading}><RefreshCw size={15} />Refresh</button>}</header>
    <div className="ar-tabs" role="tablist" aria-label="Compliance queues"><button role="tab" aria-selected={queueTab === 'company'} disabled={!canCompany} title={!canCompany ? 'Company reviews are available to Compliance and Admin' : ''} onClick={() => setQueueTab('company')}>Company Compliance</button><button role="tab" aria-selected={queueTab === 'ar'} onClick={() => setQueueTab('ar')}>AR Compliance</button></div>
    {queueTab === 'company' ? <div className="ar-company-queue"><PendingApproval embedded companyOnly /></div> : <>
      {error && <div role="alert" className="ar-alert">{error}</div>}<section className="ar-card"><div className="ar-filter"><label className="max-w-sm flex-1"><span className="sr-only">Search clients, financial year or stage</span><input placeholder="Search client, year or stage…" value={search} onChange={event => {
                setSearch(event.target.value);
                setPage(1);
              }} /></label>{[['PENDING', 'Pending'], ['PARTIALLY_APPROVED', 'Partially Approved'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected']].map(([key, text]) => <button key={key} aria-pressed={status === key} onClick={() => {
              setStatus(key);
              setPage(1);
            }}>{text} <b>{rows.filter(row => matches(row, key)).length}</b></button>)}</div>
        <div className="ar-table-scroll"><table className="ar-table"><thead><tr>{['Client Name', 'Financial Year', 'Current Stage', 'Manager Status', 'Compliance Status', 'Approval Status', 'Decision By', 'Reviewed At', 'Actions'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{filtered.slice((page - 1) * 10, page * 10).map(row => <tr key={`${row.clientId}:${row.financialYear}`}><td>{row.clientName}</td><td>{row.financialYear}</td><td><span className="ar-stage-label">{row.stageLabel}</span></td><td><Status value={row.managerStatus} /></td><td><Status value={row.complianceStatus} /></td><td><Status value={row.status} /></td><td>{row.decisionBy}</td><td>{row.reviewedAt ? new Date(row.reviewedAt).toLocaleString('en-IN') : '-'}</td><td><Link to={`/compliance/ar/${row.clientId}?financialYear=${encodeURIComponent(row.financialYear)}`} className="inline-flex items-center gap-2"><FileCheck2 size={15} />Review</Link></td></tr>)}</tbody></table></div>
        {loading ? <div className="ar-empty">Loading AR clients…</div> : !filtered.length && <div className="ar-empty">No clients in this view. AR clients appear after both Excel files are imported.</div>}<div className="ar-pagination"><span>{filtered.length} records · Page {page} of {pages}</span><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><button disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Next</button></div>
      </section>
    </>}
  </div></DashboardShell>;
}
