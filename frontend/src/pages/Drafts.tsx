import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileClock, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { api, type ApiError } from '../api/client';
import type { AccessRequest, Page } from '../api/types';
import { useFetch } from '../hooks/useFetch';
import { useToast } from '../hooks/toast';
import { formatDate, formatDateTime } from '../format';
import { Confirm, Empty, ErrorAlert, Pager, Spinner } from '../components/ui';

interface BulkResult { submitted: string[]; failed: { id: number; error: string; fields: string[] }[] }

export default function Drafts() {
  const toast = useToast();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useFetch<Page<AccessRequest>>(`/api/requests?status=DRAFT&sort=-created_at&page=${page}`);
  const [selected, setSelected] = useState<number[]>([]);
  const [deleting, setDeleting] = useState<AccessRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<Record<number, string>>({});

  const items = data?.items ?? [];
  const allSelected = items.length > 0 && items.every((d) => selected.includes(d.id));
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const submitSelected = async () => {
    setBusy(true);
    try {
      const res = await api.post<BulkResult>('/api/requests/submit-drafts', { ids: selected });
      if (res.submitted.length) toast(`${res.submitted.length} request${res.submitted.length === 1 ? '' : 's'} submitted.`);
      if (res.failed.length) {
        toast(`${res.failed.length} draft${res.failed.length === 1 ? ' is' : 's are'} incomplete. Open them to finish.`, 'error');
        setFailures(Object.fromEntries(res.failed.map((f) => [f.id, f.error])));
      } else {
        setFailures({});
      }
      setSelected(res.failed.map((f) => f.id));
      reload();
    } catch (e) {
      toast((e as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/api/requests/${deleting.id}`);
      toast('Draft deleted.');
      setSelected((s) => s.filter((x) => x !== deleting.id));
      setDeleting(null);
      reload();
    } catch (e) {
      toast((e as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Drafts</h1>
          <p className="muted">Requests you've started but not yet submitted. Only you can see them.</p>
        </div>
        <div className="row">
          {selected.length > 0 && (
            <button className="btn btn-primary" disabled={busy} onClick={submitSelected}>
              <Send size={16} /> Submit {selected.length} selected
            </button>
          )}
          <Link className="btn" to="/requests/new"><Plus size={16} /> New request</Link>
        </div>
      </div>

      <div className="card">
        <ErrorAlert message={error?.message} />
        {loading && !data ? (
          <Spinner fill />
        ) : items.length === 0 ? (
          <Empty title="No drafts" icon={<FileClock size={36} strokeWidth={1.5} />}>
            <p className="muted">Use “Save draft” on a new request to finish it later.</p>
          </Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="shrink">
                      <input type="checkbox" aria-label="Select all drafts" checked={allSelected}
                        onChange={() => setSelected(allSelected ? [] : items.map((d) => d.id))} />
                    </th>
                    <th>Visitor</th>
                    <th>Visit dates</th>
                    <th>Last edited</th>
                    <th className="shrink" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => (
                    <tr key={d.id}>
                      <td className="shrink">
                        <input type="checkbox" aria-label={`Select draft for ${d.fullname || 'untitled'}`}
                          checked={selected.includes(d.id)} onChange={() => toggle(d.id)} />
                      </td>
                      <td>
                        <div className="cell-main">{d.fullname || <span className="faint">Untitled draft</span>}</div>
                        <div className="cell-sub">{[d.company, d.host && `Host: ${d.host}`].filter(Boolean).join(' · ') || 'No company yet'}</div>
                        {failures[d.id] && <div className="small" style={{ color: 'var(--danger)' }}>{failures[d.id]}</div>}
                      </td>
                      <td>{d.expected_date ? `${formatDate(d.expected_date)} – ${formatDate(d.departure_date)}` : <span className="faint">Not set</span>}</td>
                      <td className="muted">{formatDateTime(d.updated_at ?? d.created_at)}</td>
                      <td className="shrink">
                        <div className="row">
                          <button className="btn btn-sm" onClick={() => navigate(`/requests/${d.id}/edit`)}><Pencil size={14} /> Edit</button>
                          <button className="icon-btn" aria-label="Delete draft" onClick={() => setDeleting(d)}><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
          </>
        )}
      </div>

      {deleting && (
        <Confirm
          title="Delete draft?"
          message={`The draft for ${deleting.fullname || 'this visitor'} and any files attached to it will be permanently deleted.`}
          confirmLabel="Delete draft"
          tone="danger"
          busy={busy}
          onConfirm={remove}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
