import { UserError } from './errors.mjs';
import { renderTemplate } from './templates.mjs';

/**
 * Việc định kỳ (ví dụ mỗi sáng kiểm tra build). Mặc định TẮT; khi bật, các quy tắc sau giữ cho nó không đốt hạn mức Pro:
 * - mỗi lịch chỉ có tối đa một lần chạy đang mở (lần trước chưa xong thì không giao thêm);
 * - bỏ qua khi công ty đang tạm dừng (hết hạn mức hoặc bạn bấm tạm dừng);
 * - trần số lần chạy tự động mỗi ngày;
 * - lỡ giờ (máy tắt) thì chạy bù một lần nếu còn trong CATCH_UP_MS, không bù dồn.
 */

export const CATCH_UP_MS = 3 * 60 * 60 * 1000;
export const TICK_MS = 30_000;
export const RETRY_AFTER_ERROR_MS = 10 * 60 * 1000;
const TERMINAL = { job: ['done', 'failed', 'stopped'], epic: ['done', 'failed', 'stopped', 'rejected'] };
const AT_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function dayKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Thời điểm đến hạn của lịch trong ngày chứa `now` (giờ máy), hoặc null nếu hôm nay không thuộc các thứ đã chọn. */
export function dueTimeToday(schedule, now) {
  const date = new Date(now);
  const days = JSON.parse(schedule.days);
  if (!days.includes(date.getDay())) return null;
  const [h, m] = schedule.at_time.split(':').map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0, 0).getTime();
}

/** Lần chạy tự động kế tiếp tính từ `now` (để hiển thị), hoặc null nếu không có thứ nào được chọn. */
export function nextRunAt(schedule, now) {
  const days = JSON.parse(schedule.days);
  if (days.length === 0) return null;
  for (let i = 0; i < 8; i += 1) {
    const probe = new Date(now);
    probe.setDate(probe.getDate() + i);
    const due = dueTimeToday(schedule, probe.getTime());
    if (due !== null && due > now) return due;
    // Hôm nay đã qua giờ nhưng chưa chạy và còn trong thời gian chạy bù: coi như sắp chạy.
    if (i === 0 && due !== null && due <= now && now - due <= CATCH_UP_MS && (schedule.last_run_at ?? 0) < due) return now;
  }
  return null;
}

export function validateSchedule(input, template) {
  const name = String(input.name ?? '').trim();
  if (!name) throw new UserError('Thiếu tên lịch.');
  if (name.length > 100) throw new UserError('Tên lịch quá dài (tối đa 100 ký tự).');
  const atTime = String(input.at_time ?? '');
  if (!AT_TIME.test(atTime)) throw new UserError('Giờ chạy phải có dạng HH:MM (ví dụ 08:30).');
  const days = input.days ?? [1, 2, 3, 4, 5];
  if (!Array.isArray(days) || days.length === 0 || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new UserError('Các ngày chạy phải là danh sách số từ 0 (Chủ nhật) đến 6 (thứ Bảy), ít nhất một ngày.');
  }
  const maxPerDay = input.max_per_day === undefined ? 2 : Number(input.max_per_day);
  if (!Number.isInteger(maxPerDay) || maxPerDay < 1 || maxPerDay > 10) throw new UserError('Số lần chạy tối đa mỗi ngày phải từ 1 đến 10.');
  const params = input.params && typeof input.params === 'object' ? input.params : {};
  renderTemplate(template, params); // báo lỗi ngay nếu thiếu ô bắt buộc
  return { name, atTime, days: [...new Set(days)].sort(), maxPerDay, params };
}

export class Scheduler {
  /**
   * @param {object} deps
   * @param {import('./db.mjs').Store} deps.store
   * @param {import('./runner.mjs').Runner} deps.runner
   * @param {() => Array} deps.getTemplates
   * @param {() => void} [deps.reload] nạp lại cấu hình team trước khi giao việc
   * @param {() => number} [deps.now] đồng hồ (tiêm vào để kiểm thử)
   */
  constructor({ store, runner, getTemplates, reload = () => {}, now = Date.now, log = () => {} }) {
    this.store = store;
    this.runner = runner;
    this.getTemplates = getTemplates;
    this.reload = reload;
    this.now = now;
    this.log = log;
    this.timer = null;
    this.retryAt = new Map();
    this.running = false;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((err) => this.log(`Lỗi bộ hẹn giờ: ${err.message}`));
    }, TICK_MS);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  isPaused() {
    const snap = this.runner.snapshot();
    return Boolean(snap.manualPause || snap.pausedUntil);
  }

  /** Lần chạy trước của lịch còn đang mở (chưa xong) không? */
  openRun(schedule) {
    if (!schedule.last_ref) return null;
    let ref;
    try {
      ref = JSON.parse(schedule.last_ref);
    } catch {
      return null;
    }
    const item = ref.kind === 'epic' ? this.store.getEpic(ref.id) : this.store.getJob(ref.id);
    if (!item) return null;
    return TERMINAL[ref.kind].includes(item.status) ? null : { ...ref, status: item.status };
  }

  describe(schedule) {
    const now = this.now();
    return {
      ...schedule,
      enabled: Boolean(schedule.enabled),
      params: JSON.parse(schedule.params),
      days: JSON.parse(schedule.days),
      last_ref: schedule.last_ref ? JSON.parse(schedule.last_ref) : null,
      open_run: this.openRun(schedule),
      next_run_at: schedule.enabled ? nextRunAt(schedule, now) : null,
    };
  }

  /** Chạy các lịch đã đến hạn. Gọi định kỳ; kiểm thử gọi trực tiếp với đồng hồ giả. */
  async tick() {
    if (this.running) return [];
    this.running = true;
    try {
      const fired = [];
      const now = this.now();
      if (this.isPaused()) return fired;
      for (const schedule of this.store.listSchedules()) {
        if (!schedule.enabled) continue;
        const due = dueTimeToday(schedule, now);
        if (due === null || now < due || now - due > CATCH_UP_MS) continue;
        if ((schedule.last_run_at ?? 0) >= due) continue;
        if ((this.retryAt.get(schedule.id) ?? 0) > now) continue;
        const today = dayKey(new Date(now));
        const runsToday = schedule.runs_day === today ? schedule.runs_today : 0;
        if (runsToday >= schedule.max_per_day) continue;
        if (this.openRun(schedule)) continue;
        const ref = await this.fire(schedule, { automatic: true });
        if (ref) fired.push({ schedule: schedule.id, ...ref });
      }
      return fired;
    } finally {
      this.running = false;
    }
  }

  /** Giao việc của lịch ngay (nút "Chạy ngay"). Không tính vào trần ngày nhưng vẫn không chồng lên lần đang mở. */
  async runNow(id) {
    const schedule = this.store.getSchedule(id);
    if (!schedule) throw new UserError('Không có lịch này.');
    const open = this.openRun(schedule);
    if (open) throw new UserError(`Lần chạy trước (${open.kind === 'epic' ? 'yêu cầu' : 'việc lớn'} #${open.id}) vẫn chưa xong.`);
    const ref = await this.fire(schedule, { automatic: false });
    if (!ref) throw new UserError(this.store.getSchedule(id).last_error ?? 'Không giao được việc.');
    return ref;
  }

  async fire(schedule, { automatic }) {
    const template = this.getTemplates().find((t) => t.id === schedule.template);
    const fail = (message) => {
      this.store.updateSchedule(schedule.id, { last_error: message });
      this.retryAt.set(schedule.id, this.now() + RETRY_AFTER_ERROR_MS);
      this.log(`Lịch "${schedule.name}" không chạy được: ${message}`);
      return null;
    };
    if (!template) return fail(`Mẫu "${schedule.template}" không còn.`);
    try {
      this.reload();
      const filled = renderTemplate(template, JSON.parse(schedule.params));
      const made = filled.kind === 'epic'
        ? await this.runner.epics.create({ title: filled.title, prompt: filled.prompt, acceptance: filled.acceptance })
        : await this.runner.jobs.create({ team: filled.team, title: filled.title, prompt: filled.prompt, acceptance: filled.acceptance });
      const ref = { kind: filled.kind, id: made.id };
      const now = this.now();
      const today = dayKey(new Date(now));
      const runsToday = (schedule.runs_day === today ? schedule.runs_today : 0) + (automatic ? 1 : 0);
      this.store.updateSchedule(schedule.id, {
        last_run_at: now, last_ref: JSON.stringify(ref), last_error: null, runs_day: today, runs_today: runsToday,
      });
      this.retryAt.delete(schedule.id);
      this.log(`Lịch "${schedule.name}" đã giao ${filled.kind === 'epic' ? 'yêu cầu' : 'việc lớn'} #${made.id}.`);
      return ref;
    } catch (err) {
      if (err instanceof UserError || err.constructor?.name === 'JobError') return fail(err.message);
      throw err;
    }
  }
}
