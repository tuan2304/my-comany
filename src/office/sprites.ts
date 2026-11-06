/**
 * Sprite pixel art của văn phòng, vẽ bằng mã (không cần tệp ảnh): nhân vật bốn hướng, đồ đạc, hoa văn sàn. Mỗi sprite
 * là một canvas nhỏ có viền tối tự động quanh hình, ba mức sáng tối và có bộ nhớ đệm. 16 px = 1 mét.
 */

export type C2D = CanvasRenderingContext2D;

/** Một sprite: ảnh, điểm neo trong ảnh (ox, oy) và độ lệch dùng để sắp xếp chiều sâu (tính từ neo xuống đáy chân/mặt đáy). */
export interface Sprite {
  img: HTMLCanvasElement;
  ox: number;
  oy: number;
  sortDy: number;
}

export const U = 16; // pixel cho mỗi mét
const OUTLINE = '#2a2540';

// ---------------------------------------------------------------------------------------------------------------
// Màu
// ---------------------------------------------------------------------------------------------------------------

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = rgbOf(a);
  const [br, bg, bb] = rgbOf(b);
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}
export const lighten = (c: string, t = 0.2) => mix(c, '#ffffff', t);
export const darken = (c: string, t = 0.2) => mix(c, '#14101f', t);
export const hexOf = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

// ---------------------------------------------------------------------------------------------------------------
// Dụng cụ vẽ
// ---------------------------------------------------------------------------------------------------------------

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: C2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as C2D;
  g.imageSmoothingEnabled = false;
  return { c, g };
}

const rect = (g: C2D, color: string, x: number, y: number, w = 1, h = 1) => {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), w, h);
};

/** Viền tối 1 px quanh mọi pixel đặc của sprite (chỉ phía ngoài hình). */
function outline(c: HTMLCanvasElement, color = OUTLINE) {
  const g = c.getContext('2d') as C2D;
  const { width: w, height: h } = c;
  const img = g.getImageData(0, 0, w, h);
  const src = img.data;
  const out = new Uint8ClampedArray(src);
  const [r, gg, b] = rgbOf(color);
  const alpha = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[(y * w + x) * 4 + 3]);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (alpha(x, y) >= 40) continue;
      if (alpha(x - 1, y) > 128 || alpha(x + 1, y) > 128 || alpha(x, y - 1) > 128 || alpha(x, y + 1) > 128) {
        const i = (y * w + x) * 4;
        out[i] = r;
        out[i + 1] = gg;
        out[i + 2] = b;
        out[i + 3] = 255;
      }
    }
  }
  g.putImageData(new ImageData(out, w, h), 0, 0);
}

/** Khối hộp nhìn nghiêng 3/4: mặt trên (w × d) nâng lên `hgt` px, mặt trước cao `hgt` px; đáy của vùng chiếm chỗ ở yBase. */
function block(g: C2D, x: number, yBase: number, w: number, d: number, hgt: number, top: string, front: string) {
  const yTop = yBase - d - hgt;
  rect(g, top, x, yTop, w, d);
  rect(g, lighten(top, 0.22), x, yTop, w, 1); // cạnh sáng phía sau
  rect(g, darken(top, 0.1), x + w - 1, yTop + 1, 1, d - 1); // cạnh tối bên phải
  if (hgt > 0) {
    rect(g, front, x, yBase - hgt, w, hgt);
    rect(g, lighten(front, 0.12), x, yBase - hgt, w, 1);
    rect(g, darken(front, 0.22), x, yBase - 1, w, 1);
    rect(g, darken(front, 0.12), x + w - 1, yBase - hgt, 1, hgt);
  }
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const cache = new Map<string, Sprite>();
function memo(key: string, build: () => Sprite): Sprite {
  let s = cache.get(key);
  if (!s) {
    s = build();
    cache.set(key, s);
  }
  return s;
}

/** Tạo sprite có viền: vẽ trong khung (w, h) với lề `pad`; (ax, ay) là điểm neo trong khung vẽ. */
function make(w: number, h: number, ax: number, ay: number, draw: (g: C2D) => void, sortDy = 0, pad = 2, withOutline = true): Sprite {
  const { c, g } = canvas(w + pad * 2, h + pad * 2);
  g.translate(pad, pad);
  draw(g);
  if (withOutline) outline(c);
  return { img: c, ox: ax + pad, oy: ay + pad, sortDy };
}

// ---------------------------------------------------------------------------------------------------------------
// Nhân vật (khung 16 × 28, neo ở giữa chân hoặc ở hông khi ngồi)
// ---------------------------------------------------------------------------------------------------------------

import type { Look } from './look.ts';
export type { Look } from './look.ts';

export type Dir = 'down' | 'up' | 'left' | 'right';
export type Pose = 'stand' | 'walkA' | 'walkB' | 'sit';
export type Arms = 'down' | 'forward' | 'typeA' | 'typeB' | 'upR' | 'upBoth' | 'cup' | 'head' | 'book' | 'talkA' | 'talkB';

function drawFigure(g: C2D, look: Look, dir: Dir, pose: Pose, arms: Arms, headTurn: number) {
  const front = dir === 'down';
  const back = dir === 'up';
  const sit = pose === 'sit';
  const { skin, hair, shirt, pants } = look;
  const shirtL = lighten(shirt, 0.2);
  const shirtD = darken(shirt, 0.22);
  const skinD = darken(skin, 0.12);
  const hairL = lighten(hair, 0.22);
  const shoe = '#2a2438';
  const tone = back ? 0.1 : 0;
  const body = tone ? darken(shirt, tone) : shirt;

  if (dir === 'left' || dir === 'right') {
    // ---- nhìn ngang (vẽ hướng phải, trái thì lật) ----
    const walk = pose === 'walkA' || pose === 'walkB';
    const sw = pose === 'walkA' ? 2 : pose === 'walkB' ? -2 : 0;
    // chân sau, chân trước
    rect(g, darken(pants, 0.15), 5 - sw / 2, 19, 3, 7);
    rect(g, shoe, 5 - sw / 2, 25, 4, 2);
    rect(g, pants, 7 + sw / 2, 19, 3, 7);
    rect(g, shoe, 7 + sw / 2, 25, 5, 2);
    // thân
    rect(g, body, 5, 10, 6, 10);
    rect(g, shirtL, 5, 10, 1, 9);
    rect(g, shirtD, 10, 11, 1, 8);
    // tay gần
    const armSwing = walk ? (pose === 'walkA' ? -1 : 1) : 0;
    rect(g, shirtD, 6 + armSwing, 11, 3, 6);
    rect(g, skin, 6 + armSwing, 17, 3, 2);
    // đầu
    rect(g, skin, 5, 1, 7, 9);
    rect(g, skinD, 11, 3, 1, 6);
    rect(g, hair, 5, 1, 7, 3);
    rect(g, hair, 5, 4, 3, look.style === 1 ? 9 : 4);
    rect(g, hairL, 6, 1, 4, 1);
    rect(g, '#2a2438', 10, 6, 1, 2); // mắt
    rect(g, skinD, 12, 7, 1, 1); // mũi
    if (look.glasses) rect(g, '#2a2438', 9, 6, 3, 1);
    if (look.style === 2) rect(g, hair, 4, 2, 2, 2);
    if (look.crown) {
      rect(g, '#f5c542', 6, -1, 5, 2);
      rect(g, '#f5c542', 6, -2, 1, 1);
      rect(g, '#f5c542', 8, -3, 1, 2);
      rect(g, '#f5c542', 10, -2, 1, 1);
    }
    if (arms === 'forward' || arms === 'typeA' || arms === 'typeB' || arms === 'book') rect(g, skin, 10, 15, 3, 2);
    return;
  }

  // ---- nhìn trước / sau ----
  if (!sit) {
    const legLen = (i: number) => (pose === 'walkA' ? (i === 0 ? 8 : 6) : pose === 'walkB' ? (i === 0 ? 6 : 8) : 7);
    for (let i = 0; i < 2; i += 1) {
      const x = 4 + i * 4;
      const len = legLen(i);
      rect(g, i === 0 ? pants : darken(pants, 0.12), x, 19, 4, len);
      rect(g, shoe, x, 19 + len - 2, 4, 2);
    }
  }
  // thân
  rect(g, body, 3, 10, 10, sit ? 10 : 9);
  rect(g, tone ? darken(shirtL, tone) : shirtL, 3, 10, 1, 9);
  rect(g, tone ? darken(shirtD, tone) : shirtD, 12, 10, 1, 9);
  rect(g, darken(body, 0.25), 3, 19, 10, 1); // thắt lưng
  if (front) {
    rect(g, skin, 7, 10, 2, 2); // cổ
    if (look.tie) {
      rect(g, '#f2f2f2', 6, 10, 4, 2);
      rect(g, '#d6313f', 7, 11, 2, 7);
      rect(g, '#9e1f2b', 8, 12, 1, 6);
    }
  }
  // tay
  const armY = 11;
  const arm = (x: number, color: string) => rect(g, color, x, armY, 2, 8);
  const hand = (x: number, y: number) => rect(g, skin, x, y, 2, 2);
  switch (arms) {
    case 'upR':
      arm(1, shirtD);
      hand(1, 18);
      rect(g, shirtD, 13, 2, 2, 10);
      hand(13, 0);
      break;
    case 'upBoth':
      rect(g, shirtD, 1, 2, 2, 10);
      hand(1, 0);
      rect(g, shirtD, 13, 2, 2, 10);
      hand(13, 0);
      break;
    case 'cup':
      arm(1, shirtD);
      hand(1, 18);
      rect(g, shirtD, 13, 11, 2, 4);
      rect(g, shirtD, 11, 9, 3, 3);
      if (front) {
        hand(9, 7);
        rect(g, '#f4f4f4', 10, 5, 3, 3);
        rect(g, '#7a4b2a', 10, 5, 3, 1);
      }
      break;
    case 'head':
      arm(1, shirtD);
      hand(1, 18);
      rect(g, shirtD, 13, 8, 2, 5);
      hand(12 + (headTurn > 0 ? 1 : 0), 4);
      break;
    case 'book':
      arm(1, shirtD);
      rect(g, shirtD, 13, 11, 2, 6);
      rect(g, '#8a5a35', 4, 13, 8, 5);
      rect(g, '#f4eede', 5, 14, 6, 3);
      rect(g, '#8a5a35', 7, 14, 1, 3);
      hand(3, 15);
      hand(11, 15);
      break;
    case 'talkA':
    case 'talkB':
      arm(1, shirtD);
      hand(1, arms === 'talkA' ? 16 : 18);
      rect(g, shirtD, 13, arms === 'talkA' ? 8 : 10, 2, 6);
      hand(13, arms === 'talkA' ? 6 : 8);
      break;
    case 'forward':
    case 'typeA':
    case 'typeB': {
      rect(g, shirtD, 1, 11, 2, 5);
      rect(g, shirtD, 13, 11, 2, 5);
      if (front) {
        hand(4, arms === 'typeB' ? 15 : 17);
        hand(10, arms === 'typeA' ? 15 : 17);
      }
      break;
    }
    default:
      arm(1, shirtD);
      hand(1, 18);
      arm(13, shirtD);
      hand(13, 18);
  }
  // đầu
  const hx = 4;
  rect(g, back ? hair : skin, hx, 1, 8, 9);
  if (!back) {
    rect(g, skinD, hx + 7, 3, 1, 6);
    // tóc
    rect(g, hair, hx, 1, 8, 3);
    rect(g, hair, hx, 4, 1, look.style === 1 ? 9 : 2);
    rect(g, hair, hx + 7, 4, 1, look.style === 1 ? 9 : 2);
    rect(g, hairL, hx + 1, 1, 4, 1);
    // mắt
    const eyeShift = headTurn;
    rect(g, '#2a2438', 6 + eyeShift, 6, 1, 2);
    rect(g, '#2a2438', 9 + eyeShift, 6, 1, 2);
    if (look.glasses) rect(g, '#2a2438', 5 + eyeShift, 6, 6, 1);
    rect(g, darken(skin, 0.2), 7 + eyeShift, 9, 2, 1); // miệng
  } else {
    rect(g, hairL, hx + 1, 1, 4, 1);
    rect(g, darken(hair, 0.2), hx, 7, 8, 2);
    if (look.style === 1) rect(g, hair, hx - 1, 4, 10, 9);
  }
  if (look.style === 2) rect(g, hair, 6, -1, 4, 2);
  if (look.crown) {
    rect(g, '#f5c542', 5, -1, 6, 2);
    rect(g, '#f5c542', 5, -2, 1, 1);
    rect(g, '#f5c542', 7, -3, 2, 2);
    rect(g, '#f5c542', 10, -2, 1, 1);
    rect(g, '#fff3b0', 7, -1, 1, 1);
  }
}

/** Nhân vật ở một hướng, dáng, vị trí tay; neo ở giữa chân (đứng, đi) hoặc ở hông (ngồi). */
export function personSprite(look: Look, dir: Dir, pose: Pose, arms: Arms, headTurn = 0): Sprite {
  const key = `p|${look.skin}${look.hair}${look.shirt}${look.pants}${look.style}${look.crown ? 1 : 0}${look.tie ? 1 : 0}${look.glasses ? 1 : 0}|${dir}|${pose}|${arms}|${headTurn}`;
  return memo(key, () => {
    const sit = pose === 'sit';
    const w = 16;
    const h = 28;
    const pad = 5;
    const { c, g } = canvas(w + pad * 2, h + pad * 2);
    g.translate(pad, pad + 3);
    if (dir === 'left') {
      g.translate(w, 0);
      g.scale(-1, 1);
    }
    drawFigure(g, look, dir, pose, arms, headTurn);
    outline(c);
    return { img: c, ox: pad + w / 2, oy: pad + 3 + (sit ? 20 : 28), sortDy: 0 };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Đồ đạc
// ---------------------------------------------------------------------------------------------------------------

const WOOD = '#d4a76a';
const WOOD_D = '#a67c4a';


/** Bàn làm việc 35 × 18, mặt bàn cao 6 px. `side` là phía người ngồi: bắc thì thấy lưng màn hình, nam thì thấy mặt màn hình. */
export function deskSprite(side: 'north' | 'south'): Sprite {
  return memo(`desk|${side}`, () => {
    const w = 35;
    const d = 18;
    const hgt = 6;
    return make(w, d + hgt, w / 2, d + hgt, (g) => {
      const yBase = d + hgt;
      // chân bàn lộ ra dưới mặt trước
      block(g, 0, yBase, w, d, hgt, WOOD, WOOD_D);
      rect(g, darken(WOOD, 0.08), 1, hgt, w - 2, 1);
      const top = 0; // mặt trên bắt đầu từ y = 0
      // màn hình
      const mx = 13;
      if (side === 'north') {
        const my = top + 2;
        rect(g, '#363c4c', mx, my, 10, 7);
        rect(g, '#4a5268', mx, my, 10, 1);
        rect(g, '#2b3040', mx + 4, my + 7, 2, 1);
      } else {
        const my = top + 7;
        rect(g, '#2b3040', mx, my, 10, 7);
        rect(g, '#6fd0ff', mx + 1, my + 1, 8, 4);
        rect(g, '#bfeaff', mx + 1, my + 1, 8, 1);
        rect(g, '#3a4156', mx + 4, my + 6, 2, 1);
      }
      // bàn phím, chuột, cốc, giấy
      const ky = side === 'north' ? top + 11 : top + 4;
      rect(g, '#d8dce4', 12, ky, 11, 3);
      rect(g, '#aab0bd', 13, ky + 1, 9, 1);
      rect(g, '#f4f4f4', 26, ky, 2, 3);
      rect(g, '#f8f8f8', 3, top + 5, 3, 3);
      rect(g, '#7a4b2a', 3, top + 5, 3, 1);
      rect(g, '#fff6a8', 30, top + 3, 3, 3);
    });
  });
}

/** Ghế xoay (phần ngồi). Lưng ghế vẽ riêng để xếp trước/sau người ngồi. */
export function chairSeat(): Sprite {
  return memo('chair-seat', () => make(10, 10, 5, 9, (g) => {
    rect(g, '#4b5870', 0, 0, 10, 9);
    rect(g, '#6a7a96', 0, 0, 10, 1);
    rect(g, '#363f55', 0, 8, 10, 1);
    rect(g, '#2a2f40', 3, 9, 4, 1);
  }));
}
export function chairBack(): Sprite {
  return memo('chair-back', () => make(10, 5, 5, 5, (g) => {
    rect(g, '#566581', 0, 0, 10, 5);
    rect(g, '#7686a4', 0, 0, 10, 1);
    rect(g, '#363f55', 0, 4, 10, 1);
  }));
}

export function plantSprite(kind = 0): Sprite {
  return memo(`plant|${kind}`, () => make(16, 24, 8, 20, (g) => {
    // chậu
    rect(g, '#c8714c', 4, 15, 8, 5);
    rect(g, '#e08a62', 4, 15, 8, 1);
    rect(g, '#9a4f33', 4, 19, 8, 1);
    rect(g, '#5a3a24', 5, 14, 6, 1);
    // tán lá
    const greens = ['#3f9a5a', '#4caf68', '#2f7f4a', '#7ed08a'];
    const blobs = kind === 0
      ? [[8, 9, 6], [5, 11, 4], [11, 11, 4], [8, 5, 4]]
      : [[8, 8, 5], [4, 10, 3], [12, 10, 3], [8, 3, 3], [8, 12, 4]];
    for (const [cx, cy, r] of blobs) {
      for (let y = -r; y <= r; y += 1) for (let x = -r; x <= r; x += 1) {
        if (x * x + y * y <= r * r + 1) rect(g, y < -r / 3 ? greens[1] : greens[0], cx + x, cy + y);
      }
    }
    rect(g, greens[3], 6, 6, 2, 1);
    rect(g, greens[3], 9, 3, 2, 1);
    rect(g, greens[2], 5, 12, 6, 1);
    rect(g, greens[2], 9, 11, 3, 1);
  }, 0));
}

export function sofaSprite(color: string, backAtBottom: boolean): Sprite {
  return memo(`sofa|${color}|${backAtBottom}`, () => {
    const w = 36;
    const d = 16;
    return make(w, d + 6, w / 2, d + 6, (g) => {
      const dark = darken(color, 0.25);
      const light = lighten(color, 0.18);
      const yBase = d + 6;
      // thân ghế
      block(g, 0, yBase, w, d, 6, color, dark);
      if (backAtBottom) {
        rect(g, dark, 0, d - 1, w, 4); // lưng tựa ở phía nam (dưới)
        rect(g, light, 1, d - 1, w - 2, 1);
        rect(g, color, 4, 4, 12, 8);
        rect(g, color, 20, 4, 12, 8);
      } else {
        rect(g, dark, 0, 0, w, 5);
        rect(g, color, 4, 6, 12, 8);
        rect(g, color, 20, 6, 12, 8);
      }
      rect(g, light, 4, backAtBottom ? 4 : 6, 12, 1);
      rect(g, light, 20, backAtBottom ? 4 : 6, 12, 1);
      rect(g, dark, 16, backAtBottom ? 4 : 6, 1, 8);
      // tay vịn
      rect(g, dark, 0, 2, 3, d - 2);
      rect(g, dark, w - 3, 2, 3, d - 2);
      // gối
      rect(g, '#f3e3c3', 6, backAtBottom ? 3 : 5, 4, 3);
      rect(g, '#e8b4a0', 26, backAtBottom ? 3 : 5, 4, 3);
    });
  });
}

export function roundTable(r = 7): Sprite {
  return memo(`round|${r}`, () => make(r * 2 + 2, r * 2 + 6, r + 1, r * 2 + 1, (g) => {
    const cx = r + 1;
    const cy = r + 1;
    for (let y = -r; y <= r; y += 1) for (let x = -r; x <= r; x += 1) if (x * x + y * y <= r * r) rect(g, y < -r / 2 ? lighten(WOOD, 0.2) : WOOD, cx + x, cy + y);
    // chân bàn
    rect(g, WOOD_D, cx - 1, cy + r, 3, 3);
    rect(g, '#f4f4f4', cx - 1, cy - 1, 3, 2);
    rect(g, '#7a4b2a', cx - 1, cy - 1, 3, 1);
  }, r));
}

export function longTable(w: number, d: number): Sprite {
  return memo(`long|${w}|${d}`, () => make(w, d + 5, w / 2, d + 5, (g) => {
    block(g, 0, d + 5, w, d, 5, WOOD, WOOD_D);
    rect(g, '#f8f8f8', 4, 3, 7, 5);
    rect(g, '#cfd6e0', 5, 4, 5, 1);
    rect(g, '#f4f4f4', w - 8, 4, 3, 3);
    rect(g, '#7a4b2a', w - 8, 4, 3, 1);
  }));
}

export function counterSprite(w: number): Sprite {
  return memo(`counter|${w}`, () => make(w, 12 + 14, w / 2, 26, (g) => {
    block(g, 0, 26, w, 12, 12, '#59606e', '#eef1f6');
    // cửa tủ
    for (let x = 3; x < w - 3; x += 10) {
      rect(g, '#d3d9e4', x, 16, 8, 9);
      rect(g, '#b4bdcc', x + 7, 18, 1, 5);
    }
    rect(g, '#2b3040', 4, 3, 7, 7); // máy pha cà phê
    rect(g, '#d6313f', 5, 3, 5, 2);
    rect(g, '#7fd1ff', 7, 6, 1, 3);
    rect(g, '#f4f4f4', 14, 6, 3, 3); // cốc
    rect(g, '#aab4c4', w - 12, 4, 8, 6); // bồn rửa
    rect(g, '#7e8ba0', w - 10, 5, 4, 4);
    rect(g, '#aab4c4', w - 8, 1, 1, 3);
  }));
}

export function fridgeSprite(): Sprite {
  return memo('fridge', () => make(14, 14 + 26, 7, 40, (g) => {
    block(g, 0, 40, 14, 12, 26, '#e6ebf2', '#f6f8fb');
    rect(g, '#c7d0de', 1, 13, 12, 1);
    rect(g, '#7e8ba0', 11, 15, 1, 6);
    rect(g, '#7e8ba0', 11, 4, 1, 5);
    rect(g, '#ffb4c0', 3, 5, 3, 3);
  }));
}

export function coolerSprite(): Sprite {
  return memo('cooler', () => make(8, 22, 4, 20, (g) => {
    rect(g, '#7fd1ff', 1, 0, 6, 8);
    rect(g, '#b8e6ff', 2, 1, 2, 5);
    rect(g, '#d8dee8', 0, 8, 8, 12);
    rect(g, '#aab4c4', 0, 8, 8, 1);
    rect(g, '#d6313f', 2, 12, 1, 2);
    rect(g, '#2f6fd6', 5, 12, 1, 2);
    rect(g, '#8d97a8', 0, 19, 8, 1);
  }));
}

export function receptionSprite(w: number): Sprite {
  return memo(`reception|${w}`, () => make(w, 14 + 16, w / 2, 30, (g) => {
    block(g, 0, 30, w, 14, 16, '#f2f3f6', '#d9dde6');
    rect(g, '#59606e', 0, 0, w, 1);
    rect(g, '#2b3040', 6, -4, 9, 7);
    rect(g, '#6fd0ff', 7, -3, 7, 4);
    rect(g, '#f5c542', w - 10, 3, 4, 2);
    rect(g, '#e8b4a0', 18, 18, w - 36, 3);
  }, 6));
}

export function rackSprite(units: number): Sprite {
  return memo(`rack|${units}`, () => {
    const w = units * 16;
    return make(w, 12 + 26, w / 2, 38, (g) => {
      for (let i = 0; i < units; i += 1) {
        const x = i * 16;
        block(g, x + 1, 38, 14, 12, 26, '#3a4150', '#242a38');
        for (let k = 0; k < 6; k += 1) {
          rect(g, '#1a1f2b', x + 3, 14 + k * 4, 10, 3);
          rect(g, k % 3 === 0 ? '#f59e0b' : '#37d67a', x + 11, 15 + k * 4, 1, 1);
          rect(g, '#566074', x + 3, 14 + k * 4, 6, 1);
        }
      }
    });
  });
}

export function shelfSprite(w: number): Sprite {
  return memo(`shelf|${w}`, () => make(w, 8 + 26, w / 2, 34, (g) => {
    block(g, 0, 34, w, 8, 26, '#8a6240', '#a97b52');
    const colors = ['#d6313f', '#2f6fd6', '#2fb36a', '#f59e0b', '#8b5cf6', '#14b8a6'];
    for (let level = 0; level < 3; level += 1) {
      const y = 12 + level * 7;
      rect(g, '#6b4a2f', 1, y + 6, w - 2, 1);
      for (let x = 2; x < w - 3; x += 3) rect(g, colors[(x + level) % colors.length], x, y, 2, 6);
    }
  }));
}

export function cabinetSprite(w: number): Sprite {
  return memo(`cabinet|${w}`, () => make(w, 8 + 24, w / 2, 32, (g) => {
    block(g, 0, 32, w, 8, 24, '#aab4c3', '#c4ccd8');
    for (let x = 1; x + 14 <= w; x += 15) {
      for (let k = 0; k < 3; k += 1) {
        rect(g, '#8693a5', x, 10 + k * 7, 13, 6);
        rect(g, '#e2e8f0', x + 5, 12 + k * 7, 3, 1);
      }
    }
  }));
}

export function easelSprite(color: string): Sprite {
  return memo(`easel|${color}`, () => make(28, 34, 14, 32, (g) => {
    rect(g, '#6b7a90', 4, 16, 2, 16);
    rect(g, '#6b7a90', 22, 16, 2, 16);
    rect(g, '#f8fafc', 1, 1, 26, 17);
    rect(g, '#cfd6e0', 1, 17, 26, 1);
    rect(g, color, 1, 1, 26, 2);
    rect(g, '#94a3b8', 4, 6, 14, 1);
    rect(g, '#94a3b8', 4, 9, 10, 1);
    rect(g, color, 18, 10, 6, 5);
    rect(g, '#7e8ba0', 3, 17, 22, 1);
  }, 0));
}

export function bookSprite(): Sprite {
  return memo('book', () => make(5, 3, 2, 1, (g) => {
    rect(g, '#f6d34a', 0, 0, 5, 3);
  }));
}

export function tvSprite(): Sprite {
  return memo('tv', () => make(34, 20, 17, 18, (g) => {
    rect(g, '#1b1f2b', 0, 0, 34, 18);
    rect(g, '#2c6fc0', 2, 2, 30, 13);
    rect(g, '#5fa8ee', 2, 2, 30, 2);
    rect(g, '#f5c542', 20, 7, 7, 5);
    rect(g, '#2a8f55', 6, 9, 9, 4);
    rect(g, '#3a4156', 14, 18, 6, 1);
  }));
}

export function stallSprite(): Sprite {
  return memo('stall', () => make(30, 14 + 20, 15, 34, (g) => {
    block(g, 0, 34, 30, 3, 22, '#c7d2da', '#dfe7ec');
    rect(g, '#aab8c2', 12, 12, 6, 14);
    rect(g, '#f4f6f8', 8, 22, 14, 10);
    rect(g, '#cfd8de', 8, 22, 14, 1);
    rect(g, '#f4f6f8', 11, 18, 8, 4);
  }));
}

export function treeSprite(variant: number): Sprite {
  return memo(`tree|${variant}`, () => make(36, 46, 18, 44, (g) => {
    const greens = ['#3a8f55', '#4caf68', '#2c7a47', '#7ed08a'];
    rect(g, '#7a5a3c', 16, 30, 5, 14);
    rect(g, '#5a3f28', 19, 30, 2, 14);
    const r = seeded(variant + 5);
    const blobs = [[18, 18, 13], [10, 24, 8], [26, 24, 8], [18, 9, 8]];
    for (const [cx, cy, rr] of blobs) {
      for (let y = -rr; y <= rr; y += 1) for (let x = -rr; x <= rr; x += 1) {
        if (x * x + y * y <= rr * rr) rect(g, y < -rr / 2 ? greens[1] : x > rr / 3 ? greens[2] : greens[0], cx + x, cy + y);
      }
    }
    for (let i = 0; i < 14; i += 1) rect(g, greens[3], 6 + Math.floor(r() * 24), 4 + Math.floor(r() * 24), 2, 1);
  }, 0));
}

export function bushSprite(): Sprite {
  return memo('bush', () => make(14, 10, 7, 9, (g) => {
    for (const [cx, cy, rr] of [[5, 6, 4], [9, 6, 4], [7, 4, 3]]) {
      for (let y = -rr; y <= rr; y += 1) for (let x = -rr; x <= rr; x += 1) if (x * x + y * y <= rr * rr) rect(g, y < 0 ? '#58b86f' : '#3a8f55', cx + x, cy + y);
    }
  }));
}

export function doorSprite(w: number): Sprite {
  return memo(`door|${w}`, () => make(w, 28, w / 2, 26, (g) => {
    rect(g, 'rgba(160,215,245,0.55)', 0, 3, w, 22);
    rect(g, '#7e8ba0', 0, 0, w, 3);
    rect(g, '#7e8ba0', 0, 3, 2, 22);
    rect(g, '#7e8ba0', w - 2, 3, 2, 22);
    rect(g, '#7e8ba0', Math.floor(w / 2) - 1, 3, 2, 22);
    rect(g, 'rgba(255,255,255,0.5)', 4, 6, 2, 8);
    rect(g, 'rgba(255,255,255,0.5)', Math.floor(w / 2) + 4, 6, 2, 8);
  }, 0, 2, false));
}

// ---------------------------------------------------------------------------------------------------------------
// Hoa văn sàn (ô lặp lại)
// ---------------------------------------------------------------------------------------------------------------

export type FloorKind = 'wood' | 'carpet' | 'tile' | 'stone' | 'grass' | 'asphalt' | 'server' | 'marble';

const tileCache = new Map<string, HTMLCanvasElement>();

/** Ô sàn 16 × 16 (hoặc 32 × 32) lặp lại; `base` là màu chủ đạo. */
export function floorTile(kind: FloorKind, base: string): HTMLCanvasElement {
  const key = `${kind}|${base}`;
  const cached = tileCache.get(key);
  if (cached) return cached;
  const size = kind === 'wood' || kind === 'stone' || kind === 'asphalt' || kind === 'grass' ? 32 : 16;
  const { c, g } = canvas(size, size);
  const r = seeded(kind.length * 977 + base.charCodeAt(1) * 31 + base.charCodeAt(3));
  rect(g, base, 0, 0, size, size);
  if (kind === 'wood') {
    // ván sàn nằm ngang, mỗi ván 4 px, so le
    for (let row = 0; row < size / 4; row += 1) {
      const y = row * 4;
      rect(g, darken(base, 0.14), 0, y + 3, size, 1);
      const off = (row * 11) % size;
      rect(g, darken(base, 0.14), off, y, 1, 3);
      rect(g, lighten(base, 0.07), 0, y, size, 1);
      for (let i = 0; i < 3; i += 1) rect(g, i % 2 ? darken(base, 0.06) : lighten(base, 0.05), Math.floor(r() * size), y + 1 + Math.floor(r() * 2), 2 + Math.floor(r() * 3), 1);
    }
  } else if (kind === 'carpet') {
    for (let i = 0; i < 26; i += 1) rect(g, r() > 0.5 ? lighten(base, 0.06) : darken(base, 0.06), Math.floor(r() * size), Math.floor(r() * size), 1, 1);
  } else if (kind === 'tile') {
    rect(g, darken(base, 0.12), 0, 0, size, 1);
    rect(g, darken(base, 0.12), 0, 0, 1, size);
    rect(g, darken(base, 0.12), 8, 8, 8, 1);
    rect(g, darken(base, 0.12), 8, 8, 1, 8);
    rect(g, lighten(base, 0.08), 1, 1, 7, 1);
    rect(g, lighten(base, 0.08), 9, 9, 7, 1);
  } else if (kind === 'marble') {
    rect(g, lighten(base, 0.06), 0, 0, 8, 8);
    rect(g, lighten(base, 0.06), 8, 8, 8, 8);
    rect(g, darken(base, 0.1), 0, 0, size, 1);
    rect(g, darken(base, 0.1), 0, 0, 1, size);
    for (let i = 0; i < 5; i += 1) rect(g, darken(base, 0.06), Math.floor(r() * size), Math.floor(r() * size), 3, 1);
  } else if (kind === 'stone') {
    for (let by = 0; by < 2; by += 1) {
      for (let bx = 0; bx < 2; bx += 1) {
        const x = bx * 16 + (by ? 8 : 0);
        const y = by * 16;
        rect(g, darken(base, 0.1), x % 32, y, 1, 16);
        if (x + 16 > 32) rect(g, darken(base, 0.1), 0, y, 1, 16);
      }
      rect(g, darken(base, 0.1), 0, by * 16, size, 1);
    }
    for (let i = 0; i < 14; i += 1) rect(g, r() > 0.5 ? lighten(base, 0.05) : darken(base, 0.05), Math.floor(r() * size), Math.floor(r() * size), 2, 1);
  } else if (kind === 'grass') {
    for (let i = 0; i < 70; i += 1) {
      const x = Math.floor(r() * size);
      const y = Math.floor(r() * size);
      rect(g, r() > 0.45 ? lighten(base, 0.12) : darken(base, 0.12), x, y, 1, 2);
    }
    for (let i = 0; i < 2; i += 1) {
      const x = Math.floor(r() * (size - 2));
      const y = Math.floor(r() * (size - 2));
      rect(g, ['#ffd84a', '#ff8fb1', '#ffffff'][Math.floor(r() * 3)], x, y, 1, 1);
    }
  } else if (kind === 'asphalt') {
    for (let i = 0; i < 40; i += 1) rect(g, r() > 0.5 ? lighten(base, 0.06) : darken(base, 0.08), Math.floor(r() * size), Math.floor(r() * size), 1, 1);
  } else if (kind === 'server') {
    rect(g, darken(base, 0.18), 0, 0, size, 1);
    rect(g, darken(base, 0.18), 0, 0, 1, size);
    rect(g, lighten(base, 0.08), 1, 1, size - 1, 1);
    rect(g, lighten(base, 0.05), 8, 6, 2, 1);
  }
  tileCache.set(key, c);
  return c;
}

export function clearSpriteCache() {
  cache.clear();
  tileCache.clear();
}
