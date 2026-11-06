import * as THREE from 'three';
import { PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createChibi } from './chibi';
import { furniture3d } from './furniture3d';
import { TEAM_COLORS, WALL_T, type Decor, type FloorStyle, type OfficeLayout, type Wall } from './layout';
import { lookFor } from './look';
import { mixColor, type Kit, type PillSprite } from './kit';

/** Thế giới 3D: ánh sáng, đường phố quanh tòa nhà, sàn, tường kính, các khu và đồ đạc. Camera isometric nhìn từ góc trước phải. */

export interface WorldState {
  /** Có ai đang họp, đang ở pantry (hơi nước từ máy pha cà phê). */
  meeting: boolean;
  pantry: boolean;
}

export interface World {
  loungeSign: PillSprite;
  beacon: THREE.Mesh | null;
  boardNotes: THREE.Mesh[];
  keyLight: THREE.DirectionalLight;
  /** Người của Chủ (ngồi ở bàn Chủ, chỉ tầng 1). */
  ownerRig: ReturnType<typeof createChibi> | null;
  /** Cập nhật mỗi khung hình: kim đồng hồ chạy theo giờ thật, cá bơi, đèn tủ máy, màn hình họp, hơi nước cà phê. Trả về true nếu còn động. */
  tick: (t: number, state: WorldState) => boolean;
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
  const baseTextures = new Map<string, THREE.CanvasTexture>();
  const floorMat = (style: FloorStyle, base: number, w: number, d: number) => {
    const kind: FloorKind = style === 'dark' ? 'carpet' : style;
    const key = `${kind}|${base}`;
    let source = baseTextures.get(key);
    if (!source) {
      source = floorTexture(kind, base, track);
      baseTextures.set(key, source);
    }
    const tex = track(source.clone()); // dùng chung ảnh, riêng cách lặp theo cỡ từng mảng sàn
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(w / 2.4, 1), Math.max(d / 2.4, 1));
    return track(new THREE.MeshStandardMaterial({ map: tex, roughness: kind === 'wood' || kind === 'marble' ? 0.55 : 0.95 }));
  };
  const floorBox = (x: number, z: number, w: number, d: number, material: THREE.Material, y: number, h: number) => {
    const m = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), material);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
  };
  floorBox(midX, midZ, W - 0.2, D - 0.2, floorMat('carpet', 0xc9c2dc, W, D), 0.02, 0.04);
  for (const tile of layout.tiles) {
    if (tile.kind === 'room') floorBox(tile.x, tile.z, tile.w, tile.d, floorMat(tile.floor, tile.color, tile.w, tile.d), 0.03, 0.06);
  }
  for (const tile of layout.tiles) {
    if (tile.kind === 'rug') floorBox(tile.x, tile.z, tile.w, tile.d, floorMat(tile.floor, tile.color, tile.w, tile.d), 0.065, 0.03);
    else if (tile.kind === 'zone') {
      const color = mixColor(TEAM_COLORS[tile.colorIndex % TEAM_COLORS.length], 0xffffff, night ? 0.4 : 0.42);
      floorBox(tile.x, tile.z, tile.w - 0.05, tile.d - 0.05, floorMat('carpet', color, tile.w, tile.d), 0.065, 0.03);
    }
  }

  // ---------- Tường ngoài: tường kính sau và trái (nhìn thấy), lan can thấp phải và trước (cắt bớt cho camera nhìn vào) ----------
  const cream = tint(0xf6f0e8, 0x58526b);
  const frame = tint(0xdcd3c8, 0x7a7494);
  const cap = tint(0x4a4560, 0x2b2840);
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
  const entrance = layout.entrance;
  if (entrance) {
    const gapL = entrance.x - 1.3;
    const gapR = entrance.x + 1.3;
    parapet((walls.minX + gapL) / 2, walls.maxZ, gapL - walls.minX, 0);
    parapet((gapR + walls.maxX) / 2, walls.maxZ, walls.maxX - gapR, 0);
    // cửa vào: khung kính và mái che nhỏ
    for (const dx of [-1.3, 1.3]) rbox(scene, 0.12, 2.8, 0.2, frame, entrance.x + dx, 1.4, walls.maxZ, 0.04);
    rbox(scene, 3.4, 0.2, 0.7, cream, entrance.x, 2.85, walls.maxZ + 0.2, 0.06);
    rbox(scene, 2.4, 0.03, 1.0, tint(0x6b7385, 0x3a384a), entrance.x, 0.1, walls.maxZ + 0.7, 0.01);
  } else parapet(midX, walls.maxZ, W, 0);
  for (const [px, pz, h] of [[walls.minX, walls.minZ, 3.8], [walls.maxX, walls.minZ, 3.8], [walls.minX, walls.maxZ, 1.1], [walls.maxX, walls.maxZ, 1.1]] as const) rbox(scene, 0.5, h, 0.5, cream, px, h / 2, pz, 0.12);

  // ---------- Tường trong: tường đặc thấp (nhìn như mặt cắt nhà búp bê), tường kính ở phòng họp, thư viện, phòng Giám đốc ----------
  const roomGlass = track(new THREE.MeshStandardMaterial({ color: night ? 0x8e9de0 : 0xcfeaf6, transparent: true, opacity: night ? 0.14 : 0.2, roughness: 0.08, depthWrite: false }));
  const roomFrame = tint(0xe9e2d8, 0x8b86a6);
  const SOLID_H = 1.15;
  const GLASS_TOP = 2.3;
  const T = WALL_T;
  const innerWall = (seg: Wall) => {
    const horizontal = seg.z0 === seg.z1;
    const len = horizontal ? Math.abs(seg.x1 - seg.x0) : Math.abs(seg.z1 - seg.z0);
    if (len < 0.05) return;
    const g = new THREE.Group();
    g.position.set((seg.x0 + seg.x1) / 2, 0.06, (seg.z0 + seg.z1) / 2);
    g.rotation.y = horizontal ? 0 : Math.PI / 2;
    scene.add(g);
    if (seg.kind === 'solid') {
      rbox(g, len, SOLID_H, T, cream, 0, SOLID_H / 2, 0, 0.03);
      rbox(g, len + 0.02, 0.05, T + 0.05, cap, 0, SOLID_H + 0.02, 0, 0.015);
      return;
    }
    rbox(g, len, 0.55, T, cream, 0, 0.275, 0, 0.03);
    const pane = new THREE.Mesh(track(new THREE.BoxGeometry(len, GLASS_TOP - 0.55, 0.04)), roomGlass);
    pane.position.set(0, 0.55 + (GLASS_TOP - 0.55) / 2, 0);
    g.add(pane);
    rbox(g, len + 0.02, 0.07, T + 0.04, roomFrame, 0, GLASS_TOP, 0, 0.025);
    const n = Math.max(Math.round(len / 2.4), 1);
    for (let i = 0; i <= n; i += 1) rbox(g, 0.05, GLASS_TOP - 0.55, T + 0.01, roomFrame, -len / 2 + (len * i) / n, 0.55 + (GLASS_TOP - 0.55) / 2, 0, 0.02);
  };
  for (const seg of layout.wallSegs) if (seg.kind !== 'outer') innerWall(seg);

  // Cửa: hai cột khung và cánh cửa mở hé vào trong phòng (đúng kiểu mặt bằng mẫu).
  const doorWood = tint(0xc99a6a, 0x7a5c44);
  for (const door of layout.doors) {
    if (door.kind === 'glass') continue;
    const into = door.z < 0 ? -1 : 1; // phòng phía trên mở về -z, phòng phía dưới mở về +z
    for (const dx of [-door.w / 2, door.w / 2]) rbox(scene, 0.1, SOLID_H + 0.2, T + 0.06, cap, door.x + dx, 0.06 + (SOLID_H + 0.2) / 2, door.z, 0.02);
    const hinge = new THREE.Group();
    hinge.position.set(door.x - door.w / 2 + 0.05, 0.06, door.z);
    hinge.rotation.y = into * 1.25;
    scene.add(hinge);
    rbox(hinge, door.w - 0.14, 0.95, 0.04, doorWood, (door.w - 0.14) / 2, 0.5, 0, 0.012);
    rbox(hinge, 0.04, 0.04, 0.07, 0xd6c27a, door.w - 0.28, 0.5, 0, 0.01);
  }

  const sign = (text: string, dot: string | null, x: number, y: number, z: number, scale = 0.85) => {
    const p = pill(text, scale);
    p.paint(text, dot, 'dark');
    p.sprite.position.set(x, y, z);
    scene.add(p.sprite);
    return p;
  };

  // Nhãn từng phòng: gần cửa của phòng (hoặc giữa phòng nếu không có cửa).
  const dotOf: Record<string, string> = {
    library: '#f5a742', stairs: '#94a3b8', server: '#4cf08a', pantry: '#f0a44b', wc: '#6cc4c4', meeting1: '#5b9bd5', meeting2: '#5b9bd5',
    director: '#8c7ae6', focus: '#8c7ae6', owner: '#f2c14e', archive: '#94a3b8', lobby: '#6cc4c4',
  };
  for (const tile of layout.tiles) {
    if (tile.kind !== 'room' || !dotOf[tile.id]) continue;
    const door = layout.doors.find((d) => d.room === tile.id && d.kind === 'door');
    const z = door ? door.z + (door.z < 0 ? -1 : 1) * 1.0 : tile.id === 'pantry' ? tile.z + tile.d / 2 - 0.9 : tile.z + (tile.id === 'lobby' ? 0.5 : 0);
    const label = tile.id === 'stairs' && layout.floorCount > 1 ? `Cầu thang · ${layout.floorCount} tầng` : tile.label;
    sign(label, dotOf[tile.id], door ? door.x : tile.x, 2.9, z, tile.id === 'wc' ? 0.7 : 0.85);
  }
  for (const zone of layout.zones) sign(`${zone.name}${zone.lead ? ` · ${zone.lead}` : ''}`, hex(TEAM_COLORS[zone.colorIndex % TEAM_COLORS.length]), zone.x, 2.7, zone.z + zone.d / 2 - 0.2, 0.95);
  sign(`Tầng ${layout.floor + 1}${layout.floorCount > 1 ? ` / ${layout.floorCount}` : ''}`, '#8c7ae6', midX, 4.6, walls.minZ, 1.1);
  for (const pod of layout.pods) {
    const zone = layout.zones.find((z) => z.id === pod.zoneId);
    const color = TEAM_COLORS[(zone?.colorIndex ?? 0) % TEAM_COLORS.length];
    rbox(scene, 4.4, 0.34, 0.05, tint(0xdfe6f0, 0x6a7088), pod.x, 1.03, pod.z, 0.02);
    rbox(scene, 4.5, 0.03, 0.07, color, pod.x, 1.22, pod.z, 0.015);
  }
  const rest = layout.rooms.find((r) => r.id === 'rest');
  const loungeSign = pill('Khu nghỉ', 1.0);
  loungeSign.paint('Khu nghỉ', '#e86f8f', 'dark');
  loungeSign.sprite.position.set(rest ? rest.x : 0, 2.7, rest ? rest.z - rest.d / 2 + 1.0 : 0);
  scene.add(loungeSign.sprite);

  // ---------- Đồ đạc ----------
  const animators: ((t: number) => void)[] = [];
  const furnitureOf = new Map<string, THREE.Group>();
  for (const o of layout.furniture) {
    const f = furniture3d(kit, scene, o);
    furnitureOf.set(o.id, f.group);
    if (f.animate) animators.push(f.animate);
  }

  // ---------- Đồ trang trí treo tường và dẹt trên sàn ----------
  const tvMats: THREE.MeshStandardMaterial[] = [];
  const clockHands: { hour: THREE.Mesh; minute: THREE.Mesh; second: THREE.Mesh }[] = [];
  const decorate = (d: Decor) => {
    if (d.kind === 'logo') {
      const logo = pill('My Company', 1.1);
      logo.paint('My Company', '#8c7ae6', 'dark');
      logo.sprite.position.set(d.x, d.y, d.z);
      scene.add(logo.sprite);
      return;
    }
    const g = new THREE.Group();
    g.position.set(d.x, d.y, d.z);
    g.rotation.y = d.facing;
    scene.add(g);
    if (d.kind === 'frame') {
      rbox(g, d.w, d.h, 0.05, 0xf4efe8, 0, 0, 0.03, 0.015);
      rbox(g, d.w - 0.1, d.h - 0.1, 0.055, d.color, 0, 0, 0.035, 0.01);
      rbox(g, (d.w - 0.1) * 0.5, (d.h - 0.1) * 0.35, 0.06, mixColor(d.color, 0xffffff, 0.45), -0.06, 0.04, 0.04, 0.01);
    } else if (d.kind === 'tv') {
      rbox(g, d.w, d.h, 0.06, 0x20242f, 0, 0, 0.04, 0.02);
      const m = track(new THREE.MeshStandardMaterial({ color: 0x151a26, emissive: 0x6fb7e8, emissiveIntensity: 0.05, roughness: 0.25 }));
      tvMats.push(m);
      const screen = new THREE.Mesh(track(new THREE.PlaneGeometry(d.w - 0.1, d.h - 0.1)), m);
      screen.position.set(0, 0, 0.075);
      g.add(screen);
    } else if (d.kind === 'board') {
      rbox(g, d.w, d.h, 0.05, 0x8a94a8, 0, 0, 0.03, 0.015);
      rbox(g, d.w - 0.08, d.h - 0.08, 0.055, 0xfafbfd, 0, 0, 0.035, 0.01);
      rbox(g, d.w * 0.5, 0.025, 0.06, 0xa8b2c4, -d.w * 0.12, d.h * 0.2, 0.04, 0.005);
      rbox(g, d.w * 0.25, 0.18, 0.06, d.color, d.w * 0.22, -d.h * 0.12, 0.04, 0.01);
    } else if (d.kind === 'clock') {
      const face = cylinder(g, d.w / 2, 0.06, 0xfffdf5, 0, 0, 0.03, 32);
      face.rotation.x = Math.PI / 2;
      const rim = cylinder(g, d.w / 2 + 0.03, 0.05, cap, 0, 0, 0.02, 32);
      rim.rotation.x = Math.PI / 2;
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        rbox(g, 0.025, i % 3 === 0 ? 0.08 : 0.04, 0.012, 0x2a2540, Math.sin(a) * d.w * 0.4, Math.cos(a) * d.w * 0.4, 0.066, 0.004).rotation.z = -a;
      }
      const hand = (len: number, w: number, color: number, z: number) => {
        const pivot = new THREE.Group();
        pivot.position.set(0, 0, z);
        g.add(pivot);
        const m = rbox(pivot, w, len, 0.012, color, 0, len / 2 - 0.02, 0, 0.004);
        return { pivot, m };
      };
      const h = hand(d.w * 0.26, 0.03, 0x2a2540, 0.07);
      const mi = hand(d.w * 0.38, 0.022, 0x2a2540, 0.075);
      const se = hand(d.w * 0.42, 0.01, 0xd6313f, 0.08);
      clockHands.push({ hour: h.pivot as unknown as THREE.Mesh, minute: mi.pivot as unknown as THREE.Mesh, second: se.pivot as unknown as THREE.Mesh });
    } else if (d.kind === 'mat') {
      rbox(g, d.w, 0.025, d.h, d.color, 0, 0, 0, 0.008);
      rbox(g, d.w - 0.2, 0.03, d.h - 0.2, mixColor(d.color, 0xffffff, 0.15), 0, 0, 0, 0.008);
    }
  };
  for (const d of layout.decor) decorate(d);

  // ---------- Bàn và nhân vật của Chủ (tầng 1) ----------
  let beacon: THREE.Mesh | null = null;
  let ownerRig: ReturnType<typeof createChibi> | null = null;
  if (layout.floor === 0 && layout.rooms.some((r) => r.id === 'owner')) {
    const owner = createChibi(lookFor('Chủ', '#f2c14e', { crown: true, director: false }), kit);
    owner.root.position.set(layout.owner.x, 0.06, layout.owner.z);
    owner.root.rotation.y = 0;
    owner.setPose({ action: 'type', seated: true, t: 0, phase: 1, motion: false });
    scene.add(owner.root);
    ownerRig = owner;
    beacon = new THREE.Mesh(track(new THREE.SphereGeometry(0.2, 14, 12)), track(new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xfacc15, emissiveIntensity: 1 })));
    beacon.position.set(layout.owner.x, 2.5, layout.owner.z + 0.3);
    beacon.visible = false;
    scene.add(beacon);
  }

  // ---------- Bảng của Giám đốc: các mảnh giấy hiện dần khi lập kế hoạch ----------
  const boardNotes: THREE.Mesh[] = [];
  const board = layout.furniture.find((o) => o.id === 'director-board');
  if (board) {
    layout.zones.slice(0, 4).forEach((zone, i) => {
      const note = rbox(scene, 0.34, 0.26, 0.03, TEAM_COLORS[zone.colorIndex % TEAM_COLORS.length], board.x - 0.55 + i * 0.37, 1.5, board.z + 0.1, 0.012);
      note.visible = false;
      boardNotes.push(note);
    });
  }

  // ---------- Hơi nước từ máy pha cà phê ----------
  const steam: THREE.Mesh[] = [];
  const steamMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
  for (let i = 0; i < 4; i += 1) {
    const puff = new THREE.Mesh(track(new THREE.SphereGeometry(0.07, 8, 6)), steamMat);
    puff.visible = false;
    scene.add(puff);
    steam.push(puff);
  }

  const tick = (t: number, state: WorldState): boolean => {
    for (const fn of animators) fn(t);
    const now = new Date();
    const sec = now.getSeconds() + now.getMilliseconds() / 1000;
    const min = now.getMinutes() + sec / 60;
    const hr = (now.getHours() % 12) + min / 60;
    for (const c of clockHands) {
      c.second.rotation.z = -(sec / 60) * Math.PI * 2;
      c.minute.rotation.z = -(min / 60) * Math.PI * 2;
      c.hour.rotation.z = -(hr / 12) * Math.PI * 2;
    }
    for (const m of tvMats) {
      m.emissiveIntensity = state.meeting ? 0.55 + 0.25 * Math.sin(t * 0.8) : 0.05;
      m.emissive.setHex(state.meeting ? ([0x6fb7e8, 0x9b8cf0, 0x6fd6a8][Math.floor(t / 4) % 3]) : 0x6fb7e8);
    }
    steam.forEach((puff, i) => {
      puff.visible = state.pantry;
      if (!state.pantry) return;
      const k = (t * 0.55 + i * 0.25) % 1;
      puff.position.set(layout.coffee.x - 0.5 + 0.05 * Math.sin(t * 2 + i), 1.5 + k * 0.7, layout.coffee.z + 0.15);
      puff.scale.setScalar(0.6 + k * 1.2);
    });
    // Còn động: kim giây, đèn nhấp nháy... đều rất nhẹ; chỉ cần vẽ lại mỗi giây một lần nên không ép vòng lặp chạy liên tục.
    return state.pantry || state.meeting;
  };

  return { loungeSign, beacon, boardNotes, keyLight, ownerRig, tick };
}
