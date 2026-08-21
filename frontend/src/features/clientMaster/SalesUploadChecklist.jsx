import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import PurchaseProofDropzone from './PurchaseProofDropzone';

export default function SalesUploadChecklist({ checklist = [], canEdit, busy, onChange, onUploadProof, onRemoveProof, onError }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-start gap-3 border-b border-slate-200 bg-slate-50 p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-100 text-[#087A70]"><ClipboardCheck className="h-5 w-5" /></span>
      <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#087A70]">Sales Data Upload Checklist</p><h6 className="mt-1 text-sm font-black text-slate-950">Complete the tracker before Excel submission</h6><p className="mt-1 text-xs font-bold text-slate-500">Every “Yes” row requires a date and supporting proof, exactly like Purchase Data.</p></div>
    </div>
    <div className="grid gap-3 p-4 lg:grid-cols-2">{checklist.map((row, index) => {
      const required = row.yesNo === 'Yes'; const missing = required && (!row.date || !row.files?.length);
      return <article key={row.particular} className={`overflow-hidden rounded-xl border ${missing ? 'border-rose-200' : 'border-slate-200'}`}>
        <div className="flex items-center gap-3 bg-slate-100 px-3 py-2.5"><span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-xs font-black text-slate-500">{index + 1}</span><strong className="text-xs text-slate-900">{row.particular}</strong></div>
        <div className="grid gap-3 p-3 sm:grid-cols-2"><label className="text-[10px] font-black uppercase tracking-wide text-slate-500">Status<select disabled={!canEdit} value={row.yesNo || ''} onChange={(event) => onChange(index, { yesNo: event.target.value }, true)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black normal-case text-slate-900"><option value="">Select</option><option>Yes</option><option>No</option></select></label><label className="text-[10px] font-black uppercase tracking-wide text-slate-500">Date<input disabled={!canEdit} type="date" value={row.date || ''} onChange={(event) => onChange(index, { date: event.target.value })} className={`mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-xs font-bold text-slate-900 ${required && !row.date ? 'border-rose-300' : 'border-slate-200'}`} /></label></div>
        <div className="px-3 pb-3"><PurchaseProofDropzone files={row.files || []} required={required} disabled={!canEdit} busy={busy === `proof-${index}`} onUpload={(files) => onUploadProof(index, files)} onRemove={(fileIndex) => onRemoveProof(index, fileIndex)} onPreview={(file) => window.open(file.secureUrl || file.url, '_blank', 'noopener,noreferrer')} onError={onError} /><textarea disabled={!canEdit} rows="2" maxLength="2000" value={row.remarks || ''} onChange={(event) => onChange(index, { remarks: event.target.value })} placeholder="Remarks…" className="mt-2 w-full resize-y rounded-lg border border-slate-200 p-2.5 text-xs font-bold" />{missing && <p className="mt-2 text-[10px] font-black text-rose-600">Date and proof are required for Yes status.</p>}</div>
      </article>;
    })}</div>
  </section>;
}
