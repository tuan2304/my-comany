import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ensureDirs } from '../server/config.mjs';
import { openDb } from '../server/db.mjs';
import { loadProject } from '../server/project.mjs';
import { buildAnswerArgs, buildClaudeArgs, buildSystemPrompt, Runner } from '../server/runner.mjs';
import { findMember, loadTeams } from '../server/teams.mjs';
import { MAX_ROUNDS, MAX_TEXT } from '../server/questions.mjs';
import { startServer } from '../server/index.mjs';
import { REPO, git, makeProject, removeDir, testConfig, tmpDir, waitFor } from './helpers.mjs';

// Giai đoạn 6D: nhân viên hỏi nhau. Các bài kiểm thử nhắm vào chỗ dễ lỗi: đua nhau (trả lời đến trước/sau lúc người hỏi kết thúc),
// dừng giữa chừng, khởi động lại, hạn mức, giới hạn, và việc lớn không được coi là xong khi con còn chờ.

const FAKE_KEYS = [
  'FAKE_CLAUDE_LOG', 'FAKE_CLAUDE_SCENARIO', 'FAKE_CLAUDE_RESET_IN', 'FAKE_PLAN', 'FAKE_REVIEW', 'FAKE_UNIQUE', 'FAKE_WORK_DELAY_MS',
  'FAKE_ASK', 'FAKE_ASK_MAP', 'FAKE_ASK_KEEP_WORKING', 'FAKE_ASK_LINGER_MS', 'FAKE_ASK_RESULT', 'FAKE_ANSWER', 'FAKE_ANSWER_MODE', 'FAKE_ANSWER_DELAY_MS',
];

async function boot(env = {}, overrides = {}) {
  const root = tmpDir();
  const { project, local } = makeProject(root);
  const cfg = testConfig(root, project, local, overrides);
  const logFile = path.join(root, 'fake.log');
  Object.assign(process.env, { FAKE_CLAUDE_LOG: logFile, ...env });
  const app = await startServer({ cfg, withUi: false, log: () => {} });
  const calls = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  const cleanup = async () => {
    await app.close();
    for (const key of FAKE_KEYS) delete process.env[key];
    removeDir(root);
  };
  return { root, project, local, cfg, app, runner: app.runner, store: app.store, calls, cleanup };
}

const flag = (call, name) => call.args[call.args.indexOf(name) + 1];
const askLead = (question = 'Dùng cách A hay B?') => [{ tool: 'ask_lead', input: { question } }];
const submitWork = (ctx, member = 'An', over = {}) => ctx.runner.submit({ title: `Việc của ${member}`, prompt: 'Làm giúp tôi', member, level: 'normal', ...over });
const status = (ctx, id) => ctx.store.getTask(id).status;
const answersOf = (ctx) => ctx.store.listTasks(100).filter((t) => t.kind === 'answer');

test('hỏi Trưởng nhóm: chờ trả lời, không nộp bài sớm, rồi làm tiếp bằng --resume kèm câu trả lời', async () => {
  const ctx = await boot({ FAKE_ASK: JSON.stringify(askLead('Dùng cách A hay B?')), FAKE_ANSWER: 'Hãy dùng cách B.', FAKE_ANSWER_DELAY_MS: '500' });
  try {
    const t = await submitWork(ctx);
    await waitFor(() => status(ctx, t.id) === 'waiting_answer', { label: 'chờ trả lời' });

    // Đang chờ: chưa xong, chưa commit, vẫn chiếm chỗ trong tải của người đó.
    const waiting = ctx.store.getTask(t.id);
    assert.equal(waiting.finished_at, null);
    assert.equal(waiting.changed_files, null);
    assert.equal(git(ctx.project, 'rev-list', '--count', `main..${waiting.branch}`), '0', 'chưa commit gì khi còn chờ');
    assert.ok(ctx.store.openLoad('An').some((x) => x.id === t.id), 'việc chờ vẫn tính vào tải');
    const [q] = ctx.store.questionsOf(t.id);
    assert.equal(q.target, 'Minh');
    assert.equal(q.status, 'open');
    assert.equal(answersOf(ctx).length, 1);
    assert.equal(answersOf(ctx)[0].member, 'Minh');

    const done = await waitFor(() => status(ctx, t.id) === 'done' && ctx.store.getTask(t.id), { label: 'làm tiếp xong' });
    assert.match(done.result, /Hãy dùng cách B\./, 'câu trả lời đến được người hỏi');
    assert.deepEqual(JSON.parse(done.changed_files), ['hello.txt']);
    assert.equal(git(ctx.project, 'rev-list', '--count', `main..${done.branch}`), '1');
    const q2 = ctx.store.getQuestion(q.id);
    assert.equal(q2.status, 'answered');
    assert.equal(q2.delivered, 1);

    // Dấu vết lệnh gọi: nhân viên có công cụ hỏi; lượt trả lời không có MCP/Bash/Edit, chạy chỉ đọc trong thư mục của người hỏi.
    const calls = ctx.calls();
    const workerFirst = calls.find((c) => c.prompt.startsWith(`# Việc #${t.id}:`));
    assert.match(flag(workerFirst, '--allowedTools'), /mcp__company__ask_lead/);
    assert.ok(workerFirst.args.includes('--mcp-config'));
    const answerCall = calls.find((c) => c.prompt.startsWith('# Trả lời câu hỏi'));
    assert.ok(!answerCall.args.includes('--mcp-config'));
    assert.equal(flag(answerCall, '--tools'), 'Read,Grep,Glob');
    assert.doesNotMatch(flag(answerCall, '--allowedTools'), /Bash|Edit|Write|mcp__/);
    assert.equal(answerCall.guard.mode, 'readonly');
    assert.equal(path.resolve(answerCall.cwd), path.resolve(waiting.worktree));
    const resumed = calls.find((c) => c.resumed && c.prompt.includes('Hãy dùng cách B.'));
    assert.ok(resumed, 'lần làm tiếp dùng --resume và mang câu trả lời');
    assert.equal(flag(resumed, '--resume'), 'fake-session-1234');
  } finally {
    await ctx.cleanup();
  }
});

test('nhân viên không nghe lời (hỏi rồi vẫn làm xong và báo cáo): vẫn phải chờ trả lời, không nộp bài lúc chưa có câu trả lời', async () => {
  const ctx = await boot({ FAKE_ASK: JSON.stringify(askLead()), FAKE_ASK_KEEP_WORKING: '1', FAKE_ANSWER_DELAY_MS: '500' });
  try {
    const t = await submitWork(ctx);
    await waitFor(() => status(ctx, t.id) === 'waiting_answer', { label: 'chờ trả lời' });
    assert.equal(ctx.store.getTask(t.id).finished_at, null);
    await waitFor(() => status(ctx, t.id) === 'done', { label: 'xong sau khi có trả lời' });
  } finally {
    await ctx.cleanup();
  }
});

test('hỏi đồng nghiệp đang bận: lượt trả lời không phải chờ người đó làm xong việc dài của họ', async () => {
  // Hương (việc #1) làm chậm 2,5 giây; An (việc #2) hỏi Hương. Câu trả lời phải xong trước khi việc của Hương xong.
  const ctx = await boot({
    FAKE_WORK_DELAY_MS: '2500',
    FAKE_ASK_MAP: JSON.stringify({ 2: [{ tool: 'ask_colleague', input: { member: 'Hương', question: 'Bạn đặt tên hàng đợi thế nào?' } }] }),
    FAKE_ANSWER: 'Gọi là jobs.',
  }, { maxConcurrent: 3 });
  try {
    const huong = await submitWork(ctx, 'Hương');
    await waitFor(() => status(ctx, huong.id) === 'running', { label: 'Hương đang làm' });
    const an = await submitWork(ctx, 'An');
    const answer = await waitFor(() => answersOf(ctx).find((a) => a.status === 'done'), { label: 'Hương trả lời' });
    assert.equal(answer.member, 'Hương');
    assert.equal(status(ctx, huong.id), 'running', 'Hương vẫn đang làm việc dài khi câu trả lời đã xong');
    await waitFor(() => status(ctx, an.id) === 'done' && status(ctx, huong.id) === 'done', { timeout: 20000, label: 'cả hai xong' });
    assert.match(ctx.store.getTask(an.id).result, /Gọi là jobs\./);
  } finally {
    await ctx.cleanup();
  }
});

test('họp ngắn: cả nhóm cùng trả lời, người hỏi chỉ chạy lại khi ĐỦ mọi câu trả lời, và họp chỉ tính một lần hỏi', async () => {
  const ctx = await boot({
    FAKE_ASK: JSON.stringify([{ tool: 'call_meeting', input: { question: 'Đổi quy ước đặt tên được không?' } }]),
    FAKE_ANSWER: 'Được.',
    FAKE_ANSWER_DELAY_MS: '300',
  }, { maxConcurrent: 4 });
  try {
    const t = await submitWork(ctx, 'An');
    await waitFor(() => status(ctx, t.id) === 'waiting_answer');
    const rows = ctx.store.questionsOf(t.id);
    assert.equal(rows.length, 3, 'Trưởng nhóm và hai đồng nghiệp');
    assert.deepEqual(new Set(rows.map((r) => r.round)), new Set([1]), 'một cuộc họp là một lần hỏi');
    assert.equal(rows[0].target, 'Minh', 'Trưởng nhóm đứng đầu danh sách họp');
    assert.ok(rows.every((r) => r.target !== 'An'), 'không tự họp với chính mình');

    const done = await waitFor(() => status(ctx, t.id) === 'done' && ctx.store.getTask(t.id), { label: 'xong' });
    const resumedPrompts = ctx.calls().filter((c) => c.resumed && c.prompt.includes('Lần hỏi 1'));
    assert.equal(resumedPrompts.length, 1, 'chỉ chạy lại một lần, không chạy lại sau từng câu trả lời');
    assert.equal((resumedPrompts[0].prompt.match(/trả lời: Được\./g) ?? []).length, 3, 'đủ ba câu trả lời trong cùng một lời nhắc');
    assert.ok(done.result);
  } finally {
    await ctx.cleanup();
  }
});

test('người trả lời lỗi: người hỏi không bị kẹt, được báo "không trả lời được" và tự quyết', async () => {
  const ctx = await boot({ FAKE_ASK: JSON.stringify(askLead()), FAKE_ANSWER_MODE: 'crash' });
  try {
    const t = await submitWork(ctx);
    const done = await waitFor(() => status(ctx, t.id) === 'done' && ctx.store.getTask(t.id), { label: 'người hỏi vẫn xong' });
    const [q] = ctx.store.questionsOf(t.id);
    assert.equal(q.status, 'failed');
    assert.equal(q.answer, null);
    assert.match(done.result, /không trả lời được/);
  } finally {
    await ctx.cleanup();
  }
});

test('người trả lời không nói gì (kết quả rỗng): coi là thất bại chứ không giao câu trả lời rỗng', async () => {
  const ctx = await boot({ FAKE_ASK: JSON.stringify(askLead()), FAKE_ANSWER_MODE: 'empty' });
  try {
    const t = await submitWork(ctx);
    await waitFor(() => status(ctx, t.id) === 'done');
    assert.equal(ctx.store.questionsOf(t.id)[0].status, 'failed');
  } finally {
    await ctx.cleanup();
  }
});

test('hết hạn mức lúc đang trả lời: cả công ty nghỉ, người hỏi vẫn chờ, hồi lại thì trả lời rồi làm tiếp', async () => {
  const ctx = await boot({ FAKE_ASK: JSON.stringify(askLead()), FAKE_ANSWER_MODE: 'quota_once', FAKE_ANSWER: 'Làm cách B.', FAKE_CLAUDE_RESET_IN: '2' });
  try {
    const t = await submitWork(ctx);
    const paused = await waitFor(() => answersOf(ctx).find((a) => a.status === 'paused_quota'), { label: 'lượt trả lời chạm hạn mức' });
    assert.ok(paused.resume_at > Date.now() - 1000);
    assert.equal(status(ctx, t.id), 'waiting_answer', 'người hỏi vẫn chờ, không bị coi là lỗi');
    assert.equal(ctx.store.questionsOf(t.id)[0].status, 'open');
    await waitFor(() => status(ctx, t.id) === 'done', { timeout: 30000, label: 'xong sau khi hạn mức hồi' });
    assert.match(ctx.store.getTask(t.id).result, /Làm cách B\./);
  } finally {
    await ctx.cleanup();
  }
});

test('dừng việc đang chờ trả lời: hủy câu hỏi, dừng lượt trả lời, người hỏi không tự sống lại khi câu trả lời đến muộn', async () => {
  const ctx = await boot({ FAKE_ASK: JSON.stringify(askLead()), FAKE_ANSWER_DELAY_MS: '1500' });
  try {
    const t = await submitWork(ctx);
    await waitFor(() => status(ctx, t.id) === 'waiting_answer');
    const answer = await waitFor(() => answersOf(ctx).find((a) => a.status === 'running'), { label: 'lượt trả lời đang chạy' });

    assert.equal(ctx.runner.stop(t.id), true);
    assert.equal(status(ctx, t.id), 'stopped');
    await waitFor(() => status(ctx, answer.id) === 'stopped', { label: 'lượt trả lời bị dừng theo' });
    assert.equal(ctx.store.questionsOf(t.id)[0].status, 'failed');

    await new Promise((r) => setTimeout(r, 2200));
    assert.equal(status(ctx, t.id), 'stopped', 'không sống lại');
    assert.equal(ctx.calls().filter((c) => c.resumed).length, 0, 'không có lần làm tiếp nào');
  } finally {
    await ctx.cleanup();
  }
});

test('dừng tất cả (stopAll) cũng dừng việc đang chờ trả lời', async () => {
  const ctx = await boot({ FAKE_ASK: JSON.stringify(askLead()), FAKE_ANSWER_DELAY_MS: '1500' });
  try {
    const t = await submitWork(ctx);
    await waitFor(() => status(ctx, t.id) === 'waiting_answer');
    ctx.runner.stopAll();
    await waitFor(() => status(ctx, t.id) === 'stopped');
    await waitFor(() => answersOf(ctx).every((a) => ['stopped', 'done', 'failed'].includes(a.status)));
    assert.equal(ctx.store.openQuestions().length, 0, 'không còn câu hỏi mở nào bị bỏ quên');
  } finally {
    await ctx.cleanup();
  }
});

test('việc con trong việc lớn chờ trả lời: việc lớn vẫn "đang chạy", chưa duyệt, chưa gộp, và xong bình thường sau đó', async () => {
  const plan = [{ member: 'An', title: 'Việc của An', description: 'Làm phần A', acceptance: 'test chạy qua', files: ['src/a'], level: 'normal' }];
  const ctx = await boot({
    FAKE_PLAN: JSON.stringify(plan),
    FAKE_ASK_MAP: JSON.stringify({ 2: askLead('Phần A cần bảo mật không?') }),
    FAKE_ANSWER: 'Có, cần xác thực.',
    FAKE_ANSWER_DELAY_MS: '800',
  });
  try {
    const job = await ctx.runner.jobs.create({ team: 'backend', title: 'Làm X', prompt: 'Chia việc giúp tôi' });
    await waitFor(() => ctx.store.jobTasks(job.id).some((t) => t.status === 'waiting_answer'), { label: 'việc con chờ trả lời' });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(ctx.store.getJob(job.id).status, 'running');
    assert.ok(!ctx.store.jobTasks(job.id).some((t) => t.kind === 'review'), 'chưa có ai duyệt bài chưa nộp');

    await waitFor(() => ctx.store.getJob(job.id).status === 'done', { timeout: 30000, label: 'việc lớn xong' });
    const work = ctx.store.jobTasks(job.id).find((t) => t.kind === 'work');
    assert.equal(work.status, 'done');
    assert.match(work.result, /Có, cần xác thực\./);
    assert.equal(ctx.store.jobTasks(job.id).filter((t) => t.kind === 'review').length, 1, 'chỉ duyệt một lần, sau khi nộp thật');
  } finally {
    await ctx.cleanup();
  }
});

test('dừng việc lớn khi việc con đang chờ trả lời: không còn gì chạy, không câu hỏi mở', async () => {
  const plan = [{ member: 'An', title: 'Việc của An', description: 'Làm phần A', acceptance: 'x', files: ['src/a'], level: 'normal' }];
  const ctx = await boot({ FAKE_PLAN: JSON.stringify(plan), FAKE_ASK_MAP: JSON.stringify({ 2: askLead() }), FAKE_ANSWER_DELAY_MS: '1500' });
  try {
    const job = await ctx.runner.jobs.create({ team: 'backend', title: 'Làm X', prompt: 'Chia việc' });
    await waitFor(() => ctx.store.jobTasks(job.id).some((t) => t.status === 'waiting_answer'));
    await ctx.runner.jobs.stop(job.id, 'Dừng thử');
    await waitFor(() => ctx.store.jobTasks(job.id).every((t) => ['stopped', 'done', 'failed'].includes(t.status)), { label: 'mọi việc con dừng' });
    assert.equal(ctx.store.openQuestions().length, 0);
    await new Promise((r) => setTimeout(r, 1800));
    assert.equal(ctx.store.getJob(job.id).status, 'stopped');
    assert.equal(ctx.calls().filter((c) => c.resumed).length, 0);
  } finally {
    await ctx.cleanup();
  }
});

test('giới hạn do máy chủ ép: số lần hỏi, độ dài, cùng team, không tự hỏi mình, bí mật bị che', async () => {
  const ctx = await boot();
  try {
    ctx.runner.setManualPause(true); // không để việc nào chạy: chỉ thử luật của công cụ
    const found = findMember(ctx.runner.getTeams(), 'An');
    const t = ctx.runner.createWork({ found, title: 'x', prompt: 'y', level: 'normal' });
    const ask = (input) => ctx.runner.callAgentTool(token, input.tool, input.args);
    const token = 'tok-test';
    ctx.runner.agentRuns.set(token, t.id);
    const ok = await ask({ tool: 'ask_lead', args: { question: 'Câu hỏi sk-ant-abcdefghijklmnopqrstu có khóa' } });
    assert.equal(ok.isError, false);
    assert.doesNotMatch(ctx.store.questionsOf(t.id)[0].text, /sk-ant-abcdefghij/, 'khóa bí mật bị che trước khi sang agent khác');
    assert.doesNotMatch(answersOf(ctx)[0].prompt, /sk-ant-abcdefghij/);

    for (const [name, args, pattern] of [
      ['ask_lead', { question: '   ' }, /Thiếu nội dung/],
      ['ask_lead', { question: 'x'.repeat(MAX_TEXT + 1) }, /tối đa 600/],
      ['ask_colleague', { member: 'Khôi', question: 'DevOps có phải team mình không?' }, /không thuộc team/],
      ['ask_colleague', { member: 'Không-ai', question: 'Ai đó ơi' }, /không thuộc team/],
      ['ask_colleague', { member: 'An', question: 'Tôi hỏi tôi' }, /chính mình/],
      ['ask_colleague', { question: 'Thiếu tên người' }, /không thuộc team/],
    ]) {
      const res = await ask({ tool: name, args });
      assert.equal(res.isError, true, `${name} ${JSON.stringify(args).slice(0, 40)} phải bị từ chối`);
      assert.match(res.text, pattern);
    }
    assert.equal(ctx.store.questionRounds(t.id), 1, 'các câu bị từ chối không tính vào số lần hỏi');

    const second = await ask({ tool: 'ask_colleague', args: { member: 'Bình', question: 'Bình ơi, chỗ này sao?' } });
    assert.equal(second.isError, false);
    const third = await ask({ tool: 'ask_lead', args: { question: 'Lần thứ ba' } });
    assert.equal(third.isError, true);
    assert.match(third.text, new RegExp(`${MAX_ROUNDS}/${MAX_ROUNDS}`));
    assert.equal(ctx.store.questionRounds(t.id), MAX_ROUNDS);
    assert.equal(answersOf(ctx).length, 2, 'câu bị từ chối không sinh lượt trả lời nào');

    // Lượt không phải "làm" (Trưởng nhóm) không dùng được công cụ hỏi; mã thông báo sai thì từ chối.
    const lead = ctx.runner.createLeadTask({ kind: 'plan', job: ctx.store.createJob({ title: 'j', prompt: 'p', team: 'backend', lead: 'Minh' }) });
    ctx.runner.agentRuns.set('tok-lead', lead.id);
    const blocked = await ctx.runner.callAgentTool('tok-lead', 'ask_lead', { question: 'Trưởng nhóm tự hỏi' });
    assert.equal(blocked.isError, true);
    assert.equal(await ctx.runner.callAgentTool('khong-co', 'ask_lead', { question: 'x' }), null);
  } finally {
    await ctx.cleanup();
  }
});

test('khởi động lại: câu trả lời đã xong lúc máy chủ tắt thì người hỏi được đánh thức; câu hỏi chưa trả lời vẫn được trả lời', async () => {
  const root = tmpDir();
  const { project, local } = makeProject(root);
  const cfg = testConfig(root, project, local);
  ensureDirs(cfg);
  const logFile = path.join(root, 'fake.log');
  Object.assign(process.env, { FAKE_CLAUDE_LOG: logFile, FAKE_ANSWER: 'Trả lời sau khởi động.' });
  const store = openDb(path.join(cfg.dataDir, 'company.db'));
  const teams = loadTeams({ teamsDir: path.join(REPO, 'teams') });
  const runner = new Runner({ cfg, store, getTeams: () => teams, getProject: () => loadProject(local) });
  try {
    const an = findMember(teams, 'An');
    // Hai việc cùng đang chờ: #1 có lượt trả lời đã xong (máy chủ tắt trước khi kịp đánh thức), #2 có lượt trả lời còn xếp hàng.
    const mk = (asker) => runner.createWork({ found: findMember(teams, asker), title: `Việc ${asker}`, prompt: 'Làm giúp', level: 'normal' });
    const t1 = mk('An');
    const t2 = mk('Bình');
    for (const t of [t1, t2]) store.updateTask(t.id, { status: 'waiting_answer', session_id: 'fake-session-1234', worktree: root, branch: null });
    const ans1 = runner.questions.createAnswerTask({ asker: store.getTask(t1.id), target: findMember(teams, 'Minh'), text: 'Câu 1', kind: 'lead', count: 1 });
    store.createQuestion({ taskId: t1.id, round: 1, kind: 'lead', asker: 'An', target: 'Minh', text: 'Câu 1', answerTaskId: ans1.id });
    store.updateTask(ans1.id, { status: 'done', result: 'Đã xong từ trước.', finished_at: Date.now() });
    const ans2 = runner.questions.createAnswerTask({ asker: store.getTask(t2.id), target: findMember(teams, 'Minh'), text: 'Câu 2', kind: 'lead', count: 1 });
    store.createQuestion({ taskId: t2.id, round: 1, kind: 'lead', asker: 'Bình', target: 'Minh', text: 'Câu 2', answerTaskId: ans2.id });
    assert.ok(an);

    runner.setManualPause(true);
    runner.start(); // recover(): khớp lại câu hỏi
    assert.equal(store.getQuestion(1).status, 'answered');
    assert.equal(store.getTask(t1.id).status, 'queued', 'việc #1 được đánh thức');
    assert.equal(store.getTask(t2.id).status, 'waiting_answer', 'việc #2 vẫn chờ lượt trả lời còn xếp hàng');
    runner.setManualPause(false);

    await waitFor(() => store.getTask(t1.id).status === 'done' && store.getTask(t2.id).status === 'done', { label: 'cả hai xong' });
    const prompts = JSON.parse(`[${fs.readFileSync(logFile, 'utf8').trim().split('\n').join(',')}]`).map((c) => c.prompt);
    assert.ok(prompts.some((p) => p.includes('Đã xong từ trước.')));
    assert.ok(prompts.some((p) => p.includes('Trả lời sau khởi động.')));
  } finally {
    await runner.shutdown();
    store.close();
    for (const key of FAKE_KEYS) delete process.env[key];
    removeDir(root);
  }
});

test('khởi động lại: câu hỏi mồ côi (không còn lượt trả lời) không làm người hỏi kẹt mãi', async () => {
  const root = tmpDir();
  const { project, local } = makeProject(root);
  const cfg = testConfig(root, project, local);
  ensureDirs(cfg);
  Object.assign(process.env, { FAKE_CLAUDE_LOG: path.join(root, 'fake.log') });
  const store = openDb(path.join(cfg.dataDir, 'company.db'));
  const teams = loadTeams({ teamsDir: path.join(REPO, 'teams') });
  const runner = new Runner({ cfg, store, getTeams: () => teams, getProject: () => loadProject(local) });
  try {
    const t = runner.createWork({ found: findMember(teams, 'An'), title: 'Việc An', prompt: 'Làm', level: 'normal' });
    store.updateTask(t.id, { status: 'waiting_answer', session_id: 'fake-session-1234', worktree: root });
    store.createQuestion({ taskId: t.id, round: 1, kind: 'lead', asker: 'An', target: 'Minh', text: 'Câu hỏi mồ côi', answerTaskId: 9999 });
    runner.setManualPause(true);
    runner.start();
    assert.equal(store.getTask(t.id).status, 'queued');
    assert.equal(store.openQuestions().length, 0);
  } finally {
    await runner.shutdown();
    store.close();
    for (const key of FAKE_KEYS) delete process.env[key];
    removeDir(root);
  }
});

test('cuộc họp có người trả lời xong, người lỗi, người bị dừng: chỉ đánh thức khi mọi câu hỏi đều có kết cục', async () => {
  const ctx = await boot();
  try {
    ctx.runner.setManualPause(true);
    const t = ctx.runner.createWork({ found: findMember(ctx.runner.getTeams(), 'An'), title: 'x', prompt: 'y', level: 'normal' });
    ctx.store.updateTask(t.id, { status: 'waiting_answer', session_id: 'fake-session-1234' });
    ctx.runner.agentRuns.set('tok', t.id);
    // ask() kiểm kind === 'work' chứ không kiểm trạng thái, nên gọi trực tiếp được khi việc đang chờ.
    ctx.runner.questions.ask(ctx.store.getTask(t.id), { kind: 'meeting', question: 'Họp nhé' });
    const answers = answersOf(ctx).sort((a, b) => a.id - b.id);
    assert.equal(answers.length, 3);

    const finish = (task, fields) => {
      ctx.store.updateTask(task.id, fields);
      ctx.runner.questions.afterAnswerEnds(ctx.store.getTask(task.id));
    };
    finish(answers[0], { status: 'done', result: 'Đồng ý.' });
    assert.equal(status(ctx, t.id), 'waiting_answer', 'còn 2 câu chưa có kết cục');
    finish(answers[1], { status: 'failed', error: 'lỗi' });
    assert.equal(status(ctx, t.id), 'waiting_answer');
    finish(answers[2], { status: 'stopped' });
    assert.equal(status(ctx, t.id), 'queued', 'đủ kết cục thì xếp hàng làm tiếp');

    // Gọi lại kết cục lần nữa (sự kiện đến trùng) không làm gì sai.
    ctx.runner.questions.afterAnswerEnds(ctx.store.getTask(answers[0].id));
    ctx.runner.questions.wake(t.id);
    assert.equal(status(ctx, t.id), 'queued');

    const prompt = ctx.runner.questions.deliveryPrompt(t.id);
    assert.match(prompt, /Minh trả lời: Đồng ý\./);
    assert.equal((prompt.match(/không trả lời được/g) ?? []).length, 2);
    assert.equal(ctx.runner.questions.deliveryPrompt(t.id), null, 'chỉ giao một lần');
  } finally {
    await ctx.cleanup();
  }
});

test('tham số lệnh: chỉ khi có cấu hình MCP nhân viên mới có công cụ hỏi; lời nhắc hệ thống khớp', async () => {
  const teams = loadTeams({ teamsDir: path.join(REPO, 'teams') });
  const found = findMember(teams, 'An');
  const task = { id: 1, session_id: null };
  const without = buildClaudeArgs({ task, role: found.role, project: null, systemFile: 's.md', resume: false });
  assert.ok(!without.includes('--mcp-config'));
  assert.doesNotMatch(without.join(' '), /mcp__company/);
  const withMcp = buildClaudeArgs({
    task, role: found.role, project: null, systemFile: 's.md', resume: false, mcpConfigFile: 'mcp.json', mcpTools: ['ask_lead', 'ask_colleague', 'call_meeting'],
  });
  assert.equal(flag({ args: withMcp }, '--mcp-config'), 'mcp.json');
  assert.match(flag({ args: withMcp }, '--allowedTools'), /mcp__company__ask_lead,mcp__company__ask_colleague,mcp__company__call_meeting/);
  assert.ok(withMcp.includes('--strict-mcp-config'));
  assert.match(flag({ args: withMcp }, '--disallowedTools'), /git push/, 'vẫn cấm git push');

  const base = { member: found.member, team: found.team, role: found.role, project: null };
  assert.match(buildSystemPrompt({ ...base, canAsk: true }), /ask_lead/);
  assert.doesNotMatch(buildSystemPrompt({ ...base, canAsk: false }), /ask_lead/);
  assert.match(buildSystemPrompt({ ...base, canAsk: false }), /Không có người trực tiếp để hỏi/);

  const answerArgs = buildAnswerArgs({ model: 'haiku', effort: 'low', maxTurns: 8, systemFile: 's.md', settingsFile: 'x.json', session: null });
  assert.doesNotMatch(flag({ args: answerArgs }, '--allowedTools'), /Bash|Edit|Write|mcp/);
  assert.equal(flag({ args: answerArgs }, '--tools'), 'Read,Grep,Glob');
  assert.ok(!answerArgs.includes('--mcp-config'));
  assert.ok(answerArgs.includes('--strict-mcp-config'));
});

test('lượt trả lời không qua việc lớn: không làm việc lớn tưởng có việc con mới, và không lẫn vào tải làm việc', async () => {
  const ctx = await boot({ FAKE_ASK: JSON.stringify(askLead()), FAKE_ANSWER_DELAY_MS: '300' });
  try {
    const t = await submitWork(ctx);
    const answer = await waitFor(() => answersOf(ctx)[0]);
    assert.equal(answer.job_id, null);
    assert.equal(answer.epic_id, null);
    assert.equal(answer.subject_id, t.id);
    assert.equal(ctx.store.openLoad('Minh').length, 0, 'lượt trả lời không chiếm chỗ làm việc của người được hỏi');
    await waitFor(() => status(ctx, t.id) === 'done');
  } finally {
    await ctx.cleanup();
  }
});

test('câu trả lời đến TRƯỚC khi người hỏi kết thúc lượt: không bị bỏ sót, không chờ vô ích', async () => {
  // Người hỏi ở lại 1,5 giây sau khi hỏi; lượt trả lời xong ngay trong lúc đó.
  const ctx = await boot({ FAKE_ASK: JSON.stringify(askLead()), FAKE_ASK_LINGER_MS: '1500', FAKE_ANSWER: 'Đến sớm.' });
  try {
    const t = await submitWork(ctx);
    await waitFor(() => answersOf(ctx).some((a) => a.status === 'done'), { label: 'câu trả lời xong sớm' });
    assert.equal(status(ctx, t.id), 'running', 'người hỏi vẫn đang chạy lúc câu trả lời đến');
    const done = await waitFor(() => status(ctx, t.id) === 'done' && ctx.store.getTask(t.id), { timeout: 20000, label: 'xong' });
    assert.match(done.result, /Đến sớm\./);
    assert.equal(ctx.store.getTask(t.id).attempts, 2, 'chạy đúng hai lượt (hỏi, rồi làm tiếp)');
  } finally {
    await ctx.cleanup();
  }
});

test('người trả lời treo: hết thời gian thì bị dừng, người hỏi không kẹt mãi', async () => {
  const ctx = await boot({ FAKE_ASK: JSON.stringify(askLead()), FAKE_ANSWER_MODE: 'hang' }, { answerTimeoutMinutes: 0.04 });
  try {
    const t = await submitWork(ctx);
    const answer = await waitFor(() => answersOf(ctx).find((a) => a.status === 'failed'), { timeout: 20000, label: 'lượt trả lời quá hạn' });
    assert.match(answer.error, /Quá thời gian/);
    await waitFor(() => status(ctx, t.id) === 'done', { timeout: 20000, label: 'người hỏi tự quyết và xong' });
    assert.equal(ctx.store.questionsOf(t.id)[0].status, 'failed');
  } finally {
    await ctx.cleanup();
  }
});

test('người hỏi hết số lượt ngay sau khi hỏi: vẫn chờ trả lời chứ không bị coi là lỗi hay bị nâng bậc model', async () => {
  const ctx = await boot({ FAKE_ASK: JSON.stringify(askLead()), FAKE_ASK_RESULT: 'max_turns', FAKE_ANSWER_DELAY_MS: '400' });
  try {
    const t = await submitWork(ctx);
    await waitFor(() => status(ctx, t.id) === 'waiting_answer', { label: 'chờ trả lời' });
    assert.equal(ctx.store.getTask(t.id).escalations, 0);
    await waitFor(() => status(ctx, t.id) === 'done', { label: 'xong sau khi có trả lời' });
  } finally {
    await ctx.cleanup();
  }
});

test('mã thông báo của nhân viên: chỉ dùng được công cụ hỏi, hết hiệu lực khi lượt kết thúc', async () => {
  const ctx = await boot({ FAKE_ASK: JSON.stringify(askLead()), FAKE_ANSWER_DELAY_MS: '400' });
  try {
    const t = await submitWork(ctx);
    await waitFor(() => status(ctx, t.id) === 'waiting_answer');
    const mcp = JSON.parse(fs.readFileSync(path.join(ctx.cfg.dataDir, 'runs', String(t.id), 'mcp.json'), 'utf8')).mcpServers.company;
    const { COMPANY_API_URL: api, COMPANY_RUN_TOKEN: token } = mcp.env;
    assert.ok(api.startsWith('http://127.0.0.1:'), 'cầu nối chỉ nói chuyện qua loopback');
    // Lượt chạy đầu đã kết thúc (đang chờ trả lời): mã thông báo cũ không còn dùng được.
    const post = (body, tk) => fetch(`${api}/api/agent/call`, {
      method: 'POST', headers: { authorization: `Bearer ${tk}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal((await post({ name: 'ask_lead', arguments: { question: 'Lén hỏi thêm' } }, token)).status, 401);
    assert.equal(ctx.store.questionRounds(t.id), 1);
    await waitFor(() => status(ctx, t.id) === 'done');
    assert.equal((await post({ name: 'ask_lead', arguments: { question: 'Hỏi sau khi xong' } }, token)).status, 401);

    // Trong lượt đang chạy: danh sách công cụ chỉ có công cụ hỏi, và công cụ của Trưởng nhóm/Giám đốc bị từ chối.
    ctx.runner.setManualPause(true);
    const found = findMember(ctx.runner.getTeams(), 'Bình');
    const w = ctx.runner.createWork({ found, title: 'x', prompt: 'y', level: 'normal' });
    ctx.runner.agentRuns.set('tok-live', w.id);
    const tools = await (await fetch(`${api}/api/agent/tools`, { headers: { authorization: 'Bearer tok-live' } })).json();
    assert.deepEqual(tools.tools.map((x) => x.name).sort(), ['ask_colleague', 'ask_lead', 'call_meeting']);
    for (const name of ['assign_to_member', 'review_submission', 'finish_epic', 'create_team_job', 'set_contract', 'get_team_workload']) {
      const res = await (await post({ name, arguments: {} }, 'tok-live')).json();
      assert.equal(res.isError, true, `${name} không được dùng bởi nhân viên`);
      assert.match(res.text, /không dùng được/);
    }
  } finally {
    await ctx.cleanup();
  }
});

test('nhật ký: câu hỏi và trả lời hiện trong dòng thời gian của công ty, không lộ JSON công cụ thô', async () => {
  const ctx = await boot({ FAKE_ASK: JSON.stringify(askLead('Chọn A hay B?')), FAKE_ANSWER: 'Chọn B.', FAKE_ANSWER_DELAY_MS: '300' });
  try {
    const t = await submitWork(ctx);
    await waitFor(() => status(ctx, t.id) === 'done');
    const res = await fetch(`${ctx.runner.apiUrl}/api/feed?limit=50`);
    const { events } = await res.json();
    const kinds = events.map((e) => e.kind);
    assert.ok(kinds.includes('question') && kinds.includes('answer'));
    assert.ok(events.some((e) => e.kind === 'question' && /Chọn A hay B\?/.test(e.summary)));
    assert.ok(events.some((e) => e.kind === 'answer' && /Chọn B\./.test(e.summary)));
    assert.ok(!events.some((e) => e.kind === 'tool' && /mcp__company__ask/.test(e.summary)), 'lệnh gọi công cụ hỏi không lặp lại trong nhật ký');
  } finally {
    await ctx.cleanup();
  }
});
