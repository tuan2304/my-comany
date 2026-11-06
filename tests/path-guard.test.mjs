import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { decide } from '../server/path-guard.mjs';
import { buildGuardSettings } from '../server/runner.mjs';
import { REPO, removeDir, tmpDir } from './helpers.mjs';

function setupRoot() {
  const root = tmpDir();
  for (const dir of ['src/server', 'src/app', 'prisma', 'docs']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  return root;
}

const allow = ['src/server', 'prisma'];
const ask = (root, toolName, file, extra = {}) => decide({ toolName, toolInput: { file_path: file }, root, allow, mode: 'worker', ...extra });

test('nhân viên sửa được trong thư mục của team và bị chặn ngoài đó', () => {
  const root = setupRoot();
  try {
    assert.equal(ask(root, 'Edit', 'src/server/api.js').allowed, true);
    assert.equal(ask(root, 'Write', path.join(root, 'src', 'server', 'moi', 'sâu', 'file.js')).allowed, true, 'đường dẫn tuyệt đối và thư mục chưa có');
    assert.equal(ask(root, 'Write', 'prisma/schema.prisma').allowed, true);

    const outside = ask(root, 'Edit', 'src/app/page.tsx');
    assert.equal(outside.allowed, false);
    assert.match(outside.reason, /Ngoài thư mục được phép sửa của team \(src\/server, prisma\)/);
    assert.equal(ask(root, 'MultiEdit', 'docs/readme.md').allowed, false);
    assert.equal(ask(root, 'NotebookEdit', 'docs/a.ipynb').allowed, false);
    assert.equal(ask(root, 'Edit', 'src/serverless/x.js').allowed, false, 'chỉ giống tiền tố tên thư mục thì vẫn bị chặn');
    assert.equal(ask(root, 'Edit', 'src/server/../app/page.tsx').allowed, false, 'đi vòng bằng ../ vẫn bị chặn');
    assert.equal(ask(root, 'Edit', 'package.json').allowed, false, 'file ở gốc dự án cũng ngoài phạm vi');
    // Đọc thì được ở mọi nơi trong worktree.
    assert.equal(ask(root, 'Read', 'src/app/page.tsx').allowed, true);
  } finally {
    removeDir(root);
  }
});

test('không khai thư mục thì sửa được mọi nơi trong worktree, nhưng không bao giờ ra ngoài', () => {
  const root = setupRoot();
  try {
    assert.equal(ask(root, 'Edit', 'docs/x.md', { allow: [] }).allowed, true);
    const out = ask(root, 'Edit', path.join(root, '..', 'ngoai.txt'), { allow: [] });
    assert.equal(out.allowed, false);
    assert.match(out.reason, /ngoài thư mục làm việc/);
    assert.equal(ask(root, 'Read', '../ngoai.txt', { allow: [] }).allowed, false, 'đọc ngoài worktree cũng bị chặn');
    assert.equal(ask(root, 'Read', process.platform === 'win32' ? 'C:\\Windows\\win.ini' : '/etc/passwd').allowed, false);
  } finally {
    removeDir(root);
  }
});

test('file bí mật và thư mục .git không đọc, không sửa được', () => {
  const root = setupRoot();
  try {
    for (const tool of ['Read', 'Edit', 'Write']) {
      assert.equal(ask(root, tool, '.env', { allow: [] }).allowed, false, `${tool} .env`);
      assert.equal(ask(root, tool, 'src/server/.env.local', { allow: [] }).allowed, false, `${tool} .env.local`);
      assert.equal(ask(root, tool, '.git/config', { allow: [] }).allowed, false, `${tool} .git`);
    }
    assert.equal(ask(root, 'Read', '.env.example', { allow: [] }).allowed, true, 'file mẫu thì được');
    assert.equal(ask(root, 'Read', 'src/environment.ts', { allow: [] }).allowed, true, 'chỉ tên giống .env thì không sao');
  } finally {
    removeDir(root);
  }
});

test('chế độ chỉ đọc (Trưởng nhóm): đọc được, sửa gì cũng bị chặn', () => {
  const root = setupRoot();
  try {
    const opts = { allow: [], mode: 'readonly' };
    assert.equal(ask(root, 'Read', 'src/app/page.tsx', opts).allowed, true);
    for (const tool of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) {
      const r = ask(root, tool, 'src/server/a.js', opts);
      assert.equal(r.allowed, false, tool);
      assert.match(r.reason, /chỉ được đọc/);
    }
    assert.equal(decide({ toolName: 'Bash', toolInput: { command: 'ls' }, root, mode: 'readonly' }).allowed, true, 'công cụ không có đường dẫn thì để quyền khác lo');
  } finally {
    removeDir(root);
  }
});

function runHook(env, event) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(REPO, 'server', 'path-guard.mjs')], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (code) => resolve({ code, stderr }));
    child.stdin.end(typeof event === 'string' ? event : JSON.stringify(event));
  });
}

test('hook chạy như Claude Code gọi: mã thoát 0 khi cho phép, 2 kèm lý do khi chặn, và chặn khi dữ liệu hỏng', async () => {
  const root = setupRoot();
  try {
    const env = { COMPANY_GUARD_ROOT: root, COMPANY_GUARD_ALLOW: JSON.stringify(allow), COMPANY_GUARD_MODE: 'worker' };
    const okRun = await runHook(env, { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(root, 'src', 'server', 'a.js') } });
    assert.equal(okRun.code, 0);
    const bad = await runHook(env, { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: path.join(root, 'docs', 'a.md') } });
    assert.equal(bad.code, 2);
    assert.match(bad.stderr, /Ngoài thư mục được phép sửa/);
    const garbage = await runHook(env, 'không phải JSON');
    assert.equal(garbage.code, 2, 'không đọc được sự kiện thì chặn cho chắc');
    const brokenConfig = await runHook({ ...env, COMPANY_GUARD_ALLOW: '{hỏng' }, { tool_name: 'Edit', tool_input: { file_path: 'a' } });
    assert.equal(brokenConfig.code, 2);
  } finally {
    removeDir(root);
  }
});

test('buildGuardSettings tạo cấu hình hook dùng đường dẫn có dấu gạch xuôi', () => {
  const settings = buildGuardSettings('D:\\my-company\\server\\path-guard.mjs');
  const hook = settings.hooks.PreToolUse[0];
  assert.match(hook.matcher, /Edit.*Write.*Read/);
  assert.equal(hook.hooks[0].type, 'command');
  assert.equal(hook.hooks[0].command, 'node "D:/my-company/server/path-guard.mjs"');
});
