import { useState, type FormEvent } from 'react';
import { api, type ApiError } from '../api/client';
import type { User } from '../api/types';
import { useAuth } from '../hooks/auth';
import { useToast } from '../hooks/toast';
import { Field, PasswordInput } from '../components/ui';
import { formatDateTime } from '../format';
import { RoleBadge } from '../components/RoleControls';

function ProfileCard() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ first_name: user!.first_name, last_name: user!.last_name, phone: user!.phone });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.patch<{ user: User }>('/api/auth/profile', form);
      setUser(res.user);
      setErrors({});
      toast('Profile updated.');
    } catch (err) {
      setErrors((err as ApiError).fields);
      toast((err as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card-header"><h2>Profile</h2></div>
      <div className="card-body form-grid">
        <Field label="First name" error={errors.first_name} htmlFor="fn"><input id="fn" className="input" value={form.first_name} onChange={set('first_name')} /></Field>
        <Field label="Last name" error={errors.last_name} htmlFor="ln"><input id="ln" className="input" value={form.last_name} onChange={set('last_name')} /></Field>
        <Field label="Email" hint="Contact an administrator to change your email." htmlFor="em"><input id="em" className="input" value={user!.email} disabled /></Field>
        <Field label="Phone" error={errors.phone} htmlFor="ph"><input id="ph" className="input" value={form.phone} onChange={set('phone')} /></Field>
      </div>
      <div className="card-footer"><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
    </form>
  );
}

function PasswordCard() {
  const toast = useToast();
  const empty = { current_password: '', new_password: '', confirm_password: '' };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post<{ message: string }>('/api/auth/change-password', form);
      setForm(empty);
      setErrors({});
      toast(res.message);
    } catch (err) {
      setErrors((err as ApiError).fields);
      if (!Object.keys((err as ApiError).fields).length) toast((err as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card-header"><h2>Change password</h2></div>
      <div className="card-body stack">
        <Field label="Current password" error={errors.current_password} htmlFor="cp">
          <PasswordInput id="cp" autoComplete="current-password" value={form.current_password} onChange={set('current_password')} />
        </Field>
        <div className="form-grid">
          <Field label="New password" error={errors.new_password} hint="At least 8 characters, with letters and numbers." htmlFor="np">
            <PasswordInput id="np" autoComplete="new-password" value={form.new_password} onChange={set('new_password')} />
          </Field>
          <Field label="Confirm new password" error={errors.confirm_password} htmlFor="np2">
            <PasswordInput id="np2" autoComplete="new-password" value={form.confirm_password} onChange={set('confirm_password')} />
          </Field>
        </div>
      </div>
      <div className="card-footer">
        <button className="btn btn-primary" disabled={busy || !form.current_password || !form.new_password}>{busy ? 'Updating…' : 'Update password'}</button>
      </div>
    </form>
  );
}

export default function Account() {
  const { user } = useAuth();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Profile &amp; security</h1>
          <p className="muted">
            Signed in as {user?.email} · {user && <RoleBadge role={user.role} />}
            {user?.last_login_at && <> · Last sign-in {formatDateTime(user.last_login_at)}</>}
          </p>
        </div>
      </div>
      <div className="stack" style={{ maxWidth: 760 }}>
        <ProfileCard />
        <PasswordCard />
      </div>
    </>
  );
}
