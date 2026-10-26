// Ground plan derived from LAYOUT: road/sidewalk/curb/alley/promenade regions + heightAt().
import { LAYOUT } from '../../world/layout.js';

const A = LAYOUT.avenue, C = LAYOUT.crossStreets, AL = LAYOUT.alley, PR = LAYOUT.promenade, R = LAYOUT.river;

export const G = {
  curbH: A.curbHeight,                 // sidewalk top
  curbW: 0.2,                          // granite curb top width
  cornerR: 3.0,                        // rounded curb radius at intersections
  avHalf: A.roadHalfWidth,             // 6
  avSide: A.sidewalkWidth + 0.6,       // sidewalk strip extends a little under the frontage
  crHalf: C.roadHalfWidth,             // 5
  crSide: C.sidewalkWidth + 0.6,
  crossZ: C.zs.slice(),
  zS: A.zStart + 6,                    // 66: south end of avenue sidewalks
  zN: A.zEnd - 6,                      // -426
  xW: C.xStart,                        // -200
  xE: PR.xMin,                         // 128: cross streets end at the promenade
  alley: { z: AL.z, half: AL.width / 2, x0: AL.xEnd - 6, x1: -(A.roadHalfWidth + A.sidewalkWidth + 0.6), stairs: AL.stairs },
  prom: { x0: PR.xMin, x1: PR.xMax, z0: PR.zEnd, z1: PR.zStart, y: PR.y },
  river: { x0: R.xCenter - R.halfWidth, x1: R.xCenter + R.halfWidth, water: R.waterLevel },
  world: { x0: -460, x1: 460, z0: -780, z1: 240 },
  // restyle map: planted median (raised strip between intersections), lanes, central plaza (raised paving)
  medHalf: A.medianHalf || 0,
  laneW: A.laneWidth || 3,
  lanes: A.lanes || 1,
  plaza: LAYOUT.plaza || null,
};
// first lane edge (median curb + gutter); 0 without a median
G.lane0 = G.medHalf > 0 ? G.medHalf + 0.3 : 0;
// restyle map: pull-in bay cut into the east sidewalk (no parking lane on the boulevard)
G.bay = A.bay ? { x0: G.avHalf, x1: G.avHalf + A.bay.depth, z0: A.bay.z0, z1: A.bay.z1, t: A.bay.taper } : null;
export function inBay(x, z) {
  const b = G.bay; if (!b || x < b.x0 - 0.01 || x > b.x1 || z < b.z0 - b.t || z > b.z1 + b.t) return false;
  const k = z > b.z1 ? 1 - (z - b.z1) / b.t : z < b.z0 ? 1 - (b.z0 - z) / b.t : 1;
  return x <= b.x0 + (b.x1 - b.x0) * k;
}

// Sidewalk "C" polygons for each avenue block side: avenue strip + arms along adjacent cross streets.
// Returns [{ pts: [[x,z],...] (CCW in x/z), roundCorners: indices }]
export function sidewalkPolys() {
  const polys = [];
  const zs = [G.zS, ...G.crossZ.flatMap((z) => [z + G.crHalf, z - G.crHalf]), G.zN];
  // block z intervals [zHi, zLo] (zHi > zLo)
  const blocks = [];
  for (let i = 0; i < zs.length; i += 2) blocks.push([zs[i], zs[i + 1]]);
  for (const side of [1, -1]) {
    const xr = side * G.avHalf, xi = side * (G.avHalf + G.avSide), xEnd = side > 0 ? G.xE : G.xW;
    blocks.forEach(([zHi, zLo], bi) => {
      const southIsCross = bi > 0;                 // zHi is a cross street edge
      const northIsCross = bi < blocks.length - 1; // zLo is a cross street edge
      const pts = []; const round = [];
      // walk: south-road corner -> north-road corner -> north arm -> inner -> south arm
      pts.push([xr, zHi]); if (southIsCross) round.push(0);
      const B = G.bay;
      if (side > 0 && B && B.z1 + B.t < zHi && B.z0 - B.t > zLo) { // notch for the pull-in bay (tapered ends)
        pts.push([xr, B.z1 + B.t], [B.x1, B.z1], [B.x1, B.z0], [xr, B.z0 - B.t]);
      }
      pts.push([xr, zLo]); if (northIsCross) round.push(pts.length - 1);
      if (northIsCross) {
        pts.push([xEnd, zLo]);
        pts.push([xEnd, zLo - G.crSide]);
        pts.push([xi, zLo - G.crSide]);
      } else {
        pts.push([xi, zLo]);
      }
      if (southIsCross) {
        pts.push([xi, zHi + G.crSide]);
        pts.push([xEnd, zHi + G.crSide]);
        pts.push([xEnd, zHi]);
      } else {
        pts.push([xi, zHi]);
      }
      polys.push({ pts, round, side });
      // median strip of this block, stopping short of the crosswalks (zebra spans 1-5 m from the cross street)
      if (side === 1 && G.medHalf > 0) {
        const z1 = southIsCross ? zHi - 6.5 : zHi, z0 = northIsCross ? zLo + 6.5 : zLo;
        if (z1 - z0 > 4) {
          const h = G.medHalf;
          polys.push({ pts: [[h, z1], [h, z0], [-h, z0], [-h, z1]], round: [0, 1, 2, 3], r: Math.min(1.2, h * 0.9), side: 0, median: true });
        }
      }
    });
  }
  // central plaza: one raised paved rect abutting the west sidewalk
  if (G.plaza) {
    const P = G.plaza, xi = -(G.avHalf + G.avSide);
    polys.push({ pts: [[xi, P.z1], [xi, P.z0], [P.x0, P.z0], [P.x0, P.z1]], round: [2, 3], r: 2.5, side: -1, plaza: true });
  }
  return polys;
}
export const inPlaza = (x, z) => !!G.plaza && x >= G.plaza.x0 && x <= -(G.avHalf + G.avSide) + 0.01 && z >= G.plaza.z0 && z <= G.plaza.z1;
export function inMedian(x, z) {
  if (!(G.medHalf > 0) || Math.abs(x) > G.medHalf || z > G.zS || z < G.zN) return false;
  return G.crossZ.every((c) => Math.abs(z - c) > G.crHalf + 6.5);
}

// --- region tests (JS, for heightAt / placement) --------------------------------------------------------
const nearestCross = (z) => G.crossZ.reduce((b, c) => (Math.abs(z - c) < Math.abs(z - b) ? c : b), G.crossZ[0]);

// signed distance to the nearest curb line, positive inside roads (rounded corners)
export function curbDist(x, z) {
  const zc = nearestCross(z);
  const qx = Math.abs(x) - G.avHalf, qz = Math.abs(z - zc) - G.crHalf;
  const r = G.cornerR;
  const wx = r - qx, wz = r - qz;
  const outside = Math.hypot(Math.max(wx, 0), Math.max(wz, 0)) + Math.min(Math.max(wx, wz), 0);
  let d = outside - r;
  // beyond the ends of the cross streets / avenue only the other road counts
  if (x < G.xW || x > G.xE) d = G.avHalf - Math.abs(x);
  if (inMedian(x, z)) d = Math.min(d, Math.abs(x) - G.medHalf); // the median is curbed (negative = kerb side)
  return d;
}

export function inSidewalk(x, z) {
  if (inPlaza(x, z) || inMedian(x, z)) return true;
  if (inBay(x, z)) return false;
  if (z > G.zS || z < G.zN) return false;
  if (curbDist(x, z) > 0) return false;
  const ax = Math.abs(x);
  const zc = nearestCross(z);
  const dz = Math.abs(z - zc);
  if (ax <= G.avHalf + G.avSide) return true;
  if (x < G.xW || x > G.xE) return false;
  return dz <= G.crHalf + G.crSide;
}

export function inAlleyLower(x, z) {
  return Math.abs(z - G.alley.z) <= G.alley.half && x <= G.alley.x1 && x >= G.alley.stairs.xStart;
}

export function heightAt(x, z) {
  const al = G.alley;
  if (Math.abs(z - al.z) <= al.half && x <= al.x1 && x >= al.x0) {
    const s = al.stairs;
    if (x >= s.xStart) return 0;
    if (x <= s.xEnd) return s.rise;
    return ((s.xStart - x) / (s.xStart - s.xEnd)) * s.rise;
  }
  if (x > G.river.x0 && x < G.river.x1) return G.river.water;
  if (inSidewalk(x, z)) return G.curbH;
  return 0;
}
