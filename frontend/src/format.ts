const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Dates without a time ("2026-10-16") are calendar dates, not UTC instants. */
function parse(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(`${value.replace(/Z?$/, '')}Z`);
}

export function formatDate(value: string | null | undefined) {
  return value ? dateFmt.format(parse(value)) : '—';
}

export function formatDateTime(value: string | null | undefined) {
  return value ? dateTimeFmt.format(parse(value)) : '—';
}

export function daysBetween(from: string, to: string) {
  const ms = parse(to).getTime() - parse(from).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Keep in sync with MIN_NOTICE_DAYS in myapp/api/requests.py: "48 hours" on calendar dates.
export const MIN_NOTICE_DAYS = 2;

/** Add whole days to a YYYY-MM-DD date. */
export function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

