import * as THREE from 'three';
import type { Obstacle } from './layout';
import { mixColor, type Kit } from './kit';

/** Đồ đạc 3D phong cách bo tròn, màu pastel ấm. Đơn vị mét. Mặt trước của mô hình quay về +z; `facing` xoay quanh trục y. */

export const LAMP_IDLE = 0x9aa5b8;
export const PILE_MAX = 6;

const WOOD = 0xe0b886;
const WHITE = 0xf3eee8;
const CHAIRS = [0xf08a4b, 0x4fa7a0, 0xe86f8f, 0x8c7ae6, 0xf2c14e, 0x5b9bd5];

export interface DeskSet {
  group: THREE.Group;
  /** Thanh đèn trạng thái trên màn hình: đổi màu theo tình trạng của người ngồi. */
  lamp: THREE.Mesh;
  pile: THREE.Mesh[];
  screen: THREE.Mesh;
}

/** Bộ bàn làm việc đầy đủ, gốc tại chỗ ngồi, nhìn về +z: bàn, màn hình, bàn phím, cốc, giấy, cây nhỏ và ghế xoay. */
export function deskSet(kit: Kit, colorIndex: number, occupied: boolean): DeskSet {
  const { rbox, cylinder, track, mat } = kit;
  const g = new THREE.Group();
  const z = 1.15;
  // bàn: mặt gỗ dày, hai tấm hông trắng và hộc kéo
  rbox(g, 2.2, 0.06, 1.1, WOOD, 0, 0.75, z, 0.025);
  for (const dx of [-1.04, 1.04]) rbox(g, 0.05, 0.72, 1.0, WHITE, dx, 0.37, z, 0.02);
  rbox(g, 2.0, 0.5, 0.04, 0xe9e3dc, 0, 0.45, z + 0.46, 0.015);
  rbox(g, 0.5, 0.52, 0.9, WHITE, 0.74, 0.46, z, 0.025);
  rbox(g, 0.18, 0.02, 0.02, 0xb8b0a8, 0.74, 0.58, z - 0.46, 0.008);
  rbox(g, 0.18, 0.02, 0.02, 0xb8b0a8, 0.74, 0.36, z - 0.46, 0.008);
  // màn hình
  rbox(g, 0.13, 0.2, 0.08, 0x59607a, 0, 0.88, z + 0.1, 0.03);
  rbox(g, 0.34, 0.025, 0.22, 0x59607a, 0, 0.785, z + 0.1, 0.01);
  rbox(g, 0.78, 0.48, 0.045, 0x262b3b, 0, 1.13, z + 0.1, 0.02);
  const screenMat = track(new THREE.MeshStandardMaterial({ color: 0x1a2030, emissive: occupied ? 0x6fb7e8 : 0x0b0e18, emissiveIntensity: occupied ? 0.55 : 0.15, roughness: 0.3 }));
  const screen = new THREE.Mesh(track(new THREE.PlaneGeometry(0.72, 0.42)), screenMat);
  screen.position.set(0, 1.13, z + 0.1 - 0.025);
  screen.rotation.y = Math.PI;
  g.add(screen);
  // thanh đèn trạng thái trên đỉnh màn hình
  const lampMat = track(new THREE.MeshStandardMaterial({ color: LAMP_IDLE, emissive: LAMP_IDLE, emissiveIntensity: 0.9, roughness: 0.4 }));
  const lamp = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.018, 0.4, 3, 8)), lampMat);
  lamp.rotation.z = Math.PI / 2;
  lamp.position.set(0, 1.4, z + 0.1);
  g.add(lamp);
  // bàn phím, chuột, cốc, giấy tờ, cây mini
  rbox(g, 0.52, 0.025, 0.17, 0xf4f6fa, 0, 0.793, z - 0.22, 0.01);
  rbox(g, 0.07, 0.025, 0.11, 0xf4f6fa, 0.42, 0.793, z - 0.2, 0.012);
  const mug = cylinder(g, 0.05, 0.1, 0xffffff, -0.78, 0.83, z - 0.1, 14);
  mug.castShadow = true;
  cylinder(g, 0.042, 0.012, 0x7a4b2a, -0.78, 0.878, z - 0.1, 14);
  const pile: THREE.Mesh[] = [];
  for (let i = 0; i < PILE_MAX; i += 1) {
    const sheet = rbox(g, 0.34, 0.018, 0.25, i % 2 ? 0xe9edf3 : 0xfffdf5, -0.62 + (i % 2) * 0.01, 0.79 + i * 0.019, z + 0.28, 0.006);
    sheet.rotation.y = ((i * 37) % 11 - 5) * 0.02;
    sheet.visible = false;
    pile.push(sheet);
  }
  const pot = cylinder(g, 0.06, 0.09, 0xd9825b, 0.9, 0.83, z + 0.26, 12);
  pot.castShadow = true;
  const leaf = new THREE.Mesh(track(new THREE.SphereGeometry(0.085, 10, 8)), mat(0x58b86f));
  leaf.position.set(0.9, 0.93, z + 0.26);
  leaf.castShadow = true;
  g.add(leaf);
  // chi tiết đời thường: giấy nhớ dán bên viền màn hình, khung ảnh nhỏ, tai nghe (mỗi bàn một vẻ riêng theo màu team)
  const notes = [0xfde047, 0xf9a8d4, 0x86efac, 0x93c5fd];
  for (let i = 0; i < 2; i += 1) {
    const n = rbox(g, 0.1, 0.1, 0.012, notes[(colorIndex + i * 2) % notes.length], -0.34 + i * 0.1, 1.28 - i * 0.1, z + 0.075, 0.004);
    n.rotation.z = (i ? -0.12 : 0.1);
  }
  if (colorIndex % 2 === 0) {
    const frame = rbox(g, 0.14, 0.11, 0.02, 0xf4efe8, 0.62, 0.83, z + 0.34, 0.006);
    frame.rotation.y = -0.3;
    rbox(g, 0.1, 0.075, 0.022, CHAIRS[colorIndex % CHAIRS.length], 0.62, 0.83, z + 0.34, 0.004).rotation.y = -0.3;
  } else {
    const band = new THREE.Mesh(track(new THREE.TorusGeometry(0.075, 0.012, 6, 14, Math.PI)), mat(0x2f3345));
    band.position.set(-0.45, 0.88, z + 0.3);
    g.add(band);
    for (const dx of [-0.525, -0.375]) rbox(g, 0.03, 0.05, 0.04, 0x2f3345, dx, 0.81, z + 0.3, 0.012);
  }

  // ghế xoay
  const chair = CHAIRS[colorIndex % CHAIRS.length];
  rbox(g, 0.52, 0.09, 0.5, chair, 0, 0.48, -0.05, 0.04);
  const back = rbox(g, 0.5, 0.5, 0.07, chair, 0, 0.8, -0.34, 0.035);
  back.rotation.x = 0.08;
  cylinder(g, 0.035, 0.28, 0x59607a, 0, 0.3, -0.05, 10);
  cylinder(g, 0.27, 0.035, 0x59607a, 0, 0.1, -0.05, 5);
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    const wheel = new THREE.Mesh(track(new THREE.SphereGeometry(0.035, 8, 6)), mat(0x2f3345));
    wheel.position.set(Math.sin(a) * 0.26, 0.04, -0.05 + Math.cos(a) * 0.26);
    g.add(wheel);
  }
  return { group: g, lamp, pile, screen };
}

function bean(kit: Kit, parent: THREE.Object3D, x: number, z: number, color: number, r = 0.42) {
  const m = new THREE.Mesh(kit.track(new THREE.SphereGeometry(r, 18, 14)), kit.mat(color));
  m.scale.set(1, 0.7, 1);
  m.position.set(x, r * 0.72, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
}

/** Ghế họp nhỏ quay mặt về phía bàn (nằm ở +x hoặc -x của bàn). */
function meetingChair(kit: Kit, parent: THREE.Object3D, x: number, z: number, side: 1 | -1, color: number) {
  const { rbox, cylinder } = kit;
  rbox(parent, 0.46, 0.08, 0.46, color, x, 0.46, z, 0.03);
  rbox(parent, 0.07, 0.42, 0.44, color, x + side * 0.22, 0.72, z, 0.03);
  cylinder(parent, 0.03, 0.4, 0x59607a, x, 0.22, z, 8);
}

export interface Furniture {
  group: THREE.Group;
  /** Hàm cập nhật mỗi khung hình (cá bơi, đèn nhấp nháy...). */
  animate?: (t: number) => void;
  /** Mặt kính của màn hình (TV): bật sáng khi đang họp. */
  screens?: THREE.MeshStandardMaterial[];
}

/** Đồ đạc theo loại (khớp với `layout.furniture`). */
export function furniture3d(kit: Kit, parent: THREE.Object3D, o: Obstacle): Furniture {
  const { rbox, cylinder, track, mat } = kit;
  const g = new THREE.Group();
  g.position.set(o.x, 0.06, o.z);
  g.rotation.y = o.facing;
  parent.add(g);
  const out: Furniture = { group: g };
  // Kích thước theo trục của mô hình (chưa xoay): quay một phần tư vòng thì hoán đổi rộng và sâu.
  const sideways = Math.abs(Math.sin(o.facing)) > 0.9;
  const hw = sideways ? o.hd : o.hw;
  const hd = sideways ? o.hw : o.hd;

  if (o.kind === 'desk') {
    // Bàn trống (hoặc bàn Chủ): gốc mô hình ở chỗ ngồi, cách bàn 1,15 m.
    g.position.set(o.x, 0.06, o.z - 1.15 * Math.cos(o.facing));
    const set = deskSet(kit, o.id.startsWith('desk-owner') ? 5 : 3, o.id.startsWith('desk-owner'));
    g.add(set.group);
    return out;
  }
  if (o.kind === 'plant') {
    rbox(g, 0.5, 0.4, 0.5, 0xe07a52, 0, 0.2, 0, 0.12);
    rbox(g, 0.44, 0.04, 0.44, 0x4a3426, 0, 0.4, 0, 0.02);
    const greens = [0x4caf68, 0x3a9a5a, 0x6cc986];
    const leaves: [number, number, number, number][] = [[0, 0.82, 0, 0.36], [0.18, 1.08, 0.04, 0.27], [-0.16, 1.2, -0.05, 0.22], [0.05, 0.62, 0.2, 0.2], [-0.2, 0.7, -0.12, 0.2]];
    leaves.forEach(([x, y, zz, r], i) => {
      const m = new THREE.Mesh(track(new THREE.SphereGeometry(r, 16, 12)), mat(greens[i % 3]));
      m.position.set(x, y, zz);
      m.castShadow = true;
      g.add(m);
    });
    return out;
  }
  if (o.kind === 'sofa') {
    const c = o.color ?? 0x4fa7a0;
    const w = hw * 2;
    rbox(g, w, 0.38, hd * 1.9, c, 0, 0.23, 0, 0.1);
    rbox(g, w, 0.62, 0.26, mixColor(c, 0x000000, 0.1), 0, 0.62, -hd * 0.76, 0.1);
    for (const dx of [-(hw - 0.08), hw - 0.08]) rbox(g, 0.2, 0.56, hd * 1.9, mixColor(c, 0x000000, 0.08), dx, 0.46, 0, 0.09);
    rbox(g, w * 0.4, 0.18, 0.7, mixColor(c, 0xffffff, 0.18), -w * 0.21, 0.5, 0.06, 0.07);
    rbox(g, w * 0.4, 0.18, 0.7, mixColor(c, 0xffffff, 0.18), w * 0.21, 0.5, 0.06, 0.07);
    rbox(g, 0.4, 0.4, 0.12, 0xf2c14e, -w * 0.32, 0.7, -hd * 0.36, 0.06).rotation.z = 0.15;
    rbox(g, 0.4, 0.4, 0.12, 0xe86f8f, w * 0.32, 0.7, -hd * 0.36, 0.06).rotation.z = -0.15;
    return out;
  }
  if (o.kind === 'armchair') {
    const c = o.color ?? 0xf08a4b;
    rbox(g, 0.84, 0.3, 0.8, c, 0, 0.24, 0, 0.1);
    rbox(g, 0.84, 0.6, 0.2, mixColor(c, 0x000000, 0.1), 0, 0.6, -0.32, 0.09);
    for (const dx of [-0.38, 0.38]) rbox(g, 0.14, 0.5, 0.8, mixColor(c, 0x000000, 0.06), dx, 0.42, 0, 0.07);
    return out;
  }
  if (o.kind === 'beanbag') {
    bean(kit, g, 0, 0, o.color ?? 0xf08a4b, Math.max(hw, 0.38));
    return out;
  }
  if (o.kind === 'stool') {
    cylinder(g, 0.2, 0.06, 0xf2c14e, 0, 0.62, 0, 16);
    cylinder(g, 0.03, 0.6, 0x59607a, 0, 0.31, 0, 8);
    cylinder(g, 0.18, 0.03, 0x59607a, 0, 0.02, 0, 12);
    return out;
  }
  if (o.kind === 'table') {
    if (Math.abs(hw - hd) < 0.01) {
      const top = cylinder(g, hw, 0.06, WOOD, 0, 0.72, 0, 28);
      top.castShadow = true;
      cylinder(g, 0.06, 0.7, 0xf3eee8, 0, 0.36, 0, 12);
      cylinder(g, Math.min(0.28, hw * 0.6), 0.04, 0xf3eee8, 0, 0.02, 0, 20);
      cylinder(g, 0.06, 0.1, 0xffffff, 0.12, 0.8, 0.05, 12);
    } else {
      rbox(g, hw * 2, 0.07, hd * 2, WOOD, 0, 0.42, 0, 0.03);
      for (const dx of [-hw + 0.08, hw - 0.08]) rbox(g, 0.06, 0.4, hd * 2 - 0.1, WHITE, dx, 0.2, 0, 0.02);
      rbox(g, 0.3, 0.012, 0.22, 0xffffff, -hw * 0.3, 0.465, 0.02, 0.005);
      cylinder(g, 0.04, 0.09, 0xffffff, hw * 0.4, 0.51, 0.05, 12);
    }
    return out;
  }
  if (o.kind === 'bigtable') {
    // Bàn họp dài: mặt gỗ, chân trắng, ghế hai bên, đồ họp (laptop, cốc, giấy).
    const tw = hw - 0.75;
    const tl = hd - 0.1;
    rbox(g, tw * 2, 0.07, tl * 2, WOOD, 0, 0.74, 0, 0.04);
    for (const dz of [-tl + 0.4, tl - 0.4]) rbox(g, tw * 2 - 0.3, 0.7, 0.08, WHITE, 0, 0.36, dz, 0.03);
    const n = Math.max(Math.floor((tl * 2) / 0.95), 2);
    for (let i = 0; i < n; i += 1) {
      const zz = (i - (n - 1) / 2) * ((tl * 2 - 0.5) / Math.max(n - 1, 1));
      meetingChair(kit, g, -(tw + 0.38), zz, 1, CHAIRS[i % CHAIRS.length]);
      meetingChair(kit, g, tw + 0.38, zz, -1, CHAIRS[(i + 3) % CHAIRS.length]);
      if (i % 2 === 0) {
        rbox(g, 0.3, 0.015, 0.22, 0xdfe5ee, -tw * 0.55, 0.785, zz, 0.006);
        rbox(g, 0.28, 0.2, 0.012, 0x262b3b, -tw * 0.55, 0.88, zz - 0.1, 0.005).rotation.x = -0.25;
      } else {
        rbox(g, 0.28, 0.012, 0.2, 0xfffdf5, tw * 0.5, 0.782, zz, 0.004);
        cylinder(g, 0.04, 0.09, 0xffffff, tw * 0.2, 0.83, zz, 12);
      }
    }
    return out;
  }
  if (o.kind === 'readtable') {
    // Bàn đọc sách dài trong thư viện: ghế hai bên, vài quyển sách mở.
    const tw = hd - 0.45;
    rbox(g, hw * 2 - 0.2, 0.07, tw * 2, WOOD, 0, 0.74, 0, 0.03);
    for (const dx of [-hw + 0.3, hw - 0.3]) rbox(g, 0.07, 0.72, tw * 2 - 0.1, WHITE, dx, 0.36, 0, 0.025);
    const n = Math.max(Math.floor((hw * 2) / 1.0), 2);
    for (let i = 0; i < n; i += 1) {
      const xx = (i - (n - 1) / 2) * ((hw * 2 - 0.8) / Math.max(n - 1, 1));
      const c = CHAIRS[(i * 2) % CHAIRS.length];
      for (const side of [-1, 1]) {
        rbox(g, 0.42, 0.07, 0.42, c, xx, 0.45, side * (tw + 0.3), 0.03);
        rbox(g, 0.42, 0.4, 0.06, c, xx, 0.68, side * (tw + 0.52), 0.03);
        cylinder(g, 0.03, 0.4, 0x59607a, xx, 0.22, side * (tw + 0.3), 8);
      }
      const book = rbox(g, 0.3, 0.025, 0.22, [0xe0525f, 0x4a86d9, 0x4cbf86][i % 3], xx, 0.795, (i % 2 ? 0.1 : -0.1), 0.008);
      book.rotation.y = (i % 3 - 1) * 0.2;
    }
    rbox(g, 0.18, 0.28, 0.18, 0xfef3c7, 0, 0.9, 0, 0.04); // đèn bàn nhỏ
    return out;
  }
  if (o.kind === 'counter') {
    const w = hw * 2;
    rbox(g, w, 0.88, 0.8, 0xeef1f6, 0, 0.44, 0, 0.04);
    rbox(g, w + 0.08, 0.06, 0.9, 0x6b7385, 0, 0.91, 0, 0.025);
    for (let x = -hw + 0.45; x < hw - 0.3; x += 0.9) rbox(g, 0.8, 0.62, 0.03, 0xd3d9e4, x, 0.42, 0.41, 0.01);
    if (o.id === 'pantry-counter') {
      // máy pha cà phê, cốc, hộp trà
      rbox(g, 0.42, 0.44, 0.34, 0x2b3040, -hw * 0.5, 1.17, -0.12, 0.05);
      rbox(g, 0.3, 0.05, 0.26, 0xd6313f, -hw * 0.5, 1.42, -0.12, 0.02);
      cylinder(g, 0.045, 0.1, 0xffffff, -hw * 0.5 + 0.5, 0.99, 0.1, 12);
      cylinder(g, 0.045, 0.1, 0xf0a44b, -hw * 0.5 + 0.7, 0.99, 0.1, 12);
      rbox(g, 0.5, 0.03, 0.4, 0xaab4c4, hw / 2, 0.95, 0, 0.012); // bồn rửa
      rbox(g, 0.3, 0.18, 0.22, 0xf3eee8, hw * 0.1, 1.04, -0.15, 0.03); // lò vi sóng
    } else {
      rbox(g, 0.5, 0.03, 0.4, 0xaab4c4, 0, 0.95, 0, 0.012);
      cylinder(g, 0.02, 0.18, 0x8a94a8, 0, 1.03, -0.12, 8);
    }
    return out;
  }
  if (o.kind === 'cooler') {
    rbox(g, 0.42, 0.9, 0.4, 0xdde5ee, 0, 0.45, 0, 0.06);
    const bottle = new THREE.Mesh(track(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 16)), track(new THREE.MeshStandardMaterial({ color: 0x8fd6ff, transparent: true, opacity: 0.75, roughness: 0.2 })));
    bottle.position.set(0, 1.12, 0);
    bottle.castShadow = true;
    g.add(bottle);
    return out;
  }
  if (o.kind === 'fridge') {
    rbox(g, 0.9, 1.8, 0.8, 0xf4f6fa, 0, 0.9, 0, 0.07);
    rbox(g, 0.86, 0.02, 0.02, 0xc7d0de, 0, 1.18, 0.41, 0.005);
    rbox(g, 0.04, 0.5, 0.04, 0x8a94a8, 0.32, 1.45, 0.42, 0.015);
    rbox(g, 0.04, 0.4, 0.04, 0x8a94a8, 0.32, 0.8, 0.42, 0.015);
    rbox(g, 0.14, 0.14, 0.01, 0xffb4c0, -0.2, 1.5, 0.41, 0.005);
    rbox(g, 0.12, 0.16, 0.01, 0x93c5fd, -0.02, 1.42, 0.41, 0.005);
    return out;
  }
  if (o.kind === 'reception') {
    const w = hw * 2;
    rbox(g, w, 1.05, 0.9, 0xf6f4f1, 0, 0.52, 0, 0.1);
    rbox(g, w + 0.1, 0.07, 1.0, 0x6b7385, 0, 1.08, 0.02, 0.03);
    rbox(g, 0.62, 0.4, 0.04, 0x262b3b, -w * 0.15, 1.35, -0.1, 0.02);
    rbox(g, 0.3, 0.03, 0.2, 0xf5c542, w * 0.2, 1.14, 0.1, 0.012);
    cylinder(g, 0.04, 0.12, 0xe86f8f, w * 0.38, 1.18, 0.1, 10); // lọ hoa nhỏ
    return out;
  }
  if (o.kind === 'rack') {
    const units = Math.max(Math.round((hw * 2) / 1.05), 1);
    const leds: THREE.Mesh[] = [];
    for (let i = 0; i < units; i += 1) {
      const x = (i - (units - 1) / 2) * 1.05;
      rbox(g, 0.95, 2.3, 1.1, 0x353b4d, x, 1.15, 0, 0.05);
      for (let k = 0; k < 8; k += 1) {
        rbox(g, 0.78, 0.1, 0.02, 0x20242f, x, 0.35 + k * 0.26, 0.56, 0.01);
        const led = new THREE.Mesh(track(new THREE.SphereGeometry(0.02, 6, 6)), track(new THREE.MeshBasicMaterial({ color: k % 3 === 0 ? 0xffb347 : 0x4cf08a })));
        led.position.set(x + 0.32, 0.35 + k * 0.26, 0.57);
        g.add(led);
        leds.push(led);
      }
    }
    out.animate = (t) => leds.forEach((led, i) => {
      led.visible = Math.sin(t * (2 + (i % 5) * 0.7) + i) > -0.55; // đèn tủ máy nhấp nháy
    });
    return out;
  }
  if (o.kind === 'easel') {
    const color = o.id === 'director-board' ? 0x8c7ae6 : 0x64748b;
    const w = hw * 2;
    for (const dx of [-(w / 2 - 0.1), w / 2 - 0.1]) rbox(g, 0.05, 1.6, 0.05, 0x8a94a8, dx, 0.8, 0, 0.02);
    rbox(g, w - 0.1, 1.05, 0.05, 0xfafbfd, 0, 1.45, 0.04, 0.02);
    rbox(g, w - 0.04, 0.08, 0.07, color, 0, 2.0, 0.04, 0.03);
    rbox(g, 1.0, 0.025, 0.01, 0xa8b2c4, -0.2, 1.65, 0.08, 0.005);
    rbox(g, 0.7, 0.025, 0.01, 0xa8b2c4, -0.35, 1.45, 0.08, 0.005);
    return out;
  }
  if (o.kind === 'bookcase') {
    const w = hw * 2;
    rbox(g, w, 2.2, 0.36, 0x9c7048, 0, 1.1, 0, 0.04);
    for (const level of [0.45, 0.95, 1.45, 1.95]) rbox(g, w - 0.06, 0.03, 0.34, 0x84603c, 0, level - 0.25, 0.01, 0.01);
    const books = [0xe0525f, 0x4a86d9, 0x4cbf86, 0xf5a742, 0x9b6df0, 0x2cb5a6];
    const n = Math.max(Math.floor(w / 0.32), 1);
    for (let i = 0; i < n; i += 1) {
      const bx = (i - (n - 1) / 2) * 0.32;
      for (const [li, level] of [0.5, 1.0, 1.5, 2.0].entries()) {
        if ((i + li) % 5 === 4) continue; // chừa vài khe trống cho tự nhiên
        rbox(g, 0.26, 0.4 - (i % 3) * 0.03, 0.22, books[(i + li * 2) % books.length], bx, level - 0.04, 0.1, 0.03);
      }
    }
    return out;
  }
  if (o.kind === 'cabinet') {
    const units = Math.max(Math.round((hw * 2) / 0.95), 1);
    for (let i = 0; i < units; i += 1) {
      const cx = (i - (units - 1) / 2) * 0.95;
      rbox(g, 0.88, 1.8, 0.6, 0xbdc6d4, cx, 0.9, 0, 0.05);
      for (const y of [0.45, 0.9, 1.35]) {
        rbox(g, 0.76, 0.36, 0.03, 0xa4afc0, cx, y, 0.31, 0.015);
        rbox(g, 0.22, 0.04, 0.04, 0xeef2f7, cx, y, 0.34, 0.015);
      }
    }
    return out;
  }
  if (o.kind === 'stairs') {
    // Cầu thang một vế đi lên về phía -z (phía sau tòa nhà), có tay vịn.
    const steps = 9;
    const run = (hd * 2 - 0.5) / steps;
    for (let i = 0; i < steps; i += 1) {
      const h = 0.21 * (i + 1);
      rbox(g, hw * 2 - 0.3, h, run + 0.02, i % 2 ? 0xe9e1d6 : 0xf2ece3, 0, h / 2, hd - 0.25 - (i + 0.5) * run, 0.02);
    }
    for (const dx of [-(hw - 0.08), hw - 0.08]) {
      rbox(g, 0.06, 0.08, hd * 2 - 0.4, 0x6b5a78, dx, 1.2, 0, 0.02);
      for (let i = 0; i <= steps; i += 3) rbox(g, 0.05, 0.9, 0.05, 0x6b5a78, dx, 0.21 * (i + 1) * 0.5 + 0.5, hd - 0.25 - i * run, 0.015);
    }
    return out;
  }
  if (o.kind === 'stall') {
    // Buồng vệ sinh: ba tấm vách, cửa buồng, bồn cầu.
    const panel = 0xdfe7ee;
    for (const dx of [-hw, hw]) rbox(g, 0.05, 1.4, hd * 2, panel, dx, 0.9, 0, 0.015);
    rbox(g, hw * 2, 1.4, 0.05, panel, 0, 0.9, -hd, 0.015);
    rbox(g, hw * 2 - 0.2, 1.2, 0.04, 0xcfdae6, 0.1, 0.8, hd - 0.1, 0.012);
    rbox(g, 0.45, 0.4, 0.55, 0xfafbfd, 0, 0.2, -hd + 0.45, 0.12);
    rbox(g, 0.42, 0.34, 0.2, 0xfafbfd, 0, 0.55, -hd + 0.18, 0.06);
    return out;
  }
  if (o.kind === 'printer') {
    const w = hw * 2;
    rbox(g, w, 0.9, hd * 2, 0xe9edf3, 0, 0.45, 0, 0.05);
    rbox(g, w + 0.02, 0.06, hd * 2 + 0.02, 0x59607a, 0, 0.93, 0, 0.02);
    rbox(g, w * 0.7, 0.04, hd * 1.2, 0xa8b2c4, 0, 0.97, 0, 0.01); // nắp kính máy copy
    rbox(g, 0.22, 0.12, 0.02, 0x262b3b, w * 0.3, 0.7, hd, 0.005); // màn hình điều khiển
    const led = new THREE.Mesh(track(new THREE.SphereGeometry(0.02, 6, 6)), track(new THREE.MeshBasicMaterial({ color: 0x4cf08a })));
    led.position.set(w * 0.18, 0.7, hd + 0.01);
    g.add(led);
    out.animate = (t) => {
      led.visible = Math.sin(t * 3) > -0.3;
    };
    return out;
  }
  if (o.kind === 'bin') {
    cylinder(g, 0.17, 0.46, 0x8a94a8, 0, 0.23, 0, 14);
    cylinder(g, 0.185, 0.05, 0x59607a, 0, 0.47, 0, 14);
    return out;
  }
  if (o.kind === 'foosball') {
    // Bàn bi lắc ở khu nghỉ: thân đỏ, sân xanh, các thanh người.
    const w = hw * 2;
    const d = hd * 2;
    rbox(g, w, 0.28, d, 0xd6455a, 0, 0.78, 0, 0.05);
    rbox(g, w - 0.14, 0.02, d - 0.14, 0x3fae6a, 0, 0.93, 0, 0.01);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) rbox(g, 0.1, 0.66, 0.1, 0x59607a, sx * (w / 2 - 0.1), 0.33, sz * (d / 2 - 0.1), 0.02);
    for (let i = 0; i < 4; i += 1) {
      const x = (i - 1.5) * (w / 4.2);
      const rod = cylinder(g, 0.012, d + 0.5, 0xc7d0de, x, 1.0, 0, 6);
      rod.rotation.x = Math.PI / 2;
      for (const dz of [-0.15, 0.15]) rbox(g, 0.05, 0.1, 0.05, i % 2 ? 0x5b9bd5 : 0xf2c14e, x, 0.98, dz, 0.015);
    }
    return out;
  }
  if (o.kind === 'aquarium') {
    const w = hw * 2;
    const d = hd * 2;
    rbox(g, w, 0.7, d, 0xeef1f6, 0, 0.35, 0, 0.04);
    const water = track(new THREE.MeshStandardMaterial({ color: 0x7ad1e8, transparent: true, opacity: 0.55, roughness: 0.1 }));
    const tank = new THREE.Mesh(track(new THREE.BoxGeometry(w - 0.04, 0.7, d - 0.04)), water);
    tank.position.set(0, 1.07, 0);
    g.add(tank);
    rbox(g, w - 0.06, 0.06, d - 0.06, 0xdcc6a0, 0, 0.74, 0, 0.02); // cát đáy
    const fish: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i += 1) {
      const f = new THREE.Mesh(track(new THREE.SphereGeometry(0.06, 8, 6)), mat([0xf08a4b, 0xf2c14e, 0xe86f8f][i]));
      f.scale.set(1.4, 0.8, 0.8);
      g.add(f);
      fish.push(f);
    }
    out.animate = (t) => fish.forEach((f, i) => {
      const k = (t * (0.5 + i * 0.17) + i * 2) % (Math.PI * 2);
      f.position.set((Math.sin(k) * (w / 2 - 0.12)) * 0.9, 1.0 + 0.18 * Math.sin(k * 1.7 + i), (Math.cos(k * 0.7 + i) * (d / 2 - 0.1)) * 0.8);
      f.rotation.y = Math.cos(k) > 0 ? 0 : Math.PI;
    });
    return out;
  }
  if (o.kind === 'hedge') {
    // Chậu dài trồng cây: các tán tròn xếp dọc theo cạnh dài (bán kính theo cạnh ngắn).
    const alongX = o.hw >= o.hd;
    const long = Math.max(o.hw, o.hd);
    const short = Math.min(o.hw, o.hd);
    rbox(g, o.hw * 2, 0.35, o.hd * 2, 0xd9825b, 0, 0.18, 0, 0.06);
    const n = Math.max(Math.round((long * 2) / (short * 2 + 0.4)), 1);
    for (let i = 0; i < n; i += 1) {
      const t = ((i + 0.5) / n - 0.5) * long * 2;
      const m = new THREE.Mesh(track(new THREE.SphereGeometry(short + 0.12, 12, 10)), mat([0x4caf68, 0x3a9a5a, 0x6cc986][i % 3]));
      m.position.set(alongX ? t : 0, 0.55, alongX ? 0 : t);
      m.castShadow = true;
      g.add(m);
    }
    return out;
  }
  if (o.kind === 'lamp') {
    cylinder(g, 0.18, 0.03, 0x59607a, 0, 0.02, 0, 14);
    cylinder(g, 0.02, 1.5, 0x59607a, 0, 0.77, 0, 8);
    const shade = new THREE.Mesh(track(new THREE.CylinderGeometry(0.18, 0.26, 0.3, 14)), track(new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffe08a, emissiveIntensity: kit.dark ? 1.6 : 0.4, roughness: 0.6 })));
    shade.position.set(0, 1.62, 0);
    g.add(shade);
    return out;
  }
  return out;
}
