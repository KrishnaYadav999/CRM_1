import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import PurchaseProofDropzone from './PurchaseProofDropzone';

const REQUIRED_NORMAL_ROWS = new Set(['Received from client', 'Ready to upload', 'Client Approval on data', 'Upload Complete']);

export default function SalesUploadChecklist({ checklist = [], canEdit, busy, onChange, onUploadProof, onRemoveProof, onPreview, onError }) {
  const nilUpload = checklist.find((row) => row.particular === 'Nil Upload')?.yesNo === 'Yes';
  return <section className="overflow-hidden rounded-3xl border border-indigo-200 bg-white shadow-[0_16px_45px_rgba(79,70,229,0.10)]">
    <div className="flex items-start gap-3 border-b border-indigo-200 bg-gradient-to-r from-indigo-50 via-violet-50 to-fuchsia-50 p-5 text-slate-900">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 text-white ring-1 ring-white/25"><ClipboardCheck className="h-5 w-5" /></span>
      <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-indigo-700">Sales Data Upload Checklist</p><h6 className="mt-1 text-base font-black">Complete mandatory controls before Excel submission</h6><p className="mt-1 text-xs font-bold text-slate-600">Normal flow requires four marked rows. Nil Upload requires only Client Approval on data.</p></div>
    </div>
    <div className="grid gap-3 p-4 lg:grid-cols-2">{checklist.map((row, index) => {
      const required = row.particular === 'Client Approval on data' || (!nilUpload && REQUIRED_NORMAL_ROWS.has(row.particular));
      const missing = required && (row.yesNo !== 'Yes' || !row.date || !row.files?.length);
      const complete = required && !missing;
      return <article key={row.particular} className={`overflow-hidden rounded-2xl border-2 bg-white transition ${missing ? 'border-rose-200' : complete ? 'border-emerald-300 shadow-sm shadow-emerald-100' : required ? 'border-amber-200' : 'border-indigo-100'}`}>
        <div className={`flex items-center gap-3 px-3 py-3 ${required ? 'bg-gradient-to-r from-amber-50 to-orange-50' : 'bg-gradient-to-r from-indigo-50 to-violet-50'}`}><span className={`grid h-8 w-8 place-items-center rounded-lg text-xs font-black ${required ? 'bg-amber-500 text-white' : 'bg-indigo-100 text-indigo-700'}`}>{index + 1}</span><strong className="text-xs text-slate-900">{row.particular}</strong>{required && <span className="ml-auto rounded-full bg-rose-100 px-2 py-1 text-[9px] font-black uppercase text-rose-700">Required</span>}</div>
        <div className="grid gap-3 p-3 sm:grid-cols-2"><label className="text-[10px] font-black uppercase tracking-wide text-slate-500">Status<select disabled={!canEdit} value={row.yesNo || ''} onChange={(event) => onChange(index, { yesNo: event.target.value }, true)} className={`mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-xs font-black normal-case text-slate-900 ${required && row.yesNo !== 'Yes' ? 'border-rose-300' : 'border-slate-200'}`}><option value="">Select</option><option>Yes</option><option>No</option></select></label><label className="text-[10px] font-black uppercase tracking-wide text-slate-500">Date<input disabled={!canEdit} type="date" value={row.date || ''} onChange={(event) => onChange(index, { date: event.target.value })} className={`mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-xs font-bold text-slate-900 ${required && !row.date ? 'border-rose-300' : 'border-slate-200'}`} /></label></div>
        <div className="px-3 pb-3"><PurchaseProofDropzone files={row.files || []} required={required} disabled={!canEdit} busy={busy === `proof-${index}`} onUpload={(files) => onUploadProof(index, files)} onRemove={(fileIndex, file) => onRemoveProof(index, fileIndex, file)} onPreview={onPreview} onError={onError} /><textarea disabled={!canEdit} rows="2" maxLength="2000" value={row.remarks || ''} onChange={(event) => onChange(index, { remarks: event.target.value })} placeholder="Remarks…" className="mt-2 w-full resize-y rounded-lg border border-slate-200 p-2.5 text-xs font-bold" />{missing && <p className="mt-2 text-[10px] font-black text-rose-600">Yes, date and supporting proof are mandatory.</p>}</div>
      </article>;
    })}</div>
  </section>;
}
