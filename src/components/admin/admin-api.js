'use client';

export class AdminApiError extends Error {
  constructor(message, { status, fields } = {}) {
    super(message);
    this.status = status;
    this.fields = fields || null;
  }
}

function toLogin() {
  const next = encodeURIComponent(window.location.pathname);
  window.location.assign(`/admin/login?next=${next}`);
}

/** JSON request against /api/admin/*. Throws AdminApiError on failure. */
export async function adminRequest(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch { /* empty body */ }

  if (res.status === 401) {
    toLogin();
    throw new AdminApiError('Your session has expired.', { status: 401 });
  }
  if (!res.ok) {
    throw new AdminApiError(json?.error || `Request failed (${res.status})`, { status: res.status, fields: json?.fields });
  }
  return json;
}

export const adminPost = (url, body) => adminRequest(url, { method: 'POST', body });
