let token = localStorage.getItem('fn_token') || '';
export const setToken = (t) => { token = t; t ? localStorage.setItem('fn_token', t) : localStorage.removeItem('fn_token'); };
export const getToken = () => token;

export async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (res.status === 401 && !path.startsWith('/auth')) { setToken(''); window.location.reload(); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status, data });
  return data;
}
