let token = localStorage.getItem('fn_token') || '';

export const setToken = (t: string) => {
  token = t;
  if (t) localStorage.setItem('fn_token', t);
  else localStorage.removeItem('fn_token');
};
export const getToken = () => token;

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && !path.startsWith('/auth')) {
    setToken('');
    window.location.reload();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string })?.error || res.statusText;
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}
