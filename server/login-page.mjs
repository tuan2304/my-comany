/**
 * Trang đăng nhập cho cổng từ xa. Máy chủ tự trả về (không qua Next.js) để người chưa đăng nhập không tải được
 * bất kỳ mã giao diện nào của ứng dụng. Mọi chữ trong trang là hằng số, không chèn dữ liệu của người gọi.
 */
export function loginPage({ nonce, hasPin }) {
  const body = hasPin
    ? `<form id="f" autocomplete="on">
      <label for="pin">PIN</label>
      <input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" autofocus required minlength="6" maxlength="128">
      <button type="submit" id="go">Đăng nhập</button>
      <p id="msg" role="alert"></p>
    </form>`
    : `<p class="warn">Máy chủ chưa đặt PIN nên chưa cho vào từ xa.</p>
    <p>Trên máy tính chạy My Company, mở cửa sổ lệnh trong thư mục công cụ và chạy <code>npm run pin -- set</code>, rồi tải lại trang này.</p>`;
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#2f6fed">
<title>Đăng nhập · My Company</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<style nonce="${nonce}">
:root{color-scheme:light dark;--bg:#f6f7f9;--surface:#fff;--text:#1c2127;--muted:#5f6b7a;--border:#dde1e7;--accent:#2f6fed;--accent-text:#fff;--bad:#c62828}
@media(prefers-color-scheme:dark){:root{--bg:#14171c;--surface:#1c2027;--text:#e6e9ee;--muted:#9aa4b2;--border:#2c323c;--accent:#6a9bff;--accent-text:#0e1116;--bad:#ff7b72}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
main{width:100%;max-width:360px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px}
h1{margin:0 0 4px;font-size:22px}
.sub{margin:0 0 20px;color:var(--muted);font-size:14px}
label{display:block;font-size:14px;font-weight:600;margin-bottom:6px}
input{width:100%;min-height:48px;padding:10px 12px;font-size:20px;letter-spacing:.2em;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--text)}
button{margin-top:14px;width:100%;min-height:48px;border:0;border-radius:10px;background:var(--accent);color:var(--accent-text);font-size:16px;font-weight:600}
button[disabled]{opacity:.6}
#msg{min-height:1.5em;margin:12px 0 0;color:var(--bad);font-size:14px}
code{background:var(--bg);padding:1px 5px;border-radius:4px;font-size:13px}
.warn{color:var(--bad)}
</style>
</head>
<body>
<main>
  <h1>My Company</h1>
  <p class="sub">Nhập PIN để vào từ xa.</p>
  ${body}
</main>
<script nonce="${nonce}">
(function () {
  var f = document.getElementById('f');
  if (!f) return;
  var msg = document.getElementById('msg');
  var go = document.getElementById('go');
  if (location.protocol !== 'https:') msg.textContent = 'Trang này phải mở bằng https:// (qua Tailscale). Qua http thì trình duyệt không giữ phiên đăng nhập.';
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    msg.textContent = '';
    go.disabled = true;
    fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: document.getElementById('pin').value }),
      credentials: 'same-origin'
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.ok) { location.reload(); return; }
        msg.textContent = data.error || ('Lỗi ' + res.status);
        go.disabled = false;
        document.getElementById('pin').select();
      });
    }).catch(function () {
      msg.textContent = 'Không kết nối được tới máy chủ.';
      go.disabled = false;
    });
  });
})();
</script>
</body>
</html>`;
}
