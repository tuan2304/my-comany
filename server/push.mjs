import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import { UserError } from './errors.mjs';
import { maskSecrets, shorten } from './guard.mjs';
import { ownerRequests } from './owner-requests.mjs';

/**
 * Thông báo đẩy (Web Push): khi có việc chờ chính bạn (duyệt kế hoạch, duyệt kết quả, cần xem) hoặc hạn mức đã hồi,
 * máy chủ gửi một thông báo tới các thiết bị đã đăng ký, kể cả khi trang đang đóng.
 *
 * Bảo mật:
 * - Địa chỉ đăng ký (endpoint) do trình duyệt gửi lên rồi máy chủ sẽ POST tới đó, nên phải chặn SSRF: chỉ https và
 *   chỉ các dịch vụ đẩy đã biết (FCM, Mozilla, Windows, Apple), không IP, không localhost, không "user:pass@".
 * - Thiết bị đăng ký qua cổng từ xa gắn với phiên đăng nhập: đăng xuất, hết hạn hoặc đổi PIN thì thôi nhận.
 * - Nội dung chỉ gồm tiêu đề ngắn đã che bí mật, và được mã hóa đầu-cuối (RFC 8291) nên dịch vụ đẩy không đọc được.
 */

export const MAX_SUBSCRIPTIONS = 20;
export const MAX_ENDPOINT_LENGTH = 2048;
const MAX_CONSECUTIVE_FAILURES = 10;
const RATE = { windowMs: 10 * 60_000, max: 20 };
const TEST_MIN_INTERVAL_MS = 5_000;

const PUSH_HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']);
const PUSH_SUFFIXES = ['.push.services.mozilla.com', '.notify.windows.com'];

/**
 * Kiểm tra địa chỉ đăng ký. `extraHosts` (tên máy chính xác, thêm qua COMPANY_PUSH_HOSTS hoặc khi kiểm thử) được phép
 * dùng cổng bất kỳ; dịch vụ có sẵn chỉ được dùng cổng https mặc định.
 */
export function validateEndpoint(raw, extraHosts = []) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_ENDPOINT_LENGTH) throw new UserError('Địa chỉ nhận thông báo không hợp lệ.');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new UserError('Địa chỉ nhận thông báo không hợp lệ.');
  }
  const host = url.hostname.toLowerCase();
  const extra = extraHosts.includes(host);
  const known = PUSH_HOSTS.has(host) || PUSH_SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length);
  if (url.protocol !== 'https:' || url.username || url.password || !(known || extra)) {
    throw new UserError('Dịch vụ nhận thông báo này không được hỗ trợ.');
  }
  if (!extra && url.port && url.port !== '443') throw new UserError('Dịch vụ nhận thông báo này không được hỗ trợ.');
  return url.toString();
}

function decodeKey(value, bytes) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 200) return null;
  const buf = Buffer.from(value, 'base64url');
  return buf.length === bytes ? buf : null;
}

export function validateSubscription(sub, extraHosts = []) {
  if (!sub || typeof sub !== 'object') throw new UserError('Thiếu thông tin đăng ký thông báo.');
  const endpoint = validateEndpoint(sub.endpoint, extraHosts);
  const p256dh = decodeKey(sub.keys?.p256dh, 65);
  const auth = decodeKey(sub.keys?.auth, 16);
  if (!p256dh || p256dh[0] !== 4 || !auth) throw new UserError('Khóa mã hóa của thiết bị không hợp lệ.');
  return { endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth };
}

/** Khóa VAPID lưu trong thư mục dữ liệu; tệp hỏng thì tạo lại (thiết bị cũ sẽ phải đăng ký lại, nên xóa đăng ký cũ). */
export function loadVapidKeys(dataDir) {
  const file = path.join(dataDir, 'vapid.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof parsed.publicKey === 'string' && typeof parsed.privateKey === 'string' && decodeKey(parsed.publicKey, 65) && decodeKey(parsed.privateKey, 32)) {
      return { ...parsed, created: false };
    }
  } catch {
    // chưa có hoặc hỏng: tạo mới bên dưới
  }
  const keys = webpush.generateVAPIDKeys();
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(keys), { mode: 0o600 });
  fs.renameSync(tmp, file);
  return { ...keys, created: true };
}

async function defaultSend(subscription, payload, options) {
  return webpush.sendNotification(subscription, payload, options);
}

export class PushService {
  /**
   * @param {object} o
   * @param {object} o.store  cơ sở dữ liệu
   * @param {object} o.auth   để kiểm phiên của thiết bị đăng ký từ xa còn hiệu lực không
   * @param {object} o.runner nguồn sự kiện (epic, job, state)
   * @param {Function} [o.send] hàm gửi thật (thay được khi kiểm thử)
   * @param {object} [o.requestOptions] tùy chọn thêm cho web-push (agent https, timeout...)
   */
  constructor({ store, auth, runner, dataDir, subject, extraHosts = [], send = defaultSend, requestOptions = {}, clock = Date.now, log = () => {} }) {
    this.store = store;
    this.auth = auth;
    this.runner = runner;
    this.extraHosts = extraHosts.map((h) => String(h).toLowerCase());
    this.send = send;
    this.requestOptions = requestOptions;
    this.clock = clock;
    this.log = log;
    this.subject = subject;
    const keys = loadVapidKeys(dataDir);
    this.vapid = { publicKey: keys.publicKey, privateKey: keys.privateKey };
    if (keys.created) store.deleteAllPushSubscriptions();
    this.sentAt = [];
    this.lastTestAt = 0;
    this.quotaPaused = false;
    this.pending = new Set();
    // Trạng thái gần nhất của từng yêu cầu/việc: chỉ báo khi CHUYỂN vào trạng thái cần bạn, không báo lại khi chỉ đổi trường khác.
    this.last = new Map();
    for (const e of store.listEpics()) this.last.set(`epic:${e.id}`, e.status);
    for (const j of store.listJobs()) this.last.set(`job:${j.id}`, j.status);
    this.listeners = [
      ['epic', (epic) => this.#observe('epic', epic)],
      ['job', (job) => this.#observe('job', job)],
      ['state', (state) => this.#observeState(state)],
    ];
  }

  get publicKey() {
    return this.vapid.publicKey;
  }

  start() {
    for (const [name, fn] of this.listeners) this.runner.on(name, fn);
  }

  /** Gỡ bộ lắng nghe và chờ các lượt gửi đang dở xong (để đóng cơ sở dữ liệu an toàn). */
  async stop() {
    for (const [name, fn] of this.listeners) this.runner.off(name, fn);
    await Promise.allSettled([...this.pending]);
  }

  #observe(kind, row) {
    const key = `${kind}:${row.id}`;
    const before = this.last.get(key);
    this.last.set(key, row.status);
    if (before === row.status) return;
    const [request] = kind === 'epic' ? ownerRequests([row], []) : ownerRequests([], [row]);
    if (request) this.#fire(this.#messageFor(request));
  }

  #observeState(state) {
    const paused = state.pauseReason === 'quota' && state.pausedUntil > 0;
    const resumed = this.quotaPaused && !paused && !state.manualPause;
    if (paused !== this.quotaPaused) this.quotaPaused = paused;
    if (resumed) this.#fire({ tag: 'quota:resumed', title: 'Hạn mức đã hồi', body: 'Công ty đang làm việc tiếp.' });
  }

  #messageFor(request) {
    const what = { awaiting_plan: 'Cần bạn duyệt kế hoạch', awaiting_result: 'Cần bạn duyệt kết quả', attention: 'Cần bạn xem' }[request.status];
    return { tag: `${request.kind}:${request.id}:${request.status}`, title: what, body: shorten(maskSecrets(String(request.title ?? '')), 120) };
  }

  #fire(message) {
    const job = this.notify(message)
      .catch((err) => this.log(`Gửi thông báo đẩy lỗi: ${err.message}`))
      .finally(() => this.pending.delete(job));
    this.pending.add(job);
  }

  /** Đăng ký một thiết bị. `sessionHash` là phiên từ xa của thiết bị (null nếu đăng ký từ cổng chính trên chính máy này). */
  subscribe(sub, { sessionHash = null, agent = null } = {}) {
    const clean = validateSubscription(sub, this.extraHosts);
    const existing = this.store.getPushSubscription(clean.endpoint);
    if (!existing && this.store.countPushSubscriptions() >= MAX_SUBSCRIPTIONS) {
      throw new UserError(`Đã đăng ký đủ ${MAX_SUBSCRIPTIONS} thiết bị. Tắt thông báo ở một thiết bị cũ trước.`);
    }
    this.store.savePushSubscription({ ...clean, sessionHash, agent: agent ? String(agent).slice(0, 200) : null, now: this.clock() });
    return { count: this.store.countPushSubscriptions() };
  }

  unsubscribe(endpoint) {
    if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT_LENGTH) return false;
    return this.store.deletePushSubscription(endpoint);
  }

  /** Thôi nhận thông báo cho mọi thiết bị của một phiên (khi đăng xuất). */
  dropSession(sessionHash) {
    this.store.deletePushBySession(sessionHash);
  }

  /** Nút "Gửi thử": giới hạn mỗi 5 giây một lần để không bị dùng làm bom thông báo. */
  async sendTest() {
    const now = this.clock();
    if (now - this.lastTestAt < TEST_MIN_INTERVAL_MS) throw new UserError('Vừa gửi thử xong, đợi vài giây rồi thử lại.');
    this.lastTestAt = now;
    return this.notify({ tag: `test:${now}`, title: 'Thông báo thử', body: 'Nếu thấy dòng này thì thông báo đẩy đang hoạt động.' }, { skipRateLimit: true });
  }

  /** Gửi một thông báo tới mọi thiết bị còn hợp lệ. Trả về { sent, removed, failed, skipped }. */
  async notify({ tag, title, body }, { skipRateLimit = false } = {}) {
    const now = this.clock();
    if (!skipRateLimit) {
      this.sentAt = this.sentAt.filter((t) => now - t < RATE.windowMs);
      if (this.sentAt.length >= RATE.max) {
        this.log('Quá nhiều thông báo đẩy trong 10 phút, bỏ qua một thông báo.');
        return { sent: 0, removed: 0, failed: 0, skipped: true };
      }
      this.sentAt.push(now);
    }
    const payload = JSON.stringify({
      title: shorten(maskSecrets(String(title)), 80),
      body: shorten(maskSecrets(String(body ?? '')), 140),
      tag: String(tag).slice(0, 64),
    });
    // Mỗi thông báo cùng loại thay thế bản đang chờ ở dịch vụ đẩy (thiết bị tắt máy lâu không bị dội nhiều bản).
    const topic = crypto.createHash('sha256').update(String(tag)).digest('base64url').slice(0, 32);
    const options = {
      vapidDetails: { subject: this.subject, publicKey: this.vapid.publicKey, privateKey: this.vapid.privateKey },
      TTL: 6 * 3600,
      urgency: 'high',
      topic,
      timeout: 10_000,
      ...this.requestOptions,
    };
    const result = { sent: 0, removed: 0, failed: 0, skipped: false };
    const subs = this.store.listPushSubscriptions();
    await Promise.all(subs.map(async (sub) => {
      // Phiên từ xa đã đăng xuất / hết hạn / PIN đã đổi: gỡ luôn, không gửi.
      if (sub.session_hash && !this.auth.validateHash(sub.session_hash, { touch: false })) {
        this.store.deletePushSubscription(sub.endpoint);
        result.removed += 1;
        return;
      }
      // Phòng thủ nhiều lớp: dòng đăng ký bị sửa tay trong cơ sở dữ liệu cũng không khiến máy chủ gọi tới địa chỉ lạ.
      try {
        validateEndpoint(sub.endpoint, this.extraHosts);
      } catch {
        this.store.deletePushSubscription(sub.endpoint);
        result.removed += 1;
        return;
      }
      try {
        await this.send({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, options);
        this.store.markPushResult(sub.endpoint, { ok: true, now: this.clock() });
        result.sent += 1;
      } catch (err) {
        const status = Number(err?.statusCode);
        if (status === 404 || status === 410) {
          this.store.deletePushSubscription(sub.endpoint);
          result.removed += 1;
          return;
        }
        result.failed += 1;
        const fails = this.store.markPushResult(sub.endpoint, { ok: false, now: this.clock() });
        if (fails >= MAX_CONSECUTIVE_FAILURES) {
          this.store.deletePushSubscription(sub.endpoint);
          result.removed += 1;
        }
        this.log(`Gửi thông báo đẩy không được (${status || err?.code || 'lỗi'}).`);
      }
    }));
    return result;
  }
}
