/**
 * Dụng cụ pixel art dùng chung cho bản 2D: màu, canvas nhỏ và hoa văn sàn (ô lặp lại), vẽ bằng mã (không cần tệp ảnh).
 * 16 px = 1 mét. Đồ đạc và nhân vật nhìn từ trên xuống nằm ở topdown.ts.
 */

export type C2D = CanvasRenderingContext2D;

export const U = 16; // pixel cho mỗi mét

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

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
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
  tileCache.clear();
}
