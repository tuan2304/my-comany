import { UserError } from './errors.mjs';

/**
 * Báo cáo tuần: gom từ bảng việc đã có, chỉ đọc nên không tốn hạn mức.
 * Tuần theo chuẩn ISO (thứ Hai đến Chủ nhật), giờ máy. Lượng dùng tính vào tuần chứa lúc việc kết thúc.
 */

const WEEK = /^(\d{4})-W(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Thứ Hai 00:00 (giờ máy) của tuần ISO `week` trong năm `year`. */
export function isoWeekStart(year, week) {
  // Ngày 4/1 luôn thuộc tuần 1 của năm theo ISO.
  const jan4 = new Date(year, 0, 4);
  const dow = (jan4.getDay() + 6) % 7; // 0 = thứ Hai
  const start = new Date(year, 0, 4 - dow);
  start.setDate(start.getDate() + (week - 1) * 7);
  return start;
}

/** Mã tuần ISO ("2026-W45") của một thời điểm. */
export function isoWeekOf(ts) {
  const date = new Date(ts);
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // Thứ Năm của tuần đó quyết định năm ISO.
  day.setDate(day.getDate() + 3 - ((day.getDay() + 6) % 7));
  const year = day.getFullYear();
  const week = 1 + Math.round(((day.getTime() - new Date(year, 0, 4).getTime()) / DAY_MS - 3 + ((new Date(year, 0, 4).getDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Khoảng [from, to) của một tuần; không truyền mã thì lấy tuần chứa `now`. */
export function weekRange(code, now = Date.now()) {
  const label = code || isoWeekOf(now);
  const match = WEEK.exec(label);
  if (!match) throw new UserError('Tuần phải có dạng 2026-W45.');
  const week = Number(match[2]);
  if (week < 1 || week > 53) throw new UserError('Số tuần phải từ 1 đến 53.');
  const start = isoWeekStart(Number(match[1]), week);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  // Mã tuần 53 của năm chỉ có 52 tuần sẽ lệch sang năm sau: từ chối thay vì trả về tuần của năm khác.
  if (isoWeekOf(start.getTime()) !== label) throw new UserError(`Năm ${match[1]} không có tuần ${match[2]}.`);
  return { label, from: start.getTime(), to: end.getTime() };
}

export function shiftWeek(label, delta) {
  const { from } = weekRange(label);
  const moved = new Date(from);
  moved.setDate(moved.getDate() + delta * 7 + 3); // +3 để rơi giữa tuần, tránh sai lệch giờ mùa hè
  return isoWeekOf(moved.getTime());
}

const WORK_DONE = new Set(['done', 'submitted']);

function emptyBucket() {
  return {
    finished: 0, work_done: 0, work_failed: 0, work_stopped: 0, revisions: 0, turns: 0, duration_ms: 0,
    input_tokens: 0, output_tokens: 0, cache_tokens: 0, est_cost_usd: 0,
  };
}

function add(bucket, task) {
  bucket.finished += 1;
  if (task.kind === 'work') {
    if (WORK_DONE.has(task.status)) bucket.work_done += 1;
    else if (task.status === 'failed') bucket.work_failed += 1;
    else if (task.status === 'stopped') bucket.work_stopped += 1;
    bucket.revisions += task.revisions ?? 0;
  }
  bucket.turns += task.turns ?? 0;
  bucket.duration_ms += task.duration_ms ?? 0;
  bucket.input_tokens += task.input_tokens ?? 0;
  bucket.output_tokens += task.output_tokens ?? 0;
  bucket.cache_tokens += (task.cache_read_tokens ?? 0) + (task.cache_creation_tokens ?? 0);
  bucket.est_cost_usd += task.est_cost_usd ?? 0;
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) out[row[key]] = (out[row[key]] ?? 0) + 1;
  return out;
}

function totalsFor(store, from, to) {
  const tasks = store.tasksFinishedBetween(from, to);
  const total = emptyBucket();
  for (const t of tasks) add(total, t);
  return { total, tasks };
}

/**
 * @param {import('./db.mjs').Store} store
 * @param {{ week?: string, now?: number, teamNames?: Record<string,string> }} [options]
 */
export function weeklyReport(store, { week, now = Date.now(), teamNames = {} } = {}) {
  const range = weekRange(week, now);
  const { total, tasks } = totalsFor(store, range.from, range.to);

  const byTeam = new Map();
  const byMember = new Map();
  for (const t of tasks) {
    if (!byTeam.has(t.team)) byTeam.set(t.team, emptyBucket());
    add(byTeam.get(t.team), t);
    // Lượt của Trưởng nhóm và Giám đốc (kế hoạch, duyệt bài) tính cho người đó, nhưng xếp hạng "làm nhiều nhất" chỉ nhìn việc kind=work.
    const key = `${t.team}\u0000${t.member}`;
    if (!byMember.has(key)) byMember.set(key, { team: t.team, member: t.member, ...emptyBucket(), lead_runs: 0, answers: 0 });
    const m = byMember.get(key);
    add(m, t);
    if (t.kind === 'answer') m.answers += 1;
    else if (t.kind !== 'work') m.lead_runs += 1;
  }

  const teams = [...byTeam.entries()]
    .map(([id, b]) => ({ id, name: teamNames[id] ?? id, ...b }))
    .sort((a, b) => b.work_done - a.work_done || b.output_tokens - a.output_tokens);
  const members = [...byMember.values()].sort(
    (a, b) => b.work_done - a.work_done || b.output_tokens - a.output_tokens || a.member.localeCompare(b.member, 'vi'),
  );

  const jobs = store.jobsFinishedBetween(range.from, range.to);
  const epics = store.epicsFinishedBetween(range.from, range.to);

  const samples = store.quotaSamplesBetween(range.from, range.to);
  const peak = (key) => samples.reduce((max, s) => (s[key] !== null && s[key] > max ? s[key] : max), -1);
  const last = samples.at(-1) ?? null;
  const prevLabel = shiftWeek(range.label, -1);
  const prevRange = weekRange(prevLabel);
  const previous = totalsFor(store, prevRange.from, prevRange.to).total;

  return {
    week: range.label,
    next_week: shiftWeek(range.label, 1),
    current_week: isoWeekOf(now),
    from: range.from,
    to: range.to,
    generated_at: now,
    total,
    previous: { week: prevLabel, ...previous },
    teams,
    members,
    jobs: { finished: jobs.length, by_status: countBy(jobs, 'status') },
    epics: { finished: epics.length, by_status: countBy(epics, 'status'), rework_rounds: epics.reduce((n, e) => n + (e.round ?? 0), 0) },
    quota: {
      samples: samples.length,
      peak_five_hour: peak('five_hour') >= 0 ? peak('five_hour') : null,
      peak_seven_day: peak('seven_day') >= 0 ? peak('seven_day') : null,
      last_five_hour: last?.five_hour ?? null,
      last_seven_day: last?.seven_day ?? null,
      blocked_events: store.countEventsBetween('quota', range.from, range.to),
    },
  };
}

const pct = (v) => (v === null || v === undefined ? 'chưa có dữ liệu' : `${Math.round(v * 100)}%`);
const hours = (ms) => (ms / 3_600_000).toFixed(1);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

function delta(now, before, unit = '') {
  if (before === 0 && now === 0) return '';
  const diff = now - before;
  if (diff === 0) return ' (bằng tuần trước)';
  return ` (${diff > 0 ? '+' : ''}${fmt(diff)}${unit} so với tuần trước)`;
}

/** Bản Markdown của báo cáo, để lưu hoặc gửi đi. */
export function reportToMarkdown(report) {
  const day = (ts) => new Date(ts).toLocaleDateString('vi-VN');
  const t = report.total;
  const lines = [
    `# Báo cáo tuần ${report.week}`,
    `${day(report.from)} đến ${day(report.to - 1)}`,
    '',
    '## Tổng quan',
    `- Việc làm của nhân viên đã xong: **${t.work_done}**${delta(t.work_done, report.previous.work_done)}; lỗi ${t.work_failed}, bị dừng ${t.work_stopped}, số lần bị trả bài ${t.revisions}.`,
    `- Việc lớn kết thúc: ${report.jobs.finished}${statusText(report.jobs.by_status)}; yêu cầu kết thúc: ${report.epics.finished}${statusText(report.epics.by_status)}.`,
    `- Thời gian chạy của các tiến trình: ${hours(t.duration_ms)} giờ, ${fmt(t.turns)} lượt, ${fmt(t.output_tokens)} token ra, ${fmt(t.cache_tokens)} token cache.`,
    `- Ước tính giá API tương đương: $${t.est_cost_usd.toFixed(2)} (bạn dùng gói Pro nên không bị tính khoản này; chỉ để so sánh giữa các team).`,
    '',
    '## Hạn mức Pro',
  ];
  const q = report.quota;
  if (q.samples === 0) lines.push('- Chưa có dữ liệu hạn mức trong tuần này (bảng ghi hạn mức chỉ bắt đầu từ khi có chức năng báo cáo).');
  else {
    lines.push(`- Đỉnh theo 5 giờ: ${pct(q.peak_five_hour)}; đỉnh theo 7 ngày: ${pct(q.peak_seven_day)}; mức cuối tuần: ${pct(q.last_seven_day)}.`);
    lines.push(`- Số lần chạm trần (bị chặn): ${q.blocked_events}.`);
  }
  lines.push('', '## Theo team', '| Team | Việc xong | Bị trả | Lỗi | Giờ chạy | Token ra | Giá API ước tính |', '|---|---:|---:|---:|---:|---:|---:|');
  for (const team of report.teams) {
    lines.push(`| ${team.name} | ${team.work_done} | ${team.revisions} | ${team.work_failed} | ${hours(team.duration_ms)} | ${fmt(team.output_tokens)} | $${team.est_cost_usd.toFixed(2)} |`);
  }
  if (report.teams.length === 0) lines.push('| (không có việc nào kết thúc trong tuần) | | | | | | |');
  lines.push('', '## Ai làm nhiều nhất', '| # | Người | Team | Việc xong | Bị trả | Lượt Trưởng nhóm/Giám đốc | Token ra |', '|---:|---|---|---:|---:|---:|---:|');
  report.members.slice(0, 10).forEach((m, i) => {
    lines.push(`| ${i + 1} | ${m.member} | ${report.teams.find((x) => x.id === m.team)?.name ?? m.team} | ${m.work_done} | ${m.revisions} | ${m.lead_runs} | ${fmt(m.output_tokens)} |`);
  });
  if (report.members.length === 0) lines.push('| | (chưa có ai) | | | | | |');
  return `${lines.join('\n')}\n`;
}

function statusText(byStatus) {
  const parts = Object.entries(byStatus).map(([k, n]) => `${k}: ${n}`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}
