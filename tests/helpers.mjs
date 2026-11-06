import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../server/config.mjs';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FAKE_CLAUDE = path.join(REPO, 'tests', 'fixtures', 'fake-claude.mjs');

export function tmpDir(prefix = 'company-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

export function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
}

/** Tạo một dự án git nhỏ có sẵn một commit và hồ sơ dự án. */
export function makeProject(root) {
  const project = path.join(root, 'proj');
  fs.mkdirSync(project, { recursive: true });
  git(project, 'init', '-q', '-b', 'main');
  git(project, 'config', 'user.name', 'Test');
  git(project, 'config', 'user.email', 'test@example.com');
  git(project, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(project, 'README.md'), '# proj\n');
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '-m', 'init');

  const local = path.join(root, 'local');
  fs.mkdirSync(local, { recursive: true });
  fs.writeFileSync(
    path.join(local, 'project.md'),
    ['---', 'name: proj', 'stack: [Node]', 'folders:', '  backend: [src]', 'commands:', '  test: npm test',
      'allowed_commands: [npm test, git status]', 'conventions: |', '  Dùng ESM.', '---', ''].join('\n'),
  );
  return { project, local };
}

export function testConfig(root, project, local, overrides = {}) {
  return loadConfig({
    projectRoot: project,
    overrides: {
      port: 0,
      dataDir: path.join(root, 'data'),
      localDir: local,
      worktreesDir: path.join(root, 'worktrees'),
      claudeBin: process.execPath,
      claudeArgsPrefix: [FAKE_CLAUDE],
      quotaMarginMs: 0,
      ...overrides,
    },
  });
}

export async function waitFor(predicate, { timeout = 15000, interval = 50, label = 'điều kiện' } = {}) {
  const start = Date.now();
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error(`Hết thời gian chờ ${label}`);
    await new Promise((r) => setTimeout(r, interval));
  }
}
