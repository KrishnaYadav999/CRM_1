import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FileCheck2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import DashboardShell from '../components/dashboard/DashboardShell'
import api, { readApiError, storeSessionUser } from '../services/api'
import { API_ENDPOINTS } from '../services/apiEndpoints'

const blankLead = { referredBy: '', salutation: '', contactPerson: '', designation: '', mobileNo1: '', mobileNo2: '', companyName: '', addressLine1: '', addressLine2: '', addressLine3: '', state: '', city: '', pinCode: '', gstNumber: '' }
const blankItem = { serviceCategory: '', servicesForYear: '', eprCategory: '', piboParent: '', piboCategory: '', unit: '1', basicAmount: '' }
const blankForm = { quotationId: '', quotationNumber: '', poNumber: '', leadId: '', leadCode: '', leadDetails: { ...blankLead }, invoiceDate: new Date().toISOString().slice(0, 10), validUntil: '', items: [{ ...blankItem }], terms: [''], status: 'issued' }
const leadFields = [['referredBy', 'Referred By'], ['salutation', 'Salutation'], ['contactPerson', 'Contact Person'], ['designation', 'Designation'], ['mobileNo1', 'Mobile No. 1'], ['mobileNo2', 'Mobile No. 2'], ['companyName', 'Company Name'], ['addressLine1', 'Address Line 1'], ['addressLine2', 'Address Line 2'], ['addressLine3', 'Address Line 3'], ['state', 'State'], ['city', 'City'], ['pinCode', 'Pincode'], ['gstNumber', 'GST Number']]

function amount(items = []) { return items.reduce((sum, item) => sum + ((Number(item.unit) || 1) * (Number(item.basicAmount) || 0)), 0) }
function money(value) { return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` }

export default function ProformaInvoices() {
  const navigate = useNavigate()
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('user') || '{}') } catch { return {} } })
  const [quotations, setQuotations] = useState([])
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(blankForm)
  const [editingId, setEditingId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const total = useMemo(() => amount(form.items), [form.items])

  async function load() {
    setLoading(true); setError('')
    try {
      const [me, quotes, invoices] = await Promise.all([
        api.get(API_ENDPOINTS.auth.me), api.get(API_ENDPOINTS.quotations.list), api.get(API_ENDPOINTS.proformaInvoices.list)
      ])
      setUser(storeSessionUser(me.data.user || user)); setQuotations(quotes.data.quotations || []); setRows(invoices.data.proformaInvoices || [])
    } catch (err) { setError(readApiError(err, 'Unable to load Proforma Invoices.')) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function selectQuotation(id) {
    const quote = quotations.find((row) => String(row._id || row.id) === String(id))
    if (!quote) { setForm({ ...blankForm, leadDetails: { ...blankLead }, items: [{ ...blankItem }], terms: [''] }); return }
    setForm({
      quotationId: quote._id || quote.id, quotationNumber: quote.quotationNumber || '', poNumber: '',
      leadId: quote.leadId || '', leadCode: quote.leadCode || '', leadDetails: { ...blankLead, ...(quote.leadDetails || {}) },
      invoiceDate: new Date().toISOString().slice(0, 10), validUntil: quote.validUntil || '',
      items: (quote.items || []).length ? quote.items.map((item) => ({ ...blankItem, ...item })) : [{ ...blankItem }],
      terms: (quote.terms || []).length ? [...quote.terms] : [''], status: 'issued'
    }); setEditingId(''); setNotice('Quotation details auto-fetched. Add PO Number and verify before saving.'); setError('')
  }
  function setLead(key, value) { setForm((current) => ({ ...current, leadDetails: { ...current.leadDetails, [key]: value } })) }
  function setItem(index, key, value) { setForm((current) => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, [key]: value } : item) })) }
  function edit(row) { setEditingId(row._id); setForm({ ...blankForm, ...row, invoiceDate: String(row.invoiceDate || '').slice(0, 10), leadDetails: { ...blankLead, ...(row.leadDetails || {}) }, items: row.items?.length ? row.items : [{ ...blankItem }], terms: row.terms?.length ? row.terms : [''] }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  async function save() {
    if (!form.quotationNumber.trim() || !form.poNumber.trim() || !form.leadDetails.companyName.trim()) { setError('Quotation Number, PO Number and Company Name are required.'); return }
    if (!form.items.length || form.items.some((item) => !item.serviceCategory || !Number(item.basicAmount))) { setError('Every item requires Service Category and Basic Amount.'); return }
    setSaving(true); setError(''); setNotice('')
    try {
      const payload = { ...form, companyName: form.leadDetails.companyName, subtotal: total, grandTotal: total }
      const response = editingId ? await api.put(API_ENDPOINTS.proformaInvoices.detail(editingId), payload) : await api.post(API_ENDPOINTS.proformaInvoices.create, payload)
      setNotice(`${response.data.proformaInvoice?.proformaNumber || 'Proforma Invoice'} saved successfully.`)
      setForm({ ...blankForm, leadDetails: { ...blankLead }, items: [{ ...blankItem }], terms: [''] }); setEditingId(''); await load()
    } catch (err) { setError(readApiError(err, 'Unable to save Proforma Invoice.')) }
    finally { setSaving(false) }
  }

  return <DashboardShell currentUser={user}><div className="min-h-screen bg-gradient-to-br from-[#effaf7] via-white to-[#fff7ef] px-4 py-6 sm:px-7"><div className="mx-auto max-w-[1540px]">
    <header className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-4"><button onClick={() => navigate('/dashboard')} className="grid h-11 w-11 place-items-center rounded-xl border border-emerald-100 bg-white text-orange-600 shadow-sm"><ArrowLeft /></button><div><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">Sales & Billing</p><h1 className="text-3xl font-black text-slate-950">Proforma Invoice</h1><p className="text-sm font-semibold text-slate-500">Create manually or auto-fetch every field from an approved quotation.</p></div></div><button onClick={load} className="inline-flex h-11 items-center gap-2 rounded-xl border bg-white px-4 font-black text-emerald-700"><RefreshCw className="h-4 w-4" /> Refresh</button></header>
    {(error || notice) && <div className={`mt-5 rounded-2xl border px-5 py-4 font-bold ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || notice}</div>}

    <section className="mt-6 overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-[0_20px_60px_rgba(15,93,70,.09)]"><div className="border-b bg-gradient-to-r from-emerald-50 to-orange-50 p-5"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-700 text-white"><FileCheck2 /></span><div><h2 className="text-xl font-black">{editingId ? 'Edit Proforma Invoice' : 'Create Proforma Invoice'}</h2><p className="text-sm font-semibold text-slate-500">Select a quotation for instant auto-fetch, or enter a new invoice manually.</p></div></div></div>
      <div className="p-5"><div className="grid gap-4 lg:grid-cols-4"><label className="lg:col-span-2"><span className="mb-2 block text-sm font-black">Select Quotation</span><select value={form.quotationId || ''} onChange={(event) => selectQuotation(event.target.value)} className="h-12 w-full rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 font-bold outline-none"><option value="">New / Manual Proforma Invoice</option>{quotations.map((quote) => <option key={quote._id || quote.id} value={quote._id || quote.id}>{quote.quotationNumber} · {quote.leadDetails?.companyName || quote.companyName}</option>)}</select></label><label><span className="mb-2 block text-sm font-black">Quotation Number *</span><input value={form.quotationNumber} readOnly={Boolean(form.quotationId)} onChange={(e) => setForm((c) => ({ ...c, quotationNumber: e.target.value }))} className="h-12 w-full rounded-xl border px-4 font-black read-only:bg-slate-100" placeholder="AT/26-27/001" /></label><label><span className="mb-2 block text-sm font-black">PO Number *</span><input value={form.poNumber} onChange={(e) => setForm((c) => ({ ...c, poNumber: e.target.value }))} className="h-12 w-full rounded-xl border border-orange-200 bg-orange-50/40 px-4 font-black outline-none" placeholder="Enter PO number" /></label><label><span className="mb-2 block text-sm font-black">Invoice Date</span><input type="date" value={form.invoiceDate} onChange={(e) => setForm((c) => ({ ...c, invoiceDate: e.target.value }))} className="h-12 w-full rounded-xl border px-4 font-bold" /></label><label><span className="mb-2 block text-sm font-black">Valid Until</span><input type="date" value={form.validUntil} onChange={(e) => setForm((c) => ({ ...c, validUntil: e.target.value }))} className="h-12 w-full rounded-xl border px-4 font-bold" /></label></div>
      <h3 className="mb-3 mt-7 text-lg font-black">Client & Quotation Details</h3><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{leadFields.map(([key, label]) => <label key={key}><span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">{label}</span><input value={form.leadDetails[key] || ''} onChange={(e) => setLead(key, e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 font-bold outline-none focus:border-emerald-400" placeholder={`Enter ${label.toLowerCase()}`} /></label>)}</div>
      <div className="mb-3 mt-7 flex items-center justify-between"><h3 className="text-lg font-black">Invoice Items</h3><button onClick={() => setForm((c) => ({ ...c, items: [...c.items, { ...blankItem }] }))} className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 font-black text-emerald-700"><Plus className="h-4 w-4" /> Add Item</button></div><div className="overflow-x-auto rounded-2xl border"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-emerald-800 text-white"><tr>{['Service Category', 'Services Year', 'EPR Category', 'Applicant Type', 'PIBO Category', 'Qty / Unit', 'Basic Amount', ''].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{form.items.map((item, index) => <tr key={index} className="border-b"><td className="p-2"><input value={item.serviceCategory} onChange={(e) => setItem(index, 'serviceCategory', e.target.value)} className="h-10 w-full rounded-lg border px-2 font-bold" /></td><td className="p-2"><input value={item.servicesForYear} onChange={(e) => setItem(index, 'servicesForYear', e.target.value)} className="h-10 w-full rounded-lg border px-2" /></td><td className="p-2"><input value={item.eprCategory} onChange={(e) => setItem(index, 'eprCategory', e.target.value)} className="h-10 w-full rounded-lg border px-2" /></td><td className="p-2"><input value={item.piboParent} onChange={(e) => setItem(index, 'piboParent', e.target.value)} className="h-10 w-full rounded-lg border px-2" /></td><td className="p-2"><input value={item.piboCategory} onChange={(e) => setItem(index, 'piboCategory', e.target.value)} className="h-10 w-full rounded-lg border px-2" /></td><td className="p-2"><input value={item.unit} onChange={(e) => setItem(index, 'unit', e.target.value)} className="h-10 w-24 rounded-lg border px-2" /></td><td className="p-2"><input type="number" value={item.basicAmount} onChange={(e) => setItem(index, 'basicAmount', e.target.value)} className="h-10 w-36 rounded-lg border px-2 font-black" /></td><td className="p-2"><button disabled={form.items.length === 1} onClick={() => setForm((c) => ({ ...c, items: c.items.filter((_, i) => i !== index) }))} className="grid h-9 w-9 place-items-center rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]"><label><span className="mb-2 block text-sm font-black">Terms & Conditions</span><textarea value={form.terms.join('\n')} onChange={(e) => setForm((c) => ({ ...c, terms: e.target.value.split(/\r?\n/) }))} rows={6} className="w-full rounded-2xl border p-4 font-semibold outline-none" placeholder="One term per line" /></label><div className="rounded-2xl bg-gradient-to-br from-emerald-800 to-teal-700 p-5 text-white"><span className="text-xs font-black uppercase tracking-wider text-emerald-200">Grand Total</span><strong className="mt-2 block text-3xl">{money(total)}</strong><p className="mt-2 text-sm text-emerald-100">Calculated automatically from quantity × basic amount.</p><button disabled={saving} onClick={save} className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 font-black shadow-lg transition hover:bg-orange-400 disabled:opacity-50"><Save className="h-5 w-5" /> {saving ? 'Saving…' : editingId ? 'Update Invoice' : 'Save Proforma Invoice'}</button></div></div></div>
    </section>

    <section className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><header className="flex items-center justify-between border-b p-5"><div><h2 className="text-xl font-black">Saved Proforma Invoices</h2><p className="text-sm font-semibold text-slate-500">{rows.length} records stored in CRM database</p></div></header><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr>{['Proforma No.', 'Quotation No.', 'PO Number', 'Company', 'Date', 'Amount', 'Status', 'Action'].map((h) => <th key={h} className="p-4">{h}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row._id} className="border-b"><td className="p-4 font-black text-emerald-700">{row.proformaNumber}</td><td className="p-4 font-bold">{row.quotationNumber}</td><td className="p-4 font-bold">{row.poNumber}</td><td className="p-4 font-black">{row.companyName}</td><td className="p-4">{String(row.invoiceDate || '').slice(0, 10)}</td><td className="p-4 font-black">{money(row.grandTotal)}</td><td className="p-4"><span className="rounded-full bg-emerald-50 px-3 py-1 font-black text-emerald-700">{row.status}</span></td><td className="p-4"><button onClick={() => edit(row)} className="rounded-lg border px-3 py-2 font-black text-orange-600">Edit</button></td></tr>)}{!rows.length && <tr><td colSpan="8" className="p-12 text-center font-bold text-slate-400">{loading ? 'Loading…' : 'No Proforma Invoices created yet.'}</td></tr>}</tbody></table></div></section>
  </div></div></DashboardShell>
}
