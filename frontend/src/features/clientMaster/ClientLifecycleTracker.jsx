import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, CheckCircle2, ClipboardList, Loader2, MessageSquareText, Minus, Paperclip, Plus, Save, Trash2, X } from 'lucide-react';
import api from '../../services/api';
import { API_ENDPOINTS } from '../../services/apiEndpoints';
import { uploadMediaBatch } from '../../services/mediaUpload';

const MILESTONES = [
  { key: 'leadClosure', label: 'Lead Closure', eyebrow: 'Sales conversion', tint: 'emerald', description: 'Confirm whether the qualified lead has been closed.' },
  { key: 'poReceived', label: 'PO Received', eyebrow: 'Commercial confirmation', tint: 'amber', description: 'Track the purchase order and its supporting proof.' },
  { key: 'kickOffMeeting', label: 'Kick-off Meeting', eyebrow: 'Project activation', tint: 'sky', description: 'Record the first formal delivery meeting.' }
];

const PALETTES = {
  emerald: { shell: 'border-emerald-200 bg-emerald-50/45', head: 'bg-emerald-700', button: 'bg-emerald-700 hover:bg-emerald-800 focus:ring-emerald-200' },
  amber: { shell: 'border-amber-200 bg-amber-50/45', head: 'bg-amber-600', button: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-200' },
  sky: { shell: 'border-sky-200 bg-sky-50/45', head: 'bg-sky-700', button: 'bg-sky-700 hover:bg-sky-800 focus:ring-sky-200' }
};

const emptyMilestone = () => ({ date: '', completed: 'no', remark: '', moms: [], proofs: [] });
const newFollowUp = () => ({ id: `follow-up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, remark: '', date: '', status: 'Pending' });
const emptyLifecycle = () => ({ milestones: Object.fromEntries(MILESTONES.map(({ key }) => [key, emptyMilestone()])), workFollowUps: [] });

function normalizeLifecycle(value) {
  const base = emptyLifecycle();
  const stored = value && typeof value === 'object' ? value : {};
  return {
    milestones: Object.fromEntries(MILESTONES.map(({ key }) => [key, {
      ...base.milestones[key],
      ...(stored.milestones?.[key] || {}),
      moms: stored.milestones?.[key]?.moms || [],
      proofs: stored.milestones?.[key]?.proofs || []
    }])),
    workFollowUps: Array.isArray(stored.workFollowUps) ? stored.workFollowUps : []
  };
}

function displayDate(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function MomModal({ milestoneLabel, onClose, onSave }) {
  const [mom, setMom] = useState(() => ({ id: `mom-${Date.now()}`, date: '', subject: '', points: [''] }));
  const points = mom.points?.length ? mom.points : [''];
  const valid = Boolean(mom.date && mom.subject.trim() && points.some((point) => point.trim()));
  const updatePoint = (index, value) => setMom((current) => ({ ...current, points: points.map((point, currentIndex) => currentIndex === index ? value : point) }));

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="mom-modal-title">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/70 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 bg-gradient-to-r from-[#155e57] to-[#30737B] p-6 text-white">
          <div><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-100">Minutes of meeting</p><h3 id="mom-modal-title" className="mt-1 text-2xl font-black">{milestoneLabel} MOM</h3></div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 hover:bg-white/25" aria-label="Close MOM popup"><X className="h-5 w-5" /></button>
        </header>
        <div className="space-y-5 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-black text-slate-700">Meeting date<input type="date" value={mom.date} onChange={(event) => setMom((current) => ({ ...current, date: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" /></label>
            <label className="text-sm font-black text-slate-700">Subject<input value={mom.subject} maxLength={200} onChange={(event) => setMom((current) => ({ ...current, subject: event.target.value }))} placeholder="Meeting subject" className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" /></label>
          </div>
          <div>
            <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-black text-slate-800">MOM points</p><p className="text-xs font-semibold text-slate-500">Add each discussion or action item separately.</p></div><button type="button" onClick={() => setMom((current) => ({ ...current, points: [...points, ''] }))} className="inline-flex items-center gap-2 rounded-xl bg-teal-50 px-3 py-2 text-xs font-black text-teal-800"><Plus className="h-4 w-4" /> Add point</button></div>
            <div className="mt-3 space-y-3">{points.map((point, index) => <div key={`${mom.id}-point-${index}`} className="flex gap-2"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-sm font-black text-slate-500">{index + 1}</span><textarea value={point} maxLength={500} rows="2" onChange={(event) => updatePoint(index, event.target.value)} placeholder="Write MOM point..." className="min-h-11 flex-1 resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" />{points.length > 1 ? <button type="button" onClick={() => setMom((current) => ({ ...current, points: points.filter((_, currentIndex) => currentIndex !== index) }))} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50" aria-label={`Remove MOM point ${index + 1}`}><Minus className="h-4 w-4" /></button> : null}</div>)}</div>
          </div>
        </div>
        <footer className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 p-5"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-600">Cancel</button><button type="button" disabled={!valid} onClick={() => onSave({ ...mom, points: points.map((point) => point.trim()).filter(Boolean) })} className="inline-flex items-center gap-2 rounded-xl bg-[#30737B] px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"><Check className="h-4 w-4" /> Save MOM</button></footer>
      </div>
    </div>
  );
}

function MilestoneCard({ milestone, value, busy, onChange, onSave, onOpenMom, onRemoveMom, onUploadProof, onRemoveProof }) {
  const palette = PALETTES[milestone.tint];
  return (
    <article className={`overflow-hidden rounded-2xl border shadow-sm ${palette.shell}`}>
      <header className={`${palette.head} flex flex-col gap-3 p-5 text-white sm:flex-row sm:items-center sm:justify-between`}><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/75">{milestone.eyebrow}</p><h4 className="mt-1 text-xl font-black">{milestone.label}</h4><p className="mt-1 text-xs font-semibold text-white/80">{milestone.description}</p></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-black ${value.completed === 'yes' ? 'bg-white text-emerald-800' : 'bg-slate-950/20 text-white'}`}>{value.completed === 'yes' ? 'Completed' : 'Pending'}</span></header>
      <div className="overflow-x-auto bg-white"><table className="w-full min-w-[920px] table-fixed"><thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-black uppercase tracking-wider text-slate-500"><th className="w-40 px-4 py-3">Date</th><th className="w-40 px-4 py-3">Completed?</th><th className="px-4 py-3">User remark</th><th className="w-44 px-4 py-3">MOM</th><th className="w-52 px-4 py-3">Proof</th><th className="w-32 px-4 py-3 text-right">Action</th></tr></thead><tbody><tr className="align-top">
        <td className="p-4"><input aria-label={`${milestone.label} date`} type="date" value={value.date || ''} onChange={(event) => onChange({ date: event.target.value })} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-teal-500" /></td>
        <td className="p-4"><div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-50 p-1">{['yes', 'no'].map((choice) => <button key={choice} type="button" onClick={() => onChange({ completed: choice })} className={`rounded-lg px-3 py-2 text-xs font-black uppercase transition ${value.completed === choice ? choice === 'yes' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-700 text-white shadow-sm' : 'text-slate-500'}`}>{choice}</button>)}</div></td>
        <td className="p-4"><textarea aria-label={`${milestone.label} remark`} value={value.remark || ''} maxLength={1000} onChange={(event) => onChange({ remark: event.target.value })} rows="3" placeholder="Add clear remark..." className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500" /></td>
        <td className="p-4"><button type="button" onClick={onOpenMom} className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-black text-white focus:ring-4 ${palette.button}`}><MessageSquareText className="h-4 w-4" /> {value.moms?.length ? `${value.moms.length} MOM` : 'Add MOM'}</button>{value.moms?.map((mom, index) => <div key={mom.id || index} className="mt-2 flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-[10px] font-bold text-slate-600"><span className="min-w-0 flex-1 truncate">{mom.subject}</span><button type="button" onClick={() => onRemoveMom(index)} className="text-rose-600" aria-label={`Remove ${mom.subject || 'MOM'}`}><Trash2 className="h-3.5 w-3.5" /></button></div>)}</td>
        <td className="p-4"><label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-3 text-xs font-black text-slate-600 hover:border-teal-400 hover:text-teal-700"><Paperclip className="h-4 w-4" />{busy === `proof-${milestone.key}` ? 'Uploading...' : 'Add proof'}<input type="file" multiple accept="image/*,.pdf" className="sr-only" disabled={Boolean(busy)} onChange={(event) => onUploadProof(event.target.files, event.target)} /></label>{value.proofs?.map((file, index) => <div key={`${file.url}-${index}`} className="mt-2 flex items-center gap-2 rounded-lg border border-slate-100 bg-white p-2"><a href={file.secureUrl || file.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[10px] font-black text-teal-700 underline">{file.name || `Proof ${index + 1}`}</a><button type="button" onClick={() => onRemoveProof(index)} className="text-rose-600" aria-label={`Remove ${file.name || 'proof'}`}><X className="h-3.5 w-3.5" /></button></div>)}</td>
        <td className="p-4 text-right"><button type="button" disabled={Boolean(busy)} onClick={onSave} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-black text-white hover:bg-slate-800 disabled:opacity-50">{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Done</button></td>
      </tr></tbody></table></div>
    </article>
  );
}

export default function ClientLifecycleTracker({ client, data, onClientUpdated }) {
  const clientId = String(client?._id || client?.id || '');
  const [lifecycle, setLifecycle] = useState(() => normalizeLifecycle(data?.clientLifecycle));
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);
  const [momTarget, setMomTarget] = useState('');
  const leadGeneratedAt = client?.selectedLead?.createdAt || data?.selectedLeadSnapshot?.createdAt || client?.createdAt;
  const completedCount = useMemo(() => MILESTONES.filter(({ key }) => lifecycle.milestones[key]?.completed === 'yes').length, [lifecycle.milestones]);

  useEffect(() => { setLifecycle(normalizeLifecycle(data?.clientLifecycle)); setMessage(null); setMomTarget(''); }, [clientId, data?.clientLifecycle]);

  const setMilestone = (key, patch) => setLifecycle((current) => ({ ...current, milestones: { ...current.milestones, [key]: { ...current.milestones[key], ...patch } } }));
  const save = async () => {
    if (!clientId) return;
    setBusy('save'); setMessage(null);
    try {
      const response = await api.put(API_ENDPOINTS.clients.lifecycle(clientId), lifecycle);
      const saved = normalizeLifecycle(response.data?.lifecycle || lifecycle);
      setLifecycle(saved);
      onClientUpdated?.({ ...client, data: { ...data, clientLifecycle: response.data?.lifecycle || saved } });
      setMessage({ type: 'success', text: 'Client lifecycle tracker saved successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error?.response?.data?.error || 'Unable to save lifecycle tracker.' });
    } finally { setBusy(''); }
  };
  const uploadProof = async (key, files, input) => {
    if (!files?.length) return;
    setBusy(`proof-${key}`); setMessage(null);
    try {
      const remaining = Math.max(0, 10 - (lifecycle.milestones[key].proofs?.length || 0));
      const uploaded = await uploadMediaBatch(Array.from(files).slice(0, remaining), `crm/client-lifecycle/${clientId}/${key}`);
      setMilestone(key, { proofs: [...(lifecycle.milestones[key].proofs || []), ...uploaded] });
    } catch (error) { setMessage({ type: 'error', text: error.message || 'Proof upload failed.' }); }
    finally { setBusy(''); if (input) input.value = ''; }
  };
  const updateFollowUp = (id, patch) => setLifecycle((current) => ({ ...current, workFollowUps: current.workFollowUps.map((row) => row.id === id ? { ...row, ...patch } : row) }));

  return (
    <div className="mt-5 space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-[#155e57] p-5 text-white shadow-xl shadow-slate-900/10"><div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-teal-200">Client journey tracker</p><h3 className="mt-2 text-2xl font-black">Lead to project handover</h3><p className="mt-2 max-w-2xl text-sm font-semibold text-slate-300">Closure, commercial confirmation, meetings, proof and next actions in one audit-friendly view.</p></div><div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/10 bg-white/10 p-4"><CalendarDays className="h-5 w-5 text-teal-200" /><p className="mt-2 text-[10px] font-black uppercase tracking-wider text-slate-300">Lead generated</p><strong className="mt-1 block text-sm">{displayDate(leadGeneratedAt)}</strong></div><div className="rounded-2xl border border-white/10 bg-white/10 p-4"><CheckCircle2 className="h-5 w-5 text-emerald-300" /><p className="mt-2 text-[10px] font-black uppercase tracking-wider text-slate-300">Progress</p><strong className="mt-1 block text-sm">{completedCount} / {MILESTONES.length} done</strong></div></div></div></section>

      {message ? <div role="status" className={`rounded-xl border px-4 py-3 text-sm font-black ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{message.text}</div> : null}

      {MILESTONES.map((milestone) => <MilestoneCard key={milestone.key} milestone={milestone} value={lifecycle.milestones[milestone.key]} busy={busy} onChange={(patch) => setMilestone(milestone.key, patch)} onSave={save} onOpenMom={() => setMomTarget(milestone.key)} onRemoveMom={(index) => setMilestone(milestone.key, { moms: lifecycle.milestones[milestone.key].moms.filter((_, current) => current !== index) })} onUploadProof={(files, input) => uploadProof(milestone.key, files, input)} onRemoveProof={(index) => setMilestone(milestone.key, { proofs: lifecycle.milestones[milestone.key].proofs.filter((_, current) => current !== index) })} />)}

      <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-lg shadow-violet-900/5"><header className="flex flex-col gap-3 bg-gradient-to-r from-violet-700 to-indigo-700 p-5 text-white sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-200">Execution desk</p><h4 className="mt-1 text-xl font-black">Work follow-ups</h4><p className="mt-1 text-xs font-semibold text-violet-100">Add as many next actions as required and close them independently.</p></div><button type="button" onClick={() => setLifecycle((current) => ({ ...current, workFollowUps: [...current.workFollowUps, newFollowUp()] }))} className="inline-flex w-fit items-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black text-violet-800 shadow"><Plus className="h-4 w-4" /> Add follow-up</button></header>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px]"><thead><tr className="border-b border-violet-100 bg-violet-50 text-left text-[10px] font-black uppercase tracking-wider text-violet-700"><th className="w-16 px-4 py-3">#</th><th className="px-4 py-3">Work / remark</th><th className="w-44 px-4 py-3">Date</th><th className="w-48 px-4 py-3">Status</th><th className="w-20 px-4 py-3 text-center">Cut</th></tr></thead><tbody>{lifecycle.workFollowUps.length ? lifecycle.workFollowUps.map((row, index) => <tr key={row.id} className="border-b border-slate-100 last:border-0"><td className="px-4 py-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-100 text-xs font-black text-violet-800">{index + 1}</span></td><td className="px-4 py-3"><input value={row.remark} maxLength={1000} onChange={(event) => updateFollowUp(row.id, { remark: event.target.value })} placeholder="Enter work follow-up remark" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" /></td><td className="px-4 py-3"><input type="date" value={row.date} onChange={(event) => updateFollowUp(row.id, { date: event.target.value })} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-violet-500" /></td><td className="px-4 py-3"><select value={row.status} onChange={(event) => updateFollowUp(row.id, { status: event.target.value })} className={`h-11 w-full rounded-xl border px-3 text-sm font-black outline-none ${row.status === 'Done' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : row.status === 'In Progress' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}><option>Pending</option><option>In Progress</option><option>Done</option></select></td><td className="px-4 py-3 text-center"><button type="button" onClick={() => setLifecycle((current) => ({ ...current, workFollowUps: current.workFollowUps.filter((item) => item.id !== row.id) }))} className="grid h-10 w-10 place-items-center rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50" aria-label={`Remove follow-up ${index + 1}`}><Trash2 className="h-4 w-4" /></button></td></tr>) : <tr><td colSpan="5" className="px-5 py-12 text-center"><ClipboardList className="mx-auto h-8 w-8 text-violet-300" /><p className="mt-3 text-sm font-black text-slate-700">No work follow-ups added</p><p className="mt-1 text-xs font-semibold text-slate-500">Use Add follow-up to create the first action row.</p></td></tr>}</tbody></table></div>
        <footer className="flex justify-end border-t border-violet-100 bg-violet-50/60 p-4"><button type="button" disabled={Boolean(busy)} onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-black text-white shadow hover:bg-violet-800 disabled:opacity-50">{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Done & save all</button></footer>
      </section>

      {momTarget ? <MomModal milestoneLabel={MILESTONES.find(({ key }) => key === momTarget)?.label || 'Meeting'} onClose={() => setMomTarget('')} onSave={(mom) => { setMilestone(momTarget, { moms: [...lifecycle.milestones[momTarget].moms, mom] }); setMomTarget(''); }} /> : null}
    </div>
  );
}
