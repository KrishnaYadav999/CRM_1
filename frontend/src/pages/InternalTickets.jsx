import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Bell, CheckCircle2, ChevronDown, Circle, FileText, Folder, Loader2, MessageSquareText, MoreHorizontal, Paperclip, Plus, Search, Send, Settings, ShieldCheck, Smile, Users, X } from 'lucide-react'
import DashboardShell from '../components/dashboard/DashboardShell'
import api from '../services/api'
import { API_ENDPOINTS } from '../services/apiEndpoints'
import { uploadMediaBatch } from '../services/mediaUpload'

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed']
const emptyDraft = { subject: '', priority: 'Medium', participants: [], message: '', attachments: [] }
const stamp = (value) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'
const initials = (value) => String(value || 'CRM User').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

function AttachmentList({ items = [] }) {
  if (!items.length) return null
  return <div className="teams-attachments">{items.map((file, index) => {
    const image = String(file.type || '').startsWith('image/')
    return <a key={`${file.url}-${index}`} href={file.url} target="_blank" rel="noreferrer" className="teams-attachment">
      {image ? <img src={file.url} alt={file.name || 'Attachment'} /> : <span><FileText /></span>}
      <div><strong>{file.name || 'Attachment'}</strong><small>{file.size ? `${Math.ceil(file.size / 1024)} KB` : 'Open attachment'}</small></div>
    </a>
  })}</div>
}

function StatusBadge({ status }) {
  return <span className={`teams-status teams-status-${String(status).toLowerCase().replace(/\s+/g, '-')}`}><i />{status}</span>
}

function ConversationRow({ ticket, active, onSelect }) {
  const owner = ticket.createdBy?.name || 'CRM User'
  const last = ticket.messages?.[ticket.messages.length - 1]
  return <button type="button" onClick={onSelect} className={`teams-conversation-row ${active ? 'is-active' : ''}`}>
    <span className="teams-avatar">{initials(owner)}<i /></span>
    <span className="teams-conversation-copy"><span><strong>{ticket.subject}</strong><time>{stamp(ticket.lastMessageAt)}</time></span><small>{last?.authorName || owner}: {last?.message || (last?.attachments?.length ? 'Shared an attachment' : ticket.ticketNumber)}</small><span className="teams-row-meta"><b>{ticket.ticketNumber}</b><StatusBadge status={ticket.status} /></span></span>
  </button>
}

function EmptyConversation() {
  return <div className="teams-empty"><span><MessageSquareText /></span><h2>Select a ticket conversation</h2><p>Choose a conversation from the left to start collaborating with your team.</p></div>
}

export default function InternalTickets() {
  const currentUser = JSON.parse(localStorage.getItem('user') || 'null')
  const isAdmin = ['admin', 'superadmin'].includes(String(currentUser?.role || '').toLowerCase())
  const [tickets, setTickets] = useState([])
  const [users, setUsers] = useState([])
  const [selected, setSelected] = useState(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [reply, setReply] = useState('')
  const [replyFiles, setReplyFiles] = useState([])
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [scope, setScope] = useState('mine')
  const [statusView, setStatusView] = useState('Open')
  const messageEndRef = useRef(null)

  async function load(nextScope = scope) {
    setLoading(true)
    try {
      const [ticketRes, userRes] = await Promise.all([api.get(API_ENDPOINTS.internalTickets.list, { params: nextScope === 'all' ? { scope: 'all' } : {} }), api.get(API_ENDPOINTS.auth.users)])
      const nextTickets = ticketRes.data.tickets || []
      setTickets(nextTickets)
      setUsers((userRes.data.users || []).filter((user) => String(user._id || user.id) !== String(currentUser?._id || currentUser?.id)))
      setSelected((active) => active ? nextTickets.find((item) => item._id === active._id) || null : null)
    } catch (err) { setError(err?.response?.data?.error || 'Unable to load internal tickets.') }
    finally { setLoading(false) }
  }

  useEffect(() => { load(scope) }, [scope])
  useEffect(() => { messageEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [selected?.messages?.length])

  const counts = useMemo(() => Object.fromEntries(STATUSES.map((status) => [status, tickets.filter((ticket) => ticket.status === status).length])), [tickets])
  const visible = useMemo(() => tickets.filter((ticket) => {
    const haystack = [ticket.ticketNumber, ticket.subject, ticket.createdBy?.name, ...(ticket.participants || []).map((user) => user.name)].join(' ').toLowerCase()
    return ticket.status === statusView && haystack.includes(search.trim().toLowerCase())
  }), [tickets, search, statusView])

  async function upload(event, target) {
    const files = Array.from(event.target.files || []); event.target.value = ''
    if (!files.length) return
    setUploading(true)
    try {
      const uploaded = await uploadMediaBatch(files.slice(0, 8), 'crm/internal-tickets')
      target === 'draft' ? setDraft((current) => ({ ...current, attachments: [...current.attachments, ...uploaded] })) : setReplyFiles((current) => [...current, ...uploaded])
    } catch (err) { setError(err.message || 'Attachment upload failed.') }
    finally { setUploading(false) }
  }

  async function create(event) {
    event.preventDefault()
    if (!draft.participants.length) return setError('Select at least one participant for this private conversation.')
    setSaving(true)
    try {
      const { data } = await api.post(API_ENDPOINTS.internalTickets.create, draft)
      setScope('mine'); setStatusView('Open'); setTickets((current) => [data.ticket, ...current]); setSelected(data.ticket); setDraft(emptyDraft); setCreating(false)
    } catch (err) { setError(err?.response?.data?.error || 'Unable to create internal ticket.') }
    finally { setSaving(false) }
  }

  async function update(payload) {
    if (!selected) return
    setSaving(true)
    try {
      const { data } = await api.put(API_ENDPOINTS.internalTickets.detail(selected._id), payload)
      setTickets((current) => current.map((item) => item._id === data.ticket._id ? data.ticket : item)); setSelected(data.ticket); setReply(''); setReplyFiles([])
      if (payload.status) setStatusView(payload.status)
    } catch (err) { setError(err?.response?.data?.error || 'Unable to update internal ticket.') }
    finally { setSaving(false) }
  }

  function sendReply() { if (reply.trim() || replyFiles.length) update({ message: reply, attachments: replyFiles }) }
  function onComposerKeyDown(event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendReply() } }

  return <DashboardShell currentUser={currentUser}>
    <div className="teams-page" aria-label="Internal Tickets & Team Chat">
      <header className="teams-topbar"><div className="teams-product"><span><Users /></span><strong>Internal Teams</strong></div><div className="teams-global-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tickets, messages and people" /></div><div className="teams-profile"><Bell /><span className="teams-avatar">{initials(currentUser?.name)}</span><div><strong>{currentUser?.name || 'CRM User'}</strong><small>Available</small></div><ChevronDown /></div></header>
      {error && <div className="teams-error">{error}<button onClick={() => setError('')}><X /></button></div>}
      <section className="teams-shell">
        <nav className="teams-app-rail" aria-label="Internal collaboration navigation"><button title="Activity"><Activity /><span>Activity</span></button><button className="is-active" title="Chat"><MessageSquareText /><span>Chat</span></button><button title="Files"><Folder /><span>Files</span></button><button title="Settings"><Settings /><span>Settings</span></button></nav>
        <aside className="teams-sidebar">
          <div className="teams-sidebar-title"><div><small>Workspace</small><h2>Internal Tickets</h2></div><button onClick={() => setCreating(true)} title="New internal ticket"><Plus /></button></div>
          <div className="teams-scope-tabs"><button className={scope === 'mine' ? 'is-active' : ''} onClick={() => setScope('mine')}>My chats</button>{isAdmin && <button className={scope === 'all' ? 'is-active' : ''} onClick={() => setScope('all')}><ShieldCheck /> Oversight</button>}</div>
          <div className="teams-quick-title">Quick views</div><div className="teams-status-list">{STATUSES.map((status) => <button key={status} className={statusView === status ? 'is-active' : ''} onClick={() => { setStatusView(status); setSelected(null) }}>{status === 'Resolved' || status === 'Closed' ? <CheckCircle2 /> : <Circle />}<span>{status}</span><b>{counts[status] || 0}</b></button>)}</div>
          <div className="teams-chat-heading"><span>Ticket chats</span><button onClick={() => load()} title="Refresh"><MoreHorizontal /></button></div>
          <div className="teams-conversation-list">{loading ? <div className="teams-loading"><Loader2 /></div> : visible.length ? visible.map((ticket) => <ConversationRow key={ticket._id} ticket={ticket} active={selected?._id === ticket._id} onSelect={() => setSelected(ticket)} />) : <div className="teams-list-empty">No {statusView.toLowerCase()} tickets found.</div>}</div>
        </aside>
        <main className="teams-workspace">{!selected ? <EmptyConversation /> : <>
          <header className="teams-chat-header"><span className="teams-avatar teams-avatar-lg">{initials(selected.subject)}<i /></span><div className="teams-chat-identity"><small>{selected.ticketNumber}</small><h2>{selected.subject}</h2><p><Users />{[selected.createdBy, ...(selected.participants || [])].map((user) => user?.name).filter(Boolean).join(', ')}</p></div><div className="teams-chat-actions"><StatusBadge status={selected.status} /><select aria-label="Ticket status" value={selected.status} onChange={(event) => update({ status: event.target.value })}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select><button title="More options"><MoreHorizontal /></button></div></header>
          <div className="teams-chat-tabs"><button className="is-active">Chat</button><button>Shared</button><button>Details</button></div>
          <div className="teams-messages"><div className="teams-date-divider"><span>Ticket conversation</span></div>{(selected.messages || []).map((message, index) => { const mine = String(message.author) === String(currentUser?._id || currentUser?.id); return <article key={message._id || index} className={`teams-message ${mine ? 'is-mine' : ''}`}>{!mine && <span className="teams-avatar">{initials(message.authorName)}</span>}<div className="teams-message-content"><header><strong>{message.authorName || 'CRM User'}</strong><time>{stamp(message.createdAt)}</time></header><div className="teams-message-bubble">{message.message && <p>{message.message}</p>}<AttachmentList items={message.attachments} /></div></div></article> })}<div ref={messageEndRef} /></div>
          <footer className="teams-composer"><AttachmentList items={replyFiles} /><div className="teams-compose-box"><textarea value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={onComposerKeyDown} rows="2" placeholder={`Message ${selected.ticketNumber}`} /><div className="teams-compose-actions"><div><button title="Emoji"><Smile /></button><label title="Attach files"><input type="file" multiple onChange={(event) => upload(event, 'reply')} /><Paperclip /></label></div><button className="teams-send" disabled={saving || uploading || (!reply.trim() && !replyFiles.length)} onClick={sendReply}>{saving ? <Loader2 className="animate-spin" /> : <Send />}</button></div></div><small>Press Enter to send · Shift + Enter for a new line</small></footer>
        </>}</main>
      </section>
    </div>
    {creating && <div className="teams-modal-backdrop"><form onSubmit={create} className="teams-create-modal"><header><div><small>Internal collaboration</small><h2>New ticket chat</h2><p>Create a private workspace with selected participants.</p></div><button type="button" onClick={() => setCreating(false)}><X /></button></header><div className="teams-create-body"><label><span>Subject</span><input required value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} placeholder="What does your team need to discuss?" /></label><label><span>Priority</span><select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}><option>Low</option><option>Medium</option><option>High</option><option>Urgent</option></select></label><fieldset><legend>Select participants</legend><div>{users.map((user) => { const id = String(user._id || user.id); return <label key={id}><input type="checkbox" checked={draft.participants.includes(id)} onChange={(event) => setDraft((current) => ({ ...current, participants: event.target.checked ? [...current.participants, id] : current.participants.filter((value) => value !== id) }))} /><span className="teams-avatar">{initials(user.name || user.email)}</span><span>{user.name || user.email}</span></label> })}</div></fieldset><label><span>First message</span><textarea value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} rows="4" placeholder="Start the conversation..." /></label><label className="teams-upload"><input type="file" multiple onChange={(event) => upload(event, 'draft')} /><Paperclip />Attach files or images</label><AttachmentList items={draft.attachments} /></div><footer><button type="button" onClick={() => setCreating(false)}>Cancel</button><button disabled={saving || uploading}>{saving ? 'Creating...' : 'Create ticket chat'}</button></footer></form></div>}
  </DashboardShell>
}
