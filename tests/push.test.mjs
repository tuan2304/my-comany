import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { setPin } from '../server/auth.mjs';
import { openDb } from '../server/db.mjs';
import { startServer } from '../server/index.mjs';
import { ownerRequests as ownerRequestsJs } from '../server/owner-requests.mjs';
import { loadVapidKeys, MAX_SUBSCRIPTIONS, PushService, validateEndpoint, validateSubscription } from '../server/push.mjs';
import { ownerRequests as ownerRequestsTs } from '../src/office/status.ts';
import { makeProject, removeDir, testConfig, tmpDir } from './helpers.mjs';

const HOST = 'box.tail1234.ts.net';
const PIN = 'tuyet-mat-2468';
const json = { 'content-type': 'application/json' };

// ---------- Công cụ ----------

/** Thiết bị giả: có khóa thật để máy chủ mã hóa thật và bài test giải mã lại được. */
function makeDevice(id, host = 'fcm.googleapis.com') {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const authSecret = crypto.randomBytes(16);
  return {
    ecdh,
    authSecret,
    subscription: {
      endpoint: `https://${host}/fcm/send/${id}`,
      keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: authSecret.toString('base64url') },
    },
  };
}

/** Giải mã bản tin aes128gcm (RFC 8188/8291) như một thiết bị thật. */
function decryptPush(body, device) {
  const salt = body.subarray(0, 16);
  const idLen = body[20];
  const senderPublic = body.subarray(21, 21 + idLen);
  const cipher = body.subarray(21 + idLen);
  const secret = device.ecdh.computeSecret(senderPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), device.ecdh.getPublicKey(), senderPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, device.authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(cipher.subarray(cipher.length - 16));
  const plain = Buffer.concat([decipher.update(cipher.subarray(0, cipher.length - 16)), decipher.final()]);
  let end = plain.length;
  while (end > 0 && plain[end - 1] === 0) end -= 1;
  assert.equal(plain[end - 1], 2, 'bản ghi cuối phải có dấu kết thúc 0x02');
  return plain.subarray(0, end - 1).toString('utf8');
}

function verifyVapid(header, { publicKey, audience, subject }) {
  const m = /^vapid t=([\w-]+\.[\w-]+\.[\w-]+), k=([\w-]+)$/.exec(header ?? '');
  assert.ok(m, `Authorization sai dạng: ${header}`);
  assert.equal(m[2], publicKey, 'khóa công khai trong tiêu đề phải khớp');
  const [h, p, sig] = m[1].split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(claims.aud, audience);
  assert.equal(claims.sub, subject);
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600, 'exp trong 24 giờ');
  const raw = Buffer.from(publicKey, 'base64url');
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')), 'chữ ký VAPID phải đúng');
}

/** Dịch vụ đẩy giả (http thường): ghi lại yêu cầu, trả mã theo `status`. */
async function fakePushService() {
  const requests = [];
  const state = { status: 201 };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      requests.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(state.status);
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  // web-push luôn dùng https.request; ở đây nối thẳng vào máy chủ http thường để khỏi cần chứng chỉ.
  const agent = new https.Agent();
  agent.createConnection = () => net.connect(port, '127.0.0.1');
  return { requests, state, port, agent, close: () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections?.(); }) };
}

// ---------- Môi trường đơn vị: dịch vụ + sự kiện giả ----------

function svcEnv({ send, auth, extraHosts, requestOptions, subject = 'https://box.example' } = {}) {
  const root = tmpDir('company-push-');
  const store = openDb(path.join(root, 'company.db'));
  const runner = new EventEmitter();
  const clock = { now: 1_700_000_000_000 };
  const calls = [];
  const behaviour = new Map(); // endpoint → hàm ném lỗi / không
  const defaultSend = async (sub, payload, opts) => {
    calls.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), raw: payload, opts });
    const fn = behaviour.get(sub.endpoint);
    if (fn) fn();
  };
  const logs = [];
  const svc = new PushService({
    store, runner, dataDir: root, subject, extraHosts, requestOptions,
    auth: auth ?? { validateHash: () => ({}) },
    send: send ?? defaultSend,
    clock: () => clock.now,
    log: (m) => logs.push(m),
  });
  svc.start();
  const subscribe = (n, opts) => svc.subscribe(makeDevice(`d${n}`).subscription, opts);
  const settle = async () => { await Promise.allSettled([...svc.pending]); };
  return {
    root, store, runner, svc, clock, calls, behaviour, logs, subscribe, settle,
    cleanup: async () => { await svc.stop(); store.close(); removeDir(root); },
  };
}

const epicRow = (over = {}) => ({ id: 1, title: 'Làm trang chủ', status: 'awaiting_plan', director: 'Giám đốc', ...over });
const jobRow = (over = {}) => ({ id: 1, title: 'Sửa lỗi', status: 'attention', lead: 'Trưởng nhóm', epic_id: null, ...over });

// ---------- Địa chỉ đăng ký (chống SSRF) ----------

test('địa chỉ đăng ký: chỉ nhận dịch vụ đẩy đã biết qua https, chặn mọi mánh trỏ về máy mình / mạng nội bộ', () => {
  for (const ok of [
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://xx.push.services.mozilla.com/wpush/v2/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
    'https://web.push.apple.com/QabC',
    'https://FCM.GoogleAPIs.com/fcm/send/abc',
    'https://fcm.googleapis.com:443/fcm/send/abc',
  ]) assert.doesNotThrow(() => validateEndpoint(ok), ok);

  for (const bad of [
    'http://fcm.googleapis.com/fcm/send/abc', // không https
    'https://localhost/x', 'https://127.0.0.1/x', 'https://[::1]/x', 'https://0.0.0.0/x', 'https://169.254.169.254/latest/meta-data',
    'https://10.0.0.5/x', 'https://2130706433/x', 'https://0x7f.1/x',
    'https://fcm.googleapis.com.evil.com/x', 'https://evilfcm.googleapis.com/x', 'https://fcm-googleapis.com/x',
    'https://fcm.googleapis.com@evil.com/x', 'https://fcm.googleapis.com%2f@evil.com/x', 'https://user:pass@fcm.googleapis.com/x',
    'https://fcm.googleapis.com:8443/x', 'https://updates.push.services.mozilla.com:6379/x',
    'https://notify.windows.com/x', 'https://x.notify.windows.com.evil.com/x', 'https://push.services.mozilla.com/x',
    'https://apple.com/x', 'https://web.push.apple.com.evil.com/x',
    'ftp://fcm.googleapis.com/x', 'javascript:alert(1)', 'file:///etc/passwd', '//evil.com/x', 'fcm.googleapis.com/x', '', ' ',
    `https://fcm.googleapis.com/${'a'.repeat(2100)}`,
  ]) assert.throws(() => validateEndpoint(bad), /không hợp lệ|không được hỗ trợ/, bad.slice(0, 60));

  for (const bad of [null, undefined, 42, {}, [], true]) assert.throws(() => validateEndpoint(bad));
  // Tên máy thêm riêng được dùng mọi cổng, nhưng vẫn phải https.
  assert.doesNotThrow(() => validateEndpoint('https://push.nhacung.cap:8443/x', ['push.nhacung.cap']));
  assert.throws(() => validateEndpoint('http://push.nhacung.cap/x', ['push.nhacung.cap']));
  assert.throws(() => validateEndpoint('https://push.nhacung.cap.evil.com/x', ['push.nhacung.cap']));
});

test('khóa của thiết bị: đúng độ dài, đúng dạng, không nhận rác', () => {
  const good = makeDevice('a').subscription;
  assert.doesNotThrow(() => validateSubscription(good));
  const rebuild = (keys) => ({ endpoint: good.endpoint, keys: { ...good.keys, ...keys } });
  const point = Buffer.from(good.keys.p256dh, 'base64url');
  for (const bad of [
    null, undefined, 'x', [], { endpoint: good.endpoint }, { endpoint: good.endpoint, keys: null },
    rebuild({ p256dh: '' }), rebuild({ p256dh: 'AAAA' }), rebuild({ p256dh: `${good.keys.p256dh}=` }), rebuild({ p256dh: good.keys.p256dh.replace(/[-_]/, '+') + '+/' }),
    rebuild({ p256dh: Buffer.concat([Buffer.from([2]), point.subarray(1)]).toString('base64url') }), // không bắt đầu bằng 0x04
    rebuild({ p256dh: point.subarray(0, 64).toString('base64url') }),
    rebuild({ p256dh: 'A'.repeat(500) }),
    rebuild({ auth: '' }), rebuild({ auth: crypto.randomBytes(15).toString('base64url') }), rebuild({ auth: crypto.randomBytes(17).toString('base64url') }),
    rebuild({ auth: 12345 }), rebuild({ p256dh: { toString: () => good.keys.p256dh } }),
  ]) assert.throws(() => validateSubscription(bad), /không hợp lệ|Thiếu|không được hỗ trợ/, JSON.stringify(bad)?.slice(0, 80));
});

// ---------- Quy tắc "cần bạn" khớp giao diện ----------

test('quy tắc "việc cần bạn" của máy chủ khớp đúng với giao diện (status.ts) trên mọi tổ hợp', () => {
  const statuses = ['planning', 'awaiting_plan', 'executing', 'awaiting_result', 'attention', 'done', 'failed', 'stopped', 'queued', 'running', 'review', 'paused_quota', 'weird'];
  const epics = statuses.map((status, i) => ({ id: i + 1, title: `E${i}`, status, director: 'Giám đốc' }));
  const jobs = [];
  statuses.forEach((status, i) => {
    jobs.push({ id: i + 1, title: `J${i}`, status, lead: 'Lead', epic_id: null });
    jobs.push({ id: 100 + i, title: `K${i}`, status, lead: 'Lead', epic_id: 1 });
  });
  assert.deepEqual(ownerRequestsJs(epics, jobs), ownerRequestsTs(epics, jobs));
  assert.equal(ownerRequestsJs(epics, jobs).length, 4); // 3 yêu cầu + 1 việc lẻ đang attention
});

// ---------- Khi nào gửi, gửi gì ----------

test('chỉ gửi khi CHUYỂN vào trạng thái cần bạn; đổi trường khác hay lặp sự kiện thì không gửi lại', async () => {
  const env = svcEnv();
  try {
    env.subscribe(1);
    env.runner.emit('epic', epicRow({ status: 'planning' }));
    env.runner.emit('epic', epicRow({ status: 'awaiting_plan' }));
    env.runner.emit('epic', epicRow({ status: 'awaiting_plan', title: 'Đổi tên rồi' }));
    env.runner.emit('epic', epicRow({ status: 'awaiting_plan' }));
    await env.settle();
    assert.equal(env.calls.length, 1);
    assert.equal(env.calls[0].payload.title, 'Cần bạn duyệt kế hoạch');
    assert.equal(env.calls[0].payload.body, 'Làm trang chủ');
    assert.equal(env.calls[0].payload.tag, 'epic:1:awaiting_plan');

    // Bị trả kế hoạch → lập lại → lại chờ duyệt: là một lần chờ MỚI nên phải báo lại.
    env.runner.emit('epic', epicRow({ status: 'planning' }));
    env.runner.emit('epic', epicRow({ status: 'awaiting_plan' }));
    // Rồi sang giai đoạn chờ duyệt kết quả, và một yêu cầu cần xem.
    env.runner.emit('epic', epicRow({ status: 'executing' }));
    env.runner.emit('epic', epicRow({ status: 'awaiting_result' }));
    env.runner.emit('epic', epicRow({ id: 2, status: 'attention', title: 'Xung đột' }));
    await env.settle();
    assert.deepEqual(env.calls.map((c) => c.payload.title), ['Cần bạn duyệt kế hoạch', 'Cần bạn duyệt kế hoạch', 'Cần bạn duyệt kết quả', 'Cần bạn xem']);

    // Hoàn thành / dừng / lỗi không phải chờ bạn.
    for (const status of ['done', 'stopped', 'failed', 'executing', 'planning']) env.runner.emit('epic', epicRow({ id: 3, status }));
    await env.settle();
    assert.equal(env.calls.length, 4);
  } finally {
    await env.cleanup();
  }
});

test('việc lớn: chỉ việc lẻ (không thuộc yêu cầu nào) cần xem mới báo; việc thuộc yêu cầu thì bỏ qua', async () => {
  const env = svcEnv();
  try {
    env.subscribe(1);
    env.runner.emit('job', jobRow({ id: 1, epic_id: 7, status: 'attention' }));
    env.runner.emit('job', jobRow({ id: 2, status: 'working' }));
    env.runner.emit('job', jobRow({ id: 2, status: 'done' }));
    await env.settle();
    assert.equal(env.calls.length, 0);
    env.runner.emit('job', jobRow({ id: 3, status: 'attention', title: 'Vượt giới hạn' }));
    env.runner.emit('job', jobRow({ id: 3, status: 'attention' }));
    await env.settle();
    assert.equal(env.calls.length, 1);
    assert.equal(env.calls[0].payload.tag, 'job:3:attention');
  } finally {
    await env.cleanup();
  }
});

test('khởi động lại: yêu cầu đang chờ từ trước không bị báo lại, nhưng chuyển trạng thái sau đó vẫn báo', async () => {
  const root = tmpDir('company-push-restart-');
  const store = openDb(path.join(root, 'company.db'));
  try {
    const epic = store.createEpic({ title: 'Cũ', prompt: 'p', director: 'Giám đốc' });
    store.updateEpic(epic.id, { status: 'awaiting_plan' });
    const runner = new EventEmitter();
    const calls = [];
    const svc = new PushService({ store, runner, dataDir: root, subject: 'https://x.example', auth: { validateHash: () => ({}) }, send: async (_s, p) => { calls.push(JSON.parse(p)); }, log: () => {} });
    svc.start();
    svc.subscribe(makeDevice('r').subscription);
    runner.emit('epic', { ...store.getEpic(epic.id) }); // sự kiện lặp trạng thái cũ
    runner.emit('epic', store.updateEpic(epic.id, { status: 'awaiting_result' }));
    await svc.stop();
    assert.deepEqual(calls.map((c) => c.title), ['Cần bạn duyệt kết quả']);
  } finally {
    store.close();
    removeDir(root);
  }
});

test('nội dung thông báo: che bí mật, gọn một dòng, ngắn, không lộ thông tin nội bộ', async () => {
  const env = svcEnv();
  try {
    env.subscribe(1);
    const secret = 'sk-ant-api03-ABCDEFGHIJKLMNOP';
    const title = `Sửa lỗi đăng nhập\n\nAPI_KEY=hunter2hunter2 và ${secret}\t${'dài '.repeat(200)}`;
    env.runner.emit('epic', epicRow({ title }));
    await env.settle();
    const { payload, raw } = env.calls[0];
    assert.ok(!raw.includes('hunter2'), raw);
    assert.ok(!raw.includes(secret), raw);
    assert.ok(!/[\n\t]/.test(payload.body), 'một dòng');
    assert.ok(payload.body.length <= 120);
    assert.ok(Buffer.byteLength(raw) < 1000, 'nhỏ hơn nhiều so với giới hạn 4096 byte của dịch vụ đẩy');
    assert.deepEqual(Object.keys(payload).sort(), ['body', 'tag', 'title']);
  } finally {
    await env.cleanup();
  }
});

test('hạn mức: báo đúng một lần khi hồi; bắt đầu tạm dừng, tạm dừng tay hay trạng thái lặp thì không báo', async () => {
  const env = svcEnv();
  try {
    env.subscribe(1);
    const idle = { pausedUntil: 0, pauseReason: null, manualPause: false };
    env.runner.emit('state', idle);
    env.runner.emit('state', { ...idle, manualPause: true });
    env.runner.emit('state', { pausedUntil: Date.now() + 60_000, pauseReason: 'quota', manualPause: false });
    env.runner.emit('state', { pausedUntil: Date.now() + 59_000, pauseReason: 'quota', manualPause: false });
    await env.settle();
    assert.equal(env.calls.length, 0, 'chưa hồi thì chưa báo');
    env.runner.emit('state', idle);
    env.runner.emit('state', idle);
    env.runner.emit('state', { ...idle, queued: 3 });
    await env.settle();
    assert.equal(env.calls.length, 1);
    assert.equal(env.calls[0].payload.title, 'Hạn mức đã hồi');
    // Hồi nhưng bạn đang tạm dừng tay thì công ty chưa làm tiếp: không báo "đang làm việc tiếp".
    env.runner.emit('state', { pausedUntil: Date.now() + 60_000, pauseReason: 'quota', manualPause: true });
    env.runner.emit('state', { ...idle, manualPause: true });
    await env.settle();
    assert.equal(env.calls.length, 1);
  } finally {
    await env.cleanup();
  }
});

// ---------- Xử lý lỗi khi gửi ----------

test('thiết bị đã gỡ (404/410) bị xóa ngay; thiết bị khác vẫn nhận; lỗi tạm thời không xóa vội', async () => {
  const env = svcEnv();
  try {
    const dead = makeDevice('dead').subscription;
    const gone = makeDevice('gone').subscription;
    const flaky = makeDevice('flaky').subscription;
    const live = makeDevice('live').subscription;
    for (const s of [dead, gone, flaky, live]) env.svc.subscribe(s);
    env.behaviour.set(dead.endpoint, () => { throw Object.assign(new Error('Gone'), { statusCode: 410 }); });
    env.behaviour.set(gone.endpoint, () => { throw Object.assign(new Error('NF'), { statusCode: 404 }); });
    env.behaviour.set(flaky.endpoint, () => { throw Object.assign(new Error('boom'), { statusCode: 503 }); });
    const result = await env.svc.notify({ tag: 't1', title: 'T', body: 'B' });
    assert.deepEqual({ sent: result.sent, removed: result.removed, failed: result.failed }, { sent: 1, removed: 2, failed: 1 });
    const left = env.store.listPushSubscriptions().map((s) => s.endpoint).sort();
    assert.deepEqual(left, [flaky.endpoint, live.endpoint].sort());
    assert.equal(env.store.getPushSubscription(flaky.endpoint).fail_count, 1);

    // Lỗi mạng (không có mã) cũng chỉ tính là lỗi tạm; thành công lần sau xóa bộ đếm.
    env.behaviour.set(flaky.endpoint, () => { throw Object.assign(new Error('reset'), { code: 'ECONNRESET' }); });
    await env.svc.notify({ tag: 't2', title: 'T', body: 'B' });
    assert.equal(env.store.getPushSubscription(flaky.endpoint).fail_count, 2);
    env.behaviour.delete(flaky.endpoint);
    await env.svc.notify({ tag: 't3', title: 'T', body: 'B' });
    assert.equal(env.store.getPushSubscription(flaky.endpoint).fail_count, 0);
  } finally {
    await env.cleanup();
  }
});

test('lỗi kéo dài 10 lần liên tiếp thì thôi gửi cho thiết bị đó; lỗi gửi không làm sập sự kiện của công ty', async () => {
  const env = svcEnv({ send: async () => { throw Object.assign(new Error('x'), { statusCode: 500 }); } });
  try {
    env.svc.subscribe(makeDevice('bad').subscription);
    for (let i = 0; i < 9; i += 1) {
      env.clock.now += 11 * 60_000; // tránh trần tốc độ
      await env.svc.notify({ tag: `n${i}`, title: 'T', body: 'B' });
    }
    assert.equal(env.store.countPushSubscriptions(), 1);
    env.clock.now += 11 * 60_000;
    const last = await env.svc.notify({ tag: 'n9', title: 'T', body: 'B' });
    assert.equal(last.removed, 1);
    assert.equal(env.store.countPushSubscriptions(), 0);
    // Sự kiện của công ty vẫn trôi qua dù việc gửi lỗi (không có thiết bị nào nữa, không ném).
    assert.doesNotThrow(() => env.runner.emit('epic', epicRow()));
    await env.settle();
  } finally {
    await env.cleanup();
  }
});

test('trần tốc độ: tối đa 20 thông báo mỗi 10 phút để lỗi lặp không dội điện thoại; nút "Gửi thử" có nhịp riêng', async () => {
  const env = svcEnv();
  try {
    env.subscribe(1);
    for (let i = 1; i <= 30; i += 1) env.runner.emit('epic', epicRow({ id: i }));
    await env.settle();
    assert.equal(env.calls.length, 20);
    assert.ok(env.logs.some((l) => /Quá nhiều thông báo/.test(l)));
    env.clock.now += 10 * 60_000 + 1;
    env.runner.emit('epic', epicRow({ id: 99 }));
    await env.settle();
    assert.equal(env.calls.length, 21, 'hết cửa sổ thì gửi lại được');

    // Gửi thử: không bị trần 20, nhưng cách nhau tối thiểu 5 giây.
    const first = await env.svc.sendTest();
    assert.equal(first.sent, 1);
    await assert.rejects(() => env.svc.sendTest(), /Vừa gửi thử/);
    env.clock.now += 5_001;
    assert.equal((await env.svc.sendTest()).sent, 1);
  } finally {
    await env.cleanup();
  }
});

// ---------- Đăng ký ----------

test('đăng ký: gộp theo địa chỉ, giới hạn số thiết bị, gỡ đăng ký, không nhận địa chỉ lạ', async () => {
  const env = svcEnv();
  try {
    const dev = makeDevice('same').subscription;
    env.svc.subscribe(dev, { sessionHash: 'a'.repeat(64) });
    env.svc.subscribe(dev, { sessionHash: 'b'.repeat(64) });
    assert.equal(env.store.countPushSubscriptions(), 1);
    assert.equal(env.store.getPushSubscription(dev.endpoint).session_hash, 'b'.repeat(64), 'đăng ký lại gắn sang phiên mới');

    for (let i = 0; i < MAX_SUBSCRIPTIONS - 1; i += 1) env.subscribe(i);
    assert.equal(env.store.countPushSubscriptions(), MAX_SUBSCRIPTIONS);
    assert.throws(() => env.subscribe('vuot'), /tối đa|đủ 20/i);
    assert.doesNotThrow(() => env.svc.subscribe(dev), 'thiết bị đã có thì đăng ký lại được dù đã đầy');
    assert.equal(env.store.countPushSubscriptions(), MAX_SUBSCRIPTIONS);

    assert.equal(env.svc.unsubscribe(dev.endpoint), true);
    assert.equal(env.svc.unsubscribe(dev.endpoint), false);
    assert.equal(env.svc.unsubscribe({ toString: () => dev.endpoint }), false);
    assert.equal(env.svc.unsubscribe('x'.repeat(5000)), false);
    assert.equal(env.store.countPushSubscriptions(), MAX_SUBSCRIPTIONS - 1);

    // Địa chỉ lạ không vào được cơ sở dữ liệu.
    const evil = makeDevice('e', 'localhost').subscription;
    assert.throws(() => env.svc.subscribe(evil), /không được hỗ trợ/);
    assert.equal(env.store.getPushSubscription(evil.endpoint), null);
  } finally {
    await env.cleanup();
  }
});

test('thiết bị gắn với phiên từ xa: hết hiệu lực thì bị gỡ chứ không được gửi; thiết bị trên cổng chính không phụ thuộc phiên', async () => {
  const valid = new Set(['s1']);
  const env = svcEnv({ auth: { validateHash: (hash) => (valid.has(hash) ? { hash } : null) } });
  try {
    env.svc.subscribe(makeDevice('local').subscription); // không phiên
    env.svc.subscribe(makeDevice('s1').subscription, { sessionHash: 's1' });
    env.svc.subscribe(makeDevice('s2').subscription, { sessionHash: 's2' }); // phiên đã chết từ trước
    const r1 = await env.svc.notify({ tag: 'a', title: 'T', body: 'B' });
    assert.deepEqual({ sent: r1.sent, removed: r1.removed }, { sent: 2, removed: 1 });
    valid.clear(); // phiên s1 bị đăng xuất / PIN đổi
    const r2 = await env.svc.notify({ tag: 'b', title: 'T', body: 'B' });
    assert.deepEqual({ sent: r2.sent, removed: r2.removed }, { sent: 1, removed: 1 });
    assert.equal(env.store.countPushSubscriptions(), 1);
    assert.ok(env.calls.every((c) => !c.endpoint.endsWith('/s2')), 'không bao giờ gửi cho phiên đã chết');
    assert.equal(env.calls.filter((c) => c.endpoint.endsWith('/s1')).length, 1);
  } finally {
    await env.cleanup();
  }
});

test('dòng đăng ký bị sửa tay trỏ tới địa chỉ lạ: bị xóa, không bao giờ gọi tới', async () => {
  const env = svcEnv();
  try {
    env.store.savePushSubscription({ endpoint: 'http://127.0.0.1:4310/api/stop-all', p256dh: 'x', auth: 'y', now: 1 });
    env.store.savePushSubscription({ endpoint: 'https://169.254.169.254/latest', p256dh: 'x', auth: 'y', now: 1 });
    const result = await env.svc.notify({ tag: 'a', title: 'T', body: 'B' });
    assert.equal(result.removed, 2);
    assert.equal(env.calls.length, 0);
    assert.equal(env.store.countPushSubscriptions(), 0);
  } finally {
    await env.cleanup();
  }
});

// ---------- Khóa VAPID ----------

test('khóa VAPID: tạo một lần, giữ qua các lần khởi động; tệp hỏng thì tạo lại và xóa đăng ký cũ (khóa cũ không dùng được nữa)', async () => {
  const root = tmpDir('company-vapid-');
  const store = openDb(path.join(root, 'company.db'));
  try {
    const first = loadVapidKeys(root);
    assert.equal(first.created, true);
    assert.equal(Buffer.from(first.publicKey, 'base64url').length, 65);
    const second = loadVapidKeys(root);
    assert.equal(second.created, false);
    assert.equal(second.publicKey, first.publicKey);
    assert.equal(second.privateKey, first.privateKey);

    const make = () => new PushService({ store, runner: new EventEmitter(), dataDir: root, subject: 'https://x.example', auth: { validateHash: () => ({}) }, send: async () => {}, log: () => {} });
    const svc = make();
    svc.subscribe(makeDevice('v').subscription);
    assert.equal(make().publicKey, first.publicKey);
    assert.equal(store.countPushSubscriptions(), 1, 'cùng khóa thì giữ đăng ký');

    for (const junk of ['', '{', '{"publicKey":"a","privateKey":"b"}', '[]', 'null', JSON.stringify({ publicKey: first.publicKey, privateKey: 'AAAA' })]) {
      fs.writeFileSync(path.join(root, 'vapid.json'), junk);
      store.savePushSubscription({ ...makeDevice('k').subscription, endpoint: 'https://fcm.googleapis.com/fcm/send/k', p256dh: 'x', auth: 'y', now: 1 });
      const regenerated = make();
      assert.notEqual(regenerated.publicKey, first.publicKey, `tệp hỏng: ${junk}`);
      assert.equal(store.countPushSubscriptions(), 0);
    }
    if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(root, 'vapid.json')).mode & 0o077, 0, 'chỉ chủ sở hữu đọc được');
  } finally {
    store.close();
    removeDir(root);
  }
});

// ---------- Mã hóa thật, đầu-cuối ----------

test('gửi thật qua web-push tới dịch vụ đẩy giả: bản tin giải mã được, chữ ký VAPID đúng, tiêu đề đúng chuẩn', async () => {
  const fake = await fakePushService();
  const device = makeDevice('e2e', 'localhost');
  const env = svcEnv({ send: undefined, extraHosts: ['localhost'], requestOptions: { agent: fake.agent }, subject: 'https://box.tail1234.ts.net' });
  // svcEnv dùng hàm gửi giả theo mặc định: dựng lại dịch vụ với hàm gửi thật (mặc định của PushService).
  const real = new PushService({
    store: env.store, runner: env.runner, dataDir: env.root, subject: 'https://box.tail1234.ts.net', extraHosts: ['localhost'],
    requestOptions: { agent: fake.agent }, auth: { validateHash: () => ({}) }, log: () => {},
  });
  try {
    const endpoint = `https://localhost:${fake.port}/push/${'a'.repeat(30)}`;
    real.subscribe({ endpoint, keys: device.subscription.keys });
    const result = await real.notify({ tag: 'epic:5:awaiting_plan', title: 'Cần bạn duyệt kế hoạch', body: 'Làm trang chủ' });
    assert.equal(result.sent, 1);
    assert.equal(fake.requests.length, 1);
    const [req] = fake.requests;
    assert.equal(req.url, `/push/${'a'.repeat(30)}`);
    assert.equal(req.headers['content-encoding'], 'aes128gcm');
    assert.equal(req.headers.urgency, 'high');
    assert.equal(req.headers.ttl, String(6 * 3600));
    assert.match(req.headers.topic, /^[A-Za-z0-9_-]{1,32}$/);
    verifyVapid(req.headers.authorization, { publicKey: real.publicKey, audience: `https://localhost:${fake.port}`, subject: 'https://box.tail1234.ts.net' });
    const plain = decryptPush(req.body, device);
    assert.deepEqual(JSON.parse(plain), { title: 'Cần bạn duyệt kế hoạch', body: 'Làm trang chủ', tag: 'epic:5:awaiting_plan' });
    assert.ok(!req.body.toString('utf8').includes('trang chủ'), 'nội dung không nằm ở dạng chữ rõ trên đường truyền');

    // Thiết bị khác không giải mã được bản tin này.
    assert.throws(() => decryptPush(req.body, makeDevice('other')));

    // Dịch vụ đẩy báo thiết bị đã hủy (410): đăng ký bị xóa.
    fake.state.status = 410;
    const gone = await real.notify({ tag: 'x', title: 'T', body: 'B' });
    assert.equal(gone.removed, 1);
    assert.equal(env.store.countPushSubscriptions(), 0);
  } finally {
    await env.cleanup();
    await fake.close();
  }
});

// ---------- Máy chủ đầy đủ: đường dẫn, xác thực, phiên ----------

async function request(port, { method = 'GET', path: p = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers, agent: false }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch { /* không phải JSON */ }
        resolve({ status: res.statusCode, json: parsed, text: data, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function boot({ pushSend } = {}) {
  const root = tmpDir('company-pushsrv-');
  const { project, local } = makeProject(root);
  const sends = [];
  const send = pushSend ?? (async (sub, payload) => { sends.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) }); });
  const cfg = testConfig(root, project, local, { publicHost: HOST, remotePort: 0, sseBeatMs: 40, pushSend: send });
  setPin(cfg.dataDir, PIN);
  const app = await startServer({ cfg, withUi: false, uiHandler: (_q, res) => { res.writeHead(200); res.end('UI'); }, log: () => {} });
  const origin = `https://${HOST}`;
  const remote = (opts = {}) => request(app.remotePort, { ...opts, headers: { host: HOST, ...(opts.headers ?? {}) } });
  const local_ = (opts = {}) => request(app.port, { ...opts, headers: { host: `localhost:${app.port}`, ...(opts.headers ?? {}) } });
  const login = async () => {
    const res = await remote({ method: 'POST', path: '/api/login', body: JSON.stringify({ pin: PIN }), headers: { ...json, origin } });
    return String(res.headers['set-cookie'] ?? '').split(';')[0];
  };
  const post = (cookie, p, body) => remote({ method: 'POST', path: p, body: JSON.stringify(body), headers: { ...json, origin, cookie } });
  return { root, app, cfg, sends, remote, local: local_, origin, login, post, cleanup: async () => { await app.close(); removeDir(root); } };
}

test('máy chủ: cổng từ xa không đăng nhập thì không đụng được tới đăng ký thông báo; sai Origin / sai kiểu nội dung bị chặn', async () => {
  const env = await boot();
  try {
    const dev = makeDevice('srv').subscription;
    for (const [method, p] of [['GET', '/api/push/key'], ['POST', '/api/push/subscribe'], ['POST', '/api/push/unsubscribe'], ['POST', '/api/push/test']]) {
      const res = await env.remote({ method, path: p, body: method === 'POST' ? JSON.stringify({ subscription: dev }) : undefined, headers: { ...json, origin: env.origin } });
      assert.equal(res.status, 401, `${method} ${p}`);
      assert.equal(res.json.login, true);
    }
    assert.equal(env.app.store.countPushSubscriptions(), 0);

    const cookie = await env.login();
    const evilOrigin = await env.remote({ method: 'POST', path: '/api/push/subscribe', body: JSON.stringify({ subscription: dev }), headers: { ...json, origin: 'https://evil.example', cookie } });
    assert.equal(evilOrigin.status, 403);
    const noOrigin = await env.remote({ method: 'POST', path: '/api/push/subscribe', body: JSON.stringify({ subscription: dev }), headers: { ...json, cookie } });
    assert.equal(noOrigin.status, 403);
    const form = await env.remote({ method: 'POST', path: '/api/push/subscribe', body: 'x=1', headers: { 'content-type': 'text/plain', origin: env.origin, cookie } });
    assert.equal(form.status, 415);
    const crossSite = await env.remote({ method: 'POST', path: '/api/push/test', body: '{}', headers: { ...json, origin: env.origin, cookie, 'sec-fetch-site': 'cross-site' } });
    assert.equal(crossSite.status, 403);
    assert.equal(env.app.store.countPushSubscriptions(), 0);
    assert.equal(env.sends.length, 0);
  } finally {
    await env.cleanup();
  }
});

test('máy chủ: đăng ký / gửi thử / gỡ qua cổng từ xa; địa chỉ độc và rác bị từ chối và không lưu', async () => {
  const env = await boot();
  try {
    const cookie = await env.login();
    const key = await env.remote({ path: '/api/push/key', headers: { cookie } });
    assert.equal(key.status, 200);
    assert.equal(key.json.publicKey, env.app.pushService.publicKey);
    assert.equal(key.json.count, 0);
    assert.ok(!JSON.stringify(key.json).includes(JSON.parse(fs.readFileSync(path.join(env.cfg.dataDir, 'vapid.json'), 'utf8')).privateKey), 'không bao giờ lộ khóa riêng');

    for (const bad of [
      {}, { subscription: null }, { subscription: 'x' }, { subscription: { endpoint: 'http://127.0.0.1:4310/api/stop-all', keys: makeDevice('b').subscription.keys } },
      { subscription: { endpoint: 'https://169.254.169.254/x', keys: makeDevice('b').subscription.keys } },
      { subscription: { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'a', auth: 'b' } } },
    ]) {
      const res = await env.post(cookie, '/api/push/subscribe', bad);
      assert.equal(res.status, 400, JSON.stringify(bad).slice(0, 80));
    }
    const notJson = await env.remote({ method: 'POST', path: '/api/push/subscribe', body: '{không phải json', headers: { ...json, origin: env.origin, cookie } });
    assert.equal(notJson.status, 400);
    const big = await env.remote({ method: 'POST', path: '/api/push/subscribe', body: JSON.stringify({ subscription: { endpoint: `https://fcm.googleapis.com/${'a'.repeat(200_000)}` } }), headers: { ...json, origin: env.origin, cookie } }).catch(() => ({ status: 0 }));
    assert.ok([0, 400].includes(big.status));
    assert.equal(env.app.store.countPushSubscriptions(), 0);

    const dev = makeDevice('good').subscription;
    const ok = await env.post(cookie, '/api/push/subscribe', { subscription: dev });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.count, 1);
    assert.ok(env.app.store.getPushSubscription(dev.endpoint).session_hash, 'gắn với phiên đăng nhập');

    const test1 = await env.post(cookie, '/api/push/test', {});
    assert.equal(test1.status, 200);
    assert.equal(test1.json.sent, 1);
    assert.equal(env.sends.length, 1);
    assert.equal(env.sends[0].payload.title, 'Thông báo thử');
    const test2 = await env.post(cookie, '/api/push/test', {});
    assert.equal(test2.status, 400, 'gửi thử dồn dập bị chặn');
    assert.equal(env.sends.length, 1);

    const off = await env.post(cookie, '/api/push/unsubscribe', { endpoint: dev.endpoint });
    assert.deepEqual(off.json, { ok: true, removed: true });
    assert.equal(env.app.store.countPushSubscriptions(), 0);
  } finally {
    await env.cleanup();
  }
});

test('máy chủ: đăng xuất / đổi PIN / xóa PIN → thiết bị của phiên đó thôi nhận thông báo; thiết bị trên máy chính không bị ảnh hưởng', async () => {
  const env = await boot();
  try {
    const { epics } = env.app.runner;
    const startEpic = (n) => { const e = env.app.store.createEpic({ title: `Việc ${n}`, prompt: 'p', director: 'Giám đốc' }); return e.id; };

    const cookieA = await env.login();
    const cookieB = await env.login();
    const devA = makeDevice('A').subscription;
    const devB = makeDevice('B').subscription;
    const devLocal = makeDevice('L').subscription;
    assert.equal((await env.post(cookieA, '/api/push/subscribe', { subscription: devA })).status, 200);
    assert.equal((await env.post(cookieB, '/api/push/subscribe', { subscription: devB })).status, 200);
    const localRes = await env.local({ method: 'POST', path: '/api/push/subscribe', body: JSON.stringify({ subscription: devLocal }), headers: json });
    assert.equal(localRes.status, 200);
    assert.equal(env.app.store.getPushSubscription(devLocal.endpoint).session_hash, null);

    const e1 = startEpic(1);
    epics.update(e1, { status: 'awaiting_plan' });
    await Promise.allSettled([...env.app.pushService.pending]);
    assert.deepEqual(env.sends.map((s) => s.endpoint).sort(), [devA.endpoint, devB.endpoint, devLocal.endpoint].sort());
    env.sends.length = 0;

    // A đăng xuất → chỉ máy A thôi nhận (cookie A giờ vô hiệu).
    assert.equal((await env.post(cookieA, '/api/logout', {})).status, 200);
    assert.equal(env.app.store.getPushSubscription(devA.endpoint), null);
    const e2 = startEpic(2);
    epics.update(e2, { status: 'awaiting_result' });
    await Promise.allSettled([...env.app.pushService.pending]);
    assert.deepEqual(env.sends.map((s) => s.endpoint).sort(), [devB.endpoint, devLocal.endpoint].sort());
    env.sends.length = 0;

    // Đổi PIN: mọi phiên chết; máy B thôi nhận ngay (kể cả khi chưa ai gọi logout), máy chính vẫn nhận.
    setPin(env.cfg.dataDir, 'mot-pin-moi-9753');
    const e3 = startEpic(3);
    epics.update(e3, { status: 'attention' });
    await Promise.allSettled([...env.app.pushService.pending]);
    assert.deepEqual(env.sends.map((s) => s.endpoint), [devLocal.endpoint]);
    assert.equal(env.app.store.getPushSubscription(devB.endpoint), null);
    assert.equal((await env.remote({ path: '/api/push/key', headers: { cookie: cookieB } })).status, 401);
  } finally {
    await env.cleanup();
  }
});

test('máy chủ: sự kiện thật của công ty (yêu cầu chờ duyệt, hạn mức hồi) đi đúng đường tới thiết bị', async () => {
  const env = await boot();
  try {
    const cookie = await env.login();
    await env.post(cookie, '/api/push/subscribe', { subscription: makeDevice('real').subscription });
    const epic = env.app.store.createEpic({ title: 'Thêm trang liên hệ', prompt: 'p', director: 'Giám đốc' });
    env.app.runner.epics.update(epic.id, { status: 'awaiting_plan' });
    env.app.runner.epics.update(epic.id, { plan_summary: 'Kế hoạch đã cập nhật' });
    await Promise.allSettled([...env.app.pushService.pending]);
    assert.equal(env.sends.length, 1);
    assert.deepEqual(env.sends[0].payload, { title: 'Cần bạn duyệt kế hoạch', body: 'Thêm trang liên hệ', tag: `epic:${epic.id}:awaiting_plan` });

    env.sends.length = 0;
    const { runner } = env.app;
    runner.pauseCompany({ until: Date.now() + 60_000, reason: 'quota' });
    await Promise.allSettled([...env.app.pushService.pending]);
    assert.equal(env.sends.length, 0, 'mới bị chặn hạn mức thì không báo');
    runner.pausedUntil = Date.now() - 1;
    runner.schedule();
    await Promise.allSettled([...env.app.pushService.pending]);
    assert.deepEqual(env.sends.map((s) => s.payload.title), ['Hạn mức đã hồi']);
  } finally {
    await env.cleanup();
  }
});

test('máy chủ: tắt máy chủ chờ các lượt gửi dở xong, không để lỗi ghi vào cơ sở dữ liệu đã đóng', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const env = await boot({ pushSend: async () => { await gate; } });
  try {
    const cookie = await env.login();
    await env.post(cookie, '/api/push/subscribe', { subscription: makeDevice('slow').subscription });
    const epic = env.app.store.createEpic({ title: 'Chậm', prompt: 'p', director: 'Giám đốc' });
    env.app.runner.epics.update(epic.id, { status: 'awaiting_plan' });
    let closed = false;
    const closing = env.app.close().then(() => { closed = true; });
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(closed, false, 'còn lượt gửi chưa xong thì chưa đóng');
    release();
    await closing;
    assert.equal(closed, true);
  } finally {
    release();
    removeDir(env.root);
  }
});

// ---------- Phía trình duyệt: chữ thông báo và service worker ----------

test('chữ thông báo cục bộ (giao diện) khớp với thông báo đẩy của máy chủ', async () => {
  const { notifyMessage } = await import('../src/lib/notify.ts');
  const env = svcEnv();
  try {
    env.subscribe(1);
    const rows = [
      ['epic', { id: 1, title: 'Làm trang chủ', status: 'awaiting_plan', director: 'GĐ' }],
      ['epic', { id: 2, title: 'Trang   liên\nhệ', status: 'awaiting_result', director: 'GĐ' }],
      ['epic', { id: 3, title: 'x'.repeat(300), status: 'attention', director: 'GĐ' }],
      ['job', { id: 4, title: 'Sửa lỗi', status: 'attention', lead: 'L', epic_id: null }],
    ];
    for (const [kind, row] of rows) env.runner.emit(kind, row);
    await env.settle();
    const expected = rows.map(([kind, row]) => notifyMessage({ kind, id: row.id, title: row.title, status: row.status }));
    assert.deepEqual(env.calls.map((c) => c.payload), expected);
  } finally {
    await env.cleanup();
  }
});

async function loadServiceWorker({ clients = [] } = {}) {
  const vm = await import('node:vm');
  const handlers = {};
  const shown = [];
  const opened = [];
  const focused = [];
  const closed = [];
  const self = {
    location: { origin: 'https://box.tail1234.ts.net' },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => {},
    clients: {
      claim: () => Promise.resolve(),
      matchAll: async () => clients.map((url) => ({ url, focus: async () => { focused.push(url); return url; } })),
      openWindow: async (url) => { opened.push(url); },
    },
    registration: { showNotification: async (title, options) => { shown.push(JSON.parse(JSON.stringify({ title, options }))); } },
  };
  vm.runInNewContext(fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), { self, URL, Response, fetch: () => {}, setTimeout });
  const waits = [];
  const fire = (type, event) => { handlers[type]({ waitUntil: (p) => waits.push(p), ...event }); return Promise.allSettled(waits.splice(0)); };
  return { fire, shown, opened, focused, closed };
}

test('service worker: luôn hiện thông báo dù nội dung hỏng / độc; cắt ngắn; không tin kiểu dữ liệu', async () => {
  const sw = await loadServiceWorker();
  const push = (data) => sw.fire('push', { data: data === undefined ? null : { json: () => (typeof data === 'function' ? data() : data) } });

  await push({ title: 'Cần bạn duyệt kế hoạch', body: 'Trang chủ', tag: 'epic:1:awaiting_plan' });
  assert.deepEqual(sw.shown[0], { title: 'Cần bạn duyệt kế hoạch', options: { body: 'Trang chủ', icon: '/icons/icon-192.png', tag: 'epic:1:awaiting_plan' } });

  // Không có dữ liệu, JSON hỏng, sai kiểu: vẫn phải hiện một thông báo (Safari thu hồi đăng ký nếu bỏ qua).
  await push(undefined);
  await push(() => { throw new SyntaxError('hỏng'); });
  await push({ title: { a: 1 }, body: 12345, tag: ['x'] });
  await push(null);
  await push('chuỗi trần');
  assert.equal(sw.shown.length, 6);
  for (const item of sw.shown.slice(1)) {
    assert.equal(item.title, 'My Company');
    assert.equal(item.options.body, '');
    assert.equal('tag' in item.options, false);
  }

  await push({ title: 'T'.repeat(5000), body: 'B'.repeat(5000), tag: 'g'.repeat(5000) });
  const long = sw.shown.at(-1);
  assert.equal(long.title.length, 100);
  assert.equal(long.options.body.length, 200);
  assert.equal(long.options.tag.length, 64);
  // HTML trong nội dung chỉ là chữ, không có đường nào biến thành mã.
  await push({ title: '<img src=x onerror=alert(1)>', body: '<script>1</script>' });
  assert.equal(sw.shown.at(-1).title, '<img src=x onerror=alert(1)>');
  assert.deepEqual(Object.keys(sw.shown.at(-1).options).sort(), ['body', 'icon']);
});

test('service worker: bấm thông báo thì mở lại cửa sổ của chính ứng dụng, không bao giờ mở địa chỉ do máy chủ gửi', async () => {
  const closedFlags = [];
  const click = (sw, extra = {}) => sw.fire('notificationclick', { notification: { close: () => closedFlags.push(1), data: { url: 'https://evil.example/' }, ...extra } });

  const withWindow = await loadServiceWorker({ clients: ['https://other.example/', 'https://box.tail1234.ts.net/?tab=work'] });
  await click(withWindow);
  assert.deepEqual(withWindow.focused, ['https://box.tail1234.ts.net/?tab=work']);
  assert.deepEqual(withWindow.opened, []);

  const noWindow = await loadServiceWorker({ clients: [] });
  await click(noWindow);
  assert.deepEqual(noWindow.opened, ['/']);

  const onlyForeign = await loadServiceWorker({ clients: ['https://other.example/'] });
  await click(onlyForeign);
  assert.deepEqual(onlyForeign.opened, ['/']);
  assert.deepEqual(onlyForeign.focused, []);
  assert.equal(closedFlags.length, 3, 'luôn đóng thông báo sau khi bấm');
});
