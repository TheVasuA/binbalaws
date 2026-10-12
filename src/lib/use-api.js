'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  let json = null;
  try {
    json = await res.json();
  } catch { /* non-JSON body */ }
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || `Request failed (${res.status})`);
  }
  return json && 'success' in json && 'data' in json ? json.data : json;
}

/**
 * GET a JSON endpoint, unwrapping `{ success, data }` envelopes. Polls every
 * `refreshMs` while the tab is visible. Pass `url = null` to skip the request.
 * A failed refresh keeps the previous data and only sets `error`.
 */
export function useApi(url, { refreshMs = 0 } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: !!url, url });
  const urlRef = useRef(url);

  if (state.url !== url) {
    setState({ data: null, error: null, loading: !!url, url });
  }

  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  const load = useCallback(async () => {
    const target = urlRef.current;
    if (!target) return;
    try {
      const data = await fetchJson(target);
      if (urlRef.current === target) setState({ data, error: null, loading: false, url: target });
    } catch (err) {
      if (urlRef.current === target) setState((s) => ({ ...s, error: err.message, loading: false }));
    }
  }, []);

  useEffect(() => {
    if (!url) return undefined;
    load();
    if (!refreshMs) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, refreshMs);
    return () => clearInterval(id);
  }, [url, refreshMs, load]);

  return { data: state.data, error: state.error, loading: state.loading, refetch: load };
}
