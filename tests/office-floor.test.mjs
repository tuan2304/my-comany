import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { BODY_RADIUS, deskHitBy, doorX, obstacleHitBy, planPath, standSpot } from '../src/office/flow.ts';
import { countByTeam, layoutOffice, POD_W, SEATS_PER_POD, TEAM_COLORS } from '../src/office/layout.ts';
import { loadTeams, summarizeTeams } from '../server/teams.mjs';
import { REPO } from './helpers.mjs';

const realTeams = () => summarizeTeams(loadTeams({ teamsDir: path.join(REPO, 'teams') }));
const member = (name, role, isLead = false) => ({ name, role, title: role, model: 'sonnet', effort: 'low', strengths: [], isLead });
const team = (id, n) => ({ id, name: id, lead: 'L' + id, members: [member('L' + id, 'lead', true), ...Array.from({ length: n }, (_, i) => member(`${id}${i}`, 'dev'))] });

const PLACES = ['library', 'server', 'lounge', 'pantry', 'meeting', 'wc', 'window'];
const slotCount = { lounge: 10, meeting: 8, window: 4, pantry: 8, wc: 4, library: 6, server: 4, whiteboard: 2 };

/** Chỗ đứng ở một nơi cho người thứ index. */
const standAt = (layout, person, place, index) => standSpot(layout, person, place, place === 'lounge' ? index : index % 3, place === 'lounge' ? layout.people.length : (slotCount[place] ?? 4));

/** Mọi đường đi có thể có: từ bàn tới từng nơi, từ nơi về bàn, và giữa các nơi với nhau (cho từng người). */
function allRoutes(layout) {
  const routes = [];
  layout.people.forEach((person, index) => {
    const seat = { x: person.x, z: person.z };
    const usable = [...PLACES, ...(person.isDirector ? ['whiteboard'] : [])];
    const stands = Object.fromEntries(usable.map((p) => [p, standAt(layout, person, p, index)]));
    for (const p of usable) {
      routes.push({ tag: `${person.name}: bàn → ${p}`, from: 'desk', to: p, path: planPath(layout, person, 'desk', seat, p, stands[p]) });
      routes.push({ tag: `${person.name}: ${p} → bàn`, from: p, to: 'desk', path: planPath(layout, person, p, stands[p], 'desk', seat) });
      for (const q of usable) if (p !== q) routes.push({ tag: `${person.name}: ${p} → ${q}`, from: p, to: q, path: planPath(layout, person, p, stands[p], q, stands[q]) });
    }
  });
  return routes;
}

/** Các đoạn tường của một khu có tường: bốn mặt, mặt có cửa chừa khe. */
function wallRects(tile) {
  const t = 0.12;
  const x0 = tile.x - tile.w / 2;
  const x1 = tile.x + tile.w / 2;
  const z0 = tile.z - tile.d / 2;
  const z1 = tile.z + tile.d / 2;
  const door = { from: tile.x + tile.door.from, to: tile.x + tile.door.to };
  const wall = (z, hasDoor) => (hasDoor
    ? [{ x0, x1: door.from, z0: z - t, z1: z + t }, { x0: door.to, x1, z0: z - t, z1: z + t }]
    : [{ x0, x1, z0: z - t, z1: z + t }]);
  return [
    ...wall(z0, tile.doorSide === 'back'),
    ...wall(z1, tile.doorSide === 'front'),
    { x0: x0 - t, x1: x0 + t, z0, z1 },
    { x0: x1 - t, x1: x1 + t, z0, z1 },
  ];
}

const inside = (box, x, z, pad = 0) => Math.abs(x - box.x) <= box.w / 2 - pad && Math.abs(z - box.z) <= box.d / 2 - pad;

test('số nhân vật theo từng team khớp đúng cấu hình thật', () => {
  const teams = realTeams();
  const layout = layoutOffice(teams);
  const expected = Object.fromEntries(teams.filter((t) => t.id !== 'management').map((t) => [t.id, t.members.length]));
  assert.deepEqual(countByTeam(layout), { ...expected, management: 1 });
  assert.equal(layout.people.length, 18, '1 Giám đốc + 6 Trưởng nhóm + 11 nhân viên');
  const names = layout.people.map((p) => p.name);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(layout.people.filter((p) => p.isLead).map((p) => p.name).sort(), ['Hòa', 'Hải', 'Khôi', 'Lan', 'Minh', 'Ngọc', 'Phúc'].sort());
  assert.deepEqual(layout.zones.map((z) => z.id).sort(), ['backend', 'design', 'devops', 'frontend', 'quality', 'security']);
});

test('tầng văn phòng đủ chức năng: bảy phòng kính ở dải sau, WC, pantry, khu nghỉ và sảnh ở dải trước', () => {
  const layout = layoutOffice(realTeams());
  const back = layout.rooms.filter((r) => r.z < layout.aisleBackZ).sort((a, b) => a.x - b.x).map((r) => r.id);
  assert.deepEqual(back, ['owner', 'director', 'meeting1', 'meeting2', 'library', 'server', 'archive']);
  const front = layout.rooms.filter((r) => r.z > layout.aisleFrontZ).sort((a, b) => a.x - b.x).map((r) => r.id);
  assert.deepEqual(front, ['wc', 'pantry', 'rest', 'lobby']);
  // Các dải thẳng mép, không chồng nhau, nằm trong tường.
  const half = layout.gridWidth / 2;
  for (const group of [back, front]) {
    const rs = group.map((id) => layout.rooms.find((r) => r.id === id));
    assert.ok(Math.abs(rs[0].x - rs[0].w / 2 + half) < 1e-6, 'bắt đầu ở mép trái');
    assert.ok(Math.abs(rs[rs.length - 1].x + rs[rs.length - 1].w / 2 - half) < 1e-6, 'kết thúc ở mép phải');
    for (let i = 1; i < rs.length; i += 1) assert.ok(Math.abs(rs[i].x - rs[i].w / 2 - (rs[i - 1].x + rs[i - 1].w / 2)) < 1e-6, 'các phòng liền nhau, không hở');
  }
  for (const t of layout.tiles) {
    assert.ok(t.x - t.w / 2 >= layout.walls.minX - 1e-6 && t.x + t.w / 2 <= layout.walls.maxX + 1e-6, `${t.label} nằm trong tường`);
    assert.ok(t.z - t.d / 2 >= layout.bounds.minZ && t.z + t.d / 2 <= layout.bounds.maxZ, `${t.label} nằm trong sàn`);
  }
  for (let i = 0; i < layout.tiles.length; i += 1) for (let j = i + 1; j < layout.tiles.length; j += 1) {
    const a = layout.tiles[i];
    const b = layout.tiles[j];
    const overlap = Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 1e-6 && Math.abs(a.z - b.z) < (a.d + b.d) / 2 - 1e-6;
    assert.equal(overlap, false, `${a.label} và ${b.label} chồng nhau`);
  }
  // Khu nghỉ là nơi cả công ty ra khi hết hạn mức; tủ hồ sơ nằm trong phòng Hồ sơ.
  const rest = layout.rooms.find((r) => r.id === 'rest');
  assert.deepEqual(layout.lounge, { x: rest.x, z: rest.z, w: rest.w, d: rest.d });
  const archive = layout.rooms.find((r) => r.id === 'archive');
  assert.ok(inside(archive, layout.cabinet.x, layout.cabinet.z), 'tủ hồ sơ nằm trong phòng Hồ sơ');
  // Phòng có tường đều có cửa nằm trong mặt tường.
  for (const t of layout.tiles.filter((x) => x.walls !== 'none')) {
    assert.ok(t.door && t.door.from < t.door.to && t.door.from >= -t.w / 2 && t.door.to <= t.w / 2, `cửa của ${t.label}`);
  }
});

test('khu làm việc mở: mỗi team một khu thảm, bàn xếp thành cụm đối mặt nhau, hàng bắc quay về +z, hàng nam quay về -z', () => {
  const layout = layoutOffice(realTeams());
  for (const zone of layout.zones) {
    const members = layout.people.filter((p) => p.teamId === zone.id);
    assert.ok(members.length > 0);
    for (const p of members) {
      assert.ok(inside(zone, p.x, p.z, 0.5), `${p.name} ngồi trong khu của team`);
      assert.ok(inside(zone, p.deskX, p.deskZ, 0.2), `bàn của ${p.name} nằm trong khu`);
      assert.ok(p.facing === 0 || p.facing === Math.PI);
      // Bàn nằm ở phía trước mặt người ngồi.
      assert.ok(Math.abs(p.deskZ - (p.z + 1.15 * Math.cos(p.facing))) < 1e-9);
    }
    // Có đủ cả hai hàng đối mặt khi team có từ ba người (bắc quay +z, nam quay -z), và hai bàn đối diện chạm nhau ở giữa cụm.
    if (members.length >= 3) {
      const north = members.filter((p) => p.facing === 0);
      const south = members.filter((p) => p.facing === Math.PI);
      assert.ok(north.length > 0 && south.length > 0, `${zone.name}: hai hàng đối mặt`);
      assert.ok(Math.abs(north[0].deskZ - south[0].deskZ) <= 1.2 + 1e-9, 'bàn hai hàng sát nhau ở giữa cụm');
    }
  }
  // Không ai ngồi chồng lên ai; mọi cụm có đủ bốn bàn (chỗ trống là bàn trống).
  for (let i = 0; i < layout.people.length; i += 1) for (let j = i + 1; j < layout.people.length; j += 1) {
    const a = layout.people[i];
    const b = layout.people[j];
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 1.5, `${a.name} và ${b.name} ngồi quá gần nhau`);
  }
  const desks = (id) => layout.people.filter((p) => p.teamId === id).length + layout.furniture.filter((f) => f.kind === 'desk' && f.id.startsWith(`desk-${id}-`)).length;
  for (const zone of layout.zones) assert.equal(desks(zone.id) % SEATS_PER_POD, 0, `${zone.name}: bàn xếp đủ cụm bốn`);
  // Hai bên lối đi giữa các khu có lối đi dọc rộng.
  assert.equal(layout.lanes.length, layout.zones.length + 1);
  assert.deepEqual([...layout.lanes].sort((a, b) => a - b), layout.lanes);
  for (const f of layout.furniture) for (const lane of layout.lanes) {
    if (f.z > layout.aisleBackZ && f.z < layout.aisleFrontZ) assert.ok(Math.abs(f.x - lane) > f.hw + 0.8, `${f.id} chắn lối đi dọc`);
  }
});

test('đồ đạc: nằm trong tòa nhà, không chồng nhau, không đè bàn của ai', () => {
  const layout = layoutOffice(realTeams());
  const rect = (o) => ({ x0: o.x - o.hw, x1: o.x + o.hw, z0: o.z - o.hd, z1: o.z + o.hd });
  for (const o of layout.furniture) {
    const r = rect(o);
    assert.ok(r.x0 >= layout.walls.minX && r.x1 <= layout.walls.maxX && r.z0 >= layout.bounds.minZ && r.z1 <= layout.bounds.maxZ, `${o.id} nằm trong tòa nhà`);
    for (const p of layout.people) {
      const hit = Math.abs(o.x - p.deskX) < o.hw + 1.1 && Math.abs(o.z - p.deskZ) < o.hd + 0.55; // bàn thật rộng 2,2 m, sâu 1,1 m
      assert.equal(hit, false, `${o.id} đè lên bàn của ${p.name}`);
    }
  }
  for (let i = 0; i < layout.furniture.length; i += 1) for (let j = i + 1; j < layout.furniture.length; j += 1) {
    const a = rect(layout.furniture[i]);
    const b = rect(layout.furniture[j]);
    const overlap = a.x0 < b.x1 - 1e-6 && a.x1 > b.x0 + 1e-6 && a.z0 < b.z1 - 1e-6 && a.z1 > b.z0 + 1e-6;
    assert.equal(overlap, false, `${layout.furniture[i].id} và ${layout.furniture[j].id} chồng nhau`);
  }
});

test('chỗ đứng: đúng phòng, không đụng đồ đạc hay bàn, không hai người đứng chồng lên nhau', () => {
  const layout = layoutOffice(realTeams());
  const person = layout.people[0];
  const area = { library: 'library', server: 'server', whiteboard: 'director', pantry: 'pantry', wc: 'wc', lounge: 'rest' };
  for (const place of [...PLACES, 'whiteboard']) {
    const count = slotCount[place] ?? 4;
    const spots = Array.from({ length: Math.min(count, place === 'whiteboard' ? 1 : count) }, (_, i) => standSpot(layout, person, place, i, count));
    spots.forEach((s, i) => {
      assert.ok(Math.abs(s.x) <= layout.walls.maxX && s.z >= layout.bounds.minZ && s.z <= layout.bounds.maxZ, `${place}#${i} nằm trong tòa nhà`);
      const target = area[place];
      if (target) assert.ok(inside(layout.rooms.find((r) => r.id === target), s.x, s.z), `${place}#${i} nằm trong ${target}`);
      if (place === 'meeting') assert.ok(inside(layout.rooms.find((r) => r.id === (i < 4 ? 'meeting1' : 'meeting2')), s.x, s.z), `meeting#${i} nằm trong phòng họp`);
      assert.equal(obstacleHitBy(layout, [s, s]), null, `${place}#${i} đứng đè đồ đạc`);
      assert.equal(deskHitBy(layout, [s, s]), null, `${place}#${i} đứng đè bàn`);
    });
    for (let i = 0; i < spots.length; i += 1) for (let j = i + 1; j < spots.length; j += 1) {
      assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z) >= 0.45, `${place}: chỗ ${i} và ${j} quá gần nhau`);
    }
  }
  assert.deepEqual(standSpot(layout, person, 'desk', 0, 1), { x: person.x, z: person.z, face: person.facing });
});

test('mọi đường đi (bàn → nơi, nơi → bàn, nơi → nơi, cho từng người) đi đúng trục, đúng chỗ, không đụng bàn hay đồ đạc, không ra ngoài sàn', () => {
  const layout = layoutOffice(realTeams());
  const routes = allRoutes(layout);
  assert.ok(routes.length > 400, `đủ nhiều đường đi để kiểm tra (${routes.length})`);
  for (const { tag, path: route } of routes) {
    for (let i = 1; i < route.length; i += 1) {
      const dx = Math.abs(route[i].x - route[i - 1].x);
      const dz = Math.abs(route[i].z - route[i - 1].z);
      assert.ok(dx < 1e-6 || dz < 1e-6, `${tag}: đoạn ${i} phải song song với một trục`);
      assert.ok(dx + dz > 1e-6, `${tag}: không có đoạn dài 0`);
    }
    for (const p of route) assert.ok(Math.abs(p.x) <= layout.walls.maxX && p.z >= layout.bounds.minZ && p.z <= layout.bounds.maxZ, `${tag}: điểm (${p.x}, ${p.z}) ngoài sàn`);
    assert.equal(obstacleHitBy(layout, route), null, `${tag}: cắt qua đồ đạc (${obstacleHitBy(layout, route)})`);
    assert.equal(deskHitBy(layout, route), null, `${tag}: cắt qua bàn của ${deskHitBy(layout, route)}`);
  }
});

test('không ai đi xuyên tường: vào ra phòng chỉ bằng cửa', () => {
  const layout = layoutOffice(realTeams());
  const walled = layout.tiles.filter((t) => t.walls !== 'none');
  assert.equal(walled.length, 8, 'bảy phòng kính và WC');
  for (const { tag, path: route } of allRoutes(layout)) {
    for (let i = 1; i < route.length; i += 1) {
      const a = route[i - 1];
      const b = route[i];
      const steps = Math.max(Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05), 1);
      for (let s = 0; s <= steps; s += 1) {
        const x = a.x + ((b.x - a.x) * s) / steps;
        const z = a.z + ((b.z - a.z) * s) / steps;
        for (const tile of walled) for (const r of wallRects(tile)) {
          assert.equal(x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1, false, `${tag}: đi xuyên tường của ${tile.label} tại (${x.toFixed(2)}, ${z.toFixed(2)})`);
        }
      }
    }
  }
});

test('rời bàn: hàng bắc đi ngược về phía lưng ghế ra lối đi sau, hàng nam ra lối đi trước; Giám đốc ra cửa phòng mình', () => {
  const layout = layoutOffice(realTeams());
  for (const person of layout.people) {
    const seat = { x: person.x, z: person.z };
    const route = planPath(layout, person, 'desk', seat, 'pantry', standSpot(layout, person, 'pantry', 0, 4));
    if (person.isDirector) {
      assert.ok(Math.abs(route[1].z - seat.z) < 1e-9 && Math.abs(route[1].x - doorX(layout, 'director')) < 1e-9, 'Giám đốc đi ngang tới cửa phòng');
    } else if (person.facing === 0) {
      assert.ok(route[1].z < seat.z, `${person.name} (hàng bắc) đi lên phía sau`);
      assert.ok(Math.abs(route[1].z - layout.aisleBackZ) < 1e-9);
    } else {
      assert.ok(route[1].z > seat.z, `${person.name} (hàng nam) đi xuống phía trước`);
      assert.ok(Math.abs(route[1].z - layout.aisleFrontZ) < 1e-9);
    }
  }
});

test('lối đi dọc thông suốt từ lối đi sau tới lối đi trước, không bị bàn hay đồ đạc chắn', () => {
  const layout = layoutOffice(realTeams());
  for (const lane of layout.lanes) {
    const path = [{ x: lane, z: layout.aisleBackZ }, { x: lane, z: layout.aisleFrontZ }];
    assert.equal(deskHitBy(layout, path), null, `lối dọc ${lane.toFixed(1)}`);
    assert.equal(obstacleHitBy(layout, path), null, `lối dọc ${lane.toFixed(1)}`);
  }
  for (const z of [layout.aisleBackZ, layout.aisleFrontZ]) {
    const path = [{ x: layout.lanes[0], z }, { x: layout.lanes[layout.lanes.length - 1], z }];
    assert.equal(deskHitBy(layout, path), null, `lối ngang z=${z}`);
    assert.equal(obstacleHitBy(layout, path), null, `lối ngang z=${z}`);
  }
});

test('co giãn theo cấu hình: đội nhỏ, đội lớn, team nhiều hơn bốn người có thêm cụm bàn; mọi đường đi vẫn sạch', () => {
  const small = layoutOffice([team('a', 2)]);
  const big = layoutOffice([team('a', 7), team('b', 3), team('c', 2), team('d', 0)]);
  assert.equal(small.people.length, 3);
  assert.equal(small.rooms.some((r) => r.id === 'director'), false, 'không có Giám đốc thì không có phòng Giám đốc');
  assert.equal(big.people.length, 8 + 4 + 3 + 1);
  const a = big.zones.find((z) => z.id === 'a');
  const b = big.zones.find((z) => z.id === 'b');
  assert.ok(a.w - b.w >= POD_W - 1e-6, 'team 8 người (hai cụm) có khu rộng hơn team 4 người (một cụm) ít nhất một cụm bàn');
  assert.equal(new Set(big.zones.map((z) => TEAM_COLORS[z.colorIndex % TEAM_COLORS.length])).size, 4, 'mỗi team một màu');
  assert.equal(new Set(big.people.filter((p) => p.teamId === 'a').map((p) => p.x)).size, 4, 'hai cụm: bốn cột chỗ ngồi');
  for (const layout of [small, big]) {
    const routes = allRoutes(layout);
    const bad = routes.filter(({ path: p }) => obstacleHitBy(layout, p) || deskHitBy(layout, p));
    assert.equal(bad.length, 0, `đường đi sạch (hỏng: ${bad.slice(0, 3).map((r) => r.tag).join('; ')})`);
    const walled = layout.tiles.filter((t) => t.walls !== 'none');
    for (const { tag, path: route } of routes) {
      for (let i = 1; i < route.length; i += 1) {
        const p0 = route[i - 1];
        const p1 = route[i];
        const steps = Math.max(Math.ceil(Math.hypot(p1.x - p0.x, p1.z - p0.z) / 0.1), 1);
        for (let s = 0; s <= steps; s += 1) {
          const x = p0.x + ((p1.x - p0.x) * s) / steps;
          const z = p0.z + ((p1.z - p0.z) * s) / steps;
          for (const tile of walled) for (const r of wallRects(tile)) assert.equal(x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1, false, `${tag}: xuyên tường`);
        }
      }
    }
  }
  assert.deepEqual(layoutOffice([]).people, []);
  assert.ok(BODY_RADIUS > 0);
});

test('bố cục là hàm thuần: cùng đầu vào cho cùng kết quả', () => {
  const teams = realTeams();
  assert.deepEqual(layoutOffice(teams), layoutOffice(teams));
});
