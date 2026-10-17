import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { ErrorAlert, Field, PasswordInput } from '../components/ui';
import { api, type ApiError } from '../api/client';

export default function ResetPassword() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ message: string }>('/api/auth/reset-password', {
        token, password, confirm_password: confirm,
      });
      navigate('/login', { replace: true, state: { notice: res.message } });
    } catch (err) {
      setError((err as ApiError).message);
      setErrors((err as ApiError).fields);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Choose a new password">
      <ErrorAlert message={error} />
      <form onSubmit={submit} noValidate>
        <Field label="New password" error={errors.password} hint="At least 8 characters, with letters and numbers." htmlFor="pw">
          <PasswordInput id="pw" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm new password" error={errors.confirm_password} htmlFor="pw2">
          <PasswordInput id="pw2" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy || !password}>{busy ? 'Saving…' : 'Reset password'}</button>
      </form>
      <p className="muted"><Link to="/forgot-password">Request a new link</Link></p>
    </AuthShell>
  );
}
