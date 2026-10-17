import { useState } from 'react';
import { UserCheck, UserX } from 'lucide-react';
import { api, type ApiError } from '../api/client';
import { ROLE_LABEL, ROLE_OPTIONS, type Role, type User } from '../api/types';
import { useAuth } from '../hooks/auth';
import { useToast } from '../hooks/toast';
import { Confirm } from './ui';

type Pending = { kind: 'role'; role: Role } | { kind: 'active'; active: boolean };

/** Change a user's role and enable/disable them, with confirmation. */
export function useUserActions(onChanged: (u: User) => void) {
  const toast = useToast();
  const { user: me } = useAuth();
  const [target, setTarget] = useState<{ user: User; change: Pending } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!target) return;
    setBusy(true);
    const body = target.change.kind === 'role' ? { role: target.change.role } : { is_active: target.change.active };
    try {
      const res = await api.patch<{ user: User }>(`/api/admin/users/${target.user.id}`, body);
      onChanged(res.user);
      toast(target.change.kind === 'role'
        ? `${res.user.full_name} is now ${ROLE_LABEL[res.user.role]}.`
        : `${res.user.full_name} has been ${res.user.is_active ? 'enabled' : 'disabled'}.`);
      setTarget(null);
    } catch (e) {
      toast((e as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const isSelf = (u: User) => u.id === me?.id;

  const roleSelect = (u: User) => (
    <select className="select" style={{ height: 30, width: 'auto', paddingRight: 28 }} value={u.role}
      disabled={isSelf(u)} title={isSelf(u) ? 'You cannot change your own role' : 'Change role'}
      aria-label={`Role for ${u.full_name}`}
      onChange={(e) => setTarget({ user: u, change: { kind: 'role', role: e.target.value as Role } })}>
      {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
    </select>
  );

  const activeButton = (u: User) => (u.is_active ? (
    <button className="btn btn-sm" disabled={isSelf(u)} title={isSelf(u) ? 'You cannot disable yourself' : undefined}
      onClick={() => setTarget({ user: u, change: { kind: 'active', active: false } })}>
      <UserX size={14} /> Disable
    </button>
  ) : (
    <button className="btn btn-sm" onClick={() => setTarget({ user: u, change: { kind: 'active', active: true } })}>
      <UserCheck size={14} /> Enable
    </button>
  ));

  const dialog = target && (() => {
    const { user: u, change } = target;
    if (change.kind === 'role') {
      const next = ROLE_OPTIONS.find((r) => r.value === change.role)!;
      const losingControl = u.role === 'access_controller';
      return (
        <Confirm
          title={`Make ${u.full_name} ${next.label}?`}
          confirmLabel={`Make ${next.label}`}
          tone={losingControl ? 'danger' : 'primary'}
          busy={busy}
          onConfirm={run}
          onCancel={() => setTarget(null)}
          message={<>
            {next.description}
            {losingControl && ' They will lose access to reviewing requests and managing users.'}
          </>}
        />
      );
    }
    return change.active ? (
      <Confirm title={`Enable ${u.full_name}?`} confirmLabel="Enable" busy={busy} onConfirm={run} onCancel={() => setTarget(null)}
        message="They will be able to sign in again." />
    ) : (
      <Confirm title={`Disable ${u.full_name}?`} confirmLabel="Disable account" tone="danger" busy={busy} onConfirm={run} onCancel={() => setTarget(null)}
        message="They will be signed out and unable to sign in until re-enabled. Their requests are kept." />
    );
  })();

  return { roleSelect, activeButton, dialog };
}

export function RoleBadge({ role }: { role: Role }) {
  return <span className={`badge badge-role-${role}`}>{ROLE_LABEL[role] ?? role}</span>;
}
