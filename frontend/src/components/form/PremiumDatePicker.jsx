import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_FORMATTER = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });
const DISPLAY_FORMATTER = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function PremiumDatePicker({ value = '', onChange, disabled = false, readOnly = false, className = '', placeholder = 'Select date', min, max, 'aria-label': ariaLabel }) {
  const selected = parseDate(value);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(selected || new Date());
  const [position, setPosition] = useState({ top: 0, left: 0, width: 320 });
  const triggerRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => { if (selected) setViewDate(selected); }, [value]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!triggerRef.current?.contains(event.target) && !popupRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return undefined;
    const place = () => {
      const rect = triggerRef.current.getBoundingClientRect();
      const width = Math.min(336, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const spaceBelow = window.innerHeight - rect.bottom;
      setPosition({ top: spaceBelow >= 390 ? rect.bottom + 8 : Math.max(12, rect.top - 378), left, width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);

  const days = useMemo(() => {
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [viewDate]);

  const choose = (date) => {
    const key = dateKey(date);
    if ((min && key < min) || (max && key > max)) return;
    onChange?.({ target: { value: key } });
    setOpen(false);
  };

  const popup = open && createPortal(
    <div ref={popupRef} className="premium-date-popover" style={{ top: position.top, left: position.left, width: position.width }} role="dialog" aria-label="Choose date">
      <div className="premium-date-popover__accent" />
      <div className="premium-date-popover__header">
        <div><span>Choose a date</span><strong>{MONTH_FORMATTER.format(viewDate)}</strong></div>
        <div className="premium-date-popover__nav">
          <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft /></button>
          <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight /></button>
        </div>
      </div>
      <div className="premium-date-grid premium-date-grid--weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="premium-date-grid">
        {days.map((date) => {
          const key = dateKey(date);
          const outside = date.getMonth() !== viewDate.getMonth();
          const isSelected = key === value;
          const isToday = key === dateKey(new Date());
          const unavailable = (min && key < min) || (max && key > max);
          return <button type="button" key={key} disabled={unavailable} className={[outside && 'is-outside', isSelected && 'is-selected', isToday && 'is-today'].filter(Boolean).join(' ')} onClick={() => choose(date)}>{date.getDate()}</button>;
        })}
      </div>
      <div className="premium-date-popover__footer">
        <button type="button" className="premium-date-clear" disabled={!value} onClick={() => { onChange?.({ target: { value: '' } }); setOpen(false); }}><X /> Clear</button>
        <button type="button" className="premium-date-today" onClick={() => choose(new Date())}><CalendarDays /> Today</button>
      </div>
    </div>,
    document.body
  );

  return <>
    <button ref={triggerRef} type="button" aria-label={ariaLabel || placeholder} aria-expanded={open} disabled={disabled} className={`premium-date-trigger ${value ? 'has-value' : ''} ${className}`.trim()} onClick={() => !readOnly && setOpen((current) => !current)}>
      <span className="premium-date-trigger__icon"><CalendarDays /></span>
      <span className="premium-date-trigger__copy"><small>{value ? 'Selected date' : 'Date'}</small><strong>{selected ? DISPLAY_FORMATTER.format(selected) : placeholder}</strong></span>
      <ChevronRight className={`premium-date-trigger__chevron ${open ? 'is-open' : ''}`} />
    </button>
    {popup}
  </>;
}
