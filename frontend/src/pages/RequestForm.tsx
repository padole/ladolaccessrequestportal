import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileUp, Paperclip, Save, Send, Trash2, X } from 'lucide-react';
import { api, type ApiError } from '../api/client';
import { ID_CARD_OPTIONS, type AccessRequestDetail } from '../api/types';
import { ErrorAlert, Field, Spinner } from '../components/ui';
import { useAuth } from '../hooks/auth';
import { useToast } from '../hooks/toast';
import { MAX_VISIT_DAYS, MIN_NOTICE_DAYS, addDaysIso, daysBetween, formatDate, todayIso } from '../format';

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx';

const EMPTY = {
  fullname: '', company: '', email: '', phone: '', id_card: 'vistor',
  host: '', expected_date: '', departure_date: '', purpose: '',
};
type FormState = typeof EMPTY;

export default function RequestForm() {
  const { id } = useParams();
  const editing = !!id;
  // "Raise a new request" from an expired one copies the visitor's details.
  const [searchParams] = useSearchParams();
  const copyFrom = editing ? null : searchParams.get('from');
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [files, setFiles] = useState<File[]>([]);
  const [existing, setExisting] = useState<AccessRequestDetail['documents']>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'draft' | 'submit' | null>(null);
  const [loading, setLoading] = useState(editing || !!copyFrom);
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<{ request: AccessRequestDetail }>(`/api/requests/${id}`)
      .then(({ request: r }) => {
        if (r.status !== 'DRAFT') {
          navigate(`/requests/${r.id}`, { replace: true });
          return;
        }
        setForm({
          fullname: r.fullname, company: r.company, email: r.email, phone: r.phone,
          id_card: r.id_card ?? 'vistor', host: r.host, expected_date: r.expected_date ?? '',
          departure_date: r.departure_date ?? '', purpose: r.purpose,
        });
        setExisting(r.documents);
      })
      .catch((e: ApiError) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  useEffect(() => {
    if (!copyFrom) return;
    api.get<{ request: AccessRequestDetail }>(`/api/requests/${copyFrom}`)
      .then(({ request: r }) => {
        // Dates and documents are deliberately not copied: the new visit needs its own.
        setForm({
          ...EMPTY,
          fullname: r.fullname, company: r.company, email: r.email, phone: r.phone,
          id_card: r.id_card ?? 'vistor', host: r.host, purpose: r.purpose,
        });
        setCopiedFrom(r.request_no);
      })
      .catch(() => { /* fall back to an empty form */ })
      .finally(() => setLoading(false));
  }, [copyFrom]);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((x) => ({ ...x, [k]: '' }));
  };

  const fillMyDetails = () => {
    if (!user) return;
    setForm((f) => ({ ...f, fullname: user.full_name, email: user.email, phone: user.phone }));
  };

  const keptExisting = existing.filter((d) => !removed.includes(d.name));
  const totalFiles = keptExisting.length + files.length;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    const allowed = incoming.filter((f) => ACCEPT.split(',').some((ext) => f.name.toLowerCase().endsWith(ext)));
    if (allowed.length < incoming.length) setErrors((x) => ({ ...x, documents: 'Only PDF, JPG, PNG and DOCX files are allowed.' }));
    else setErrors((x) => ({ ...x, documents: '' }));
    setFiles((current) => {
      const merged = [...current, ...allowed].slice(0, MAX_FILES - keptExisting.length);
      if (merged.reduce((s, f) => s + f.size, 0) > MAX_BYTES) {
        setErrors((x) => ({ ...x, documents: 'Total size must be under 10MB.' }));
        return current;
      }
      return merged;
    });
  };

  const duration = form.expected_date && form.departure_date && form.departure_date >= form.expected_date
    ? daysBetween(form.expected_date, form.departure_date) : null;

  // Same rules the server enforces on submit, shown as the user picks dates.
  const earliestArrival = addDaysIso(todayIso(), MIN_NOTICE_DAYS);
  const latestDeparture = form.expected_date ? addDaysIso(form.expected_date, MAX_VISIT_DAYS - 1) : undefined;
  const arrivalError = form.expected_date && form.expected_date < earliestArrival
    ? `Arrival must be at least 48 hours from today (on or after ${formatDate(earliestArrival)}).` : '';
  const departureError = form.departure_date && form.expected_date && form.departure_date < form.expected_date
    ? 'Departure must be on or after the arrival date.'
    : latestDeparture && form.departure_date > latestDeparture
      ? `A visit can last at most ${MAX_VISIT_DAYS} days (depart by ${formatDate(latestDeparture)}).` : '';

  const save = async (action: 'draft' | 'submit') => {
    setBusy(action);
    setError(null);
    const body = new FormData();
    Object.entries(form).forEach(([k, v]) => body.append(k, v));
    body.append('action', action);
    files.forEach((f) => body.append('documents', f));
    removed.forEach((n) => body.append('remove_documents', n));
    try {
      const res = editing
        ? await api.put<{ request: AccessRequestDetail }>(`/api/requests/${id}`, body)
        : await api.post<{ request: AccessRequestDetail }>('/api/requests', body);
      if (action === 'submit') {
        toast(`Request ${res.request.request_no} submitted for review.`);
        navigate(`/requests/${res.request.id}`);
      } else {
        toast('Draft saved.');
        navigate('/drafts');
      }
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr.message);
      setErrors(apiErr.fields);
      // The server saves draft edits before validating a submit; keep the
      // newly-uploaded files out of the form so they aren't sent twice.
      if (editing && apiErr.status === 422 && action === 'submit') {
        const fresh = await api.get<{ request: AccessRequestDetail }>(`/api/requests/${id}`).catch(() => null);
        if (fresh) {
          setExisting(fresh.request.documents);
          setFiles([]);
          setRemoved([]);
        }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save('submit');
  };

  if (loading) return <Spinner fill />;

  return (
    <>
      <Link className="backlink" to={editing ? '/drafts' : '/requests'}><ArrowLeft size={14} /> Back</Link>
      <div className="page-head">
        <div>
          <h1>{editing ? 'Edit draft' : 'New access request'}</h1>
          <p className="muted">Fill in the visitor's details. You can save a draft and finish it later.</p>
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate className="stack">
        <ErrorAlert message={error} />
        {copiedFrom && (
          <div className="alert alert-info">
            Visitor details copied from {copiedFrom}. Choose new visit dates and attach any documents that are needed.
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h2>Visitor</h2>
            <button type="button" className="btn btn-sm" onClick={fillMyDetails}>The visitor is me</button>
          </div>
          <div className="card-body form-grid">
            <Field label="Full name" error={errors.fullname} htmlFor="fullname">
              <input id="fullname" className="input" value={form.fullname} onChange={set('fullname')} />
            </Field>
            <Field label="Company" error={errors.company} htmlFor="company">
              <input id="company" className="input" value={form.company} onChange={set('company')} />
            </Field>
            <Field label="ID card" error={errors.id_card} htmlFor="id_card">
              <select id="id_card" className="select" value={form.id_card} onChange={set('id_card')}>
                {ID_CARD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Email" error={errors.email} hint="Status updates are sent here and to you." htmlFor="email">
              <input id="email" type="email" className="input" value={form.email} onChange={set('email')} />
            </Field>
            <Field label="Phone" error={errors.phone} htmlFor="phone">
              <input id="phone" type="tel" className="input" value={form.phone} onChange={set('phone')} />
            </Field>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>Visit</h2>{duration && <span className="badge badge-user">{duration} day{duration === 1 ? '' : 's'}</span>}</div>
          <div className="card-body form-grid">
            <Field label="Expected arrival" error={arrivalError || errors.expected_date} hint="At least 48 hours from today." htmlFor="expected_date">
              <input id="expected_date" type="date" className="input" min={earliestArrival} value={form.expected_date} onChange={set('expected_date')} />
            </Field>
            <Field label="Departure" error={departureError || errors.departure_date} hint={`Visits can last up to ${MAX_VISIT_DAYS} days.`} htmlFor="departure_date">
              <input id="departure_date" type="date" className="input" min={form.expected_date || earliestArrival} max={latestDeparture}
                value={form.departure_date} onChange={set('departure_date')} />
            </Field>
            <Field label="Host" error={errors.host} hint="The LADOL staff member the visitor is meeting." className="span-2" htmlFor="host">
              <input id="host" className="input" value={form.host} onChange={set('host')} />
            </Field>
            <Field label="Purpose of visit" error={errors.purpose} className="span-2" hint={`${form.purpose.length}/250`} htmlFor="purpose">
              <textarea id="purpose" className="textarea" maxLength={250} value={form.purpose} onChange={set('purpose')} />
            </Field>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>Supporting documents <span className="muted small" style={{ fontWeight: 400 }}></span></h2><span className="muted small">{totalFiles}/{MAX_FILES} files</span></div>
          <div className="card-body stack">
            {totalFiles < MAX_FILES && (
              <div
                className={`dropzone ${drag ? 'drag' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => fileInput.current?.click()}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
              >
                <FileUp size={26} strokeWidth={1.5} />
                <p><strong>Click to upload</strong> or drag files here</p>
                <p className="small faint">PDF, JPG, PNG or DOCX · up to {MAX_FILES} files, 10MB total</p>
                <input ref={fileInput} type="file" multiple accept={ACCEPT} hidden
                  onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              </div>
            )}
            {errors.documents && <span className="err" style={{ color: 'var(--danger)' }}>{errors.documents}</span>}
            {(keptExisting.length > 0 || files.length > 0) && (
              <div className="doc-list">
                {keptExisting.map((d) => (
                  <div className="doc" key={d.name}>
                    <Paperclip size={16} />
                    <span className="name">{d.label}</span>
                    <span className="faint small">Uploaded</span>
                    <button type="button" className="icon-btn" aria-label={`Remove ${d.label}`} onClick={() => setRemoved((r) => [...r, d.name])}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                {files.map((f, i) => (
                  <div className="doc" key={`${f.name}-${i}`}>
                    <Paperclip size={16} />
                    <span className="name">{f.name}</span>
                    <span className="faint small">{(f.size / 1024).toFixed(0)} KB</span>
                    <button type="button" className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn" disabled={!!busy} onClick={() => save('draft')}>
            <Save size={16} /> {busy === 'draft' ? 'Saving…' : 'Save draft'}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!!busy}>
            <Send size={16} /> {busy === 'submit' ? 'Submitting…' : 'Submit for review'}
          </button>
        </div>
      </form>
    </>
  );
}
