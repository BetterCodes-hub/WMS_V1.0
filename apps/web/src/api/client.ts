const TOKEN_KEY = 'wms.token';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string | null) => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* tryb prywatny */
    }
  },
};

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

type Query = Record<string, string | number | boolean | undefined | null>;

export function buildUrl(path: string, query?: Query) {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  });
  const qs = params.toString();
  return `/api${path}${qs ? `?${qs}` : ''}`;
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(buildUrl(path, query), {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthorized();
  if (!res.ok) {
    let message = `Błąd ${res.status}`;
    try {
      const data = await res.json();
      message = Array.isArray(data.message) ? data.message.join(' · ') : (data.message ?? message);
    } catch {
      /* brak treści */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') ?? '';
  return (type.includes('application/json') ? res.json() : res.text()) as Promise<T>;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/** Otwiera dokument PDF (lub pobiera plik) z autoryzacją — w nowej karcie. */
export async function openFile(path: string, query?: Query, download?: string) {
  const res = await fetch(buildUrl(path, query), { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
  if (!res.ok) {
    let message = 'Nie udało się pobrać dokumentu';
    try {
      message = (await res.json()).message ?? message;
    } catch {
      /* */
    }
    throw new ApiError(res.status, message);
  }
  const url = URL.createObjectURL(await res.blob());
  if (download) {
    const a = document.createElement('a');
    a.href = url;
    a.download = download;
    a.click();
  } else {
    window.open(url, '_blank');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
