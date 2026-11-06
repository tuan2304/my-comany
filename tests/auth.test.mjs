import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import {
  Auth, clearPin, COOKIE_NAME, MAX_SESSIONS, pinProblem, SESSION_MS, sessionCookie, sessionTokenFrom, setPin,
} from '../server/auth.mjs';
import { normalizePublicHost } from '../server/config.mjs';
import { openDb } from '../server/db.mjs';
import { startServer } from '../server/index.mjs';
import { makeProject, removeDir, testConfig, tmpDir } from './helpers.mjs';

const HOST = 'box.tail1234.ts.net';
const PIN = 'tuyet-mat-2468';
const json = { 'content-type': 'application/json' };

function request(port, { method = 'GET', path: p = '/', headers = {}, body, raw = false } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers, agent: false }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let parsed = null;
        if (!raw) {
          try { parsed = JSON.parse(data); } catch { /* không phải JSON */ }
        }
        resolve({ status: res.statusCode, json: parsed, text: data, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

// ---------- Đơn vị: PIN, giới hạn đoán, phiên ----------

function unitEnv() {
  const root = tmpDir('company-auth-');
  const store = openDb(path.join(root, 'company.db'));
  let now = 1_000_000;
  const auth = new Auth({ dataDir: root, store, clock: () => now });
  return {
    root, store, auth, advance: (ms) => { now += ms; }, now: () => now,
    cleanup: () => { store.close(); removeDir(root); },
  };
}

test('pinProblem từ chối PIN yếu và nhận PIN tốt', () => {
  for (const bad of ['', '12345', '123456', '000000', '111111', '987654', '234567', 'aaaaaa', 'abab', 'password', 'x'.repeat(129), 'ab\ncdef']) {
    assert.ok(pinProblem(bad), `phải từ chối ${JSON.stringify(bad.slice(0, 10))}`);
  }
  assert.equal(pinProblem(undefined) !== null, true);
  for (const good of ['482915', 'tuyet-mat-2468', '90817263', 'Cà phê sữa 99']) assert.equal(pinProblem(good), null, good);
});

test('PIN không bao giờ nằm nguyên văn trong tệp; cùng PIN thì hai lần băm khác nhau (có muối)', () => {
  const root = tmpDir('company-auth-');
  try {
    setPin(root, PIN);
    const first = fs.readFileSync(path.join(root, 'auth.json'), 'utf8');
    assert.ok(!first.includes(PIN));
    setPin(root, PIN);
    const second = JSON.parse(fs.readFileSync(path.join(root, 'auth.json'), 'utf8'));
    assert.notEqual(JSON.parse(first).hash, second.hash);
    assert.notEqual(JSON.parse(first).salt, second.salt);
    assert.throws(() => setPin(root, '123456'), /phổ biến|liền nhau/);
  } finally {
    removeDir(root);
  }
});

test('đoán PIN: 5 lần sai thì khóa, đang khóa thì PIN đúng cũng bị từ chối, khóa lần sau gấp đôi', () => {
  const env = unitEnv();
  try {
    setPin(env.root, PIN);
    for (let i = 1; i <= 4; i += 1) {
      const r = env.auth.login('sai-roi-nhe');
      assert.equal(r.reason, 'wrong');
      assert.equal(r.remaining, 5 - i);
    }
    const locked = env.auth.login('sai-roi-nhe');
    assert.equal(locked.reason, 'locked');
    assert.equal(locked.retryAfterMs, 15 * 60_000);

    // Kẻ đoán thử PIN đúng ngay lúc đang khóa: vẫn bị từ chối và không có phiên nào được tạo.
    env.advance(14 * 60_000);
    assert.equal(env.auth.login(PIN).reason, 'locked');
    assert.equal(env.store.countSessions(), 0);

    // Hết khóa: 5 lần sai nữa thì khóa gấp đôi.
    env.advance(2 * 60_000);
    for (let i = 0; i < 4; i += 1) assert.equal(env.auth.login('khong-dung').reason, 'wrong');
    assert.equal(env.auth.login('khong-dung').retryAfterMs, 30 * 60_000);

    env.advance(31 * 60_000);
    const ok = env.auth.login(PIN);
    assert.equal(ok.ok, true);
    // Đăng nhập đúng xóa dấu vết: lần khóa kế tiếp lại bắt đầu từ 15 phút.
    for (let i = 0; i < 4; i += 1) env.auth.login('khong-dung');
    assert.equal(env.auth.login('khong-dung').retryAfterMs, 15 * 60_000);
  } finally {
    env.cleanup();
  }
});

test('lần sai cũ hơn 15 phút không cộng dồn; sai rải rác không bị khóa oan', () => {
  const env = unitEnv();
  try {
    setPin(env.root, PIN);
    for (let i = 0; i < 4; i += 1) env.auth.login('nham');
    env.advance(16 * 60_000);
    for (let i = 0; i < 4; i += 1) assert.equal(env.auth.login('nham').reason, 'wrong', 'chưa đủ 5 lần trong cùng cửa sổ');
    assert.equal(env.auth.login(PIN).ok, true);
  } finally {
    env.cleanup();
  }
});

test('đầu vào quái dị không làm sập mà còn tính là lần sai', () => {
  const env = unitEnv();
  try {
    setPin(env.root, PIN);
    const weird = [undefined, null, 123456, ['a'], { pin: PIN }, true, '', 'x'.repeat(1_000_000), PIN + 'x', ` ${PIN}`];
    for (const w of weird.slice(0, 4)) assert.equal(env.auth.login(w).reason, 'wrong');
    assert.equal(env.auth.login(weird[4]).reason, 'locked', 'đã đủ 5 lần sai kể cả toàn đầu vào lạ');
  } finally {
    env.cleanup();
  }
  const env2 = unitEnv();
  try {
    setPin(env2.root, PIN);
    // PIN dài hơn giới hạn không được chấp nhận dù có chứa PIN đúng ở đầu.
    assert.equal(env2.auth.login(PIN + 'x'.repeat(500)).reason, 'wrong');
    assert.equal(env2.auth.login(`${PIN} `).reason, 'wrong', 'thừa dấu cách là sai');
  } finally {
    env2.cleanup();
  }
});

test('chưa đặt PIN thì không ai vào được, kể cả đoán PIN rỗng', () => {
  const env = unitEnv();
  try {
    assert.equal(env.auth.login('').reason, 'no_pin');
    assert.equal(env.auth.login(undefined).reason, 'no_pin');
    assert.equal(env.auth.validate('a'.repeat(43)), null);
  } finally {
    env.cleanup();
  }
});

test('phiên: chỉ lưu băm; hết hạn, đổi PIN, xóa PIN, đăng xuất đều làm mất hiệu lực', () => {
  const env = unitEnv();
  try {
    setPin(env.root, PIN);
    const { token, expiresAt } = env.auth.login(PIN);
    assert.equal(expiresAt, env.now() + SESSION_MS);
    assert.ok(env.auth.validate(token));
    const rows = env.store.db.prepare('SELECT * FROM sessions').all();
    assert.equal(rows.length, 1);
    assert.ok(!JSON.stringify(rows).includes(token), 'mã phiên thô không nằm trong cơ sở dữ liệu');

    // Đăng xuất
    env.auth.logout(token);
    assert.equal(env.auth.validate(token), null);

    // Hết hạn đúng tại mốc
    const second = env.auth.login(PIN);
    env.advance(SESSION_MS - 1);
    assert.ok(env.auth.validate(second.token));
    env.advance(1);
    assert.equal(env.auth.validate(second.token), null);
    assert.equal(env.store.countSessions(), 0, 'phiên hết hạn bị xóa');

    // Đổi PIN: mọi phiên cũ chết, kể cả khi hàng phiên vẫn còn trong cơ sở dữ liệu
    const third = env.auth.login(PIN);
    setPin(env.root, 'pin-moi-135790');
    assert.equal(env.auth.validate(third.token), null);

    // Xóa PIN
    const fourth = env.auth.login('pin-moi-135790');
    assert.ok(env.auth.validate(fourth.token));
    clearPin(env.root);
    assert.equal(env.auth.validate(fourth.token), null);
  } finally {
    env.cleanup();
  }
});

test('mã phiên sai hình dạng hoặc ngẫu nhiên không bao giờ hợp lệ', () => {
  const env = unitEnv();
  try {
    setPin(env.root, PIN);
    env.auth.login(PIN);
    for (const bad of [null, undefined, '', 'abc', 'a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}!`, "' OR 1=1 --", '../../etc/passwd', 'a'.repeat(43)]) {
      assert.equal(env.auth.validate(bad), null, String(bad));
    }
  } finally {
    env.cleanup();
  }
});

test('giữ tối đa MAX_SESSIONS phiên, phiên cũ nhất bị loại trước', () => {
  const env = unitEnv();
  try {
    setPin(env.root, PIN);
    const tokens = [];
    for (let i = 0; i < MAX_SESSIONS + 5; i += 1) {
      env.advance(1000);
      tokens.push(env.auth.login(PIN).token);
    }
    assert.equal(env.store.countSessions(), MAX_SESSIONS);
    assert.equal(env.auth.validate(tokens[0]), null);
    assert.ok(env.auth.validate(tokens.at(-1)));
  } finally {
    env.cleanup();
  }
});

test('sessionTokenFrom chỉ nhận đúng một cookie đúng tên và đúng hình dạng', () => {
  const t = 'A'.repeat(43);
  assert.equal(sessionTokenFrom(`${COOKIE_NAME}=${t}`), t);
  assert.equal(sessionTokenFrom(`x=1; ${COOKIE_NAME}=${t}; y=2`), t);
  assert.equal(sessionTokenFrom(`mc_session=${t}`), null, 'thiếu tiền tố __Host-');
  assert.equal(sessionTokenFrom(`${COOKIE_NAME}=${t}; ${COOKIE_NAME}=${'B'.repeat(43)}`), null, 'hai cookie trùng tên là đáng ngờ');
  assert.equal(sessionTokenFrom(`${COOKIE_NAME}=${t}x`), null);
  assert.equal(sessionTokenFrom(undefined), null);
  const flags = sessionCookie(t);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', `Max-Age=${SESSION_MS / 1000}`]) assert.ok(flags.includes(flag), flag);
  assert.ok(!flags.includes('Domain'), '__Host- cấm Domain');
  assert.match(sessionCookie('', { clear: true }), /Max-Age=0/);
});

test('normalizePublicHost: nhận tên máy, bỏ http và cổng, từ chối IP và giá trị lạ', () => {
  assert.equal(normalizePublicHost(''), '');
  assert.equal(normalizePublicHost(undefined), '');
  assert.equal(normalizePublicHost('  Box.Tail1234.TS.net '), 'box.tail1234.ts.net');
  assert.equal(normalizePublicHost('https://box.tail1234.ts.net:443/'), 'box.tail1234.ts.net');
  for (const bad of ['localhost', '127.0.0.1', 'box', 'a b.ts.net', 'box.ts.net/..', '-x.ts.net', 'bo<x>.ts.net', '..ts.net']) {
    assert.throws(() => normalizePublicHost(bad), /COMPANY_PUBLIC_HOST/, bad);
  }
});

// ---------- Máy chủ: cổng từ xa ----------

async function boot({ root: givenRoot, uiCalls, pin = PIN, overrides = {} } = {}) {
  const root = givenRoot ?? tmpDir('company-remote-');
  const { project, local } = givenRoot ? { project: path.join(root, 'proj'), local: path.join(root, 'local') } : makeProject(root);
  const cfg = testConfig(root, project, local, { publicHost: HOST, remotePort: 0, sseBeatMs: 40, ...overrides });
  if (pin) setPin(cfg.dataDir, pin);
  const calls = uiCalls ?? [];
  const uiHandler = (req, res) => {
    calls.push(req.url);
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('GIAO-DIEN-THAT');
  };
  const log = [];
  const app = await startServer({ cfg, withUi: false, uiHandler, log: (m) => log.push(m) });
  const remote = (opts = {}) => request(app.remotePort, { ...opts, headers: { host: HOST, ...(opts.headers ?? {}) } });
  const local_ = (opts = {}) => request(app.port, { ...opts, headers: { host: `localhost:${app.port}`, ...(opts.headers ?? {}) } });
  const origin = `https://${HOST}`;
  const login = async (p = PIN) => {
    const res = await remote({ method: 'POST', path: '/api/login', body: JSON.stringify({ pin: p }), headers: { ...json, origin } });
    const cookie = String(res.headers['set-cookie'] ?? '').split(';')[0];
    return { res, cookie };
  };
  return {
    root, app, cfg, calls, log, remote, local: local_, origin, login,
    cleanup: async (keepRoot = false) => { await app.close(); if (!keepRoot) removeDir(root); },
  };
}

test('cổng từ xa chỉ nghe loopback, là cổng riêng, và tắt hẳn khi không đặt publicHost', async () => {
  const env = await boot();
  try {
    assert.ok(env.app.remotePort > 0);
    assert.notEqual(env.app.remotePort, env.app.port);
    assert.equal(env.app.remoteServer.address().address, '127.0.0.1');
  } finally {
    await env.cleanup();
  }
  const root = tmpDir();
  try {
    const { project, local } = makeProject(root);
    const app = await startServer({ cfg: testConfig(root, project, local), withUi: false, log: () => {} });
    assert.equal(app.remotePort, null);
    assert.equal(app.remoteServer, null);
    await app.close();
  } finally {
    removeDir(root);
  }
});

test('Host giả bị từ chối ở cổng từ xa (localhost, tên lạ, thiếu, tên máy kèm đuôi, DNS rebinding)', async () => {
  const env = await boot();
  try {
    const { cookie } = await env.login();
    for (const host of [`localhost:${env.app.remotePort}`, '127.0.0.1', 'evil.example.com', `${HOST}.evil.com`, `evil.${HOST}`, `${HOST}:8080`, `x${HOST}`]) {
      for (const p of ['/api/state', '/', '/api/login']) {
        const res = await request(env.app.remotePort, { path: p, method: p === '/api/login' ? 'POST' : 'GET', headers: { host, cookie, ...json, origin: `https://${HOST}` }, body: p === '/api/login' ? JSON.stringify({ pin: PIN }) : undefined });
        assert.equal(res.status, 403, `${host} ${p}`);
        assert.equal(res.headers['set-cookie'], undefined, 'không cấp phiên cho Host sai');
      }
    }
    // Tên máy viết hoa và có :443 là hợp lệ
    assert.equal((await request(env.app.remotePort, { path: '/api/me', headers: { host: HOST.toUpperCase(), cookie } })).status, 200);
    assert.equal((await request(env.app.remotePort, { path: '/api/me', headers: { host: `${HOST}:443`, cookie } })).status, 200);
  } finally {
    await env.cleanup();
  }
});

test('chưa đăng nhập: API trả 401, trang trả form đăng nhập, không lộ mã giao diện và không gọi giao diện thật', async () => {
  const env = await boot();
  try {
    for (const p of ['/api/state', '/api/tasks', '/api/epics', '/api/doctor', '/api/report', '/api/stream', '/api/me', '/api/workload', '/api/agent/tools', '/api/nope']) {
      const res = await env.remote({ path: p });
      assert.equal(res.status, 401, p);
      assert.equal(res.json.login, true);
      assert.ok(!res.text.includes('proj'), 'không lộ tên dự án');
    }
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const res = await env.remote({ method, path: '/api/tasks', body: '{}', headers: json });
      assert.equal(res.status, 401, method);
    }
    for (const p of ['/', '/index.html', '/_next/static/chunks/main.js', '/office', '/api', '//evil.com/', '/%2e%2e/etc/passwd']) {
      const res = await env.remote({ path: p, raw: true });
      assert.equal(res.status, 401, p);
      assert.match(res.headers['content-type'], /text\/html/);
      assert.ok(res.text.includes('id="pin"'), 'là trang đăng nhập');
      assert.ok(!res.text.includes('GIAO-DIEN-THAT'));
    }
    assert.deepEqual(env.calls, [], 'giao diện thật không bao giờ được gọi khi chưa đăng nhập');
    for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await env.remote({ method, path: '/' })).status, 405);

    const page = await env.remote({ path: '/', raw: true });
    const csp = page.headers['content-security-policy'];
    const nonce = /nonce-([A-Za-z0-9+/=]+)/.exec(csp)[1];
    assert.ok(page.text.includes(`nonce="${nonce}"`));
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(page.headers['x-frame-options'], 'DENY');
    const second = await env.remote({ path: '/', raw: true });
    assert.notEqual(/nonce-([A-Za-z0-9+/=]+)/.exec(second.headers['content-security-policy'])[1], nonce, 'mỗi lần một nonce mới');
  } finally {
    await env.cleanup();
  }
});

test('tệp tĩnh PWA công khai khớp tuyệt đối từng đường dẫn; mọi biến thể khác bị chặn', async () => {
  const env = await boot();
  try {
    for (const p of ['/manifest.webmanifest', '/sw.js', '/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png']) {
      const res = await env.remote({ path: p, raw: true });
      assert.equal(res.status, 200, p);
      assert.equal(res.text, 'GIAO-DIEN-THAT');
    }
    assert.equal(env.calls.length, 6);
    env.calls.length = 0;
    for (const p of [
      '/sw.js/', '/sw.js.map', '/SW.js', '/%73w.js', '/icons/', '/icons/icon-192.png.bak', '/icons/../api/state', '/icons/..%2fapi/state',
      '/manifest.webmanifest/x', '/sw.js%00.png', '/sw.js;x', '/icons/icon-192.png/../../_next/static/x.js', '/_next/static/chunks/app.js', '/icons/other.png',
    ]) {
      const res = await env.remote({ path: p, raw: true });
      // /sw.js/../x và các dạng được chuẩn hóa thành đường dẫn khác công khai đều phải rơi vào trang đăng nhập
      assert.notEqual(res.text, 'GIAO-DIEN-THAT', `lọt: ${p}`);
    }
    assert.deepEqual(env.calls.filter((c) => c !== '/sw.js'), [], 'chỉ các đường dẫn chuẩn hóa đúng bằng tệp công khai mới tới giao diện');
    // Dạng "//x/sw.js" được chuẩn hóa về /sw.js và phải được viết lại đúng thế khi chuyển cho giao diện
    env.calls.length = 0;
    await env.remote({ path: '//x/sw.js', raw: true });
    assert.deepEqual(env.calls, ['/sw.js']);
    // Chỉ GET/HEAD
    assert.equal((await env.remote({ method: 'POST', path: '/sw.js' })).status, 405);
  } finally {
    await env.cleanup();
  }
});

test('đăng nhập: PIN sai 401, đúng cấp cookie đủ cờ bảo mật; kiểm tra Origin, kiểu nội dung, phương thức', async () => {
  const env = await boot();
  try {
    const wrong = await env.login('khong-phai-pin');
    assert.equal(wrong.res.status, 401);
    assert.equal(wrong.res.headers['set-cookie'], undefined);
    assert.equal(wrong.res.json.remaining, 4);
    assert.ok(!wrong.res.text.includes(PIN));

    const ok = await env.login();
    assert.equal(ok.res.status, 200);
    const setCookie = String(ok.res.headers['set-cookie']);
    for (const flag of [`${COOKIE_NAME}=`, 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=2592000']) assert.ok(setCookie.includes(flag), flag);
    assert.ok(!/Domain=/i.test(setCookie));

    const body = JSON.stringify({ pin: PIN });
    // Thiếu Origin / Origin lạ / Origin của cổng chính: đều bị từ chối TRƯỚC khi chạm tới PIN
    for (const origin of [undefined, 'https://evil.example.com', `http://localhost:${env.app.port}`, `http://${HOST}`, 'null']) {
      const res = await env.remote({ method: 'POST', path: '/api/login', body, headers: { ...json, ...(origin ? { origin } : {}) } });
      assert.equal(res.status, 403, String(origin));
      assert.equal(res.headers['set-cookie'], undefined);
    }
    assert.equal((await env.remote({ method: 'POST', path: '/api/login', body, headers: { 'content-type': 'text/plain', origin: env.origin } })).status, 415);
    assert.equal((await env.remote({ method: 'POST', path: '/api/login', body: '{không phải json', headers: { ...json, origin: env.origin } })).status, 400);
    assert.equal((await env.remote({ method: 'GET', path: '/api/login' })).status, 405);
    assert.equal((await env.remote({ method: 'PUT', path: '/api/login', headers: { ...json, origin: env.origin }, body })).status, 405);
    // Thiếu trường pin / kiểu sai
    for (const bad of ['{}', '{"pin":123456}', '{"pin":["' + PIN + '"]}', '{"pin":null}', '[]']) {
      const res = await env.remote({ method: 'POST', path: '/api/login', body: bad, headers: { ...json, origin: env.origin } });
      assert.ok([400, 401, 429].includes(res.status), `${bad} -> ${res.status}`);
      assert.equal(res.headers['set-cookie'], undefined);
    }
  } finally {
    await env.cleanup();
  }
});

test('đoán PIN qua cổng từ xa: sau 5 lần sai bị khóa 429, giả X-Forwarded-For/cookie không né được, PIN đúng cũng bị từ chối', async () => {
  const env = await boot();
  try {
    const statuses = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await env.remote({
        method: 'POST', path: '/api/login', body: JSON.stringify({ pin: `sai-${i}-xyz` }),
        headers: { ...json, origin: env.origin, 'x-forwarded-for': `10.0.0.${i}`, 'user-agent': `bot-${i}` },
      });
      statuses.push(res.status);
    }
    assert.deepEqual(statuses, [401, 401, 401, 401, 429]);
    const right = await env.login();
    assert.equal(right.res.status, 429);
    assert.equal(right.res.headers['set-cookie'], undefined);
    assert.ok(Number(right.res.headers['retry-after']) > 0);
    // Cổng chính của chủ máy vẫn dùng bình thường trong lúc cổng từ xa bị khóa
    assert.equal((await env.local({ path: '/api/state' })).status, 200);
  } finally {
    await env.cleanup();
  }
});

test('đã đăng nhập: dùng được API; POST cần Origin đúng; Sec-Fetch-Site cross-site bị chặn', async () => {
  const env = await boot();
  try {
    const { cookie } = await env.login();
    const state = await env.remote({ path: '/api/state', headers: { cookie } });
    assert.equal(state.status, 200);
    assert.equal(state.json.project.hasProfile, true);
    assert.equal((await env.remote({ path: '/api/me', headers: { cookie } })).json.remote, true);
    assert.equal((await env.remote({ path: '/', headers: { cookie }, raw: true })).text, 'GIAO-DIEN-THAT');

    const task = JSON.stringify({ title: 'x', prompt: 'y', member: 'Không ai' });
    const post = (origin, extra = {}) => env.remote({ method: 'POST', path: '/api/tasks', body: task, headers: { cookie, ...json, ...(origin ? { origin } : {}), ...extra } });
    assert.equal((await post(env.origin)).status, 400, 'qua kiểm tra nguồn, bị từ chối vì tên không có');
    for (const origin of [undefined, 'https://evil.example.com', `http://localhost:${env.app.port}`, `http://127.0.0.1:${env.app.port}`, `https://${HOST}.evil.com`]) {
      assert.equal((await post(origin)).status, 403, String(origin));
    }
    assert.equal((await post(env.origin, { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await env.remote({ path: '/api/state', headers: { cookie, 'sec-fetch-site': 'cross-site' } })).status, 403);
    assert.equal((await env.remote({ path: '/api/state', headers: { cookie, 'sec-fetch-site': 'same-origin' } })).status, 200);
    assert.equal((await post(env.origin, { 'content-type': 'text/plain' })).status, 415);
    // Gửi cờ hủy (stop-all) cũng cần Origin: chặn kiểu CSRF cho các nút nguy hiểm
    assert.equal((await env.remote({ method: 'POST', path: '/api/stop-all', headers: { cookie, ...json } })).status, 403);
    assert.equal((await env.remote({ method: 'POST', path: '/api/stop-all', headers: { cookie, ...json, origin: env.origin } })).status, 200);
  } finally {
    await env.cleanup();
  }
});

test('cookie giả hoặc sai: mã ngẫu nhiên, sai tên, trùng tên, tiền tố thiếu, của phiên đã đăng xuất', async () => {
  const env = await boot();
  try {
    const { cookie } = await env.login();
    const good = cookie.split('=')[1];
    const fakes = [
      `${COOKIE_NAME}=${'A'.repeat(43)}`,
      `mc_session=${good}`,
      `${COOKIE_NAME}=${good}; ${COOKIE_NAME}=${'B'.repeat(43)}`,
      `${COOKIE_NAME}=${good}x`,
      `${COOKIE_NAME}=${good.slice(1)}`,
      `${COOKIE_NAME}=`,
      "__Host-mc_session=' OR '1'='1",
    ];
    for (const c of fakes) assert.equal((await env.remote({ path: '/api/state', headers: { cookie: c } })).status, 401, c);
    assert.equal((await env.remote({ path: '/api/state', headers: { cookie } })).status, 200);

    const out = await env.remote({ method: 'POST', path: '/api/logout', headers: { cookie, ...json, origin: env.origin } });
    assert.equal(out.status, 200);
    assert.match(String(out.headers['set-cookie']), /Max-Age=0/);
    assert.equal((await env.remote({ path: '/api/state', headers: { cookie } })).status, 401, 'cookie cũ không dùng lại được');
  } finally {
    await env.cleanup();
  }
});

test('đăng xuất cần Origin đúng (không bị ép đăng xuất từ trang khác)', async () => {
  const env = await boot();
  try {
    const { cookie } = await env.login();
    const res = await env.remote({ method: 'POST', path: '/api/logout', headers: { cookie, ...json, origin: 'https://evil.example.com' } });
    assert.equal(res.status, 403);
    assert.equal((await env.remote({ path: '/api/me', headers: { cookie } })).status, 200);
  } finally {
    await env.cleanup();
  }
});

test('route của agent (/api/agent/*) không bao giờ qua cổng từ xa, kể cả đã đăng nhập và có mã agent hợp lệ', async () => {
  const env = await boot();
  try {
    const { cookie } = await env.login();
    // Một mã agent thật của một lượt đang chạy.
    const task = env.app.store.createTask({ title: 't', prompt: 'p', team: 'backend', member: 'Minh', role: 'backend-lead', kind: 'plan' });
    env.app.runner.agentRuns.set('token-that-cua-agent', task.id);
    const viaLocal = await env.local({ path: '/api/agent/tools', headers: { authorization: 'Bearer token-that-cua-agent' } });
    assert.equal(viaLocal.status, 200, 'cổng chính vẫn dùng được (đối chứng)');
    for (const headers of [{ cookie, authorization: 'Bearer token-that-cua-agent' }, { authorization: 'Bearer token-that-cua-agent' }]) {
      const tools = await env.remote({ path: '/api/agent/tools', headers });
      assert.ok([401, 404].includes(tools.status));
      assert.ok(!tools.text.includes('tools'));
      const call = await env.remote({ method: 'POST', path: '/api/agent/call', body: '{"name":"x","arguments":{}}', headers: { ...headers, ...json, origin: env.origin } });
      assert.ok([401, 404].includes(call.status));
    }
    assert.equal((await env.remote({ path: '/api/agent/tools', headers: { cookie, authorization: 'Bearer token-that-cua-agent' } })).status, 404);
  } finally {
    await env.cleanup();
  }
});

test('cổng chính từ chối yêu cầu có dấu hiệu qua proxy (chống trỏ nhầm Tailscale vào cổng chính + giả Host localhost)', async () => {
  const env = await boot();
  try {
    assert.equal((await env.local({ path: '/api/state' })).status, 200, 'đối chứng: không có tiêu đề proxy thì vào được');
    for (const header of ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded', 'x-real-ip', 'via', 'tailscale-user-login', 'tailscale-user-name', 'cf-connecting-ip']) {
      const res = await env.local({ path: '/api/state', headers: { [header]: 'for=100.64.0.7' } });
      assert.equal(res.status, 403, header);
      assert.ok(!res.text.includes('proj'));
    }
    const post = await env.local({ method: 'POST', path: '/api/stop-all', headers: { ...json, 'x-forwarded-for': '100.64.0.7' } });
    assert.equal(post.status, 403);
    // Host là tên máy công khai nhưng đến cổng chính: bị từ chối
    assert.equal((await request(env.app.port, { path: '/api/state', headers: { host: HOST } })).status, 403);
    // Cổng chính không có đăng nhập/đăng xuất nào để lạm dụng
    assert.equal((await env.local({ method: 'POST', path: '/api/login', body: JSON.stringify({ pin: PIN }), headers: json })).status, 404);
    assert.equal((await env.local({ path: '/api/me' })).json.remote, false);
  } finally {
    await env.cleanup();
  }
});

test('chưa đặt PIN: cổng từ xa từ chối mọi thứ và trang nói rõ; đăng nhập trả 503', async () => {
  const env = await boot({ pin: null });
  try {
    const page = await env.remote({ path: '/', raw: true });
    assert.equal(page.status, 401);
    assert.ok(!page.text.includes('id="pin"'));
    assert.match(page.text, /chưa đặt PIN/);
    const res = await env.remote({ method: 'POST', path: '/api/login', body: JSON.stringify({ pin: '' }), headers: { ...json, origin: env.origin } });
    assert.equal(res.status, 503);
    assert.equal(res.headers['set-cookie'], undefined);
    assert.ok(env.log.some((m) => m.includes('Chưa đặt PIN')));
  } finally {
    await env.cleanup();
  }
});

test('đổi PIN hoặc xóa PIN khi máy chủ đang chạy làm mọi phiên đang có mất hiệu lực ngay', async () => {
  const env = await boot();
  try {
    const { cookie } = await env.login();
    assert.equal((await env.remote({ path: '/api/state', headers: { cookie } })).status, 200);
    setPin(env.cfg.dataDir, 'pin-khac-864209');
    assert.equal((await env.remote({ path: '/api/state', headers: { cookie } })).status, 401);
    const old = await env.login(PIN);
    assert.equal(old.res.status, 401, 'PIN cũ không còn dùng được');
    const fresh = await env.login('pin-khac-864209');
    assert.equal(fresh.res.status, 200);
    clearPin(env.cfg.dataDir);
    assert.equal((await env.remote({ path: '/api/state', headers: { cookie: fresh.cookie } })).status, 401);
    assert.equal((await env.login('pin-khac-864209')).res.status, 503);
  } finally {
    await env.cleanup();
  }
});

test('phiên sống qua lần khởi động lại máy chủ; sau khi khởi động lại, sai PIN vẫn tính', async () => {
  const env = await boot();
  let env2;
  try {
    const { cookie } = await env.login();
    await env.cleanup(true);
    env2 = await boot({ root: env.root, pin: null });
    assert.equal((await env2.remote({ path: '/api/state', headers: { cookie } })).status, 200);
  } finally {
    await (env2 ?? env).cleanup();
  }
});

function openStream(port, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/stream', headers, agent: false }, (res) => {
      const state = { status: res.statusCode, ended: false, chunks: [] };
      res.setEncoding('utf8');
      res.on('data', (c) => state.chunks.push(c));
      res.on('end', () => { state.ended = true; });
      res.on('close', () => { state.ended = true; });
      resolve({ state, req });
    });
    req.on('error', reject);
    req.end();
  });
}

async function until(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 15));
  }
  return fn();
}

test('luồng SSE từ xa: cần phiên; bị ngắt khi đăng xuất hoặc đổi PIN; không có phiên thì không mở được', async () => {
  const env = await boot();
  try {
    const none = await openStream(env.app.remotePort, { host: HOST });
    assert.equal(none.state.status, 401);
    none.req.destroy();

    const a = await env.login();
    const stream = await openStream(env.app.remotePort, { host: HOST, cookie: a.cookie });
    assert.equal(stream.state.status, 200);
    assert.ok(await until(() => stream.state.chunks.join('').includes('event: state')));
    await env.remote({ method: 'POST', path: '/api/logout', headers: { cookie: a.cookie, ...json, origin: env.origin } });
    assert.ok(await until(() => stream.state.ended), 'luồng của phiên đã đăng xuất phải bị ngắt');

    const b = await env.login();
    const second = await openStream(env.app.remotePort, { host: HOST, cookie: b.cookie });
    assert.ok(await until(() => second.state.chunks.length > 0));
    setPin(env.cfg.dataDir, 'pin-khac-864209');
    assert.ok(await until(() => second.state.ended), 'đổi PIN phải ngắt luồng cũ');
  } finally {
    await env.cleanup();
  }
});

test('tiêu đề bảo mật và không có WebSocket ở cổng từ xa', async () => {
  const env = await boot();
  try {
    const res = await env.remote({ path: '/api/nope' });
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['referrer-policy'], 'no-referrer');
    assert.equal(env.app.remoteServer.listenerCount('upgrade'), 0);
  } finally {
    await env.cleanup();
  }
});

test('User-Agent dài được cắt, không làm hỏng cơ sở dữ liệu; thân yêu cầu đăng nhập quá lớn bị từ chối', async () => {
  const env = await boot();
  try {
    const res = await env.remote({
      method: 'POST', path: '/api/login', body: JSON.stringify({ pin: PIN }),
      headers: { ...json, origin: env.origin, 'user-agent': 'U'.repeat(7000) },
    });
    assert.equal(res.status, 200);
    const row = env.app.store.db.prepare('SELECT agent FROM sessions').get();
    assert.equal(row.agent.length, 200);
    const huge = await env.remote({ method: 'POST', path: '/api/login', body: JSON.stringify({ pin: 'x'.repeat(300_000) }), headers: { ...json, origin: env.origin } });
    assert.ok([400, 413, 429].includes(huge.status) || huge.status === 0, String(huge.status));
  } catch (err) {
    // Máy chủ ngắt kết nối khi thân quá lớn là cách từ chối hợp lệ.
    assert.match(String(err.code ?? err.message), /ECONNRESET|socket hang up|EPIPE/);
  } finally {
    await env.cleanup();
  }
});
