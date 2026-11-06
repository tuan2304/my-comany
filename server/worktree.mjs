import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function git(cwd, args, { allowFail = false, raw = false } = {}) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    return raw ? stdout : stdout.trim();
  } catch (err) {
    if (allowFail) return null;
    const detail = (err.stderr || err.message || '').toString().trim();
    throw new Error(`git ${args[0]} thất bại: ${detail}`, { cause: err });
  }
}

export async function checkRepo(projectRoot) {
  if (!fs.existsSync(projectRoot)) throw new Error(`Không thấy thư mục dự án: ${projectRoot}`);
  const inside = await git(projectRoot, ['rev-parse', '--is-inside-work-tree'], { allowFail: true });
  if (inside !== 'true') throw new Error(`${projectRoot} không phải là git repo. Hãy chạy "git init" và tạo commit đầu tiên.`);
  const head = await git(projectRoot, ['rev-parse', '--verify', 'HEAD'], { allowFail: true });
  if (!head) throw new Error('Dự án chưa có commit nào. Hãy tạo commit đầu tiên để nhân viên có nhánh riêng để làm việc.');
  return head;
}

/** Tên an toàn cho nhánh/thư mục: bỏ dấu tiếng Việt ("Bình" thành "binh"), chỉ giữ chữ thường, số và gạch nối. */
export function safeName(value) {
  return (
    String(value)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'x'
  );
}

/** Mỗi việc một worktree và một nhánh riêng, đặt bên ngoài dự án (mục 3.7). */
export async function createWorktree({ projectRoot, worktreesDir, member, taskId, links = [], baseCommit: explicitBase }) {
  const head = await checkRepo(projectRoot);
  const baseCommit = explicitBase ?? head;
  const slug = `${safeName(member)}-task${taskId}`;
  const branch = `company/${slug}`;
  const dir = path.join(worktreesDir, slug);
  fs.mkdirSync(worktreesDir, { recursive: true });
  await git(projectRoot, ['worktree', 'add', '-b', branch, dir, baseCommit]);
  const linked = linkDirs({ projectRoot, worktree: dir, names: links });
  return { dir, branch, baseCommit, linked };
}

const GIT_IDENTITY = ['-c', 'user.name=Công ty AI', '-c', 'user.email=my-company@localhost', '-c', 'commit.gpgsign=false'];

/**
 * Gộp các nhánh đã được duyệt của một việc lớn vào một nhánh tích hợp `company/job<id>`, trong worktree
 * riêng. Gặp xung đột thì hủy lần gộp đó và báo file xung đột (không tự giải quyết thay con người).
 */
export async function integrateBranches({ projectRoot, worktreesDir, name, baseCommit, branches }) {
  const branch = `company/${name}`;
  const dir = path.join(worktreesDir, `${name}-merge`);
  fs.mkdirSync(worktreesDir, { recursive: true });
  await git(projectRoot, ['worktree', 'add', '-b', branch, dir, baseCommit]);
  const merged = [];
  for (const source of branches) {
    try {
      await git(dir, [...GIT_IDENTITY, 'merge', '--no-ff', '--no-edit', '-m', `company: gộp ${source} vào ${name}`, source]);
      merged.push(source);
    } catch (err) {
      const conflicts = (await git(dir, ['diff', '--name-only', '--diff-filter=U'], { allowFail: true })) ?? '';
      await git(dir, ['merge', '--abort'], { allowFail: true });
      return {
        ok: false, branch, dir, merged, failedBranch: source,
        conflictFiles: conflicts.split('\n').map((s) => s.trim()).filter(Boolean),
        error: err.message,
      };
    }
  }
  const commit = await git(dir, ['rev-parse', 'HEAD']);
  return { ok: true, branch, dir, merged, commit, conflictFiles: [] };
}

/** Mã commit mà một nhánh/tham chiếu đang trỏ tới. */
export async function resolveRef(projectRoot, ref) {
  return git(projectRoot, ['rev-parse', '--verify', `${ref}^{commit}`]);
}

/** Diff giữa mã gốc và nhánh của một việc, cắt gọn để đưa cho Trưởng nhóm duyệt. */
export async function branchDiff({ projectRoot, baseCommit, branch, maxChars = 30_000 }) {
  const stat = (await git(projectRoot, ['diff', '--stat', `${baseCommit}..${branch}`], { allowFail: true })) ?? '';
  const full = (await git(projectRoot, ['diff', '--no-color', `${baseCommit}..${branch}`], { allowFail: true })) ?? '';
  const truncated = full.length > maxChars;
  return { stat, patch: truncated ? `${full.slice(0, maxChars)}\n... (đã cắt bớt, còn ${full.length - maxChars} ký tự)` : full, truncated };
}

/** Đọc kết quả `git status --porcelain=v1 -z`: mỗi mục là "XY đường-dẫn", đổi tên có thêm một mục đường-dẫn-cũ. */
export function parsePorcelainZ(output) {
  const tokens = output.split('\0');
  const files = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.length < 4) continue;
    files.push(token.slice(3));
    if (token[0] === 'R' || token[0] === 'C') i += 1;
  }
  return files;
}

/**
 * Nối các thư mục nặng của dự án (như node_modules) vào worktree để nhân viên chạy được test mà
 * không phải cài lại. Chỉ nối thư mục có thật ở gốc dự án và chưa có trong worktree.
 */
export function linkDirs({ projectRoot, worktree, names }) {
  const linked = [];
  for (const name of names ?? []) {
    const clean = String(name).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!clean || clean.includes('..')) continue;
    const src = path.join(projectRoot, clean);
    const dst = path.join(worktree, clean);
    if (!fs.existsSync(src) || fs.existsSync(dst)) continue;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.symlinkSync(src, dst, 'junction');
    linked.push(clean);
  }
  return linked;
}

const excludeSpecs = (names) => (names ?? []).map((n) => `:(exclude)${n}`);

/** Commit mọi thay đổi trong worktree lên nhánh của việc (không push). Trả về danh sách file đổi. */
export async function commitWorktree({ dir, message, exclude = [] }) {
  const specs = exclude.length ? ['--', '.', ...excludeSpecs(exclude)] : [];
  const status = await git(dir, ['status', '--porcelain=v1', '-z', '--untracked-files=all', ...specs], { raw: true });
  const changedFiles = parsePorcelainZ(status);
  if (changedFiles.length === 0) return { changedFiles: [], commit: null };
  await git(dir, ['add', '-A', ...specs]);
  await git(dir, [
    '-c', 'user.name=Công ty AI',
    '-c', 'user.email=my-company@localhost',
    '-c', 'commit.gpgsign=false',
    'commit', '--no-verify', '-m', message,
  ]);
  const commit = await git(dir, ['rev-parse', 'HEAD']);
  return { changedFiles, commit };
}
