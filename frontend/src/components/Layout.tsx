import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, FilePlus2, FileClock, UserCog, Users, ClipboardCheck, LogOut, Menu, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../hooks/auth';
import { useFetch } from '../hooks/useFetch';
import { ROLE_LABEL, type Role, type Stats } from '../api/types';
import { Spinner, initials } from './ui';
import { ThemeToggle } from './ThemeToggle';

/** Guards a route; `roles` limits it to those roles (default: any signed-in user). */
export function RequireAuth({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner fill />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export function GuestOnly() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner fill />;
  return user ? <Navigate to="/dashboard" replace /> : <Outlet />;
}

export function AppLayout() {
  const { user, isController, isAccessAdmin, canViewAll, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  // Refetch counts when navigating so badges stay fresh after actions.
  const { data: mine } = useFetch<Stats>(isAccessAdmin ? null : `/api/requests/stats?_=${location.key}`);
  const { data: all } = useFetch<Stats>(canViewAll ? `/api/requests/stats?scope=all&_=${location.key}` : null);

  useEffect(() => setOpen(false), [location.pathname]);

  const signOut = async () => {
    await logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <img src="/ladol-logo.jpg" alt="LADOL" />
          <span>Access Portal</span>
        </div>
        <nav className="nav">
          <NavLink to="/dashboard"><LayoutDashboard size={18} /> Dashboard</NavLink>
          {!isAccessAdmin && (
            <>
              <div className="nav-label">My access</div>
              <NavLink to="/requests/new" end><FilePlus2 size={18} /> New request</NavLink>
              <NavLink to="/requests" end><FileText size={18} /> My requests</NavLink>
              <NavLink to="/drafts">
                <FileClock size={18} /> Drafts
                {!!mine?.counts.DRAFT && <span className="count">{mine.counts.DRAFT}</span>}
              </NavLink>
            </>
          )}
          {isAccessAdmin && (
            <>
              <div className="nav-label">Entrance</div>
              <NavLink to="/admin/requests"><ShieldCheck size={18} /> All requests</NavLink>
            </>
          )}
          {isController && (
            <>
              <div className="nav-label">Access control</div>
              <NavLink to="/admin/requests">
                <ClipboardCheck size={18} /> Review requests
                {!!all?.counts.PENDING && <span className="count">{all.counts.PENDING}</span>}
              </NavLink>
              <NavLink to="/admin/users"><Users size={18} /> Users &amp; roles</NavLink>
            </>
          )}
          <div className="nav-label">Account</div>
          <NavLink to="/account"><UserCog size={18} /> Profile &amp; security</NavLink>
        </nav>
        <div className="sidebar-user">
          <span className="avatar">{initials(user.full_name)}</span>
          <div className="who">
            <div style={{ fontWeight: 600 }}>{user.full_name}</div>
            <div className="faint small">{user.role === 'user' ? user.email : ROLE_LABEL[user.role]}</div>
          </div>
          <ThemeToggle />
          <button className="icon-btn" onClick={signOut} title="Sign out" aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <img src="/ladol-logo.jpg" alt="LADOL" />
          <ThemeToggle className="push-right" />
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
