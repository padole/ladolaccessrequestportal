import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, CheckCircle2, Users, XCircle } from 'lucide-react';
import { api, type ApiError } from '../api/client';
import type { GroupSummary, Status } from '../api/types';
import { useAuth } from '../hooks/auth';
import { useFetch } from '../hooks/useFetch';
import { useToast } from '../hooks/toast';
import { formatDate, formatDateTime } from '../format';
import { Empty, Field, Modal, Spinner, StatusBadge, STATUS_LABEL } from '../components/ui';

type Action = 'APPROVED' | 'REJECTED' | 'TERMINATED';
const ACTIONS: Record<Action, { label: string; tone: string; icon: JSX.Element; needsReason: boolean }> = {
  APPROVED: { label: 'Approve', tone: 'btn-success', icon: <CheckCircle2 size={15} />, needsReason: false },
  REJECTED: { label: 'Reject', tone: 'btn-danger', icon: <XCircle size={15} />, needsReason: true },
  TERMINATED: { label: 'Terminate', tone: 'btn-danger', icon: <Ban size={15} />, needsReason: true },
};

export default function GroupDetail() {
  const { groupNo = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, isController } = useAuth();
  const { data, error, loading, setData } = useFetch<{ group: GroupSummary }>(`/api/groups/${encodeURIComponent(groupNo)}`);
  const [selected, setSelected] = useState<number[]>([]);
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Spinner fill />;
  if (error || !data) return <Empty title="Group not found"><Link className="btn" to="/dashboard">Back to dashboard</Link></Empty>;

  const g = data.group;
  const isOwner = g.created_by?.id === user?.id;
  const canReview = isController && !isOwner;
  // Rows the chosen action can apply to: the selection, or the whole group when nothing is ticked.
  const targets = (a: Action) => g.requests.filter((r) =>
    (selected.length === 0 || selected.includes(r.id)) && r.allowed_transitions.includes(a as Status));
  const allSelected = selected.length === g.requests.length;

  const open = (a: Action) => { setAction(a); setNote(''); setNoteError(''); };

  const run = async () => {
    if (!action) return;
    if (ACTIONS[action].needsReason && !note.trim()) {
      setNoteError('Please give a reason. It is included in the email to the requester.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ group: GroupSummary; updated: number; skipped: unknown[] }>(
        `/api/groups/${encodeURIComponent(g.group_no)}/status`,
        { status: action, note, ids: targets(action).map((r) => r.id) },
      );
      setData({ group: res.group });
      setSelected([]);
      setAction(null);
      toast(`${res.updated} visitor${res.updated === 1 ? '' : 's'} ${STATUS_LABEL[action].toLowerCase()}.`
        + (res.skipped.length ? ` ${res.skipped.length} skipped.` : ''));
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
      <button className="backlink" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0 }} onClick={() => navigate(-1)}>
        <ArrowLeft size={14} /> Back
      </button>
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 10 }}>
            <Users size={22} />
            <h1 className="mono" style={{ fontSize: 22 }}>{g.group_no}</h1>
          </div>
          <p className="muted">
            {g.size} visitors · submitted {formatDateTime(g.submitted_at)}
            {g.created_by && !isOwner && <> by <strong>{g.created_by.full_name}</strong> ({g.created_by.email})</>}
          </p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {(Object.keys(g.counts) as Status[]).map((s) => (
            <span key={s} className={`badge badge-${s}`}>{g.counts[s]} {STATUS_LABEL[s]}</span>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <dl className="card-body dl">
          <div><dt>Visit</dt><dd>{formatDate(g.expected_date)} – {formatDate(g.departure_date)}</dd></div>
          <div><dt>Host</dt><dd>{g.host || '—'}</dd></div>
          <div className="span-2"><dt>Purpose</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{g.purpose || '—'}</dd></div>
        </dl>
      </div>

      <div className="card">
        {canReview && (
          <div className="action-bar">
            <span className="muted small" style={{ marginRight: 'auto' }}>
              {selected.length ? `${selected.length} selected` : 'No visitors ticked: actions apply to everyone they can.'}
            </span>
            {(Object.keys(ACTIONS) as Action[]).map((a) => {
              const n = targets(a).length;
              return (
                <button key={a} className={`btn btn-sm ${ACTIONS[a].tone}`} disabled={n === 0} onClick={() => open(a)}>
                  {ACTIONS[a].icon} {ACTIONS[a].label} {selected.length ? 'selected' : 'all'} ({n})
                </button>
              );
            })}
          </div>
        )}
        {isController && isOwner && (
          <div className="alert alert-info" style={{ margin: 16 }}>This is your own group, so another Access Controller needs to review it.</div>
        )}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {canReview && (
                  <th className="shrink">
                    <input type="checkbox" aria-label="Select all visitors" checked={allSelected}
                      onChange={() => setSelected(allSelected ? [] : g.requests.map((r) => r.id))} />
                  </th>
                )}
                <th>Request</th><th>Visitor</th><th className="hide-sm">Contact</th><th>ID card</th><th className="shrink">Status</th>
              </tr>
            </thead>
            <tbody>
              {g.requests.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => navigate(`/requests/${r.id}`)}>
                  {canReview && (
                    <td className="shrink" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select ${r.fullname}`} checked={selected.includes(r.id)}
                        onChange={() => setSelected((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))} />
                    </td>
                  )}
                  <td className="mono">{r.request_no}</td>
                  <td><div className="cell-main">{r.fullname}</div><div className="cell-sub">{[r.company, r.job_title, r.country].filter(Boolean).join(' · ')}</div></td>
                  <td className="hide-sm muted small">{[r.email, r.phone].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="muted">{r.id_card_label ?? '—'}</td>
                  <td className="shrink"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {action && (
        <Modal
          title={`${ACTIONS[action].label} ${targets(action).length} visitor${targets(action).length === 1 ? '' : 's'}?`}
          onClose={() => !busy && setAction(null)}
          actions={<>
            <button className="btn" onClick={() => setAction(null)} disabled={busy}>Cancel</button>
            <button className={`btn ${ACTIONS[action].tone}`} onClick={run} disabled={busy}>{busy ? 'Saving…' : ACTIONS[action].label}</button>
          </>}
        >
          <p className="muted small">{targets(action).map((r) => r.fullname).join(', ')}</p>
          <p className="muted small">The requester gets one summary email.</p>
          <Field label={ACTIONS[action].needsReason ? 'Reason (required)' : 'Note (optional)'} error={noteError} htmlFor="gnote">
            <textarea id="gnote" className="textarea" autoFocus value={note} onChange={(e) => { setNote(e.target.value); setNoteError(''); }} />
          </Field>
        </Modal>
      )}
    </>
  );
}
