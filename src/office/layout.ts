/**
 * Bố cục văn phòng 3D (mục 5 của KE-HOACH.md): một tầng văn phòng thật đủ chức năng. Hàm thuần: nhận danh sách team từ
 * /api/state và trả về vị trí của mọi thứ, nên kiểm thử được mà không cần WebGL. File này chỉ dùng cú pháp TypeScript
 * "xóa được" (không enum, không tham số thuộc tính) để Node chạy thẳng được trong bài kiểm thử.
 *
 * Hệ tọa độ (mét): trục x sang phải, trục z hướng về phía camera, y hướng lên. Nhân vật ngồi hàng bắc (z nhỏ) quay mặt về
 * +z, hàng nam quay mặt về -z (đối mặt nhau qua bàn).
 *
 *   dải sau:   [Chủ][Giám đốc][Họp 1][Họp 2][Thư viện][Server][Hồ sơ]     ← phòng kính, cửa mở ra lối đi sau
 *   ─ lối đi sau (aisleBackZ) ───────────────────────────────────────────
 *   giữa:      không gian làm việc mở: mỗi team một khu thảm màu, cụm bàn đối mặt, góc họp có bảng trắng
 *   ─ lối đi trước (aisleFrontZ) ────────────────────────────────────────
 *   dải trước: [WC][Pantry][Khu nghỉ (sofa)               ][Sảnh lễ tân + cửa vào]
 *
 * Người đi bộ đi trên mạng lối đi: hai lối ngang (sau và trước) và các lối dọc (hai bên và giữa các khu team). Từ chỗ
 * ngồi, ra lối đi theo hướng lưng ghế quay về; từ phòng, ra lối đi qua cửa.
 */
import type { Member, TeamSummary } from '../lib/types';

export const POD_W = 4.6; // bề ngang một cụm bàn (hai bàn rộng 2,2 m cạnh nhau)
export const POD_GAP = 1.4; // khe giữa hai cụm cạnh nhau trong một khu
export const SEAT_DX = 1.2; // chỗ ngồi lệch tâm cụm sang trái/phải
export const SEAT_DZ = 1.7; // chỗ ngồi lệch tâm cụm lên bắc/xuống nam (hai hàng bàn sát nhau ở giữa)
export const COLLAB_W = 3.4; // góc họp của team (bảng trắng đứng và bàn tròn)
export const ZONE_MARGIN = 1.0; // lề hai bên khu team (lối đi dọc nằm ở ranh giữa hai khu)
export const SEATS_PER_POD = 4;
export const WORK_Z0 = -7; // mép sau của không gian làm việc
export const WORK_Z1 = 2.5; // mép trước
export const POD_Z = -2.2; // tâm các cụm bàn
export const AISLE_BACK_Z = -5.6;
export const AISLE_FRONT_Z = 1.2;
export const BACK_Z0 = -13; // mép sau của dải phòng phía sau
export const FRONT_Z1 = 8; // mép trước của dải phía trước
export const SIDE_COL = 2.4; // cột lối đi hai bên ngoài các dải
export const MIN_ROW_W = 35; // bề rộng tối thiểu: đủ cho bảy phòng ở dải sau và các khu ở dải trước
export const TEAM_COLORS = [0x3b82f6, 0x10b981, 0xf59e0b, 0xa855f7, 0xef4444, 0x06b6d4] as const;

export interface PersonSpot {
  name: string;
  role: string;
  title: string;
  model: string;
  isLead: boolean;
  isDirector: boolean;
  teamId: string;
  teamName: string;
  colorIndex: number;
  x: number;
  z: number;
  /** Hướng nhìn (radian quanh trục y): 0 là nhìn về +z (hàng bắc), π là nhìn về -z (hàng nam). */
  facing: number;
  deskX: number;
  deskZ: number;
}

export interface Zone {
  id: string;
  name: string;
  lead: string | null;
  colorIndex: number;
  x: number;
  z: number;
  w: number;
  d: number;
}

export type RoomId =
  | 'owner' | 'director' | 'meeting1' | 'meeting2' | 'library' | 'server' | 'archive'
  | 'wc' | 'pantry' | 'rest' | 'lobby';

export interface RoomBox {
  id: RoomId;
  label: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

export type TileKind = 'zone' | 'room';

/** Một khu của tầng: khu làm việc của team, hoặc một phòng/khu chức năng. Cảnh dựng sàn, tường và cửa từ đây. */
export interface Tile {
  id: string;
  kind: TileKind;
  label: string;
  x: number;
  z: number;
  w: number;
  d: number;
  /** Chỉ số màu team, hoặc -1 nếu không thuộc team nào. */
  colorIndex: number;
  /** 'glass' tường kính, 'solid' tường kín, 'none' khu mở. */
  walls: 'glass' | 'solid' | 'none';
  /** Cửa: khoảng x (so với tâm khu) trên mặt tường có cửa; null nếu không có tường. */
  door: { from: number; to: number } | null;
  /** Cửa ở tường trước (nam) hay tường sau (bắc) của khu. */
  doorSide: 'front' | 'back';
}

export type ObstacleKind = 'plant' | 'sofa' | 'counter' | 'table' | 'cabinet' | 'desk' | 'easel' | 'cooler' | 'fridge' | 'reception' | 'rack';

/** Đồ đạc người đi bộ phải tránh (hình chữ nhật, nửa chiều rộng hw và nửa chiều sâu hd quanh tâm). */
export interface Obstacle {
  id: string;
  kind: ObstacleKind;
  x: number;
  z: number;
  hw: number;
  hd: number;
  /** Hướng của đồ (bàn trống: 0 hoặc π). */
  facing?: number;
}

export interface OfficeLayout {
  /** Rộng cả tòa nhà, gồm hai cột lối đi hai bên. */
  width: number;
  /** Đối xứng quanh z = 0, đủ phủ mọi thứ (kiểm thử dùng để chắc không ai ra ngoài). */
  depth: number;
  /** Mép sau và mép trước của sàn. */
  bounds: { minZ: number; maxZ: number };
  /** Ranh giới tòa nhà: tường kính ở mặt sau và hai bên, mặt trước để mở cho camera nhìn vào. */
  walls: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Bề rộng của các dải (không tính hai cột lối đi hai bên). */
  gridWidth: number;
  tiles: Tile[];
  furniture: Obstacle[];
  /** Tâm các cụm bàn (bốn bàn đối mặt nhau) của từng khu team. */
  pods: { zoneId: string; x: number; z: number }[];
  zones: Zone[];
  /** Mọi phòng và khu chức năng (không gồm khu team). */
  rooms: RoomBox[];
  /** Khu nghỉ: cả công ty ra đây khi hết hạn mức Pro. */
  lounge: { x: number; z: number; w: number; d: number };
  /** Điểm tờ giấy bay tới khi vào tủ hồ sơ (phòng Hồ sơ). */
  cabinet: { x: number; z: number };
  /** Hai lối đi ngang nhân vật đi dọc: phía sau và phía trước không gian làm việc. */
  aisleBackZ: number;
  aisleFrontZ: number;
  /** Các lối đi dọc nối hai lối ngang: hai bên tòa nhà và ranh giữa các khu team (x tăng dần). */
  lanes: number[];
  people: PersonSpot[];
  owner: { x: number; z: number };
}

const isDirector = (m: Member) => m.role === 'director';

function spot(m: Member, team: TeamSummary, colorIndex: number, x: number, z: number, facing: number): PersonSpot {
  return {
    name: m.name,
    role: m.role,
    title: m.title,
    model: m.model,
    isLead: m.isLead,
    isDirector: isDirector(m),
    teamId: team.id,
    teamName: team.name,
    colorIndex,
    x,
    z,
    facing,
    deskX: x,
    deskZ: z + 1.15 * Math.cos(facing),
  };
}

interface RoomSpec {
  id: RoomId;
  label: string;
  min: number;
  flex: number;
  door: Tile['door'];
  doorSide: Tile['doorSide'];
  walls: Tile['walls'];
}

const DOOR_CENTER = { from: -0.8, to: 0.8 };

export function layoutOffice(teams: TeamSummary[]): OfficeLayout {
  const directors = teams.filter((t) => t.members.some(isDirector));
  const workTeams = teams.filter((t) => !t.members.some(isDirector) && t.members.length > 0);

  // ---------- Dải sau: bảy phòng kính (sáu nếu không có Giám đốc), cửa mở ra lối đi sau ----------
  const backSpecs: RoomSpec[] = [
    { id: 'owner', label: 'Chủ', min: 4.2, flex: 0, door: DOOR_CENTER, doorSide: 'front', walls: 'glass' },
    ...(directors.length > 0 ? [{ id: 'director' as RoomId, label: 'Phòng Giám đốc', min: 5.6, flex: 1, door: { from: 1.1, to: 2.7 }, doorSide: 'front' as const, walls: 'glass' as const }] : []),
    { id: 'meeting1', label: 'Phòng họp 1', min: 5.4, flex: 1, door: DOOR_CENTER, doorSide: 'front', walls: 'glass' },
    { id: 'meeting2', label: 'Phòng họp 2', min: 5.4, flex: 1, door: DOOR_CENTER, doorSide: 'front', walls: 'glass' },
    { id: 'library', label: 'Thư viện', min: 5.6, flex: 1, door: DOOR_CENTER, doorSide: 'front', walls: 'glass' },
    { id: 'server', label: 'Phòng server', min: 4.4, flex: 0, door: DOOR_CENTER, doorSide: 'front', walls: 'glass' },
    { id: 'archive', label: 'Hồ sơ', min: 4.2, flex: 0, door: DOOR_CENTER, doorSide: 'front', walls: 'glass' },
  ];
  const backMin = backSpecs.reduce((n, s) => n + s.min, 0);

  // ---------- Giữa: mỗi team một khu; số cụm bàn theo số người (bốn chỗ một cụm) ----------
  const podsOf = (t: TeamSummary) => Math.max(Math.ceil(t.members.length / SEATS_PER_POD), 1);
  const zoneBase = workTeams.map((t) => podsOf(t) * POD_W + (podsOf(t) - 1) * POD_GAP + COLLAB_W + 2 * ZONE_MARGIN);
  const natural = zoneBase.reduce((a, b) => a + b, 0);
  const rowWidth = Math.max(natural, backMin, MIN_ROW_W);
  const left = -rowWidth / 2;
  const width = rowWidth + 2 * SIDE_COL;
  const zoneExtra = workTeams.length > 0 ? (rowWidth - natural) / workTeams.length : 0;

  const tiles: Tile[] = [];
  const zones: Zone[] = [];
  const people: PersonSpot[] = [];
  const furniture: Obstacle[] = [];
  const pods: { zoneId: string; x: number; z: number }[] = [];
  const plant = (id: string, px: number, pz: number) => furniture.push({ id, kind: 'plant', x: px, z: pz, hw: 0.4, hd: 0.4 });
  const zoneZ = (WORK_Z0 + WORK_Z1) / 2;
  const zoneD = WORK_Z1 - WORK_Z0;
  const sideLane = rowWidth / 2 + SIDE_COL / 2 - 0.1; // lối đi dọc hai bên, nằm giữa tường và các dải
  const lanes: number[] = [-sideLane];

  let cursor = left;
  workTeams.forEach((team, index) => {
    const zw = zoneBase[index] + zoneExtra;
    const cx = cursor + zw / 2;
    zones.push({ id: team.id, name: team.name, lead: team.lead, colorIndex: index, x: cx, z: zoneZ, w: zw, d: zoneD });
    tiles.push({ id: team.id, kind: 'zone', label: team.name, x: cx, z: zoneZ, w: zw, d: zoneD, colorIndex: index, walls: 'none', door: null, doorSide: 'front' });

    // Chỗ ngồi: Trưởng nhóm trước, rồi nhân viên. Mỗi cụm bốn chỗ: bắc-trái, bắc-phải (quay mặt về +z), nam-trái, nam-phải (quay mặt về -z).
    const ordered = [...team.members.filter((m) => m.isLead), ...team.members.filter((m) => !m.isLead)];
    const podCount = podsOf(team);
    const podsBlock = podCount * POD_W + (podCount - 1) * POD_GAP;
    const podLeft = cursor + ZONE_MARGIN;
    const podCenter = (k: number) => podLeft + POD_W / 2 + k * (POD_W + POD_GAP);
    for (let k = 0; k < podCount; k += 1) pods.push({ zoneId: team.id, x: podCenter(k), z: POD_Z });
    ordered.forEach((m, i) => {
      const pod = Math.floor(i / SEATS_PER_POD);
      const seat = i % SEATS_PER_POD;
      const north = seat < 2;
      const sx = podCenter(pod) + (seat % 2 === 0 ? -SEAT_DX : SEAT_DX);
      people.push(spot(m, team, index, sx, POD_Z + (north ? -SEAT_DZ : SEAT_DZ), north ? 0 : Math.PI));
    });
    // Bàn trống ở các chỗ chưa có người (cụm nào cũng đủ bốn bàn).
    for (let pod = 0; pod < podCount; pod += 1) {
      for (let seat = 0; seat < SEATS_PER_POD; seat += 1) {
        if (pod * SEATS_PER_POD + seat < ordered.length) continue;
        const north = seat < 2;
        const facing = north ? 0 : Math.PI;
        const sx = podCenter(pod) + (seat % 2 === 0 ? -SEAT_DX : SEAT_DX);
        const sz = POD_Z + (north ? -SEAT_DZ : SEAT_DZ);
        furniture.push({ id: `desk-${team.id}-${pod}-${seat}`, kind: 'desk', x: sx, z: sz + 1.15 * Math.cos(facing), hw: 1.1, hd: 0.55, facing });
      }
    }
    // Góc họp: bảng trắng đứng và bàn tròn thấp, ở phần còn lại của khu.
    const collabX = podLeft + podsBlock + (cursor + zw - ZONE_MARGIN - (podLeft + podsBlock)) / 2;
    furniture.push({ id: `easel-${team.id}`, kind: 'easel', x: collabX, z: POD_Z - 1.7, hw: 0.9, hd: 0.2 });
    furniture.push({ id: `collab-table-${team.id}`, kind: 'table', x: collabX - 0.3, z: POD_Z + 0.5, hw: 0.55, hd: 0.55 });
    plant(`plant-zone-${team.id}`, collabX + 1.1, POD_Z + 0.9);
    cursor += zw;
    if (index < workTeams.length - 1) lanes.push(cursor); // lối đi dọc ở ranh giữa hai khu team
  });
  lanes.push(sideLane);

  // ---------- Dải sau: tính bề rộng, chia phần dư cho các phòng co giãn ----------
  const flexTotal = backSpecs.reduce((n, s) => n + s.flex, 0);
  const backExtra = rowWidth - backMin;
  const rooms: RoomBox[] = [];
  let rx = left;
  const backD = WORK_Z0 - BACK_Z0;
  const backZ = (WORK_Z0 + BACK_Z0) / 2;
  for (const spec of backSpecs) {
    const w = spec.min + (flexTotal > 0 ? (backExtra * spec.flex) / flexTotal : 0);
    const room: RoomBox = { id: spec.id, label: spec.label, x: rx + w / 2, z: backZ, w, d: backD };
    rooms.push(room);
    tiles.push({ id: spec.id, kind: 'room', label: spec.label, x: room.x, z: room.z, w, d: backD, colorIndex: -1, walls: spec.walls, door: spec.door, doorSide: spec.doorSide });
    rx += w;
  }
  const byId = (id: RoomId) => rooms.find((r) => r.id === id) as RoomBox;
  directors.forEach((team) => {
    const room = byId('director');
    team.members.filter(isDirector).forEach((m, i) => people.push(spot(m, team, 7, room.x - 0.6 + i * 3.4, backZ - 0.6, 0)));
  });

  // ---------- Dải trước: WC, pantry, khu nghỉ, sảnh lễ tân ----------
  const frontD = FRONT_Z1 - WORK_Z1;
  const frontZ = (FRONT_Z1 + WORK_Z1) / 2;
  const wcW = 4.4;
  const pantryW = 6.4;
  const lobbyW = 9;
  const restW = rowWidth - wcW - pantryW - lobbyW;
  let fx = left;
  const addFront = (id: RoomId, label: string, w: number, tile: Pick<Tile, 'walls' | 'door' | 'doorSide'>): RoomBox => {
    const room: RoomBox = { id, label, x: fx + w / 2, z: frontZ, w, d: frontD };
    rooms.push(room);
    tiles.push({ id, kind: 'room', label, x: room.x, z: room.z, w, d: frontD, colorIndex: -1, ...tile });
    fx += w;
    return room;
  };
  addFront('wc', 'WC', wcW, { walls: 'solid', door: DOOR_CENTER, doorSide: 'back' });
  const pantry = addFront('pantry', 'Pantry', pantryW, { walls: 'none', door: null, doorSide: 'front' });
  const rest = addFront('rest', 'Khu nghỉ', restW, { walls: 'none', door: null, doorSide: 'front' });
  const lobby = addFront('lobby', 'Sảnh lễ tân', lobbyW, { walls: 'none', door: null, doorSide: 'front' });

  // Đồ đạc dải trước. Giữ trống các cột đứng ở chỗ nhân vật đứng để họ đi thẳng lên lối đi trước.
  const south = (r: RoomBox, off: number) => r.z + r.d / 2 - off;
  furniture.push({ id: 'pantry-counter', kind: 'counter', x: pantry.x + 0.2, z: south(pantry, 0.55), hw: (pantry.w - 3.2) / 2, hd: 0.4 });
  furniture.push({ id: 'pantry-cooler', kind: 'cooler', x: pantry.x - pantry.w / 2 + 0.7, z: south(pantry, 0.6), hw: 0.3, hd: 0.3 });
  furniture.push({ id: 'pantry-fridge', kind: 'fridge', x: pantry.x + pantry.w / 2 - 0.6, z: south(pantry, 0.6), hw: 0.45, hd: 0.4 });
  for (const side of [-1, 1]) {
    furniture.push({ id: `rest-sofa-${side}`, kind: 'sofa', x: rest.x + side * (rest.w / 2 - 1.5), z: south(rest, 0.7), hw: 1.1, hd: 0.5 });
    furniture.push({ id: `rest-table-${side}`, kind: 'table', x: rest.x + side * (rest.w / 2 - 1.5), z: south(rest, 1.9), hw: 0.45, hd: 0.45 });
  }
  furniture.push({ id: 'reception', kind: 'reception', x: lobby.x, z: lobby.z - 0.5, hw: 1.6, hd: 0.45 });
  furniture.push({ id: 'lobby-sofa', kind: 'sofa', x: lobby.x + lobby.w / 2 - 1.5, z: south(lobby, 0.9), hw: 1.1, hd: 0.5 });
  plant('plant-lobby-left', lobby.x - lobby.w / 2 + 0.7, south(lobby, 0.6));
  plant('plant-lobby-right', lobby.x + lobby.w / 2 - 0.5, lobby.z - 0.9);
  plant('plant-rest', rest.x, south(rest, 0.5));

  // Phòng Hồ sơ: dãy tủ sát tường sau (đích của tờ giấy khi xong việc).
  const archive = byId('archive');
  const cabinet = { x: archive.x, z: archive.z - archive.d / 2 + 0.7 };
  furniture.push({ id: 'cabinet', kind: 'cabinet', x: cabinet.x, z: cabinet.z, hw: Math.min(archive.w / 2 - 0.5, 1.4), hd: 0.3 });
  // Dãy rack phòng server.
  const server = byId('server');
  furniture.push({ id: 'racks', kind: 'rack', x: server.x, z: server.z - server.d / 2 + 1.1, hw: 2.1, hd: 0.55 });
  // Thư viện: kệ sau và hai đoạn kệ trước chừa lối vào giữa; bàn đọc ở giữa.
  const library = byId('library');
  furniture.push({ id: 'library-shelf', kind: 'cabinet', x: library.x, z: library.z - library.d / 2 + 0.45, hw: library.w / 2 - 0.5, hd: 0.2 });
  for (const side of [-1, 1]) {
    const seg = (library.w - 1) / 2 - 1.4;
    furniture.push({ id: `library-shelf-front-${side}`, kind: 'cabinet', x: library.x + side * (1.4 + seg / 2), z: library.z + library.d / 2 - 0.7, hw: seg / 2, hd: 0.2 });
  }
  furniture.push({ id: 'library-table', kind: 'table', x: library.x, z: library.z, hw: 1.3, hd: 0.6 });
  // Phòng họp: bàn dài sát tường sau (họp đứng, quay về bảng trắng).
  for (const id of ['meeting1', 'meeting2'] as const) {
    const r = byId(id);
    furniture.push({ id: `${id}-table`, kind: 'table', x: r.x, z: r.z - 0.9, hw: 1.5, hd: 0.5 });
  }

  // Cây xanh ở hai cột bên, ngoài các lối đi.
  const sideX = rowWidth / 2 + SIDE_COL - 0.4;
  [BACK_Z0 + 1.2, FRONT_Z1 - 1.2].forEach((pz, i) => {
    plant(`plant-left-${i}`, -sideX, pz);
    plant(`plant-right-${i}`, sideX, pz);
  });

  const bounds = { minZ: BACK_Z0 - 0.8, maxZ: FRONT_Z1 + 0.8 };
  const depth = 2 * Math.max(-bounds.minZ, bounds.maxZ);
  const walls = { minX: -width / 2, maxX: width / 2, minZ: bounds.minZ, maxZ: bounds.maxZ };
  const ownerRoom = byId('owner');
  const restBox = { x: rest.x, z: rest.z, w: rest.w, d: rest.d };

  return {
    width, depth, bounds, walls, gridWidth: rowWidth, tiles, furniture, pods, zones, rooms, lounge: restBox, cabinet,
    aisleBackZ: AISLE_BACK_Z, aisleFrontZ: AISLE_FRONT_Z, lanes, people, owner: { x: ownerRoom.x, z: backZ },
  };
}

/** Số nhân vật theo từng team (kể cả Trưởng nhóm), dùng để đối chiếu với cấu hình. */
export function countByTeam(layout: OfficeLayout): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of layout.people) out[p.teamId] = (out[p.teamId] ?? 0) + 1;
  return out;
}
