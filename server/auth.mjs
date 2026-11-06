import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { UserError } from './errors.mjs';

/**
 * Xác thực cho truy cập từ xa (giai đoạn 6E). Chỉ dùng ở cổng từ xa; cổng chính (loopback) không đòi đăng nhập.
 *  - PIN lưu dạng băm scrypt + muối trong `<dataDir>/auth.json`. Đổi hoặc xóa PIN đổi `epoch`, nên mọi phiên cũ mất hiệu lực.
 *  - Phiên: mã ngẫu nhiên 256 bit trong cookie; cơ sở dữ liệu chỉ giữ băm SHA-256 của mã.
 *  - Chống đoán PIN: giới hạn theo TOÀN CỤC (qua Tailscale mọi yêu cầu đều đến từ 127.0.0.1 nên không phân biệt được
 *    người gọi), 5 lần sai trong 15 phút thì khóa, thời gian khóa gấp đôi sau mỗi lần khóa liên tiếp. Đang khóa thì
 *    PIN đúng cũng bị từ chối. Chủ máy luôn vào được bằng cổng chính.
 */

export const COOKIE_NAME = '__Host-mc_session';
export const SESSION_MS = 30 * 24 * 3600 * 1000;
export const MAX_SESSIONS = 20;
export const MIN_PIN_LENGTH = 6;
const MAX_PIN_LENGTH = 128;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
const LIMIT = { failures: 5, windowMs: 15 * 60_000, baseLockMs: 15 * 60_000, maxLockMs: 24 * 3600_000, forgetMs: 24 * 3600_000 };

const COMMON_PINS = new Set([
  '123456', '1234567', '12345678', '123456789', '654321', '000000', '111111', '121212', '123123', '112233',
  '159753', '147258', '202020', '696969', '123321', '112233', '010203', 'qwerty', 'qwerty123', 'password', 'matkhau', 'admin123',
]);

function authFile(dataDir) {
  return path.join(dataDir, 'auth.json');
}

/** Trả về thông báo lỗi nếu PIN quá yếu, còn không thì null. */
export function pinProblem(pin) {
  const value = String(pin ?? '');
  if (value.length < MIN_PIN_LENGTH) return `PIN cần ít nhất ${MIN_PIN_LENGTH} ký tự (khuyên dùng 8 chữ số trở lên).`;
  if (value.length > MAX_PIN_LENGTH) return `PIN dài tối đa ${MAX_PIN_LENGTH} ký tự.`;
  if (/[\u0000-\u001f\u007f]/.test(value)) return 'PIN không được chứa ký tự điều khiển.';
  if (new Set(value).size < 3) return 'PIN quá đơn giản (ít hơn 3 ký tự khác nhau).';
  if (COMMON_PINS.has(value.toLowerCase())) return 'PIN này nằm trong danh sách PIN phổ biến, dễ bị đoán.';
  if (/^\d+$/.test(value)) {
    const steps = [...value].slice(1).map((c, i) => Number(c) - Number(value[i]));
    if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return 'PIN là dãy số liền nhau, dễ bị đoán.';
  }
  return null;
}

function hashPin(pin, saltHex) {
  return crypto.scryptSync(String(pin).normalize('NFKC'), Buffer.from(saltHex, 'hex'), SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p,
  });
}

/** Đặt (hoặc đổi) PIN. Mọi phiên đăng nhập cũ mất hiệu lực vì `epoch` đổi. */
export function setPin(dataDir, pin) {
  const problem = pinProblem(pin);
  if (problem) throw new UserError(problem);
  const salt = crypto.randomBytes(16).toString('hex');
  const record = {
    v: 1, salt, hash: hashPin(pin, salt).toString('hex'), epoch: crypto.randomBytes(12).toString('hex'), set_at: Date.now(),
  };
  fs.mkdirSync(dataDir, { recursive: true });
  const file = authFile(dataDir);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(record), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function clearPin(dataDir) {
  fs.rmSync(authFile(dataDir), { force: true });
}

export function hasPin(dataDir) {
  return readRecord(dataDir) !== null;
}

function readRecord(dataDir) {
  try {
    const record = JSON.parse(fs.readFileSync(authFile(dataDir), 'utf8'));
    if (record?.v === 1 && typeof record.salt === 'string' && typeof record.hash === 'string' && typeof record.epoch === 'string') return record;
  } catch {
    // chưa có hoặc hỏng: coi như chưa đặt PIN (từ chối mọi yêu cầu từ xa)
  }
  return null;
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

/** Lấy mã phiên từ tiêu đề Cookie. Chỉ nhận đúng một mã hợp lệ về hình dạng. */
export function sessionTokenFrom(cookieHeader) {
  const found = [];
  for (const part of String(cookieHeader ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === COOKIE_NAME) found.push(part.slice(eq + 1).trim());
  }
  if (found.length !== 1) return null;
  return /^[A-Za-z0-9_-]{43}$/.test(found[0]) ? found[0] : null;
}

export function sessionCookie(token, { clear = false } = {}) {
  const base = `${COOKIE_NAME}=${clear ? '' : token}; Path=/; HttpOnly; Secure; SameSite=Strict`;
  return clear ? `${base}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT` : `${base}; Max-Age=${Math.floor(SESSION_MS / 1000)}`;
}

export class Auth {
  constructor({ dataDir, store, clock = Date.now }) {
    this.dataDir = dataDir;
    this.store = store;
    this.clock = clock;
    this.failures = [];
    this.lockedUntil = 0;
    this.lockLevel = 0;
    this.lastFailure = 0;
  }

  hasPin() {
    return hasPin(this.dataDir);
  }

  /** Còn bị khóa bao lâu (mili giây), 0 nếu không khóa. */
  lockRemainingMs() {
    return Math.max(0, this.lockedUntil - this.clock());
  }

  /**
   * Thử đăng nhập. Trả về { ok: true, token, expiresAt } hoặc { ok: false, reason: 'no_pin'|'locked'|'wrong', retryAfterMs?, remaining? }.
   * Luôn tính băm scrypt khi có PIN (kể cả PIN sai độ dài) để thời gian phản hồi không tiết lộ gì.
   */
  login(pin, { agent = null } = {}) {
    const now = this.clock();
    const record = readRecord(this.dataDir);
    if (!record) return { ok: false, reason: 'no_pin' };
    if (now < this.lockedUntil) return { ok: false, reason: 'locked', retryAfterMs: this.lockedUntil - now };
    if (now - this.lastFailure > LIMIT.forgetMs) this.lockLevel = 0;

    const candidate = typeof pin === 'string' ? pin.slice(0, MAX_PIN_LENGTH + 1) : '';
    const given = hashPin(candidate, record.salt);
    const good = typeof pin === 'string' && pin.length <= MAX_PIN_LENGTH && crypto.timingSafeEqual(given, Buffer.from(record.hash, 'hex'));

    if (!good) {
      this.failures = this.failures.filter((t) => now - t < LIMIT.windowMs);
      this.failures.push(now);
      this.lastFailure = now;
      if (this.failures.length >= LIMIT.failures) {
        const lockMs = Math.min(LIMIT.baseLockMs * 2 ** this.lockLevel, LIMIT.maxLockMs);
        this.lockLevel += 1;
        this.failures = [];
        this.lockedUntil = now + lockMs;
        return { ok: false, reason: 'locked', retryAfterMs: lockMs };
      }
      return { ok: false, reason: 'wrong', remaining: LIMIT.failures - this.failures.length };
    }

    this.failures = [];
    this.lockLevel = 0;
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = now + SESSION_MS;
    this.store.pruneSessions(now, MAX_SESSIONS - 1);
    this.store.createSession({ tokenHash: sha256(token), epoch: record.epoch, now, expiresAt, agent: agent ? String(agent).slice(0, 200) : null });
    return { ok: true, token, expiresAt };
  }

  /** Kiểm tra mã phiên (giá trị thô trong cookie). Trả về phiên hợp lệ hoặc null. */
  validate(token) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    return this.validateHash(sha256(token));
  }

  /** Như validate nhưng theo băm của mã phiên (dùng khi chỉ còn băm, ví dụ thiết bị nhận thông báo đẩy). */
  validateHash(hash, { touch = true } = {}) {
    if (!hash) return null;
    const record = readRecord(this.dataDir);
    if (!record) return null;
    const session = this.store.getSession(hash);
    if (!session) return null;
    const now = this.clock();
    if (session.expires_at <= now || session.epoch !== record.epoch) {
      this.store.deleteSession(hash);
      return null;
    }
    // Ghi mốc "thấy lần cuối" tối đa mỗi phút một lần để không ghi đĩa ở mọi yêu cầu.
    if (touch && now - session.last_seen > 60_000) this.store.touchSession(hash, now);
    return { hash, expiresAt: session.expires_at };
  }

  logout(token) {
    if (token) this.store.deleteSession(sha256(token));
  }
}
