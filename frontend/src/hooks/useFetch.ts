import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';

/** Fetch JSON from `url` whenever it changes. Pass null to skip. */
export function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!url);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!url) return;
    const ticket = ++latest.current;
    setLoading(true);
    try {
      const result = await api.get<T>(url);
      if (ticket === latest.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (ticket === latest.current) setError(e as ApiError);
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}
