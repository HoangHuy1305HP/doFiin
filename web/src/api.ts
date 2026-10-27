let accessToken = '';
let refreshPromise: Promise<boolean> | null = null;
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function setToken(value: string) {
  accessToken = value;
}
export async function restoreSession(): Promise<boolean> {
  try {
    if (
      localStorage.getItem('dofiin:remember') === 'false' &&
      sessionStorage.getItem('dofiin:active-session') !== 'true'
    )
      return false;
  } catch {
    /* Fall back to the server session if storage is unavailable. */
  }
  if (!refreshPromise)
    refreshPromise = (async () => {
      try {
        const response = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });
        if (!response.ok) {
          accessToken = '';
          return false;
        }
        const data = await response.json();
        accessToken = data.access_token;
        return true;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  return refreshPromise;
}
export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const response = await fetch('/api/v1' + path, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}),
      ...options.headers,
    },
  });
  if (response.status === 401 && retry && !path.startsWith('/auth/') && (await restoreSession()))
    return api<T>(path, options, false);
  if (!response.ok) {
    let data;
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    const detail = data.error;
    const messages: Record<string, string> = {
      INVALID_CREDENTIALS: 'Incorrect email or password.',
      EMAIL_EXISTS: 'This email is already registered.',
      UNAUTHORIZED: 'Your session expired. Please sign in again.',
      VERSION_CONFLICT: 'This portfolio changed on another device. Reload before saving.',
      PORTFOLIO_ARCHIVED: 'This portfolio is archived. You can still view its history.',
    };
    const issues = detail?.issues?.map((issue: { message: string }) => issue.message).join(' · ');
    throw new ApiError(
      response.status,
      detail?.code || 'REQUEST_FAILED',
      messages[detail?.code] || issues || detail?.message || 'Unable to connect. Please try again.',
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const put = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const percent = (value: number | null | undefined, digits = 1) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: digits }).format(
        value,
      );
export const number = (value: number | null | undefined, digits = 2) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
export const money = (value: number | null | undefined) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(value);
export const dateLabel = (value: string) =>
  new Date(value + 'T12:00:00').toLocaleDateString('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
