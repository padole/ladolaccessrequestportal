import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { api, type ApiError } from '../../api/client';
import type { AccessRequest, Page, User } from '../../api/types';
import { useAuth } from '../../hooks/auth';
import { useFetch } from '../../hooks/useFetch';
import { useToast } from '../../hooks/toast';
import { formatDate, formatDateTime } from '../../format';
import { Confirm, Empty, Spinner, StatusBadge, initials } from '../../components/ui';
import { RoleBadge, useUserActions } from '../../components/RoleControls';

export default function AdminUserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user: me } = useAuth();
  const { data, loading, error, setData } = useFetch<{ user: User }>(`/api/admin/users/${id}`);
  const { data: requests } = useFetch<Page<AccessRequest>>(
    `/api/requests?scope=all&user_id=${id}&per_page=20`,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const { roleSelect, activeButton, dialog } = useUserActions((u) => setData({ user: { ...u, request_counts: data?.user.request_counts } }));

  if (loading && !data) return <Spinner fill />;
  if (error || !data) return <Empty title="User not found"><Link className="btn" to="/admin/users">Back to users</Link></Empty>;
  const u = data.user;
  const theirs = requests?.items ?? [];

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`/api/admin/users/${u.id}`);
      toast(`${u.full_name} deleted.`);
      navigate('/admin/users');
    } catch (e) {
      toast((e as ApiError).message, 'error');
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <>
      <Link className="backlink" to="/admin/users"><ArrowLeft size={14} /> All users</Link>
      <div className="page-head">
        <div className="row" style={{ gap: 14 }}>
          <span className="avatar" style={{ width: 48, height: 48, fontSize: 16 }}>{initials(u.full_name)}</span>
          <div>
            <h1>{u.full_name}</h1>
            <div className="row" style={{ marginTop: 4 }}>
              <RoleBadge role={u.role} />
              <span className={`badge badge-${u.is_active ? 'active' : 'disabled'}`}>{u.is_active ? 'Active' : 'Disabled'}</span>
            </div>
          </div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {roleSelect(u)}
          {activeButton(u)}
          <button className="btn" disabled={u.id === me?.id} onClick={() => setConfirmDelete(true)} style={{ color: 'var(--danger)' }}>
            <Trash2 size={15} /> Delete
          </button>
        </div>
      </div>

      <div className="detail-grid">
        <div className="card">
          <div className="card-header">
            <h2>Requests</h2>
            {!!requests && requests.total > requests.items.length && <span className="muted small">Latest {requests.items.length} of {requests.total}</span>}
          </div>
          {!theirs.length ? <Empty title="No submitted requests" /> : (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {theirs.map((r) => (
                    <tr key={r.id} className="clickable" onClick={() => navigate(`/requests/${r.id}`)}>
                      <td><div className="cell-main mono">{r.request_no}</div><div className="cell-sub">{formatDate(r.submitted_at)}</div></td>
                      <td><div className="cell-main">{r.fullname}</div><div className="cell-sub">{r.company}</div></td>
                      <td className="shrink"><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="stack">
          <div className="card">
            <div className="card-header"><h2>Details</h2></div>
            <dl className="card-body dl" style={{ gridTemplateColumns: '1fr' }}>
              <div><dt>Email</dt><dd><a href={`mailto:${u.email}`}>{u.email}</a></dd></div>
              <div><dt>Phone</dt><dd>{u.phone}</dd></div>
              <div><dt>Job title</dt><dd>{u.job_title || '—'}</dd></div>
              <div><dt>Company</dt><dd>{u.company || '—'}</dd></div>
              <div><dt>Joined</dt><dd>{formatDate(u.created_at)}</dd></div>
              <div><dt>Last sign-in</dt><dd>{formatDateTime(u.last_login_at)}</dd></div>
            </dl>
          </div>
          {u.request_counts && (
            <div className="card">
              <div className="card-header"><h2>Request summary</h2></div>
              <div className="card-body stack-sm">
                {Object.entries(u.request_counts).map(([s, n]) => (
                  <div className="row-between" key={s}><StatusBadge status={s as AccessRequest['status']} /><strong>{n}</strong></div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {dialog}
      {confirmDelete && (
        <Confirm
          title={`Delete ${u.full_name}?`}
          message="This permanently deletes the account, all of their access requests and uploaded documents. Consider disabling the account instead."
          confirmLabel="Delete permanently"
          tone="danger"
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
