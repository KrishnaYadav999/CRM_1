import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, CircleDashed, ExternalLink, FileCheck2, FileText, Image as ImageIcon, Loader2, RotateCcw, Save, ShieldCheck, XCircle } from 'lucide-react'
import DashboardShell from '../components/dashboard/DashboardShell'
import api from '../services/api'
import { API_ENDPOINTS } from '../services/apiEndpoints'

const sectionSources = {
  companyOverview: ['companyOverview'], basic: ['basic'], addressDetails: ['registeredAddress', 'communicationAddress'],
  documents: ['compliance'], cteCtoCca: ['cte', 'cteCtoCca'],
  cpcbCredentials: ['cpcb'], cpcbScreenshots: ['cpcbScreenshots'], processFlowDiagrams: ['processDiagrams', 'processFlowFiles'],
  authorizedPersons: ['otp', 'otpContacts', 'authorised', 'authorisedPersons', 'coordinating', 'coordinatingPersons']
}

const removedReviewFields = new Set(['productManufacturer', 'numberOfEmployees'])

function titleize(value) { return String(value || '').replace(/([A-Z])/g, ' $1').replace(/[_-]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase()) }
function present(value) { return value !== undefined && value !== null && String(value).trim() !== '' }
function populated(value) {
  if (Array.isArray(value)) return value.some(populated)
  if (value && typeof value === 'object') return Object.entries(value).some(([key, nested]) => !/^_/.test(key) && populated(nested))
  return present(value)
}
function displayValue(key, value) {
  if (/password|secret|token/i.test(key) && present(value)) return '••••••••'
  if (Array.isArray(value)) return value.length ? `${value.length} record${value.length === 1 ? '' : 's'}` : 'Not provided'
  if (value && typeof value === 'object') return value.name || value.fileName || value.url || `${Object.keys(value).length} values`
  return present(value) ? String(value) : 'Not provided'
}
function fileUrl(value) {
  if (typeof value === 'string' && /^(https?:|data:|blob:)/i.test(value)) return value
  if (!value || typeof value !== 'object') return ''
  return value.secureUrl || value.url || value.fileUrl || value.dataUrl || value.path || fileUrl(value.file) || fileUrl(value.document) || ''
}
function fileName(value, fallback = 'Uploaded file') {
  if (!value || typeof value !== 'object') return fallback
  return value.name || value.fileName || value.originalName || value.file?.name || fallback
}
function isImageFile(url, name = '', type = '') { return /^data:image\//i.test(url) || /^image\//i.test(type) || /\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)/i.test(`${name} ${url}`) }
function attachmentsFrom(value, label, seen = new Set()) {
  if (!value) return []
  if (Array.isArray(value)) return value.flatMap((item, index) => attachmentsFrom(item, `${label} ${index + 1}`, seen))
  const url = fileUrl(value)
  const rows = []
  if (url && !seen.has(url)) {
    seen.add(url)
    const name = fileName(value, label)
    rows.push({ url, name, label, image: isImageFile(url, name, value?.type || value?.mimeType) })
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => {
      if (!['url', 'secureUrl', 'fileUrl', 'dataUrl', 'path'].includes(key) && nested && typeof nested === 'object') rows.push(...attachmentsFrom(nested, `${label} · ${titleize(key)}`, seen))
    })
  }
  return rows
}
function reviewField(id, label, value) {
  return populated(value) ? { id, label, value: displayValue(id, value), filled: true } : null
}
function cteFieldsFor(data = {}) {
  const cte = data.cte || data.cteCtoCca || {}
  const inferredApplicability = cte.cteApplicable || (populated(cte.numberOfPlantsLocations) || populated(cte.plantWiseDetails) ? 'Yes' : '')
  const fields = [
    reviewField('cte.cteApplicable', 'CTE Applicable', inferredApplicability),
    reviewField('cte.numberOfPlantsLocations', 'Number Of Plant Locations', cte.numberOfPlantsLocations)
  ]
  const plantFields = [
    ['plantName', 'Plant Name'], ['cteConsentNo', 'CTE Consent No.'], ['cteCategory', 'CTE Category'],
    ['cteIssuedDate', 'CTE Issued Date'], ['cteValidDate', 'CTE Valid Upto'], ['plantLocation', 'Plant Location'],
    ['cteDocument', 'CTE Document'], ['ctoOrderNo', 'CTO/CCA Consent Order No.'],
    ['ctoIssueDate', 'CTO/CCA Date Of Issue'], ['ctoValidDate', 'CTO/CCA Valid Upto'], ['ctoDocument', 'CTO/CCA Document']
  ]
  const plants = Array.isArray(cte.plantWiseDetails) ? cte.plantWiseDetails : []
  plants.forEach((plant, plantIndex) => {
    plantFields.forEach(([key, label]) => fields.push(reviewField(`cte.plantWiseDetails.${plantIndex}.${key}`, `Plant ${plantIndex + 1} · ${label}`, plant?.[key])))
    ;(plant?.cteProductionRows || []).forEach((row, rowIndex) => {
      fields.push(reviewField(`cte.plantWiseDetails.${plantIndex}.cteProductionRows.${rowIndex}.productName`, `Plant ${plantIndex + 1} · CTE Product ${rowIndex + 1}`, row?.productName))
      fields.push(reviewField(`cte.plantWiseDetails.${plantIndex}.cteProductionRows.${rowIndex}.capacity`, `Plant ${plantIndex + 1} · CTE Capacity ${rowIndex + 1}`, row?.capacity))
    })
    ;(plant?.ctoProductRows || []).forEach((row, rowIndex) => {
      fields.push(reviewField(`cte.plantWiseDetails.${plantIndex}.ctoProductRows.${rowIndex}.productName`, `Plant ${plantIndex + 1} · CTO/CCA Product ${rowIndex + 1}`, row?.productName))
      fields.push(reviewField(`cte.plantWiseDetails.${plantIndex}.ctoProductRows.${rowIndex}.quantity`, `Plant ${plantIndex + 1} · CTO/CCA Quantity ${rowIndex + 1}`, row?.quantity))
    })
  })
  return fields.filter(Boolean)
}
function documentFieldsFor(data = {}) {
  const compliance = data.compliance || {}
  const groups = [
    ['gst', 'GST Number', 'GST Certificate Date'],
    ['cin', 'CIN', 'CIN Document Date'],
    ['pan', 'PAN', 'PAN Document Date'],
    ['factoryLicense', 'Factory License No.', 'Factory License Document Date'],
    ['eprCertificate', 'EPR Certificate No.', 'EPR Certificate File Date'],
    ['iec', 'IEC Certificate', 'IEC Certificate Date'],
    ['dicDcssi', 'DIC/DCSSI Certificate No.', 'DIC/DCSSI Certificate Date']
  ]
  const fields = []
  groups.forEach(([key, numberLabel, dateLabel]) => {
    const numberValue = compliance[`${key}Number`] || compliance[key]
    const dateValue = compliance[`${key}Date`]
    const fileValue = compliance[`${key}File`]
    if (!populated(numberValue) && !populated(dateValue) && !populated(fileValue)) return
    fields.push(reviewField(`compliance.${key}Number`, numberLabel, numberValue))
    fields.push(reviewField(`compliance.${key}Date`, dateLabel, dateValue))
  })
  if (populated(compliance.brandOwnerProductionFacility)) fields.push(reviewField('compliance.brandOwnerProductionFacility', 'Brand Owner Production Facility', compliance.brandOwnerProductionFacility))
  if (populated(compliance.msmeApplicable)) fields.push(reviewField('compliance.msmeApplicable', 'MSME Applicable', compliance.msmeApplicable))
  return fields.filter(Boolean)
}
function fieldsFor(data, sectionKey) {
  if (sectionKey === 'documents') return documentFieldsFor(data)
  if (sectionKey === 'cteCtoCca') return cteFieldsFor(data)
  return (sectionSources[sectionKey] || []).flatMap((sourceKey) => {
    const source = data?.[sourceKey]
    if (!source || typeof source !== 'object') return []
    return Object.entries(source)
      .filter(([key, value]) => !/^_/.test(key) && !removedReviewFields.has(key) && populated(value))
      .map(([key, value]) => ({ id: `${sourceKey}.${key}`, label: `${titleize(sourceKey)} · ${titleize(key)}`, value: displayValue(key, value), filled: true }))
  })
}

function AttachmentGallery({ attachments }) {
  if (!attachments.length) return null
  return <section className="mt-5"><div className="mb-3 flex items-center gap-2"><FileText className="h-5 w-5 text-cyan-700" /><div><h3 className="font-black text-slate-950">Uploaded Images & Documents</h3><p className="text-xs font-semibold text-slate-500">Open each supporting file before completing this tab review.</p></div></div><div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{attachments.map((file, index) => <article key={`${file.url}-${index}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{file.image ? <button type="button" onClick={() => window.open(file.url, '_blank', 'noopener,noreferrer')} className="block h-44 w-full overflow-hidden bg-slate-100"><img src={file.url} alt={file.name} className="h-full w-full object-contain" loading="lazy" /></button> : <div className="grid h-32 place-items-center bg-gradient-to-br from-cyan-50 to-slate-100"><FileText className="h-12 w-12 text-cyan-700" /></div>}<div className="p-4"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700">{file.image ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</span><div className="min-w-0"><strong className="block truncate text-sm text-slate-900" title={file.name}>{file.name}</strong><small className="block truncate font-semibold text-slate-500" title={file.label}>{file.label}</small></div></div><a href={file.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 text-sm font-black text-cyan-800 hover:bg-cyan-100"><ExternalLink className="h-4 w-4" />{file.image ? 'View Full Image' : 'Open Document'}</a></div></article>)}</div></section>
}
function statusStyle(status) {
  return { VERIFIED: 'bg-emerald-100 text-emerald-800', CHANGES_REQUIRED: 'bg-rose-100 text-rose-700', NOT_APPLICABLE: 'bg-slate-200 text-slate-700', NOT_REVIEWED: 'bg-amber-100 text-amber-800' }[status] || 'bg-cyan-100 text-cyan-800'
}

export default function ClientComplianceReview() {
  const { clientId } = useParams(); const navigate = useNavigate()
  const [currentUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'))
  const [payload, setPayload] = useState(null); const [activeKey, setActiveKey] = useState('companyOverview')
  const [draft, setDraft] = useState({ status: 'VERIFIED', remarks: '' }); const [finalRemarks, setFinalRemarks] = useState('')
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState('')
  const load = async () => { setLoading(true); setError(''); try { const response = await api.get(API_ENDPOINTS.clients.complianceReview(clientId)); setPayload(response.data || response) } catch (err) { setError(err?.response?.data?.error || 'Unable to load compliance verification.') } finally { setLoading(false) } }
  useEffect(() => { load() }, [clientId])
  const activeSection = payload?.review?.sections?.find((item) => item.key === activeKey)
  useEffect(() => { setDraft({ status: activeSection?.status === 'NOT_REVIEWED' ? 'VERIFIED' : activeSection?.status || 'VERIFIED', remarks: activeSection?.remarks || '' }) }, [activeSection?.key, activeSection?.status, activeSection?.remarks])
  const fields = useMemo(() => fieldsFor(payload?.client?.data || {}, activeKey), [payload?.client?.data, activeKey])
  const attachments = useMemo(() => (sectionSources[activeKey] || []).flatMap((sourceKey) => attachmentsFrom(payload?.client?.data?.[sourceKey], titleize(sourceKey))), [payload?.client?.data, activeKey])
  const clientName = payload?.client?.data?.basic?.clientLegalName || payload?.client?.data?.basic?.tradeName || payload?.client?.selectedLead?.company || 'Client Master'
  async function saveSection() { setSaving('section'); setError(''); setNotice(''); try { const response = await api.put(API_ENDPOINTS.clients.complianceReviewSection(clientId, activeKey), draft); setPayload((current) => ({ ...current, review: response.data.review, progress: response.data.progress })); setNotice(`${activeSection?.label || 'Section'} review saved.`) } catch (err) { setError(err?.response?.data?.error || 'Unable to save this section review.') } finally { setSaving('') } }
  async function decide(decision) { setSaving(decision); setError(''); setNotice(''); try { await api.post(API_ENDPOINTS.clients.complianceReviewDecision(clientId), { decision, remarks: finalRemarks }); navigate('/pending-approval', { state: { approvalNotice: decision === 'APPROVED' ? `${clientName} approved after complete compliance verification.` : `${clientName} returned with compliance remarks.` } }) } catch (err) { setError(err?.response?.data?.error || 'Unable to complete compliance review.') } finally { setSaving('') } }
  if (loading) return <DashboardShell currentUser={currentUser}><div className="grid min-h-screen place-items-center bg-slate-50"><Loader2 className="h-10 w-10 animate-spin text-emerald-700" /></div></DashboardShell>
  return <DashboardShell currentUser={currentUser}><div className="min-h-screen bg-[#f3f8f6] p-4 lg:p-6"><div className="mx-auto max-w-[1800px] space-y-4">
    <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><button type="button" onClick={() => navigate('/pending-approval')} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200"><ArrowLeft className="h-5 w-5" /></button><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-700">Compliance Verification Workspace</p><h1 className="mt-1 text-2xl font-black text-slate-950">{clientName}</h1><p className="mt-1 text-sm font-semibold text-slate-500">{payload?.client?.selectedLead?.leadCode || 'Direct Client Master'} · Submitted by {payload?.client?.createdBy?.name || payload?.client?.createdBy?.email || '-'}</p></div></div><div className="min-w-64 rounded-2xl bg-emerald-50 p-4"><div className="flex justify-between text-xs font-black text-emerald-900"><span>Verification Progress</span><span>{payload?.progress?.percentage || 0}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full bg-emerald-600" style={{ width: `${payload?.progress?.percentage || 0}%` }} /></div><p className="mt-2 text-xs font-bold text-slate-600">{payload?.progress?.reviewed || 0}/{payload?.progress?.total || 9} tabs verified · {payload?.progress?.issues || 0} issues</p></div></div></header>
    {(error || notice) && <div className={`rounded-xl border p-3 text-sm font-bold ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || notice}</div>}
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]"><aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b p-4"><h2 className="font-black text-slate-950">Verification Tabs</h2><p className="text-xs font-semibold text-slate-500">Review every applicable section</p></div>{payload?.review?.sections?.map((section) => <button type="button" key={section.key} onClick={() => setActiveKey(section.key)} className={`flex w-full items-center gap-3 border-b px-4 py-4 text-left ${activeKey === section.key ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}><span className={`grid h-9 w-9 place-items-center rounded-xl ${statusStyle(section.status)}`}>{section.status === 'VERIFIED' ? <CheckCircle2 className="h-4 w-4" /> : section.status === 'CHANGES_REQUIRED' ? <AlertTriangle className="h-4 w-4" /> : <CircleDashed className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{section.label}</strong><small className="font-bold text-slate-500">{titleize(section.status)}</small></span><ChevronRight className="h-4 w-4 text-slate-400" /></button>)}</aside>
      <main className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-5 py-4"><div><h2 className="text-xl font-black text-slate-950">{activeSection?.label}</h2><p className="text-xs font-semibold text-slate-500">Compare entered information with uploaded supporting documents.</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${statusStyle(activeSection?.status)}`}>{titleize(activeSection?.status)}</span></header>
        <div className="p-5"><div className="grid gap-3 md:grid-cols-2">{fields.length ? fields.map((field) => <article key={field.id} className={`rounded-xl border p-4 ${field.filled ? 'border-slate-200 bg-white' : 'border-orange-200 bg-orange-50/50'}`}><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{field.label}</p><p className={`mt-2 break-words text-sm font-bold ${field.filled ? 'text-slate-900' : 'text-orange-700'}`}>{field.value}</p></article>) : <div className="col-span-full rounded-xl border border-dashed p-10 text-center text-sm font-bold text-slate-400">No data stored in this section. Mark it Not Applicable or request changes.</div>}</div><AttachmentGallery attachments={attachments} />
          <section className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5"><h3 className="flex items-center gap-2 font-black text-slate-950"><FileCheck2 className="h-5 w-5 text-emerald-700" />Compliance decision for this tab</h3><div className="mt-4 grid gap-3 sm:grid-cols-3">{[['VERIFIED','Verified',CheckCircle2],['CHANGES_REQUIRED','Changes Required',AlertTriangle],['NOT_APPLICABLE','Not Applicable',CircleDashed]].map(([value,label,Icon]) => <button type="button" key={value} onClick={() => setDraft((current) => ({ ...current, status: value }))} className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-black ${draft.status === value ? value === 'CHANGES_REQUIRED' ? 'border-rose-500 bg-rose-600 text-white' : 'border-emerald-600 bg-emerald-700 text-white' : 'border-slate-200 bg-white text-slate-700'}`}><Icon className="h-4 w-4" />{label}</button>)}</div><label className="mt-4 block text-sm font-black text-slate-700">Tab remarks {draft.status === 'CHANGES_REQUIRED' && <span className="text-rose-600">*</span>}<textarea rows={4} maxLength={1000} value={draft.remarks} onChange={(event) => setDraft((current) => ({ ...current, remarks: event.target.value }))} placeholder="Record verification notes or clearly explain required corrections..." className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-4 font-semibold outline-none focus:border-emerald-500" /></label><div className="mt-4 flex justify-end"><button type="button" onClick={saveSection} disabled={saving === 'section'} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#075848] px-5 text-sm font-black text-white disabled:opacity-50">{saving === 'section' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Tab Review</button></div></section>
        </div></main></div>
    <section className="sticky bottom-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur"><div className="grid gap-3 lg:grid-cols-[1fr_auto]"><label className="text-sm font-black text-slate-700">Final compliance remarks <span className="text-rose-600">*</span><textarea rows={2} maxLength={1000} value={finalRemarks} onChange={(event) => setFinalRemarks(event.target.value)} placeholder="Enter the final approval note or consolidated correction instructions..." className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-semibold outline-none focus:border-emerald-500" /></label><div className="flex flex-wrap items-end gap-2"><button type="button" onClick={() => decide('CHANGES_REQUIRED')} disabled={!finalRemarks.trim() || Boolean(saving)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-orange-300 px-4 font-black text-orange-700 disabled:opacity-50"><RotateCcw className="h-4 w-4" />Return for Correction</button><button type="button" onClick={() => decide('REJECTED')} disabled={!finalRemarks.trim() || Boolean(saving)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-rose-300 px-4 font-black text-rose-700 disabled:opacity-50"><XCircle className="h-4 w-4" />Reject</button><button type="button" onClick={() => decide('APPROVED')} disabled={!finalRemarks.trim() || payload?.progress?.reviewed !== payload?.progress?.total || payload?.progress?.issues > 0 || Boolean(saving)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{saving === 'APPROVED' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Approve Client</button></div></div></section>
  </div></div></DashboardShell>
}
