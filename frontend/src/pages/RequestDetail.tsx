import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Users, Copy, ShieldAlert, ShieldCheck, ArrowLeft, CheckCircle2, Download, ExternalLink, Paperclip, Pencil, RotateCcw, Ban, XCircle } from 'lucide-react';
import { api, type ApiError } from '../api/client';
import type { AccessRequestDetail } from '../api/types';
import { useAuth } from '../hooks/auth';
import { useFetch } from '../hooks/useFetch';
import { useToast } from '../hooks/toast';
import { formatDate, formatDateTime, todayIso } from '../format';
import { Empty, Field, Modal, Spinner, StatusBadge } from '../components/ui';

/** Statuses a reviewer can move a request to. */
type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'TERMINATED';

const ACTIONS: Record<ReviewStatus, { label: string; tone: string; icon: JSX.Element; needsReason: boolean; verb: string }> = {
  APPROVED: { label: 'Approve', tone: 'btn-success', icon: <CheckCircle2 size={16} />, needsReason: false, verb: 'approved' },
  REJECTED: { label: 'Reject', tone: 'btn-danger', icon: <XCircle size={16} />, needsReason: true, verb: 'rejected' },
  TERMINATED: { label: 'Terminate access', tone: 'btn-danger', icon: <Ban size={16} />, needsReason: true, verb: 'terminated' },
  PENDING: { label: 'Reopen for review', tone: '', icon: <RotateCcw size={16} />, needsReason: false, verb: 'reopened' },
};

export default function RequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, isController, canViewAll } = useAuth();
  const { data, error, loading, setData } = useFetch<{ request: AccessRequestDetail }>(`/api/requests/${id}`);
  const [action, setAction] = useState<ReviewStatus | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Spinner fill />;
  if (error || !data) {
    return <Empty title="Request not found"><Link className="btn" to="/dashboard">Back to dashboard</Link></Empty>;
  }
  const r = data.request;
  const isOwner = r.created_by?.id === user?.id;
  const canReview = isController && !isOwner && r.allowed_transitions.length > 0;
  const entry = entryStatus(r);
  const docUrl = (name: string, download = false) =>
    `/api/requests/${r.id}/documents/${encodeURIComponent(name)}${download ? '?download=1' : ''}`;

  const openAction = (s: ReviewStatus) => {
    setAction(s);
    setNote('');
    setNoteError('');
  };

  const applyAction = async () => {
    if (!action) return;
    if (ACTIONS[action].needsReason && !note.trim()) {
      setNoteError('Please give a reason. It will be included in the email to the requester.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ request: AccessRequestDetail }>(`/api/requests/${r.id}/status`, { status: action, note });
      setData(res);
      toast(`Request ${r.request_no} ${ACTIONS[action].verb}.`);
      setAction(null);
    } catch (e) {
      const apiErr = e as ApiError;
      if (apiErr.fields.note) setNoteError(apiErr.fields.note);
      else toast(apiErr.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="backlink btn-ghost" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0 }} onClick={() => navigate(-1)}>
        <ArrowLeft size={14} /> Back
      </button>
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 12 }}>
            <h1 className={r.request_no ? 'mono' : ''} style={{ fontSize: 22 }}>{r.request_no ?? 'Draft request'}</h1>
            <StatusBadge status={r.status} />
          </div>
          <p className="muted">
            {r.submitted_at ? `Submitted ${formatDateTime(r.submitted_at)}` : `Created ${formatDateTime(r.created_at)}`}
            {r.created_by && !isOwner && <> by <strong>{r.created_by.full_name}</strong> ({r.created_by.email})</>}
          </p>
          {r.group_no && (
            <Link className="group-tag" to={`/groups/${r.group_no}`} style={{ marginTop: 8 }}>
              <Users size={12} /> Part of group {r.group_no}. View the whole group
            </Link>
          )}
        </div>
        {r.status === 'DRAFT' && isOwner && (
          <Link className="btn btn-primary" to={`/requests/${r.id}/edit`}><Pencil size={16} /> Continue editing</Link>
        )}
        {r.status === 'EXPIRED' && isOwner && (
          <Link className="btn btn-primary" to={`/requests/new?from=${r.id}`}><Copy size={16} /> Raise a new request</Link>
        )}
      </div>

      <div className="detail-grid">
        <div className="stack">
          <div className="card">
            <div className="card-header"><h2>Visitor</h2></div>
            <dl className="card-body dl">
              <div><dt>Full name</dt><dd>{r.fullname || '—'}</dd></div>
              <div><dt>Company</dt><dd>{r.company || '—'}</dd></div>
              {r.job_role && <div><dt>Job role</dt><dd>{r.job_role}</dd></div>}
              <div><dt>ID card</dt><dd>{r.id_card_label ?? '—'}</dd></div>
              <div><dt>Email</dt><dd>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : '—'}</dd></div>
              <div><dt>Phone</dt><dd>{r.phone ? <a href={`tel:${r.phone}`}>{r.phone}</a> : '—'}</dd></div>
            </dl>
          </div>
          <div className="card">
            <div className="card-header"><h2>Visit</h2></div>
            <dl className="card-body dl">
              <div><dt>Expected arrival</dt><dd>{formatDate(r.expected_date)}</dd></div>
              <div><dt>Departure</dt><dd>{formatDate(r.departure_date)}</dd></div>
              <div><dt>Duration</dt><dd>{r.duration ? `${r.duration} day${r.duration === '1' ? '' : 's'}` : '—'}</dd></div>
              <div><dt>Host</dt><dd>{r.host || '—'}</dd></div>
              {r.location && <div><dt>Location</dt><dd>{r.location}</dd></div>}
              <div className="span-2"><dt>Purpose</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{r.purpose || '—'}</dd></div>
            </dl>
          </div>
          <div className="card">
            <div className="card-header"><h2>Documents</h2><span className="muted small">{r.documents.length} file{r.documents.length === 1 ? '' : 's'}</span></div>
            <div className="card-body">
              {r.documents.length === 0 ? (
                <p className="muted">No documents attached.</p>
              ) : (
                <div className="doc-list">
                  {r.documents.map((d) => (
                    <div className="doc" key={d.name}>
                      <Paperclip size={16} />
                      <span className="name">{d.label}</span>
                      <a className="btn btn-sm" href={docUrl(d.name)} target="_blank" rel="noreferrer"><ExternalLink size={14} /> View</a>
                      <a className="icon-btn" href={docUrl(d.name, true)} aria-label={`Download ${d.label}`}><Download size={16} /></a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="stack">
          {canViewAll && r.status !== 'DRAFT' && (
            <div className={`card entry entry-${entry.tone}`}>
              <div className="card-body row" style={{ gap: 12, alignItems: 'flex-start' }}>
                {entry.tone === 'ok' ? <ShieldCheck size={28} /> : <ShieldAlert size={28} />}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{entry.title}</div>
                  <div className="small">{entry.detail}</div>
                </div>
              </div>
            </div>
          )}
          {canReview && (
            <div className="card">
              <div className="card-header"><h2>Review</h2></div>
              <div className="card-body stack-sm">
                {r.allowed_transitions.map((s) => {
                  const a = ACTIONS[s as ReviewStatus];
                  return (
                    <button key={s} className={`btn btn-block ${a.tone}`} onClick={() => openAction(s as ReviewStatus)}>
                      {a.icon} {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {isController && isOwner && r.status === 'PENDING' && (
            <div className="alert alert-info">This is your own request, so another Access Controller needs to review it.</div>
          )}
          <div className="card">
            <div className="card-header"><h2>Activity</h2></div>
            <div className="card-body timeline">
              <div className="timeline-item">
                <span className="marker" style={{ background: 'var(--text-faint)' }} />
                <div><div>Created</div><div className="small faint">{formatDateTime(r.created_at)}</div></div>
              </div>
              {r.submitted_at && (
                <div className="timeline-item">
                  <span className="marker" style={{ background: 'var(--warning)' }} />
                  <div><div>Submitted for review</div><div className="small faint">{formatDateTime(r.submitted_at)}</div></div>
                </div>
              )}
              {r.reviewed_at && (
                <div className="timeline-item">
                  <span className="marker" style={{ background: r.status === 'APPROVED' || r.status === 'EXPIRED' ? 'var(--success)' : r.status === 'PENDING' ? 'var(--warning)' : 'var(--danger)' }} />
                  <div>
                    <div>
                      {r.status === 'PENDING' ? 'Reopened' : r.status === 'EXPIRED' ? 'Reviewed' : <StatusBadge status={r.status} />}
                      {r.reviewed_by && <span className="muted"> by {r.reviewed_by.full_name}</span>}
                    </div>
                    <div className="small faint">{formatDateTime(r.reviewed_at)}</div>
                    {r.review_note && <p style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>“{r.review_note}”</p>}
                  </div>
                </div>
              )}
              {r.status === 'EXPIRED' && (
                <div className="timeline-item">
                  <span className="marker" style={{ background: 'var(--gold)' }} />
                  <div>
                    <div><StatusBadge status="EXPIRED" /> <span className="muted">after the departure date</span></div>
                    <div className="small faint">{formatDateTime(r.expired_at)}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {action && (
        <Modal
          title={`${ACTIONS[action].label} ${r.request_no}?`}
          onClose={() => !busy && setAction(null)}
          actions={
            <>
              <button className="btn" onClick={() => setAction(null)} disabled={busy}>Cancel</button>
              <button className={`btn ${ACTIONS[action].tone || 'btn-primary'}`} onClick={applyAction} disabled={busy}>
                {busy ? 'Saving…' : ACTIONS[action].label}
              </button>
            </>
          }
        >
          <p className="muted">
            {r.fullname} from {r.company}, {formatDate(r.expected_date)} – {formatDate(r.departure_date)}. The requester will be notified by email.
          </p>
          <Field label={ACTIONS[action].needsReason ? 'Reason (required)' : 'Note (optional)'} error={noteError} htmlFor="note">
            <textarea id="note" className="textarea" autoFocus value={note} onChange={(e) => { setNote(e.target.value); setNoteError(''); }} />
          </Field>
        </Modal>
      )}
    </>
  );
}

/** What the entrance should do with this request today. */
function entryStatus(r: AccessRequestDetail): { tone: 'ok' | 'warn' | 'no'; title: string; detail: string } {
  const today = todayIso();
  const dates = `${formatDate(r.expected_date)} – ${formatDate(r.departure_date)}`;
  if (r.status === 'EXPIRED') {
    return { tone: 'no', title: 'Access expired', detail: `The visit ended on ${formatDate(r.departure_date)}. The visitor needs a new access request.` };
  }
  if (r.status !== 'APPROVED') {
    return { tone: 'no', title: 'Not cleared for entry', detail: `This request is ${r.status.toLowerCase()}.` };
  }
  if (r.expected_date && today < r.expected_date) {
    return { tone: 'warn', title: 'Not yet valid', detail: `Approved for ${dates}. Entry is not allowed before ${formatDate(r.expected_date)}.` };
  }
  if (r.departure_date && today > r.departure_date) {
    return { tone: 'no', title: 'Visit period has ended', detail: `Approved for ${dates}.` };
  }
  return { tone: 'ok', title: 'Cleared for entry today', detail: `Approved for ${dates}. Check the visitor's ID against the details on this page.` };
}
