import React, { useMemo, useState } from 'react'
import { Crown, ShieldCheck, Users, X } from 'lucide-react'
import ToastMessage from '../ToastMessage'

export default function CreateTeamModal({ users, saving, error, onClose, onSubmit }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    members: [],
    manager: '',
    operationHead: ''
  })

  const activeUsers = useMemo(() => users.filter((user) => user.isActive), [users])
  const managerOptions = activeUsers.filter((user) => ['manager', 'admin', 'superadmin', 'operation'].includes(user.role))
  const headOptions = activeUsers
  const selectedManagerId = String(form.manager || '')
  const memberOptions = useMemo(() => {
    if (!selectedManagerId) return []
    return activeUsers.filter((user) => {
      const id = String(user._id || user.id || '')
      if (id === selectedManagerId) return false
      return String(user.managerId || '') === selectedManagerId
    })
  }, [activeUsers, selectedManagerId])

  function toggleMember(id) {
    setForm((value) => ({
      ...value,
      members: value.members.includes(id)
        ? value.members.filter((memberId) => memberId !== id)
        : [...value.members, id]
    }))
  }

  function submit(event) {
    event.preventDefault()
    onSubmit(form)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 px-4 py-6">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Team Control</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Create New Team</h2>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50" aria-label="Close modal" title="Close">
            <X className="h-6 w-6" />
          </button>
        </div>

        {error && <ToastMessage type="error" className="mt-5">{error}</ToastMessage>}

        <div className="mt-7 grid gap-5 lg:grid-cols-2">
          <Field label="Team Name">
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required className="form-input" placeholder="Enter team name" />
          </Field>
          <Field label="Select Manager">
            <select value={form.manager} onChange={(event) => setForm({ ...form, manager: event.target.value, members: [] })} required className="form-input">
              <option value="">Choose manager</option>
              {managerOptions.map((user) => <UserOption key={user._id || user.id} user={user} />)}
            </select>
          </Field>
          <Field label="Select Operation Head (Optional)">
            <select value={form.operationHead} onChange={(event) => setForm({ ...form, operationHead: event.target.value })} className="form-input">
              <option value="">No operation head</option>
              {headOptions.map((user) => <UserOption key={user._id || user.id} user={user} />)}
            </select>
          </Field>
          <Field label="Description">
            <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="form-input" placeholder="Optional" />
          </Field>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-950">Select Users</p>
              <p className="mt-1 text-xs font-bold text-slate-500">{form.manager ? 'Only users already mapped under this manager are shown.' : 'Choose a manager to view that manager users.'}</p>
            </div>
            <span className="rounded-lg bg-white px-3 py-2 text-sm font-black text-emerald-700 ring-1 ring-emerald-100">{form.members.length} selected</span>
          </div>

          <div className="mt-4 grid max-h-72 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {memberOptions.length ? memberOptions.map((user) => {
              const id = user._id || user.id
              const checked = form.members.includes(id)
              return (
                <label key={id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${checked ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-200'}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleMember(id)} className="h-4 w-4 accent-emerald-700" />
                  <Avatar user={user} />
                  <span className="min-w-0">
                    <span className="block truncate font-black text-slate-950">{user.name || user.email}</span>
                    <span className="block truncate text-xs font-bold text-slate-500">{user.email}</span>
                  </span>
                </label>
              )
            }) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm font-black text-slate-500 sm:col-span-2">
                {form.manager ? 'No active users are mapped under this manager yet.' : 'Select manager first.'}
              </div>
            )}
          </div>
        </section>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Summary icon={Users} label="Members" value={form.members.length || '-'} />
          <Summary icon={Crown} label="Manager" value={nameFor(activeUsers, form.manager)} />
          <Summary icon={ShieldCheck} label="Operation Head" value={nameFor(activeUsers, form.operationHead)} />
        </div>

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="min-h-11 rounded-lg border border-slate-200 px-7 font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-slate-950 px-8 font-black text-white shadow-lg shadow-slate-950/20 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70">
            {saving ? 'Creating...' : 'Create Team'}
          </button>
        </div>
      </form>
    </div>
  )
}

function UserOption({ user }) {
  return <option value={user._id || user.id}>{user.name || user.email} ({user.role})</option>
}

function Avatar({ user }) {
  const label = (user.name || user.email || 'U').slice(0, 1).toUpperCase()
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-emerald-700 to-sky-700 text-sm font-black text-white">
      {user.avatarUrl ? <img src={user.avatarUrl} alt={user.name || user.email} className="h-full w-full object-cover" /> : label}
    </span>
  )
}

function Summary({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <Icon className="h-5 w-5 text-emerald-700" />
      <p className="mt-3 text-xs font-black uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-1 truncate font-black text-slate-950">{value || '-'}</p>
    </div>
  )
}

function nameFor(users, id) {
  const user = users.find((item) => String(item._id || item.id) === String(id))
  return user?.name || user?.email || '-'
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  )
}
