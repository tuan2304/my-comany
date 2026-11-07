import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { startServer } from '../server/index.mjs';
import { OWNER_NAME } from '../server/questions.mjs';
import { makeProject, removeDir, testConfig, tmpDir, waitFor } from './helpers.mjs';

// Nhân viên hỏi chính chủ công ty (ask_owner): hỏi không chờ, câu hỏi nằm chờ người thật, trả lời/bỏ qua đều đưa nhân viên làm tiếp.

const FAKE_KEYS = ['FAKE_CLAUDE_LOG', 'FAKE_CLAUDE_SCENARIO', 'FAKE_ASK', 'FAKE_ASK_LINGER_MS', 'FAKE_ANSWER'];

async function boot(env = {}) {
  const root = tmpDir();
  const { project, local } = makeProject(root);
  const cfg = testConfig(root, project, local);
  const logFile = path.join(root, 'fake.log');
  Object.assign(process.env, { FAKE_CLAUDE_LOG: logFile, ...env });
  const app = await startServer({ cfg, withUi: false, log: () => {} });
  const calls = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  const cleanup = async () => {
    await app.close();
    for (const key of FAKE_KEYS) delete process.env[key];
    removeDir(root);
  };
  return { root, project, cfg, app, runner: app.runner, store: app.store, calls, cleanup };
}

const ask = (question, options) => [{ tool: 'ask_owner', input: options ? { question, options } : { question } }];
const submit = (ctx, over = {}) => ctx.runner.submit({ title: 'Việc của An', prompt: 'Làm giúp tôi', member: 'An', level: 'normal', ...over });
const waitingForOwner = (ctx, id) => waitFor(() => {
  const t = ctx.store.getTask(id);
  return t.status === 'waiting_answer' && t.ask_owner_id !== null && t;
}, { label: 'việc chờ chủ trả lời' });

function request(port, { method = 'GET', path: urlPath, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { /* không phải JSON */ }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}
const post = (ctx, urlPath, body, extra = {}) => request(ctx.app.port, {
  method: 'POST', path: urlPath, body: JSON.stringify(body), headers: { host: `localhost:${ctx.app.port}`, 'content-type': 'application/json', ...extra },
});
const get = (ctx, urlPath) => request(ctx.app.port, { path: urlPath, headers: { host: `localhost:${ctx.app.port}` } });

test('hỏi chủ: việc chờ, hiện câu hỏi kèm phương án; chọn phương án thì nhân viên làm tiếp (--resume) cùng câu trả lời', async () => {
  const ctx = await boot({ FAKE_ASK: JSON.stringify(ask('Dùng cách A hay B?', ['Cách A', 'Cách B', '  ', 'Cách C', 'Cách D', 'Cách E'])) });
  try {
    const t = await submit(ctx);
    const waiting = await waitingForOwner(ctx, t.id);
    assert.equal(ctx.store.getTask(t.id).finished_at, null);
    const [q] = ctx.store.questionsOf(t.id);
    assert.equal(q.kind, 'owner');
    assert.equal(q.target, OWNER_NAME);
    assert.equal(q.status, 'open');
    assert.equal(q.answer_task_id, null, 'chủ là người thật nên không có lượt trả lời tự động');
    assert.equal(waiting.ask_owner_id, q.id);
    assert.equal(ctx.store.listTasks(100).filter((x) => x.kind === 'answer').length, 0);

    const view = await get(ctx, `/api/questions/${q.id}`);
    assert.equal(view.status, 200);
    assert.deepEqual(view.json.question.options, ['Cách A', 'Cách B', 'Cách C', 'Cách D'], 'bỏ phương án trống, tối đa 4');
    assert.equal(view.json.question.text, 'Dùng cách A hay B?');
    assert.equal(view.json.task.member, 'An');

    // Chờ một lúc: không ai trả lời thì việc cứ chờ (không tự thoát, không tự quyết).
    await new Promise((r) => setTimeout(r, 600));
    assert.equal(ctx.store.getTask(t.id).status, 'waiting_answer');

    const reply = await post(ctx, `/api/questions/${q.id}/answer`, { answer: 'Cách B' });
    assert.equal(reply.status, 200);
    const done = await waitFor(() => ctx.store.getTask(t.id).status === 'done' && ctx.store.getTask(t.id), { label: 'làm tiếp xong' });
    assert.equal(done.ask_owner_id, null);
    assert.match(done.result, /Chủ công ty trả lời: Cách B/, 'câu trả lời của chủ đến được nhân viên');
    const q2 = ctx.store.getQuestion(q.id);
    assert.equal(q2.status, 'answered');
    assert.equal(q2.delivered, 1);

    const second = ctx.calls().find((c) => c.resumed && c.prompt.includes('Cách B'));
    assert.ok(second, 'lượt làm tiếp dùng --resume và mang câu trả lời');
    const first = ctx.calls()[0];
    assert.match(first.args[first.args.indexOf('--allowedTools') + 1], /mcp__company__ask_owner/, 'nhân viên có công cụ ask_owner');
    assert.ok(ctx.store.listEvents(t.id).some((e) => e.kind === 'answer' && /Chủ công ty trả lời: Cách B/.test(e.summary)));
  } finally {
    await ctx.cleanup();
  }
});

test('"Để nhân viên tự quyết": nhân viên được báo không có câu trả lời và vẫn làm tiếp tới khi xong', async () => {
  const ctx = await boot({ FAKE_ASK: JSON.stringify(ask('Có nên đổi tên bảng không?')) });
  try {
    const t = await submit(ctx);
    await waitingForOwner(ctx, t.id);
    const [q] = ctx.store.questionsOf(t.id);
    const reply = await post(ctx, `/api/questions/${q.id}/answer`, { decline: true });
    assert.equal(reply.status, 200);
    const done = await waitFor(() => ctx.store.getTask(t.id).status === 'done' && ctx.store.getTask(t.id), { label: 'làm tiếp xong' });
    assert.equal(done.ask_owner_id, null);
    assert.equal(ctx.store.getQuestion(q.id).status, 'failed');
    assert.match(done.result, /Chủ công ty: không trả lời được/);
  } finally {
    await ctx.cleanup();
  }
});

test('chủ trả lời khi nhân viên còn đang kết thúc lượt: không kẹt ở "chờ", việc vẫn làm tiếp', async () => {
  const ctx = await boot({ FAKE_ASK: JSON.stringify(ask('Chọn A hay B?')), FAKE_ASK_LINGER_MS: '700' });
  try {
    const t = await submit(ctx);
    const q = await waitFor(() => ctx.store.questionsOf(t.id)[0], { label: 'câu hỏi được ghi' });
    assert.equal(ctx.store.getTask(t.id).status, 'running', 'nhân viên chưa kết thúc lượt');
    assert.equal((await post(ctx, `/api/questions/${q.id}/answer`, { answer: 'Chọn A' })).status, 200);
    const done = await waitFor(() => ctx.store.getTask(t.id).status === 'done' && ctx.store.getTask(t.id), { label: 'làm tiếp xong' });
    assert.match(done.result, /Chọn A/);
    assert.equal(done.ask_owner_id, null);
  } finally {
    await ctx.cleanup();
  }
});

test('giới hạn: chỉ hỏi chủ một lần mỗi việc, câu hỏi dài bị từ chối, bí mật bị che trong câu hỏi và phương án', async () => {
  const twice = [
    { tool: 'ask_owner', input: { question: 'Lần một: khóa sk-ant-abcdefghijklmnop dùng được không?', options: ['Dùng sk-ant-zzzzzzzzzzzzzzzz', 'x'.repeat(300)] } },
    { tool: 'ask_owner', input: { question: 'Lần hai' } },
  ];
  const ctx = await boot({ FAKE_ASK: JSON.stringify(twice) });
  try {
    const t = await submit(ctx);
    const waiting = await waitingForOwner(ctx, t.id);
    const rows = ctx.store.questionsOf(t.id);
    assert.equal(rows.length, 1, 'lần hỏi thứ hai bị từ chối');
    assert.doesNotMatch(rows[0].text, /sk-ant-abcdefghijklmnop/);
    const options = JSON.parse(rows[0].options);
    assert.doesNotMatch(options[0], /sk-ant-zzzz/);
    assert.ok(options[1].length <= 120, 'phương án quá dài bị cắt');
    assert.ok(waiting.ask_owner_id);
    assert.ok(ctx.store.listEvents(t.id).some((e) => e.kind === 'tool_error' && /đã hỏi chủ công ty một lần/.test(e.summary)));
  } finally {
    await ctx.cleanup();
  }

  const long = await boot({ FAKE_ASK: JSON.stringify(ask('x'.repeat(601))) });
  try {
    const t = await submit(long);
    await waitFor(() => long.store.getTask(t.id).status === 'done', { label: 'việc xong không cần hỏi' });
    assert.equal(long.store.questionsOf(t.id).length, 0);
  } finally {
    await long.cleanup();
  }
});

test('API trả lời: chặn trang lạ, từ chối câu trả lời rỗng/quá dài, câu hỏi không phải của chủ, câu hỏi đã có kết cục', async () => {
  const ctx = await boot({ FAKE_ASK: JSON.stringify(ask('Chọn gì?')) });
  try {
    const t = await submit(ctx);
    await waitingForOwner(ctx, t.id);
    const [q] = ctx.store.questionsOf(t.id);
    const url = `/api/questions/${q.id}/answer`;

    assert.equal((await post(ctx, url, { answer: 'A' }, { origin: 'https://evil.example.com' })).status, 403, 'trang web lạ không được trả lời thay chủ');
    assert.equal((await post(ctx, url, { answer: '   ' })).status, 400);
    const tooLong = await post(ctx, url, { answer: 'y'.repeat(2001) });
    assert.equal(tooLong.status, 400);
    assert.match(tooLong.json.error, /tối đa/);
    assert.equal((await get(ctx, '/api/questions/99999')).status, 404);
    assert.equal(ctx.store.getQuestion(q.id).status, 'open', 'các lần bị từ chối không đổi gì');
    assert.equal(ctx.store.getTask(t.id).status, 'waiting_answer');

    assert.equal((await post(ctx, url, { answer: 'Chọn A' })).status, 200);
    const again = await post(ctx, url, { answer: 'Chọn B' });
    assert.equal(again.status, 400, 'bấm lần hai (hoặc hai thiết bị cùng trả lời) thì lần sau bị từ chối');
    assert.match(again.json.error, /đã có kết cục/);
    await waitFor(() => ctx.store.getTask(t.id).status === 'done', { label: 'việc xong' });
    assert.match(ctx.store.getTask(t.id).result, /Chọn A/);
    assert.doesNotMatch(ctx.store.getTask(t.id).result, /Chọn B/);
  } finally {
    await ctx.cleanup();
  }

  // Câu hỏi gửi cho Trưởng nhóm không phải của chủ: không trả lời được qua API này.
  const lead = await boot({ FAKE_ASK: JSON.stringify([{ tool: 'ask_lead', input: { question: 'Hỏi Trưởng nhóm' } }]), FAKE_ANSWER: 'Dùng B.' });
  try {
    const t = await submit(lead);
    const q = await waitFor(() => lead.store.questionsOf(t.id)[0], { label: 'câu hỏi' });
    assert.equal((await post(lead, `/api/questions/${q.id}/answer`, { answer: 'Tôi trả lời thay' })).status, 404);
  } finally {
    await lead.cleanup();
  }
});

test('dừng việc đang chờ chủ: câu hỏi đóng lại, không còn đòi chủ trả lời, trả lời muộn bị từ chối', async () => {
  const ctx = await boot({ FAKE_ASK: JSON.stringify(ask('Chọn gì?')) });
  try {
    const t = await submit(ctx);
    await waitingForOwner(ctx, t.id);
    const [q] = ctx.store.questionsOf(t.id);
    assert.ok(ctx.runner.stop(t.id));
    await waitFor(() => ctx.store.getQuestion(q.id).status === 'failed', { label: 'câu hỏi đóng' });
    assert.equal(ctx.store.getTask(t.id).status, 'stopped');
    assert.equal(ctx.store.getTask(t.id).ask_owner_id, null);
    assert.equal((await post(ctx, `/api/questions/${q.id}/answer`, { answer: 'Muộn rồi' })).status, 400);
  } finally {
    await ctx.cleanup();
  }
});

test('khởi động lại máy chủ: câu hỏi cho chủ vẫn mở và việc vẫn chờ (không bị coi là thất bại như câu hỏi giữa nhân viên)', async () => {
  const ctx = await boot();
  try {
    const task = ctx.store.createTask({ title: 'Đang chờ chủ', prompt: 'p', team: 'backend', member: 'An', role: 'dev' });
    const q = ctx.store.createQuestion({ taskId: task.id, round: 1, kind: 'owner', asker: 'An', target: OWNER_NAME, text: 'Chọn gì?' });
    ctx.store.updateTask(task.id, { status: 'waiting_answer', ask_owner_id: q.id });
    ctx.runner.questions.reconcile();
    assert.equal(ctx.store.getQuestion(q.id).status, 'open');
    assert.equal(ctx.store.getTask(task.id).status, 'waiting_answer');
    assert.equal(ctx.store.getTask(task.id).ask_owner_id, q.id);
    // Chủ trả lời sau khi khởi động lại thì việc được xếp hàng lại.
    ctx.runner.questions.answerOwner(q.id, { answer: 'Chọn A' });
    // Được xếp hàng và chạy ngay (có chỗ trống), nên có thể đã sang "đang chạy".
    assert.ok(['queued', 'running'].includes(ctx.store.getTask(task.id).status));
    assert.equal(ctx.store.getTask(task.id).ask_owner_id, null);
  } finally {
    await ctx.cleanup();
  }
});
