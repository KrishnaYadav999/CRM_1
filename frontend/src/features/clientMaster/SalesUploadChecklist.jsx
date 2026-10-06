import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import PurchaseProofDropzone from './PurchaseProofDropzone';

const HIDDEN = new Set(['Partially Data received', 'Complete Data Received', 'Work In Process', 'Partially Complete']);
const DATA_STAGES = new Set(['Received from client', 'Ready to upload']);
const SIMPLE = new Set(['Nil Upload', 'Client Approval on data']);

export default function SalesUploadChecklist({ title = 'Sales Data Upload Checklist', checklist = [], canEdit, busy, onChange, onUploadProof, onRemoveProof, onPreview, onError }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"><ClipboardCheck className="h-5 w-5 text-teal-700" /><h6 className="text-sm font-bold text-slate-900">{title}</h6></div>
    <div className="divide-y divide-slate-200">{checklist.map((row, index) => {
      if (HIDDEN.has(row.particular)) return null;
      const simple = SIMPLE.has(row.particular);
      const enabled = row.yesNo === 'Yes';
      const editable = canEdit && !busy;
      return <article key={row.particular} className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><strong className="text-sm text-slate-900">{row.particular}</strong>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">Status<select aria-label={`${row.particular} status`} disabled={!editable} value={row.yesNo || ''} onChange={(event) => onChange(index, { yesNo: event.target.value }, true)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"><option value="">Select</option><option>Yes</option><option>No</option></select></label>
        </div>
        {DATA_STAGES.has(row.particular) && <fieldset disabled={!editable || !enabled} className="mt-3 flex flex-wrap gap-2 disabled:opacity-45">{[['partialDataReceived', 'Partially Data received'], ['completeDataReceived', 'Complete Data Received']].map(([field, label]) => <label key={field} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={Boolean(row[field])} onChange={(event) => onChange(index, { [field]: event.target.checked }, true)} className="h-4 w-4 accent-teal-700" />{label}</label>)}</fieldset>}
        {!simple && <fieldset disabled={!editable || !enabled} className="mt-3 grid gap-3 disabled:opacity-45 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="min-w-0"><PurchaseProofDropzone files={row.files || []} required={enabled} disabled={!editable || !enabled} busy={busy === `proof-${index}`} onUpload={(files) => onUploadProof(index, files)} onRemove={(fileIndex, file) => onRemoveProof(index, fileIndex, file)} onPreview={onPreview} onError={onError} /></div>
          <div className="space-y-2"><label className="block text-xs font-semibold text-slate-600">Date<input aria-label={`${row.particular} date`} type="date" value={row.date || ''} onChange={(event) => onChange(index, { date: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" /></label><label className="block text-xs font-semibold text-slate-600">Remarks<textarea rows="2" maxLength="2000" value={row.remarks || ''} onChange={(event) => onChange(index, { remarks: event.target.value })} placeholder="Add remarks…" className="mt-1 block w-full resize-y rounded-lg border border-slate-200 p-2 text-sm" /></label></div>
        </fieldset>}
        {!simple && enabled && (!row.date || !row.files?.length) && <p className="mt-2 text-xs font-medium text-amber-700">Date and supporting proof are required.</p>}
      </article>;
    })}</div>
  </section>;
}
