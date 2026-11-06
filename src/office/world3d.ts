import * as THREE from 'three';
import { PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createChibi } from './chibi';
import { furniture3d } from './furniture3d';
import { TEAM_COLORS, type OfficeLayout, type Tile } from './layout';
import { lookFor } from './look';
import { mixColor, type Kit, type PillSprite } from './kit';

/** Thế giới 3D: ánh sáng, đường phố quanh tòa nhà, sàn, tường kính, các khu và đồ đạc. Camera isometric nhìn từ góc trước phải. */

export interface World {
  loungeSign: PillSprite;
  beacon: THREE.Mesh | null;
  boardNotes: THREE.Mesh[];
  keyLight: THREE.DirectionalLight;
  /** Người của Chủ (ngồi ở bàn Chủ), để scene cập nhật nếu cần. */
  ownerRig: ReturnType<typeof createChibi>;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

// ---------------------------------------------------------------------------------------------------------------
// Hoa văn sàn
// ---------------------------------------------------------------------------------------------------------------

type FloorKind = 'wood' | 'carpet' | 'tile' | 'marble' | 'server' | 'stone';

function floorTexture(kind: FloorKind, base: number, track: Kit['track']): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const r = rng(kind.length * 131 + base);
  const color = (n: number) => hex(n);
  g.fillStyle = color(base);
  g.fillRect(0, 0, size, size);
  if (kind === 'wood') {
    const plank = size / 8;
    for (let row = 0; row < 8; row += 1) {
      const y = row * plank;
      g.fillStyle = color(mixColor(base, row % 2 ? 0xffffff : 0x000000, 0.045));
      g.fillRect(0, y, size, plank);
      g.fillStyle = color(mixColor(base, 0x000000, 0.22));
      g.fillRect(0, y + plank - 2, size, 2);
      const seam = (row * 97 + 40) % size;
      g.fillRect(seam, y, 2, plank);
      g.fillStyle = color(mixColor(base, 0x000000, 0.08));
      for (let i = 0; i < 6; i += 1) g.fillRect(r() * size, y + 4 + r() * (plank - 8), 24 + r() * 60, 1);
    }
  } else if (kind === 'carpet') {
    for (let i = 0; i < 900; i += 1) {
      g.fillStyle = color(mixColor(base, r() > 0.5 ? 0xffffff : 0x000000, 0.07));
      g.fillRect(r() * size, r() * size, 2, 2);
    }
  } else if (kind === 'tile') {
    const cell = size / 4;
    g.fillStyle = color(mixColor(base, 0x000000, 0.14));
    for (let i = 0; i <= 4; i += 1) {
      g.fillRect(i * cell - 1, 0, 3, size);
      g.fillRect(0, i * cell - 1, size, 3);
    }
    for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) {
      if ((x + y) % 2 === 0) {
        g.fillStyle = color(mixColor(base, 0xffffff, 0.1));
        g.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
      }
    }
  } else if (kind === 'marble') {
    const cell = size / 2;
    for (let y = 0; y < 2; y += 1) for (let x = 0; x < 2; x += 1) {
      g.fillStyle = color(mixColor(base, (x + y) % 2 ? 0x000000 : 0xffffff, 0.05));
      g.fillRect(x * cell, y * cell, cell, cell);
    }
    g.strokeStyle = color(mixColor(base, 0x000000, 0.12));
    g.lineWidth = 1;
    for (let i = 0; i < 10; i += 1) {
      g.beginPath();
      g.moveTo(r() * size, r() * size);
      g.lineTo(r() * size, r() * size);
      g.stroke();
    }
  } else if (kind === 'server') {
    g.fillStyle = color(mixColor(base, 0xffffff, 0.06));
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
  } else {
    const cell = size / 4;
    g.fillStyle = color(mixColor(base, 0x000000, 0.1));
    for (let row = 0; row < 4; row += 1) {
      g.fillRect(0, row * cell, size, 2);
      for (let x = (row % 2) * (cell / 2); x < size; x += cell) g.fillRect(x, row * cell, 2, cell);
    }
  }
  const texture = track(new THREE.CanvasTexture(c));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

// ---------------------------------------------------------------------------------------------------------------
// Đồ ngoài trời
// ---------------------------------------------------------------------------------------------------------------

function car(kit: Kit, parent: THREE.Object3D, x: number, z: number, rot: number, color: number) {
  const { rbox, cylinder, track, mat } = kit;
  const g = new THREE.Group();
  g.position.set(x, -0.3, z);
  g.rotation.y = rot;
  parent.add(g);
  rbox(g, 1.9, 0.62, 4.2, color, 0, 0.62, 0, 0.25);
  rbox(g, 1.65, 0.55, 2.2, mixColor(color, 0xffffff, 0.15), 0, 1.12, -0.1, 0.22);
  const glass = new THREE.Mesh(track(new THREE.BoxGeometry(1.67, 0.34, 2.0)), track(new THREE.MeshStandardMaterial({ color: 0x9fd4ee, roughness: 0.15, metalness: 0.2 })));
  glass.position.set(0, 1.15, -0.1);
  g.add(glass);
  for (const [dx, dz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]] as const) {
    const w = cylinder(g, 0.36, 0.28, 0x2a2733, dx, 0.36, dz, 14);
    w.rotation.z = Math.PI / 2;
  }
  for (const dx of [-0.65, 0.65]) {
    const l = new THREE.Mesh(track(new THREE.SphereGeometry(0.14, 8, 6)), track(new THREE.MeshBasicMaterial({ color: 0xfff1b0 })));
    l.position.set(dx, 0.7, 2.1);
    g.add(l);
  }
  void mat;
}

function trafficLight(kit: Kit, parent: THREE.Object3D, x: number, z: number, rot: number) {
  const { rbox, cylinder, track } = kit;
  const g = new THREE.Group();
  g.position.set(x, -0.3, z);
  g.rotation.y = rot;
  parent.add(g);
  cylinder(g, 0.1, 4.2, 0x3a3748, 0, 2.1, 0, 10);
  rbox(g, 0.42, 1.1, 0.34, 0x2b2937, 0, 4.4, 0.1, 0.08);
  [0xff5a5a, 0xffc53d, 0x45d483].forEach((c, i) => {
    const bulb = new THREE.Mesh(track(new THREE.SphereGeometry(0.11, 10, 8)), track(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i === 0 ? 1.2 : 0.15 })));
    bulb.position.set(0, 4.7 - i * 0.3, 0.28);
    g.add(bulb);
  });
}

function streetLamp(kit: Kit, parent: THREE.Object3D, x: number, z: number, night: boolean) {
  const { cylinder, track } = kit;
  const g = new THREE.Group();
  g.position.set(x, -0.1, z);
  parent.add(g);
  cylinder(g, 0.07, 4.6, 0x4a4660, 0, 2.3, 0, 8);
  const head = new THREE.Mesh(track(new THREE.SphereGeometry(0.28, 12, 10)), track(new THREE.MeshStandardMaterial({ color: 0xfff4c8, emissive: 0xffe08a, emissiveIntensity: night ? 2.2 : 0.35 })));
  head.position.set(0, 4.7, 0);
  g.add(head);
}

function tree(kit: Kit, parent: THREE.Object3D, x: number, z: number, scale: number, seed: number) {
  const { cylinder, track, mat } = kit;
  const g = new THREE.Group();
  g.position.set(x, -0.1, z);
  g.scale.setScalar(scale);
  parent.add(g);
  const trunk = cylinder(g, 0.16, 1.4, 0x8a6a4a, 0, 0.7, 0, 8);
  trunk.castShadow = true;
  const greens = [0x5cc07a, 0x4aa968, 0x7ad493, 0x3f9a5a];
  const blobs: [number, number, number, number][] = [[0, 2.0, 0, 1.0], [0.55, 1.7, 0.2, 0.7], [-0.5, 1.75, -0.2, 0.72], [0.05, 2.7, 0.05, 0.7]];
  blobs.forEach(([x2, y, z2, r], i) => {
    const m = new THREE.Mesh(track(new THREE.SphereGeometry(r, 16, 12)), mat(greens[(seed + i) % greens.length]));
    m.position.set(x2, y, z2);
    m.castShadow = true;
    g.add(m);
  });
}

function windowTexture(track: Kit['track'], night: boolean, seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const r = rng(seed);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 14; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const lit = night && r() > 0.5;
      g.fillStyle = lit ? (r() > 0.5 ? '#ffe9a8' : '#bcd8ff') : night ? '#4a5878' : '#a9c4e2';
      g.fillRect(10 + col * 19, 10 + row * 17, 13, 10);
    }
  }
  const t = track(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------------------------------------------------------
// Dựng cả thế giới
// ---------------------------------------------------------------------------------------------------------------

export function buildWorld(kit: Kit, layout: OfficeLayout, renderer: THREE.WebGLRenderer): World {
  const { scene, dark: night, rbox, box, cylinder, track, mat, pill } = kit;
  const { walls } = layout;
  const W = walls.maxX - walls.minX;
  const D = walls.maxZ - walls.minZ;
  const midX = (walls.minX + walls.maxX) / 2;
  const midZ = (walls.minZ + walls.maxZ) / 2;
  const tint = (a: number, b: number) => (night ? b : a);

  // ---------- Ánh sáng ----------
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = night ? 0.18 : 0.3;
  pmrem.dispose();
  scene.background = new THREE.Color(night ? 0x1b1830 : 0xe8d9e0);
  scene.fog = new THREE.Fog(night ? 0x1b1830 : 0xe8d9e0, 110, 260);
  scene.add(new THREE.HemisphereLight(night ? 0x8d86d8 : 0xfff1e8, night ? 0x2a2540 : 0xbfa6b8, night ? 0.55 : 0.5));
  const keyLight = new THREE.DirectionalLight(night ? 0xb9b4ff : 0xffe9cf, night ? 0.7 : 1.7);
  keyLight.position.set(midX - 16, 34, midZ + 20);
  keyLight.target.position.set(midX, 0, midZ);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -W / 2 - 8;
  keyLight.shadow.camera.right = W / 2 + 8;
  keyLight.shadow.camera.top = D / 2 + 10;
  keyLight.shadow.camera.bottom = -D / 2 - 10;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 90;
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.normalBias = 0.03;
  keyLight.shadow.radius = 3;
  scene.add(keyLight, keyLight.target);

  // ---------- Mặt đất, vỉa hè, đường ----------
  const groundMat = mat(tint(0x756f86, 0x2a2838));
  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(400, 400)), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(midX, -0.3, midZ);
  ground.receiveShadow = true;
  scene.add(ground);
  const SW = 1.8; // bề rộng vỉa hè
  rbox(scene, W + SW * 2, 0.22, D + SW * 2, tint(0xd9d2d8, 0x565164), midX, -0.12, midZ, 0.08);
  rbox(scene, W + 0.8, 0.16, D + 0.8, tint(0xcfc8c6, 0x4a465a), midX, -0.04, midZ, 0.06); // bậc nền tòa nhà
  const ROAD = 7;
  const mark = (x: number, z: number, w: number, d: number, y = -0.29) => box(scene, w, 0.01, d, tint(0xf2eeee, 0x9a96a8), x, y, z).castShadow = false;
  // vạch giữa đường
  const roadCz = walls.maxZ + SW + ROAD / 2;
  const roadCzBack = walls.minZ - SW - ROAD / 2;
  const roadCxL = walls.minX - SW - ROAD / 2;
  const roadCxR = walls.maxX + SW + ROAD / 2;
  for (let x = walls.minX - SW - ROAD; x < walls.maxX + SW + ROAD; x += 3.2) {
    mark(x, roadCz, 1.6, 0.18);
    mark(x, roadCzBack, 1.6, 0.18);
  }
  for (let z = walls.minZ - SW - ROAD; z < walls.maxZ + SW + ROAD; z += 3.2) {
    mark(roadCxL, z, 0.18, 1.6);
    mark(roadCxR, z, 0.18, 1.6);
  }
  // vạch qua đường (zebra) ở góc trước trái và trước phải
  for (let i = 0; i < 9; i += 1) {
    mark(walls.minX - SW - ROAD / 2 - 2.8 + i * 0.7, roadCz + 0.0, 0.4, ROAD * 0.9 - 0.6);
    mark(walls.maxX + SW + ROAD / 2 + 2.8 - i * 0.7, roadCz + 0.0, 0.4, ROAD * 0.9 - 0.6);
  }
  for (let i = 0; i < 7; i += 1) mark(roadCxL - 0.0, walls.maxZ + SW + ROAD + 2.2 + i * 0.7, ROAD * 0.9 - 0.6, 0.4);

  // xe cộ, đèn giao thông, đèn đường, cây
  const carColors = [0x6cc4c4, 0xf0a44b, 0xe86f8f, 0x8c7ae6, 0xf2f0ee];
  car(kit, scene, midX - 9, roadCz + 1.6, Math.PI / 2, carColors[0]);
  car(kit, scene, midX + 8, roadCz - 1.6, -Math.PI / 2, carColors[2]);
  car(kit, scene, roadCxL + 1.5, midZ + 3, 0, carColors[1]);
  car(kit, scene, roadCxR - 1.6, midZ - 6, Math.PI, carColors[3]);
  car(kit, scene, midX + 20, roadCzBack + 1.6, Math.PI / 2, carColors[4]);
  trafficLight(kit, scene, walls.minX - SW - 0.4, walls.maxZ + SW + 0.6, Math.PI / 2);
  trafficLight(kit, scene, walls.maxX + SW + 0.4, walls.maxZ + SW + 0.6, -Math.PI / 2);
  trafficLight(kit, scene, walls.maxX + SW + 0.4, walls.minZ - SW - 0.6, -Math.PI / 2);
  for (let x = walls.minX + 3; x < walls.maxX; x += 8) streetLamp(kit, scene, x, walls.maxZ + SW - 0.4, night);
  const r = rng(5);
  let seed = 0;
  for (let x = walls.minX - 1; x <= walls.maxX + 1; x += 5.5 + r() * 2) {
    tree(kit, scene, x, walls.maxZ + SW - 0.1, 0.8 + r() * 0.3, seed++);
    tree(kit, scene, x + 2, walls.minZ - SW + 0.1, 0.8 + r() * 0.3, seed++);
  }
  for (let z = walls.minZ; z <= walls.maxZ; z += 6 + r() * 2) {
    tree(kit, scene, walls.minX - SW + 0.1, z, 0.85 + r() * 0.3, seed++);
    tree(kit, scene, walls.maxX + SW - 0.1, z, 0.85 + r() * 0.3, seed++);
  }
  // các khối nhà xa
  const blocks: [number, number, number, number, number][] = [];
  const outX = W / 2 + SW + ROAD + 4;
  const outZ = D / 2 + SW + ROAD + 4;
  // Camera nhìn từ góc trước phải, nên chỉ dựng nhà ở phía sau và bên trái (phía trước và bên phải sẽ che tòa nhà).
  for (let i = -4; i <= 3; i += 1) blocks.push([midX + i * 15 + r() * 3, midZ - outZ - 6 - r() * 8, 11 + r() * 5, 10 + r() * 5, 10 + r() * 18]);
  for (let i = -2; i <= 3; i += 1) blocks.push([midX - outX - 7 - r() * 6, midZ + i * 14, 10 + r() * 4, 11 + r() * 4, 9 + r() * 18]);
  const tints = [0xe6c9c9, 0xcfd8e6, 0xe9dcc0, 0xd7cfe6, 0xc9e0d8];
  blocks.forEach(([x, z, w, d, h], i) => {
    const tex = windowTexture(track, night, i + 3);
    tex.repeat.set(Math.max(Math.round(w / 6), 1), Math.max(Math.round(h / 5), 1));
    const m = track(new THREE.MeshStandardMaterial({ color: tints[i % tints.length], map: tex, emissive: night ? 0xffffff : 0x000000, emissiveMap: night ? tex : null, emissiveIntensity: night ? 0.5 : 0, roughness: 0.9 }));
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), m);
    mesh.position.set(x, h / 2 - 0.3, z);
    mesh.castShadow = true;
    scene.add(mesh);
  });

  // ---------- Sàn trong nhà ----------
  const floorColors: Record<string, [FloorKind, number]> = {
    owner: ['wood', 0xe0b57a], director: ['carpet', 0xcbbde3], meeting1: ['carpet', 0xbdd2ea], meeting2: ['carpet', 0xbdd2ea],
    library: ['wood', 0xcf9b5a], server: ['server', 0x4b4f63], archive: ['carpet', 0xe3dad2], wc: ['tile', 0xcfe8ee],
    pantry: ['tile', 0xf3dcb4], rest: ['wood', 0xe0b57a], lobby: ['marble', 0xe4dcd4],
  };
  const floorMat = (kind: FloorKind, base: number, w: number, d: number) => {
    const tex = floorTexture(kind, base, track);
    tex.repeat.set(Math.max(w / 2.4, 1), Math.max(d / 2.4, 1));
    return track(new THREE.MeshStandardMaterial({ map: tex, roughness: kind === 'wood' || kind === 'marble' ? 0.55 : 0.95 }));
  };
  const floorBox = (x: number, z: number, w: number, d: number, material: THREE.Material, y = 0.03, h = 0.06) => {
    const m = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), material);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
  };
  // nền chung của không gian làm việc
  floorBox(midX, midZ, W - 0.2, D - 0.2, floorMat('carpet', 0xc9c2dc, W, D), 0.02, 0.04);
  for (const tile of layout.tiles) {
    if (tile.kind === 'zone') {
      const color = mixColor(TEAM_COLORS[tile.colorIndex % TEAM_COLORS.length], 0xffffff, night ? 0.4 : 0.42);
      floorBox(tile.x, tile.z, tile.w - 0.05, tile.d - 0.05, floorMat('carpet', color, tile.w, tile.d), 0.045, 0.05);
    } else {
      const [kind, base] = floorColors[tile.id] ?? ['carpet', 0xdddddd];
      floorBox(tile.x, tile.z, tile.w, tile.d, floorMat(kind, base, tile.w, tile.d), 0.045, 0.05);
    }
  }
  // lối đi lát đá sáng
  const stoneMat = floorMat('stone', 0xf1ece8, 6, 6);
  const x0 = layout.lanes[0] - 0.9;
  const x1 = layout.lanes[layout.lanes.length - 1] + 0.9;
  for (const z of [layout.aisleBackZ, layout.aisleFrontZ]) floorBox((x0 + x1) / 2, z, x1 - x0, 1.8, stoneMat, 0.075, 0.04);
  for (const lane of layout.lanes) floorBox(lane, (layout.aisleBackZ + layout.aisleFrontZ) / 2, 1.8, layout.aisleFrontZ - layout.aisleBackZ, stoneMat, 0.075, 0.04);

  // ---------- Tường ngoài: tường kính cong sau và trái; lan can thấp bên phải và phía trước ----------
  const cream = tint(0xf6f0e8, 0x58526b);
  const frame = tint(0xdcd3c8, 0x7a7494);
  const glass = track(new THREE.MeshStandardMaterial({ color: night ? 0x8e9de0 : 0xbfe4f4, transparent: true, opacity: night ? 0.16 : 0.24, roughness: 0.08, metalness: 0.1, depthWrite: false }));
  const curtainWall = (cx: number, cz: number, length: number, rotY: number) => {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.rotation.y = rotY;
    scene.add(g);
    rbox(g, length, 0.9, 0.3, cream, 0, 0.45, 0, 0.05);
    rbox(g, length, 0.25, 0.32, cream, 0, 3.6, 0, 0.06);
    const pane = new THREE.Mesh(track(new THREE.BoxGeometry(length, 2.55, 0.05)), glass);
    pane.position.set(0, 2.2, 0);
    g.add(pane);
    const n = Math.max(Math.round(length / 3.4), 1);
    for (let i = 0; i <= n; i += 1) rbox(g, 0.14, 2.7, 0.26, frame, -length / 2 + (i * length) / n, 2.2, 0, 0.04);
  };
  curtainWall(midX, walls.minZ, W, 0);
  curtainWall(walls.minX, midZ, D, Math.PI / 2);
  const lobby = layout.rooms.find((rm) => rm.id === 'lobby');
  const parapet = (cx: number, cz: number, length: number, rotY: number) => {
    if (length < 0.1) return;
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.rotation.y = rotY;
    scene.add(g);
    rbox(g, length, 0.8, 0.3, cream, 0, 0.4, 0, 0.1);
    rbox(g, length, 0.08, 0.38, frame, 0, 0.82, 0, 0.04);
  };
  parapet(walls.maxX, midZ, D, Math.PI / 2);
  if (lobby) {
    const gapL = lobby.x - 1.7;
    const gapR = lobby.x + 1.7;
    parapet((walls.minX + gapL) / 2, walls.maxZ, gapL - walls.minX, 0);
    parapet((gapR + walls.maxX) / 2, walls.maxZ, walls.maxX - gapR, 0);
    // cửa vào: khung kính và mái che nhỏ
    for (const dx of [-1.7, 1.7]) rbox(scene, 0.12, 2.8, 0.2, frame, lobby.x + dx, 1.4, walls.maxZ, 0.04);
    rbox(scene, 3.6, 0.2, 0.7, cream, lobby.x, 2.85, walls.maxZ + 0.2, 0.06);
    rbox(scene, 2.6, 0.03, 1.0, tint(0x6b7385, 0x3a384a), lobby.x, 0.1, walls.maxZ + 0.7, 0.01);
  } else parapet(midX, walls.maxZ, W, 0);
  for (const [px, pz] of [[walls.minX, walls.minZ], [walls.maxX, walls.minZ], [walls.minX, walls.maxZ], [walls.maxX, walls.maxZ]] as const) rbox(scene, 0.5, 3.8, 0.5, cream, px, 1.9, pz, 0.12);

  // ---------- Tường và cửa từng phòng ----------
  const roomGlass = track(new THREE.MeshStandardMaterial({ color: night ? 0x8e9de0 : 0xcfeaf6, transparent: true, opacity: night ? 0.14 : 0.2, roughness: 0.08, depthWrite: false }));
  const roomFrame = tint(0xe9e2d8, 0x8b86a6);
  const wallH = 2.6;
  const roomWalls = (tile: Tile) => {
    const door = tile.door;
    if (!door || tile.walls === 'none') return;
    const solid = tile.walls === 'solid';
    const g = new THREE.Group();
    g.position.set(tile.x, 0.06, tile.z);
    scene.add(g);
    const T = 0.12;
    const hw = tile.w / 2;
    const hd = tile.d / 2;
    const seg = (xa: number, za: number, xb: number, zb: number, baseH: number) => {
      const alongX = Math.abs(zb - za) < 1e-6;
      const len = alongX ? Math.abs(xb - xa) : Math.abs(zb - za);
      if (len < 0.05) return;
      const cx = (xa + xb) / 2;
      const cz = (za + zb) / 2;
      if (solid) {
        rbox(g, alongX ? len : T, wallH, alongX ? T : len, cream, cx, wallH / 2, cz, 0.03);
        return;
      }
      rbox(g, alongX ? len : T, baseH, alongX ? T : len, cream, cx, baseH / 2, cz, 0.03);
      const gh = wallH - baseH;
      const pane = new THREE.Mesh(track(new THREE.BoxGeometry(alongX ? len : 0.04, gh, alongX ? 0.04 : len)), roomGlass);
      pane.position.set(cx, baseH + gh / 2, cz);
      g.add(pane);
      rbox(g, alongX ? len : T + 0.02, 0.08, alongX ? T + 0.02 : len, roomFrame, cx, wallH, cz, 0.03);
      const n = Math.max(Math.round(len / 2.4), 1);
      for (let i = 0; i <= n; i += 1) {
        const t = i / n;
        rbox(g, alongX ? 0.05 : T + 0.01, gh, alongX ? T + 0.01 : 0.05, roomFrame, xa + (xb - xa) * t, baseH + gh / 2, za + (zb - za) * t, 0.02);
      }
    };
    const onBack = tile.doorSide === 'back';
    const backH = onBack ? 0.4 : 0.9;
    const frontH = onBack ? 0.9 : 0.4;
    if (onBack) {
      seg(-hw, -hd, door.from, -hd, backH);
      seg(door.to, -hd, hw, -hd, backH);
      seg(-hw, hd, hw, hd, frontH);
    } else {
      seg(-hw, -hd, hw, -hd, backH);
      seg(-hw, hd, door.from, hd, frontH);
      seg(door.to, hd, hw, hd, frontH);
    }
    seg(-hw, -hd, -hw, hd, 0.9);
    seg(hw, -hd, hw, hd, 0.9);
    const dz = onBack ? -hd : hd;
    for (const x of [door.from, door.to]) rbox(g, 0.07, wallH, T + 0.02, roomFrame, x, wallH / 2, dz, 0.025);
    rbox(g, door.to - door.from + 0.1, 0.3, T + 0.05, cream, (door.from + door.to) / 2, wallH - 0.15, dz, 0.04);
  };
  const sign = (tile: Tile, text: string, dot: string | null, scale = 0.9) => {
    const p = pill(text, scale);
    p.paint(text, dot, 'dark');
    const dz = tile.doorSide === 'back' && tile.door ? -tile.d / 2 : tile.d / 2;
    p.sprite.position.set(tile.x + (tile.door ? (tile.door.from + tile.door.to) / 2 : 0), tile.door ? wallH + 0.8 : 2.6, tile.z + dz - (tile.door ? 0 : 0.8));
    scene.add(p.sprite);
    return p;
  };

  let beacon: THREE.Mesh | null = null;
  const boardNotes: THREE.Mesh[] = [];
  let loungeSign: PillSprite | null = null;
  let ownerRig: ReturnType<typeof createChibi> | null = null;
  const frameArt = (g: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, c: number, onWall: 'back' | 'left' = 'back') => {
    const f = rbox(g, w, h, 0.04, 0xf4efe8, x, y, z, 0.015);
    rbox(g, w - 0.1, h - 0.1, 0.045, c, x, y, z + 0.005, 0.01);
    if (onWall === 'left') f.rotation.y = 0;
  };

  for (const tile of layout.tiles) {
    roomWalls(tile);
    const g = new THREE.Group();
    g.position.set(tile.x, 0.07, tile.z);
    scene.add(g);
    if (tile.kind === 'zone') {
      const color = TEAM_COLORS[tile.colorIndex % TEAM_COLORS.length];
      const zone = layout.zones.find((z) => z.id === tile.id);
      sign(tile, `${tile.label}${zone?.lead ? ` · ${zone.lead}` : ''}`, hex(color), 0.95).sprite.position.set(tile.x, 2.7, tile.z + tile.d / 2 - 0.4);
      for (const pod of layout.pods.filter((p) => p.zoneId === tile.id)) {
        rbox(scene, 4.4, 0.34, 0.05, tint(0xdfe6f0, 0x6a7088), pod.x, 1.03, pod.z, 0.02);
        rbox(scene, 4.5, 0.03, 0.07, color, pod.x, 1.22, pod.z, 0.015);
      }
    } else if (tile.id === 'owner') {
      const desk = new THREE.Group();
      desk.position.set(0, 0, -0.2);
      desk.scale.set(1.2, 1, 1);
      g.add(desk);
      rbox(desk, 2.2, 0.06, 1.1, 0xc99a6a, 0, 0.75, 0.9, 0.03);
      for (const dx of [-1.0, 1.0]) rbox(desk, 0.06, 0.72, 1.0, 0x6b5a78, dx, 0.37, 0.9, 0.02);
      const chair = rbox(g, 0.7, 0.1, 0.7, 0x2f2a3d, 0, 0.5, -0.95, 0.05);
      chair.rotation.y = 0;
      rbox(g, 0.7, 0.8, 0.09, 0x2f2a3d, 0, 0.92, -1.3, 0.05);
      const owner = createChibi(lookFor('Chủ', '#f2c14e', { crown: true, director: false }), kit);
      owner.root.position.set(0, 0.06, -0.9);
      owner.root.rotation.y = 0;
      owner.setPose({ action: 'type', seated: true, t: 0, phase: 1, motion: false });
      g.add(owner.root);
      ownerRig = owner;
      beacon = new THREE.Mesh(track(new THREE.SphereGeometry(0.2, 14, 12)), track(new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xfacc15, emissiveIntensity: 1 })));
      beacon.position.set(0, 2.5, 0.3);
      beacon.visible = false;
      g.add(beacon);
      frameArt(g, -1.2, 1.7, -tile.d / 2 + 0.1, 0.8, 0.6, 0xf2a6b3);
      sign(tile, tile.label, '#f2c14e', 0.8);
    } else if (tile.id === 'director') {
      const bz = -tile.d / 2 + 0.5;
      rbox(g, 3.1, 1.4, 0.08, 0xfafbfd, 0, 1.75, bz, 0.03);
      rbox(g, 3.22, 0.06, 0.1, 0x8a94a8, 0, 1.03, bz + 0.01, 0.02);
      for (const dx of [-1.4, 1.4]) rbox(g, 0.06, 1.0, 0.06, 0x8a94a8, dx, 0.5, bz, 0.02);
      layout.zones.slice(0, 4).forEach((zone, i) => {
        const note = rbox(g, 0.55, 0.4, 0.04, TEAM_COLORS[zone.colorIndex % TEAM_COLORS.length], -1.05 + i * 0.7, 1.75, bz + 0.07, 0.02);
        note.visible = false;
        boardNotes.push(note);
      });
      sign(tile, tile.label, '#8c7ae6', 0.85);
    } else if (tile.id === 'meeting1' || tile.id === 'meeting2') {
      const bz = -tile.d / 2 + 0.2;
      rbox(g, 2.8, 1.2, 0.06, 0xfafbfd, 0, 1.7, bz, 0.025);
      rbox(g, 2.9, 0.07, 0.08, 0x8a94a8, 0, 2.33, bz + 0.01, 0.02);
      rbox(g, 1.6, 0.04, 0.02, 0xa8b2c4, -0.4, 1.95, bz + 0.04, 0.01);
      rbox(g, 0.6, 0.3, 0.02, 0x5b9bd5, 0.7, 1.55, bz + 0.04, 0.01);
      sign(tile, tile.label, '#5b9bd5', 0.85);
    } else if (tile.id === 'library') {
      frameArt(g, 0, 2.3, -tile.d / 2 + 0.1, 0.7, 0.5, 0x9b6df0);
      sign(tile, tile.label, '#f5a742', 0.85);
    } else if (tile.id === 'server') {
      sign(tile, tile.label, '#4cf08a', 0.85);
    } else if (tile.id === 'archive') {
      sign(tile, tile.label, '#94a3b8', 0.85);
    } else if (tile.id === 'wc') {
      for (const dx of [-1.0, 1.0]) {
        rbox(g, 1.3, 2.0, 0.06, 0xdfe7ee, dx, 1.0, tile.d / 2 - 1.5, 0.02);
        rbox(g, 0.5, 0.4, 0.6, 0xfafbfd, dx, 0.2, tile.d / 2 - 0.5, 0.12);
      }
      sign(tile, tile.label, '#6cc4c4', 0.7);
    } else if (tile.id === 'pantry') {
      sign(tile, tile.label, '#f0a44b', 0.85);
    } else if (tile.id === 'rest') {
      const rug = cylinder(g, 3.0, 0.02, 0xf2b6c0, 0, 0.012, 0.1, 40);
      rug.scale.set(1.9, 1, 0.55);
      rug.receiveShadow = true;
      loungeSign = pill('Khu nghỉ', 1.0);
      loungeSign.paint('Khu nghỉ', '#e86f8f', 'dark');
      loungeSign.sprite.position.set(tile.x, 2.7, tile.z + tile.d / 2 - 0.4);
      scene.add(loungeSign.sprite);
    } else if (tile.id === 'lobby') {
      const rug = cylinder(g, 2.6, 0.02, 0xb9d6d2, 0, 0.012, 0.6, 32);
      rug.scale.set(1.5, 1, 0.55);
      sign(tile, 'Sảnh lễ tân', '#6cc4c4', 0.9);
    }
  }

  for (const o of layout.furniture) furniture3d(kit, layout, scene, o);

  void cylinder;
  return { loungeSign: loungeSign ?? pill('Khu nghỉ', 1), beacon, boardNotes, keyLight, ownerRig: ownerRig ?? createChibi(lookFor('Chủ', '#f2c14e', { crown: true, director: false }), kit) };
}
