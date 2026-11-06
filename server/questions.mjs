import { UserError } from './errors.mjs';
import { maskSecrets, shorten } from './guard.mjs';
import { findMember, workersOf } from './teams.mjs';

/**
 * Nhân viên hỏi nhau (giai đoạn 6D). Tiến trình `claude -p` không chờ được, nên hỏi theo kiểu KHÔNG CHỜ:
 *   1. Nhân viên gọi ask_lead / ask_colleague / call_meeting: câu hỏi được ghi lại, mỗi người được hỏi nhận một
 *      lượt "answer" (chỉ đọc, ngắn), và nhân viên được dặn kết thúc lượt chạy của mình.
 *   2. Lượt chạy kết thúc mà còn câu hỏi chưa giao → việc chuyển sang `waiting_answer` (không nộp bài, không commit).
 *   3. Khi mọi câu hỏi đã có kết cục (trả lời, hoặc thất bại/hết hạn) → việc xếp hàng lại và chạy tiếp bằng `--resume`
 *      kèm các câu trả lời. Người hỏi không bao giờ kẹt: câu hỏi thất bại cũng là một kết cục ("tự quyết").
 * Giới hạn do máy chủ ép: 2 lần hỏi mỗi việc, 600 ký tự mỗi câu, chỉ hỏi trong cùng team, họp tối đa 3 người trả lời.
 */

export const MAX_ROUNDS = 2;
export const MAX_TEXT = 600;
export const MAX_MEETING = 3;
const MAX_ANSWER = 2000;
export const ANSWER_MAX_TURNS = 8;

export class Questions {
  /** @param {import('./runner.mjs').Runner} runner */
  constructor(runner) {
    this.r = runner;
  }

  get store() {
    return this.r.store;
  }

  // ---------- Công cụ của nhân viên ----------

  /** Chọn người trả lời. Trả về danh sách `found` (tối đa MAX_MEETING). */
  targetsFor(asker, kind, memberName) {
    const { team } = asker;
    const lead = team.lead ? findMember(this.r.getTeams(), team.lead) : null;
    if (kind === 'lead') {
      if (!lead) throw new UserError(`Team ${team.name} chưa có Trưởng nhóm để hỏi. Hãy tự quyết và ghi giả định vào "Điều còn dang dở".`);
      return [lead];
    }
    const colleagues = workersOf(team).filter((m) => m.name !== asker.member.name);
    if (kind === 'meeting') {
      const people = [lead, ...colleagues.map((m) => findMember(this.r.getTeams(), m.name))].filter(Boolean);
      if (people.length === 0) throw new UserError('Không có ai khác trong team để họp. Hãy tự quyết và ghi giả định vào "Điều còn dang dở".');
      return people.slice(0, MAX_MEETING);
    }
    const wanted = String(memberName ?? '').trim();
    const target = wanted ? findMember(this.r.getTeams(), wanted) : null;
    const list = colleagues.map((m) => m.name).join(', ') || '(không có)';
    if (!target || target.team.id !== team.id) {
      throw new UserError(`"${wanted}" không thuộc team ${team.name}. Chỉ hỏi được người trong cùng team: ${list}${lead ? `; Trưởng nhóm ${lead.member.name} (dùng ask_lead)` : ''}.`);
    }
    if (target.member.name === asker.member.name) throw new UserError('Không thể tự hỏi chính mình.');
    return [target];
  }

  ask(task, { kind, member = null, question }) {
    if (task.kind !== 'work') throw new UserError('Chỉ nhân viên đang làm việc mới được hỏi.');
    const text = maskSecrets(String(question ?? '').trim());
    if (!text) throw new UserError('Thiếu nội dung câu hỏi.');
    if (text.length > MAX_TEXT) throw new UserError(`Câu hỏi dài ${text.length} ký tự, tối đa ${MAX_TEXT}. Hãy rút gọn, chỉ nêu điều bạn đang vướng.`);
    const rounds = this.store.questionRounds(task.id);
    if (rounds >= MAX_ROUNDS) {
      throw new UserError(`Bạn đã hỏi ${rounds}/${MAX_ROUNDS} lần cho việc này. Hãy tự quyết theo tiêu chí hoàn thành và ghi giả định vào "Điều còn dang dở".`);
    }
    const asker = findMember(this.r.getTeams(), task.member);
    if (!asker) throw new UserError('Không tìm thấy bạn trong cấu hình team.');
    const targets = this.targetsFor(asker, kind, member);

    const round = rounds + 1;
    for (const target of targets) {
      const answerTask = this.createAnswerTask({ asker: task, target, text, kind, count: targets.length });
      this.store.createQuestion({
        taskId: task.id, round, kind, asker: task.member, target: target.member.name, text, answerTaskId: answerTask.id,
      });
    }
    const names = targets.map((t) => t.member.name).join(', ');
    this.r.log(task.id, 'question', `${kind === 'meeting' ? 'Họp ngắn với' : 'Hỏi'} ${names}: ${shorten(text, 300)}`);
    this.r.schedule();
    return (
      `Đã gửi câu hỏi cho ${names}. KHÔNG làm tiếp phần phụ thuộc vào câu trả lời. Hãy kết thúc lượt này ngay bằng một câu ngắn ` +
      '(ví dụ "Đang chờ trả lời"); hệ thống sẽ gọi bạn lại cùng câu trả lời để làm tiếp. Lần hỏi này là ' +
      `${round}/${MAX_ROUNDS}.`
    );
  }

  createAnswerTask({ asker, target, text, kind, count }) {
    const { team, member, role, isLead } = target;
    const lines = [
      '# Trả lời câu hỏi của đồng nghiệp',
      `${asker.member} (${asker.team}) đang làm việc #${asker.id} "${asker.title}" và ${kind === 'meeting' ? `họp ngắn với ${count} người, trong đó có bạn` : 'hỏi bạn'}:`,
      '',
      text,
      '',
      '## Bối cảnh việc của người hỏi',
      shorten(asker.prompt.trim(), 1500),
    ];
    if (asker.acceptance?.trim()) lines.push('', '### Tiêu chí hoàn thành', shorten(asker.acceptance.trim(), 600));
    lines.push(
      '',
      '## Cách trả lời',
      '- Thư mục hiện tại là nơi người hỏi đang làm (chỉ đọc). Đọc code liên quan trước khi trả lời, không đoán.',
      '- Trả lời ngắn gọn, cụ thể, dùng được ngay, tối đa khoảng 200 từ. Nếu không chắc, nói rõ điều chưa chắc và cách kiểm.',
      '- Bạn chỉ trả lời. Không sửa file, không viết code thay họ, không chạy lệnh.',
    );
    const created = this.store.createTask({
      title: `Trả lời ${asker.member}: ${shorten(text, 60)}`,
      prompt: lines.join('\n'),
      team: team.id,
      member: member.name,
      role: role.id ?? member.role,
      // Lãnh đạo dùng model duyệt bài; đồng nghiệp dùng model của mình nhưng suy luận thấp cho nhanh.
      model: isLead ? (role.review_model ?? role.model) : role.model,
      effort: isLead ? (role.review_effort ?? role.effort) : 'low',
      level: 'normal',
      levelSource: 'user',
      kind: 'answer',
      subjectId: asker.id,
    });
    this.r.emit('task', created);
    return created;
  }

  // ---------- Kết cục của câu hỏi ----------

  /** Một lượt "answer" vừa kết thúc (xong, lỗi hoặc bị dừng): ghi kết cục cho câu hỏi và đánh thức người hỏi nếu đủ. */
  afterAnswerEnds(answerTask) {
    const q = this.store.questionByAnswerTask(answerTask.id);
    if (!q || q.status !== 'open') return;
    if (answerTask.status === 'done') {
      const text = maskSecrets(String(answerTask.result ?? '').trim());
      if (text) {
        this.store.updateQuestion(q.id, { status: 'answered', answer: shorten(text, MAX_ANSWER), answered_at: Date.now() });
        this.r.log(q.task_id, 'answer', `${q.target} trả lời: ${shorten(text, 300)}`);
      } else {
        this.store.updateQuestion(q.id, { status: 'failed', answered_at: Date.now() });
        this.r.log(q.task_id, 'answer', `${q.target} không đưa ra câu trả lời nào.`);
      }
    } else if (answerTask.status === 'failed' || answerTask.status === 'stopped') {
      this.store.updateQuestion(q.id, { status: 'failed', answered_at: Date.now() });
      this.r.log(q.task_id, 'answer', `${q.target} không trả lời được (${answerTask.status === 'stopped' ? 'bị dừng' : 'lỗi hoặc hết thời gian'}). Bạn tự quyết.`);
    } else {
      return; // còn đang chạy hoặc chờ: chưa có kết cục
    }
    this.wake(q.task_id);
  }

  /** Việc đang chờ mà không còn câu hỏi mở nào thì xếp hàng lại để làm tiếp. */
  wake(taskId) {
    const asker = this.store.getTask(taskId);
    if (!asker || asker.status !== 'waiting_answer') return;
    if (this.store.openQuestions(taskId).length > 0) return;
    this.r.update(taskId, { status: 'queued' });
    this.r.log(taskId, 'system', 'Đã có đủ câu trả lời, làm tiếp.');
    this.r.schedule();
  }

  /** Việc của người hỏi đã kết thúc hẳn (lỗi, bị dừng): hủy các câu hỏi còn mở và dừng lượt trả lời đang chờ. */
  cancelFor(taskId) {
    for (const q of this.store.openQuestions(taskId)) {
      this.store.updateQuestion(q.id, { status: 'failed', answered_at: Date.now() });
      const answerTask = q.answer_task_id ? this.store.getTask(q.answer_task_id) : null;
      if (answerTask && ['queued', 'running', 'paused_quota'].includes(answerTask.status)) this.r.stop(answerTask.id);
    }
  }

  /** Khởi động lại máy chủ: khớp câu hỏi với lượt trả lời đã kết thúc trong lúc tắt, rồi đánh thức việc đang chờ. */
  reconcile() {
    for (const q of this.store.openQuestions()) {
      const answerTask = q.answer_task_id ? this.store.getTask(q.answer_task_id) : null;
      if (!answerTask) this.store.updateQuestion(q.id, { status: 'failed', answered_at: Date.now() });
      else this.afterAnswerEnds(answerTask);
    }
    for (const task of this.store.tasksByStatus('waiting_answer')) this.wake(task.id);
  }

  // ---------- Đưa câu trả lời lại cho người hỏi ----------

  /** Câu trả lời chưa giao của một việc, nhóm theo lần hỏi. Rỗng nếu không có. */
  pendingDelivery(taskId) {
    return this.store.questionsOf(taskId).filter((q) => !q.delivered && q.status !== 'open');
  }

  /** Lời nhắc khi gọi lại người hỏi, và đánh dấu đã giao. */
  deliveryPrompt(taskId) {
    const rows = this.pendingDelivery(taskId);
    if (rows.length === 0) return null;
    const byRound = new Map();
    for (const q of rows) byRound.set(q.round, [...(byRound.get(q.round) ?? []), q]);
    const lines = ['Đây là câu trả lời cho câu hỏi bạn đã gửi. Hãy dùng chúng để làm tiếp công việc.'];
    for (const [round, list] of byRound) {
      lines.push('', `## Lần hỏi ${round}: ${list[0].text}`);
      for (const q of list) {
        lines.push(q.status === 'answered' ? `- ${q.target} trả lời: ${q.answer}` : `- ${q.target}: không trả lời được. Hãy tự quyết theo tiêu chí hoàn thành.`);
      }
    }
    lines.push(
      '',
      'Nếu có chỗ câu trả lời mâu thuẫn hoặc không đủ, chọn phương án hợp lý nhất và ghi giả định vào "Điều còn dang dở". ' +
        'Khi xong, báo cáo đúng bốn mục (Đã làm / File thay đổi / Cách kiểm tra / Điều còn dang dở).',
    );
    for (const q of rows) this.store.updateQuestion(q.id, { delivered: 1 });
    return lines.join('\n');
  }
}
