// Empty string = relative '/api/...' requests, handled in dev by the Vite
// proxy in vite.config.js (so this works from any device on the LAN without
// hardcoding the laptop's IP here). Set VITE_API_BASE explicitly for a
// production build, where there's no dev-server proxy to rely on.
const API_BASE = import.meta.env.VITE_API_BASE || '';

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle(res) {
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    throw new Error((isJson && body.error) || `Request failed (${res.status})`);
  }
  return body;
}

export const api = {
  get(path) {
    return fetch(`${API_BASE}${path}`, { headers: authHeaders() }).then(handle);
  },
  post(path, data) {
    return fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    }).then(handle);
  },
  patch(path, data) {
    return fetch(`${API_BASE}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    }).then(handle);
  },
  del(path) {
    return fetch(`${API_BASE}${path}`, { method: 'DELETE', headers: authHeaders() }).then(handle);
  },
  postForm(path, formData) {
    return fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: authHeaders(), // no Content-Type — browser sets the multipart boundary
      body: formData,
    }).then(handle);
  },
  fileUrl(path) {
    // For <img>/<a> tags we can't attach an Authorization header, so the
    // server-side routes that serve RC copies/photos/certificates need the
    // token as a query param instead. Kept short-lived by session length.
    const token = localStorage.getItem('token');
    const sep = path.includes('?') ? '&' : '?';
    return `${API_BASE}${path}${sep}access_token=${encodeURIComponent(token || '')}`;
  },
};

export { API_BASE };

/**
 * Returns a copy of `list` sorted ascending by the string `key(item)` returns,
 * using locale-aware, case-insensitive, numeric-aware comparison. Used to keep
 * every dropdown in a predictable A–Z order regardless of server order.
 */
export function byLabel(list, key = (x) => x.name) {
  return [...(list || [])].sort((a, b) =>
    String(key(a) ?? '').localeCompare(String(key(b) ?? ''), undefined, { numeric: true, sensitivity: 'base' }),
  );
}
