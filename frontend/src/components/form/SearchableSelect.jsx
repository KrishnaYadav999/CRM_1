import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export default function SearchableSelect({ value = '', options = [], onChange, disabled = false, placeholder = 'Select or type to create new' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const normalized = useMemo(() => options.map((option) => typeof option === 'string' ? ({ value: option, label: option }) : option).filter((option) => option?.value), [options]);
  const filtered = normalized.filter((option) => `${option.label} ${option.value}`.toLowerCase().includes(query.trim().toLowerCase()));

  function positionMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const height = Math.min(310, Math.max(170, filtered.length * 44 + 70));
    setPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - rect.width - 12)),
      top: spaceBelow >= height + 10 ? rect.bottom + 7 : Math.max(12, rect.top - height - 7),
      width: rect.width,
      maxHeight: height
    });
  }

  useEffect(() => {
    if (!open) return undefined;
    positionMenu();
    const close = (event) => {
      if (!triggerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const reposition = () => positionMenu();
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, filtered.length]);

  function choose(option) {
    onChange(option.value);
    setQuery('');
    setOpen(false);
  }

  return (
    <>
      <div ref={triggerRef} className={`relative flex min-h-12 items-center rounded-xl border bg-white transition ${open ? 'border-emerald-500 ring-4 ring-emerald-100' : 'border-slate-200 hover:border-emerald-300'} ${disabled ? 'cursor-not-allowed bg-slate-100 opacity-70' : ''}`}>
        <input value={open ? query : value} disabled={disabled} onFocus={() => { setQuery(''); setOpen(true); }} onChange={(event) => { setQuery(event.target.value); onChange(event.target.value); setOpen(true); }} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm font-black text-slate-800 outline-none placeholder:text-slate-400" />
        {(value || query) && !disabled && <button type="button" onClick={() => { onChange(''); setQuery(''); }} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Clear"><X className="h-4 w-4" /></button>}
        <button type="button" disabled={disabled} onClick={() => { setQuery(''); setOpen((current) => !current); }} className="mr-2 grid h-8 w-8 place-items-center rounded-lg text-emerald-700 hover:bg-emerald-50" aria-label="Toggle options"><ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} /></button>
      </div>
      {open && position && createPortal(
        <div ref={menuRef} style={position} className="fixed z-[9999] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/20">
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-2 text-slate-400"><Search className="h-4 w-4" /><span className="truncate text-xs font-bold">{query ? `Results for “${query}”` : `${normalized.length} options available`}</span></div>
          <div className="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
            {filtered.map((option) => <button key={option.value} type="button" onClick={() => choose(option)} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition ${String(option.value) === String(value) ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950'}`}><span className="truncate">{option.label}</span>{String(option.value) === String(value) && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}</button>)}
            {!filtered.length && <div className="px-4 py-7 text-center"><p className="text-sm font-black text-slate-600">No matching option</p><p className="mt-1 text-xs font-bold text-slate-400">Typed value custom option ke roop mein use hoga.</p></div>}
          </div>
        </div>, document.body
      )}
    </>
  );
}
