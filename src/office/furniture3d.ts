import * as THREE from 'three';
import { TEAM_COLORS, type Obstacle, type OfficeLayout } from './layout';
import { mixColor, type Kit } from './kit';

/** Đồ đạc 3D phong cách bo tròn, màu pastel ấm. Đơn vị mét. */

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

function bean(kit: Kit, parent: THREE.Object3D, x: number, z: number, color: number) {
  const m = new THREE.Mesh(kit.track(new THREE.SphereGeometry(0.42, 18, 14)), kit.mat(color));
  m.scale.set(1, 0.7, 1);
  m.position.set(x, 0.3, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
}

/** Đồ đạc theo loại (khớp với `layout.furniture`). */
export function furniture3d(kit: Kit, layout: OfficeLayout, parent: THREE.Object3D, o: Obstacle) {
  const { rbox, cylinder, track, mat } = kit;
  const g = new THREE.Group();
  g.position.set(o.x, 0, o.z);
  parent.add(g);
  const south = o.z > layout.aisleFrontZ;

  if (o.kind === 'desk') {
    // Bàn trống: giữ nguyên vị trí, xoay theo hướng ngồi.
    const f = o.facing ?? 0;
    g.position.set(o.x, 0, o.z - 1.15 * Math.cos(f));
    g.rotation.y = f;
    g.add(deskSet(kit, 3, false).group);
    return;
  }
  if (o.kind === 'plant') {
    const pot = rbox(g, 0.5, 0.4, 0.5, 0xe07a52, 0, 0.2, 0, 0.12);
    pot.scale.set(1, 1, 1);
    rbox(g, 0.44, 0.04, 0.44, 0x4a3426, 0, 0.4, 0, 0.02);
    const greens = [0x4caf68, 0x3a9a5a, 0x6cc986];
    const leaves: [number, number, number, number][] = [[0, 0.82, 0, 0.36], [0.18, 1.08, 0.04, 0.27], [-0.16, 1.2, -0.05, 0.22], [0.05, 0.62, 0.2, 0.2], [-0.2, 0.7, -0.12, 0.2]];
    leaves.forEach(([x, y, zz, r], i) => {
      const m = new THREE.Mesh(track(new THREE.SphereGeometry(r, 16, 12)), mat(greens[i % 3]));
      m.position.set(x, y, zz);
      m.castShadow = true;
      g.add(m);
    });
    return;
  }
  if (o.kind === 'sofa') {
    if (south) g.rotation.y = Math.PI; // lưng tựa sát tường nam
    const c = 0x4fa7a0;
    rbox(g, 2.2, 0.38, 0.95, c, 0, 0.23, 0, 0.1);
    rbox(g, 2.2, 0.62, 0.26, mixColor(c, 0x000000, 0.1), 0, 0.62, -0.38, 0.1);
    for (const dx of [-1.02, 1.02]) rbox(g, 0.2, 0.56, 0.95, mixColor(c, 0x000000, 0.08), dx, 0.46, 0, 0.09);
    rbox(g, 0.9, 0.18, 0.7, mixColor(c, 0xffffff, 0.18), -0.46, 0.5, 0.06, 0.07);
    rbox(g, 0.9, 0.18, 0.7, mixColor(c, 0xffffff, 0.18), 0.46, 0.5, 0.06, 0.07);
    rbox(g, 0.4, 0.4, 0.12, 0xf2c14e, -0.7, 0.7, -0.18, 0.06).rotation.z = 0.15;
    rbox(g, 0.4, 0.4, 0.12, 0xe86f8f, 0.7, 0.7, -0.18, 0.06).rotation.z = -0.15;
    return;
  }
  if (o.kind === 'table') {
    if (Math.abs(o.hw - o.hd) < 0.01) {
      const top = cylinder(g, o.hw, 0.06, WOOD, 0, 0.72, 0, 28);
      top.castShadow = true;
      cylinder(g, 0.06, 0.7, 0xf3eee8, 0, 0.36, 0, 12);
      cylinder(g, 0.28, 0.04, 0xf3eee8, 0, 0.02, 0, 20);
      cylinder(g, 0.06, 0.1, 0xffffff, 0.12, 0.8, 0.05, 12);
      for (const [dx, dz, c] of [[-0.85, 0.1, 0xf08a4b], [0.8, -0.2, 0x4fa7a0]] as const) bean(kit, g, dx, dz, c);
    } else {
      rbox(g, o.hw * 2, 0.07, o.hd * 2, WOOD, 0, 0.74, 0, 0.03);
      for (const dx of [-o.hw + 0.12, o.hw - 0.12]) rbox(g, 0.07, 0.72, o.hd * 2 - 0.12, WHITE, dx, 0.36, 0, 0.025);
      rbox(g, 0.45, 0.012, 0.32, 0xffffff, -o.hw * 0.4, 0.785, 0.02, 0.005);
      cylinder(g, 0.045, 0.09, 0xffffff, o.hw * 0.5, 0.82, 0.05, 12);
      // ghế quanh bàn họp
      if (o.id.startsWith('meeting')) {
        for (const dx of [-o.hw * 0.55, 0, o.hw * 0.55]) {
          rbox(g, 0.42, 0.07, 0.42, CHAIRS[Math.abs(Math.round(dx * 3)) % CHAIRS.length], dx, 0.45, o.hd + 0.35, 0.03);
          rbox(g, 0.42, 0.4, 0.06, CHAIRS[Math.abs(Math.round(dx * 3)) % CHAIRS.length], dx, 0.7, o.hd + 0.55, 0.03);
          cylinder(g, 0.03, 0.4, 0x59607a, dx, 0.22, o.hd + 0.35, 8);
        }
      }
    }
    return;
  }
  if (o.kind === 'counter') {
    rbox(g, o.hw * 2, 0.88, 0.8, 0xeef1f6, 0, 0.44, 0, 0.04);
    rbox(g, o.hw * 2 + 0.08, 0.06, 0.9, 0x6b7385, 0, 0.91, 0, 0.025);
    for (let x = -o.hw + 0.45; x < o.hw - 0.3; x += 0.9) rbox(g, 0.8, 0.62, 0.03, 0xd3d9e4, x, 0.42, 0.41, 0.01);
    rbox(g, 0.42, 0.44, 0.34, 0x2b3040, -o.hw / 2, 1.17, -0.12, 0.05);
    rbox(g, 0.3, 0.05, 0.26, 0xd6313f, -o.hw / 2, 1.42, -0.12, 0.02);
    cylinder(g, 0.045, 0.1, 0xffffff, -o.hw / 2 + 0.5, 0.99, 0.1, 12);
    rbox(g, 0.5, 0.03, 0.4, 0xaab4c4, o.hw / 2, 0.95, 0, 0.012);
    return;
  }
  if (o.kind === 'cooler') {
    rbox(g, 0.42, 0.9, 0.4, 0xdde5ee, 0, 0.45, 0, 0.06);
    const bottle = new THREE.Mesh(track(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 16)), track(new THREE.MeshStandardMaterial({ color: 0x8fd6ff, transparent: true, opacity: 0.75, roughness: 0.2 })));
    bottle.position.set(0, 1.12, 0);
    bottle.castShadow = true;
    g.add(bottle);
    return;
  }
  if (o.kind === 'fridge') {
    rbox(g, 0.9, 1.8, 0.8, 0xf4f6fa, 0, 0.9, 0, 0.07);
    rbox(g, 0.86, 0.02, 0.02, 0xc7d0de, 0, 1.18, 0.41, 0.005);
    rbox(g, 0.04, 0.5, 0.04, 0x8a94a8, 0.32, 1.45, 0.42, 0.015);
    rbox(g, 0.04, 0.4, 0.04, 0x8a94a8, 0.32, 0.8, 0.42, 0.015);
    rbox(g, 0.14, 0.14, 0.01, 0xffb4c0, -0.2, 1.5, 0.41, 0.005);
    return;
  }
  if (o.kind === 'reception') {
    rbox(g, o.hw * 2, 1.05, 0.9, 0xf6f4f1, 0, 0.52, 0, 0.1);
    rbox(g, o.hw * 2 + 0.1, 0.07, 1.0, 0x6b7385, 0, 1.08, 0.02, 0.03);
    rbox(g, 0.62, 0.4, 0.04, 0x262b3b, -0.4, 1.35, -0.1, 0.02);
    rbox(g, 0.3, 0.03, 0.2, 0xf5c542, 0.6, 1.14, 0.1, 0.012);
    return;
  }
  if (o.kind === 'rack') {
    const units = Math.max(Math.round((o.hw * 2) / 1.05), 1);
    for (let i = 0; i < units; i += 1) {
      const x = (i - (units - 1) / 2) * 1.05;
      rbox(g, 0.95, 2.3, 1.1, 0x353b4d, x, 1.15, 0, 0.05);
      for (let k = 0; k < 8; k += 1) {
        rbox(g, 0.78, 0.1, 0.02, 0x20242f, x, 0.35 + k * 0.26, 0.56, 0.01);
        const led = new THREE.Mesh(track(new THREE.SphereGeometry(0.02, 6, 6)), track(new THREE.MeshBasicMaterial({ color: k % 3 === 0 ? 0xffb347 : 0x4cf08a })));
        led.position.set(x + 0.32, 0.35 + k * 0.26, 0.57);
        g.add(led);
      }
    }
    return;
  }
  if (o.kind === 'easel') {
    const zone = layout.zones.find((z) => o.id === `easel-${z.id}`);
    const color = zone ? TEAM_COLORS[zone.colorIndex % TEAM_COLORS.length] : 0x64748b;
    for (const dx of [-0.7, 0.7]) rbox(g, 0.05, 1.6, 0.05, 0x8a94a8, dx, 0.8, 0, 0.02);
    rbox(g, 1.7, 1.05, 0.05, 0xfafbfd, 0, 1.45, 0.04, 0.02);
    rbox(g, 1.76, 0.08, 0.07, color, 0, 2.0, 0.04, 0.03);
    rbox(g, 1.0, 0.025, 0.01, 0xa8b2c4, -0.2, 1.65, 0.08, 0.005);
    rbox(g, 0.7, 0.025, 0.01, 0xa8b2c4, -0.35, 1.45, 0.08, 0.005);
    rbox(g, 0.4, 0.25, 0.01, color, 0.5, 1.3, 0.08, 0.01);
    return;
  }
  if (o.kind === 'cabinet') {
    const lib = layout.rooms.find((r) => r.id === 'library');
    if (o.id.startsWith('library-shelf') && lib) {
      const toward = o.z < lib.z ? 1 : -1;
      rbox(g, o.hw * 2, 2.2, 0.36, 0x9c7048, 0, 1.1, 0, 0.04);
      const books = [0xe0525f, 0x4a86d9, 0x4cbf86, 0xf5a742, 0x9b6df0, 0x2cb5a6];
      const n = Math.max(Math.floor((o.hw * 2) / 0.32), 1);
      for (let i = 0; i < n; i += 1) {
        const bx = (i - (n - 1) / 2) * 0.32;
        for (const level of [0.5, 1.2, 1.9]) rbox(g, 0.26, 0.5 - (i % 3) * 0.03, 0.22, books[(i + Math.round(level * 5)) % books.length], bx, level, 0.1 * toward, 0.03);
      }
    } else {
      const units = Math.max(Math.round((o.hw * 2) / 0.95), 1);
      for (let i = 0; i < units; i += 1) {
        const cx = (i - (units - 1) / 2) * 0.95;
        rbox(g, 0.88, 1.8, 0.6, 0xbdc6d4, cx, 0.9, 0, 0.05);
        for (const y of [0.45, 0.9, 1.35]) {
          rbox(g, 0.76, 0.36, 0.03, 0xa4afc0, cx, y, 0.31, 0.015);
          rbox(g, 0.22, 0.04, 0.04, 0xeef2f7, cx, y, 0.34, 0.015);
        }
      }
    }
  }
}
