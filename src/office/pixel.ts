import { CABINET, OWNER, type Flow, type FlowKind } from './flow';
import { TEAM_COLORS, type OfficeLayout, type Tile } from './layout';
import { lookFor, type Look } from './look';
import type { OfficeScene, SceneDebug, SceneOptions } from './scene-types';
import { dirOf, OfficeSim, type Action, type Actor } from './sim';
import { bubbleOf, formatCountdown, IDLE_VIEW, lampOf, type Lamp } from './status';
import * as S from './sprites';

/** Bộ vẽ 2D pixel art: nhìn từ trên xuống nghiêng nhẹ, 16 px = 1 mét, vẽ ra khung nhỏ rồi phóng to nguyên bước (không làm mờ). */

const U = S.U;
const FRAME_MS = 40;
const LAMP_HEX: Record<Lamp, string> = {
  needs_you: '#facc15', overload: '#f97316', working: '#22c55e', waiting: '#3b82f6', queued: '#f59e0b', failed: '#ef4444', idle: '#94a3b8',
};
const PAPER_HEX: Record<FlowKind, string> = { assign: '#fffbeb', report: '#93c5fd', return: '#f87171', file: '#86efac', ask: '#fde047', reply: '#c4b5fd' };
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6];
const WALL_H = 26; // chiều cao nhìn thấy của tường kính phòng (px)
const OUT_H = 36; // tường kính ngoài tòa nhà

type G = CanvasRenderingContext2D;
interface Drawable {
  y: number;
  draw: (g: G) => void;
}

const hexOf = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const rect = (g: G, c: string, x: number, y: number, w: number, h: number) => {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};
const put = (g: G, s: S.Sprite, x: number, y: number) => g.drawImage(s.img, Math.round(x - s.ox), Math.round(y - s.oy));
function newCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(Math.ceil(w), 1);
  c.height = Math.max(Math.ceil(h), 1);
  const g = c.getContext('2d') as G;
  g.imageSmoothingEnabled = false;
  return { c, g };
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
  tone: 'dark' | 'light';
  dynamic?: boolean;
}

/** Dựng văn phòng 2D pixel art trong `host`. */
export function createPixelScene(host: HTMLElement, layout: OfficeLayout, options: SceneOptions): OfficeScene {
  const motion = !options.reducedMotion;
  const night = options.dark;
  const sim = new OfficeSim(layout, motion);
  const { walls } = layout;

  // ---------- Khung thế giới ----------
  const minX = walls.minX - 3;
  const minZ = walls.minZ - 3;
  const maxX = walls.maxX + 3;
  const maxZ = walls.maxZ + 5.6;
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

  // ---------- Nền: cỏ, vỉa hè, đường, sàn từng khu ----------
  const { c: ground, g: gg } = newCanvas(baseW, baseH);
  const fill = (g: G, tile: HTMLCanvasElement, x: number, y: number, w: number, h: number) => {
    g.save();
    g.translate(Math.round(x), Math.round(y));
    g.fillStyle = g.createPattern(tile, 'repeat') ?? '#888';
    g.fillRect(0, 0, Math.round(w), Math.round(h));
    g.restore();
  };
  const sw = 1.8;
  fill(gg, S.floorTile('grass', night ? '#2f6a4a' : '#7cc47f'), 0, 0, baseW, baseH);
  // vỉa hè quanh tòa nhà và đường phía trước
  fill(gg, S.floorTile('stone', '#d8d2dc'), bx(walls.minX - sw), by(walls.minZ - sw), (walls.maxX - walls.minX + sw * 2) * U, (walls.maxZ - walls.minZ + sw * 2) * U);
  const roadZ0 = walls.maxZ + sw + 0.4;
  fill(gg, S.floorTile('asphalt', '#5d586d'), 0, by(roadZ0), baseW, 4.2 * U);
  for (let x = 0; x < baseW; x += 26) rect(gg, '#f2eeee', x, by(roadZ0) + 2.1 * U - 1, 14, 2);
  for (let i = 0; i < 6; i += 1) rect(gg, '#f2eeee', bx(walls.minX + 1) + i * 6, by(roadZ0) + 2, 3, 4.2 * U - 4); // vạch qua đường
  rect(gg, '#2a2540', 0, by(roadZ0) - 1, baseW, 1);
  rect(gg, '#2a2540', 0, by(roadZ0) + 4.2 * U, baseW, 1);
  fill(gg, S.floorTile('stone', '#d8d2dc'), 0, by(roadZ0) + 4.2 * U + 1, baseW, baseH);
  // nền tòa nhà (bậc thềm) và thảm nền
  rect(gg, '#b9b2c0', bx(walls.minX) - 3, by(walls.minZ) - 3, (walls.maxX - walls.minX) * U + 6, (walls.maxZ - walls.minZ) * U + 6);
  fill(gg, S.floorTile('carpet', '#c9c2dc'), bx(walls.minX), by(walls.minZ), (walls.maxX - walls.minX) * U, (walls.maxZ - walls.minZ) * U);

  const floorOf: Record<string, [S.FloorKind, string]> = {
    owner: ['wood', '#e0b57a'], director: ['carpet', '#cbbde3'], meeting1: ['carpet', '#bdd2ea'], meeting2: ['carpet', '#bdd2ea'],
    library: ['wood', '#cf9b5a'], server: ['server', '#4b4f63'], archive: ['carpet', '#e3dad2'], wc: ['tile', '#cfe8ee'],
    pantry: ['tile', '#f3dcb4'], rest: ['wood', '#e0b57a'], lobby: ['marble', '#e4dcd4'],
  };
  for (const tile of layout.tiles) {
    const x = bx(tile.x - tile.w / 2);
    const y = by(tile.z - tile.d / 2);
    const w = tile.w * U;
    const h = tile.d * U;
    if (tile.kind === 'zone') {
      const color = hexOf(TEAM_COLORS[tile.colorIndex % TEAM_COLORS.length]);
      fill(gg, S.floorTile('carpet', S.mix(color, '#ffffff', 0.55)), x, y, w, h);
      rect(gg, S.mix(color, '#2a2540', 0.25), x, y + h - 2, w, 2);
    } else {
      const [kind, color] = floorOf[tile.id] ?? ['carpet', '#dddddd'];
      fill(gg, S.floorTile(kind, color), x, y, w, h);
    }
  }
  // lối đi lát đá
  const lx0 = layout.lanes[0] - 0.9;
  const lx1 = layout.lanes[layout.lanes.length - 1] + 0.9;
  const stone = S.floorTile('stone', '#efe9e4');
  for (const z of [layout.aisleBackZ, layout.aisleFrontZ]) fill(gg, stone, bx(lx0), by(z - 0.9), (lx1 - lx0) * U, 1.8 * U);
  for (const lane of layout.lanes) fill(gg, stone, bx(lane - 0.9), by(layout.aisleBackZ), 1.8 * U, (layout.aisleFrontZ - layout.aisleBackZ) * U);
  // thảm trang trí
  const ellipse = (g: G, color: string, cx: number, cy: number, rx: number, ry: number) => {
    g.fillStyle = color;
    for (let y = -ry; y <= ry; y += 1) {
      const half = Math.round(rx * Math.sqrt(Math.max(1 - (y * y) / (ry * ry), 0)));
      g.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2, 1);
    }
  };
  const rest = layout.rooms.find((r) => r.id === 'rest');
  const lobby = layout.rooms.find((r) => r.id === 'lobby');
  if (rest) {
    ellipse(gg, '#f2b6c0', bx(rest.x), by(rest.z + 0.1), 3.2 * U * 1.5, 1.9 * U);
    ellipse(gg, '#f6c9d1', bx(rest.x), by(rest.z + 0.1), 3.2 * U * 1.3, 1.5 * U);
  }
  if (lobby) {
    ellipse(gg, '#b9d6d2', bx(lobby.x), by(lobby.z + 0.6), 2.5 * U * 1.3, 1.5 * U);
    rect(gg, '#6b7385', bx(lobby.x) - 20, by(walls.maxZ) + 2, 40, 6); // thảm chùi chân ở cửa vào
    fill(gg, S.floorTile('stone', '#cfc8d0'), bx(lobby.x) - 16, by(walls.maxZ) + 8, 32, (roadZ0 - walls.maxZ) * U - 8);
  }
  rect(gg, '#8f8aa0', bx(walls.minX), by(walls.minZ), (walls.maxX - walls.minX) * U, 1);

  // ---------- Vật thể tĩnh (sắp theo chiều sâu cùng với người) ----------
  const statics: Drawable[] = [];
  const addSprite = (s: S.Sprite, x: number, z: number, hd = 0, extra = 0) => {
    const px = bx(x);
    const py = by(z) + hd * U;
    statics.push({ y: py + extra, draw: (g) => put(g, s, px, py) });
  };
  const teamHex = (id: string) => {
    const z = layout.zones.find((zone) => zone.id === id);
    return hexOf(TEAM_COLORS[(z?.colorIndex ?? 0) % TEAM_COLORS.length]);
  };

  for (const o of layout.furniture) {
    switch (o.kind) {
      case 'plant': addSprite(S.plantSprite(o.id.length % 2), o.x, o.z, o.hd); break;
      case 'desk': {
        const f = o.facing ?? 0;
        addSprite(S.deskSprite(f === 0 ? 'north' : 'south'), o.x, o.z, 0.56);
        const seatZ = o.z - 1.15 * Math.cos(f);
        addSprite(S.chairSeat(), o.x, seatZ, 0.28, -4);
        if (f === 0) addSprite(S.chairBack(), o.x, seatZ - 0.42, 0.14, -4);
        else addSprite(S.chairBack(), o.x, seatZ + 0.36, 0.14, 3);
        break;
      }
      case 'sofa': addSprite(S.sofaSprite(o.id.startsWith('lobby') ? '#e86f8f' : '#4fa7a0', o.z > layout.aisleFrontZ), o.x, o.z, o.hd); break;
      case 'table':
        if (Math.abs(o.hw - o.hd) < 0.01) addSprite(S.roundTable(Math.round(o.hw * U)), o.x, o.z, o.hw);
        else addSprite(S.longTable(Math.round(o.hw * 2 * U), Math.round(o.hd * 2 * U)), o.x, o.z, o.hd);
        break;
      case 'counter': addSprite(S.counterSprite(Math.round(o.hw * 2 * U)), o.x, o.z, o.hd); break;
      case 'cooler': addSprite(S.coolerSprite(), o.x, o.z, o.hd); break;
      case 'fridge': addSprite(S.fridgeSprite(), o.x, o.z, o.hd); break;
      case 'reception': addSprite(S.receptionSprite(Math.round(o.hw * 2 * U)), o.x, o.z, o.hd); break;
      case 'rack': addSprite(S.rackSprite(Math.max(Math.round((o.hw * 2) / 1.05), 1)), o.x, o.z, o.hd); break;
      case 'easel': addSprite(S.easelSprite(teamHex(o.id.replace('easel-', ''))), o.x, o.z, o.hd); break;
      case 'cabinet':
        if (o.id.startsWith('library-shelf')) addSprite(S.shelfSprite(Math.round(o.hw * 2 * U)), o.x, o.z, o.hd);
        else addSprite(S.cabinetSprite(Math.round(o.hw * 2 * U)), o.x, o.z, o.hd);
        break;
      default:
    }
  }
  // cây và bụi ngoài trời
  let seed = 0;
  for (let x = walls.minX - 1; x <= walls.maxX + 1; x += 5.4) {
    addSprite(S.treeSprite(seed++), x, walls.minZ - sw + 0.3);
    addSprite(S.bushSprite(), x + 2.4, walls.maxZ + sw - 0.4);
  }
  for (let z = walls.minZ + 2; z <= walls.maxZ; z += 6) {
    addSprite(S.treeSprite(seed++), walls.minX - sw + 0.2, z);
    addSprite(S.treeSprite(seed++), walls.maxX + sw - 0.2, z);
  }
  for (let x = walls.minX; x <= walls.maxX; x += 8) addSprite(S.treeSprite(seed++), x + 1.5, roadZ0 + 6);

  // tường: dải ngang (phía bắc/nam) và dải dọc (đông/tây); kính trong, chân tường đặc
  const frameC = '#e9e2d8';
  const glassC = 'rgba(184,224,244,0.42)';
  const cream = '#f3ece3';
  const hSeg = (x0: number, x1: number, z: number, o: { h: number; baseH: number; solid?: boolean; frame?: string }) => {
    const w = Math.round((x1 - x0) * U);
    if (w < 2) return;
    const T = 4;
    const { c, g } = newCanvas(w, o.h + T + 1);
    const fr = o.frame ?? frameC;
    rect(g, fr, 0, 0, w, T);
    rect(g, S.lighten(fr, 0.3), 0, 0, w, 1);
    if (o.solid) {
      rect(g, cream, 0, T, w, o.h);
      rect(g, '#d6ccbf', 0, T + o.h - 3, w, 3);
    } else {
      rect(g, cream, 0, T + o.h - o.baseH, w, o.baseH);
      rect(g, '#d6ccbf', 0, T + o.h - 2, w, 2);
      g.fillStyle = glassC;
      g.fillRect(0, T, w, o.h - o.baseH);
      for (let x = 0; x <= w; x += 36) rect(g, fr, Math.min(x, w - 1), T, 1, o.h - o.baseH);
      g.fillStyle = 'rgba(255,255,255,0.28)';
      for (let x = 6; x < w; x += 36) g.fillRect(x, T + 1, 3, o.h - o.baseH - 2);
    }
    rect(g, 'rgba(42,37,64,0.55)', 0, T + o.h, w, 1);
    const py = by(z);
    statics.push({ y: py + 1, draw: (gx) => gx.drawImage(c, Math.round(bx(x0)), Math.round(py - o.h - T)) });
  };
  const vSeg = (x: number, z0: number, z1: number, o: { h: number; solid?: boolean }) => {
    const len = Math.round((z1 - z0) * U);
    if (len < 2) return;
    const T = 4;
    const { c, g } = newCanvas(T, len + o.h);
    rect(g, o.solid ? cream : frameC, 0, 0, T, len + o.h);
    if (!o.solid) {
      g.fillStyle = 'rgba(184,224,244,0.4)';
      g.fillRect(1, 4, T - 2, len + o.h - 4);
      rect(g, '#cfc6ba', 0, 0, 1, len + o.h);
      rect(g, S.lighten(frameC, 0.4), T - 1, 0, 1, len + o.h);
    } else rect(g, '#d6ccbf', 0, 0, 1, len + o.h);
    rect(g, frameC, 0, 0, T, 3);
    rect(g, 'rgba(42,37,64,0.5)', 0, len + o.h - 1, T, 1);
    const py = by(z1);
    statics.push({ y: py + 1, draw: (gx) => gx.drawImage(c, Math.round(bx(x) - T / 2), Math.round(py - o.h - len)) });
  };
  for (const tile of layout.tiles) {
    if (tile.walls === 'none' || !tile.door) continue;
    const x0 = tile.x - tile.w / 2;
    const x1 = tile.x + tile.w / 2;
    const z0 = tile.z - tile.d / 2;
    const z1 = tile.z + tile.d / 2;
    const d0 = tile.x + tile.door.from;
    const d1 = tile.x + tile.door.to;
    const solid = tile.walls === 'solid';
    const hh = solid ? 30 : WALL_H;
    const onBack = tile.doorSide === 'back';
    if (onBack) {
      hSeg(x0, d0, z0, { h: hh, baseH: 6, solid });
      hSeg(d1, x1, z0, { h: hh, baseH: 6, solid });
      hSeg(x0, x1, z1, { h: hh, baseH: 6, solid });
    } else {
      hSeg(x0, x1, z0, { h: hh, baseH: 6, solid });
      hSeg(x0, d0, z1, { h: Math.round(hh * 0.55), baseH: 6, solid });
      hSeg(d1, x1, z1, { h: Math.round(hh * 0.55), baseH: 6, solid });
    }
    vSeg(x0, z0, z1, { h: hh, solid });
    vSeg(x1, z0, z1, { h: hh, solid });
  }
  // tường ngoài: kính phía sau và bên trái; lan can thấp bên phải và phía trước (chừa cửa vào ở sảnh)
  hSeg(walls.minX, walls.maxX, walls.minZ, { h: OUT_H, baseH: 8, frame: '#d6cfc4' });
  vSeg(walls.minX, walls.minZ, walls.maxZ, { h: OUT_H });
  vSeg(walls.maxX, walls.minZ, walls.maxZ, { h: 10, solid: true });
  if (lobby) {
    hSeg(walls.minX, lobby.x - 1.7, walls.maxZ, { h: 10, baseH: 0, solid: true });
    hSeg(lobby.x + 1.7, walls.maxX, walls.maxZ, { h: 10, baseH: 0, solid: true });
  } else hSeg(walls.minX, walls.maxX, walls.maxZ, { h: 10, baseH: 0, solid: true });

  // bảng trắng treo tường (phòng Giám đốc có các mảnh giấy hiện dần)
  const director = layout.rooms.find((r) => r.id === 'director');
  const board = (cx: number, z: number, w: number, notes: boolean, color: string) => {
    const x = bx(cx) - w / 2;
    const y = by(z) - 24;
    statics.push({
      y: by(z) + 2,
      draw: (g) => {
        rect(g, '#7e8ba0', x - 1, y - 1, w + 2, 20);
        rect(g, '#fafbfd', x, y, w, 18);
        rect(g, color, x, y, w, 2);
        rect(g, '#a8b2c4', x + 4, y + 6, w * 0.5, 1);
        rect(g, '#a8b2c4', x + 4, y + 9, w * 0.35, 1);
        if (notes) {
          const n = notesShown;
          layout.zones.slice(0, 4).forEach((zone, i) => {
            if (i < n) rect(g, hexOf(TEAM_COLORS[zone.colorIndex % TEAM_COLORS.length]), x + 6 + i * 11, y + 12, 9, 5);
          });
        }
      },
    });
  };
  let notesShown = 0;
  if (director) board(director.x, director.z - director.d / 2 + 0.55, 46, true, '#8c7ae6');
  for (const id of ['meeting1', 'meeting2'] as const) {
    const r = layout.rooms.find((room) => room.id === id);
    if (r) board(r.x, r.z - r.d / 2 + 0.35, 38, false, '#5b9bd5');
  }

  // ---------- Người và bàn của từng người ----------
  interface Visual {
    actor: Actor;
    look: Look;
    side: 'north' | 'south';
    bubbleText: string;
  }
  const visuals: Visual[] = sim.actors.map((actor) => {
    const spot = actor.spot;
    const shirt = hexOf(TEAM_COLORS[spot.colorIndex % TEAM_COLORS.length]);
    return { actor, look: lookFor(spot.name, shirt, { crown: spot.isLead, director: spot.isDirector }), side: spot.facing === 0 ? 'north' : 'south', bubbleText: '' };
  });
  for (const v of visuals) {
    const s = v.actor.spot;
    const side = v.side;
    // bàn, ghế (ghế xoay luôn nằm dưới người; lưng ghế phía nam vẽ sau người)
    addSprite(S.deskSprite(side), s.deskX, s.deskZ, 0.56);
    addSprite(S.chairSeat(), s.x, s.z, 0.28, -4);
    if (side === 'north') addSprite(S.chairBack(), s.x, s.z - 0.42, 0.14, -5);
    else addSprite(S.chairBack(), s.x, s.z + 0.36, 0.14, 4);
  }
  // Chủ ngồi ở bàn Chủ: một nhân vật nhỏ màu vàng
  const ownerLook = lookFor('Chủ', '#f2c14e', { crown: true, director: false });
  const ownerRoom = layout.rooms.find((r) => r.id === 'owner');
  if (ownerRoom) {
    addSprite(S.deskSprite('north'), ownerRoom.x, ownerRoom.z + 0.5, 0.56);
    addSprite(S.chairSeat(), ownerRoom.x, ownerRoom.z - 0.7, 0.28, -4);
    const ownerSprite = S.personSprite(ownerLook, 'down', 'sit', 'typeA');
    statics.push({ y: by(ownerRoom.z - 0.7) + 2, draw: (g) => put(g, ownerSprite, bx(ownerRoom.x), by(ownerRoom.z - 0.7)) });
  }

  // ---------- Camera ----------
  let dpr = Math.max(window.devicePixelRatio || 1, 1);
  const cam = { cx: baseW / 2, cy: baseH / 2, scale: 1 };
  let userMoved = false;
  const fitScale = () => {
    const w = Math.max(host.clientWidth, 1);
    const h = Math.max(host.clientHeight, 1);
    const fit = Math.min(w / baseW, h / baseH);
    // Vừa khít khung nhưng làm tròn xuống theo bước 0,05 để pixel không bị méo nhiều.
    return Math.max(Math.floor(Math.min(fit, 6) * 20) / 20, 0.3);
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

  // ---------- Trạng thái ----------
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

  // nhãn cố định của các khu
  const labels: Label[] = [];
  for (const tile of layout.tiles as Tile[]) {
    const zone = layout.zones.find((z) => z.id === tile.id);
    const text = zone ? `${tile.label}${zone.lead ? ` · ${zone.lead}` : ''}` : tile.label;
    const dot = tile.kind === 'zone' ? hexOf(TEAM_COLORS[tile.colorIndex % TEAM_COLORS.length]) : null;
    if (tile.door) {
      const dz = tile.doorSide === 'back' ? -tile.d / 2 : tile.d / 2;
      labels.push({ text, dot, x: bx(tile.x + (tile.door.from + tile.door.to) / 2), y: by(tile.z + dz) - (tile.doorSide === 'back' ? 8 : (tile.walls === 'solid' ? 38 : WALL_H + 12)), tone: 'dark', dynamic: tile.id === 'rest' });
    } else if (tile.id === 'rest') {
      labels.push({ text, dot: '#e86f8f', x: bx(tile.x), y: by(tile.z + tile.d / 2) - 8, tone: 'dark', dynamic: true });
    } else {
      labels.push({ text, dot, x: bx(tile.x), y: by(tile.z + tile.d / 2) - (tile.kind === 'zone' ? 4 : 8), tone: 'dark' });
    }
  }

  const armsOf = (action: Action, seated: boolean, t: number): S.Arms => {
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

  // ---------- Vẽ một khung ----------
  const render = (ts: number) => {
    const t = ts / 1000;
    const lights: { x: number; y: number; r: number; a: number }[] = [];
    bg.clearRect(0, 0, baseW, baseH);
    bg.drawImage(ground, 0, 0);

    // bóng dưới chân người
    for (const v of visuals) {
      const a = v.actor;
      if (sim.hidden(a)) continue;
      const seated = sim.seated(a);
      if (!seated) ellipse(bg, 'rgba(30,20,50,0.26)', bx(a.x), by(a.z) + 1, 6, 2.5);
    }
    const dyn: Drawable[] = [];
    for (const v of visuals) {
      const a = v.actor;
      const s = a.spot;
      // đèn trạng thái và chồng giấy trên mặt bàn
      const dx = bx(s.deskX);
      const dyBottom = by(s.deskZ) + 9;
      const topY = dyBottom - 18 - 6;
      const lamp = lampOf(a.view);
      const pulse = lamp === 'needs_you' || lamp === 'overload';
      const bright = pulse && motion ? 0.5 + 0.5 * Math.sin(t * (lamp === 'needs_you' ? 6 : 9)) : 1;
      dyn.push({
        y: dyBottom + 0.5,
        draw: (g) => {
          g.globalAlpha = 0.55 + 0.45 * bright;
          rect(g, LAMP_HEX[lamp], dx + 12, topY + 2, 4, 2);
          g.globalAlpha = 1;
          const n = Math.min(a.view.queued, 6);
          for (let i = 0; i < n; i += 1) rect(g, i % 2 ? '#e9edf3' : '#fffdf5', dx - 15, topY + 8 - i * 2, 7, 2);
        },
      });
      if (night) {
        lights.push({ x: dx, y: topY + (s.facing === 0 ? 3 : 10), r: 11, a: 0.55 });
        lights.push({ x: dx + 13, y: topY + 3, r: 6, a: pulse ? 0.3 + 0.7 * bright : 0.5 });
      }
      if (sim.hidden(a)) continue;
      const action = sim.actionOf(a);
      const seated = sim.seated(a);
      const walking = a.walking;
      const pose: S.Pose = walking ? (Math.floor(t * 7) % 2 === 0 ? 'walkA' : 'walkB') : seated ? 'sit' : 'stand';
      const dir = dirOf(a.heading);
      const turn = action === 'look' ? Math.round(Math.sin(t * 1.8 + a.phase)) : action === 'scratch' ? (Math.floor(t * 8) % 2) : 0;
      const sprite = S.personSprite(v.look, dir, pose, armsOf(action, seated, t), turn);
      const px = bx(a.x);
      const py = by(a.z);
      const sortY = seated ? py + (a.spot.facing === 0 ? -1 : 6) : py + 0.5;
      dyn.push({
        y: sortY,
        draw: (g) => {
          put(g, sprite, px, py + (seated ? 1 : 0));
          if (selected === a.spot.name) {
            g.strokeStyle = '#ffffff';
            g.lineWidth = 1;
            g.strokeRect(Math.round(px) - 8.5, Math.round(py) - 1.5, 17, 5);
          }
          if (a.view.overload && motion) {
            const ph = (t * 0.9 + a.phase) % 1;
            rect(g, '#7dd3fc', px + 7, py - 28 + ph * 8, 1, 2);
            rect(g, '#7dd3fc', px - 8, py - 26 + ((ph + 0.4) % 1) * 8, 1, 2);
          }
        },
      });
    }
    const order = [...statics, ...dyn].sort((p, q) => p.y - q.y);
    for (const d of order) d.draw(bg);

    // Giấy bay, hiệu ứng, đèn báo của Chủ
    for (let i = papers.length - 1; i >= 0; i -= 1) {
      const p = papers[i];
      const u = Math.min((ts - p.t0) / p.dur, 1);
      const e = u * u * (3 - 2 * u);
      const x = bx(p.from.x + (p.to.x - p.from.x) * e);
      const z = p.from.z + (p.to.z - p.from.z) * e;
      const h = (p.from.h + (p.to.h - p.from.h) * e + Math.sin(Math.PI * e) * p.arc) * U * 0.9;
      const w = p.kind === 'file' && u > 0.8 ? Math.max(8 * (1 - (u - 0.8) / 0.2), 1) : 8;
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
    if (ownerWaiting > 0 && ownerRoom) {
      const wave = 0.5 + 0.5 * Math.sin(t * 5);
      const ox = bx(ownerRoom.x);
      const oy = by(ownerRoom.z) - 30;
      bg.globalAlpha = 0.35 + 0.4 * wave;
      bg.drawImage(glow, ox - 24, oy - 24);
      bg.globalAlpha = 1;
      rect(bg, '#2a2540', ox - 4, oy - 4, 9, 9);
      rect(bg, '#facc15', ox - 3, oy - 3, 7, 7);
      rect(bg, '#fff3a8', ox - 2, oy - 2, 2, 2);
    }

    // ban đêm: nhuộm xanh tím cả cảnh rồi thắp đèn (màn hình, đèn bàn)
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
    const pill = (text: string, dot: string | null, x: number, y: number, tone: 'dark' | 'light' | 'warn') => {
      g.font = font;
      const tw = g.measureText(text).width;
      const h = 17 * dpr;
      const w = tw + 14 * dpr + (dot ? 11 * dpr : 0);
      const px = Math.round(x * dpr - w / 2);
      const py = Math.round(y * dpr - h / 2);
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
    for (const l of labels) {
      const p = toCss(l.x, l.y);
      if (l.dynamic && l.text === 'Khu nghỉ') pill(signText, sim.onBreak() ? '#f2b705' : l.dot, p.x, p.y, sim.onBreak() ? 'warn' : 'dark');
      else if (!small) pill(l.text, l.dot, p.x, p.y, 'dark');
      else if (l.dot) pill(l.text.replace(/^Team /, '').split(' · ')[0], l.dot, p.x, p.y, 'dark');
    }
    for (const v of visuals) {
      const a = v.actor;
      if (sim.hidden(a)) continue;
      if (small && a.spot.name !== selected && !a.view.needsYou && !a.view.failed) continue;
      const seated = sim.seated(a);
      const head = toCss(bx(a.x), by(a.z) - (seated ? 24 : 31));
      const up = 12;
      pill(a.spot.name, LAMP_HEX[lampOf(a.view)], head.x, head.y - up, 'dark');
      if (v.bubbleText) pill(v.bubbleText, null, head.x, head.y - up - 19, a.view.needsYou || a.view.failed ? 'warn' : 'light');
    }
  };

  // ---------- Tương tác ----------
  const personAt = (cssX: number, cssY: number): string | null => {
    const p = toBase(cssX, cssY);
    let best: { name: string; y: number } | null = null;
    for (const v of visuals) {
      const a = v.actor;
      if (sim.hidden(a)) continue;
      const ax = bx(a.x);
      const ay = by(a.z);
      const top = sim.seated(a) ? ay - 22 : ay - 30;
      if (p.x >= ax - 9 && p.x <= ax + 9 && p.y >= top && p.y <= ay + 3) if (!best || ay > best.y) best = { name: a.spot.name, y: ay };
      // bàn của người đó
      const dx = bx(a.spot.deskX);
      const dy = by(a.spot.deskZ);
      if (p.x >= dx - 18 && p.x <= dx + 18 && p.y >= dy - 17 && p.y <= dy + 9) if (!best) best = { name: a.spot.name, y: dy };
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
      notesShown = motion ? Math.min(4, Math.floor((ts - since) / 900) + 1) : 4;
      if (notesShown < 4) busy = true;
    } else notesShown = 0;
    if (papers.length > 0 || particles.length > 0) busy = true;
    if (ownerWaiting > 0 && motion) busy = true;
    for (const v of visuals) {
      const l = lampOf(v.actor.view);
      if ((l === 'needs_you' || l === 'overload') && motion) busy = true;
    }
    render(ts);
    dirty = false;
  };
  frame = requestAnimationFrame(tick);

  return {
    setViews(views) {
      sim.setViews(views);
      for (const v of visuals) {
        v.actor.view = views[v.actor.spot.name] ?? IDLE_VIEW;
        v.bubbleText = bubbleOf(v.actor.view);
      }
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
      for (const v of visuals) out[v.actor.spot.name] = toCss(bx(v.actor.x), by(v.actor.z) - 24);
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

