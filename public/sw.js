/* Service worker tối thiểu cho My Company (PWA).
 * KHÔNG BAO GIỜ lưu hoặc đụng vào /api/* (dữ liệu và phiên đăng nhập luôn lấy trực tiếp từ máy chủ).
 * Chỉ làm một việc: khi mất mạng lúc mở trang thì hiện trang báo ngoại tuyến thay vì lỗi trắng của trình duyệt. */
const OFFLINE_HTML =
  '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Mất kết nối · My Company</title><body style="font:16px system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center">' +
  '<div><h1 style="font-size:20px">Không kết nối được tới My Company</h1><p>Kiểm tra Tailscale đã bật chưa và máy tính còn chạy không, rồi tải lại trang.</p>' +
  '<button onclick="location.reload()" style="font:inherit;padding:10px 18px">Tải lại</button></div></body></html>';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => new Response(OFFLINE_HTML, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })),
    );
  }
});

/* Thông báo đẩy (Web Push). Máy chủ chỉ gửi {title, body, tag}; mọi trường đều được kiểm lại và cắt ngắn ở đây.
 * Trình duyệt (đặc biệt Safari trên iPhone) đòi MỖI lần nhận tin đẩy phải hiện một thông báo, nên luôn gọi showNotification. */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  if (!data || typeof data !== 'object') data = {};
  const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
  const title = text(data.title, 100) || 'My Company';
  const options = { body: text(data.body, 200), icon: '/icons/icon-192.png' };
  const tag = text(data.tag, 64);
  if (tag) options.tag = tag;
  event.waitUntil(self.registration.showNotification(title, options));
});

/* Bấm vào thông báo: mở lại cửa sổ My Company đang có (hoặc mở mới). Luôn về trang gốc của chính ứng dụng. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
      const mine = all.find((c) => new URL(c.url).origin === self.location.origin);
      if (mine && 'focus' in mine) return mine.focus();
      return self.clients.openWindow('/');
    }),
  );
});
