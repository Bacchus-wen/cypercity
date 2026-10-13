// District / area detection from LAYOUT. Returns a stable zone descriptor for HUD pop-ups and the minimap.
export function createZones(L) {
  const av = L.avenue, cs = L.crossStreets, al = L.alley, pr = L.promenade, rv = L.river, ov = L.overlook;
  const zones = [
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
  const fallback = { id: 'district', district: 'KABUKICHO-9', area: 'BACKSTREETS', jp: '裏通り', tint: 'red' };
  return {
    list: zones,
    at(x, y, z) {
      for (const zn of zones) if (zn.test(x, y, z)) return zn;
      return fallback;
    },
  };
}
