import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { toQuery } from '../../api/client';
import { ROLE_OPTIONS, type Page, type User } from '../../api/types';
import { useAuth } from '../../hooks/auth';
import { useFetch } from '../../hooks/useFetch';
import { formatDate } from '../../format';
import { Empty, ErrorAlert, Pager, Spinner, initials } from '../../components/ui';
import { useUserActions } from '../../components/RoleControls';

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const url = `/api/admin/users${toQuery({
    search: params.get('search'), role: params.get('role'), status: params.get('status'), page: params.get('page'),
  })}`;
  const { data, error, loading, setData } = useFetch<Page<User>>(url);
  const { roleSelect, activeButton, dialog } = useUserActions((u) =>
    setData((d) => d && { ...d, items: d.items.map((x) => (x.id === u.id ? u : x)) }));

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const t = window.setTimeout(() => {
      if ((params.get('search') ?? '') !== search.trim()) update({ search: search.trim() || null });
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Users &amp; roles</h1>
          <p className="muted">Assign each user a role (User, Access Admin or Access Controller) and enable or disable accounts.</p>
        </div>
      </div>
      <div className="card">
        <div className="filters" style={{ gridTemplateColumns: 'minmax(180px, 1fr) 150px 150px' }}>
          <div className="search">
            <Search size={16} />
            <input className="input" placeholder="Search name, email or phone" value={search}
              onChange={(e) => setSearch(e.target.value)} aria-label="Search users" />
          </div>
          <select className="select" aria-label="Filter by role" value={params.get('role') ?? ''} onChange={(e) => update({ role: e.target.value || null })}>
            <option value="">All roles</option>
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select className="select" aria-label="Filter by status" value={params.get('status') ?? ''} onChange={(e) => update({ status: e.target.value || null })}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
        {error && <div style={{ padding: 16 }}><ErrorAlert message={error.message} /></div>}
        {loading && !data ? <Spinner fill /> : !data?.items.length ? <Empty title="No users found" /> : (
          <>
            <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
              <table className="table">
                <thead>
                  <tr><th>User</th><th className="hide-lg">Phone</th><th>Role</th><th>Status</th><th className="hide-lg">Joined</th><th className="shrink">Access</th></tr>
                </thead>
                <tbody>
                  {data.items.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="row" style={{ gap: 10 }}>
                          <span className="avatar">{initials(u.full_name)}</span>
                          <div>
                            <Link className="cell-main" to={`/admin/users/${u.id}`}>{u.full_name}</Link>
                            {u.id === me?.id && <span className="faint small"> (you)</span>}
                            <div className="cell-sub">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="muted hide-lg">{u.phone}</td>
                      <td>{roleSelect(u)}</td>
                      <td><span className={`badge badge-${u.is_active ? 'active' : 'disabled'}`}>{u.is_active ? 'Active' : 'Disabled'}</span></td>
                      <td className="muted hide-lg">{formatDate(u.created_at)}</td>
                      <td className="shrink">{activeButton(u)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={data.page} pages={data.pages} total={data.total} onPage={(p) => update({ page: String(p) })} />
          </>
        )}
      </div>
      {dialog}
    </>
  );
}
