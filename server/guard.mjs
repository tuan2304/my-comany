/**
 * Các biện pháp bảo vệ dùng chung (mục 4.4 và 6 của KE-HOACH.md):
 * - không để tiến trình `claude` vô tình dùng API tính tiền;
 * - che secret trước khi lưu hoặc hiển thị.
 */

// Các biến này làm Claude Code chuyển sang API/nhà cung cấp khác (tính tiền riêng).
const BILLING_ENV = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
];

// Các biến cho biết "đang chạy bên trong một phiên Claude Code khác".
const NESTED_SESSION_ENV = [
  'CLAUDECODE',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_PID',
  'CLAUDE_AGENT_SDK_VERSION',
];

/** Môi trường cho tiến trình `claude` con: bỏ biến tính tiền API và biến phiên lồng nhau. */
export function sanitizedEnv(base = process.env) {
  const drop = new Set([...BILLING_ENV, ...NESTED_SESSION_ENV]);
  const env = {};
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue;
    if (drop.has(key.toUpperCase())) continue;
    env[key] = value;
  }
  return env;
}

/** Các biến tính tiền đang có trong môi trường (dùng cho `doctor`). */
export function findBillingEnv(base = process.env) {
  const wanted = new Set(BILLING_ENV);
  return Object.keys(base).filter((key) => wanted.has(key.toUpperCase()) && base[key]);
}

const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /sb_(?:secret|publishable)_[A-Za-z0-9_-]{10,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
];
const ASSIGNMENT = /\b([A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|SERVICE_ROLE)[A-Za-z0-9_]*)\s*([=:])\s*(["']?)([^\s"']{6,})\3/gi;

export function maskSecrets(text) {
  if (typeof text !== 'string' || text === '') return text;
  let out = text;
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, '[đã che]');
  out = out.replace(ASSIGNMENT, (_m, name, sep, quote) => `${name}${sep}${quote}[đã che]${quote}`);
  return out;
}

export function shorten(text, max = 300) {
  if (typeof text !== 'string') return '';
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
