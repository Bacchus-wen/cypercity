// District / area detection from LAYOUT. Returns a stable zone descriptor for HUD pop-ups and the minimap.
export function createZones(L) {
  const av = L.avenue, cs = L.crossStreets, al = L.alley, pr = L.promenade, rv = L.river, ov = L.overlook;
  const zones = L.plaza ? map2Zones(L) : [
    {
      id: 'overlook', district: 'KABUKICHO-9', area: 'SKYLINE OVERLOOK', jp: '展望台', tint: 'cyan',
      test: (x, y, z) => y > 14 && Math.hypot(x - ov.position[0], z - ov.position[2]) < 30,
    },
    {
      id: 'bridge', district: 'KAWABATA', area: 'MIRAI BRIDGE', jp: '未来橋', tint: 'cyan',
      test: (x, y, z) => L.bridges.some((b) => Math.abs(z - b.z) < 9) && x > rv.xCenter - rv.halfWidth - 6 && x < rv.xCenter + rv.halfWidth + 6,
    },
    {
      id: 'alley', district: 'KABUKICHO-9', area: 'LANTERN ALLEY', jp: '提灯横丁', tint: 'red',
      test: (x, y, z) => x < al.xStart + 2 && x > al.xEnd - 6 && Math.abs(z - al.z) < al.width * 0.5 + 4,
    },
    {
      id: 'river', district: 'KAWABATA', area: 'SAKURA RIVERWALK', jp: '桜川遊歩道', tint: 'pink',
      test: (x) => x > pr.xMin - 14 && x < rv.xCenter + rv.halfWidth + 20,
    },
    {
      id: 'cross', district: 'SHINSEN', area: 'MARKET CROSSING', jp: '市場通り', tint: 'yellow',
      test: (x, y, z) => Math.abs(x - av.x) > av.roadHalfWidth + av.sidewalkWidth + 4 && cs.zs.some((cz) => Math.abs(z - cz) < cs.roadHalfWidth + cs.sidewalkWidth + 6),
    },
    {
      id: 'avenue', district: 'KABUKICHO-9', area: 'NEON AVENUE', jp: 'ネオン通り', tint: 'yellow',
      test: (x) => Math.abs(x - av.x) < av.roadHalfWidth + av.sidewalkWidth + 14,
    },
  ];
  const fallback = L.plaza ? { id: 'district', district: 'SOLANO HEIGHTS', area: 'BACK LOTS', jp: '', tint: 'red' }
    : { id: 'district', district: 'KABUKICHO-9', area: 'BACKSTREETS', jp: '裏通り', tint: 'red' };
  return {
    list: zones,
    at(x, y, z) {
      for (const zn of zones) if (zn.test(x, y, z)) return zn;
      return fallback;
    },
  };
}

// Restyle map: original district and area names (no subtitle line; the HUD hides an empty jp).
function map2Zones(L) {
  const av = L.avenue, cs = L.crossStreets, al = L.alley, pr = L.promenade, rv = L.river, ov = L.overlook, P = L.plaza;
  const D = 'SOLANO HEIGHTS', E = 'CANAL WARD';
  const front = av.roadHalfWidth + av.sidewalkWidth;
  return [
    { id: 'overlook', district: D, area: 'SKYDECK', jp: '', tint: 'cyan', test: (x, y, z) => y > 14 && Math.hypot(x - ov.position[0], z - ov.position[2]) < 30 },
    { id: 'bridge', district: E, area: 'VARGAS BRIDGE', jp: '', tint: 'cyan', test: (x, y, z) => L.bridges.some((b) => Math.abs(z - b.z) < 9) && x > rv.xCenter - rv.halfWidth - 6 && x < rv.xCenter + rv.halfWidth + 6 },
    { id: 'plaza', district: D, area: 'MONUMENT PLAZA', jp: '', tint: 'cyan', test: (x, y, z) => x > P.x0 - 2 && x < -front + 1 && z > P.z0 - 2 && z < P.z1 + 2 },
    { id: 'alley', district: D, area: 'BACK STAIRS', jp: '', tint: 'red', test: (x, y, z) => x < al.xStart + 2 && x > al.xEnd - 6 && Math.abs(z - al.z) < al.width * 0.5 + 4 },
    { id: 'river', district: E, area: 'PALM CANAL WALK', jp: '', tint: 'pink', test: (x) => x > pr.xMin - 14 && x < rv.xCenter + rv.halfWidth + 20 },
    { id: 'cross', district: D, area: 'CROSSTOWN', jp: '', tint: 'yellow', test: (x, y, z) => Math.abs(x - av.x) > front + 4 && cs.zs.some((cz) => Math.abs(z - cz) < cs.roadHalfWidth + cs.sidewalkWidth + 6) },
    { id: 'avenue', district: D, area: 'SOLANO BOULEVARD', jp: '', tint: 'yellow', test: (x) => Math.abs(x - av.x) < front + 14 },
  ];
}
