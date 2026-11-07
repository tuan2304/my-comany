import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { UserError } from './errors.mjs';
import { findMember, workersOf } from './teams.mjs';
import { readLock } from './skills.mjs';
import { captureShots } from './shots.mjs';
import { integrateBranches } from './worktree.mjs';

/**
 * Thi đấu skill: hai nhân viên cùng làm MỘT việc, mỗi người dùng một bộ skill khác nhau; chủ xem hai bản (ảnh chụp, đã ẩn danh)
 * rồi chọn một. Chỉ nhánh được chọn được gộp; bộ skill thắng được ghi lại để chủ cân nhắc đặt làm mặc định.
 *
 * Luồng (giao từ trên xuống như mọi việc khác): Chủ giao việc lớn cho team, kèm hai bộ skill → Trưởng nhóm lập kế hoạch và dùng
 * công cụ assign_contest để giao cùng một việc cho hai người → hai người làm song song trên hai nhánh riêng → hệ thống chụp ảnh
 * từng bản → chủ bấm vào Trưởng nhóm, so sánh và chọn.
 *
 * Trạng thái lưu trong cột jobs.contest (JSON):
 *   { sets: {A: [skill...], B: [skill...]}, status: splitting | working | capturing | ready | chosen,
 *     entries: [{label, task_id, member}], order: ['B','A'] (thứ tự hiển thị ngẫu nhiên),
 *     shots: {task_id: {files: [{page, file}], error}}, winner: 'A'|'B', chosen_at }
 */

export const MAX_SET_SIZE = 4;
const ACTIVE = ['queued', 'running', 'paused_quota', 'waiting_answer'];
const LABELS = ['A', 'B'];

export function parseContest(job) {
  if (!job?.contest) return null;
  try {
    return JSON.parse(job.contest);
  } catch {
    return null;
  }
}

function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Kiểm tra hai bộ skill chủ chọn: tên hợp lệ, đã được duyệt trong skills.lock, mỗi bộ không rỗng, hai bộ khác nhau. */
export function validateSets(input, lockFile) {
  const lock = readLock(lockFile);
  const sets = {};
  for (const [key, label] of [['a', 'A'], ['b', 'B']]) {
    const raw = input?.[key] ?? input?.[label];
    const list = [...new Set((Array.isArray(raw) ? raw : []).map((s) => String(s).trim()).filter(Boolean))];
    if (list.length === 0) throw new UserError(`Bộ skill ${label} đang trống.`);
    if (list.length > MAX_SET_SIZE) throw new UserError(`Bộ skill ${label} có quá ${MAX_SET_SIZE} skill.`);
    for (const name of list) {
      if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) throw new UserError(`Tên skill không hợp lệ: ${name}`);
      if (!lock.skills[name]) throw new UserError(`Skill "${name}" chưa được duyệt (không có trong skills.lock).`);
    }
    sets[label] = list;
  }
  if ([...sets.A].sort().join('|') === [...sets.B].sort().join('|')) throw new UserError('Hai bộ skill giống hệt nhau thì không có gì để so sánh.');
  return sets;
}

export class Contests {
  /** @param {import('./jobs.mjs').Jobs} jobs */
  constructor(jobs) {
    this.jobs = jobs;
  }

  get r() {
    return this.jobs.r;
  }

  get store() {
    return this.jobs.store;
  }

  shotDir(jobId) {
    return path.join(this.r.cfg.dataDir, 'contest', String(jobId));
  }

  save(job, contest) {
    return this.store.updateJob(job.id, { contest: JSON.stringify(contest) });
  }

  // ---------- Công cụ của Trưởng nhóm ----------

  assign(planTask, args, { checkScope, toolError }) {
    const job = this.store.getJob(planTask.job_id);
    const contest = parseContest(job);
    if (!contest) throw toolError('Việc lớn này không phải thi đấu skill. Hãy dùng assign_to_member.');
    if (contest.entries?.length) throw toolError('Bạn đã giao cuộc thi này rồi, không giao thêm được.');
    const team = this.jobs.teamOf(planTask);
    const workers = workersOf(team);

    const names = Array.isArray(args.members) ? args.members.map((m) => String(m).trim().toLowerCase()) : [];
    if (names.length !== 2 || names[0] === names[1]) throw toolError('Cần đúng HAI nhân viên khác nhau trong "members".');
    const members = names.map((n) => workers.find((m) => m.name.toLowerCase() === n));
    const unknown = names.filter((_, i) => !members[i]);
    if (unknown.length) throw toolError(`Không có nhân viên ${unknown.map((n) => `"${n}"`).join(', ')}. Các nhân viên của team: ${workers.map((m) => m.name).join(', ')}.`);

    const title = String(args.title ?? '').trim();
    const description = String(args.description ?? '').trim();
    if (!title || !description) throw toolError('Thiếu title hoặc description.');
    if (title.length > 180 || description.length > 20_000) throw toolError('title hoặc description quá dài.');
    // Cố định mức độ khó cho cả hai: để hệ thống tự đánh giá thì hai người có thể bị chọn model khác nhau, và cuộc thi mất công bằng.
    const level = args.level && args.level !== 'auto' ? args.level : 'normal';
    if (!['easy', 'normal', 'hard'].includes(level)) throw toolError(`level "${level}" không hợp lệ.`);
    const files = checkScope(args.files, team);

    const founds = members.map((m) => findMember(this.r.getTeams(), m.name));
    for (const found of founds) {
      try {
        this.r.checkCapacity(found);
      } catch (err) {
        throw toolError(`${err.message}\nTải hiện tại:\n${this.jobs.renderWorkload(team)}\nHãy chọn người còn chỗ.`);
      }
    }

    // Gán ngẫu nhiên bộ nào cho ai, để lựa chọn người của Trưởng nhóm không thiên vị một bộ skill.
    const labels = shuffled(LABELS);
    const entries = founds.map((found, i) => {
      const task = this.r.createWork({
        found, title: `${title} (bản ${i + 1})`, prompt: description, acceptance: String(args.acceptance ?? ''),
        level, jobId: job.id, files, skillSet: contest.sets[labels[i]],
      });
      return { label: labels[i], task_id: task.id, member: found.member.name };
    });
    this.save(job, { ...contest, status: 'working', entries });
    this.r.log(planTask.id, 'job', `Giao cuộc thi: ${entries.map((e) => `#${e.task_id} cho ${e.member}`).join(' và ')} (phạm vi: ${files.join(', ')}).`);
    this.r.schedule();
    return `Đã giao cùng một việc cho ${entries[0].member} (#${entries[0].task_id}) và ${entries[1].member} (#${entries[1].task_id}). Hai người làm song song trên hai nhánh riêng. Hãy kết thúc bằng một đoạn tóm tắt ngắn.`;
  }

  // ---------- Vòng đời ----------

  /** Thay cho Jobs.advance với việc lớn thi đấu: không duyệt từng bài, không gộp cả hai nhánh. */
  async progress(jobId) {
    const job = this.store.getJob(jobId);
    const contest = parseContest(job);
    if (!contest || ['capturing', 'ready', 'chosen'].includes(contest.status)) return;
    const tasks = this.store.jobTasks(jobId);
    const plan = tasks.filter((t) => t.kind === 'plan').at(-1);
    const work = tasks.filter((t) => t.kind === 'work');
    const planOpen = plan && ['queued', 'running', 'paused_quota'].includes(plan.status);
    if (planOpen || work.some((t) => ACTIVE.includes(t.status))) {
      const next = planOpen && work.length === 0 ? 'planning' : 'running';
      if (job.status !== next) this.r.emit('job', this.store.updateJob(jobId, { status: next }));
      return;
    }
    if (work.length === 0) {
      const why = plan?.status === 'failed' ? `Trưởng nhóm gặp lỗi khi lập kế hoạch: ${(plan.error ?? '').slice(0, 300)}` : 'Trưởng nhóm không giao cuộc thi (không gọi assign_contest).';
      this.jobs.finishJob(job, { status: 'failed', error: why });
      return;
    }
    const entered = work.filter((t) => t.status === 'submitted');
    if (entered.length === 0) {
      this.jobs.finishJob(job, { status: 'failed', error: 'Không có bản dự thi nào nộp được.', summary: this.jobs.buildSummary(job, tasks) });
      return;
    }
    // Đánh dấu ngay (trước mọi await) để hai lần gọi liên tiếp không chụp ảnh hai lần.
    this.save(job, { ...contest, status: 'capturing' });
    if (job.status !== 'running') this.r.emit('job', this.store.updateJob(jobId, { status: 'running' }));
    this.r.log(plan?.id ?? entered[0].id, 'job', `Cuộc thi #${jobId}: ${entered.length} bản đã nộp, đang chụp ảnh giao diện.`);

    const preview = this.r.getProject()?.preview ?? null;
    const shots = {};
    for (const task of entered) {
      const res = await captureShots({
        dir: task.worktree, preview, outDir: this.shotDir(jobId), prefix: `t${task.id}`, browser: this.r.cfg.shotBrowser ?? null,
      });
      shots[task.id] = res.ok ? { files: res.shots, error: null } : { files: [], error: res.error };
    }
    const current = this.store.getJob(jobId);
    const latest = parseContest(current);
    if (!latest || latest.status !== 'capturing' || current.status !== 'running') return; // việc bị dừng trong lúc chụp
    const ready = this.save(current, { ...latest, status: 'ready', shots, order: shuffled(LABELS) });
    this.r.emit('job', this.store.updateJob(jobId, { status: 'awaiting_choice' }));
    this.jobs.jobLog(ready, 'job', `Cuộc thi #${jobId}: hai bản đã sẵn sàng, chờ chủ chọn (bấm vào ${ready.lead}).`);
  }

  /** Bản dự thi đang hiển thị ở vị trí `option` (1 hoặc 2). */
  entryAt(contest, option) {
    const label = contest.order?.[Number(option) - 1];
    return contest.entries?.find((e) => e.label === label) ?? null;
  }

  async choose(jobId, option) {
    const job = this.store.getJob(jobId);
    if (!job) throw new UserError('Không có việc lớn này.');
    const contest = parseContest(job);
    if (!contest || job.status !== 'awaiting_choice' || contest.status !== 'ready') throw new UserError('Cuộc thi này chưa sẵn sàng để chọn (hoặc đã chọn rồi).');
    const winner = this.entryAt(contest, option);
    if (!winner) throw new UserError('Phương án không hợp lệ.');
    const winnerTask = this.store.getTask(winner.task_id);
    if (winnerTask?.status !== 'submitted') throw new UserError('Bản này không còn ở trạng thái đã nộp nên không chọn được.');

    // Chuyển trạng thái trước mọi await để hai lần bấm không gộp hai lần.
    this.save(job, { ...contest, status: 'chosen', winner: winner.label, chosen_at: Date.now() });
    this.store.updateJob(jobId, { status: 'integrating' });
    for (const e of contest.entries) {
      const t = this.store.getTask(e.task_id);
      if (t?.status === 'submitted') {
        this.r.update(t.id, { status: 'done', verdict: e.label === winner.label ? 'contest_win' : 'contest_lost', finished_at: Date.now() });
      }
    }
    this.r.emit('job', this.store.getJob(jobId));

    const tasks = this.store.jobTasks(jobId);
    const summary = this.jobs.buildSummary(job, tasks);
    let result;
    try {
      result = await integrateBranches({
        projectRoot: this.r.cfg.projectRoot, worktreesDir: this.r.cfg.worktreesDir, name: `job${jobId}`,
        baseCommit: job.base_commit, branches: [winnerTask.branch],
      });
    } catch (err) {
      return this.jobs.finishJob(job, { status: 'attention', error: `Không gộp được nhánh đã chọn: ${err.message}`, summary });
    }
    if (!result.ok) {
      return this.jobs.finishJob(job, {
        status: 'attention', summary, conflict_files: JSON.stringify(result.conflictFiles),
        error: `Xung đột khi gộp nhánh ${result.failedBranch}: ${result.conflictFiles.join(', ') || '(không rõ)'}.`,
      });
    }
    return this.jobs.finishJob(job, { status: 'done', summary, merge_branch: result.branch, merge_worktree: result.dir });
  }

  // ---------- Dữ liệu cho giao diện ----------

  /** Bản cho giao diện. Chưa chọn thì ẩn tên người và bộ skill của từng phương án (chấm mù); ảnh nhúng sẵn dạng data URL. */
  view(jobId) {
    const job = this.store.getJob(jobId);
    const contest = parseContest(job);
    if (!job || !contest) return null;
    const revealed = contest.status === 'chosen';
    const showOptions = ['ready', 'chosen'].includes(contest.status);
    const options = showOptions
      ? (contest.order ?? []).map((label, i) => {
          const entry = contest.entries.find((e) => e.label === label);
          const task = this.store.getTask(entry.task_id);
          const shot = contest.shots?.[entry.task_id] ?? { files: [], error: null };
          let changed = [];
          try {
            changed = JSON.parse(task?.changed_files ?? '[]');
          } catch {
            /* bỏ qua */
          }
          return {
            option: i + 1,
            images: shot.files.map((f) => ({ page: f.page, src: readImage(f.file) })).filter((f) => f.src),
            shotError: shot.error,
            changedFiles: changed.length,
            ...(revealed ? { member: entry.member, label, skills: contest.sets[label], report: task?.result ?? null, winner: contest.winner === label } : {}),
          };
        })
      : [];
    return {
      jobId: job.id,
      title: job.title,
      lead: job.lead,
      jobStatus: job.status,
      status: contest.status,
      hasPreview: Boolean(this.r.getProject()?.preview),
      options,
      ...(revealed ? { sets: contest.sets, winnerSkills: contest.sets[contest.winner] } : {}),
    };
  }
}

function readImage(file) {
  try {
    return `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  } catch {
    return null;
  }
}
