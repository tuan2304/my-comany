/**
 * Luồng giấy tờ và đường đi trong văn phòng (mục 5 của KE-HOACH.md). Hàm thuần, không dùng WebGL, nên kiểm thử được
 * bằng Node. Chỉ dùng cú pháp TypeScript "xóa được" và không import mã chạy từ file khác (như layout.ts).
 */
import type { Epic, Job, Task } from '../lib/types';
import type { OfficeLayout, PersonSpot } from './layout';
import type { Place } from './status';

/** Điểm đầu/cuối đặc biệt của một tờ giấy (ngoài tên người). */
export const OWNER = '@owner';
export const CABINET = '@cabinet';

export type FlowKind = 'assign' | 'report' | 'return' | 'file' | 'ask' | 'reply';

/** Một tờ giấy đi từ `from` tới `to`. `from`/`to` là tên người, OWNER hoặc CABINET. */
export interface Flow {
  kind: FlowKind;
  from: string;
  to: string;
}

export interface Snapshot {
  tasks: Task[];
  jobs: Job[];
  epics: Epic[];
}

/** Một lần cập nhật hàng loạt (nối lại sau khi mất kết nối) không được biến thành cơn mưa giấy. */
export const MAX_FLOWS_PER_DIFF = 12;

const byId = <T extends { id: number }>(list: T[]): Map<number, T> => new Map(list.map((x) => [x.id, x]));

/**
 * Những tờ giấy cần bay giữa hai lần cập nhật dữ liệu:
 *  - bạn tạo yêu cầu: Chủ → Giám đốc; Giám đốc giao việc lớn: Giám đốc → Trưởng nhóm; bạn giao thẳng việc lớn: Chủ → Trưởng nhóm;
 *  - Trưởng nhóm chia việc: Trưởng nhóm → nhân viên (việc lẻ bạn giao: Chủ → nhân viên);
 *  - nhân viên nộp bài: nhân viên → Trưởng nhóm; bị trả lại làm lại: Trưởng nhóm → nhân viên (giấy đỏ);
 *  - nhân viên hỏi người khác: giấy vàng từ người hỏi tới người được hỏi, trả lời xong thì giấy tím bay lại;
 *  - xong việc, xong việc lớn, xong yêu cầu: vào tủ hồ sơ; kế hoạch hoặc kết quả chờ bạn duyệt: Giám đốc → Chủ.
 */
export function diffFlows(prev: Snapshot, next: Snapshot): Flow[] {
  const prevTasks = byId(prev.tasks);
  const prevJobs = byId(prev.jobs);
  const prevEpics = byId(prev.epics);
  const nextJobs = byId(next.jobs);
  const nextEpics = byId(next.epics);
  const out: Flow[] = [];

  for (const epic of next.epics) {
    const before = prevEpics.get(epic.id);
    if (!before) {
      out.push({ kind: 'assign', from: OWNER, to: epic.director });
      continue;
    }
    if (before.status === epic.status) continue;
    if (epic.status === 'awaiting_plan' || epic.status === 'awaiting_result') out.push({ kind: 'report', from: epic.director, to: OWNER });
    else if (epic.status === 'done') out.push({ kind: 'file', from: epic.director, to: CABINET });
  }

  for (const job of next.jobs) {
    const before = prevJobs.get(job.id);
    if (!before) {
      const epic = job.epic_id === null ? undefined : nextEpics.get(job.epic_id);
      out.push({ kind: 'assign', from: epic ? epic.director : OWNER, to: job.lead });
    } else if (before.status !== 'done' && job.status === 'done') {
      out.push({ kind: 'file', from: job.lead, to: CABINET });
    }
  }

  const nextTasks = byId(next.tasks);
  for (const task of next.tasks) {
    // Câu hỏi giữa nhân viên: người hỏi → người được hỏi khi có lượt trả lời mới; người trả lời → người hỏi khi trả lời xong.
    if (task.kind === 'answer') {
      const asker = task.subject_id === null ? undefined : nextTasks.get(task.subject_id);
      const before = prevTasks.get(task.id);
      if (asker && !before) out.push({ kind: 'ask', from: asker.member, to: task.member });
      else if (asker && before && before.status !== 'done' && task.status === 'done') out.push({ kind: 'reply', from: task.member, to: asker.member });
      continue;
    }
    if (task.kind !== 'work') continue;
    const job = task.job_id === null ? undefined : nextJobs.get(task.job_id);
    const before = prevTasks.get(task.id);
    if (!before) {
      out.push({ kind: 'assign', from: job ? job.lead : OWNER, to: task.member });
      continue;
    }
    if (job && before.status === 'running' && task.status === 'submitted') out.push({ kind: 'report', from: task.member, to: job.lead });
    if (job && task.revisions > before.revisions) out.push({ kind: 'return', from: job.lead, to: task.member });
    if (before.status !== 'done' && task.status === 'done') out.push({ kind: 'file', from: task.member, to: CABINET });
  }

  return out.slice(0, MAX_FLOWS_PER_DIFF);
}

// ---------------------------------------------------------------------------------------------------------------
// Chỗ đứng và đường đi
// ---------------------------------------------------------------------------------------------------------------

export interface Pt {
  x: number;
  z: number;
}

/** Chỗ đứng ở một nơi: vị trí và hướng nhìn (radian quanh trục y; 0 là nhìn về +z, π là nhìn về -z). */
export interface Stand extends Pt {
  face: number;
}

/** Độ rộng thân người khi kiểm tra va chạm với bàn. */
export const BODY_RADIUS = 0.3;
export const DESK_HALF_W = 1.15;
export const DESK_HALF_D = 0.6;

const room = (layout: OfficeLayout, id: string) => layout.rooms.find((r) => r.id === id);

/** Cột x của cửa một phòng (tâm cửa). Phòng không có cửa thì dùng tâm phòng. */
export function doorX(layout: OfficeLayout, id: string): number {
  const tile = layout.tiles.find((t) => t.id === id);
  if (!tile) return 0;
  return tile.x + (tile.door ? (tile.door.from + tile.door.to) / 2 : 0);
}

/**
 * Chỗ đứng của người thứ `slot` (trong `count` người cùng tới một nơi) ở `place`. Các nơi chỉ có chỗ hạn chế
 * (thư viện, phòng server, phòng họp, pantry, WC, cửa sổ) xếp vài người một hàng rồi sang hàng sau.
 */
export function standSpot(layout: OfficeLayout, person: PersonSpot, place: Place, slot: number, count: number): Stand {
  if (place === 'library') {
    const r = room(layout, 'library');
    if (r) return { x: r.x + ((slot % 3) - 1) * 0.9, z: r.z + 1.1 + Math.floor(slot / 3) * 0.5, face: Math.PI };
  }
  if (place === 'server') {
    const r = room(layout, 'server');
    if (r) return { x: r.x - 1.2 + (slot % 4) * 0.8, z: r.z + 0.1 + Math.floor(slot / 4) * 0.8, face: Math.PI };
  }
  if (place === 'whiteboard') {
    const r = room(layout, 'director');
    if (r) return { x: r.x + (slot - (count - 1) / 2) * 1.4, z: r.z - r.d / 2 + 0.95, face: Math.PI };
  }
  if (place === 'meeting') {
    const r = room(layout, slot < 4 ? 'meeting1' : 'meeting2');
    const local = slot % 4;
    if (r) return { x: r.x + (local % 2 === 0 ? -0.9 : 0.9), z: r.z + 1.2 + Math.floor(local / 2) * 0.9, face: Math.PI };
  }
  if (place === 'pantry') {
    const r = room(layout, 'pantry');
    if (r) return { x: r.x + ((slot % 4) - 1.5) * 1.2, z: r.z + r.d / 2 - 1.55 - Math.floor(slot / 4) * 0.9, face: 0 };
  }
  if (place === 'wc') {
    const r = room(layout, 'wc');
    if (r) return { x: r.x + (slot % 2 === 0 ? -0.8 : 0.8), z: r.z - r.d / 2 + 1.3 + Math.floor(slot / 2) * 1.2, face: 0 };
  }
  if (place === 'window') {
    const left = slot % 2 === 0;
    const lane = left ? layout.lanes[0] : layout.lanes[layout.lanes.length - 1];
    return { x: lane + (left ? -0.55 : 0.55), z: -2.2 + Math.floor(slot / 2) * 1.2, face: left ? -Math.PI / 2 : Math.PI / 2 };
  }
  if (place === 'lounge') {
    const l = layout.lounge;
    const cols = Math.max(Math.ceil(count / 2), 1);
    const step = cols > 1 ? Math.min(2.4, (l.w - 6.8) / (cols - 1)) : 0; // thẻ tên rộng khoảng 2,6 m nên đứng thưa ra để không đè lên nhau
    return { x: l.x + (Math.floor(slot / 2) - (cols - 1) / 2) * step, z: l.z + (slot % 2 === 0 ? -0.3 : 0.6), face: 0 };
  }
  return { x: person.x, z: person.z, face: person.facing };
}

/** Điểm nơi một chỗ đứng nối vào mạng lối đi, cùng đoạn đường từ chỗ đứng tới đó. */
interface Access {
  at: Pt;
  spur: Pt[];
}

function accessOf(layout: OfficeLayout, person: PersonSpot, place: Place, point: Pt): Access {
  const back = layout.aisleBackZ;
  const front = layout.aisleFrontZ;
  const via = (x: number, z: number): Access => ({ at: { x, z }, spur: [point, { x, z: point.z }, { x, z }] });
  if (place === 'desk') {
    // Giám đốc ngồi trong phòng riêng nên ra bằng cửa phòng; còn lại đi ngược về phía lưng ghế: hàng bắc ra lối sau, hàng nam ra lối trước.
    if (person.isDirector) return via(doorX(layout, 'director'), back);
    const z = person.facing === 0 ? back : front;
    return { at: { x: point.x, z }, spur: [point, { x: point.x, z }] };
  }
  if (place === 'whiteboard') return via(doorX(layout, 'director'), back);
  if (place === 'library' || place === 'server') return via(doorX(layout, place), back);
  if (place === 'meeting') {
    const m1 = room(layout, 'meeting1');
    const m2 = room(layout, 'meeting2');
    const nearer = m1 && m2 && Math.abs(point.x - m1.x) <= Math.abs(point.x - m2.x) ? 'meeting1' : 'meeting2';
    return via(doorX(layout, nearer), back);
  }
  if (place === 'wc') return via(doorX(layout, 'wc'), front);
  if (place === 'window') {
    const lane = point.x < 0 ? layout.lanes[0] : layout.lanes[layout.lanes.length - 1];
    const z = Math.abs(point.z - back) < Math.abs(point.z - front) ? back : front;
    return via(lane, z);
  }
  // pantry, khu nghỉ: mở về phía lối đi trước, đi thẳng lên.
  return { at: { x: point.x, z: front }, spur: [point, { x: point.x, z: front }] };
}

const same = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;

/** Đi giữa hai điểm của mạng lối đi: cùng một lối ngang thì đi thẳng; khác lối thì đi qua lối dọc gần nhất. */
function network(layout: OfficeLayout, a: Pt, b: Pt): Pt[] {
  if (a.z === b.z) return [a, b];
  let lane = layout.lanes[0];
  let best = Infinity;
  for (const l of layout.lanes) {
    const cost = Math.abs(a.x - l) + Math.abs(l - b.x);
    if (cost < best) {
      best = cost;
      lane = l;
    }
  }
  return [a, { x: lane, z: a.z }, { x: lane, z: b.z }, b];
}

/**
 * Đường đi (các điểm gấp khúc, đoạn nào cũng song song với một trục) từ chỗ `from` tới chỗ `to`. Điểm đầu là `start`
 * (chỗ đang đứng), điểm cuối là `target`. Từ chỗ đang đứng ra lối đi (theo lưng ghế, hoặc qua cửa phòng), đi trên mạng
 * lối đi (hai lối ngang và các lối dọc), rồi vào nơi đến theo chiều ngược lại.
 */
export function planPath(layout: OfficeLayout, person: PersonSpot, from: Place, start: Pt, to: Place, target: Pt): Pt[] {
  const out: Pt[] = [start];
  const push = (p: Pt) => {
    if (!same(out[out.length - 1], p)) out.push(p);
  };
  if (from === to) {
    push(target);
    return out;
  }
  // Giám đốc đi giữa bàn và bảng trắng ngay trong phòng.
  if (person.isDirector && ((from === 'desk' && to === 'whiteboard') || (from === 'whiteboard' && to === 'desk'))) {
    const dx = doorX(layout, 'director');
    push({ x: dx, z: start.z });
    push({ x: dx, z: target.z });
    push(target);
    return out;
  }
  const a = accessOf(layout, person, from, start);
  const b = accessOf(layout, person, to, target);
  for (const p of a.spur) push(p);
  for (const p of network(layout, a.at, b.at)) push(p);
  for (const p of [...b.spur].reverse()) push(p);
  return out;
}

/** Chiều dài của đường đi. */
export function pathLength(path: Pt[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) total += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  return total;
}

/** Đồ đạc nào (cây, sofa, quầy, tủ) mà đường đi cắt qua, hoặc null. Dùng để kiểm thử. */
export function obstacleHitBy(layout: OfficeLayout, path: Pt[]): string | null {
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    const steps = Math.max(Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1), 1);
    for (let s = 0; s <= steps; s += 1) {
      const x = a.x + ((b.x - a.x) * s) / steps;
      const z = a.z + ((b.z - a.z) * s) / steps;
      for (const o of layout.furniture) {
        if (Math.abs(x - o.x) < o.hw + BODY_RADIUS && Math.abs(z - o.z) < o.hd + BODY_RADIUS) return o.id;
      }
    }
  }
  return null;
}

/** Bàn nào (của người khác hoặc của chính mình) mà đường đi cắt qua, hoặc null. Dùng để kiểm thử. */
export function deskHitBy(layout: OfficeLayout, path: Pt[]): string | null {
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    const steps = Math.max(Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1), 1);
    for (let s = 0; s <= steps; s += 1) {
      const x = a.x + ((b.x - a.x) * s) / steps;
      const z = a.z + ((b.z - a.z) * s) / steps;
      for (const p of layout.people) {
        if (Math.abs(x - p.deskX) < DESK_HALF_W + BODY_RADIUS && Math.abs(z - p.deskZ) < DESK_HALF_D + BODY_RADIUS) return p.name;
      }
    }
  }
  return null;
}
