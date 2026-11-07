import type { Decor, Obstacle } from './layout';
import type { Look } from './look';
import { darken, lighten, U } from './sprites';

/**
 * Bộ vẽ pixel art nhìn thẳng từ trên xuống (như một mặt bằng văn phòng): đồ đạc, bàn làm việc, nhân vật. Mọi hình đều
 * dựng bằng hình chữ nhật và hình tròn pixel (không làm mờ biên) nên phóng to nguyên bước vẫn sắc nét. 16 px = 1 mét.
 */

export type G = CanvasRenderingContext2D;

export const CHAIR_COLORS = ['#f08a4b', '#4fa7a0', '#e86f8f', '#8c7ae6', '#f2c14e', '#5b9bd5'];
const CHAIRS = CHAIR_COLORS;
const WOOD = '#e0b886';
const WHITE = '#f3eee8';

export const rect = (g: G, c: string, x: number, y: number, w: number, h: number) => {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

/** Hình tròn pixel (từng dòng một, biên cứng). */
export function disc(g: G, c: string, cx: number, cy: number, r: number) {
  g.fillStyle = c;
  const ri = Math.max(Math.round(r), 1);
  for (let dy = -ri; dy <= ri; dy += 1) {
    const half = Math.round(Math.sqrt(Math.max(r * r - dy * dy, 0)));
    g.fillRect(Math.round(cx) - half, Math.round(cy) + dy, half * 2 + 1, 1);
  }
}

/** Hình elip pixel. */
export function ellipse(g: G, c: string, cx: number, cy: number, rx: number, ry: number) {
  g.fillStyle = c;
  const ryi = Math.max(Math.round(ry), 1);
  for (let dy = -ryi; dy <= ryi; dy += 1) {
    const half = Math.round(rx * Math.sqrt(Math.max(1 - (dy * dy) / (ry * ry), 0)));
    g.fillRect(Math.round(cx) - half, Math.round(cy) + dy, half * 2, 1);
  }
}

/** Bóng đổ mềm lệch xuống phải của một khối. */
export function shadow(g: G, x: number, y: number, w: number, h: number, off = 2, alpha = 0.22) {
  g.fillStyle = `rgba(30,20,50,${alpha})`;
  g.fillRect(Math.round(x) + off, Math.round(y) + off, Math.round(w), Math.round(h));
}

/** Khối hộp nhìn từ trên: nền, viền tối 1 px, vạch sáng ở mép trên trái để có chiều sâu. */
export function block(g: G, fill: string, x: number, y: number, w: number, h: number, edge = darken(fill, 0.28), withShadow = true) {
  if (withShadow) shadow(g, x, y, w, h);
  rect(g, edge, x, y, w, h);
  rect(g, fill, x + 1, y + 1, w - 2, h - 2);
  rect(g, lighten(fill, 0.25), x + 1, y + 1, w - 2, 1);
  rect(g, lighten(fill, 0.12), x + 1, y + 1, 1, h - 2);
}

const BOOKS = ['#e0525f', '#4a86d9', '#4cbf86', '#f5a742', '#9b6df0', '#2cb5a6'];

// ---------------------------------------------------------------------------------------------------------------
// Bàn làm việc và ghế
// ---------------------------------------------------------------------------------------------------------------

/**
 * Mặt bàn làm việc nhìn từ trên (tâm tại (cx, cy)): hai tấm hông trắng, màn hình ở mép xa người ngồi, bàn phím ở mép gần,
 * cốc, cây mini. `toward` là chiều từ người ngồi tới bàn: +1 là xuống màn hình (người ngồi phía trên bàn), -1 là lên.
 */
export function deskTop(g: G, cx: number, cy: number, toward: 1 | -1, variant: number, occupied: boolean) {
  const w = 2.2 * U;
  const h = 1.1 * U;
  const x = cx - w / 2;
  const y = cy - h / 2;
  shadow(g, x, y, w, h, 2, 0.26);
  rect(g, darken(WOOD, 0.3), x, y, w, h);
  rect(g, WOOD, x + 1, y + 1, w - 2, h - 2);
  rect(g, lighten(WOOD, 0.3), x + 1, y + 1, w - 2, 1);
  rect(g, WHITE, x + 1, y + 1, 2, h - 2); // hông trái
  rect(g, WHITE, x + w - 3, y + 1, 2, h - 2); // hông phải
  // tay vịn hộc kéo bên phải
  rect(g, darken(WHITE, 0.15), x + w - 11, y + 2, 7, h - 4);
  rect(g, '#b8b0a8', x + w - 9, y + (toward === 1 ? 3 : h - 4), 3, 1);
  const far = toward === 1 ? h - 5 : 3; // mép xa người ngồi
  const near = toward === 1 ? 3 : h - 5;
  // màn hình: khung tối, mặt sáng khi có người
  rect(g, '#262b3b', cx - 7, y + far - 1, 14, 3);
  rect(g, occupied ? '#6fb7e8' : '#3a4256', cx - 6, y + far - (toward === 1 ? 0 : 0), 12, 1);
  rect(g, '#59607a', cx - 1, y + far + (toward === 1 ? -2 : 2), 2, 2); // chân màn hình
  // bàn phím và chuột
  rect(g, '#f4f6fa', cx - 6, y + near, 12, 3);
  rect(g, '#c7d0de', cx - 5, y + near + 1, 10, 1);
  rect(g, '#f4f6fa', cx + 8, y + near + 1, 2, 3);
  // cốc
  disc(g, '#ffffff', x + 7, y + h / 2 + 1, 2);
  disc(g, '#7a4b2a', x + 7, y + h / 2 + 1, 1);
  if (variant % 2 === 0) {
    // khung ảnh nhỏ
    rect(g, '#f4efe8', x + w - 16, y + (toward === 1 ? 2 : h - 5), 4, 3);
    rect(g, CHAIRS[variant % CHAIRS.length], x + w - 15, y + (toward === 1 ? 3 : h - 4), 2, 1);
  } else {
    // chậu cây nhỏ
    disc(g, '#58b86f', x + w - 14, y + (toward === 1 ? 4 : h - 5), 2);
    rect(g, '#d9825b', x + w - 15, y + (toward === 1 ? 5 : h - 6), 2, 1);
  }
  // giấy nhớ dán gần màn hình
  rect(g, '#fde047', cx - 10, y + far - 1, 2, 2);
  rect(g, '#f9a8d4', cx + 8, y + far - 1, 2, 2);
}

/** Ghế xoay nhìn từ trên: đệm tròn có màu và lưng ghế là cung tối ở phía sau lưng người ngồi. */
export function chairTop(g: G, cx: number, cy: number, dirX: number, dirY: number, color: string) {
  shadow(g, cx - 5, cy - 5, 11, 11, 2, 0.2);
  disc(g, darken(color, 0.3), cx, cy, 5.5);
  disc(g, color, cx, cy, 4.5);
  disc(g, lighten(color, 0.25), cx - 1, cy - 1, 2);
  // lưng ghế: dải cong ở phía sau (ngược hướng nhìn)
  const bx = cx - dirX * 5;
  const by = cy - dirY * 5;
  if (dirX === 0) rect(g, darken(color, 0.25), bx - 5, by - 1 + (dirY > 0 ? -1 : 0), 10, 2);
  else rect(g, darken(color, 0.25), bx - 1 + (dirX > 0 ? -1 : 0), by - 5, 2, 10);
}

// ---------------------------------------------------------------------------------------------------------------
// Đồ đạc
// ---------------------------------------------------------------------------------------------------------------

/** Vẽ một món đồ (tĩnh) tại tâm (cx, cy) pixel. Phần hoạt hình (cá, đèn nhấp nháy...) vẽ riêng ở bộ vẽ chính. */
export function drawFurniture(g: G, o: Obstacle, cx: number, cy: number) {
  const w = Math.round(o.hw * 2 * U);
  const h = Math.round(o.hd * 2 * U);
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - h / 2);
  // hướng từ lưng ra mặt trước (vector đơn vị trên màn hình)
  const fx = Math.round(Math.sin(o.facing));
  const fy = Math.round(Math.cos(o.facing));
  const color = o.color !== undefined ? `#${o.color.toString(16).padStart(6, '0')}` : null;

  switch (o.kind) {
    case 'plant': {
      shadow(g, cx - 6, cy - 6, 13, 13, 2, 0.18);
      const greens = ['#3a9a5a', '#4caf68', '#6cc986'];
      [[0, 0, 6], [-4, -2, 4], [4, -3, 4], [-3, 4, 4], [4, 4, 4], [0, -5, 3]].forEach(([dx, dy, r], i) => disc(g, greens[i % 3], cx + dx, cy + dy, r));
      disc(g, '#8ee0a4', cx - 2, cy - 2, 2);
      disc(g, '#d9825b', cx, cy, 2);
      break;
    }
    case 'sofa':
    case 'armchair': {
      const c = color ?? '#4fa7a0';
      const arm = o.kind === 'sofa' ? 3 : 3;
      shadow(g, x, y, w, h, 2, 0.24);
      rect(g, darken(c, 0.35), x, y, w, h);
      rect(g, c, x + 1, y + 1, w - 2, h - 2);
      // lưng tựa: dải tối dày phía sau, tay vịn hai đầu
      if (fx === 0) {
        const backY = fy > 0 ? y : y + h - 5;
        rect(g, darken(c, 0.18), x + 1, backY + (fy > 0 ? 1 : 0), w - 2, 4);
        rect(g, darken(c, 0.12), x + 1, y + 1, arm, h - 2);
        rect(g, darken(c, 0.12), x + w - 1 - arm, y + 1, arm, h - 2);
        rect(g, lighten(c, 0.2), x + arm + 1, fy > 0 ? y + 6 : y + 1, w - 2 * arm - 2, h - 8);
        // đệm ngồi chia hai
        rect(g, darken(c, 0.15), x + w / 2, fy > 0 ? y + 6 : y + 1, 1, h - 8);
        disc(g, '#f2c14e', x + arm + 3, fy > 0 ? y + 7 : y + h - 8, 2);
        disc(g, '#e86f8f', x + w - arm - 4, fy > 0 ? y + 7 : y + h - 8, 2);
      } else {
        const backX = fx > 0 ? x : x + w - 5;
        rect(g, darken(c, 0.18), backX + (fx > 0 ? 1 : 0), y + 1, 4, h - 2);
        rect(g, darken(c, 0.12), x + 1, y + 1, w - 2, arm);
        rect(g, darken(c, 0.12), x + 1, y + h - 1 - arm, w - 2, arm);
        rect(g, lighten(c, 0.2), fx > 0 ? x + 6 : x + 1, y + arm + 1, w - 8, h - 2 * arm - 2);
        rect(g, darken(c, 0.15), fx > 0 ? x + 6 : x + 1, y + h / 2, w - 8, 1);
        disc(g, '#f2c14e', fx > 0 ? x + 7 : x + w - 8, y + arm + 3, 2);
        disc(g, '#e86f8f', fx > 0 ? x + 7 : x + w - 8, y + h - arm - 4, 2);
      }
      break;
    }
    case 'beanbag': {
      const c = color ?? '#f08a4b';
      shadow(g, cx - 7, cy - 6, 14, 13, 2, 0.2);
      disc(g, darken(c, 0.3), cx, cy, 7);
      disc(g, c, cx, cy, 6);
      disc(g, lighten(c, 0.3), cx - 2, cy - 2, 3);
      break;
    }
    case 'stool':
      shadow(g, cx - 4, cy - 4, 8, 8, 1, 0.2);
      disc(g, '#59607a', cx, cy, 4);
      disc(g, '#f2c14e', cx, cy, 3);
      break;
    case 'table': {
      if (Math.abs(o.hw - o.hd) < 0.01) {
        const r = Math.round(o.hw * U);
        shadow(g, cx - r, cy - r, r * 2, r * 2, 2, 0.22);
        disc(g, darken(WOOD, 0.3), cx, cy, r);
        disc(g, WOOD, cx, cy, r - 1);
        disc(g, lighten(WOOD, 0.3), cx - r / 3, cy - r / 3, Math.max(r / 3, 1));
        disc(g, '#ffffff', cx + r / 3, cy + 1, 2);
        disc(g, '#7a4b2a', cx + r / 3, cy + 1, 1);
      } else {
        block(g, WOOD, x, y, w, h);
        rect(g, '#ffffff', x + 3, y + 3, 5, 3);
        disc(g, '#ffffff', x + w - 5, y + h - 4, 2);
        rect(g, '#d6313f', x + w / 2, y + 2, 3, 2); // tạp chí
      }
      break;
    }
    case 'bigtable': {
      // bàn họp dài (trục dài theo z), ghế hai bên
      const tw = o.hw * 2 - 1.5;
      const tl = o.hd * 2 - 0.2;
      const tpx = Math.round(tw * U);
      const lpx = Math.round(tl * U);
      const tx = Math.round(cx - tpx / 2);
      const ty = Math.round(cy - lpx / 2);
      const n = Math.max(Math.floor(tl / 0.95), 2);
      for (let i = 0; i < n; i += 1) {
        const yy = cy - lpx / 2 + 8 + (i * (lpx - 16)) / Math.max(n - 1, 1);
        for (const side of [-1, 1] as const) {
          const chairCol = CHAIRS[(i * (side > 0 ? 2 : 1) + (side > 0 ? 3 : 0)) % CHAIRS.length];
          chairTop(g, cx + side * (tpx / 2 + 6), yy, -side, 0, chairCol);
        }
      }
      shadow(g, tx, ty, tpx, lpx, 2, 0.26);
      rect(g, darken(WOOD, 0.35), tx, ty, tpx, lpx);
      rect(g, WOOD, tx + 1, ty + 1, tpx - 2, lpx - 2);
      rect(g, lighten(WOOD, 0.3), tx + 1, ty + 1, tpx - 2, 1);
      for (let i = 0; i < n; i += 1) {
        const yy = ty + 8 + (i * (lpx - 16)) / Math.max(n - 1, 1);
        if (i % 2 === 0) {
          rect(g, '#dfe5ee', tx + 2, yy - 2, 6, 4);
          rect(g, '#262b3b', tx + 3, yy - 1, 4, 2);
        } else {
          rect(g, '#fffdf5', tx + tpx - 9, yy - 2, 6, 4);
          disc(g, '#ffffff', tx + tpx - 4, yy, 1);
        }
      }
      break;
    }
    case 'readtable': {
      // bàn đọc sách dài (trục dài theo x), ghế hai bên
      const tl = o.hw * 2 - 0.2;
      const tw = o.hd * 2 - 0.9;
      const lpx = Math.round(tl * U);
      const tpx = Math.round(tw * U);
      const tx = Math.round(cx - lpx / 2);
      const ty = Math.round(cy - tpx / 2);
      const n = Math.max(Math.floor((o.hw * 2) / 1.0), 2);
      for (let i = 0; i < n; i += 1) {
        const xx = cx - lpx / 2 + 7 + (i * (lpx - 14)) / Math.max(n - 1, 1);
        chairTop(g, xx, ty - 5, 0, 1, CHAIRS[(i * 2) % CHAIRS.length]);
        chairTop(g, xx, ty + tpx + 5, 0, -1, CHAIRS[(i * 2 + 1) % CHAIRS.length]);
      }
      block(g, WOOD, tx, ty, lpx, tpx);
      for (let i = 0; i < n; i += 1) {
        const xx = tx + 7 + (i * (lpx - 14)) / Math.max(n - 1, 1);
        rect(g, BOOKS[i % BOOKS.length], xx - 3, ty + 3 + (i % 2) * 2, 6, 4);
        rect(g, '#fffdf5', xx - 2, ty + 4 + (i % 2) * 2, 4, 2);
      }
      rect(g, '#fef3c7', cx - 1, cy - 1, 3, 3);
      break;
    }
    case 'bookcase': {
      block(g, '#9c7048', x, y, w, h);
      // gáy sách (dọc theo chiều dài của kệ)
      const along = w >= h;
      const len = along ? w : h;
      for (let i = 2; i < len - 2; i += 2) {
        const c = BOOKS[(i / 2 + o.id.length) % BOOKS.length];
        if ((i / 2) % 7 === 6) continue;
        if (along) rect(g, c, x + i, y + 1, 1, h - 2);
        else rect(g, c, x + 1, y + i, w - 2, 1);
      }
      break;
    }
    case 'cabinet': {
      block(g, '#bdc6d4', x, y, w, h);
      const along = w >= h;
      const len = along ? w : h;
      for (let i = 15; i < len; i += 15) {
        if (along) rect(g, '#8f9aab', x + i, y + 1, 1, h - 2);
        else rect(g, '#8f9aab', x + 1, y + i, w - 2, 1);
      }
      for (let i = 7; i < len; i += 15) {
        if (along) rect(g, '#eef2f7', x + i, y + (fy > 0 ? h - 3 : 2), 3, 1);
        else rect(g, '#eef2f7', x + (fx > 0 ? w - 3 : 2), y + i, 1, 3);
      }
      break;
    }
    case 'counter': {
      block(g, '#eef1f6', x, y, w, h, '#8f9aab');
      rect(g, '#6b7385', x + 1, y + 1, w - 2, 2); // mặt đá ở mép sau
      if (o.id === 'pantry-counter') {
        rect(g, '#2b3040', x + 7, y + 3, 7, 6); // máy pha cà phê
        rect(g, '#d6313f', x + 9, y + 4, 3, 1);
        disc(g, '#ffffff', x + 17, y + 6, 2);
        disc(g, '#f0a44b', x + 21, y + 6, 2);
        rect(g, '#aab4c4', x + w - 14, y + 3, 9, 6); // bồn rửa
        rect(g, '#8f9aab', x + w - 13, y + 4, 7, 4);
        rect(g, '#f3eee8', x + w / 2 + 4, y + 3, 6, 5); // lò vi sóng
      } else {
        rect(g, '#aab4c4', x + 2, y + 3, w - 4, Math.max(h - 6, 2));
        rect(g, '#8f9aab', x + 3, y + 4, w - 6, Math.max(h - 8, 1));
      }
      break;
    }
    case 'cooler':
      shadow(g, cx - 6, cy - 6, 12, 12, 2, 0.2);
      rect(g, '#8f9aab', cx - 6, cy - 6, 12, 12);
      rect(g, '#dde5ee', cx - 5, cy - 5, 10, 10);
      disc(g, '#7ec8f2', cx, cy, 4);
      disc(g, '#b8e4fa', cx - 1, cy - 1, 2);
      break;
    case 'fridge':
      block(g, '#f4f6fa', x, y, w, h, '#8f9aab');
      rect(g, '#c7d0de', x + 2, y + (fy > 0 ? h - 5 : 3), w - 4, 1);
      rect(g, '#8a94a8', x + w - 5, y + 2, 1, 5);
      rect(g, '#ffb4c0', x + 3, y + 3, 3, 3);
      break;
    case 'reception': {
      block(g, '#f6f4f1', x, y, w, h, '#8f9aab');
      rect(g, '#6b7385', fx > 0 ? x + w - 4 : x + 1, y + 1, 3, h - 2);
      rect(g, '#262b3b', x + w / 2 - 3, y + h / 2 - 5, 3, 8); // màn hình
      rect(g, '#f5c542', fx > 0 ? x + 3 : x + w - 6, y + h / 2 + 5, 3, 3); // chuông
      disc(g, '#e86f8f', x + w / 2, y + 5, 2);
      break;
    }
    case 'rack': {
      shadow(g, x, y, w, h, 2, 0.24);
      const units = Math.max(Math.round(o.hw * 2 / 1.05), 1);
      const uw = Math.floor(w / units);
      for (let i = 0; i < units; i += 1) {
        const ux = x + i * uw;
        rect(g, '#1a1d28', ux, y, uw - 1, h);
        rect(g, '#353b4d', ux + 1, y + 1, uw - 3, h - 2);
        for (let k = 0; k < 4; k += 1) rect(g, '#20242f', ux + 2, y + 2 + k * 2, uw - 5, 1);
      }
      break;
    }
    case 'easel': {
      shadow(g, x, y, w, h, 2, 0.2);
      rect(g, '#8a94a8', x, y, w, h + 1);
      rect(g, '#fafbfd', x + 1, y + 1, w - 2, h - 1);
      rect(g, o.id === 'director-board' ? '#8c7ae6' : '#64748b', x + 1, y + 1, w - 2, 1);
      rect(g, '#a8b2c4', x + 4, y + 3, Math.round(w * 0.5), 1);
      break;
    }
    case 'stairs': {
      // bậc thang nhìn từ trên: các vạch ngang, tay vịn hai bên, mũi tên chỉ lên
      shadow(g, x, y, w, h, 2, 0.2);
      rect(g, '#8f8a9c', x, y, w, h);
      for (let i = 0; i < h; i += 5) {
        rect(g, i % 10 === 0 ? '#f2ece3' : '#e9e1d6', x + 2, y + i, w - 4, 4);
        rect(g, '#b8b0a8', x + 2, y + i + 4, w - 4, 1);
      }
      rect(g, '#6b5a78', x, y, 2, h);
      rect(g, '#6b5a78', x + w - 2, y, 2, h);
      // mũi tên lên
      rect(g, '#8c7ae6', cx, y + 8, 1, h - 14);
      rect(g, '#8c7ae6', cx - 2, y + 10, 5, 1);
      rect(g, '#8c7ae6', cx - 1, y + 9, 3, 1);
      break;
    }
    case 'stall': {
      shadow(g, x, y, w, h, 2, 0.18);
      rect(g, '#cfdae6', x, y, w, h);
      rect(g, '#eef3f8', x + 1, y + 1, w - 2, h - 2);
      ellipse(g, '#ffffff', cx, cy - 4, 5, 6); // bồn cầu
      ellipse(g, '#c7d0de', cx, cy - 4, 3, 4);
      rect(g, '#dfe7ee', cx - 4, y + 2, 8, 3);
      rect(g, '#8f9aab', x + 2, y + h - 2, w - 4, 1); // cửa buồng
      break;
    }
    case 'printer': {
      block(g, '#e9edf3', x, y, w, h, '#8f9aab');
      rect(g, '#a8b2c4', x + 2, y + 2, w - 4, h - 7);
      rect(g, '#59607a', x + 1, y + h - 4, w - 2, 2);
      rect(g, '#4cf08a', x + w - 4, y + h - 5, 2, 1);
      break;
    }
    case 'bin':
      shadow(g, cx - 3, cy - 3, 7, 7, 1, 0.2);
      disc(g, '#59607a', cx, cy, 3.5);
      disc(g, '#8a94a8', cx, cy, 2.5);
      disc(g, '#3a4256', cx, cy, 1);
      break;
    case 'foosball': {
      block(g, '#d6455a', x, y, w, h);
      rect(g, '#3fae6a', x + 3, y + 3, w - 6, h - 6);
      rect(g, '#ffffff', x + w / 2, y + 3, 1, h - 6);
      for (let i = 0; i < 4; i += 1) {
        const xx = x + 6 + (i * (w - 12)) / 3;
        rect(g, '#c7d0de', xx, y, 1, h);
        rect(g, i % 2 ? '#5b9bd5' : '#f2c14e', xx - 1, y + h / 2 - 3, 3, 2);
        rect(g, i % 2 ? '#5b9bd5' : '#f2c14e', xx - 1, y + h / 2 + 1, 3, 2);
      }
      disc(g, '#ffffff', x + w / 2 + 3, y + h / 2, 1);
      break;
    }
    case 'aquarium': {
      block(g, '#eef1f6', x, y, w, h, '#8f9aab');
      rect(g, '#7ad1e8', x + 2, y + 2, w - 4, h - 4);
      rect(g, '#a8e4f2', x + 2, y + 2, w - 4, 1);
      rect(g, '#dcc6a0', x + 2, y + h - 4, w - 4, 2);
      break;
    }
    case 'hedge': {
      shadow(g, x, y, w, h, 2, 0.2);
      rect(g, '#d9825b', x, y, w, h);
      const greens = ['#4caf68', '#3a9a5a', '#6cc986'];
      const n = Math.max(Math.round(Math.max(w, h) / 9), 1);
      for (let i = 0; i < n; i += 1) {
        const t = (i + 0.5) / n;
        if (w >= h) disc(g, greens[i % 3], x + t * w, cy, Math.max(h / 2, 4));
        else disc(g, greens[i % 3], cx, y + t * h, Math.max(w / 2, 4));
      }
      break;
    }
    case 'lamp':
      disc(g, 'rgba(255,230,160,0.35)', cx, cy, 8);
      disc(g, '#59607a', cx, cy, 2);
      disc(g, '#fff1c9', cx, cy, 3);
      break;
    default:
      block(g, '#cbd2de', x, y, w, h);
  }
}

/** Đồ trang trí treo tường hoặc dẹt trên sàn (vẽ tại tâm (cx, cy) pixel). Đồng hồ và màn hình có phần động vẽ ở bộ vẽ chính. */
export function drawDecor(g: G, d: Decor, cx: number, cy: number) {
  const hex = `#${d.color.toString(16).padStart(6, '0')}`;
  const alongX = Math.abs(Math.cos(d.facing)) > 0.5; // tường nằm ngang trên mặt bằng
  const len = Math.round(d.w * U);
  if (d.kind === 'frame') {
    if (alongX) {
      rect(g, '#f4efe8', cx - len / 2, cy - 1, len, 3);
      rect(g, hex, cx - len / 2 + 1, cy, len - 2, 1);
    } else {
      rect(g, '#f4efe8', cx - 1, cy - len / 2, 3, len);
      rect(g, hex, cx, cy - len / 2 + 1, 1, len - 2);
    }
  } else if (d.kind === 'tv') {
    if (alongX) {
      rect(g, '#20242f', cx - len / 2, cy - 1, len, 3);
      rect(g, '#6fb7e8', cx - len / 2 + 2, cy, len - 4, 1);
    } else {
      rect(g, '#20242f', cx - 1, cy - len / 2, 3, len);
      rect(g, '#6fb7e8', cx, cy - len / 2 + 2, 1, len - 4);
    }
  } else if (d.kind === 'board') {
    if (alongX) {
      rect(g, '#8a94a8', cx - len / 2, cy - 1, len, 3);
      rect(g, '#fafbfd', cx - len / 2 + 1, cy, len - 2, 1);
    } else {
      rect(g, '#8a94a8', cx - 1, cy - len / 2, 3, len);
      rect(g, '#fafbfd', cx, cy - len / 2 + 1, 1, len - 2);
    }
  } else if (d.kind === 'mat') {
    const mw = Math.round(d.w * U);
    const mh = Math.round(d.h * U);
    rect(g, darken(hex, 0.2), cx - mw / 2, cy - mh / 2, mw, mh);
    rect(g, hex, cx - mw / 2 + 1, cy - mh / 2 + 1, mw - 2, mh - 2);
    rect(g, lighten(hex, 0.25), cx - mw / 2 + 3, cy - mh / 2 + 3, mw - 6, 1);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Nhân vật nhìn từ trên
// ---------------------------------------------------------------------------------------------------------------

export type Arms = 'down' | 'forward' | 'typeA' | 'typeB' | 'upR' | 'upBoth' | 'cup' | 'head' | 'book' | 'talkA' | 'talkB';

export interface PersonDraw {
  look: Look;
  /** Hướng nhìn (radian): 0 là xuống màn hình, π/2 sang phải. */
  heading: number;
  arms: Arms;
  walking: boolean;
  seated: boolean;
  /** Pha bước chân (giây). */
  t: number;
}

/**
 * Nhân vật nhìn từ trên: vai (viên thuốc màu áo), đầu có tóc ở phía sau và mặt ở phía trước, hai tay và (khi đi) hai bàn chân
 * thay nhau. Hướng được làm tròn theo bội của 45° để biên pixel vẫn cứng. (cx, cy) là tâm người.
 */
export function drawPerson(g: G, p: PersonDraw, cx: number, cy: number) {
  const snap = Math.round(p.heading / (Math.PI / 4)) * (Math.PI / 4);
  const fx = Math.sin(snap);
  const fy = Math.cos(snap);
  const lx = fy; // vector ngang (sang tay phải của người nhìn từ trên xuống)
  const ly = -fx;
  const at = (u: number, v: number): [number, number] => [cx + lx * u + fx * v, cy + ly * u + fy * v];
  const { look } = p;
  const shirt = look.shirt;
  const swing = p.walking ? Math.sin(p.t * 9) : 0;

  // chân (chỉ hiện khi đi): hai mũi giày thò ra phía trước/sau thay nhau
  if (p.walking) {
    for (const s of [-1, 1]) {
      const [x, y] = at(s * 2, swing * s * 3.2);
      disc(g, darken(look.pants, 0.2), x, y, 1.6);
    }
  }
  // bóng và vai
  if (!p.seated) ellipse(g, 'rgba(30,20,50,0.25)', cx + 1, cy + 2, 6, 3);
  for (const u of [-3.5, -1.5, 0.5, 2.5, 3.5]) {
    const [x, y] = at(u, 0);
    disc(g, darken(shirt, 0.35), x, y, 3.2);
  }
  for (const u of [-3, -1, 1, 3]) {
    const [x, y] = at(u, 0);
    disc(g, shirt, x, y, 2.7);
  }
  const [hx, hy] = at(-1.5, -0.5);
  disc(g, lighten(shirt, 0.25), hx, hy, 1.4);
  // tay
  const hand = (u: number, v: number, c = look.skin) => {
    const [x, y] = at(u, v);
    disc(g, darken(shirt, 0.3), ...at(u * 0.8, v * 0.5), 1.6);
    disc(g, c, x, y, 1.4);
  };
  const flip = Math.floor(p.t * 7) % 2 === 0;
  switch (p.arms) {
    case 'typeA': hand(-2.6, 4.2); hand(2.6, 5.2); break;
    case 'typeB': hand(-2.6, 5.2); hand(2.6, 4.2); break;
    case 'forward': hand(-2.6, 4.4); hand(2.6, 4.4); break;
    case 'cup': {
      hand(-4.6, 1.5);
      hand(2.4, 4.4);
      const [x, y] = at(2.4, 5.6);
      disc(g, '#ffffff', x, y, 1.6);
      disc(g, '#7a4b2a', x, y, 0.9);
      break;
    }
    case 'book': {
      hand(-2.5, 4.2);
      hand(2.5, 4.2);
      const [x, y] = at(0, 5);
      rect(g, '#4a86d9', x - 3, y - 2, 6, 4);
      rect(g, '#fffdf5', x - 2, y - 1, 4, 2);
      break;
    }
    case 'upR': hand(-4.4, 1.2); hand(5.6, flip ? 2.5 : 0.5, look.skin); break;
    case 'upBoth': hand(-6.2, flip ? 1.5 : -0.5); hand(6.2, flip ? 1.5 : -0.5); break;
    case 'head': hand(-4.4, 1); hand(1.5, flip ? -0.5 : 0.5); break;
    case 'talkA': hand(-4.2, 2.2); hand(4.4, 3.8); break;
    case 'talkB': hand(-4.4, 3.6); hand(4.2, 1.8); break;
    default: {
      // tay buông (đi bộ thì vung ngược chiều với chân)
      hand(-4.8, -swing * 2.4);
      hand(4.8, swing * 2.4);
    }
  }
  // đầu: tóc phía sau, mặt phía trước; mũ miện của Trưởng nhóm
  const [bx, by] = at(0, -0.4);
  disc(g, darken(look.hair, 0.15), bx, by, 3.7);
  disc(g, look.hair, ...at(0, -0.8), 3.3);
  const [fxp, fyp] = at(0, 1.1);
  disc(g, look.skin, fxp, fyp, 2.6);
  if (look.glasses) {
    const [ax, ay] = at(-1.4, 1.9);
    const [bx2, by2] = at(1.4, 1.9);
    disc(g, '#2a2540', ax, ay, 0.8);
    disc(g, '#2a2540', bx2, by2, 0.8);
  }
  if (look.crown) {
    const [kx, ky] = at(0, -0.6);
    rect(g, '#2a2540', kx - 2, ky - 1, 5, 4);
    rect(g, '#facc15', kx - 1, ky, 3, 2);
    rect(g, '#facc15', kx - 2, ky - 1, 1, 1);
    rect(g, '#facc15', kx, ky - 1, 1, 1);
    rect(g, '#facc15', kx + 2, ky - 1, 1, 1);
  }
  if (look.tie) {
    const [tx, ty] = at(0, 2.6);
    rect(g, '#d6313f', tx, ty, 1, 1);
  }
}
