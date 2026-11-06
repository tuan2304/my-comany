/**
 * Những thứ đang chờ chính chủ (bạn): duyệt kế hoạch, duyệt kết quả, hoặc việc cần xem (xung đột, vượt giới hạn).
 * Cùng quy tắc với `ownerRequests` ở src/office/status.ts (giao diện); tests/push.test.mjs kiểm hai bên luôn khớp nhau.
 * Máy chủ chạy bằng Node thuần nên không nạp trực tiếp tệp .ts đó.
 */
export const EPIC_OWNER_STATUSES = new Set(['awaiting_plan', 'awaiting_result', 'attention']);

export function ownerRequests(epics, jobs) {
  const out = [];
  for (const e of epics) {
    if (EPIC_OWNER_STATUSES.has(e.status)) out.push({ kind: 'epic', id: e.id, title: e.title, status: e.status, who: e.director });
  }
  for (const j of jobs) {
    if (j.epic_id === null && j.status === 'attention') out.push({ kind: 'job', id: j.id, title: j.title, status: j.status, who: j.lead });
  }
  return out;
}
