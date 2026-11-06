import assert from 'node:assert/strict';
import test from 'node:test';
import { findBillingEnv, maskSecrets, sanitizedEnv, shorten } from '../server/guard.mjs';
import { backoffMs, looksLikeQuotaText, nextRetryAt, parseRateLimitEvent } from '../server/quota.mjs';

test('sanitizedEnv gỡ khóa API và biến phiên lồng nhau, không phân biệt hoa thường', () => {
  const env = sanitizedEnv({
    PATH: '/bin',
    anthropic_api_key: 'sk-ant-xxxxxxxxxxxx',
    ANTHROPIC_AUTH_TOKEN: 't',
    ANTHROPIC_BASE_URL: 'https://proxy',
    CLAUDE_CODE_USE_BEDROCK: '1',
    CLAUDECODE: '1',
    CLAUDE_CODE_GIT_BASH_PATH: 'C:\\git\\bash.exe',
    HOME: '/home/a',
  });
  assert.deepEqual(Object.keys(env).sort(), ['CLAUDE_CODE_GIT_BASH_PATH', 'HOME', 'PATH']);
});

test('findBillingEnv báo các biến tính tiền đang có', () => {
  assert.deepEqual(findBillingEnv({ ANTHROPIC_API_KEY: 'x', PATH: 'y' }), ['ANTHROPIC_API_KEY']);
  assert.deepEqual(findBillingEnv({ ANTHROPIC_API_KEY: '', PATH: 'y' }), []);
});

test('maskSecrets che các loại secret thường gặp', () => {
  const samples = [
    'key sk-ant-api03-abcdefghijklmnop end',
    'token ghp_abcdefghijklmnopqrstuvwxyz0123456789 end',
    'AWS AKIAABCDEFGHIJKLMNOP end',
    'header Authorization: Bearer abcdefghijklmnop1234567890',
    'jwt eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghijklmnop',
    'SUPABASE_SERVICE_ROLE_KEY=abcdef123456',
    'password: "hunter2hunter2"',
  ];
  for (const sample of samples) {
    const masked = maskSecrets(sample);
    assert.match(masked, /\[đã che\]/, sample);
    assert.doesNotMatch(masked, /abcdefghijklmnop|hunter2hunter2|abcdef123456/, sample);
  }
  assert.equal(maskSecrets('không có gì bí mật'), 'không có gì bí mật');
});

test('shorten gộp khoảng trắng và cắt gọn', () => {
  assert.equal(shorten('a   b\n c', 100), 'a b c');
  assert.equal(shorten('x'.repeat(50), 10).length, 10);
});

test('parseRateLimitEvent đọc dạng sự kiện đã quan sát thật', () => {
  const info = parseRateLimitEvent({
    type: 'rate_limit_event',
    rate_limit_info: {
      status: 'allowed', resetsAt: 1793901600, rateLimitType: 'five_hour', overageStatus: 'rejected', isUsingOverage: false,
      unifiedWindows: { five_hour: { utilization: 0.68, resetsAt: 1793901600 }, seven_day: { utilization: 0.1 } },
    },
  });
  assert.equal(info.blocked, false);
  assert.equal(info.resetsAt, 1793901600 * 1000);
  assert.equal(info.windows.five_hour.utilization, 0.68);
  assert.equal(info.windows.seven_day.resetsAt, null);
});

test('parseRateLimitEvent coi trạng thái lạ là bị chặn, allowed_warning thì không', () => {
  assert.equal(parseRateLimitEvent({ rate_limit_info: { status: 'rejected' } }).blocked, true);
  assert.equal(parseRateLimitEvent({ rate_limit_info: { status: 'allowed_warning' } }).blocked, false);
  assert.equal(parseRateLimitEvent({ nothing: true }), null);
});

test('looksLikeQuotaText nhận ra thông báo hết hạn mức', () => {
  for (const text of ["You've hit your limit · resets 5pm", 'Claude AI usage limit reached|1793901600', '5-hour limit reached']) {
    assert.equal(looksLikeQuotaText(text), true, text);
  }
  assert.equal(looksLikeQuotaText('Đã sửa xong lỗi đăng nhập'), false);
});

test('nextRetryAt dùng giờ hồi khi có, không thì lùi dần', () => {
  const now = 1_000_000;
  assert.equal(nextRetryAt({ resetsAt: now + 5000, attempt: 0, now, marginMs: 100 }), now + 5100);
  assert.equal(nextRetryAt({ resetsAt: null, attempt: 0, now }), now + backoffMs(0));
  assert.equal(nextRetryAt({ resetsAt: now - 1, attempt: 2, now }), now + backoffMs(2));
  assert.ok(backoffMs(99) === backoffMs(4), 'có trần');
  assert.ok(backoffMs(1) > backoffMs(0));
});
