import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronDown, Download, Eye, FileCheck2, Plus, Printer, RefreshCw, Save, Search, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import DashboardShell from '../components/dashboard/DashboardShell'
import api, { readApiError, storeSessionUser } from '../services/api'
import { API_ENDPOINTS } from '../services/apiEndpoints'

const blankLead = { referredBy: '', salutation: '', contactPerson: '', designation: '', mobileNo1: '', mobileNo2: '', companyName: '', addressLine1: '', addressLine2: '', addressLine3: '', state: '', city: '', pinCode: '', gstNumber: '' }
const blankItem = { serviceCategory: '', servicesForYear: '', eprCategory: '', piboParent: '', piboCategory: '', unit: '1', basicAmount: '' }
const blankForm = { quotationId: '', quotationNumber: '', poNumber: '', leadId: '', leadCode: '', leadDetails: { ...blankLead }, invoiceDate: new Date().toISOString().slice(0, 10), validUntil: '', items: [{ ...blankItem }], terms: [''], status: 'issued' }
const leadFields = [['referredBy', 'Referred By'], ['salutation', 'Salutation'], ['contactPerson', 'Contact Person'], ['designation', 'Designation'], ['mobileNo1', 'Mobile No. 1'], ['mobileNo2', 'Mobile No. 2'], ['companyName', 'Company Name'], ['addressLine1', 'Address Line 1'], ['addressLine2', 'Address Line 2'], ['addressLine3', 'Address Line 3'], ['state', 'State'], ['city', 'City'], ['pinCode', 'Pincode'], ['gstNumber', 'GST Number']]

function amount(items = []) { return items.reduce((sum, item) => sum + ((Number(item.unit) || 1) * (Number(item.basicAmount) || 0)), 0) }
function money(value) { return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` }
function displayDate(value) { if (!value) return '-'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB') }

function QuotationPicker({ value, quotations, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = quotations.find((row) => String(row._id || row.id) === String(value))
  const filtered = quotations.filter((row) => `${row.quotationNumber} ${row.leadDetails?.companyName || row.companyName || ''}`.toLowerCase().includes(search.toLowerCase()))
  return <div className="relative"><button type="button" onClick={() => setOpen((current) => !current)} className={`flex h-14 w-full items-center justify-between gap-3 rounded-2xl border bg-white px-4 text-left shadow-sm transition ${open ? 'border-emerald-400 ring-4 ring-emerald-100' : 'border-slate-200 hover:border-emerald-300'}`}><span className="min-w-0"><small className="block text-[10px] font-black uppercase tracking-wider text-emerald-600">{selected ? 'Selected quotation' : 'Create mode'}</small><strong className="block truncate text-sm text-slate-900">{selected ? `${selected.quotationNumber} · ${selected.leadDetails?.companyName || selected.companyName}` : 'New / Manual Proforma Invoice'}</strong></span><ChevronDown className={`h-5 w-5 shrink-0 text-emerald-700 transition ${open ? 'rotate-180' : ''}`} /></button>{open && <><button type="button" aria-label="Close quotation list" onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default" /><div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-[0_20px_55px_rgba(15,93,70,.2)]"><label className="m-3 flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3"><Search className="h-4 w-4 text-emerald-600" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search quotation or company..." className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none" /></label><div className="max-h-80 overflow-y-auto p-2 pt-0"><button type="button" onClick={() => { onChange(''); setOpen(false); setSearch('') }} className="mb-1 flex w-full items-center justify-between rounded-xl px-3 py-3 text-left font-black text-emerald-700 hover:bg-emerald-50"><span>New / Manual Proforma Invoice</span><Plus className="h-4 w-4" /></button>{filtered.map((quote) => <button type="button" key={quote._id || quote.id} onClick={() => { onChange(quote._id || quote.id); setOpen(false); setSearch('') }} className={`mb-1 grid w-full grid-cols-[1fr_auto] gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-emerald-50 ${String(value) === String(quote._id || quote.id) ? 'bg-emerald-50 ring-1 ring-emerald-200' : ''}`}><span className="min-w-0"><strong className="block text-sm text-slate-900">{quote.quotationNumber}</strong><small className="block truncate font-bold text-slate-500">{quote.leadDetails?.companyName || quote.companyName || 'Unnamed company'}</small></span><span className="self-center text-xs font-black text-orange-600">{money(quote.grandTotal)}</span></button>)}{!filtered.length && <p className="p-8 text-center text-sm font-bold text-slate-400">No matching quotation found.</p>}</div></div></>}</div>
}

function downloadProforma(row) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const left = 48; let y = 52
  pdf.setTextColor(249, 115, 22); pdf.setFontSize(20); pdf.setFont('helvetica', 'bold'); pdf.text('ANANT TATTVA PRIVATE LIMITED', left, y)
  pdf.text('PROFORMA INVOICE', 360, y); y += 12; pdf.setDrawColor(15, 23, 42); pdf.setLineWidth(1.2); pdf.line(left, y, 548, y)
  y += 28; pdf.setTextColor(15, 23, 42); pdf.setFontSize(10)
  y += 28; pdf.setFontSize(10); pdf.setFont('helvetica', 'normal')
  ;[[`Proforma No.: ${row.proformaNumber || '-'}`, `Date: ${String(row.invoiceDate || '').slice(0, 10) || '-'}`], [`Quotation No.: ${row.quotationNumber || '-'}`, `PO No.: ${row.poNumber || '-'}`]].forEach(([a, b]) => { pdf.text(a, left, y); pdf.text(b, 340, y); y += 18 })
  y += 10; pdf.setFont('helvetica', 'bold'); pdf.text(`Bill To: ${row.companyName || row.leadDetails?.companyName || '-'}`, left, y); y += 17
  pdf.setFont('helvetica', 'normal'); const address = [row.leadDetails?.addressLine1, row.leadDetails?.addressLine2, row.leadDetails?.addressLine3, row.leadDetails?.city, row.leadDetails?.state, row.leadDetails?.pinCode].filter(Boolean).join(', ')
  pdf.text(pdf.splitTextToSize(address || 'Address not provided', 490), left, y); y += 34
  pdf.setFillColor(249, 115, 22); pdf.rect(left, y, 500, 24, 'F'); pdf.setTextColor(255); pdf.setFont('helvetica', 'bold'); pdf.text('Service', left + 8, y + 16); pdf.text('Year', 285, y + 16); pdf.text('Qty', 360, y + 16); pdf.text('Amount', 440, y + 16); y += 38; pdf.setTextColor(15, 23, 42)
  ;(row.items || []).forEach((item, index) => { if (y > 720) { pdf.addPage(); y = 55 } pdf.setFont('helvetica', 'normal'); pdf.text(pdf.splitTextToSize(`${index + 1}. ${item.serviceCategory || item.piboCategory || 'Service'}`, 210), left + 8, y); pdf.text(item.servicesForYear || '-', 285, y); pdf.text(String(item.unit || '1'), 360, y); pdf.text(money(item.basicAmount).replace('₹', 'INR '), 440, y); y += 32 })
  pdf.setDrawColor(203, 213, 225); pdf.line(left, y, 548, y); y += 24; pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.text(`Grand Total: INR ${Number(row.grandTotal || amount(row.items)).toLocaleString('en-IN')}`, 330, y)
  y += 30; pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.text(pdf.splitTextToSize((row.terms || []).join(' | ') || 'Terms and conditions as per quotation.', 500), left, y)
  pdf.save(`${row.proformaNumber || 'proforma-invoice'}.pdf`)
}

function ProformaDetail({ row, onClose, onEdit }) {
  if (!row) return null
  const details = row.leadDetails || {}
  const address = [details.addressLine1, details.addressLine2, details.addressLine3].filter(Boolean).join(', ')
  return <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6">
    <button type="button" aria-label="Close Proforma Invoice preview" onClick={onClose} className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" />
    <div className="relative flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/40 bg-slate-100 shadow-[0_30px_100px_rgba(15,23,42,.35)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-5 py-4">
        <div><p className="text-[11px] font-black uppercase tracking-[.22em] text-orange-500">Proforma Invoice Preview</p><h2 className="mt-1 text-xl font-black text-slate-950">{row.proformaNumber}</h2></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 font-black text-slate-600 transition hover:bg-slate-50"><Printer className="h-4 w-4" /> Print</button><button type="button" onClick={() => downloadProforma(row)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-500 px-5 font-black text-white shadow-lg shadow-orange-200 transition hover:bg-orange-600"><Download className="h-4 w-4" /> Download PDF</button><button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-red-50 hover:text-red-500"><X className="h-5 w-5" /></button></div>
      </header>
      <div className="overflow-y-auto p-3 sm:p-6">
        <article className="mx-auto min-h-[900px] w-full max-w-[850px] bg-white px-7 py-7 text-[11px] leading-relaxed text-slate-950 shadow-xl sm:px-10 sm:py-9">
          <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4"><img src="/anant-tattva-logo-chroma.png" alt="Anant Tattva" className="h-14 w-auto object-contain" /><h1 className="text-2xl font-black uppercase tracking-[.22em] text-orange-500">Proforma Invoice</h1></div>
          <div className="grid gap-7 border-b border-slate-300 py-5 md:grid-cols-2">
            <section><p className="mb-2 font-black">From:</p><p className="font-bold">{row.createdBy?.name || 'Anant Tattva Team'}</p><p className="font-bold">Anant Tattva Private Limited</p><p>Office No.12 & 614, Midas Building, Sahar Plaza, JB Nagar, Andheri East, Mumbai - 400059</p></section>
            <section className="space-y-1 md:text-right"><p>Proforma Date: {displayDate(row.invoiceDate)}</p><p>Proforma No.: {row.proformaNumber || '-'}</p><p>Quotation No.: {row.quotationNumber || '-'}</p><p>PO Number: {row.poNumber || '-'}</p><p>Valid Until: {displayDate(row.validUntil)}</p><p>Prepared By: {row.createdBy?.name || '-'}</p></section>
          </div>
          <section className="py-5"><p className="mb-2 font-black">To:</p><p className="font-black">{[details.salutation, details.contactPerson, details.designation].filter(Boolean).join(' ') || 'Client Contact'}</p><p>Mobile No.: {details.mobileNo1 || '-'}</p><p className="font-black">{row.companyName || details.companyName || '-'}</p><p>{address || 'Address not provided'}</p><p>State: {details.state || '-'}</p><p>City: {details.city || '-'}</p><p>Pincode: {details.pinCode || '-'}</p><p>GST Number: {details.gstNumber || '-'}</p></section>
          <div className="overflow-x-auto"><table className="w-full min-w-[700px] border-collapse text-left text-[10px]"><thead><tr className="bg-orange-500 text-white">{['Service Category', 'Services For The Year', 'EPR Category', 'PIBO Category', 'Unit', 'Basic Amount (INR)'].map((heading) => <th key={heading} className="border border-slate-950 p-2 font-black uppercase">{heading}</th>)}</tr></thead><tbody>{(row.items || []).map((item, index) => <tr key={index}><td className="border border-slate-950 p-2 font-black">{item.serviceCategory || '-'}</td><td className="border border-slate-950 p-2 font-bold">{item.servicesForYear || '-'}</td><td className="border border-slate-950 p-2 font-bold">{item.eprCategory || '-'}</td><td className="border border-slate-950 p-2 font-bold">{[item.piboParent, item.piboCategory].filter(Boolean).join(' — ') || '-'}</td><td className="border border-slate-950 p-2 text-center font-black">{item.unit || 1}</td><td className="border border-slate-950 p-2 text-right font-black">{money((Number(item.unit) || 1) * Number(item.basicAmount || 0))}</td></tr>)}</tbody><tfoot><tr><td colSpan="5" className="border border-slate-950 p-2 text-right font-black uppercase">Grand Total</td><td className="border border-slate-950 p-2 text-right font-black text-orange-600">{money(row.grandTotal || amount(row.items))}</td></tr></tfoot></table></div>
          <section className="mt-6"><p className="font-black">Terms & Conditions:</p><ol className="mt-2 list-decimal space-y-1 pl-5">{(row.terms || []).filter(Boolean).map((term, index) => <li key={index}>{term}</li>)}</ol></section>
          <section className="mt-6"><p className="font-black text-red-600">Important Note:</p><ol className="mt-2 list-decimal space-y-1 pl-5"><li>GST will be extra @ 18%.</li><li>Any Government Charges to be paid by Client directly.</li></ol></section>
          <footer className="mt-8 border-t-2 border-slate-900 pt-4 text-center"><p className="font-black">For more details please contact us on : info@ananttattva.com | +91 8169727341 / 9004005520</p><p className="mt-4 font-black">This is a computer-generated proforma invoice and does not require a signature.</p></footer>
        </article>
      </div>
      <footer className="flex justify-end gap-2 border-t bg-white px-5 py-4"><button type="button" onClick={() => onEdit(row)} className="rounded-xl border border-orange-200 bg-orange-50 px-5 py-3 font-black text-orange-600 transition hover:bg-orange-100">Edit Invoice</button><button type="button" onClick={() => downloadProforma(row)} className="rounded-xl bg-orange-500 px-6 py-3 font-black text-white shadow-lg transition hover:bg-orange-600">Download Proforma Invoice</button></footer>
    </div>
  </div>
}

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
  const [detailRow, setDetailRow] = useState(null)
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
      <div className="p-5"><div className="grid gap-4 lg:grid-cols-4"><label className="lg:col-span-2"><span className="mb-2 block text-sm font-black">Select Quotation</span><QuotationPicker value={form.quotationId || ''} quotations={quotations} onChange={selectQuotation} /></label><label><span className="mb-2 block text-sm font-black">Quotation Number *</span><input value={form.quotationNumber} readOnly={Boolean(form.quotationId)} onChange={(e) => setForm((c) => ({ ...c, quotationNumber: e.target.value }))} className="h-14 w-full rounded-2xl border px-4 font-black read-only:bg-slate-100" placeholder="AT/26-27/001" /></label><label><span className="mb-2 block text-sm font-black">PO Number *</span><input value={form.poNumber} onChange={(e) => setForm((c) => ({ ...c, poNumber: e.target.value }))} className="h-14 w-full rounded-2xl border border-orange-200 bg-orange-50/40 px-4 font-black outline-none" placeholder="Enter PO number" /></label><label><span className="mb-2 block text-sm font-black">Invoice Date</span><input type="date" value={form.invoiceDate} onChange={(e) => setForm((c) => ({ ...c, invoiceDate: e.target.value }))} className="h-12 w-full rounded-xl border px-4 font-bold" /></label><label><span className="mb-2 block text-sm font-black">Valid Until</span><input type="date" value={form.validUntil} onChange={(e) => setForm((c) => ({ ...c, validUntil: e.target.value }))} className="h-12 w-full rounded-xl border px-4 font-bold" /></label></div>
      <h3 className="mb-3 mt-7 text-lg font-black">Client & Quotation Details</h3><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{leadFields.map(([key, label]) => <label key={key}><span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">{label}</span><input value={form.leadDetails[key] || ''} onChange={(e) => setLead(key, e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 font-bold outline-none focus:border-emerald-400" placeholder={`Enter ${label.toLowerCase()}`} /></label>)}</div>
      <div className="mb-3 mt-7 flex items-center justify-between"><h3 className="text-lg font-black">Invoice Items</h3><button onClick={() => setForm((c) => ({ ...c, items: [...c.items, { ...blankItem }] }))} className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 font-black text-emerald-700"><Plus className="h-4 w-4" /> Add Item</button></div><div className="overflow-x-auto rounded-2xl border"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-emerald-800 text-white"><tr>{['Service Category', 'Services Year', 'EPR Category', 'Applicant Type', 'PIBO Category', 'Qty / Unit', 'Basic Amount', ''].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{form.items.map((item, index) => <tr key={index} className="border-b"><td className="p-2"><input value={item.serviceCategory} onChange={(e) => setItem(index, 'serviceCategory', e.target.value)} className="h-10 w-full rounded-lg border px-2 font-bold" /></td><td className="p-2"><input value={item.servicesForYear} onChange={(e) => setItem(index, 'servicesForYear', e.target.value)} className="h-10 w-full rounded-lg border px-2" /></td><td className="p-2"><input value={item.eprCategory} onChange={(e) => setItem(index, 'eprCategory', e.target.value)} className="h-10 w-full rounded-lg border px-2" /></td><td className="p-2"><input value={item.piboParent} onChange={(e) => setItem(index, 'piboParent', e.target.value)} className="h-10 w-full rounded-lg border px-2" /></td><td className="p-2"><input value={item.piboCategory} onChange={(e) => setItem(index, 'piboCategory', e.target.value)} className="h-10 w-full rounded-lg border px-2" /></td><td className="p-2"><input value={item.unit} onChange={(e) => setItem(index, 'unit', e.target.value)} className="h-10 w-24 rounded-lg border px-2" /></td><td className="p-2"><input type="number" value={item.basicAmount} onChange={(e) => setItem(index, 'basicAmount', e.target.value)} className="h-10 w-36 rounded-lg border px-2 font-black" /></td><td className="p-2"><button disabled={form.items.length === 1} onClick={() => setForm((c) => ({ ...c, items: c.items.filter((_, i) => i !== index) }))} className="grid h-9 w-9 place-items-center rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]"><label><span className="mb-2 block text-sm font-black">Terms & Conditions</span><textarea value={form.terms.join('\n')} onChange={(e) => setForm((c) => ({ ...c, terms: e.target.value.split(/\r?\n/) }))} rows={6} className="w-full rounded-2xl border p-4 font-semibold outline-none" placeholder="One term per line" /></label><div className="rounded-2xl bg-gradient-to-br from-emerald-800 to-teal-700 p-5 text-white"><span className="text-xs font-black uppercase tracking-wider text-emerald-200">Grand Total</span><strong className="mt-2 block text-3xl">{money(total)}</strong><p className="mt-2 text-sm text-emerald-100">Calculated automatically from quantity × basic amount.</p><button disabled={saving} onClick={save} className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 font-black shadow-lg transition hover:bg-orange-400 disabled:opacity-50"><Save className="h-5 w-5" /> {saving ? 'Saving…' : editingId ? 'Update Invoice' : 'Save Proforma Invoice'}</button></div></div></div>
    </section>

    <section className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><header className="flex items-center justify-between border-b p-5"><div><h2 className="text-xl font-black">Saved Proforma Invoices</h2><p className="text-sm font-semibold text-slate-500">{rows.length} records stored in CRM database</p></div></header><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr>{['Proforma No.', 'Quotation No.', 'PO Number', 'Company', 'Date', 'Amount', 'Status', 'Actions'].map((h) => <th key={h} className="p-4">{h}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row._id} className="border-b transition hover:bg-emerald-50/30"><td className="p-4 font-black text-emerald-700">{row.proformaNumber}</td><td className="p-4 font-bold">{row.quotationNumber}</td><td className="p-4 font-bold">{row.poNumber}</td><td className="p-4 font-black">{row.companyName}</td><td className="p-4">{String(row.invoiceDate || '').slice(0, 10)}</td><td className="p-4 font-black">{money(row.grandTotal)}</td><td className="p-4"><span className="rounded-full bg-emerald-50 px-3 py-1 font-black text-emerald-700">{row.status}</span></td><td className="p-4"><div className="flex gap-2"><button title="View details" onClick={() => setDetailRow(row)} className="grid h-9 w-9 place-items-center rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50"><Eye className="h-4 w-4" /></button><button title="Download PDF" onClick={() => downloadProforma(row)} className="grid h-9 w-9 place-items-center rounded-lg border border-sky-200 text-sky-700 hover:bg-sky-50"><Download className="h-4 w-4" /></button><button onClick={() => edit(row)} className="rounded-lg border border-orange-200 px-3 py-2 font-black text-orange-600 hover:bg-orange-50">Edit</button></div></td></tr>)}{!rows.length && <tr><td colSpan="8" className="p-12 text-center font-bold text-slate-400">{loading ? 'Loading…' : 'No Proforma Invoices created yet.'}</td></tr>}</tbody></table></div></section>
    <ProformaDetail row={detailRow} onClose={() => setDetailRow(null)} onEdit={(row) => { setDetailRow(null); edit(row) }} />
  </div></div></DashboardShell>
}
