import * as THREE from 'three';
import type { Look } from './look.ts';
import type { Action } from './sim.ts';

/** Nhân vật chibi 3D: đầu to tròn, thân nhỏ, tay chân là các viên thuốc (capsule). Cao khoảng 1,55 m, gốc ở sàn, nhìn về +z. */

export interface PoseInput {
  action: Action;
  seated: boolean;
  /** Thời gian (giây) để dao động; phase lệch pha riêng của từng người. */
  t: number;
  phase: number;
  motion: boolean;
}

export interface Chibi {
  root: THREE.Group;
  /** Điểm trên đỉnh đầu để gắn thẻ tên. */
  top: number;
  setPose: (p: PoseInput) => void;
}

interface Kit {
  mat: (color: number) => THREE.MeshStandardMaterial;
  track: <T extends { dispose: () => void }>(item: T) => T;
}

const hexNum = (s: string) => parseInt(s.slice(1), 16);

export function createChibi(look: Look, kit: Kit): Chibi {
  const { mat, track } = kit;
  const root = new THREE.Group();
  const skin = hexNum(look.skin);
  const mesh = (geometry: THREE.BufferGeometry, color: number, parent: THREE.Object3D, x = 0, y = 0, z = 0, cast = true): THREE.Mesh => {
    const m: THREE.Mesh = new THREE.Mesh(track(geometry), mat(color));
    m.position.set(x, y, z);
    m.castShadow = cast;
    parent.add(m);
    return m;
  };

  const body = new THREE.Group(); // nâng lên khi ngồi
  root.add(body);

  // ---------- chân ----------
  const legs: THREE.Group[] = [];
  for (const dx of [-0.1, 0.1]) {
    const hip = new THREE.Group();
    hip.position.set(dx, 0.4, 0);
    mesh(new THREE.CapsuleGeometry(0.078, 0.2, 4, 10), hexNum(look.pants), hip, 0, -0.17, 0);
    const shoe = mesh(new THREE.SphereGeometry(0.09, 12, 10), 0x2f2a3d, hip, 0, -0.35, 0.035);
    shoe.scale.set(1, 0.62, 1.45);
    body.add(hip);
    legs.push(hip);
  }

  // ---------- thân ----------
  const torso = mesh(new THREE.CapsuleGeometry(0.2, 0.2, 6, 16), hexNum(look.shirt), body, 0, 0.68, 0);
  torso.scale.set(1, 1, 0.9);
  const collar = mesh(new THREE.TorusGeometry(0.1, 0.028, 8, 16), 0xf4f1ec, body, 0, 0.96, 0.02);
  collar.rotation.x = Math.PI / 2;
  if (look.tie) {
    mesh(new THREE.BoxGeometry(0.07, 0.24, 0.03), 0xd6313f, body, 0, 0.78, 0.182);
    mesh(new THREE.BoxGeometry(0.1, 0.05, 0.03), 0xf4f1ec, body, 0, 0.93, 0.18);
  }

  // ---------- tay ----------
  const arms: THREE.Group[] = [];
  for (const dx of [-0.25, 0.25]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(dx, 0.86, 0);
    mesh(new THREE.CapsuleGeometry(0.066, 0.2, 4, 10), hexNum(look.shirt), shoulder, 0, -0.16, 0);
    mesh(new THREE.SphereGeometry(0.072, 12, 10), skin, shoulder, 0, -0.35, 0);
    body.add(shoulder);
    arms.push(shoulder);
  }
  const cup = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.1, 12), 0xf6f3ee, cup, 0, 0, 0, false);
  mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.01, 12), 0x7a4b2a, cup, 0, 0.045, 0, false);
  cup.position.set(0, -0.37, 0.07);
  cup.visible = false;
  arms[1].add(cup);
  const book = new THREE.Group();
  mesh(new THREE.BoxGeometry(0.3, 0.2, 0.03), 0x8a5a35, book, 0, 0, 0, false);
  mesh(new THREE.BoxGeometry(0.27, 0.18, 0.035), 0xf4eede, book, 0, 0, 0.004, false);
  book.position.set(0, 0.72, 0.26);
  book.rotation.x = -0.35;
  book.visible = false;
  body.add(book);

  // ---------- đầu ----------
  const head = new THREE.Group();
  head.position.set(0, 1.24, 0);
  body.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.3, 28, 20), skin, head);
  skull.scale.set(1, 0.96, 0.98);
  // tóc: mũ trùm đỉnh và gáy, mái ngang trán
  const hairColor = hexNum(look.hair);
  const cap = mesh(new THREE.SphereGeometry(0.322, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.62), hairColor, head, 0, 0.0, -0.025);
  cap.rotation.x = -0.28;
  const fringe = mesh(new THREE.SphereGeometry(0.17, 16, 12), hairColor, head, 0, 0.17, 0.2);
  fringe.scale.set(1.5, 0.55, 0.7);
  if (look.style === 1) {
    mesh(new THREE.CapsuleGeometry(0.19, 0.26, 6, 14), hairColor, head, 0, -0.12, -0.19);
    for (const dx of [-0.27, 0.27]) mesh(new THREE.CapsuleGeometry(0.06, 0.2, 4, 8), hairColor, head, dx, -0.08, -0.04);
  } else if (look.style === 2) {
    mesh(new THREE.SphereGeometry(0.11, 14, 12), hairColor, head, 0, 0.36, -0.1);
  } else {
    for (const dx of [-0.27, 0.27]) mesh(new THREE.SphereGeometry(0.07, 10, 8), hairColor, head, dx, 0.04, -0.02);
  }
  // mặt: mắt, má hồng, miệng
  for (const dx of [-0.105, 0.105]) {
    mesh(new THREE.SphereGeometry(0.042, 12, 10), 0x231c2e, head, dx, -0.01, 0.272, false).scale.set(1, 1.25, 0.6);
    mesh(new THREE.SphereGeometry(0.013, 8, 6), 0xffffff, head, dx + 0.012, 0.012, 0.292, false);
    const cheek = mesh(new THREE.CircleGeometry(0.045, 12), 0xf59aa6, head, dx * 1.5, -0.08, 0.262, false);
    (cheek as THREE.Mesh).material = track(new THREE.MeshBasicMaterial({ color: 0xf59aa6, transparent: true, opacity: 0.55 }));
  }
  mesh(new THREE.BoxGeometry(0.06, 0.014, 0.01), 0x8a4a4a, head, 0, -0.1, 0.285, false);
  if (look.glasses) {
    for (const dx of [-0.105, 0.105]) {
      const ring = mesh(new THREE.TorusGeometry(0.065, 0.008, 6, 20), 0x2a2538, head, dx, -0.01, 0.285, false);
      ring.rotation.y = 0;
    }
    mesh(new THREE.BoxGeometry(0.06, 0.008, 0.008), 0x2a2538, head, 0, -0.005, 0.292, false);
  }
  if (look.crown) {
    const crown = mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.1, 5, 1, true), 0xf5c542, head, 0, 0.35, -0.02);
    crown.material = track(new THREE.MeshStandardMaterial({ color: 0xf5c542, emissive: 0xb98a10, emissiveIntensity: 0.35, side: THREE.DoubleSide, roughness: 0.5 }));
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      mesh(new THREE.SphereGeometry(0.03, 8, 6), 0xffe08a, head, Math.sin(a) * 0.15, 0.42, Math.cos(a) * 0.15 - 0.02, false);
    }
  }

  const setPose = ({ action, seated, t, phase, motion }: PoseInput) => {
    const osc = (speed: number, shift = 0) => (motion ? Math.sin(t * speed + phase + shift) : 0);
    let legL = 0;
    let legR = 0;
    let armL = 0.04;
    let armR = 0.04;
    let armSpread = 0.1;
    let bob = 0;
    let headYaw = 0;
    let headPitch = 0;
    let lean = 0;
    cup.visible = false;
    book.visible = false;

    switch (action) {
      case 'walk': {
        const swing = osc(9);
        legL = swing * 0.75;
        legR = -swing * 0.75;
        armL = -swing * 0.6;
        armR = swing * 0.6;
        bob = Math.abs(osc(9)) * 0.035;
        break;
      }
      case 'wave':
        armR = -Math.PI + 0.35 + osc(6) * 0.4;
        armSpread = 0.1;
        headPitch = -0.1;
        break;
      case 'scratch':
        armR = -2.7 + osc(9) * 0.18;
        headYaw = osc(4) * 0.15;
        break;
      case 'sip':
      case 'coffee':
        armR = -2.1 + osc(1.4) * 0.12;
        cup.visible = true;
        headPitch = -0.12;
        if (action === 'coffee') armL = 0.3;
        break;
      case 'stretch': {
        const k = 0.5 + 0.5 * Math.sin(t * 1.6 + phase);
        armL = -2.9 - k * 0.2;
        armR = -2.9 - k * 0.2;
        armSpread = 0.35;
        headPitch = -0.2 * k;
        lean = -0.12 * k;
        break;
      }
      case 'look':
        headYaw = osc(1.8) * 0.8;
        break;
      case 'window':
        armL = -0.5;
        armR = -0.5;
        headPitch = -0.1;
        break;
      case 'talk':
        armR = -1.1 + osc(3.1) * 0.5;
        armL = -0.5 + osc(2.3, 1) * 0.3;
        headYaw = osc(1.2) * 0.25;
        headPitch = osc(2.6) * 0.08;
        break;
      case 'read':
        armL = -1.25;
        armR = -1.25;
        book.visible = true;
        headPitch = 0.22;
        break;
      case 'run':
        armL = -1.15 + osc(12) * 0.12;
        armR = -1.15 - osc(12) * 0.12;
        headPitch = 0.1;
        break;
      case 'write':
        armR = -2.4 + osc(5) * 0.3;
        armL = -0.2;
        break;
      case 'sway':
        armL = osc(1.4) * 0.2;
        armR = -osc(1.4) * 0.2;
        lean = osc(1.1) * 0.05;
        break;
      case 'type':
        armL = -1.2 + osc(13) * 0.08;
        armR = -1.2 - osc(13) * 0.08;
        headPitch = 0.12;
        break;
      default:
        armL = -0.35;
        armR = -0.35;
    }

    if (seated) {
      legL = -1.45;
      legR = -1.45;
      body.position.y = 0.1;
      if (action === 'rest') {
        armL = -0.9;
        armR = -0.9;
      }
    } else {
      body.position.y = bob;
    }
    legs[0].rotation.x = legL;
    legs[1].rotation.x = legR;
    arms[0].rotation.x = armL;
    arms[1].rotation.x = armR;
    arms[0].rotation.z = armSpread;
    arms[1].rotation.z = -armSpread;
    head.rotation.set(headPitch, headYaw, 0);
    body.rotation.x = lean;
  };

  return { root, top: 1.62, setPose };
}
