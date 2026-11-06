/**
 * Nhận ra khi gói Pro hết hạn mức (mục 4.4 của KE-HOACH.md).
 *
 * Nguồn tín hiệu chính là sự kiện `rate_limit_event` trong luồng stream-json,
 * có dạng (đã quan sát thật trên Claude Code 2.1.308):
 *   { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', resetsAt: <giây epoch>,
 *     rateLimitType: 'five_hour', unifiedWindows: { five_hour: { utilization: 0.68, ... } } } }
 * Giá trị `status` khi bị chặn chưa được quan sát, nên mọi giá trị không bắt đầu bằng
 * "allowed" đều coi là bị chặn. Ngoài ra còn dò theo nội dung lỗi làm đường dự phòng.
 */

export function parseRateLimitEvent(message) {
  const info = message?.rate_limit_info ?? message?.rateLimitInfo;
  if (!info || typeof info !== 'object') return null;
  const status = String(info.status ?? 'unknown');
  const resetsAt = toMillis(info.resetsAt ?? info.resets_at);
  const windows = {};
  for (const [name, w] of Object.entries(info.unifiedWindows ?? {})) {
    if (w && typeof w === 'object') {
      windows[name] = {
        utilization: typeof w.utilization === 'number' ? w.utilization : null,
        resetsAt: toMillis(w.resetsAt ?? w.resets_at),
      };
    }
  }
  return {
    status,
    blocked: !status.toLowerCase().startsWith('allowed'),
    type: info.rateLimitType ?? null,
    resetsAt,
    windows,
    overageStatus: info.overageStatus ?? null,
    isUsingOverage: Boolean(info.isUsingOverage),
  };
}

function toMillis(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  // Giá trị quan sát được là giây epoch (10 chữ số); chấp nhận cả mili giây.
  return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
}

const QUOTA_TEXT = [
  /usage limit (reached|exceeded)/i,
  /hit your (usage |session |weekly )?limit/i,
  /limit reached/i,
  /(five|5)[- ]hour limit/i,
  /out of (usage|messages)/i,
  /rate[ _-]?limit(ed)?/i,
  /quota (exceeded|exhausted)/i,
];

export function looksLikeQuotaText(text) {
  if (typeof text !== 'string') return false;
  return QUOTA_TEXT.some((pattern) => pattern.test(text));
}

const BACKOFF_MINUTES = [5, 10, 20, 30, 60];

/** Thời gian chờ tăng dần khi không biết giờ hồi. */
export function backoffMs(attempt) {
  const index = Math.min(Math.max(attempt, 0), BACKOFF_MINUTES.length - 1);
  return BACKOFF_MINUTES[index] * 60_000;
}

/** Giờ nên thử lại: giờ hồi (cộng một chút dự phòng) nếu có, không thì lùi dần. */
export function nextRetryAt({ resetsAt, attempt, now = Date.now(), marginMs = 30_000 }) {
  if (resetsAt && resetsAt > now) return resetsAt + marginMs;
  return now + backoffMs(attempt);
}
