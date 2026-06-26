import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

const toastStyles = {
  success: {
    icon: CheckCircle2,
    shell: 'toast-message-success',
    label: 'Success'
  },
  error: {
    icon: XCircle,
    shell: 'toast-message-error',
    label: 'Error'
  },
  warning: {
    icon: AlertTriangle,
    shell: 'toast-message-warning',
    label: 'Warning'
  },
  info: {
    icon: Info,
    shell: 'toast-message-info',
    label: 'Info'
  }
};

export default function ToastMessage({ type = 'info', children, actionLabel = '', onAction, className = '' }) {
  const style = toastStyles[type] || toastStyles.info;
  const Icon = style.icon;

  return (
    <div className={`toast-message ${style.shell} ${className}`} role="status" aria-label={style.label}>
      <span className="toast-message-icon">
        <Icon className="h-5 w-5" />
      </span>
      <p className="min-w-0 flex-1 text-sm font-black leading-5 text-slate-700">{children}</p>
      {onAction ? (
        <button type="button" onClick={onAction} className="toast-message-action">
          {actionLabel || 'Action'}
        </button>
      ) : null}
    </div>
  );
}

export function ToastClose({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="toast-message-close" aria-label="Close message">
      <X className="h-4 w-4" />
    </button>
  );
}
