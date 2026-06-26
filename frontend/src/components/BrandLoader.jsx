import React, { useState } from 'react';
import { brand } from '../constants/brand';

function LoaderRing() {
  return (
    <svg className="crm-loader-ring" width={240} height={240} viewBox="0 0 240 240" aria-hidden="true">
      <circle className="crm-loader-ring__path crm-loader-ring__path--a" cx={120} cy={120} r={105} fill="none" strokeWidth={20} strokeDasharray="0 660" strokeDashoffset={-330} strokeLinecap="round" />
      <circle className="crm-loader-ring__path crm-loader-ring__path--b" cx={120} cy={120} r={35} fill="none" strokeWidth={20} strokeDasharray="0 220" strokeDashoffset={-110} strokeLinecap="round" />
      <circle className="crm-loader-ring__path crm-loader-ring__path--c" cx={85} cy={120} r={70} fill="none" strokeWidth={20} strokeDasharray="0 440" strokeLinecap="round" />
      <circle className="crm-loader-ring__path crm-loader-ring__path--d" cx={155} cy={120} r={70} fill="none" strokeWidth={20} strokeDasharray="0 440" strokeLinecap="round" />
    </svg>
  );
}

function CommandLoader({ message, dismissAfterMs = 0 }) {
  return (
    <div
      className={`fixed inset-0 z-[9999] grid place-items-center bg-[#f3f6f8] px-4 ${dismissAfterMs ? 'brand-loader-dismiss' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={message}
      style={dismissAfterMs ? { '--loader-dismiss-delay': `${dismissAfterMs}ms` } : undefined}
    >
      <div className="grid h-28 w-28 place-items-center sm:h-36 sm:w-36">
        <LoaderRing />
      </div>
    </div>
  );
}

export default function BrandLoader({
  title = brand.name,
  eyebrow = 'Anant Tattva',
  subtitle = 'E-waste compliance intelligence',
  message = 'Preparing workspace',
  dismissAfterMs = 0
}) {
  const [showFullLoader] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const key = 'crm.brandLoader.fullShown';
      const hasShown = window.sessionStorage.getItem(key) === '1';
      if (!hasShown) window.sessionStorage.setItem(key, '1');
      return !hasShown;
    } catch {
      return false;
    }
  });

  if (!showFullLoader) {
    return <CommandLoader message={message} />;
  }

  return <CommandLoader message={message} dismissAfterMs={dismissAfterMs} />;
}
