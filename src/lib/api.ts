export class ApiError extends Error {}

const RELOAD_KEY = 'my-company.login-reload';

/**
 * Phiên đăng nhập từ xa hết hạn (hoặc PIN đã đổi): máy chủ trả 401 kèm cờ `login`. Tải lại trang để máy chủ hiện form
 * đăng nhập. Chỉ tải lại tối đa một lần mỗi 10 giây, tránh vòng lặp nếu có gì bất thường.
 */
export function reloadForLogin(): void {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? '0');
    if (Date.now() - last < 10_000) return;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // không có sessionStorage: vẫn tải lại một lần
  }
  window.location.reload();
}

export async function api<T>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<T> {
  const method = init?.method ?? 'GET';
  const res = await fetch(path, {
    method,
    headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
    body: method === 'POST' ? JSON.stringify(init?.body ?? {}) : undefined,
    cache: 'no-store',
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* phản hồi không có thân JSON */
  }
  if (res.status === 401 && (data as { login?: boolean } | null)?.login) reloadForLogin();
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? `Lỗi ${res.status}`;
    throw new ApiError(message);
  }
  return data as T;
}
