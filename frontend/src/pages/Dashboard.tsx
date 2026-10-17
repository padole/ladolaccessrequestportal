import { Link } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import type { AccessRequest, Page, Stats, Status } from '../api/types';
import { useAuth } from '../hooks/auth';
import { useFetch } from '../hooks/useFetch';
import { formatDate } from '../format';
import { Empty, Spinner, StatusBadge } from '../components/ui';

const TILES: { key: Status | 'total'; label: string; color: string }[] = [
  { key: 'total', label: 'Total requests', color: 'var(--brand)' },
  { key: 'PENDING', label: 'Pending', color: 'var(--warning)' },
  { key: 'APPROVED', label: 'Approved', color: 'var(--success)' },
  { key: 'REJECTED', label: 'Rejected', color: 'var(--danger)' },
  { key: 'TERMINATED', label: 'Terminated', color: 'var(--text-faint)' },
  { key: 'EXPIRED', label: 'Expired', color: 'var(--gold)' },
];

function StatTiles({ stats, base }: { stats: Stats; base: string }) {
  return (
    <div className="stats">
      {TILES.map((t) => {
        const value = t.key === 'total' ? stats.total : stats.counts[t.key];
        const to = t.key === 'total' ? base : `${base}?status=${t.key}`;
        return (
          <Link className="card stat" to={to} key={t.key}>
            <span className="label"><span className="dot" style={{ background: t.color }} />{t.label}</span>
            <span className="value">{value}</span>
          </Link>
        );
      })}
    </div>
  );
}

function RecentList({ title, url, base, showRequester, empty }: { title: string; url: string; base: string; showRequester?: boolean; empty: React.ReactNode }) {
  const { data, loading } = useFetch<Page<AccessRequest>>(url);
  return (
    <div className="card">
      <div className="card-header">
        <h2>{title}</h2>
        <Link to={base} className="row small">View all <ArrowRight size={14} /></Link>
      </div>
      {loading && !data ? <Spinner fill /> : !data?.items.length ? empty : (
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/requests/${r.id}`} className="cell-main mono">{r.request_no}</Link>
                    <div className="cell-sub">{showRequester ? `by ${r.created_by?.full_name}` : formatDate(r.submitted_at)}</div>
                  </td>
                  <td>
                    <div className="cell-main">{r.fullname}</div>
                    <div className="cell-sub">{r.company}</div>
                  </td>
                  <td className="muted">{formatDate(r.expected_date)}</td>
                  <td className="shrink"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user, isController, isAccessAdmin, canViewAll } = useAuth();
  const { data: mine } = useFetch<Stats>(isAccessAdmin ? null : '/api/requests/stats');
  const { data: all } = useFetch<Stats>(canViewAll ? '/api/requests/stats?scope=all' : null);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>{greeting}, {user?.first_name}</h1>
          <p className="muted">
            {isController ? 'Here is what needs your attention across the portal.'
              : isAccessAdmin ? 'Check visitors at the entrance against their approved requests.'
                : 'Here is a summary of your access requests.'}
          </p>
        </div>
        {!isAccessAdmin && <Link className="btn btn-primary" to="/requests/new"><Plus size={16} /> New request</Link>}
      </div>

      {isAccessAdmin && (
        <section>
          <h3 style={{ marginBottom: 12 }}>All requests</h3>
          {all ? <StatTiles stats={all} base="/admin/requests" /> : <Spinner fill />}
          <RecentList
            title="Latest requests"
            url="/api/requests?scope=all&per_page=8"
            base="/admin/requests"
            showRequester
            empty={<Empty title="No requests yet">Submitted requests will appear here.</Empty>}
          />
        </section>
      )}

      {isController && (
        <section>
          <h3 style={{ marginBottom: 12 }}>Organisation overview</h3>
          {all ? <StatTiles stats={all} base="/admin/requests" /> : <Spinner fill />}
          <RecentList
            title="Awaiting review"
            url="/api/requests?scope=all&status=PENDING&sort=submitted_at&per_page=6"
            base="/admin/requests?status=PENDING"
            showRequester
            empty={<Empty title="All caught up">No requests are waiting for review.</Empty>}
          />
        </section>
      )}

      {!isAccessAdmin && <section>
        {isController && <h3 style={{ marginBottom: 12 }}>My requests</h3>}
        {mine ? <StatTiles stats={mine} base="/requests" /> : <Spinner fill />}
        {!!mine?.counts.DRAFT && (
          <div className="alert alert-info" style={{ marginBottom: 16 }}>
            You have {mine.counts.DRAFT} unsubmitted draft{mine.counts.DRAFT === 1 ? '' : 's'}. <Link to="/drafts">Finish them</Link>
          </div>
        )}
        <RecentList
          title="Recent requests"
          url="/api/requests?per_page=5"
          base="/requests"
          empty={<Empty title="No requests yet"><Link className="btn btn-primary" to="/requests/new">Create a request</Link></Empty>}
        />
      </section>}
    </div>
  );
}
