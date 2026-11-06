import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createChibi, type Chibi } from './chibi';
import { deskSet, LAMP_IDLE, PILE_MAX, type DeskSet } from './furniture3d';
import { CABINET, OWNER, type Flow, type FlowKind } from './flow';
import { createKit, type PillSprite } from './kit';
import { TEAM_COLORS, type OfficeLayout } from './layout';
import { lookFor } from './look';
import type { OfficeScene, SceneDebug, SceneOptions } from './scene-types';
import { OfficeSim, type Actor } from './sim';
import { bubbleOf, formatCountdown, IDLE_VIEW, lampOf, type Lamp, type PersonView } from './status';
import { buildWorld } from './world3d';

/** Bộ vẽ 3D isometric: camera trực giao nhìn chéo từ góc trước phải, nhân vật chibi, đồ bo tròn, bóng đổ mềm. */

const LAMP_COLOR: Record<Lamp, number> = {
  needs_you: 0xfacc15, overload: 0xf97316, working: 0x22c55e, waiting: 0x3b82f6, queued: 0xf59e0b, failed: 0xef4444, idle: LAMP_IDLE,
};
const PAPER_COLOR: Record<FlowKind, number> = { assign: 0xfffbeb, report: 0x93c5fd, return: 0xf87171, file: 0x86efac, ask: 0xfde047, reply: 0xc4b5fd };
const FRAME_MS = 33;
const ELEVATION = 36; // độ cao camera so với mặt phẳng ngang (độ)
const AZIMUTH = 45; // nhìn chéo từ góc trước phải

interface Visual {
  actor: Actor;
  rig: Chibi;
  desk: DeskSet;
  deskGroup: THREE.Group;
  tag: PillSprite;
  bubble: PillSprite;
  bubbleText: string;
  ring: THREE.Mesh;
  sweat: THREE.Mesh[];
  lampMat: THREE.MeshStandardMaterial;
}

interface Paper {
  mesh: THREE.Mesh;
  a: THREE.Vector3;
  b: THREE.Vector3;
  t0: number;
  dur: number;
  arc: number;
  kind: FlowKind;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  age: number;
  life: number;
}

/** Dựng toàn bộ văn phòng trong `host`. Ném lỗi nếu trình duyệt không có WebGL (người gọi bắt và hiện danh sách thay thế). */
export function createIsoScene(host: HTMLElement, layout: OfficeLayout, options: SceneOptions): OfficeScene {
  const motion = !options.reducedMotion;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping; // giữ màu pastel, không làm nhợt như ACES
  renderer.toneMappingExposure = options.dark ? 1.0 : 1.0;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const kit = createKit(scene, options.dark);
  const { track, mat, pill } = kit;
  const world = buildWorld(kit, layout, renderer);
  const sim = new OfficeSim(layout, motion);

  // ---------- Camera isometric ----------
  const { walls } = layout;
  const center = new THREE.Vector3((walls.minX + walls.maxX) / 2, 0, (walls.minZ + walls.maxZ) / 2);
  const camera = new THREE.OrthographicCamera(-20, 20, 12, -12, 0.1, 600);
  const dir = new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(AZIMUTH)) * Math.cos(THREE.MathUtils.degToRad(ELEVATION)), Math.sin(THREE.MathUtils.degToRad(ELEVATION)), Math.cos(THREE.MathUtils.degToRad(AZIMUTH)) * Math.cos(THREE.MathUtils.degToRad(ELEVATION)));
  camera.position.copy(center).addScaledVector(dir, 140);
  camera.lookAt(center);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.enableRotate = false;
  controls.enableDamping = false;
  controls.screenSpacePanning = true;
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.minZoom = 0.6;
  controls.maxZoom = 8;
  controls.zoomToCursor = true;
  controls.update();

  let userMoved = false;
  controls.addEventListener('start', () => {
    userMoved = true;
  });
  let halfH = 12;
  const frameCamera = (aspect: number) => {
    camera.updateMatrixWorld();
    const inv = camera.matrixWorldInverse;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const pad = 0.8;
    for (const x of [walls.minX - pad, walls.maxX + pad]) for (const z of [walls.minZ - pad, walls.maxZ + pad]) for (const y of [-0.3, 4]) {
      const v = new THREE.Vector3(x, y, z).applyMatrix4(inv);
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
    const w = maxX - minX;
    const h = maxY - minY;
    halfH = Math.max(h / 2, w / 2 / aspect) * 1.02;
    const cy = (minY + maxY) / 2;
    const cx = (minX + maxX) / 2;
    camera.top = cy + halfH;
    camera.bottom = cy - halfH;
    camera.left = cx - halfH * aspect;
    camera.right = cx + halfH * aspect;
    camera.zoom = 1;
    camera.updateProjectionMatrix();
  };

  // ---------- Nhân vật và bàn ----------
  const visuals: Visual[] = [];
  const sweatGeometry = track(new THREE.SphereGeometry(0.045, 8, 6));
  const sweatMaterial = track(new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.9 }));
  const pickables: THREE.Object3D[] = [];
  for (const actor of sim.actors) {
    const spot = actor.spot;
    const teamColor = TEAM_COLORS[spot.colorIndex % TEAM_COLORS.length];
    const shirt = `#${teamColor.toString(16).padStart(6, '0')}`;
    const look = lookFor(spot.name, shirt, { crown: spot.isLead, director: spot.isDirector });
    const desk = deskSet(kit, spot.colorIndex, true);
    const deskGroup = desk.group;
    deskGroup.position.set(spot.x, 0.06, spot.z);
    deskGroup.rotation.y = spot.facing;
    deskGroup.userData.personName = spot.name;
    scene.add(deskGroup);
    const rig = createChibi(look, kit);
    rig.root.userData.personName = spot.name;
    rig.root.scale.setScalar(1.28); // chibi to hơn một chút để đọc được từ xa
    scene.add(rig.root);
    pickables.push(deskGroup, rig.root);

    const tag = pill(spot.name, 0.62);
    tag.paint(spot.name, `#${LAMP_COLOR.idle.toString(16)}`, 'dark');
    tag.sprite.position.set(0, rig.top + 0.55, 0);
    rig.root.add(tag.sprite);
    const bubble = pill('', 0.55);
    bubble.sprite.position.set(0, rig.top + 1.05, 0);
    bubble.sprite.visible = false;
    rig.root.add(bubble.sprite);
    const ring = new THREE.Mesh(track(new THREE.RingGeometry(0.55, 0.7, 32)), track(new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    ring.visible = false;
    rig.root.add(ring);
    const sweat: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i += 1) {
      const drop = new THREE.Mesh(sweatGeometry, sweatMaterial);
      drop.visible = false;
      rig.root.add(drop);
      sweat.push(drop);
    }
    visuals.push({ actor, rig, desk, deskGroup, tag, bubble, bubbleText: '', ring, sweat, lampMat: desk.lamp.material as THREE.MeshStandardMaterial });
  }

  // ---------- Giấy tờ bay và hiệu ứng ----------
  const papers: Paper[] = [];
  const particles: Particle[] = [];
  const paperGeometry = track(new THREE.BoxGeometry(0.5, 0.03, 0.36));
  const sparkGeometry = track(new THREE.SphereGeometry(0.07, 8, 6));
  const anchor = (name: string): THREE.Vector3 | null => {
    if (name === OWNER) return new THREE.Vector3(layout.owner.x, 1.2, layout.owner.z + 0.4);
    if (name === CABINET) return new THREE.Vector3(layout.cabinet.x, 1.6, layout.cabinet.z + 0.35);
    const v = visuals.find((x) => x.actor.spot.name === name);
    return v ? new THREE.Vector3(v.actor.spot.deskX, 1.05, v.actor.spot.deskZ) : null;
  };
  const burst = (at: THREE.Vector3, color: number, count = 7) => {
    if (!motion) return;
    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(sparkGeometry, mat(color));
      mesh.position.copy(at);
      scene.add(mesh);
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      particles.push({ mesh, vel: new THREE.Vector3(Math.cos(a) * 1.1, 1.8 + Math.random() * 0.8, Math.sin(a) * 1.1), age: 0, life: 0.75 });
    }
  };

  // ---------- Tương tác ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const personAt = (event: PointerEvent): string | null => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, true);
    for (const hit of hits) {
      if (hit.object instanceof THREE.Sprite) continue;
      let node: THREE.Object3D | null = hit.object;
      while (node) {
        if (typeof node.userData.personName === 'string') return node.userData.personName as string;
        node = node.parent;
      }
    }
    return null;
  };

  let dirty = true;
  let busy = true;
  let nextWake = 0;
  const invalidate = () => {
    dirty = true;
  };
  const wake = () => {
    busy = true;
  };
  controls.addEventListener('change', invalidate);
  let down: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved < 5) options.onSelect(personAt(e));
  };
  const onMove = (e: PointerEvent) => {
    if (down) return;
    renderer.domElement.style.cursor = personAt(e) ? 'pointer' : 'grab';
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointermove', onMove);

  const resize = () => {
    const w = Math.max(host.clientWidth, 1);
    const h = Math.max(host.clientHeight, 1);
    renderer.setSize(w, h, false);
    if (!userMoved) frameCamera(w / h);
    else {
      const cy = (camera.top + camera.bottom) / 2;
      const cx = (camera.left + camera.right) / 2;
      camera.left = cx - halfH * (w / h);
      camera.right = cx + halfH * (w / h);
      camera.top = cy + halfH;
      camera.bottom = cy - halfH;
      camera.updateProjectionMatrix();
    }
    invalidate();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  // ---------- Trạng thái ----------
  let ownerWaiting = 0;
  let signText = 'Khu nghỉ';
  let breakTimer: ReturnType<typeof setInterval> | null = null;
  const paintSign = () => {
    if (sim.onBreak() && sim.breakUntil !== null) {
      signText = `Nghỉ giải lao · còn ${formatCountdown(sim.breakUntil - Date.now())}`;
      world.loungeSign.paint(signText, '#f2b705', 'warn');
    } else {
      signText = 'Khu nghỉ';
      world.loungeSign.paint('Khu nghỉ', '#e86f8f', 'dark');
    }
    invalidate();
  };
  const dotOf = (view: PersonView) => `#${LAMP_COLOR[lampOf(view)].toString(16).padStart(6, '0')}`;
  const applyView = (v: Visual, view: PersonView) => {
    const lamp = lampOf(view);
    v.lampMat.color.setHex(LAMP_COLOR[lamp]);
    v.lampMat.emissive.setHex(LAMP_COLOR[lamp]);
    v.desk.pile.forEach((sheet, i) => {
      sheet.visible = i < Math.min(view.queued, PILE_MAX);
    });
    v.tag.paint(v.actor.spot.name, dotOf(view), 'dark');
    const text = bubbleOf(view);
    if (text !== v.bubbleText) {
      v.bubbleText = text;
      v.bubble.sprite.visible = text !== '';
      if (text) v.bubble.paint(text, null, view.needsYou || view.failed ? 'warn' : 'light');
    }
  };

  // ---------- Vòng cập nhật ----------
  let last = 0;
  const update = (ts: number): boolean => {
    const dt = last === 0 ? 0 : Math.min((ts - last) / 1000, 0.1);
    let stillBusy = sim.step(ts, Date.now());
    nextWake = sim.nextWake;
    const t = ts / 1000;
    let someoneAtBoard = false;
    let boardSince = Infinity;
    for (const v of visuals) {
      const a = v.actor;
      const seated = sim.seated(a);
      v.rig.root.visible = !sim.hidden(a);
      v.rig.root.position.set(a.x, seated ? 0.06 : 0.06, a.z);
      v.rig.root.rotation.y = a.heading;
      v.rig.setPose({ action: sim.actionOf(a), seated, t, phase: a.phase, motion });
      v.sweat.forEach((drop, i) => {
        drop.visible = a.view.overload;
        if (!a.view.overload) return;
        const phase = motion ? (t * 0.9 + i * 0.37) % 1 : i * 0.3;
        drop.position.set((i - 1) * 0.3, v.rig.top - 0.1 - phase * 0.35, 0.18);
        drop.scale.setScalar(1 - phase * 0.4);
      });
      const lamp = lampOf(a.view);
      const pulse = lamp === 'needs_you' || lamp === 'overload';
      const wave = pulse ? 0.5 + 0.5 * Math.sin(t * (lamp === 'needs_you' ? 6 : 9)) : 0;
      v.lampMat.emissiveIntensity = pulse && motion ? 0.5 + wave * 1.6 : 0.9;
      if (pulse && motion) stillBusy = true;
      if (a.place === 'whiteboard' && !a.walking) {
        someoneAtBoard = true;
        boardSince = Math.min(boardSince, a.arrivedAt);
      }
    }
    const shown = someoneAtBoard ? (motion ? Math.min(world.boardNotes.length, Math.floor((ts - boardSince) / 900) + 1) : world.boardNotes.length) : 0;
    world.boardNotes.forEach((note, i) => {
      note.visible = i < shown;
    });
    if (someoneAtBoard && shown < world.boardNotes.length) stillBusy = true;

    if (world.beacon) {
      world.beacon.visible = ownerWaiting > 0;
      if (ownerWaiting > 0) {
        const wave = 0.5 + 0.5 * Math.sin(t * 5);
        (world.beacon.material as THREE.MeshStandardMaterial).emissiveIntensity = motion ? 0.5 + wave * 1.5 : 1.2;
        world.beacon.scale.setScalar(motion ? 1 + wave * 0.45 : 1);
        if (motion) stillBusy = true;
      }
    }
    for (let i = papers.length - 1; i >= 0; i -= 1) {
      const paper = papers[i];
      const u = Math.min((ts - paper.t0) / paper.dur, 1);
      const e = u * u * (3 - 2 * u);
      paper.mesh.position.lerpVectors(paper.a, paper.b, e);
      paper.mesh.position.y += Math.sin(Math.PI * e) * paper.arc;
      paper.mesh.rotation.y += dt * 2.2;
      if (paper.kind === 'file') paper.mesh.scale.setScalar(u > 0.8 ? Math.max(1 - (u - 0.8) / 0.2, 0.05) : 1);
      if (u >= 1) {
        burst(paper.b, PAPER_COLOR[paper.kind], paper.kind === 'file' ? 9 : 5);
        scene.remove(paper.mesh);
        papers.splice(i, 1);
      }
    }
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const part = particles[i];
      part.age += dt;
      part.vel.y -= 5 * dt;
      part.mesh.position.addScaledVector(part.vel, dt);
      part.mesh.scale.setScalar(Math.max(1 - part.age / part.life, 0.01));
      if (part.age >= part.life) {
        scene.remove(part.mesh);
        particles.splice(i, 1);
      }
    }
    if (papers.length > 0 || particles.length > 0) stillBusy = true;
    return stillBusy;
  };

  let frame = 0;
  const tick = (ts: number) => {
    frame = requestAnimationFrame(tick);
    if (!busy && !dirty && ts < nextWake) return;
    if (!dirty && ts - last < FRAME_MS) return;
    busy = update(ts);
    last = ts;
    dirty = false;
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(tick);

  const screenPos = (v: Visual) => {
    const p = new THREE.Vector3(v.actor.x, 1.6, v.actor.z).project(camera);
    return { x: (p.x * 0.5 + 0.5) * host.clientWidth, y: (-p.y * 0.5 + 0.5) * host.clientHeight };
  };

  return {
    setViews(views) {
      sim.setViews(views);
      for (const v of visuals) applyView(v, views[v.actor.spot.name] ?? IDLE_VIEW);
      nextWake = 0;
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
          nextWake = 0;
          wake();
          if (!sim.onBreak() && breakTimer) {
            clearInterval(breakTimer);
            breakTimer = null;
            sim.breakUntil = null;
          }
        }, 1000);
      }
      paintSign();
      nextWake = 0;
      wake();
    },
    setOwnerWaiting(count) {
      ownerWaiting = count;
      wake();
      invalidate();
    },
    sendFlow(flow: Flow) {
      const a = anchor(flow.from);
      const b = anchor(flow.to);
      if (!a || !b) return;
      if (!motion) {
        invalidate();
        return;
      }
      const mesh = new THREE.Mesh(paperGeometry, mat(PAPER_COLOR[flow.kind]));
      mesh.position.copy(a);
      mesh.castShadow = true;
      scene.add(mesh);
      const dist = a.distanceTo(b);
      papers.push({ mesh, a, b, t0: performance.now(), dur: Math.min(Math.max((dist / 6) * 1000, 1100), 3200), arc: 1.0 + dist * 0.06, kind: flow.kind });
      wake();
    },
    select(name) {
      for (const v of visuals) v.ring.visible = v.actor.spot.name === name;
      invalidate();
    },
    screenPositions() {
      camera.updateMatrixWorld();
      const out: Record<string, { x: number; y: number }> = {};
      for (const v of visuals) out[v.actor.spot.name] = screenPos(v);
      return out;
    },
    debug(): SceneDebug {
      const out: SceneDebug['people'] = {};
      for (const v of visuals) {
        const a = v.actor;
        out[a.spot.name] = {
          place: a.place, dest: a.dest, walking: a.walking, x: Number(a.x.toFixed(2)), z: Number(a.z.toFixed(2)), seated: sim.seated(a),
          bubble: v.bubbleText, pile: v.desk.pile.filter((s) => s.visible).length, lamp: lampOf(a.view), idle: a.idlePlace, anim: a.anim, facing: Number(a.heading.toFixed(2)),
        };
      }
      return { people: out, papers: papers.length, onBreak: sim.onBreak(), beacon: Boolean(world.beacon?.visible), sign: signText };
    },
    dispose() {
      cancelAnimationFrame(frame);
      if (breakTimer) clearInterval(breakTimer);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointermove', onMove);
      kit.dispose();
      scene.environment?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
