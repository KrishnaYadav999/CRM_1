import React, { useState } from 'react'
import { Plus, ShieldCheck, X } from 'lucide-react'

export default function RoleSelectManager({ value, roles, onChange, onAddRole, saving, canAddRole }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)

  async function saveRole() {
    const label = name.trim()
    if (label.length < 2) return setError('Enter a role name with at least 2 characters.')
    setAdding(true)
    setError('')
    try {
      const role = await onAddRole(label)
      onChange(role.name)
      setName('')
      setOpen(false)
    } catch (err) {
      setError(err?.response?.data?.error || 'Unable to add role. Please try again.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <select value={value} onChange={(event) => onChange(event.target.value)} className="form-input">
          {roles.map((role) => <option key={role.name} value={role.name}>{role.label}</option>)}
        </select>
        {canAddRole && <button type="button" onClick={() => setOpen(true)} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 px-4 text-sm font-black text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60">
          <Plus className="h-4 w-4" /> Add Role
        </button>}
      </div>

      {open && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/60 px-4" role="dialog" aria-modal="true" aria-labelledby="add-role-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><ShieldCheck className="h-6 w-6" /></span>
                <div><h3 id="add-role-title" className="text-xl font-black text-slate-950">Add New Role</h3><p className="mt-1 text-sm font-semibold text-slate-500">This role will be available for every user.</p></div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close add role"><X className="h-5 w-5" /></button>
            </div>
            <label className="mt-6 block text-sm font-black text-slate-700">Role Name</label>
            <input autoFocus maxLength={50} value={name} onChange={(event) => { setName(event.target.value); setError('') }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveRole() } }} placeholder="For example: HR Manager" className="form-input mt-2" />
            {error && <p className="mt-2 text-sm font-bold text-red-600">{error}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setOpen(false)} disabled={adding} className="min-h-11 rounded-lg border border-slate-200 px-5 font-black text-slate-700">Cancel</button>
              <button type="button" onClick={saveRole} disabled={adding} className="min-h-11 rounded-lg bg-emerald-700 px-6 font-black text-white shadow-lg shadow-emerald-700/20 disabled:opacity-60">{adding ? 'Adding...' : 'Add Role'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
