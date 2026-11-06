import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Bộ đồ nghề dựng cảnh dùng chung: vật liệu có nhớ, hình hộp, nhãn chữ, ô sàn bo góc, bóng đổ giả. Mọi thứ tạo ra đều được theo dõi để giải phóng. */

export interface PillSprite {
  sprite: THREE.Sprite;
  paint: (text: string, dot?: string | null, tone?: 'dark' | 'light' | 'warn' | 'bad') => void;
}

export interface Kit {
  dark: boolean;
  scene: THREE.Scene;
  track: <T extends { dispose: () => void }>(item: T) => T;
  mat: (color: number) => THREE.MeshStandardMaterial;
  box: (parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number) => THREE.Mesh;
  /** Khối hộp bo tròn các cạnh (nhìn mềm và "đắt" hơn khối hộp thường). */
  rbox: (parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, radius?: number) => THREE.Mesh;
  /** Nhãn dạng viên thuốc tối bo tròn kèm chấm màu trạng thái (như trong app mẫu). */
  pill: (text: string, scale?: number) => PillSprite;
  /** Hình trụ đứng (chậu cây, chân ghế, cốc...). */
  cylinder: (parent: THREE.Object3D, r: number, h: number, color: number, x: number, y: number, z: number, segments?: number) => THREE.Mesh;
  dispose: () => void;
}

/** Pha trộn hai màu: t = 0 là a, t = 1 là b. */
export function mixColor(a: number, b: number, t: number): number {
  const ca = new THREE.Color(a);
  return ca.lerp(new THREE.Color(b), t).getHex();
}

export function createKit(scene: THREE.Scene, dark: boolean): Kit {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const materials = new Map<number, THREE.MeshStandardMaterial>();
  const mat = (color: number): THREE.MeshStandardMaterial => {
    let m = materials.get(color);
    if (!m) {
      m = track(new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.02 }));
      materials.set(color, m);
    }
    return m;
  };
  const box: Kit['box'] = (parent, w, h, d, color, x, y, z) => {
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), mat(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const rbox: Kit['rbox'] = (parent, w, h, d, color, x, y, z, radius = 0.04) => {
    const r = Math.min(radius, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    const mesh = new THREE.Mesh(track(new RoundedBoxGeometry(w, h, d, 3, Math.max(r, 0.002))), mat(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const pill: Kit['pill'] = (text, scale = 1) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const texture = track(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })));
    sprite.renderOrder = 10;
    const paint: PillSprite['paint'] = (label, dot = null, tone = 'dark') => {
      const g = canvas.getContext('2d');
      if (!g) return;
      g.clearRect(0, 0, 512, 96);
      g.font = '700 44px system-ui, "Segoe UI", sans-serif';
      const tw = Math.min(g.measureText(label).width, 440);
      const w = tw + 56 + (dot ? 46 : 0);
      const x = (512 - w) / 2;
      g.fillStyle = tone === 'light' ? 'rgba(255,255,255,0.96)' : tone === 'warn' ? 'rgba(250,204,21,0.97)' : tone === 'bad' ? 'rgba(239,68,68,0.96)' : 'rgba(30,26,44,0.92)';
      g.beginPath();
      g.roundRect(x, 12, w, 72, 36);
      g.fill();
      g.strokeStyle = tone === 'light' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.16)';
      g.lineWidth = 3;
      g.stroke();
      let tx = x + 28;
      if (dot) {
        g.fillStyle = dot;
        g.beginPath();
        g.arc(x + 44, 48, 13, 0, Math.PI * 2);
        g.fill();
        tx += 46;
      }
      g.fillStyle = tone === 'dark' ? '#f4f1fa' : '#1c1730';
      g.textBaseline = 'middle';
      g.fillText(label, tx, 50, 440);
      texture.needsUpdate = true;
    };
    sprite.scale.set(3.2 * scale, 0.6 * scale, 1);
    paint(text);
    return { sprite, paint };
  };
  const cylinder: Kit['cylinder'] = (parent, r, h, color, x, y, z, segments = 12) => {
    const mesh = new THREE.Mesh(track(new THREE.CylinderGeometry(r, r, h, segments)), mat(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  return {
    dark, scene, track, mat, box, rbox, pill, cylinder,
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}
