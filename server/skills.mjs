import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Skill từ GitHub: chỉ skill đã được duyệt và ghi vào
 * skills.lock mới được nạp. Mỗi skill nằm trong skills/library/<tên>/.
 */

const SCRIPT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.py', '.sh', '.bash', '.ps1', '.bat', '.cmd', '.rb', '.pl']);

export function listFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * File văn bản đổi CRLF thành LF trước khi băm: git trên Windows (autocrlf) đổi kiểu xuống dòng khi clone,
 * nên nếu băm nguyên byte thì skill đã duyệt sẽ "bị sửa" chỉ vì clone sang máy khác. File nhị phân (có byte NUL) giữ nguyên.
 */
function normalizedBytes(file) {
  const buf = fs.readFileSync(file);
  if (buf.includes(0) || !buf.includes(13)) return buf;
  const out = Buffer.allocUnsafe(buf.length);
  let n = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10) continue;
    out[n++] = buf[i];
  }
  return out.subarray(0, n);
}

/** Băm toàn bộ cây thư mục (đường dẫn + nội dung) để phát hiện skill bị sửa sau khi duyệt. */
export function hashDir(dir) {
  const hash = crypto.createHash('sha256');
  for (const rel of listFiles(dir)) {
    hash.update(rel);
    hash.update('\0');
    hash.update(normalizedBytes(path.join(dir, rel)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function readLock(file) {
  if (!fs.existsSync(file)) return { version: 1, skills: {} };
  const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { version: 1, skills: {}, ...lock };
}

export function writeLock(file, lock) {
  const sorted = Object.fromEntries(Object.entries(lock.skills).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(file, `${JSON.stringify({ ...lock, skills: sorted }, null, 2)}\n`, 'utf8');
}

/** Kiểm tra mọi skill trong lock còn nguyên vẹn. */
export function verifyLibrary({ libraryDir, lockFile }) {
  const lock = readLock(lockFile);
  return Object.entries(lock.skills).map(([name, entry]) => {
    const dir = path.join(libraryDir, name);
    if (!fs.existsSync(dir)) return { name, ok: false, reason: 'thiếu thư mục' };
    const actual = hashDir(dir);
    return actual === entry.sha256 ? { name, ok: true } : { name, ok: false, reason: 'nội dung đã bị đổi so với lúc duyệt' };
  });
}

/**
 * Ghép gói skill cho một lần chạy: skill luôn nạp của vai trò + skill theo công nghệ
 * khi hồ sơ dự án khớp. Chỉ nạp skill có trong lock và còn nguyên vẹn.
 */
export function composeSkillPack({ libraryDir, lockFile, role, project, outDir, skillSet = null, excludeSkills = [] }) {
  // Thi đấu skill: bỏ các skill đang đem ra so sánh khỏi phần mặc định của vai trò, rồi nạp đúng bộ skill của việc này.
  const exclude = new Set(excludeSkills);
  const names = new Set((role.skills ?? []).filter((n) => !exclude.has(n)));
  for (const n of skillSet ?? []) names.add(String(n));
  const stack = (project?.stack ?? []).map((s) => s.toLowerCase());
  for (const [key, list] of Object.entries(role.stack_skills ?? {})) {
    if (stack.some((s) => s.includes(String(key).toLowerCase()))) for (const n of list) names.add(String(n));
  }
  for (const n of exclude) if (!(skillSet ?? []).includes(n)) names.delete(n);
  const lock = readLock(lockFile);
  const loaded = [];
  const skipped = [];
  for (const name of names) {
    const src = path.join(libraryDir, name);
    const entry = lock.skills[name];
    if (!entry) {
      skipped.push({ name, reason: 'chưa được duyệt (không có trong skills.lock)' });
    } else if (!fs.existsSync(path.join(src, 'SKILL.md'))) {
      skipped.push({ name, reason: 'không có SKILL.md trong thư viện' });
    } else if (hashDir(src) !== entry.sha256) {
      skipped.push({ name, reason: 'nội dung khác với lúc duyệt' });
    } else {
      loaded.push({ name, src });
    }
  }
  if (loaded.length === 0) return { dir: null, loaded: [], skipped };

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(outDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'company-skills', version: '0.0.0', description: `Skill của vai trò ${role.id}` }, null, 2),
  );
  for (const { name, src } of loaded) fs.cpSync(src, path.join(outDir, 'skills', name), { recursive: true });
  return { dir: outDir, loaded: loaded.map((l) => l.name), skipped };
}

// ---- Thêm skill mới qua khu cách ly (dùng bởi `skills add`) ----

export function parseSource(input) {
  // Chấp nhận: owner/repo, owner/repo/đường/dẫn, hoặc URL github.com đầy đủ (kể cả /tree/<ref>/<path>).
  const trimmed = String(input).trim().replace(/\.git$/, '');
  let m = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)\/?(.*))?$/);
  if (m) return { owner: m[1], repo: m[2], ref: m[3] ?? null, subpath: m[4] ?? '' };
  m = trimmed.match(/^([\w.-]+)\/([\w.-]+)(?:\/(.+))?$/);
  if (m) return { owner: m[1], repo: m[2], ref: null, subpath: m[3] ?? '' };
  throw new Error(`Không hiểu nguồn skill: ${input}. Dùng dạng owner/repo/đường-dẫn hoặc URL GitHub.`);
}

/** Tải đúng một commit vào khu cách ly. Trả về thư mục, mã commit và giấy phép. */
export async function fetchToQuarantine({ source, quarantineDir }) {
  const { owner, repo, ref } = parseSource(source);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(quarantineDir, `${owner}-${repo}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const url = `https://github.com/${owner}/${repo}.git`;
  const args = ['clone', '--quiet', '--depth', '1', ...(ref ? ['--branch', ref] : []), url, dir];
  try {
    await execFileAsync('git', args, { windowsHide: true, timeout: 120_000 });
  } catch (err) {
    throw new Error(`Không tải được ${url}: ${(err.stderr || err.message).toString().trim()}`, { cause: err });
  }
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: dir, windowsHide: true });
  let license = null;
  for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING']) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) {
      license = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.trim())?.trim() ?? name;
      break;
    }
  }
  return { dir, commit: stdout.trim(), license, owner, repo };
}

/** Rà soát một thư mục skill để người duyệt xem: file nào là script, có hook không... */
export function inspectSkillDir(skillDir) {
  if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
    throw new Error(`Không có SKILL.md trong ${skillDir}`);
  }
  const files = listFiles(skillDir).map((rel) => {
    const ext = path.extname(rel).toLowerCase();
    const size = fs.statSync(path.join(skillDir, rel)).size;
    const flags = [];
    if (SCRIPT_EXT.has(ext)) flags.push('script');
    if (/(^|\/)hooks?\//i.test(rel) || /hooks\.json$/i.test(rel)) flags.push('hook');
    if (/(^|\/)package\.json$/.test(rel)) flags.push('package.json');
    if (/\.(exe|dll|so|dylib|bin)$/i.test(rel)) flags.push('nhị phân');
    return { rel, size, flags };
  });
  return { files, risky: files.filter((f) => f.flags.length > 0) };
}

/**
 * Chép skill đã duyệt vào thư viện và ghi vào lock. `exclude` là các đường dẫn (file hoặc thư mục,
 * tính từ thư mục skill) cố ý bỏ đi, ví dụ script không cần hoặc tính năng gửi dữ liệu ra ngoài.
 * Danh sách bỏ được ghi vào lock để sau này biết bản trong thư viện khác bản gốc ở đâu.
 */
export function installSkill({ skillDir, libraryDir, lockFile, name, meta, exclude = [] }) {
  const dest = path.join(libraryDir, name);
  if (fs.existsSync(dest)) throw new Error(`Skill "${name}" đã có trong thư viện. Hãy xóa thủ công nếu muốn cập nhật.`);
  fs.mkdirSync(libraryDir, { recursive: true });
  const skipped = exclude.map((e) => e.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')).filter(Boolean);
  fs.cpSync(skillDir, dest, {
    recursive: true,
    filter: (src) => {
      if (path.basename(src) === '.git') return false;
      const rel = path.relative(skillDir, src).split(path.sep).join('/');
      return !skipped.some((e) => rel === e || rel.startsWith(`${e}/`));
    },
  });
  const lock = readLock(lockFile);
  lock.skills[name] = { ...meta, excluded: skipped, sha256: hashDir(dest), addedAt: new Date().toISOString() };
  writeLock(lockFile, lock);
  return dest;
}
