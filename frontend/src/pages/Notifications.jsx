import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Bell, Download, Edit3, Eye, FileText, Filter, LayoutGrid, ListChecks, Pin, PinOff, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import gsap from 'gsap';
import DashboardShell from '../components/dashboard/DashboardShell';
import api from '../services/api';

const STORAGE_KEY = 'crm.notifications.v1';
const tags = ['Training Material', 'Compliance SOPs', 'Company Profile', 'Policy Update', 'Internal Memo'];
const statuses = ['Active', 'Inactive'];

const seedNotifications = [
  {
    id: 'notice-1',
    title: 'AnantTattva Kavach EPR Plastic Scope of Work',
    description: 'AnantTattva Kavach EPR Plastic Scope of Work',
    tag: 'Training Material',
    status: 'Active',
    createdBy: 'NITIN',
    createdAt: '2026-06-09T09:39:00',
    attachmentName: 'AnantTattva Kavach EPR Plastic Scope of Work.pdf',
    pinned: true
  },
  {
    id: 'notice-2',
    title: 'EPR Plastic Compliance Training Session',
    description: 'EPR Plastic Compliance Training Session',
    tag: 'Training Material',
    status: 'Active',
    createdBy: 'NITIN',
    createdAt: '2026-05-28T13:28:00',
    attachmentName: 'EPR Plastic Compliance Training Session.pdf',
    pinned: false
  },
  {
    id: 'notice-3',
    title: 'SIMP_PIBO Application Classification for reference',
    description: 'SIMP_PIBO Application Classification for reference',
    tag: 'Compliance SOPs',
    status: 'Active',
    createdBy: 'NITIN',
    createdAt: '2026-04-11T13:03:00',
    attachmentName: 'SIMP_PIBO Application Classification for reference.pdf',
    pinned: false
  },
  {
    id: 'notice-4',
    title: 'AnanTTattva Scope_PIBOs EPR Kavach',
    description: 'AnanTTattva Scope_PIBOs EPR Kavach',
    tag: 'Company Profile',
    status: 'Active',
    createdBy: 'NITIN',
    createdAt: '2026-03-19T13:08:00',
    attachmentName: 'AnanTTattva Scope_PIBOs EPR Kavach.pdf',
    pinned: false
  }
];

const templates = [
  {
    label: 'Training',
    tag: 'Training Material',
    title: 'New compliance training material is available',
    description: 'Please review the latest training material and share it with the relevant team members.'
  },
  {
    label: 'SOP',
    tag: 'Compliance SOPs',
    title: 'Updated compliance SOP for review',
    description: 'A revised SOP has been published. Please read the updated process before starting new submissions.'
  },
  {
    label: 'Memo',
    tag: 'Internal Memo',
    title: 'Internal coordination update',
    description: 'This memo contains an important internal update for coordination, ownership, and next actions.'
  }
];

function readNotifications() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return Array.isArray(parsed) ? parsed.map((item) => ({ pinned: false, ...item })) : seedNotifications;
  } catch {
    return seedNotifications;
  }
}

function writeNotifications(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function emptyDraft() {
  return {
    title: '',
    description: '',
    tag: '',
    status: 'Active',
    attachmentName: '',
    attachmentUrl: '',
    pinned: false
  };
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function tagClass(tag) {
  return String(tag || 'General').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export default function Notifications() {
  const pageRef = useRef(null);
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  }, []);
  const [notifications, setNotifications] = useState(() => readNotifications());
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('Active');
  const [selectedIds, setSelectedIds] = useState([]);
  const [density, setDensity] = useState('comfortable');
  const [modalMode, setModalMode] = useState('');
  const [draft, setDraft] = useState(() => emptyDraft());
  const [selected, setSelected] = useState(null);
  const [serverLoading, setServerLoading] = useState(false);

  const filteredNotifications = useMemo(() => {
    const term = query.trim().toLowerCase();
    return notifications
      .filter((item) => {
        const haystack = [item.title, item.description, item.tag, item.createdBy].filter(Boolean).join(' ').toLowerCase();
        return (!term || haystack.includes(term))
          && (!tagFilter || item.tag === tagFilter)
          && (!statusFilter || item.status === statusFilter);
      })
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || new Date(b.createdAt) - new Date(a.createdAt));
  }, [notifications, query, statusFilter, tagFilter]);


  useEffect(() => {
    const context = gsap.context(() => {
      gsap.from('.notifications-hero', { opacity: 0, y: 18, duration: 0.45, ease: 'power3.out' });
      gsap.from('.notifications-panel', {
        opacity: 0,
        y: 16,
        duration: 0.42,
        stagger: 0.06,
        ease: 'power3.out',
        delay: 0.08
      });
    }, pageRef);
    return () => context.revert();
  }, []);

  useEffect(() => {
    const context = gsap.context(() => {
      gsap.from('.notification-card', {
        opacity: 0,
        y: 10,
        duration: 0.28,
        stagger: 0.025,
        ease: 'power2.out'
      });
    }, pageRef);
    return () => context.revert();
  }, [filteredNotifications.length, statusFilter, tagFilter, query, density]);

  useEffect(() => {
    setSelectedIds((ids) => ids.filter((id) => filteredNotifications.some((item) => item.id === id)));
  }, [filteredNotifications]);

  useEffect(() => {
    let cancelled = false;
    setServerLoading(true);
    api.get('/notifications')
      .then((response) => {
        if (cancelled) return;
        const serverItems = Array.isArray(response.data?.notifications) ? response.data.notifications : [];
        if (serverItems.length) {
          setNotifications((current) => {
            const localItems = current.filter((item) => !item.kind || item.kind === 'announcement-local');
            const merged = [...serverItems, ...localItems]
              .map((item) => ({ pinned: false, status: 'Active', ...item, id: item.id || item._id || `notice-${Date.now()}` }));
            return [...new Map(merged.map((item) => [String(item.id), item])).values()];
          });
        }
      })
      .catch((err) => console.warn('Unable to load server notifications', err?.message || err))
      .finally(() => {
        if (!cancelled) setServerLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function persist(nextItems) {
    setNotifications(nextItems);
    writeNotifications(nextItems);
  }

  function openCreate() {
    setDraft(emptyDraft());
    setModalMode('create');
  }

  function openEdit(item) {
    setDraft({
      title: item.title,
      description: item.description,
      tag: item.tag,
      status: item.status,
      attachmentName: item.attachmentName || '',
      attachmentUrl: item.attachmentUrl || '',
      pinned: Boolean(item.pinned),
      id: item.id
    });
    setModalMode('edit');
  }

  async function saveNotification() {
    if (!draft.title.trim() || !draft.description.trim() || !draft.tag) return;
    const author = currentUser?.name || currentUser?.email || 'Current User';
    if (modalMode === 'edit') {
      persist(notifications.map((item) => item.id === draft.id ? {
        ...item,
        title: draft.title.trim(),
        description: draft.description.trim(),
        tag: draft.tag,
        status: draft.status || 'Active',
        attachmentName: draft.attachmentName,
        attachmentUrl: draft.attachmentUrl,
        pinned: Boolean(draft.pinned),
        updatedAt: new Date().toISOString(),
        updatedBy: author
      } : item));
    } else {
      const localItem = {
        id: `notice-${Date.now()}`,
        title: draft.title.trim(),
        description: draft.description.trim(),
        tag: draft.tag,
        status: draft.status || 'Active',
        attachmentName: draft.attachmentName,
        attachmentUrl: draft.attachmentUrl,
        pinned: Boolean(draft.pinned),
        createdBy: author,
        createdAt: new Date().toISOString(),
        kind: 'announcement-local'
      };
      try {
        const response = await api.post('/notifications', localItem);
        persist([response.data?.notification || localItem, ...notifications]);
      } catch {
        persist([localItem, ...notifications]);
      }
    }
    setModalMode('');
    setSelectedIds([]);
  }

  function deleteNotification(id) {
    persist(notifications.filter((item) => item.id !== id));
    if (selected?.id === id) setSelected(null);
    setSelectedIds((ids) => ids.filter((itemId) => itemId !== id));
  }

  function togglePin(id) {
    persist(notifications.map((item) => item.id === id ? { ...item, pinned: !item.pinned } : item));
  }

  function toggleSelect(id) {
    setSelectedIds((ids) => ids.includes(id) ? ids.filter((itemId) => itemId !== id) : [...ids, id]);
  }

  function toggleSelectAllVisible() {
    const visibleIds = filteredNotifications.map((item) => item.id);
    const allSelected = visibleIds.length && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? selectedIds.filter((id) => !visibleIds.includes(id)) : [...new Set([...selectedIds, ...visibleIds])]);
  }

  function bulkSetStatus(status) {
    if (!selectedIds.length) return;
    persist(notifications.map((item) => selectedIds.includes(item.id) ? { ...item, status } : item));
    setSelectedIds([]);
  }

  function bulkDelete() {
    if (!selectedIds.length) return;
    persist(notifications.filter((item) => !selectedIds.includes(item.id)));
    setSelectedIds([]);
  }

  function applyTemplate(template) {
    setDraft((current) => ({
      ...current,
      title: template.title,
      description: template.description,
      tag: template.tag,
      status: 'Active'
    }));
  }

  function downloadAttachment(item) {
    if (!item.attachmentName) return;
    const link = document.createElement('a');
    link.href = item.attachmentUrl || `data:text/plain;charset=utf-8,${encodeURIComponent(item.title)}`;
    link.download = item.attachmentName;
    link.click();
  }

  function previewAttachment(item) {
    if (!item?.attachmentName) return;
    const href = item.attachmentUrl || `data:text/plain;charset=utf-8,${encodeURIComponent(item.description || item.title || item.attachmentName)}`;
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  function handleAttachment(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setDraft((current) => ({
      ...current,
      attachmentName: file.name,
      attachmentUrl: URL.createObjectURL(file)
    }));
  }

  return (
    <DashboardShell currentUser={currentUser}>
      <main ref={pageRef} className="notifications-page">
        <section className="notifications-hero">
          <div>
            <span className="notifications-kicker"><Bell className="h-4 w-4" /> Notification Center</span>
            <h1>Announcements that stay organized.</h1>
          </div>
          <div className="notifications-hero-actions">
            <button type="button" onClick={openCreate}><Plus className="h-4 w-4" /> Add Notification</button>
            <button type="button" onClick={() => setStatusFilter((value) => value === 'Inactive' ? 'Active' : 'Inactive')}><Archive className="h-4 w-4" /> {statusFilter === 'Inactive' ? 'Show Active' : 'Show Inactive'}</button>
          </div>
        </section>

        <div className="mt-4 grid gap-4">
        <section className="notifications-panel">
          <div className="notifications-panel-head">
            <div className="notifications-panel-titlebar">
              <div>
                <strong>Notification Library</strong>
                <span>{serverLoading ? 'Syncing...' : `${filteredNotifications.length} record${filteredNotifications.length === 1 ? '' : 's'} found`}</span>
              </div>
              <div className="notifications-status-tabs" aria-label="Notification status filters">
                {['Active', 'Inactive', ''].map((status) => (
                  <button
                    type="button"
                    key={status || 'all'}
                    className={statusFilter === status ? 'active' : ''}
                    onClick={() => setStatusFilter(status)}
                  >
                    {status || 'All'}
                    <i>{status ? notifications.filter((item) => item.status === status).length : notifications.length}</i>
                  </button>
                ))}
              </div>
            </div>
            <div className="notifications-filter-row">
              <label>
                <Search className="h-4 w-4" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, tag, creator..." />
              </label>
              <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
                <option value="">All Tags</option>
                {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
              </select>
              <button type="button" className={density === 'compact' ? 'notifications-density active' : 'notifications-density'} onClick={() => setDensity((value) => value === 'compact' ? 'comfortable' : 'compact')} title="Toggle density">
                {density === 'compact' ? <LayoutGrid className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="notifications-bulkbar">
            <button type="button" onClick={toggleSelectAllVisible}>
              <span className={filteredNotifications.length && filteredNotifications.every((item) => selectedIds.includes(item.id)) ? 'checked' : ''} />
              Select visible
            </button>
            <strong>{selectedIds.length} selected</strong>
            <div>
              <button type="button" disabled={!selectedIds.length} onClick={() => bulkSetStatus('Active')}>Mark Active</button>
              <button type="button" disabled={!selectedIds.length} onClick={() => bulkSetStatus('Inactive')}>Archive</button>
              <button type="button" disabled={!selectedIds.length} onClick={bulkDelete}>Delete</button>
            </div>
          </div>

          <div className={`notifications-list notifications-list-${density}`}>
            {filteredNotifications.length ? filteredNotifications.map((item) => (
              <article key={item.id} className={`notification-card notification-card-${tagClass(item.tag)} ${item.status === 'Inactive' ? 'notification-card-muted' : ''}`}>
                <button type="button" className={`notification-select ${selectedIds.includes(item.id) ? 'selected' : ''}`} onClick={() => toggleSelect(item.id)} aria-label="Select notification" />
                <div className="notification-card-icon">{item.pinned ? <Pin className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</div>
                <div className="notification-card-main">
                  <div className="notification-card-title">
                    <h2>{item.title}</h2>
                    {item.attachmentName && <FileText className="h-4 w-4" />}
                  </div>
                  <p>{item.description}</p>
                  <div className="notification-card-meta">
                    <em className={`notification-tag notification-tag-${tagClass(item.tag)}`}>{item.tag || 'General'}</em>
                    <span>By {item.createdBy || 'User'}</span>
                    <span>{formatDate(item.createdAt)}</span>
                    <i className={item.status === 'Active' ? 'active' : 'inactive'}>{item.status}</i>
                  </div>
                </div>
                <div className="notification-card-actions">
                  <button type="button" onClick={() => togglePin(item.id)}>{item.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />} {item.pinned ? 'Unpin' : 'Pin'}</button>
                  <button type="button" onClick={() => setSelected(item)}><Eye className="h-4 w-4" /> View</button>
                  <button type="button" disabled={!item.attachmentName} onClick={() => downloadAttachment(item)}><Download className="h-4 w-4" /> Download</button>
                  <button type="button" onClick={() => openEdit(item)}><Edit3 className="h-4 w-4" /> Edit</button>
                  <button type="button" onClick={() => deleteNotification(item.id)}><Trash2 className="h-4 w-4" /> Delete</button>
                </div>
              </article>
            )) : (
              <div className="notifications-empty">
                <Filter className="h-12 w-12" />
                <strong>No notifications found</strong>
                <span>Adjust filters or add a new notification.</span>
              </div>
            )}
          </div>
        </section>

        </div>

        {modalMode && (
          <div className="notifications-modal-backdrop" onClick={() => setModalMode('')}>
            <section className="notifications-modal" onClick={(event) => event.stopPropagation()}>
              <div className="notifications-modal-head">
                <div>
                  <span>{modalMode === 'edit' ? 'Update Notification' : 'Create Notification'}</span>
                  <strong>{modalMode === 'edit' ? 'Edit details' : 'New announcement'}</strong>
                </div>
                <button type="button" onClick={() => setModalMode('')}><X className="h-5 w-5" /></button>
              </div>

              <div className="notifications-form">
                <div className="notifications-template-row">
                  <span>Smart templates</span>
                  <div>
                    {templates.map((template) => (
                      <button type="button" key={template.label} onClick={() => applyTemplate(template)}>{template.label}</button>
                    ))}
                  </div>
                </div>
                <Field label="Title" required>
                  <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Enter notification title" />
                </Field>
                <Field label="Description" required>
                  <textarea maxLength={2000} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Write notification description" />
                  <small>{draft.description.length} / 2000</small>
                </Field>
                <div className="notifications-form-grid">
                  <Field label="Tag" required>
                    <select value={draft.tag} onChange={(event) => setDraft((current) => ({ ...current, tag: event.target.value }))}>
                      <option value="">Select tag</option>
                      {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                    </select>
                  </Field>
                  <Field label="Status">
                    <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}>
                      {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </Field>
                </div>
                <label className="notifications-pin-toggle">
                  <input type="checkbox" checked={Boolean(draft.pinned)} onChange={(event) => setDraft((current) => ({ ...current, pinned: event.target.checked }))} />
                  <span><Pin className="h-4 w-4" /> Pin this notification on top</span>
                </label>
                <Field label="Attachment">
                  <label className="notifications-upload">
                    <Upload className="h-4 w-4" />
                    <span>Choose File</span>
                    <input type="file" onChange={handleAttachment} />
                  </label>
                  {draft.attachmentName && (
                    <div className="notifications-file-chip">
                      <FileText className="h-5 w-5" />
                      <span>{draft.attachmentName}</span>
                      <button type="button" onClick={() => setDraft((current) => ({ ...current, attachmentName: '', attachmentUrl: '' }))}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  )}
                  <small>Upload image, PDF, or document up to 10MB.</small>
                </Field>
              </div>

              <div className="notifications-modal-actions">
                <button type="button" onClick={() => setModalMode('')}>Cancel</button>
                <button type="button" disabled={!draft.title.trim() || !draft.description.trim() || !draft.tag} onClick={saveNotification}>Save Notification</button>
              </div>
            </section>
          </div>
        )}

        {selected && (
          <div className="notifications-modal-backdrop" onClick={() => setSelected(null)}>
            <section className="notifications-detail-modal" onClick={(event) => event.stopPropagation()}>
              <div className="notifications-modal-head">
                <div>
                  <span>Notification Details</span>
                  <strong>{selected.title}</strong>
                </div>
                <button type="button" onClick={() => setSelected(null)}><X className="h-5 w-5" /></button>
              </div>
              <em className={`notification-tag notification-tag-${tagClass(selected.tag)}`}>{selected.tag}</em>
              <p>{selected.description}</p>
              {selected.attachmentName && (
                <div className="notifications-detail-file">
                  <FileText className="h-5 w-5" />
                  <button type="button" className="notifications-file-preview" onClick={() => previewAttachment(selected)} title="View attachment">
                    {selected.attachmentName}
                  </button>
                  <button type="button" onClick={() => downloadAttachment(selected)}><Download className="h-4 w-4" /> Download</button>
                </div>
              )}
              <div className="notifications-detail-footer">
                <span>Created by <b>{selected.createdBy || 'User'}</b></span>
                <span>{formatDate(selected.createdAt)}</span>
              </div>
            </section>
          </div>
        )}
      </main>
    </DashboardShell>
  );
}

function Field({ label, required = false, children }) {
  return (
    <label className="notifications-field">
      <span>{required && <i>*</i>} {label}</span>
      {children}
    </label>
  );
}
