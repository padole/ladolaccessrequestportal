import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { ErrorAlert, Field } from '../components/ui';
import { api, type ApiError } from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ message: string }>('/api/auth/forgot-password', { email });
      setSent(res.message);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Reset your password" subtitle="Enter your account email and we'll send you a reset link.">
      {sent ? (
        <div className="alert alert-success">{sent}</div>
      ) : (
        <>
          <ErrorAlert message={error} />
          <form onSubmit={submit} noValidate>
            <Field label="Email" htmlFor="email">
              <input id="email" className="input" type="email" autoComplete="email" autoFocus value={email}
                onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <button className="btn btn-primary btn-block" disabled={busy || !email}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        </>
      )}
      <p className="muted"><Link to="/login">Back to sign in</Link></p>
    </AuthShell>
  );
}
