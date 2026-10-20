import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ClipboardPaste, Download, FileUp, Paperclip, Plus, Send, Trash2, Upload, X } from 'lucide-react';
import { api, type ApiError } from '../api/client';
import { ID_CARD_OPTIONS, type GroupSummary } from '../api/types';
import { ErrorAlert, Field, Modal } from '../components/ui';
import { RequestModeSwitch } from '../components/RequestModeSwitch';
import { COUNTRIES, COUNTRY_LIST_ID } from '../countries';
import { useToast } from '../hooks/toast';
import { daysBetween, todayIso } from '../format';

const MAX_VISITORS = 50;
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx';
const TEMPLATE = 'Full name,Company,Job title,Country,Email,Phone\r\n';

interface Visitor { fullname: string; company: string; job_title: string; country: string; email: string; phone: string; id_card: string }
const blankVisitor = (): Visitor => ({ fullname: '', company: '', job_title: '', country: '', email: '', phone: '', id_card: '' });
const hasData = (v: Visitor) => !!(v.fullname || v.company || v.job_title || v.country || v.email || v.phone);

const SHARED = { company: '', country: '', id_card: '', host: '', expected_date: '', departure_date: '', purpose: '' };

/** Split pasted spreadsheet rows (tab-separated) or CSV lines into visitors. */
function parseRows(text: string): Visitor[] {
  // Don't trim lines before splitting: a leading empty cell must keep the columns aligned.
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows = lines.map((line) => (line.includes('\t') ? line.split('\t') : splitCsv(line)).map((c) => c.trim()));
  if (rows.length && /name/i.test(rows[0][0] ?? '')) rows.shift(); // header row
  return rows
    .filter((r) => r.some(Boolean))
    .map(([fullname = '', company = '', job_title = '', country = '', email = '', phone = '']) =>
      ({ fullname, company, job_title, country, email, phone, id_card: '' }));
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
    } else if (ch === ',' && !quoted) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

export default function GroupRequestForm() {
  const navigate = useNavigate();
  const toast = useToast();
  const csvInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);

  const [shared, setShared] = useState(SHARED);
  const [visitors, setVisitors] = useState<Visitor[]>(() => Array.from({ length: 3 }, blankVisitor));
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const filled = visitors.filter(hasData);
  const dirty = filled.length > 0 || Object.values(shared).some(Boolean);

  // Warn before leaving with unsaved rows (groups can't be saved as drafts).
  useEffect(() => {
    if (!dirty || busy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);

  const setField = (k: keyof typeof SHARED) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setShared((s) => ({ ...s, [k]: e.target.value }));
    setErrors((x) => ({ ...x, [k]: '' }));
  };

  const setVisitor = (i: number, k: keyof Visitor, value: string) => {
    setVisitors((vs) => vs.map((v, j) => (j === i ? { ...v, [k]: value } : v)));
    setErrors((x) => ({ ...x, [`visitors.${i}.${k}`]: '' }));
  };

  const addRows = (rows: Visitor[]) => {
    setVisitors((vs) => {
      const kept = vs.filter(hasData);
      const merged = [...kept, ...rows].slice(0, MAX_VISITORS);
      if (kept.length + rows.length > MAX_VISITORS) toast(`A group can have at most ${MAX_VISITORS} visitors; extra rows were dropped.`, 'error');
      return merged.length ? merged : [blankVisitor()];
    });
    setErrors({});
  };

  const removeRow = (i: number) => {
    setVisitors((vs) => (vs.length === 1 ? [blankVisitor()] : vs.filter((_, j) => j !== i)));
    setErrors({}); // row indexes shift, so old per-row errors no longer line up
  };

  const importCsv = async (file: File | undefined) => {
    if (!file) return;
    const rows = parseRows(await file.text());
    if (!rows.length) { toast('No visitors found in that file.', 'error'); return; }
    addRows(rows);
    toast(`Added ${rows.length} visitor${rows.length === 1 ? '' : 's'} from ${file.name}.`);
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'group-visitors-template.csv' });
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyPaste = () => {
    const rows = parseRows(pasteText);
    if (!rows.length) { toast('Nothing to add. Paste rows copied from a spreadsheet.', 'error'); return; }
    addRows(rows);
    toast(`Added ${rows.length} visitor${rows.length === 1 ? '' : 's'}.`);
    setPasting(false);
    setPasteText('');
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const allowed = Array.from(list).filter((f) => ACCEPT.split(',').some((ext) => f.name.toLowerCase().endsWith(ext)));
    if (allowed.length < list.length) setErrors((x) => ({ ...x, documents: 'Only PDF, JPG, PNG and DOCX files are allowed.' }));
    setFiles((cur) => {
      const merged = [...cur, ...allowed].slice(0, MAX_FILES);
      if (merged.reduce((s, f) => s + f.size, 0) > MAX_BYTES) {
        setErrors((x) => ({ ...x, documents: 'Total size must be under 10MB.' }));
        return cur;
      }
      return merged;
    });
  };

  // Same date rules the server enforces, shown as the user picks dates.
  // Group requests are always new, so arrival may be back-dated; departure can't be in the past.
  const today = todayIso();
  const earliestDeparture = shared.expected_date && shared.expected_date > today ? shared.expected_date : today;
  const arrivalError = '';
  const departureError = shared.departure_date && shared.expected_date && shared.departure_date < shared.expected_date
    ? 'Departure must be on or after the arrival date.'
    : shared.departure_date && shared.departure_date < today
      ? 'Departure must be today or later.' : '';
  const duration = shared.expected_date && shared.departure_date && shared.departure_date >= shared.expected_date
    ? daysBetween(shared.expected_date, shared.departure_date) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Send only rows with data; map server row indexes back to table rows.
    const rowIndex = visitors.map((v, i) => (hasData(v) ? i : -1)).filter((i) => i >= 0);
    const body = new FormData();
    Object.entries(shared).forEach(([k, v]) => body.append(k, v));
    body.append('visitors', JSON.stringify(rowIndex.map((i) => visitors[i])));
    files.forEach((f) => body.append('documents', f));
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ group: GroupSummary }>('/api/groups', body);
      toast(`Group ${res.group.group_no} submitted: ${res.group.size} visitors.`);
      navigate(`/groups/${res.group.group_no}`);
    } catch (err) {
      const apiErr = err as ApiError;
      const mapped: Record<string, string> = {};
      Object.entries(apiErr.fields).forEach(([k, v]) => {
        const m = /^visitors\.(\d+)\.(\w+)$/.exec(k);
        mapped[m ? `visitors.${rowIndex[Number(m[1])]}.${m[2]}` : k] = v;
      });
      setErrors(mapped);
      setError(apiErr.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  const rowErr = (i: number, k: string) => errors[`visitors.${i}.${k}`];

  // One text input cell in the visitors table.
  const textCell = (v: Visitor, i: number, k: Exclude<keyof Visitor, 'id_card'>) => (
    <td key={k}>
      <input className={`input ${rowErr(i, k) ? 'invalid' : ''}`} value={v[k]}
        type={k === 'email' ? 'email' : k === 'phone' ? 'tel' : 'text'}
        placeholder={k === 'company' ? shared.company || 'Company' : k === 'country' ? shared.country || 'Country' : undefined}
        list={k === 'country' ? COUNTRY_LIST_ID : undefined}
        aria-label={`Visitor ${i + 1} ${k === 'fullname' ? 'full name' : k.replace('_', ' ')}`}
        onChange={(e) => setVisitor(i, k, e.target.value)} />
      {rowErr(i, k) && <span className="cell-err">{rowErr(i, k)}</span>}
    </td>
  );

  return (
    <>
      <Link className="backlink" to="/requests"><ArrowLeft size={14} /> Back</Link>
      <div className="page-head">
        <div>
          <h1>New group request</h1>
          <p className="muted">One form for a party of visitors with the same visit. Each visitor gets their own request number, linked as a group.</p>
        </div>
      </div>
      <RequestModeSwitch mode="group" />

      <form onSubmit={submit} noValidate className="stack">
        <ErrorAlert message={error} />
        <p className="required-note">Fields marked <span className="req">*</span> are required.</p>

        <div className="card">
          <div className="card-header">
            <h2>Visit details <span className="muted small" style={{ fontWeight: 400 }}>(apply to everyone)</span></h2>
            {duration && <span className="badge badge-role-user">{duration} day{duration === 1 ? '' : 's'}</span>}
          </div>
          <div className="card-body form-grid">
            <Field label="Expected arrival" required error={arrivalError || errors.expected_date} hint="Can be a past date." htmlFor="g_arrival">
              <input id="g_arrival" type="date" className="input" value={shared.expected_date} onChange={setField('expected_date')} />
            </Field>
            <Field label="Departure" required error={departureError || errors.departure_date} htmlFor="g_departure">
              <input id="g_departure" type="date" className="input" min={earliestDeparture}
                value={shared.departure_date} onChange={setField('departure_date')} />
            </Field>
            <Field label="Host" error={errors.host} hint="The LADOL staff member the visitors are meeting." htmlFor="g_host">
              <input id="g_host" className="input" value={shared.host} onChange={setField('host')} />
            </Field>
            <Field label="Default company" error={errors.company} hint="Used for any visitor whose company is left blank." htmlFor="g_company">
              <input id="g_company" className="input" value={shared.company} onChange={setField('company')} />
            </Field>
            <Field label="Default country" error={errors.country} hint="Used for any visitor whose country is left blank." htmlFor="g_country">
              <input id="g_country" className="input" list={COUNTRY_LIST_ID} value={shared.country} onChange={setField('country')} />
              <datalist id={COUNTRY_LIST_ID}>{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="Default ID card" required error={errors.id_card} hint="Used for any visitor whose ID card is left as Default." htmlFor="g_idcard">
              <select id="g_idcard" className="select" value={shared.id_card} onChange={setField('id_card')}>
                <option value="" disabled>Select ID card</option>
                {ID_CARD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Purpose of visit" required error={errors.purpose} className="span-2" hint={`${shared.purpose.length}/250`} htmlFor="g_purpose">
              <textarea id="g_purpose" className="textarea" maxLength={250} value={shared.purpose} onChange={setField('purpose')} />
            </Field>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Visitors <span className="muted small" style={{ fontWeight: 400 }}>{filled.length}/{MAX_VISITORS}</span></h2>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-sm" onClick={() => setPasting(true)}><ClipboardPaste size={14} /> Paste from Excel</button>
              <button type="button" className="btn btn-sm" onClick={() => csvInput.current?.click()}><Upload size={14} /> Upload CSV</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={downloadTemplate}><Download size={14} /> Template</button>
              <input ref={csvInput} type="file" accept=".csv,text/csv" hidden onChange={(e) => { importCsv(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
          </div>
          {errors.visitors && <div style={{ padding: '12px 20px 0' }}><ErrorAlert message={errors.visitors} /></div>}
          <div className="table-wrap">
            <table className="table visitor-table">
              <thead>
                <tr><th>#</th><th>Full name <span className="req">*</span></th><th>Company</th><th>ID card</th><th title="Required for Permanent ID">Job title <span className="req" title="Required for Permanent ID">*</span></th><th>Country</th><th>Email</th><th>Phone</th><th /></tr>
              </thead>
              <tbody>
                {visitors.map((v, i) => (
                  <tr key={i}>
                    <td className="row-no">{i + 1}</td>
                    {(['fullname', 'company'] as const).map((k) => textCell(v, i, k))}
                    <td>
                      <select className="select" value={v.id_card} aria-label={`Visitor ${i + 1} ID card`}
                        onChange={(e) => setVisitor(i, 'id_card', e.target.value)}>
                        <option value="">Default</option>
                        {ID_CARD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    {(['job_title', 'country', 'email', 'phone'] as const).map((k) => textCell(v, i, k))}
                    <td className="shrink">
                      <button type="button" className="icon-btn" aria-label={`Remove visitor ${i + 1}`} onClick={() => removeRow(i)}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-footer" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="btn btn-sm" disabled={visitors.length >= MAX_VISITORS}
              onClick={() => setVisitors((vs) => [...vs, blankVisitor()])}><Plus size={14} /> Add visitor</button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={visitors.length >= MAX_VISITORS}
              onClick={() => setVisitors((vs) => [...vs, ...Array.from({ length: Math.min(5, MAX_VISITORS - vs.length) }, blankVisitor)])}>Add 5 rows</button>
            <span className="muted small">Full name is required, and job title for a Permanent ID. Other columns are optional.</span>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Supporting documents <span className="muted small" style={{ fontWeight: 400 }}>(optional, shared by the whole group)</span></h2>
            <span className="muted small">{files.length}/{MAX_FILES} files</span>
          </div>
          <div className="card-body stack-sm">
            {files.length < MAX_FILES && (
              <button type="button" className="dropzone" onClick={() => docInput.current?.click()}>
                <FileUp size={22} strokeWidth={1.5} />
                <p><strong>Click to upload</strong> PDF, JPG, PNG or DOCX, up to 10MB total</p>
              </button>
            )}
            <input ref={docInput} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            {errors.documents && <span className="err" style={{ color: 'var(--danger)' }}>{errors.documents}</span>}
            {files.length > 0 && (
              <div className="doc-list">
                {files.map((f, i) => (
                  <div className="doc" key={`${f.name}-${i}`}>
                    <Paperclip size={16} />
                    <span className="name">{f.name}</span>
                    <span className="faint small">{(f.size / 1024).toFixed(0)} KB</span>
                    <button type="button" className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}><X size={15} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <span className="muted small">Groups can't be saved as drafts. Submit when the list is complete.</span>
          <button type="submit" className="btn btn-primary" disabled={busy || filled.length === 0}>
            <Send size={16} /> {busy ? 'Submitting…' : `Submit ${filled.length || ''} visitor${filled.length === 1 ? '' : 's'} for review`}
          </button>
        </div>
      </form>

      {pasting && (
        <Modal
          title="Paste visitors from Excel"
          onClose={() => setPasting(false)}
          actions={<>
            <button className="btn" onClick={() => setPasting(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={applyPaste}>Add visitors</button>
          </>}
        >
          <p className="muted small">
            In Excel, select the columns <strong>Full name, Company, Job title, Country, Email, Phone</strong> (in that order) and copy them. Paste below. A header row is skipped automatically.
          </p>
          <textarea className="textarea" style={{ minHeight: 180, fontFamily: 'ui-monospace, Consolas, monospace' }} autoFocus
            value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={'Jane Doe\tSaipem\tWelder\tNigeria\tjane@saipem.com\t0803…'} />
        </Modal>
      )}
    </>
  );
}
