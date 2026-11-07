import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { sanitizedEnv } from './guard.mjs';

/**
 * Chụp ảnh giao diện của một nhánh để chủ so sánh (thi đấu skill).
 * Hệ thống (không phải nhân viên) chạy lệnh `preview.command` do chính chủ khai trong local/project.md, trong thư mục nhánh,
 * đợi bản xem thử lên, chụp từng trang bằng Edge/Chrome không giao diện, rồi tắt toàn bộ tiến trình đã mở.
 */

const BROWSER_CANDIDATES = [
  process.env.COMPANY_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export function findBrowser() {
  return BROWSER_CANDIDATES.find((p) => fs.existsSync(p)) ?? null;
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForUrl(url, timeoutMs, isAlive) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (!isAlive()) return false;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.status < 500) return true;
    } catch {
      /* chưa lên */
    }
    await sleep(500);
  }
  return false;
}

function killTree(child) {
  if (!child.pid) return Promise.resolve();
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => resolve());
    });
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
  return Promise.resolve();
}

function runBrowser(browser, args, timeoutMs) {
  const [exe, ...prefix] = browser;
  return new Promise((resolve) => {
    execFile(exe, [...prefix, ...args], { windowsHide: true, timeout: timeoutMs }, (err) => resolve(err));
  });
}

/**
 * @returns {Promise<{ok: true, shots: {page: string, file: string}[]} | {ok: false, error: string}>}
 * Không bao giờ ném lỗi: chụp hỏng chỉ làm cuộc thi thiếu ảnh, chủ vẫn chọn được.
 */
export async function captureShots({ dir, preview, outDir, prefix, browser = null, env = process.env }) {
  if (!preview) return { ok: false, error: 'Hồ sơ dự án (local/project.md) chưa khai mục "preview" nên không chụp được ảnh.' };
  const chosen = browser ?? (findBrowser() ? [findBrowser()] : null);
  if (!chosen) return { ok: false, error: 'Không tìm thấy Edge hoặc Chrome để chụp ảnh (đặt biến COMPANY_BROWSER nếu cài ở chỗ khác).' };

  let child = null;
  let exited = false;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'company-shot-'));
  const logs = [];
  try {
    const port = await freePort();
    const command = preview.command.replaceAll('{port}', String(port));
    const base = preview.url.replaceAll('{port}', String(port));
    fs.mkdirSync(outDir, { recursive: true });

    child = spawn(command, {
      cwd: dir, shell: true, windowsHide: true, detached: process.platform !== 'win32',
      env: { ...sanitizedEnv(env), PORT: String(port), BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const keep = (chunk) => {
      logs.push(String(chunk));
      if (logs.length > 40) logs.shift();
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.on('exit', () => { exited = true; });
    child.on('error', (err) => { exited = true; logs.push(err.message); });

    const up = await waitForUrl(`${base}${preview.pages[0]}`, preview.waitSeconds * 1000, () => !exited);
    if (!up) {
      const tail = logs.join('').trim().split('\n').slice(-4).join(' ').slice(0, 300);
      return { ok: false, error: `Bản xem thử không lên được${exited ? ' (lệnh đã thoát)' : ` sau ${preview.waitSeconds} giây`}.${tail ? ` Nhật ký cuối: ${tail}` : ''}` };
    }

    const shots = [];
    for (const [i, page] of preview.pages.entries()) {
      const file = path.join(outDir, `${prefix}-${i + 1}.png`);
      await runBrowser(
        chosen,
        ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1280,900', '--virtual-time-budget=8000',
          `--user-data-dir=${profile}`, `--screenshot=${file}`, `${base}${page}`],
        60_000,
      );
      if (fs.existsSync(file) && fs.statSync(file).size > 0) shots.push({ page, file });
    }
    if (shots.length === 0) return { ok: false, error: 'Trình duyệt chạy được nhưng không chụp ra ảnh nào.' };
    return { ok: true, shots };
  } catch (err) {
    return { ok: false, error: `Lỗi khi chụp ảnh: ${err.message}` };
  } finally {
    if (child) await killTree(child);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
}
