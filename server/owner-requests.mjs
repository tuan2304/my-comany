/**
 * Những thứ đang chờ chính chủ (bạn): duyệt kế hoạch, duyệt kết quả, việc cần xem (xung đột, vượt giới hạn), hoặc việc bị lỗi cần bạn chọn cách xử lý.
 * Cùng quy tắc với `ownerRequests` ở src/office/status.ts (giao diện); tests/push.test.mjs kiểm hai bên luôn khớp nhau.
 * Máy chủ chạy bằng Node thuần nên không nạp trực tiếp tệp .ts đó.
 */
export const EPIC_OWNER_STATUSES = new Set(['awaiting_plan', 'awaiting_result', 'attention', 'failed']);

// Việc lớn đã kết thúc thì không xử lý riêng từng việc con nữa (giống JOB_TERMINAL ở jobs.mjs).
const JOB_FINISHED = new Set(['done', 'attention', 'failed', 'stopped']);

export function ownerRequests(epics, jobs, tasks = []) {
  const out = [];
  for (const e of epics) {
    if (EPIC_OWNER_STATUSES.has(e.status)) out.push({ kind: 'epic', id: e.id, title: e.title, status: e.status, who: e.director });
  }
  for (const j of jobs) {
    // Việc lớn lẻ "cần xem" hoặc "lỗi": chủ còn cứu được (xử lý việc con lỗi, hoặc cho Trưởng nhóm lập kế hoạch lại).
    if (j.epic_id === null && (j.status === 'attention' || j.status === 'failed')) out.push({ kind: 'job', id: j.id, title: j.title, status: j.status, who: j.lead });
    // Thi đấu skill: hai bản đã nộp và chụp ảnh xong, chờ chủ chọn (bấm vào Trưởng nhóm).
    if (j.status === 'awaiting_choice') out.push({ kind: 'job', id: j.id, title: j.title, status: j.status, who: j.lead });
  }
  // Việc "làm" cần chủ: bị lỗi (chọn cách xử lý) hoặc đang hỏi chủ một câu (ask_owner). Chỉ tính việc lẻ, hoặc việc con của
  // một việc lớn còn đang chạy (chủ còn kịp cứu trước khi việc lớn kết thúc).
  const openJobs = new Set(jobs.filter((j) => !JOB_FINISHED.has(j.status)).map((j) => j.id));
  for (const t of tasks) {
    if (t.kind !== 'work') continue;
    const status = t.status === 'failed' ? 'failed' : t.status === 'waiting_answer' && t.ask_owner_id != null ? 'asking' : null;
    if (!status) continue;
    const own = t.job_id == null ? t.epic_id == null : openJobs.has(t.job_id);
    if (own) out.push({ kind: 'task', id: t.id, title: t.title, status, who: t.member });
  }
  return out;
}
