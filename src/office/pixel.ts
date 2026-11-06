import { CABINET, OWNER, type Flow, type FlowKind } from './flow';
import { TEAM_COLORS, type OfficeLayout } from './layout';
import { lookFor } from './look';
import type { OfficeScene, SceneDebug, SceneOptions } from './scene-types';
import type { Action, Actor, OfficeSim } from './sim';
import { bubbleOf, formatCountdown, IDLE_VIEW, lampOf, type Lamp } from './status';
import * as S from './sprites';
import { CHAIR_COLORS, chairTop, deskTop, disc, drawDecor, drawFurniture, drawPerson, ellipse, rect, type Arms, type G } from './topdown';

/**
 * Bộ vẽ 2D pixel art nhìn thẳng từ trên xuống như một mặt bằng văn phòng: 16 px = 1 mét, vẽ ra khung nhỏ rồi phóng to
 * nguyên bước (không làm mờ). Phần tĩnh (sàn, tường, đồ đạc) vẽ một lần; mỗi khung chỉ vẽ lại phần động.
 */

const U = S.U;
const FRAME_MS = 40;
const LAMP_HEX: Record<Lamp, string> = {
  needs_you: '#facc15', overload: '#f97316', working: '#22c55e', waiting: '#3b82f6', queued: '#f59e0b', failed: '#ef4444', idle: '#94a3b8',
};
const PAPER_HEX: Record<FlowKind, string> = { assign: '#fffbeb', report: '#93c5fd', return: '#f87171', file: '#86efac', ask: '#fde047', reply: '#c4b5fd' };
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6];
const OUTER_PX = 5;
const INNER_PX = 3;

const hexOf = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

function newCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(Math.ceil(w), 1);
  c.height = Math.max(Math.ceil(h), 1);
  const g = c.getContext('2d') as G;
  g.imageSmoothingEnabled = false;
  return { c, g };
}

/** Đường thẳng pixel (Bresenham). */
function line(g: G, color: string, x0: number, y0: number, x1: number, y1: number) {
  g.fillStyle = color;
  let x = Math.round(x0);
  let y = Math.round(y0);
  const ex = Math.round(x1);
  const ey = Math.round(y1);
  const dx = Math.abs(ex - x);
  const dy = -Math.abs(ey - y);
  const sx = x < ex ? 1 : -1;
  const sy = y < ey ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 400; i += 1) {
    g.fillRect(x, y, 1, 1);
    if (x === ex && y === ey) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

interface Paper {
  from: { x: number; z: number; h: number };
  to: { x: number; z: number; h: number };
  t0: number;
  dur: number;
  arc: number;
  kind: FlowKind;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  color: string;
}
interface Label {
  text: string;
  dot: string | null;
  x: number; // px trong khung nhỏ
  y: number;
  /** Bề ngang chỗ có để đặt nhãn (px trong khung nhỏ); nhãn dài hơn thì được rút gọn cho khỏi đè nhãn bên cạnh. */
  room: number;
  dynamic?: boolean;
  zone?: boolean;
  /** Nhãn phòng kiểu mặt bằng kiến trúc: chữ đậm có viền sáng, không có khung. */
  plain?: boolean;
}

/** Dựng văn phòng 2D pixel art của một tầng trong `host`. Bộ mô phỏng được truyền vào để 3D và 2D dùng chung (đổi chế độ không làm mọi người đi lại từ đầu). */
export function createPixelScene(host: HTMLElement, layout: OfficeLayout, options: SceneOptions, sim: OfficeSim): OfficeScene {
  const motion = !options.reducedMotion;
  const night = options.dark;
  const { walls } = layout;

  // ---------- Khung thế giới: tòa nhà, vỉa hè và con đường phía trước ----------
  const minX = walls.minX - 4;
  const minZ = walls.minZ - 4;
  const maxX = walls.maxX + 4;
  const maxZ = walls.maxZ + 8.6;
  const baseW = Math.ceil((maxX - minX) * U);
  const baseH = Math.ceil((maxZ - minZ) * U);
  const bx = (x: number) => (x - minX) * U;
  const by = (z: number) => (z - minZ) * U;

  const display = document.createElement('canvas');
  display.style.display = 'block';
  display.style.width = '100%';
  display.style.height = '100%';
  display.style.imageRendering = 'pixelated';
  host.appendChild(display);
  const dctx = display.getContext('2d');
  if (!dctx) throw new Error('Không tạo được canvas 2D');
  const { c: base, g: bg } = newCanvas(baseW, baseH);
  const { c: world, g: wg } = newCanvas(baseW, baseH);

  // =============================== Lớp tĩnh ===============================
  const fill = (g: G, tile: HTMLCanvasElement, x: number, y: number, w: number, h: number) => {
    g.save();
    g.translate(Math.round(x), Math.round(y));
    g.fillStyle = g.createPattern(tile, 'repeat') ?? '#888';
    g.fillRect(0, 0, Math.round(w), Math.round(h));
    g.restore();
  };
  const trim = (g: G, color: string, x: number, y: number, w: number, h: number) => {
    g.fillStyle = color;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), 1);
    g.fillRect(Math.round(x), Math.round(y + h - 1), Math.round(w), 1);
    g.fillRect(Math.round(x), Math.round(y), 1, Math.round(h));
    g.fillRect(Math.round(x + w - 1), Math.round(y), 1, Math.round(h));
  };
  const SW = 1.6; // vỉa hè
  const roadZ0 = walls.maxZ + SW + 0.6;
  const ROAD_H = 4.4;
  // cỏ, vỉa hè, đường
  fill(wg, S.floorTile('grass', night ? '#2f6a4a' : '#7cc47f'), 0, 0, baseW, baseH);
  fill(wg, S.floorTile('stone', '#d8d2dc'), bx(walls.minX - SW), by(walls.minZ - SW), (walls.maxX - walls.minX + SW * 2) * U, (walls.maxZ - walls.minZ + SW * 2) * U);
  fill(wg, S.floorTile('asphalt', '#5d586d'), 0, by(roadZ0), baseW, ROAD_H * U);
  rect(wg, '#2a2540', 0, by(roadZ0) - 1, baseW, 1);
  rect(wg, '#2a2540', 0, by(roadZ0) + ROAD_H * U, baseW, 1);
  for (let x = 4; x < baseW; x += 26) rect(wg, '#f2eeee', x, by(roadZ0) + (ROAD_H * U) / 2 - 1, 14, 2);
  for (let i = 0; i < 7; i += 1) rect(wg, '#f2eeee', bx(walls.minX + 2) + i * 5, by(roadZ0) + 3, 3, ROAD_H * U - 6); // vạch qua đường
  fill(wg, S.floorTile('stone', '#d8d2dc'), 0, by(roadZ0) + ROAD_H * U + 1, baseW, baseH);
  // xe nhìn từ trên
  const car = (x: number, y: number, w: number, color: string) => {
    rect(wg, 'rgba(30,20,50,0.3)', x + 2, y + 2, w, 13);
    rect(wg, '#2a2540', x, y, w, 13);
    rect(wg, color, x + 1, y + 1, w - 2, 11);
    rect(wg, S.lighten(color, 0.2), x + 1, y + 1, w - 2, 2);
    rect(wg, '#9fd4ee', x + Math.round(w * 0.55), y + 2, Math.round(w * 0.2), 9);
    rect(wg, '#9fd4ee', x + 4, y + 3, 4, 7);
    rect(wg, '#fff1b0', x + w - 3, y + 2, 2, 2);
    rect(wg, '#fff1b0', x + w - 3, y + 9, 2, 2);
  };
  car(bx(walls.minX + 6), by(roadZ0) + 5, 30, '#6cc4c4');
  car(bx(walls.minX + 26), by(roadZ0) + 36, 30, '#e86f8f');
  car(bx(walls.maxX - 8), by(roadZ0) + 5, 30, '#f0a44b');
  // cây nhìn từ trên (tán tròn nhiều lớp)
  const tree = (x: number, y: number, r: number, seed: number) => {
    const greens = ['#3f9a5a', '#4aa968', '#5cc07a', '#7ad493'];
    ellipse(wg, 'rgba(30,20,50,0.25)', x + 3, y + 3, r + 1, r);
    disc(wg, '#2f7a47', x, y, r + 1);
    [[0, 0, r], [-r * 0.45, -r * 0.3, r * 0.65], [r * 0.4, r * 0.25, r * 0.6]].forEach(([dx, dy, rr], i) => disc(wg, greens[(seed + i) % greens.length], x + dx, y + dy, rr));
    disc(wg, '#a6e6b8', x - r * 0.3, y - r * 0.35, Math.max(r * 0.25, 1));
  };
  let seed = 0;
  for (let x = walls.minX - 1; x <= walls.maxX + 1; x += 4.6) tree(bx(x), by(walls.minZ - 2.6), 9 + (seed % 3), seed++);
  for (let z = walls.minZ; z <= walls.maxZ; z += 4.2) {
    tree(bx(walls.minX - 2.6), by(z), 9 + (seed % 3), seed++);
    tree(bx(walls.maxX + 2.6), by(z), 9 + (seed % 3), seed++);
  }
  for (let x = walls.minX + 1; x <= walls.maxX; x += 9) tree(bx(x), by(roadZ0) + ROAD_H * U + 18, 8, seed++);
  // nền tòa nhà
  rect(wg, '#b9b2c0', bx(walls.minX) - 4, by(walls.minZ) - 4, (walls.maxX - walls.minX) * U + 8, (walls.maxZ - walls.minZ) * U + 8);
  fill(wg, S.floorTile('carpet', '#c9c2dc'), bx(walls.minX), by(walls.minZ), (walls.maxX - walls.minX) * U, (walls.maxZ - walls.minZ) * U);

  // sàn từng phòng, thảm, khu của team
  const floorKind = (style: string): S.FloorKind => (style === 'dark' ? 'carpet' : (style as S.FloorKind));
  for (const tile of layout.tiles) {
    if (tile.kind !== 'room') continue;
    fill(wg, S.floorTile(floorKind(tile.floor), hexOf(tile.color)), bx(tile.x - tile.w / 2), by(tile.z - tile.d / 2), tile.w * U, tile.d * U);
  }
  const softCorners = (g: G, x: number, y: number, w: number, h: number, under: string) => {
    for (const [cx, cy] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]]) rect(g, under, cx, cy, 1, 1);
  };
  for (const tile of layout.tiles) {
    if (tile.kind === 'room') continue;
    const x = Math.round(bx(tile.x - tile.w / 2));
    const y = Math.round(by(tile.z - tile.d / 2));
    const w = Math.round(tile.w * U);
    const h = Math.round(tile.d * U);
    if (tile.kind === 'zone') {
      const color = hexOf(TEAM_COLORS[tile.colorIndex % TEAM_COLORS.length]);
      fill(wg, S.floorTile('carpet', S.mix(color, '#ffffff', 0.55)), x, y, w, h);
      trim(wg, S.mix(color, '#2a2540', 0.15), x, y, w, h);
      trim(wg, S.mix(color, '#ffffff', 0.3), x + 2, y + 2, w - 4, h - 4);
      softCorners(wg, x, y, w, h, '#e8d9c3');
    } else {
      fill(wg, S.floorTile(floorKind(tile.floor), hexOf(tile.color)), x, y, w, h);
      trim(wg, S.darken(hexOf(tile.color), 0.25), x, y, w, h);
      softCorners(wg, x, y, w, h, '#e8d9c3');
    }
  }

  // bàn và ghế của từng người, bàn trống, đồ đạc
  const seatDir = (facing: number): 1 | -1 => (Math.cos(facing) > 0 ? 1 : -1);
  for (const p of layout.people) {
    deskTop(wg, bx(p.deskX), by(p.deskZ), seatDir(p.facing), p.colorIndex, true);
    chairTop(wg, bx(p.x), by(p.z), 0, seatDir(p.facing), CHAIR_COLORS[p.colorIndex % CHAIR_COLORS.length]);
  }
  for (const o of layout.furniture) {
    if (o.kind === 'desk') {
      const owner = o.id.startsWith('desk-owner');
      const dir = seatDir(o.facing);
      deskTop(wg, bx(o.x), by(o.z), dir, owner ? 5 : 3, owner);
      chairTop(wg, bx(o.x), by(o.z - 1.15 * Math.cos(o.facing)), 0, dir, owner ? '#f2c14e' : '#9aa5b8');
    } else drawFurniture(wg, o, bx(o.x), by(o.z));
  }

  // ---------- Tường: ngoài dày và tối (có ô cửa sổ), trong mảnh, kính nhạt ----------
  const wallColor = '#26232f';
  for (const w of layout.wallSegs) {
    const horizontal = w.z0 === w.z1;
    const t = w.kind === 'outer' ? OUTER_PX : INNER_PX;
    const x0 = bx(Math.min(w.x0, w.x1));
    const x1 = bx(Math.max(w.x0, w.x1));
    const z0 = by(Math.min(w.z0, w.z1));
    const z1 = by(Math.max(w.z0, w.z1));
    if (w.kind === 'outer') {
      if (horizontal) rect(wg, wallColor, x0 - t / 2, z0 - t / 2, x1 - x0 + t, t);
      else rect(wg, wallColor, x0 - t / 2, z0 - t / 2, t, z1 - z0 + t);
      // cửa sổ: dải sáng chen vào thân tường mỗi 3,6 m
      const len = horizontal ? x1 - x0 : z1 - z0;
      for (let d = 18; d + 34 < len; d += 58) {
        if (horizontal) {
          rect(wg, '#cfe8f5', x0 + d, z0 - 1, 34, 3);
          rect(wg, '#ffffff', x0 + d + 2, z0, 8, 1);
        } else {
          rect(wg, '#cfe8f5', x0 - 1, z0 + d, 3, 34);
          rect(wg, '#ffffff', x0, z0 + d + 2, 1, 8);
        }
      }
    } else if (w.kind === 'solid') {
      if (horizontal) {
        rect(wg, 'rgba(30,20,50,0.25)', x0, z0 + 2, x1 - x0, t);
        rect(wg, '#34303f', x0 - 1, z0 - 1, x1 - x0 + 2, t);
        rect(wg, '#56516a', x0 - 1, z0 - 1, x1 - x0 + 2, 1);
      } else {
        rect(wg, 'rgba(30,20,50,0.25)', x0 + 2, z0, t, z1 - z0);
        rect(wg, '#34303f', x0 - 1, z0 - 1, t, z1 - z0 + 2);
        rect(wg, '#56516a', x0 - 1, z0 - 1, 1, z1 - z0 + 2);
      }
    } else if (horizontal) {
      rect(wg, '#34303f', x0 - 1, z0 - 1, x1 - x0 + 2, t);
      rect(wg, '#a9cfe6', x0, z0, x1 - x0, 1);
      rect(wg, '#d7ecf7', x0, z0 - 1 + 1, x1 - x0, 0);
      for (let d = 0; d <= x1 - x0; d += 38) rect(wg, '#34303f', x0 + d - 1, z0 - 2, 3, t + 2);
    } else {
      rect(wg, '#34303f', x0 - 1, z0 - 1, t, z1 - z0 + 2);
      rect(wg, '#a9cfe6', x0, z0, 1, z1 - z0);
      for (let d = 0; d <= z1 - z0; d += 38) rect(wg, '#34303f', x0 - 2, z0 + d - 1, t + 2, 3);
    }
  }
  // cửa: hai trụ khung và cánh cửa mở hé (đúng kiểu mặt bằng mẫu), cung quét mờ
  for (const door of layout.doors) {
    const dx = bx(door.x);
    const dz = by(door.z);
    const half = (door.w * U) / 2;
    if (door.kind === 'glass') {
      rect(wg, '#26232f', dx - half - 2, dz - 3, 4, 7);
      rect(wg, '#26232f', dx + half - 2, dz - 3, 4, 7);
      rect(wg, '#9fd4ee', dx - half + 2, dz - 1, half * 2 - 4, 3);
      continue;
    }
    rect(wg, '#26232f', dx - half - 1, dz - 2, 3, 5);
    rect(wg, '#26232f', dx + half - 2, dz - 2, 3, 5);
    const into = door.z < 0 ? -1 : 1;
    const len = door.w * U - 3;
    const hx = dx - half + 1;
    const ang = 1.25;
    for (let a = 0; a <= ang; a += 0.08) rect(wg, 'rgba(60,50,80,0.3)', hx + Math.cos(a) * len, dz + into * -Math.sin(a) * len, 1, 1);
    line(wg, '#8a6540', hx, dz, hx + Math.cos(ang) * len, dz - into * Math.sin(ang) * len);
    line(wg, '#c99a6a', hx + 1, dz, hx + 1 + Math.cos(ang) * len, dz - into * Math.sin(ang) * len);
  }

  // đồ trang trí treo tường / dẹt trên sàn
  for (const d of layout.decor) {
    if (d.kind === 'clock') continue; // vẽ ở lớp động
    drawDecor(wg, d, bx(d.x), by(d.z));
  }

  // =============================== Trạng thái ===============================
  interface Visual {
    actor: Actor;
    look: ReturnType<typeof lookFor>;
    bubbleText: string;
  }
  const visuals: Visual[] = sim.actors.map((actor) => {
    const spot = actor.spot;
    const shirt = hexOf(TEAM_COLORS[spot.colorIndex % TEAM_COLORS.length]);
    return { actor, look: lookFor(spot.name, shirt, { crown: spot.isLead, director: spot.isDirector }), bubbleText: bubbleOf(actor.view) };
  });
  const ownerLook = lookFor('Chủ', '#f2c14e', { crown: true, director: false });
  const hasOwner = layout.floor === 0 && layout.rooms.some((r) => r.id === 'owner');
  const papers: Paper[] = [];
  const particles: Particle[] = [];
  let ownerWaiting = 0;
  let signText = 'Khu nghỉ';
  let breakTimer: ReturnType<typeof setInterval> | null = null;
  let selected: string | null = null;
  let dirty = true;
  let busy = true;
  let nextWake = 0;
  let last = 0;
  let notesShown = 0;
  const invalidate = () => {
    dirty = true;
  };
  const wake = () => {
    busy = true;
    nextWake = 0;
  };
  const paintSign = () => {
    signText = sim.onBreak() && sim.breakUntil !== null ? `Nghỉ giải lao · còn ${formatCountdown(sim.breakUntil - Date.now())}` : 'Khu nghỉ';
    invalidate();
  };
  paintSign();

  // ---------- Camera ----------
  let dpr = Math.max(window.devicePixelRatio || 1, 1);
  const cam = { cx: baseW / 2, cy: baseH / 2, scale: 1 };
  let userMoved = false;
  const fitScale = () => {
    const w = Math.max(host.clientWidth, 1);
    const h = Math.max(host.clientHeight, 1);
    const fit = Math.min(w / baseW, h / baseH);
    return Math.max(Math.floor(Math.min(fit, 6) * 20) / 20, 0.3); // làm tròn xuống theo bước 0,05 để pixel không bị méo nhiều
  };
  const frameCamera = () => {
    cam.scale = fitScale();
    cam.cx = baseW / 2;
    cam.cy = baseH / 2;
  };
  const toBase = (cssX: number, cssY: number) => ({
    x: (cssX - host.clientWidth / 2) / cam.scale + cam.cx,
    y: (cssY - host.clientHeight / 2) / cam.scale + cam.cy,
  });
  const toCss = (px: number, py: number) => ({ x: (px - cam.cx) * cam.scale + host.clientWidth / 2, y: (py - cam.cy) * cam.scale + host.clientHeight / 2 });

  // ---------- Nhãn cố định ----------
  const labels: Label[] = [];
  const roomDot: Record<string, string> = {
    library: '#f5a742', stairs: '#94a3b8', server: '#4cf08a', pantry: '#f0a44b', wc: '#6cc4c4', meeting1: '#5b9bd5', meeting2: '#5b9bd5',
    director: '#8c7ae6', focus: '#8c7ae6', owner: '#f2c14e', archive: '#94a3b8', lobby: '#6cc4c4',
  };
  const top = (z: number) => z < 0;
  for (const tile of layout.tiles) {
    if (tile.kind !== 'room' || !roomDot[tile.id]) continue;
    const text = tile.label;
    // nhãn nằm sát tường sau của phòng (dải trên) hoặc tường trước (dải dưới), giữa phòng theo chiều ngang
    const z = tile.id === 'lobby' ? tile.z + 0.5 : top(tile.z) ? tile.z - tile.d / 2 + 1.0 : tile.z + tile.d / 2 - 1.0;
    labels.push({ text, dot: roomDot[tile.id], x: bx(tile.x), y: by(z), room: tile.w * U, plain: true });
  }
  const rest = layout.rooms.find((r) => r.id === 'rest');
  if (rest) labels.push({ text: 'Khu nghỉ', dot: '#e86f8f', x: bx(rest.x - 2), y: by(rest.z - rest.d / 2 + 0.8), room: 200, dynamic: true });
  for (const zone of layout.zones) {
    labels.push({ text: zone.name.replace(/^Team /, ''), dot: hexOf(TEAM_COLORS[zone.colorIndex % TEAM_COLORS.length]), x: bx(zone.x), y: by(zone.z + zone.d / 2 - 0.35), room: zone.w * U, zone: true });
  }
  labels.push({ text: `Tầng ${layout.floor + 1}${layout.floorCount > 1 ? ` / ${layout.floorCount}` : ''}`, dot: '#8c7ae6', x: bx(walls.minX) + 44, y: by(walls.minZ) - 16, room: 999 });

  const armsOf = (action: Action, seated: boolean, t: number): Arms => {
    const flip = Math.floor(t * 7) % 2 === 0;
    switch (action) {
      case 'wave': return 'upR';
      case 'scratch': return 'head';
      case 'sip':
      case 'coffee': return 'cup';
      case 'stretch': return 'upBoth';
      case 'talk': return flip ? 'talkA' : 'talkB';
      case 'read': return 'book';
      case 'run': return Math.floor(t * 10) % 2 === 0 ? 'typeA' : 'typeB';
      case 'write': return flip ? 'upR' : 'down';
      case 'type': return Math.floor(t * 8) % 2 === 0 ? 'typeA' : 'typeB';
      case 'rest': return seated ? 'forward' : 'down';
      default: return 'down';
    }
  };

  const glow = (() => {
    const { c, g } = newCanvas(48, 48);
    const gr = g.createRadialGradient(24, 24, 0, 24, 24, 24);
    gr.addColorStop(0, 'rgba(255,240,190,0.9)');
    gr.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 48, 48);
    return c;
  })();

  const clocks = layout.decor.filter((d) => d.kind === 'clock');
  const tvs = layout.decor.filter((d) => d.kind === 'tv');
  const racks = layout.furniture.filter((o) => o.kind === 'rack');
  const tanks = layout.furniture.filter((o) => o.kind === 'aquarium');
  const board = layout.furniture.find((o) => o.id === 'director-board');

  // =============================== Vẽ một khung ===============================
  const render = (ts: number) => {
    const t = ts / 1000;
    const lights: { x: number; y: number; r: number; a: number }[] = [];
    bg.clearRect(0, 0, baseW, baseH);
    bg.drawImage(world, 0, 0);
    const meeting = sim.actors.some((a) => a.place === 'meeting' && !a.walking);
    const atPantry = sim.actors.some((a) => a.place === 'pantry' && !a.walking);

    // đồng hồ (kim chạy theo giờ thật), màn hình họp, đèn tủ máy, cá trong bể
    const now = new Date();
    const sec = now.getSeconds() + now.getMilliseconds() / 1000;
    const min = now.getMinutes() + sec / 60;
    const hr = (now.getHours() % 12) + min / 60;
    for (const c of clocks) {
      const x = bx(c.x) + (Math.cos(c.facing) < 0.5 ? Math.sin(c.facing) * 5 : 0);
      const y = by(c.z);
      disc(bg, '#26232f', x, y, 6);
      disc(bg, '#fffdf5', x, y, 5);
      const hand = (ang: number, len: number, color: string) => line(bg, color, x, y, x + Math.sin(ang) * len, y - Math.cos(ang) * len);
      hand((hr / 12) * Math.PI * 2, 2.5, '#2a2540');
      hand((min / 60) * Math.PI * 2, 3.8, '#2a2540');
      hand((sec / 60) * Math.PI * 2, 4.2, '#d6313f');
    }
    for (const d of tvs) {
      const lit = meeting;
      const color = lit ? ['#6fb7e8', '#9b8cf0', '#6fd6a8'][Math.floor(t / 4) % 3] : '#3a4256';
      const alongX = Math.abs(Math.cos(d.facing)) > 0.5;
      const len = Math.round(d.w * U);
      if (alongX) rect(bg, color, bx(d.x) - len / 2 + 2, by(d.z), len - 4, 1);
      else rect(bg, color, bx(d.x), by(d.z) - len / 2 + 2, 1, len - 4);
    }
    for (const o of racks) {
      const units = Math.max(Math.round(o.hw * 2 / 1.05), 1);
      const uw = Math.floor((o.hw * 2 * U) / units);
      for (let i = 0; i < units; i += 1) {
        for (let k = 0; k < 4; k += 1) {
          const on = Math.sin(t * (2 + ((i * 4 + k) % 5) * 0.7) + i * 4 + k) > -0.3;
          rect(bg, on ? (k % 3 === 0 ? '#ffb347' : '#4cf08a') : '#20242f', bx(o.x - o.hw) + i * uw + uw - 5, by(o.z - o.hd) + 2 + k * 2, 1, 1);
        }
      }
    }
    for (const o of tanks) {
      for (let i = 0; i < 3; i += 1) {
        const k = (t * (0.5 + i * 0.17) + i * 2) % (Math.PI * 2);
        const fx = bx(o.x) + Math.sin(k) * (o.hw * U - 4) * (Math.abs(o.facing) > 1 ? 0 : 1);
        const fy = by(o.z) + Math.cos(k * 0.7 + i) * (o.hd * U - 4) * (Math.abs(o.facing) > 1 ? 1 : 0) + (Math.abs(o.facing) > 1 ? 0 : Math.sin(k * 1.7 + i) * 2);
        rect(bg, ['#f08a4b', '#f2c14e', '#e86f8f'][i], fx, fy, 2, 1);
      }
    }
    // hơi nước cà phê
    if (atPantry) {
      for (let i = 0; i < 4; i += 1) {
        const k = (t * 0.55 + i * 0.25) % 1;
        bg.globalAlpha = 0.6 * (1 - k);
        disc(bg, '#ffffff', bx(layout.coffee.x - 0.5) + Math.sin(t * 2 + i) * 1.5, by(layout.coffee.z) + 5 + k * 12, 1 + k * 1.5);
      }
      bg.globalAlpha = 1;
    }
    // các mảnh giấy trên bảng trắng của Giám đốc
    if (board) {
      layout.zones.slice(0, 4).forEach((zone, i) => {
        if (i < notesShown) rect(bg, hexOf(TEAM_COLORS[zone.colorIndex % TEAM_COLORS.length]), bx(board.x) - 12 + i * 7, by(board.z) + 1, 6, 3);
      });
    }

    // đèn trạng thái và chồng giấy trên mặt bàn
    for (const v of visuals) {
      const a = v.actor;
      const s = a.spot;
      const dx = bx(s.deskX);
      const dy = by(s.deskZ);
      const toward = seatDir(s.facing);
      const lamp = lampOf(a.view);
      const pulse = lamp === 'needs_you' || lamp === 'overload';
      const bright = pulse && motion ? 0.5 + 0.5 * Math.sin(t * (lamp === 'needs_you' ? 6 : 9)) : 1;
      const monitorY = dy - 9 + (toward === 1 ? 9 - 5 + 2 : 3 - 1);
      bg.globalAlpha = 0.55 + 0.45 * bright;
      rect(bg, LAMP_HEX[lamp], dx - 5, monitorY - 1, 10, 2);
      bg.globalAlpha = 1;
      const n = Math.min(a.view.queued, 6);
      for (let i = 0; i < n; i += 1) {
        rect(bg, '#2a2540', dx - 16, dy - 3 - i * 2 + 5, 8, 3);
        rect(bg, i % 2 ? '#e9edf3' : '#fffdf5', dx - 15, dy - 3 - i * 2 + 5, 6, 2);
      }
      if (night) {
        lights.push({ x: dx, y: dy, r: 13, a: 0.5 });
        lights.push({ x: dx + 12, y: monitorY, r: 6, a: pulse ? 0.3 + 0.7 * bright : 0.5 });
      }
    }
    if (night) {
      for (const tv of tvs) if (meeting) lights.push({ x: bx(tv.x), y: by(tv.z), r: 16, a: 0.35 });
      for (const o of layout.furniture) if (o.kind === 'lamp') lights.push({ x: bx(o.x), y: by(o.z), r: 18, a: 0.5 });
    }

    // Chủ ngồi ở bàn Chủ (tầng 1)
    if (hasOwner) {
      drawPerson(bg, { look: ownerLook, heading: 0, arms: Math.floor(t * 6) % 2 === 0 ? 'typeA' : 'typeB', walking: false, seated: true, t }, bx(layout.owner.x), by(layout.owner.z));
    }

    // người, sắp theo chiều sâu (z) để người đứng sau không đè người đứng trước
    const order = [...visuals].sort((p, q) => p.actor.z - q.actor.z);
    for (const v of order) {
      const a = v.actor;
      if (sim.hidden(a)) continue;
      const action = sim.actionOf(a);
      const seated = sim.seated(a);
      const px = bx(a.x);
      const py = by(a.z);
      const turn = action === 'look' ? Math.sin(t * 1.8 + a.phase) * 0.7 : 0;
      if (selected === a.spot.name) {
        bg.strokeStyle = '#ffffff';
        bg.lineWidth = 1;
        bg.strokeRect(Math.round(px) - 9.5, Math.round(py) - 9.5, 19, 19);
      }
      drawPerson(bg, { look: v.look, heading: a.heading + turn, arms: armsOf(action, seated, t), walking: a.walking, seated, t: t + a.phase }, px, py);
      if (a.view.overload && motion) {
        const ph = (t * 0.9 + a.phase) % 1;
        rect(bg, '#7dd3fc', px + 7, py - 10 + ph * 8, 1, 2);
        rect(bg, '#7dd3fc', px - 8, py - 8 + ((ph + 0.4) % 1) * 8, 1, 2);
      }
    }

    // giấy bay, hiệu ứng, đèn báo của Chủ
    for (let i = papers.length - 1; i >= 0; i -= 1) {
      const p = papers[i];
      const u = Math.min((ts - p.t0) / p.dur, 1);
      const e = u * u * (3 - 2 * u);
      const x = bx(p.from.x + (p.to.x - p.from.x) * e);
      const z = p.from.z + (p.to.z - p.from.z) * e;
      const h = (p.from.h + (p.to.h - p.from.h) * e + Math.sin(Math.PI * e) * p.arc) * U * 0.55;
      const w = p.kind === 'file' && u > 0.8 ? Math.max(8 * (1 - (u - 0.8) / 0.2), 1) : 8;
      rect(bg, 'rgba(30,20,50,0.3)', x - w / 2 + 2, by(z) + 2, w, 6); // bóng dưới sàn
      rect(bg, '#2a2540', x - w / 2 - 1, by(z) - h - 1, w + 2, 7);
      rect(bg, PAPER_HEX[p.kind], x - w / 2, by(z) - h, w, 5);
      rect(bg, 'rgba(42,37,64,0.25)', x - w / 2 + 1, by(z) - h + 2, Math.max(w - 2, 0), 1);
      if (u >= 1) {
        for (let k = 0; k < (p.kind === 'file' ? 9 : 5); k += 1) {
          const a = (k / 9) * Math.PI * 2;
          particles.push({ x, y: by(z) - h, vx: Math.cos(a) * 18, vy: Math.sin(a) * 18 - 14, age: 0, life: 0.7, color: PAPER_HEX[p.kind] });
        }
        papers.splice(i, 1);
      }
    }
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.age += 0.04;
      p.x += p.vx * 0.04;
      p.y += p.vy * 0.04;
      p.vy += 40 * 0.04;
      rect(bg, p.color, p.x, p.y, 2, 2);
      if (p.age >= p.life) particles.splice(i, 1);
    }
    if (ownerWaiting > 0 && hasOwner) {
      const wave = 0.5 + 0.5 * Math.sin(t * 5);
      const ox = bx(layout.owner.x);
      const oy = by(layout.owner.z) - 12;
      bg.globalAlpha = 0.35 + 0.4 * wave;
      bg.drawImage(glow, ox - 24, oy - 24);
      bg.globalAlpha = 1;
      rect(bg, '#2a2540', ox - 4, oy - 4, 9, 9);
      rect(bg, '#facc15', ox - 3, oy - 3, 7, 7);
      rect(bg, '#fff3a8', ox - 2, oy - 2, 2, 2);
    }

    // ban đêm: nhuộm xanh tím cả cảnh rồi thắp đèn (màn hình, đèn bàn, đèn sàn)
    if (night) {
      bg.globalCompositeOperation = 'multiply';
      bg.fillStyle = '#7a82c0';
      bg.fillRect(0, 0, baseW, baseH);
      bg.globalCompositeOperation = 'lighter';
      for (const l of lights) {
        bg.globalAlpha = l.a * 0.6;
        bg.drawImage(glow, l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
      }
      bg.globalAlpha = 1;
      bg.globalCompositeOperation = 'source-over';
    }

    // ---- Phóng to ra khung hiển thị ----
    dpr = Math.max(window.devicePixelRatio || 1, 1);
    const cw = Math.max(host.clientWidth, 1);
    const ch = Math.max(host.clientHeight, 1);
    if (display.width !== Math.round(cw * dpr) || display.height !== Math.round(ch * dpr)) {
      display.width = Math.round(cw * dpr);
      display.height = Math.round(ch * dpr);
    }
    const g = dctx;
    g.imageSmoothingEnabled = false;
    g.fillStyle = night ? '#1f3a2c' : '#7cc47f';
    g.fillRect(0, 0, display.width, display.height);
    const s = cam.scale * dpr;
    const ox = display.width / 2 - cam.cx * s;
    const oy = display.height / 2 - cam.cy * s;
    g.drawImage(base, Math.round(ox), Math.round(oy), Math.round(baseW * s), Math.round(baseH * s));

    // ---- Nhãn (vẽ ở độ phân giải màn hình cho chữ sắc nét) ----
    const font = `600 ${Math.round(11 * dpr)}px system-ui, "Segoe UI", sans-serif`;
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    /** Vẽ một nhãn viên thuốc. `force` false thì bỏ qua nếu sẽ đè lên nhãn đã vẽ (nhãn phòng nhường nhãn người). */
    const pill = (text: string, dot: string | null, x: number, y: number, tone: 'dark' | 'light' | 'warn', force = true) => {
      g.font = font;
      const tw = g.measureText(text).width;
      const h = 17 * dpr;
      const w = tw + 14 * dpr + (dot ? 11 * dpr : 0);
      const px = Math.round(x * dpr - w / 2);
      const py = Math.round(y * dpr - h / 2);
      const box = { x0: px - 2, y0: py - 1, x1: px + w + 2, y1: py + h + 1 };
      if (!force && placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) return;
      placed.push(box);
      g.fillStyle = tone === 'light' ? 'rgba(255,255,255,0.96)' : tone === 'warn' ? 'rgba(250,204,21,0.97)' : 'rgba(30,26,44,0.93)';
      g.fillRect(px, py, w, h);
      g.fillStyle = tone === 'light' ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.2)';
      g.fillRect(px, py, w, 1);
      g.fillRect(px, py + h - 1, w, 1);
      g.fillRect(px, py, 1, h);
      g.fillRect(px + w - 1, py, 1, h);
      let tx = px + 7 * dpr;
      if (dot) {
        g.fillStyle = dot;
        g.fillRect(tx, py + h / 2 - 3 * dpr, 6 * dpr, 6 * dpr);
        tx += 11 * dpr;
      }
      g.fillStyle = tone === 'dark' ? '#f4f1fa' : '#1c1730';
      g.textBaseline = 'middle';
      g.fillText(text, tx, py + h / 2 + 0.5 * dpr);
    };
    // Thu nhỏ nhiều (điện thoại, hoặc kéo xa) thì nhãn chồng lên nhau: chỉ giữ nhãn của khu làm việc (bỏ chữ "Team"),
    // và chỉ nhãn tên người đang được chọn hoặc đang cần chú ý. Phóng to lại thì hiện đủ.
    const small = cam.scale < 0.75;
    // Tên người trước (ưu tiên: đang chọn, cần bạn, lỗi, đang đi, còn lại). Hàng bàn phía nam quay mặt lên nên nhãn nằm DƯỚI đầu
    // (không đè lên bàn), mọi người khác nhãn nằm trên đầu.
    const rank = (a: Actor) => (a.spot.name === selected ? 0 : a.view.needsYou || a.view.failed ? 1 : a.walking ? 2 : 3);
    for (const v of [...visuals].sort((p, q) => rank(q.actor) - rank(p.actor))) {
      const a = v.actor;
      if (sim.hidden(a)) continue;
      if (small && a.spot.name !== selected && !a.view.needsYou && !a.view.failed) continue;
      const below = sim.seated(a) && Math.abs(a.spot.facing) > 1;
      const head = toCss(bx(a.x), by(a.z));
      const y = head.y + (below ? 20 : -20);
      const step = below ? 19 : -19;
      pill(a.spot.name, LAMP_HEX[lampOf(a.view)], head.x, y, 'dark');
      if (v.bubbleText) pill(v.bubbleText, null, head.x, y + step, a.view.needsYou || a.view.failed ? 'warn' : 'light');
    }
    /** Nhãn phòng dạng chữ trơn (như ghi chú trên bản vẽ mặt bằng). */
    const plain = (text: string, x: number, y: number) => {
      g.font = `700 ${Math.round(10 * dpr)}px system-ui, "Segoe UI", sans-serif`;
      const w = g.measureText(text).width;
      const h = 12 * dpr;
      const px = Math.round(x * dpr - w / 2);
      const py = Math.round(y * dpr - h / 2);
      const box = { x0: px - 2, y0: py, x1: px + w + 2, y1: py + h };
      if (placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) return;
      placed.push(box);
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 3 * dpr;
      g.strokeStyle = 'rgba(255,255,255,0.88)';
      g.strokeText(text, px, py + h / 2);
      g.fillStyle = '#2a2540';
      g.fillText(text, px, py + h / 2);
    };
    /** Rút gọn nhãn cho vừa chỗ (ước lượng px mỗi chữ cộng phần đệm), thêm dấu … khi cắt. */
    const fit = (l: Label): string => {
      const room = l.room * cam.scale - 6;
      const max = Math.floor((room - (l.plain ? 6 : 36)) / (l.plain ? 5.8 : 6.6));
      if (l.text.length <= max || l.room >= 900) return l.text;
      if (max < 3) return '';
      return `${l.text.slice(0, Math.max(max - 1, 2))}…`;
    };
    for (const l of labels) {
      const p = toCss(l.x, l.y);
      if (l.dynamic && l.text === 'Khu nghỉ') pill(signText, sim.onBreak() ? '#f2b705' : l.dot, p.x, p.y, sim.onBreak() ? 'warn' : 'dark', false);
      else if (!small || l.zone) {
        const text = fit(l);
        if (!text) continue;
        if (l.plain) plain(text, p.x, p.y);
        else pill(text, l.dot, p.x, p.y, 'dark', false);
      }
    }
  };

  // ---------- Tương tác ----------
  const personAt = (cssX: number, cssY: number): string | null => {
    const p = toBase(cssX, cssY);
    let best: { name: string; d: number } | null = null;
    for (const v of visuals) {
      const a = v.actor;
      if (sim.hidden(a)) continue;
      const d = Math.hypot(p.x - bx(a.x), p.y - by(a.z));
      if (d <= 10 && (!best || d < best.d)) best = { name: a.spot.name, d };
      // bàn của người đó
      const dx = bx(a.spot.deskX);
      const dy = by(a.spot.deskZ);
      if (!best && p.x >= dx - 18 && p.x <= dx + 18 && p.y >= dy - 9 && p.y <= dy + 9) best = { name: a.spot.name, d: 99 };
    }
    return best?.name ?? null;
  };
  let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
  const rectOf = () => display.getBoundingClientRect();
  const onDown = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY, cx: cam.cx, cy: cam.cy, moved: false };
    display.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (drag) {
      const dxs = e.clientX - drag.x;
      const dys = e.clientY - drag.y;
      if (Math.hypot(dxs, dys) > 5) drag.moved = true;
      if (drag.moved) {
        userMoved = true;
        cam.cx = drag.cx - dxs / cam.scale;
        cam.cy = drag.cy - dys / cam.scale;
        invalidate();
      }
      return;
    }
    const r = rectOf();
    display.style.cursor = personAt(e.clientX - r.left, e.clientY - r.top) ? 'pointer' : 'grab';
  };
  const onUp = (e: PointerEvent) => {
    if (!drag) return;
    const wasDrag = drag.moved;
    drag = null;
    if (!wasDrag) {
      const r = rectOf();
      options.onSelect(personAt(e.clientX - r.left, e.clientY - r.top));
    }
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = rectOf();
    const before = toBase(e.clientX - r.left, e.clientY - r.top);
    let i = ZOOMS.findIndex((z) => z >= cam.scale - 1e-6);
    if (i < 0) i = ZOOMS.length - 1;
    i = Math.min(Math.max(i + (e.deltaY < 0 ? 1 : -1), 0), ZOOMS.length - 1);
    cam.scale = ZOOMS[i];
    const after = toBase(e.clientX - r.left, e.clientY - r.top);
    cam.cx += before.x - after.x;
    cam.cy += before.y - after.y;
    userMoved = true;
    invalidate();
  };
  display.addEventListener('pointerdown', onDown);
  display.addEventListener('pointermove', onMove);
  display.addEventListener('pointerup', onUp);
  display.addEventListener('wheel', onWheel, { passive: false });

  const resize = () => {
    if (!userMoved) frameCamera();
    invalidate();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  // ---------- Vòng lặp ----------
  let frame = 0;
  const tick = (ts: number) => {
    frame = requestAnimationFrame(tick);
    if (!busy && !dirty && ts < nextWake) return;
    if (!dirty && ts - last < FRAME_MS) return;
    last = ts;
    busy = sim.step(ts, Date.now());
    nextWake = sim.nextWake;
    // các mảnh giấy trên bảng trắng hiện dần khi Giám đốc đứng ở đó
    const atBoard = sim.actors.filter((a) => a.place === 'whiteboard' && !a.walking);
    if (atBoard.length > 0) {
      const since = Math.min(...atBoard.map((a) => a.arrivedAt));
      const total = Math.min(4, layout.zones.length);
      notesShown = motion ? Math.min(total, Math.floor((ts - since) / 900) + 1) : total;
      if (notesShown < total) busy = true;
    } else notesShown = 0;
    if (papers.length > 0 || particles.length > 0) busy = true;
    if (ownerWaiting > 0 && motion) busy = true;
    if (motion && sim.actors.some((a) => a.place === 'pantry' && !a.walking)) busy = true;
    for (const v of visuals) {
      const l = lampOf(v.actor.view);
      if ((l === 'needs_you' || l === 'overload') && motion) busy = true;
    }
    render(ts);
    dirty = false;
  };
  frame = requestAnimationFrame(tick);
  const clockTimer = setInterval(invalidate, 1000); // kim đồng hồ, đèn tủ máy, cá bơi chạy theo giờ thật

  return {
    setViews(views) {
      sim.setViews(views);
      for (const v of visuals) v.bubbleText = bubbleOf(views[v.actor.spot.name] ?? IDLE_VIEW);
      wake();
      invalidate();
    },
    setBreak(until) {
      sim.setBreak(until, Date.now());
      if (breakTimer) clearInterval(breakTimer);
      breakTimer = null;
      if (sim.breakUntil !== null) {
        breakTimer = setInterval(() => {
          paintSign();
          wake();
          if (!sim.onBreak() && breakTimer) {
            clearInterval(breakTimer);
            breakTimer = null;
            sim.breakUntil = null;
          }
        }, 1000);
      }
      paintSign();
      wake();
    },
    setOwnerWaiting(count) {
      ownerWaiting = count;
      wake();
      invalidate();
    },
    sendFlow(flow: Flow) {
      const pos = (name: string): { x: number; z: number; h: number } | null => {
        if (name === OWNER) return { x: layout.owner.x, z: layout.owner.z + 0.4, h: 1.0 };
        if (name === CABINET) return { x: layout.cabinet.x, z: layout.cabinet.z + 0.35, h: 1.5 };
        const v = visuals.find((x) => x.actor.spot.name === name);
        return v ? { x: v.actor.spot.deskX, z: v.actor.spot.deskZ, h: 0.9 } : null;
      };
      const a = pos(flow.from);
      const b = pos(flow.to);
      if (!a || !b || !motion) {
        invalidate();
        return;
      }
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      papers.push({ from: a, to: b, t0: performance.now(), dur: Math.min(Math.max((dist / 6) * 1000, 1100), 3200), arc: 0.8 + dist * 0.05, kind: flow.kind });
      wake();
    },
    select(name) {
      selected = name;
      invalidate();
    },
    screenPositions() {
      const out: Record<string, { x: number; y: number }> = {};
      for (const v of visuals) out[v.actor.spot.name] = toCss(bx(v.actor.x), by(v.actor.z) - 8);
      return out;
    },
    debug(): SceneDebug {
      const out: SceneDebug['people'] = {};
      for (const v of visuals) {
        const a = v.actor;
        out[a.spot.name] = {
          place: a.place, dest: a.dest, walking: a.walking, x: Number(a.x.toFixed(2)), z: Number(a.z.toFixed(2)), seated: sim.seated(a),
          bubble: v.bubbleText, pile: Math.min(a.view.queued, 6), lamp: lampOf(a.view), idle: a.idlePlace, anim: a.anim, facing: Number(a.heading.toFixed(2)),
        };
      }
      return { people: out, papers: papers.length, onBreak: sim.onBreak(), beacon: ownerWaiting > 0, sign: signText };
    },
    dispose() {
      cancelAnimationFrame(frame);
      clearInterval(clockTimer);
      if (breakTimer) clearInterval(breakTimer);
      observer.disconnect();
      display.removeEventListener('pointerdown', onDown);
      display.removeEventListener('pointermove', onMove);
      display.removeEventListener('pointerup', onUp);
      display.removeEventListener('wheel', onWheel);
      display.remove();
      S.clearSpriteCache();
    },
  };
}

