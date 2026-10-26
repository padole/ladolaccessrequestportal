import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { MicrosoftSignIn } from '../components/MicrosoftSignIn';
import { CompanySelect } from '../components/CompanySelect';
import { ErrorAlert, Field, PasswordInput } from '../components/ui';
import { api, type ApiError } from '../api/client';

const EMPTY = { first_name: '', last_name: '', email: '', phone: '', job_title: '', company: '', password: '', confirm_password: '' };

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((x) => ({ ...x, [k]: '' }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/register', form);
      navigate('/login', { state: { notice: 'Account created. Sign in to continue.' } });
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr.message);
      setErrors(apiErr.fields);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create an account" subtitle="Register to submit and track site access requests.">
      <ErrorAlert message={error} />
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field label="First name" error={errors.first_name} htmlFor="fn">
            <input id="fn" className="input" autoComplete="given-name" value={form.first_name} onChange={set('first_name')} />
          </Field>
          <Field label="Last name" error={errors.last_name} htmlFor="ln">
            <input id="ln" className="input" autoComplete="family-name" value={form.last_name} onChange={set('last_name')} />
          </Field>
        </div>
        <Field label="Email" error={errors.email} htmlFor="em">
          <input id="em" className="input" type="email" autoComplete="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Phone" error={errors.phone} htmlFor="ph">
          <input id="ph" className="input" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} />
        </Field>
        <div className="form-grid">
          <Field label="Job title" error={errors.job_title} htmlFor="jt">
            <input id="jt" className="input" autoComplete="organization-title" value={form.job_title} onChange={set('job_title')} />
          </Field>
          <Field label="Company" error={errors.company} htmlFor="co">
            <CompanySelect id="co" value={form.company}
              onChange={(v) => { setForm((f) => ({ ...f, company: v })); setErrors((x) => ({ ...x, company: '' })); }} />
          </Field>
        </div>
        <Field label="Password" error={errors.password} hint="At least 8 characters, with letters and numbers." htmlFor="pw">
          <PasswordInput id="pw" autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>
        <Field label="Confirm password" error={errors.confirm_password} htmlFor="pw2">
          <PasswordInput id="pw2" autoComplete="new-password" value={form.confirm_password} onChange={set('confirm_password')} />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
      <MicrosoftSignIn />
      <p className="muted">Already registered? <Link to="/login">Sign in</Link></p>
    </AuthShell>
  );
}
