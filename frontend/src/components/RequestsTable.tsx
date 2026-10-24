import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Search, SlidersHorizontal, X, Paperclip, Users } from 'lucide-react';
import { toQuery } from '../api/client';
import { ID_CARD_OPTIONS, type AccessRequest, type Page, type Status } from '../api/types';
import { useFetch } from '../hooks/useFetch';
import { formatDate } from '../format';
import { Empty, ErrorAlert, Pager, Spinner, StatusBadge, STATUS_LABEL } from './ui';

const TABS: (Status | '')[] = ['', 'PENDING', 'APPROVED', 'REJECTED', 'TERMINATED', 'EXPIRED'];
const DATE_FILTERS = [
  ['expected_from', 'Arriving from'],
  ['departure_to', 'Departing by'],
  ['created_from', 'Created from'],
  ['created_to', 'Created to'],
] as const;

export function RequestsTable({ scope, emptyAction }: { scope: 'mine' | 'all'; emptyAction?: React.ReactNode }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [showDates, setShowDates] = useState(DATE_FILTERS.some(([k]) => params.get(k)));

  const status = params.get('status') ?? '';
  const filters = {
    scope: scope === 'all' ? 'all' : undefined,
    status,
    search: params.get('search'),
    group_no: params.get('group_no'),
    id_card: params.get('id_card'),
    page: params.get('page'),
    ...Object.fromEntries(DATE_FILTERS.map(([k]) => [k, params.get(k)])),
  };
  const query = toQuery(filters);
  const { data, error, loading } = useFetch<Page<AccessRequest>>(`/api/requests${query}`);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };

  // Debounce typing in the search box.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if ((params.get('search') ?? '') !== search.trim()) update({ search: search.trim() || null });
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasFilters = !!(params.get('search') || params.get('id_card') || DATE_FILTERS.some(([k]) => params.get(k)));
  const exportUrl = `/api/requests/export${toQuery({ ...filters, page: undefined })}`;

  return (
    <div className="card">
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t || 'all'} role="tab" aria-selected={status === t}
            className={`tab ${status === t ? 'active' : ''}`} onClick={() => update({ status: t || null })}>
            {t ? STATUS_LABEL[t] : 'All'}
          </button>
        ))}
      </div>
      <div className={`filters ${showDates ? '' : 'compact'}`}>
        <div className="search">
          <Search size={16} />
          <input className="input" placeholder="Search by request no., visitor, company or host"
            value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search requests" />
        </div>
        {showDates && DATE_FILTERS.map(([key, label]) => (
          <div className="field" key={key}>
            <label htmlFor={key}>{label}</label>
            <input id={key} type="date" className="input" value={params.get(key) ?? ''}
              onChange={(e) => update({ [key]: e.target.value || null })} />
          </div>
        ))}
        <div className="row" style={showDates ? { gridColumn: '1 / -1', justifyContent: 'flex-end' } : undefined}>
          {hasFilters && (
            <button className="btn btn-ghost" onClick={() => {
              setSearch('');
              update({ search: null, id_card: null, ...Object.fromEntries(DATE_FILTERS.map(([k]) => [k, null])) });
            }}>
              <X size={15} /> Clear
            </button>
          )}
          <select className="select" style={{ width: 'auto' }} aria-label="Filter by ID card"
            value={params.get('id_card') ?? ''} onChange={(e) => update({ id_card: e.target.value || null })}>
            <option value="">All ID cards</option>
            {ID_CARD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            <option value="vistor">Visitor ID (old)</option>
            <option value="not_applicable">Not applicable (old)</option>
          </select>
          <button className={`btn ${showDates ? 'btn-primary' : ''}`} onClick={() => setShowDates((s) => !s)}>
            <SlidersHorizontal size={15} /> Filter by Dates
          </button>
          <a className="btn" href={exportUrl}><Download size={15} /> Export CSV</a>
        </div>
      </div>

      {error && <div style={{ padding: 16 }}><ErrorAlert message={error.message} /></div>}
      {loading && !data ? (
        <Spinner fill />
      ) : data && data.items.length === 0 ? (
        <Empty title={hasFilters || status ? 'No requests match these filters' : 'No requests yet'}>
          {!hasFilters && !status && emptyAction}
        </Empty>
      ) : data ? (
        <>
          <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Visitor</th>
                  {scope === 'all' && <th className="hide-sm">Requested by</th>}
                  <th>Visit dates</th>
                  <th className="shrink">Duration</th>
                  <th>ID card</th>
                  <th className="hide-lg">Host</th>
                  <th className="shrink">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => navigate(`/requests/${r.id}`)}>
                    <td>
                      <div className="cell-main mono">{r.request_no}</div>
                      {r.group_no && (
                        <Link className="group-tag" to={`/groups/${r.group_no}`} onClick={(e) => e.stopPropagation()}
                          title="Part of a group request. Open the group.">
                          <Users size={11} /> {r.group_no}
                        </Link>
                      )}
                      <div className="cell-sub">{formatDate(r.submitted_at ?? r.created_at)}</div>
                    </td>
                    <td>
                      <div className="cell-main">{r.fullname}</div>
                      <div className="cell-sub">{r.company}</div>
                    </td>
                    {scope === 'all' && <td className="hide-sm">{r.created_by?.full_name}</td>}
                    <td>
                      <div>{formatDate(r.expected_date)} – {formatDate(r.departure_date)}</div>
                      {r.document_count > 0 && <div className="cell-sub"><Paperclip size={11} /> {r.document_count}</div>}
                    </td>
                    <td className="shrink" style={{ textAlign: 'center' }}>{r.duration || '—'}</td>
                    <td className="muted">{r.id_card_label ?? '—'}</td>
                    <td className="hide-lg">{r.host || '—'}</td>
                    <td className="shrink"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pages={data.pages} total={data.total} onPage={(p) => update({ page: String(p) })} />
        </>
      ) : null}
    </div>
  );
}
