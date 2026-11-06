import { api } from '@/lib/api';
import type { NotifyMode } from '@/lib/notify';

/**
 * Bật / tắt thông báo trên thiết bị này.
 * - "push": đăng ký Web Push với máy chủ, nhận được cả khi đã đóng trang (cần HTTPS hoặc localhost và trình duyệt hỗ trợ).
 * - "local": chỉ báo bằng Notification API khi trang còn mở (dùng khi không đăng ký đẩy được).
 */

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function pushSupported(): boolean {
  return notificationsSupported() && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window;
}

function keyBytes(base64url: string): Uint8Array {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function sameBytes(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false;
  const view = new Uint8Array(a);
  return view.every((value, i) => value === b[i]);
}

async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Chưa bật được service worker của trang (cần HTTPS hoặc localhost). Tải lại trang rồi thử lại.')), 8000);
  });
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

/** Đăng ký (hoặc đăng ký lại) thiết bị này với máy chủ. Trả về false nếu trình duyệt chưa có đăng ký đẩy nào. */
async function registerWithServer(subscribeIfMissing: boolean): Promise<boolean> {
  const reg = await readyRegistration();
  const { publicKey } = await api<{ publicKey: string }>('/api/push/key');
  const expected = keyBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // Khóa của máy chủ đổi (ví dụ xóa dữ liệu) thì đăng ký cũ không còn dùng được: hủy và đăng ký lại.
  if (sub && !sameBytes(sub.options.applicationServerKey, expected)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) {
    if (!subscribeIfMissing) return false;
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: expected as BufferSource });
  }
  await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
  return true;
}

export async function enableNotifications(): Promise<{ mode: Exclude<NotifyMode, 'off'>; note: string | null }> {
  if (!notificationsSupported()) {
    throw new Error('Trình duyệt này không hỗ trợ thông báo. Trên iPhone: bấm Chia sẻ → Thêm vào Màn hình chính, rồi mở My Company từ biểu tượng đó.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Bạn chưa cho phép thông báo cho trang này. Mở cài đặt của trình duyệt (biểu tượng ổ khóa cạnh địa chỉ) để cho phép.');
  }
  if (!pushSupported()) {
    return { mode: 'local', note: 'Trình duyệt hoặc địa chỉ này chưa hỗ trợ thông báo đẩy, nên chỉ báo khi trang còn mở.' };
  }
  try {
    await registerWithServer(true);
    return { mode: 'push', note: null };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'lỗi không rõ';
    return { mode: 'local', note: `Không đăng ký được thông báo đẩy (${reason}). Tạm thời chỉ báo khi trang còn mở.` };
  }
}

export async function disableNotifications(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await readyRegistration();
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
      await sub.unsubscribe();
    }
  } catch {
    // không gỡ được ở trình duyệt: máy chủ vẫn sẽ tự bỏ thiết bị khi gửi lỗi
  }
}

/**
 * Mở lại trang khi đang ở chế độ đẩy: đăng ký lại với máy chủ (phiên đăng nhập mới sau khi đăng xuất / hết hạn / đổi PIN
 * là phiên khác, đăng ký cũ đã bị gỡ). Trả về false nếu quyền bị thu hồi hoặc đăng ký đã mất, để giao diện về chế độ tắt.
 */
export async function resyncPush(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  try {
    return await registerWithServer(false);
  } catch {
    return true; // lỗi mạng tạm thời: giữ nguyên chế độ, lần mở sau thử lại
  }
}

/** Chế độ "local": hiện thông báo của trình duyệt (qua service worker nếu có, vì Chrome trên Android không cho dựng trực tiếp). */
export async function showLocalNotification(message: { tag: string; title: string; body: string }): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const options = { body: message.body, tag: message.tag, icon: '/icons/icon-192.png' };
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(message.title, options);
        return;
      }
    }
    new Notification(message.title, options);
  } catch {
    // trình duyệt chặn: bỏ qua
  }
}
