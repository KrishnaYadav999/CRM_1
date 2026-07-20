import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, Plus, X } from 'lucide-react';
import { PIBO_PARENTS, normalizePiboCategories } from '../../constants/piboCategories';

const ADD_NEW_VALUE = '__add_new_category__';

export default function PiboDependentSelect({ parent = '', value = '', categories = [], loading = false, onChange, onAddCategory, required = false, compact = false }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const childOptions = normalizePiboCategories(categories).filter((category) => category.parent === parent);
  const inputClass = compact
    ? 'h-10 w-full min-w-44 rounded-lg border border-slate-300 bg-white px-3 text-xs font-black text-slate-800 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100'
    : 'min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100';

  function changeParent(nextParent) {
    onChange(nextParent, '');
    setSuccess('');
    setError('');
  }

  function changeChild(nextValue) {
    if (nextValue === ADD_NEW_VALUE) {
      if (!parent) {
    setError('Select Applicant Type before adding a category.');
        return;
      }
      setAdding(true);
      setName('');
      setError('');
      return;
    }
    onChange(parent, nextValue);
  }

  async function submitNewCategory(event) {
    event.preventDefault();
    const trimmed = name.trim().replace(/\s+/g, ' ');
    if (!parent) return setError('Select Applicant Type first.');
    if (!trimmed) return setError('Enter a category name.');
    if (trimmed.length > 60) return setError('Category name must be 60 characters or fewer.');
    if (childOptions.some((category) => category.name.toLowerCase() === trimmed.toLowerCase())) return setError(`This category already exists under ${parent}.`);
    setSaving(true);
    setError('');
    try {
      const category = await onAddCategory(parent, trimmed);
      onChange(category.parent, category.name);
      setSuccess(`${category.name} added under ${category.parent}.`);
      setAdding(false);
      setName('');
    } catch (requestError) {
      setError(requestError?.response?.data?.error || requestError?.message || 'Unable to add category.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`grid ${compact ? 'gap-2' : 'gap-4 sm:grid-cols-2'}`}>
      <label className="grid gap-2">
        <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-black text-slate-700`}>Applicant Type{required && <b className="text-red-500"> *</b>}</span>
        <select value={parent} onChange={(event) => changeParent(event.target.value)} className={inputClass}>
          <option value="">Select PIBO / SIMP / PWP</option>
          {PIBO_PARENTS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      {parent && (
        <label className="grid gap-2">
          <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-black text-slate-700`}>{parent} Category{required && <b className="text-red-500"> *</b>}</span>
          <select value={value} onChange={(event) => changeChild(event.target.value)} disabled={loading} className={inputClass}>
            <option value="">{loading ? 'Loading categories…' : `Select ${parent} category`}</option>
            {childOptions.map((category) => <option key={`${category.parent}:${category.name.toLowerCase()}`} value={category.name}>{category.name}</option>)}
            <option value={ADD_NEW_VALUE}>＋ Add New Category</option>
          </select>
        </label>
      )}
      {success && <p className={`flex items-center gap-2 text-xs font-bold text-emerald-700 ${compact ? '' : 'sm:col-span-2'}`}><CheckCircle2 className="h-4 w-4" />{success}</p>}
      {error && !adding && <p className={`text-xs font-bold text-red-600 ${compact ? '' : 'sm:col-span-2'}`}>{error}</p>}
      {adding && createPortal(
        <div className="fixed inset-0 z-[10000] grid place-items-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setAdding(false); }}>
          <form onSubmit={submitNewCategory} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-widest text-emerald-700">{parent} category</p><h3 className="mt-1 text-xl font-black text-slate-950">Add New Category</h3></div><button type="button" disabled={saving} onClick={() => setAdding(false)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
            <label className="mt-5 grid gap-2"><span className="text-xs font-black text-slate-700">Category name</span><input autoFocus maxLength={60} value={name} onChange={(event) => setName(event.target.value)} className="min-h-12 rounded-xl border border-slate-200 px-4 text-sm font-black outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100" placeholder={`New ${parent} category`} /></label>
            <p className="mt-2 text-right text-xs font-bold text-slate-400">{name.trim().length}/60</p>
            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{error}</p>}
            <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={saving} onClick={() => setAdding(false)} className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-black text-slate-700">Cancel</button><button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{saving ? 'Saving…' : 'Add Category'}</button></div>
          </form>
        </div>, document.body
      )}
    </div>
  );
}
