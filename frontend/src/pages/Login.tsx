import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { MicrosoftSignIn } from '../components/MicrosoftSignIn';
import { ErrorAlert, Field, PasswordInput } from '../components/ui';
import { useAuth } from '../hooks/auth';
import type { ApiError } from '../api/client';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';
  const notice = (location.state as { notice?: string } | null)?.notice;
  // Set by the server when a Microsoft sign-in comes back with a problem.
  const [params] = useSearchParams();
  const msError = params.get('ms_error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password, remember);
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Sign in" subtitle="Welcome back. Sign in to manage your access requests.">
      {notice && <div className="alert alert-success">{notice}</div>}
      <ErrorAlert message={error ?? msError} />
      <MicrosoftSignIn next={from} />
      <form onSubmit={submit} noValidate>
        <Field label="Email" htmlFor="email">
          <input id="email" className="input" type="email" autoComplete="email" required autoFocus
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password">
          <PasswordInput id="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="row-between">
          <label className="checkbox">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Keep me signed in
          </label>
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <button className="btn btn-primary btn-block" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="muted">
        New to the portal? <Link to="/register">Create an account</Link>
      </p>
    </AuthShell>
  );
}
