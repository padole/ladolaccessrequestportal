export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const SERVER_DOWN = 'Cannot reach the API server. Make sure it is running (python app.py) and try again.';

let csrfToken: string | null = null;

/** Parse a JSON body, tolerating empty or non-JSON responses (e.g. a dev proxy error). */
async function readJson(res: Response): Promise<any> {
  if (!res.headers.get('content-type')?.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function getCsrfToken(refresh = false): Promise<string> {
  if (!csrfToken || refresh) {
    let res: Response;
    try {
      res = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    } catch {
      throw new ApiError(SERVER_DOWN, 0);
    }
    const data = await readJson(res);
    if (!res.ok || !data?.csrf_token) throw new ApiError(SERVER_DOWN, res.status);
    csrfToken = data.csrf_token as string;
  }
  return csrfToken;
}

type Body = Record<string, unknown> | FormData | undefined;

async function request<T>(method: string, url: string, body?: Body, retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let payload: BodyInit | undefined;
  if (method !== 'GET') {
    headers['X-CSRFToken'] = await getCsrfToken();
  }
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(SERVER_DOWN, 0);
  }

  const data = await readJson(res);
  if (!res.ok) {
    // No JSON body on a 5xx means the API itself never answered (the Vite proxy
    // reports a dead backend as an empty 500/502).
    if (!data && res.status >= 500) throw new ApiError(SERVER_DOWN, res.status);
    // A stale CSRF token (e.g. after the server restarted) is recoverable once.
    if (res.status === 400 && !retried && /session expired/i.test(data?.error ?? '')) {
      await getCsrfToken(true);
      return request<T>(method, url, body, true);
    }
    if (res.status === 401 && unauthorizedHandler) unauthorizedHandler();
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status, data?.fields ?? {});
  }
  return data as T;
}

let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
}

export function resetCsrf() {
  csrfToken = null;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: Body) => request<T>('POST', url, body),
  put: <T>(url: string, body?: Body) => request<T>('PUT', url, body),
  patch: <T>(url: string, body?: Body) => request<T>('PATCH', url, body),
  delete: <T>(url: string) => request<T>('DELETE', url),
};

export function toQuery(params: Record<string, string | number | undefined | null>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}
