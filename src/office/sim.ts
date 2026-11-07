/**
 * Bộ mô phỏng văn phòng: ai đang ở đâu, đi đâu, làm gì. Không dính tới hình vẽ nên chạy và kiểm thử được bằng Node với
 * đồng hồ giả. Bộ vẽ (pixel.ts) chỉ đọc kết quả. Import có đuôi `.ts` để Node chạy thẳng được trong bài kiểm thử.
 */
import { planPath, standSpot, type Pt } from './flow.ts';
import type { OfficeLayout, PersonSpot } from './layout';
import { IDLE_VIEW, placeOf, type PersonView, type Place } from './status.ts';

export type IdleAnim = 'none' | 'sip' | 'stretch' | 'look';

/** Động tác đang làm, để bộ vẽ chọn hình. */
export type Action =
  | 'walk' | 'wave' | 'scratch' | 'sip' | 'stretch' | 'look' | 'coffee' | 'window' | 'talk'
  | 'read' | 'run' | 'write' | 'sway' | 'type' | 'rest';

export interface Actor {
  spot: PersonSpot;
  /** Vị trí hiện tại (mét). */
  x: number;
  z: number;
  /** Hướng nhìn (radian): 0 là về +z (xuống màn hình), π là về -z (lên), π/2 sang phải, -π/2 sang trái. */
  heading: number;
  view: PersonView;
  place: Place;
  dest: Place;
  wanted: Place;
  wantedAt: number;
  slot: number;
  path: Pt[];
  walking: boolean;
  arrivedAt: number;
  face: number;
  phase: number;
  /** Hoạt động lúc rảnh: nơi đang đi tới hoặc ở (null là ngồi ở bàn), giờ muốn làm việc kế tiếp, giờ về bàn, động tác tại bàn. */
  idlePlace: Place | null;
  idleNextAt: number;
  idleUntil: number;
  anim: IdleAnim;
  animUntil: number;
  rng: number;
}

export const WALK_SPEED = 3.2; // mét mỗi giây
export const DWELL_DESK_MS = 1200; // ngồi ở bàn tối thiểu bấy lâu mới đứng dậy đi (tránh chạy qua chạy lại)
export const DWELL_AWAY_MS = 3500; // ở thư viện, phòng server... tối thiểu bấy lâu mới đi tiếp
export const WANT_STABLE_MS = 2500; // động tác (đọc code, chạy lệnh, lập kế hoạch) phải kéo dài bấy lâu mới đứng dậy đi
export const MAX_OUT_RATIO = 0.4; // không để quá 40% số người cùng ra ngoài lúc rảnh

const IDLE_PLACES: { place: Place; weight: number }[] = [
  { place: 'pantry', weight: 34 }, { place: 'window', weight: 14 }, { place: 'meeting', weight: 14 },
  { place: 'wc', weight: 12 }, { place: 'library', weight: 12 }, { place: 'lounge', weight: 14 },
];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** Hướng (xuống, lên, trái, phải) gần nhất với góc nhìn. */
export function dirOf(heading: number): 'down' | 'up' | 'left' | 'right' {
  const s = Math.sin(heading);
  const c = Math.cos(heading);
  if (Math.abs(s) > Math.abs(c)) return s > 0 ? 'right' : 'left';
  return c >= 0 ? 'down' : 'up';
}

export class OfficeSim {
  readonly layout: OfficeLayout;
  readonly actors: Actor[];
  readonly motion: boolean;
  breakUntil: number | null = null;
  /** Văn phòng yên thì ngủ tới giờ này (hẹn giờ hoạt động lúc rảnh). */
  nextWake = 0;
  private last = 0;

  constructor(layout: OfficeLayout, motion = true) {
    this.layout = layout;
    this.motion = motion;
    this.actors = layout.people.map((spot) => {
      const h = hash(spot.name);
      return {
        spot, x: spot.x, z: spot.z, heading: spot.facing, view: IDLE_VIEW, place: 'desk', dest: 'desk', wanted: 'desk', wantedAt: 0, slot: 0,
        path: [], walking: false, arrivedAt: -Infinity, face: spot.facing, phase: (h % 628) / 100,
        idlePlace: null, idleNextAt: 0, idleUntil: 0, anim: 'none', animUntil: 0, rng: (h % 2147483647) + 1,
      };
    });
  }

  setViews(views: Record<string, PersonView>) {
    for (const a of this.actors) a.view = views[a.spot.name] ?? IDLE_VIEW;
    this.nextWake = 0;
  }

  setBreak(until: number | null, now = Date.now()) {
    this.breakUntil = until !== null && until > now ? until : null;
    this.nextWake = 0;
  }

  onBreak(now = Date.now()): boolean {
    return this.breakUntil !== null && this.breakUntil > now;
  }

  seated(a: Actor): boolean {
    return a.place === 'desk' && !a.walking;
  }

  /** Người đang ở trong WC (cửa đóng) thì không hiện. */
  hidden(a: Actor): boolean {
    return a.place === 'wc' && !a.walking;
  }

  actionOf(a: Actor): Action {
    const v = a.view;
    const seated = this.seated(a);
    if (a.walking) return 'walk';
    if (v.needsYou) return 'wave';
    if (v.failed && seated) return 'scratch';
    if (seated && a.anim === 'sip') return 'sip';
    if (seated && a.anim === 'stretch') return 'stretch';
    if (seated && a.anim === 'look') return 'look';
    if (a.place === 'pantry') return 'coffee';
    if (a.place === 'window') return 'window';
    if (a.place === 'meeting') return 'talk';
    if (a.place === 'library') return 'read';
    if (a.place === 'server') return 'run';
    if (a.place === 'whiteboard') return 'write';
    if (a.place === 'lounge') return 'sway';
    if (v.activity !== 'idle' && v.activity !== 'waiting') return 'type';
    return 'rest';
  }

  private freeSlot(a: Actor, place: Place): number {
    if (place === 'lounge') return this.actors.indexOf(a);
    const used = new Set(this.actors.filter((o) => o !== a && o.dest === place).map((o) => o.slot));
    let slot = 0;
    while (used.has(slot)) slot += 1;
    return slot;
  }

  private startWalk(a: Actor, want: Place, ts: number) {
    const slot = this.freeSlot(a, want);
    const stand = standSpot(this.layout, a.spot, want, slot);
    a.slot = slot;
    a.dest = want;
    a.face = stand.face;
    if (!this.motion) {
      a.x = stand.x;
      a.z = stand.z;
      a.heading = stand.face;
      a.place = want;
      a.arrivedAt = ts;
      return;
    }
    const route = planPath(this.layout, a.spot, a.place, { x: a.x, z: a.z }, want, stand);
    a.path = route.slice(1);
    a.walking = a.path.length > 0;
    if (!a.walking) {
      a.place = want;
      a.arrivedAt = ts;
    }
  }

  private advance(a: Actor, dt: number, ts: number) {
    let left = WALK_SPEED * dt;
    while (left > 0 && a.path.length > 0) {
      const next = a.path[0];
      const dx = next.x - a.x;
      const dz = next.z - a.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-6) a.heading = Math.atan2(dx, dz);
      if (dist <= left) {
        a.x = next.x;
        a.z = next.z;
        left -= dist;
        a.path.shift();
      } else {
        a.x += (dx / dist) * left;
        a.z += (dz / dist) * left;
        left = 0;
      }
    }
    if (a.path.length === 0) {
      a.walking = false;
      a.place = a.dest;
      a.arrivedAt = ts;
      a.heading = a.face;
    }
  }

  private maxOut(): number {
    return Math.max(1, Math.floor(this.actors.length * MAX_OUT_RATIO));
  }

  /**
   * Một bước mô phỏng tới thời điểm `ts` (mili giây, đồng hồ của người gọi; `now` là giờ thật để tính hết hạn mức).
   * Trả về true nếu còn thứ gì đang động (người đi, động tác tại bàn...) nên cần gọi tiếp liền; false thì chỉ cần gọi lại
   * khi tới `nextWake` hoặc khi dữ liệu đổi.
   */
  step(ts: number, now = Date.now()): boolean {
    // Khung hình chậm (máy yếu) thì đi bù, đường đi vẫn đi qua đúng các điểm đã kiểm chứng. Nhiều bên cùng bước một bộ mô phỏng
    // (bộ vẽ đang mở và bộ đếm nền khi chuyển 2D/3D hay sang tầng khác) nên thời gian không bao giờ lùi.
    const dt = this.last === 0 ? 0 : Math.min(Math.max((ts - this.last) / 1000, 0), 0.5);
    this.last = Math.max(ts, this.last);
    const breaking = this.onBreak(now);
    let busy = false;
    let wakeAt = Infinity;

    for (const a of this.actors) {
      const rand = (): number => {
        a.rng = (Math.imul(a.rng, 1664525) + 1013904223) >>> 0;
        return a.rng / 4294967296;
      };
      // ---- Rảnh thì không ngồi yên: vươn vai, nhấp cà phê, nhìn quanh, đi pha cà phê, ngắm cửa sổ, họp đứng... ----
      const idleNow = this.motion && !breaking && !a.view.needsYou && !a.view.failed && (a.view.status === 'idle' || a.view.status === 'waiting');
      if (!idleNow) {
        a.idlePlace = null;
        a.anim = 'none';
        a.idleNextAt = 0;
        a.idleUntil = 0;
      } else {
        if (a.idleNextAt === 0) a.idleNextAt = ts + 2000 + rand() * 12000;
        if (a.anim !== 'none' && ts >= a.animUntil) {
          a.anim = 'none';
          a.idleNextAt = ts + 6000 + rand() * 14000;
        }
        if (a.idlePlace === null && a.anim === 'none' && a.place === 'desk' && !a.walking && ts >= a.idleNextAt) {
          const out = this.actors.filter((o) => o.idlePlace !== null).length;
          const roll = rand();
          if (roll < 0.5 && out < this.maxOut()) {
            let pick = rand() * IDLE_PLACES.reduce((n, x) => n + x.weight, 0);
            a.idlePlace = (IDLE_PLACES.find((x) => (pick -= x.weight) < 0) ?? IDLE_PLACES[0]).place;
            a.idleUntil = 0;
          } else {
            a.anim = roll < 0.65 ? 'sip' : roll < 0.82 ? 'stretch' : 'look';
            a.animUntil = ts + 3500 + rand() * 3000;
          }
        }
        if (a.idlePlace !== null && a.place === a.idlePlace && !a.walking) {
          if (a.idleUntil === 0) a.idleUntil = ts + 7000 + rand() * 9000;
          if (ts >= a.idleUntil) {
            a.idlePlace = null;
            a.idleUntil = 0;
            a.idleNextAt = ts + 10000 + rand() * 15000;
          }
        }
        if (!a.walking) {
          if (a.idlePlace === null && a.anim === 'none') wakeAt = Math.min(wakeAt, a.idleNextAt);
          else if (a.idlePlace !== null && a.place === a.idlePlace) wakeAt = Math.min(wakeAt, a.idleUntil || ts + 200);
        }
      }

      if (!a.walking) {
        const base = placeOf(a.view, a.spot.isDirector, breaking);
        const want = base !== 'desk' ? base : (a.idlePlace ?? 'desk');
        if (want !== a.wanted) {
          a.wanted = want;
          a.wantedAt = ts;
        }
        if (want !== a.dest || want !== a.place) {
          busy = true;
          const dwell = breaking ? 0 : a.place === 'desk' ? DWELL_DESK_MS : DWELL_AWAY_MS;
          const stable = breaking || want === 'desk' || (a.idlePlace !== null && want === a.idlePlace) || ts - a.wantedAt >= WANT_STABLE_MS;
          if (want !== a.place && stable && ts - a.arrivedAt >= dwell) this.startWalk(a, want, ts);
        }
      }
      if (a.walking) {
        this.advance(a, dt, ts);
        busy = true;
      }
      if (this.motion && this.actionOf(a) !== 'rest') busy = true;
      if (a.view.overload || a.view.needsYou) busy = busy || this.motion;
    }
    this.nextWake = wakeAt;
    return busy;
  }
}
