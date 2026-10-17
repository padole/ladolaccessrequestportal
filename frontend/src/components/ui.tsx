import { useEffect, useState, type ReactNode, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff, Inbox, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import type { Status } from '../api/types';

export const STATUS_LABEL: Record<Status, string> = {
  DRAFT: 'Draft',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  TERMINATED: 'Terminated',
  EXPIRED: 'Expired',
};

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function Spinner({ fill = false }: { fill?: boolean }) {
  const el = <div className="spinner" role="status" aria-label="Loading" />;
  return fill ? <div className="center-fill">{el}</div> : el;
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox size={36} strokeWidth={1.5} />}
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function ErrorAlert({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="alert alert-error" role="alert">
      <AlertCircle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
      <span>{message}</span>
    </div>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  htmlFor?: string;
  children: ReactNode;
}

export function Field({ label, error, hint, className = '', htmlFor, children }: FieldProps) {
  return (
    <div className={`field ${error ? 'invalid' : ''} ${className}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw">
      <input {...props} type={show ? 'text' : 'password'} className="input" />
      <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (total === 0) return null;
  return (
    <div className="pager">
      <span className="muted small">
        Page {page} of {Math.max(pages, 1)} · {total} result{total === 1 ? '' : 's'}
      </span>
      <div className="row">
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={14} /> Previous
        </button>
        <button className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

interface ModalProps {
  title: string;
  children?: ReactNode;
  onClose: () => void;
  actions: ReactNode;
}

export function Modal({ title, children, onClose, actions }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-body">
          <h2 id="modal-title">{title}</h2>
          {children}
        </div>
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  );
}

interface ConfirmProps {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function Confirm({ title, message, confirmLabel, tone = 'primary', busy, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      actions={
        <>
          <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={`btn btn-${tone}`} onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="muted">{message}</p>
    </Modal>
  );
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
}
