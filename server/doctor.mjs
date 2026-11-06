import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { hasPin } from './auth.mjs';
import { findBillingEnv, sanitizedEnv } from './guard.mjs';
import { loadProject } from './project.mjs';
import { verifyLibrary } from './skills.mjs';
import { loadTeams } from './teams.mjs';
import { checkRepo } from './worktree.mjs';

const execFileAsync = promisify(execFile);

async function run(bin, args, options = {}) {
  const { stdout } = await execFileAsync(bin, args, { windowsHide: true, timeout: 20_000, env: sanitizedEnv(), ...options });
  return stdout.trim();
}

function result(id, level, title, detail = '') {
  return { id, level, title, detail };
}

/** Kiểm tra môi trường (`my-company doctor`). Không tốn hạn mức: chỉ chạy các lệnh trạng thái. */
export async function runDoctor(cfg) {
  const checks = [];

  const [major, minor] = process.versions.node.split('.').map(Number);
  checks.push(
    major > 22 || (major === 22 && minor >= 13)
      ? result('node', 'ok', `Node.js ${process.versions.node}`)
      : result('node', 'fail', `Node.js ${process.versions.node} quá cũ`, 'Cần Node.js 22.13 trở lên.'),
  );

  try {
    await run('node', ['--version']);
    checks.push(result('node-path', 'ok', 'Lệnh "node" có trong PATH'));
  } catch {
    checks.push(result('node-path', 'fail', 'Không tìm thấy lệnh "node" trong PATH', 'Hook chặn file của nhân viên gọi "node", thiếu nó thì mọi lần ghi file sẽ bị từ chối.'));
  }

  try {
    checks.push(result('git', 'ok', (await run('git', ['--version'])).replace(/^git version /, 'git ')));
  } catch {
    checks.push(result('git', 'fail', 'Không tìm thấy git', 'Cần git để tạo nhánh riêng cho từng nhân viên.'));
  }

  let claudeFound = false;
  try {
    const version = await run(cfg.claudeBin, [...cfg.claudeArgsPrefix, '--version']);
    claudeFound = true;
    checks.push(result('claude', 'ok', `Claude Code ${version}`));
  } catch {
    checks.push(result('claude', 'fail', `Không chạy được "${cfg.claudeBin}"`, 'Hãy cài Claude Code và đăng nhập bằng tài khoản Pro.'));
  }

  if (claudeFound && cfg.claudeArgsPrefix.length === 0) {
    try {
      const status = JSON.parse(await run(cfg.claudeBin, ['auth', 'status']));
      if (!status.loggedIn) {
        checks.push(result('auth', 'fail', 'Claude Code chưa đăng nhập', 'Chạy "claude" một lần và đăng nhập bằng tài khoản Pro.'));
      } else if (status.authMethod !== 'claude.ai') {
        checks.push(result('auth', 'fail', `Đang đăng nhập kiểu "${status.authMethod}", không phải tài khoản claude.ai`, 'Công ty chỉ chạy bằng gói Pro, không dùng API.'));
      } else {
        const plan = status.subscriptionType ?? 'không rõ';
        checks.push(
          plan === 'pro'
            ? result('auth', 'ok', `Đăng nhập bằng tài khoản claude.ai (gói ${plan})`)
            : result('auth', 'warn', `Đăng nhập bằng tài khoản claude.ai, gói "${plan}" (không phải Pro)`),
        );
      }
    } catch {
      checks.push(result('auth', 'warn', 'Không đọc được trạng thái đăng nhập', 'Phiên bản Claude Code có thể không hỗ trợ "claude auth status".'));
    }
  }

  const billing = findBillingEnv();
  checks.push(
    billing.length
      ? result('billing', 'warn', `Máy bạn có biến môi trường tính tiền API: ${billing.join(', ')}`, 'Công cụ tự gỡ các biến này khỏi tiến trình claude nó chạy, nhưng hãy cân nhắc xóa chúng khỏi máy.')
      : result('billing', 'ok', 'Không có khóa API trong môi trường'),
  );

  try {
    await checkRepo(cfg.projectRoot);
    checks.push(result('project', 'ok', `Dự án: ${cfg.projectRoot}`));
  } catch (err) {
    checks.push(result('project', 'fail', `Dự án chưa sẵn sàng: ${cfg.projectRoot}`, err.message));
  }

  try {
    const project = loadProject(cfg.localDir);
    if (!project) checks.push(result('profile', 'warn', 'Chưa có hồ sơ dự án (local/project.md)', 'Chạy "npm run init" để tạo bản nháp, rồi xem và sửa.'));
    else if (project.allowedCommands.length === 0) checks.push(result('profile', 'warn', 'Hồ sơ dự án chưa khai lệnh nào được phép', 'Nhân viên sẽ không chạy được lệnh Bash nào (kể cả test).'));
    else checks.push(result('profile', 'ok', `Hồ sơ dự án: ${project.name || path.basename(cfg.projectRoot)} (${project.stack.join(', ') || 'chưa khai stack'})`));
  } catch (err) {
    checks.push(result('profile', 'fail', 'Hồ sơ dự án bị lỗi', err.message));
  }

  try {
    const teams = loadTeams({ teamsDir: cfg.teamsDir, localTeamsDir: path.join(cfg.localDir, 'teams') });
    const people = teams.reduce((n, t) => n + t.members.length, 0);
    checks.push(result('teams', teams.length ? 'ok' : 'warn', `${teams.length} team, ${people} nhân viên`));
  } catch (err) {
    checks.push(result('teams', 'fail', 'Cấu hình team bị lỗi', err.message));
  }

  try {
    const lockFile = path.join(cfg.toolDir, 'skills.lock');
    const verdicts = verifyLibrary({ libraryDir: path.join(cfg.skillsDir, 'library'), lockFile });
    const bad = verdicts.filter((v) => !v.ok);
    if (bad.length) checks.push(result('skills', 'fail', `Skill bị đổi hoặc thiếu: ${bad.map((b) => b.name).join(', ')}`, bad.map((b) => `${b.name}: ${b.reason}`).join('; ')));
    else checks.push(result('skills', 'ok', `${verdicts.length} skill đã duyệt, còn nguyên vẹn`));
  } catch (err) {
    checks.push(result('skills', 'fail', 'Không kiểm tra được skills.lock', err.message));
  }

  try {
    fs.mkdirSync(cfg.dataDir, { recursive: true });
    fs.accessSync(cfg.dataDir, fs.constants.W_OK);
    checks.push(result('data', 'ok', `Thư mục dữ liệu ghi được: ${cfg.dataDir}`));
  } catch (err) {
    checks.push(result('data', 'fail', 'Không ghi được thư mục dữ liệu', err.message));
  }

  if (cfg.publicHost) {
    checks.push(
      hasPin(cfg.dataDir)
        ? result('remote', 'ok', `Truy cập từ xa bật: https://${cfg.publicHost} (cổng ${cfg.remotePort}, có PIN)`, `Tailscale phải trỏ vào cổng ${cfg.remotePort}, không phải ${cfg.port}: tailscale serve --bg ${cfg.remotePort}`)
        : result('remote', 'warn', 'Đã đặt tên máy từ xa nhưng CHƯA đặt PIN, nên từ xa chưa vào được', 'Chạy "npm run pin -- set".'),
    );
  }

  return checks;
}
