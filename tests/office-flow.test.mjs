import assert from 'node:assert/strict';
import test from 'node:test';
import { CABINET, diffFlows, MAX_FLOWS_PER_DIFF, OWNER } from '../src/office/flow.ts';
import { newKeys, titleFor } from '../src/lib/notify.ts';
import { activityOfTool, bubbleOf, describeTool, FAILED_VISIBLE_MS, formatCountdown, IDLE_VIEW, lampOf, ownerRequests, placeOf, viewOf } from '../src/office/status.ts';

const NOW = 1_800_000_000_000;

let nextId = 100;
const task = (over) => ({ id: nextId++, title: 't', kind: 'work', status: 'queued', member: 'An', job_id: null, epic_id: null, revisions: 0, finished_at: null, ...over });
const job = (over) => ({ id: nextId++, title: 'j', status: 'running', lead: 'Minh', epic_id: null, ...over });
const epic = (over) => ({ id: nextId++, title: 'e', status: 'running', director: 'Hòa', ...over });
const snap = (tasks = [], jobs = [], epics = []) => ({ tasks, jobs, epics });
const view = (over = {}) => ({ ...IDLE_VIEW, ...over });

// ---------------------------------------------------------------------------------------------------------------
// Trạng thái, hoạt động, đèn
// ---------------------------------------------------------------------------------------------------------------

test('động tác suy từ công cụ gần nhất: đọc code, chạy lệnh, còn lại là gõ', () => {
  assert.equal(activityOfTool('Read: src/a.ts'), 'reading');
  assert.equal(activityOfTool('Grep: TODO'), 'reading');
  assert.equal(activityOfTool('Bash: npm test'), 'command');
  assert.equal(activityOfTool('PowerShell: dir'), 'command');
  assert.equal(activityOfTool('Edit: src/a.ts'), 'typing');
  assert.equal(activityOfTool('mcp__company__assign_to_member: {}'), 'typing');
  assert.equal(activityOfTool(''), 'typing');
});

test('người đang chạy việc: động tác theo công cụ; lập kế hoạch và duyệt bài có động tác riêng', () => {
  const work = task({ member: 'An', status: 'running' });
  const plan = task({ member: 'Minh', status: 'running', kind: 'plan' });
  const review = task({ member: 'Lan', status: 'running', kind: 'review' });
  const dplan = task({ member: 'Hòa', status: 'running', kind: 'dplan' });
  const reader = task({ member: 'Cúc', status: 'running' });
  const runner = task({ member: 'Dũng', status: 'running' });
  const views = viewOf({
    tasks: [work, plan, review, dplan, reader, runner], jobs: [], epics: [], now: NOW,
    lastTool: { [work.id]: 'Edit: a.ts', [reader.id]: 'Read: b.ts', [runner.id]: 'Bash: npm test', [dplan.id]: 'mcp__x: {}' },
  });
  assert.equal(views.An.activity, 'typing');
  assert.equal(views.Minh.activity, 'planning');
  assert.equal(views.Lan.activity, 'reviewing');
  assert.equal(views['Hòa'].activity, 'planning');
  assert.equal(views['Cúc'].activity, 'reading');
  assert.equal(views['Dũng'].activity, 'command');
  assert.equal(views.An.status, 'working');
});

test('Trưởng nhóm lập kế hoạch mà đang đọc code thì cũng ra thư viện; chỉ Giám đốc mới ra bảng trắng', () => {
  assert.equal(placeOf(view({ activity: 'planning' }), true, false), 'whiteboard');
  assert.equal(placeOf(view({ activity: 'planning' }), false, false), 'desk');
  assert.equal(placeOf(view({ activity: 'reading' }), true, false), 'library');
  assert.equal(placeOf(view({ activity: 'command' }), false, false), 'server');
  assert.equal(placeOf(view({ activity: 'typing' }), false, false), 'desk');
  assert.equal(placeOf(view({ activity: 'idle' }), false, false), 'desk');
});

test('nghỉ giải lao (hết hạn mức) đưa mọi người ra phòng nghỉ, bất kể đang làm gì', () => {
  for (const activity of ['idle', 'typing', 'reading', 'command', 'planning', 'waiting']) {
    assert.equal(placeOf(view({ activity }), true, true), 'lounge');
    assert.equal(placeOf(view({ activity }), false, true), 'lounge');
  }
});

test('hàng chờ, quá tải và lỗi', () => {
  const queued = [task({ member: 'An', status: 'queued' }), task({ member: 'An', status: 'queued' })];
  const running = task({ member: 'An', status: 'running' });
  const views = viewOf({ tasks: [running, ...queued], jobs: [], epics: [], lastTool: {}, now: NOW });
  assert.equal(views.An.queued, 2, 'chồng giấy cao theo số việc đang chờ');
  assert.equal(views.An.overload, true, '1 đang làm + 2 chờ là chạm trần tải');

  const ok = viewOf({ tasks: [running, queued[0]], jobs: [], epics: [], lastTool: {}, now: NOW });
  assert.equal(ok.An.overload, false);
  assert.equal(viewOf({ tasks: [running, queued[0]], jobs: [], epics: [], lastTool: {}, now: NOW, overloadAt: 2 }).An.overload, true, 'trần tải cấu hình được');

  // Việc của Trưởng nhóm (lập kế hoạch, duyệt bài) không tính vào tải của nhân viên.
  const leadHeavy = [1, 2, 3].map(() => task({ member: 'Minh', kind: 'review', status: 'queued' }));
  assert.equal(viewOf({ tasks: leadHeavy, jobs: [], epics: [], lastTool: {}, now: NOW }).Minh.overload, false);
  assert.equal(viewOf({ tasks: leadHeavy, jobs: [], epics: [], lastTool: {}, now: NOW }).Minh.queued, 3);
});

test('đèn đỏ khi việc gần nhất lỗi và chưa nhận việc mới; tự tắt sau một lúc', () => {
  const failed = task({ member: 'Bình', status: 'failed', finished_at: NOW - 60_000 });
  assert.equal(viewOf({ tasks: [failed], jobs: [], epics: [], lastTool: {}, now: NOW }).Bình.failed, true);
  assert.equal(viewOf({ tasks: [failed], jobs: [], epics: [], lastTool: {}, now: NOW + FAILED_VISIBLE_MS }).Bình.failed, false, 'quá lâu thì tắt');
  const retry = task({ member: 'Bình', status: 'queued' });
  assert.equal(viewOf({ tasks: [failed, retry], jobs: [], epics: [], lastTool: {}, now: NOW }).Bình.failed, false, 'nhận việc mới thì hết đỏ');
  const doneAfter = task({ member: 'Bình', status: 'done', finished_at: NOW - 1000 });
  assert.equal(viewOf({ tasks: [failed, doneAfter], jobs: [], epics: [], lastTool: {}, now: NOW }).Bình.failed, false, 'việc gần nhất đã xong thì không đỏ');
});

test('việc đang chờ chính bạn: Giám đốc cho yêu cầu, Trưởng nhóm cho việc lớn lẻ, và bảng đèn theo ưu tiên', () => {
  const e1 = epic({ status: 'awaiting_plan', director: 'Hòa' });
  const e2 = epic({ status: 'running', director: 'Hòa' });
  const e3 = epic({ status: 'awaiting_result', director: 'Hòa2' });
  const j1 = job({ status: 'attention', lead: 'Minh', epic_id: null });
  const j2 = job({ status: 'attention', lead: 'Lan', epic_id: e2.id }); // đã nằm trong một yêu cầu: yêu cầu lo
  const j3 = job({ status: 'running', lead: 'Phúc' });
  const reqs = ownerRequests([e1, e2, e3], [j1, j2, j3]);
  assert.deepEqual(reqs.map((r) => `${r.kind}:${r.who}`).sort(), ['epic:Hòa', 'epic:Hòa2', 'job:Minh']);

  const views = viewOf({ tasks: [], jobs: [j1, j2, j3], epics: [e1, e2, e3], lastTool: {}, now: NOW });
  assert.equal(views['Hòa'].needsYou, true, 'người đợi bạn có view dù không có việc nào');
  assert.equal(views.Minh.needsYou, true);
  assert.equal(views.Lan, undefined);
  assert.equal(views.Phúc, undefined);

  assert.equal(lampOf(view({ needsYou: true, overload: true, status: 'working' })), 'needs_you');
  assert.equal(lampOf(view({ overload: true, status: 'working' })), 'overload');
  assert.equal(lampOf(view({ status: 'working' })), 'working');
  assert.equal(lampOf(view({ status: 'waiting' })), 'waiting');
  assert.equal(lampOf(view({ status: 'queued' })), 'queued');
  assert.equal(lampOf(view({ failed: true })), 'failed');
  assert.equal(lampOf(IDLE_VIEW), 'idle');
});

// ---------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------
// Luồng giấy
// ---------------------------------------------------------------------------------------------------------------

test('giấy bay theo từng bước của bảng mục 5: Chủ → Giám đốc → Trưởng nhóm → nhân viên', () => {
  const e = epic({ id: 1, status: 'planning' });
  assert.deepEqual(diffFlows(snap(), snap([], [], [e])), [{ kind: 'assign', from: OWNER, to: 'Hòa' }], 'bạn tạo yêu cầu');

  const j = job({ id: 10, epic_id: 1, lead: 'Minh' });
  assert.deepEqual(diffFlows(snap([], [], [e]), snap([], [j], [e])), [{ kind: 'assign', from: 'Hòa', to: 'Minh' }], 'Giám đốc giao cho team');

  const loose = job({ id: 11, epic_id: null, lead: 'Lan' });
  assert.deepEqual(diffFlows(snap(), snap([], [loose])), [{ kind: 'assign', from: OWNER, to: 'Lan' }], 'bạn giao thẳng việc lớn cho một team');

  const t = task({ id: 50, job_id: 10, member: 'An', status: 'queued' });
  assert.deepEqual(diffFlows(snap([], [j], [e]), snap([t], [j], [e])), [{ kind: 'assign', from: 'Minh', to: 'An' }], 'Trưởng nhóm chia việc');

  const single = task({ id: 51, job_id: null, member: 'Cúc' });
  assert.deepEqual(diffFlows(snap(), snap([single])), [{ kind: 'assign', from: OWNER, to: 'Cúc' }], 'việc lẻ bạn giao thẳng');
});

test('nộp bài, bị trả lại, xong việc, xong việc lớn, xong yêu cầu, chờ bạn duyệt', () => {
  const e = epic({ id: 1, status: 'running' });
  const j = job({ id: 10, epic_id: 1, lead: 'Minh', status: 'running' });
  const running = task({ id: 50, job_id: 10, member: 'An', status: 'running' });

  const submitted = { ...running, status: 'submitted' };
  assert.deepEqual(diffFlows(snap([running], [j], [e]), snap([submitted], [j], [e])), [{ kind: 'report', from: 'An', to: 'Minh' }], 'nộp bài');

  const returned = { ...submitted, status: 'queued', revisions: 1 };
  assert.deepEqual(diffFlows(snap([submitted], [j], [e]), snap([returned], [j], [e])), [{ kind: 'return', from: 'Minh', to: 'An' }], 'bị trả lại');

  const done = { ...submitted, status: 'done' };
  assert.deepEqual(diffFlows(snap([submitted], [j], [e]), snap([done], [j], [e])), [{ kind: 'file', from: 'An', to: CABINET }], 'việc xong vào tủ hồ sơ');

  const jobDone = { ...j, status: 'done' };
  assert.deepEqual(diffFlows(snap([], [j], [e]), snap([], [jobDone], [e])), [{ kind: 'file', from: 'Minh', to: CABINET }], 'việc lớn xong');

  const awaiting = { ...e, status: 'awaiting_plan' };
  assert.deepEqual(diffFlows(snap([], [], [e]), snap([], [], [awaiting])), [{ kind: 'report', from: 'Hòa', to: OWNER }], 'kế hoạch chờ bạn duyệt');
  const result = { ...e, status: 'awaiting_result' };
  assert.deepEqual(diffFlows(snap([], [], [e]), snap([], [], [result])), [{ kind: 'report', from: 'Hòa', to: OWNER }], 'kết quả chờ bạn duyệt');
  const epicDone = { ...e, status: 'done' };
  assert.deepEqual(diffFlows(snap([], [], [result]), snap([], [], [epicDone])), [{ kind: 'file', from: 'Hòa', to: CABINET }], 'yêu cầu xong');
});

test('không có thay đổi thì không có giấy; việc của Trưởng nhóm/Giám đốc (lập kế hoạch, duyệt) không bay giấy; cập nhật hàng loạt bị chặn', () => {
  const e = epic({ id: 1 });
  const j = job({ id: 10, epic_id: 1 });
  const t = task({ id: 50, job_id: 10, status: 'running' });
  assert.deepEqual(diffFlows(snap([t], [j], [e]), snap([t], [j], [e])), []);

  const plan = task({ id: 60, kind: 'plan', job_id: 10, member: 'Minh' });
  const review = task({ id: 61, kind: 'review', job_id: 10, member: 'Minh' });
  assert.deepEqual(diffFlows(snap([], [j], [e]), snap([plan, review], [j], [e])), []);

  // Trạng thái đổi mà không có bước nào trong bảng (ví dụ running → failed) cũng không bay giấy.
  assert.deepEqual(diffFlows(snap([t], [j], [e]), snap([{ ...t, status: 'failed' }], [j], [e])), []);

  const many = Array.from({ length: 40 }, () => task({ job_id: null }));
  assert.equal(diffFlows(snap(), snap(many)).length, MAX_FLOWS_PER_DIFF);
});


// ---------------------------------------------------------------------------------------------------------------
// Bóng nói, đồng hồ đếm ngược, thông báo
// ---------------------------------------------------------------------------------------------------------------

test('bóng nói: tên file thôi (không cả đường dẫn), lệnh được cắt ngắn, công cụ lạ không hiện gì', () => {
  assert.equal(describeTool('Edit: D:\\proj\\src\\auth.ts'), 'Sửa auth.ts');
  assert.equal(describeTool('Read: /home/a/b/app.tsx'), 'Đọc app.tsx');
  assert.equal(describeTool('Bash: npm test'), 'Chạy npm test');
  assert.equal(describeTool('Grep: TODO'), 'Tìm TODO');
  assert.ok(describeTool(`Bash: ${'x'.repeat(100)}`).length <= 30);
  assert.equal(describeTool('Skill: tdd'), '');
  assert.equal(describeTool('mcp__company__assign_to_member: {}'), '');
  assert.equal(describeTool(''), '');
});

test('chữ trong bóng nói theo tình trạng: cần bạn > lỗi > việc đang làm > mặc định theo động tác; rảnh thì không có bóng', () => {
  assert.equal(bubbleOf(IDLE_VIEW), '');
  assert.equal(bubbleOf(view({ needsYou: true, activity: 'typing', detail: 'Sửa a.ts' })), 'Chờ bạn quyết');
  assert.equal(bubbleOf(view({ failed: true })), 'Việc bị lỗi');
  assert.equal(bubbleOf(view({ activity: 'typing', detail: 'Sửa a.ts' })), 'Sửa a.ts');
  assert.equal(bubbleOf(view({ activity: 'typing' })), 'Đang làm');
  assert.equal(bubbleOf(view({ activity: 'planning' })), 'Lập kế hoạch');
  assert.equal(bubbleOf(view({ activity: 'reviewing' })), 'Duyệt bài');
  assert.equal(bubbleOf(view({ activity: 'waiting' })), 'Chờ duyệt bài');

  const running = task({ member: 'An', status: 'running' });
  const out = viewOf({ tasks: [running], jobs: [], epics: [], now: NOW, lastTool: { [running.id]: 'Edit: C:\\x\\login.ts' } });
  assert.equal(out.An.detail, 'Sửa login.ts');
});

test('đồng hồ đếm ngược', () => {
  assert.equal(formatCountdown(0), '00:00');
  assert.equal(formatCountdown(-5000), '00:00');
  assert.equal(formatCountdown(1), '00:01', 'làm tròn lên để không hiện 00:00 khi còn chút xíu');
  assert.equal(formatCountdown(65_000), '01:05');
  assert.equal(formatCountdown(59 * 60_000 + 59_000), '59:59');
  assert.equal(formatCountdown(3_600_000), '1:00:00');
  assert.equal(formatCountdown(3 * 3_600_000 + 7 * 60_000 + 9_000), '3:07:09');
});

test('thông báo: tiêu đề tab có số việc chờ; chỉ việc MỚI mới rung chuông', () => {
  assert.equal(titleFor('My Company', 0), 'My Company');
  assert.equal(titleFor('My Company', 2), '(2) Cần bạn quyết · My Company');
  assert.deepEqual(newKeys(new Set(), ['epic:1:awaiting_plan']), ['epic:1:awaiting_plan']);
  assert.deepEqual(newKeys(new Set(['epic:1:awaiting_plan']), ['epic:1:awaiting_plan']), [], 'đã chờ sẵn thì không rung lại');
  assert.deepEqual(newKeys(new Set(['epic:1:awaiting_plan']), ['epic:1:awaiting_result']), ['epic:1:awaiting_result'], 'cùng yêu cầu sang bước chờ khác thì tính là mới');
  assert.deepEqual(newKeys(new Set(['epic:1:awaiting_plan']), []), []);
});

test('hỏi người khác: giấy vàng từ người hỏi tới người được hỏi, giấy tím bay lại khi trả lời xong; không có người hỏi thì không bay', () => {
  const asker = task({ member: 'An', status: 'waiting_answer' });
  const ask = task({ kind: 'answer', member: 'Minh', status: 'queued', subject_id: asker.id });
  assert.deepEqual(diffFlows(snap([asker]), snap([asker, ask])), [{ kind: 'ask', from: 'An', to: 'Minh' }]);
  const answered = { ...ask, status: 'done' };
  assert.deepEqual(diffFlows(snap([asker, ask]), snap([asker, answered])), [{ kind: 'reply', from: 'Minh', to: 'An' }]);
  // Cập nhật lặp (không đổi) và các chuyển trạng thái khác không sinh thêm giấy.
  assert.deepEqual(diffFlows(snap([asker, answered]), snap([asker, answered])), []);
  assert.deepEqual(diffFlows(snap([asker, ask]), snap([asker, { ...ask, status: 'running' }])), []);
  assert.deepEqual(diffFlows(snap([asker, ask]), snap([asker, { ...ask, status: 'failed' }])), [], 'trả lời lỗi thì không có giấy trả lời');
  // Lượt trả lời mà việc của người hỏi không còn trong danh sách (đã cắt bớt): bỏ qua, không văng lỗi.
  assert.deepEqual(diffFlows(snap(), snap([ask])), []);
  // Họp: ba lượt trả lời cùng xuất hiện → ba giấy.
  const meeting = ['Minh', 'Bình', 'Hương'].map((member) => task({ kind: 'answer', member, status: 'queued', subject_id: asker.id }));
  assert.equal(diffFlows(snap([asker]), snap([asker, ...meeting])).length, 3);
});

test('chờ trả lời: người hỏi hiện là "chờ" (không phải rảnh), vẫn tính vào tải, còn người trả lời đang đọc code', () => {
  const waiting = task({ member: 'An', status: 'waiting_answer' });
  const answering = task({ kind: 'answer', member: 'Minh', status: 'running' });
  const views = viewOf({ tasks: [waiting, answering], jobs: [], epics: [], now: NOW, lastTool: {} });
  assert.equal(views.An.status, 'waiting');
  assert.equal(views.An.activity, 'waiting');
  assert.equal(views.Minh.status, 'working');
  assert.equal(views.Minh.activity, 'reading');
  // 3 việc làm (một đang chờ trả lời) vẫn là quá tải, khớp luật ở máy chủ.
  const more = [waiting, task({ member: 'An', status: 'queued' }), task({ member: 'An', status: 'queued' })];
  assert.equal(viewOf({ tasks: more, jobs: [], epics: [], now: NOW, lastTool: {} }).An.overload, true);
});
