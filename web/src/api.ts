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
      INVALID_CREDENTIALS: 'Email hoặc mật khẩu chưa đúng.',
      EMAIL_EXISTS: 'Email này đã được đăng ký.',
      UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      VERSION_CONFLICT: 'Danh mục đã được thay đổi ở nơi khác. Tải lại trước khi lưu.',
      PORTFOLIO_ARCHIVED: 'Danh mục đã được lưu trữ, chỉ có thể xem lịch sử.',
    };
    const issues = detail?.issues?.map((issue: { message: string }) => issue.message).join(' · ');
    throw new ApiError(
      response.status,
      detail?.code || 'REQUEST_FAILED',
      messages[detail?.code] || issues || detail?.message || 'Không thể kết nối. Vui lòng thử lại.',
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
    : new Intl.NumberFormat('vi-VN', { style: 'percent', maximumFractionDigits: digits }).format(
        value,
      );
export const number = (value: number | null | undefined, digits = 2) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(value);
export const money = (value: number | null | undefined) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(value);
export const dateLabel = (value: string) =>
  new Date(value + 'T12:00:00').toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
