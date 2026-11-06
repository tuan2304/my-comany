import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.mjs';
import { startServer } from '../server/index.mjs';
import { isoWeekOf, reportToMarkdown, shiftWeek, weekRange, weeklyReport } from '../server/report.mjs';
import { makeProject, removeDir, testConfig, tmpDir } from './helpers.mjs';

// Tuần ISO 2026-W45 là thứ Hai 2/11 đến Chủ nhật 8/11/2026 (giờ máy).
const at = (day, h = 12, m = 0) => new Date(2026, 10, day, h, m).getTime();
const NOW = at(6);

function finishedTask(store, over) {
  const task = store.createTask({ title: 't', prompt: 'p', team: over.team ?? 'backend', member: over.member ?? 'An', role: 'backend-dev', kind: over.kind ?? 'work' });
  const { team, member, kind, ...fields } = over;
  void team; void member; void kind;
  return store.updateTask(task.id, {
    status: 'done', turns: 5, duration_ms: 60_000, input_tokens: 100, output_tokens: 1000, cache_read_tokens: 500, cache_creation_tokens: 100, est_cost_usd: 0.5,
    finished_at: at(4), ...fields,
  });
}

test('mã tuần ISO: đổi qua lại, ranh giới năm, tuần không tồn tại', () => {
  assert.equal(isoWeekOf(at(2, 0, 0)), '2026-W45');
  assert.equal(isoWeekOf(at(8, 23, 59)), '2026-W45', 'Chủ nhật vẫn thuộc tuần đó');
  assert.equal(isoWeekOf(at(9, 0, 0)), '2026-W46');
  // 1/1/2027 là thứ Sáu nên thuộc tuần 53 của 2026; 4/1/2027 là thứ Hai tuần 1 của 2027.
  assert.equal(isoWeekOf(new Date(2027, 0, 1).getTime()), '2026-W53');
  assert.equal(isoWeekOf(new Date(2027, 0, 4).getTime()), '2027-W01');
  assert.equal(isoWeekOf(new Date(2025, 11, 29).getTime()), '2026-W01', '29/12/2025 là thứ Hai tuần 1 của 2026');

  const r = weekRange('2026-W45');
  assert.equal(r.from, at(2, 0, 0));
  assert.equal(r.to, at(9, 0, 0));
  assert.equal(weekRange(undefined, NOW).label, '2026-W45');
  assert.equal(shiftWeek('2026-W45', -1), '2026-W44');
  assert.equal(shiftWeek('2026-W01', -1), '2025-W52');
  assert.equal(shiftWeek('2026-W53', 1), '2027-W01');

  assert.throws(() => weekRange('tuan-45'), /dạng 2026-W45/);
  assert.throws(() => weekRange('2026-W00'), /từ 1 đến 53/);
  assert.throws(() => weekRange('2025-W53'), /không có tuần 53/);
});

test('báo cáo gom đúng theo team và người, chỉ tính việc kết thúc trong tuần', () => {
  const store = openDb(':memory:');
  finishedTask(store, { team: 'backend', member: 'An' });
  finishedTask(store, { team: 'backend', member: 'An', revisions: 1 });
  finishedTask(store, { team: 'backend', member: 'Bình', output_tokens: 3000 });
  finishedTask(store, { team: 'frontend', member: 'Cúc', status: 'submitted' });
  finishedTask(store, { team: 'frontend', member: 'Cúc', status: 'failed' });
  finishedTask(store, { team: 'backend', member: 'Minh', kind: 'plan' });
  finishedTask(store, { team: 'quality', member: 'Quân', status: 'stopped' });
  // Ngoài tuần: chủ nhật tuần trước 23:59 và thứ Hai tuần sau 00:00 (biên [from, to)).
  finishedTask(store, { team: 'backend', member: 'An', finished_at: at(2, 0, 0) - 60_000 });
  finishedTask(store, { team: 'backend', member: 'An', finished_at: at(9, 0, 0) });
  // Chưa kết thúc (finished_at rỗng) không được tính.
  store.createTask({ title: 'đang chạy', prompt: 'p', team: 'backend', member: 'An', role: 'backend-dev' });

  const report = weeklyReport(store, { week: '2026-W45', teamNames: { backend: 'Team Backend' } });
  assert.equal(report.total.finished, 7);
  assert.equal(report.total.work_done, 4, '3 backend + 1 submitted của frontend; plan không phải việc làm');
  assert.equal(report.total.work_failed, 1);
  assert.equal(report.total.work_stopped, 1);
  assert.equal(report.total.revisions, 1);
  assert.equal(report.total.output_tokens, 9000, 'sáu lượt 1000 và một lượt 3000');
  assert.equal(report.total.est_cost_usd, 3.5);

  const backend = report.teams.find((t) => t.id === 'backend');
  assert.equal(backend.name, 'Team Backend');
  assert.equal(backend.work_done, 3);
  assert.equal(report.teams.find((t) => t.id === 'frontend').name, 'frontend', 'thiếu tên thì dùng id');
  assert.deepEqual(report.teams.map((t) => t.id), ['backend', 'frontend', 'quality'], 'xếp theo việc xong');

  // Xếp hạng: An 2 việc, Bình 1 việc nhưng nhiều token hơn Cúc (1 việc, submitted).
  assert.deepEqual(report.members.map((m) => m.member), ['An', 'Bình', 'Cúc', 'Minh', 'Quân']);
  const minh = report.members.find((m) => m.member === 'Minh');
  assert.equal(minh.work_done, 0);
  assert.equal(minh.lead_runs, 1);
});

test('so với tuần trước, và tuần trống không sập', () => {
  const store = openDb(':memory:');
  finishedTask(store, { finished_at: at(4) });
  finishedTask(store, { finished_at: at(4) });
  finishedTask(store, { finished_at: at(4) - 7 * 24 * 3600 * 1000 });
  const report = weeklyReport(store, { week: '2026-W45' });
  assert.equal(report.previous.week, '2026-W44');
  assert.equal(report.next_week, '2026-W46');
  assert.equal(report.current_week, isoWeekOf(Date.now()));
  assert.equal(report.previous.work_done, 1);
  assert.equal(report.total.work_done, 2);

  const empty = weeklyReport(store, { week: '2026-W30' });
  assert.equal(empty.total.finished, 0);
  assert.deepEqual(empty.teams, []);
  assert.equal(empty.quota.samples, 0);
  assert.equal(empty.quota.peak_five_hour, null);
  assert.match(reportToMarkdown(empty), /không có việc nào kết thúc/);
  assert.match(reportToMarkdown(empty), /Chưa có dữ liệu hạn mức/);
});

test('việc lớn, yêu cầu và số lần chạm trần', () => {
  const store = openDb(':memory:');
  const j1 = store.createJob({ title: 'a', prompt: 'p', team: 'backend', lead: 'Minh' });
  const j2 = store.createJob({ title: 'b', prompt: 'p', team: 'backend', lead: 'Minh' });
  store.updateJob(j1.id, { status: 'done', finished_at: at(3) });
  store.updateJob(j2.id, { status: 'attention', finished_at: at(5) });
  const e1 = store.createEpic({ title: 'e', prompt: 'p', director: 'Hòa' });
  store.updateEpic(e1.id, { status: 'done', round: 2, finished_at: at(4) });
  const t = finishedTask(store, {});
  store.addEvent(t.id, 'quota', 'Bị chặn');
  store.db.prepare('UPDATE events SET ts = ?').run(at(4));
  store.addEvent(t.id, 'quota', 'Ngoài tuần');
  store.db.prepare('UPDATE events SET ts = ? WHERE summary = ?').run(at(20), 'Ngoài tuần');

  const report = weeklyReport(store, { week: '2026-W45' });
  assert.deepEqual(report.jobs, { finished: 2, by_status: { done: 1, attention: 1 } });
  assert.deepEqual(report.epics, { finished: 1, by_status: { done: 1 }, rework_rounds: 2 });
  assert.equal(report.quota.blocked_events, 1);
});

test('mẫu hạn mức: ghi thưa, nhưng không bỏ sót lúc chạm trần và lúc hết chặn', () => {
  const store = openDb(':memory:');
  const info = (five, seven, over = {}) => ({ status: 'allowed', blocked: false, windows: { five_hour: { utilization: five }, seven_day: { utilization: seven } }, ...over });
  const MIN = 60_000;
  assert.equal(store.recordQuotaSample(info(0.1, 0.2), at(4, 8, 0)), true);
  assert.equal(store.recordQuotaSample(info(0.12, 0.2), at(4, 8, 3)), false, 'dưới 10 phút thì bỏ');
  assert.equal(store.recordQuotaSample(info(0.5, 0.3), at(4, 8, 4) + 11 * MIN), true);
  assert.equal(store.recordQuotaSample(info(1, 0.4, { status: 'rejected', blocked: true }), at(4, 8, 20)), true, 'chạm trần luôn ghi');
  assert.equal(store.recordQuotaSample(info(1, 0.4, { status: 'rejected', blocked: true }), at(4, 8, 21)), false, 'cùng trạng thái chặn thì không ghi lại');
  assert.equal(store.recordQuotaSample(info(0.05, 0.4), at(4, 8, 22)), true, 'hết chặn luôn ghi');

  const report = weeklyReport(store, { week: '2026-W45' });
  assert.equal(report.quota.samples, 4);
  assert.equal(report.quota.peak_five_hour, 1);
  assert.equal(report.quota.peak_seven_day, 0.4);
  assert.equal(report.quota.last_five_hour, 0.05);
  const md = reportToMarkdown(report);
  assert.match(md, /Đỉnh theo 5 giờ: 100%/);
  assert.match(md, /đỉnh theo 7 ngày: 40%/);
});

test('mẫu thiếu cửa sổ (utilization không có) lưu null chứ không phải 0', () => {
  const store = openDb(':memory:');
  store.recordQuotaSample({ status: 'allowed', blocked: false, windows: {} }, at(4));
  const sample = store.quotaSamplesBetween(at(2, 0, 0), at(9, 0, 0))[0];
  assert.equal(sample.five_hour, null);
  assert.equal(sample.seven_day, null);
  assert.equal(weeklyReport(store, { week: '2026-W45' }).quota.peak_five_hour, null);
});

test('Markdown có đủ các mục và ghi chú giá API không phải tiền bạn trả', () => {
  const store = openDb(':memory:');
  finishedTask(store, { team: 'backend', member: 'An' });
  finishedTask(store, { team: 'backend', member: 'An' });
  const md = reportToMarkdown(weeklyReport(store, { week: '2026-W45', teamNames: { backend: 'Team Backend' } }));
  assert.match(md, /^# Báo cáo tuần 2026-W45/);
  for (const heading of ['## Tổng quan', '## Hạn mức Pro', '## Theo team', '## Ai làm nhiều nhất']) assert.ok(md.includes(heading), heading);
  assert.match(md, /\| Team Backend \| 2 \|/);
  assert.match(md, /\| 1 \| An \| Team Backend \| 2 \|/);
  assert.match(md, /bạn dùng gói Pro nên không bị tính/);
});

test('cơ sở dữ liệu cũ (chưa có bảng hạn mức, lịch) nâng cấp được và báo cáo chạy', () => {
  const root = tmpDir();
  try {
    const file = `${root}/old.db`;
    const old = new DatabaseSync(file);
    old.exec("CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, prompt TEXT NOT NULL, acceptance TEXT NOT NULL DEFAULT '', team TEXT NOT NULL, member TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, model TEXT, effort TEXT, session_id TEXT, worktree TEXT, branch TEXT, base_commit TEXT, attempts INTEGER NOT NULL DEFAULT 0, result TEXT, error TEXT, changed_files TEXT, turns INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, cache_read_tokens INTEGER NOT NULL DEFAULT 0, cache_creation_tokens INTEGER NOT NULL DEFAULT 0, est_cost_usd REAL NOT NULL DEFAULT 0, resume_at INTEGER, created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER)");
    old.exec(`INSERT INTO tasks (title, prompt, team, member, role, status, created_at, finished_at) VALUES ('cũ', 'p', 'backend', 'An', 'backend-dev', 'done', 1, ${NOW})`);
    old.close();
    const store = openDb(file);
    assert.equal(weeklyReport(store, { week: '2026-W45' }).total.work_done, 1, 'việc cũ vẫn đọc được sau khi nâng cấp');
    assert.equal(store.listSchedules().length, 0);
    store.close();
  } finally {
    removeDir(root);
  }
});

test('API /api/report: JSON, Markdown tải về, và tuần sai bị từ chối', async () => {
  const root = tmpDir();
  const { project, local } = makeProject(root);
  const cfg = { ...testConfig(root, project, local), clock: () => NOW };
  const app = await startServer({ cfg, withUi: false, log: () => {} });
  try {
    const get = (url) => fetch(`http://127.0.0.1:${app.port}${url}`, { headers: { host: `localhost:${app.port}` } });
    const task = finishedTask(app.store, { team: 'backend', member: 'An' });
    assert.ok(task.id);

    const json = await (await get('/api/report')).json();
    assert.equal(json.report.week, '2026-W45', 'mặc định là tuần chứa "bây giờ"');
    assert.equal(json.report.total.work_done, 1);
    assert.equal(json.report.teams[0].name, 'Team Backend');

    const md = await get('/api/report?week=2026-W45&format=md');
    assert.equal(md.status, 200);
    assert.match(md.headers.get('content-type'), /text\/markdown/);
    assert.match(md.headers.get('content-disposition'), /bao-cao-2026-W45\.md/);
    assert.match(await md.text(), /# Báo cáo tuần 2026-W45/);

    const bad = await get('/api/report?week=abc');
    assert.equal(bad.status, 400);
  } finally {
    await app.close();
    removeDir(root);
  }
});
