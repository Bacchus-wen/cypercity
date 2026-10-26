// US-style street furniture of the restyle map (boulevard sidewalks): fire hydrants, trash cans and newspaper
// boxes in the kerb strip, and lit bus shelters (LAYOUT.busShelters). Simple instanced primitives, cel-friendly
// flat colours. Kerb-strip items stay outside the crowd lanes; the shelters pinch the lanes (crowd/agents.js).
import * as THREE from 'three/webgpu';
import { uv, vec2, vec3, float, texture, sin, time } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const std = (color, rough = 0.6, metal = 0.2) => new THREE.MeshStandardNodeMaterial({ color, roughness: rough, metalness: metal });
const glow = (c, i) => { const m = new THREE.MeshBasicNodeMaterial(); m.colorNode = vec3(...c).mul(i); m.lineMask = 1; return m; };

function instanced(root, geo, mat, mats, name) {
  if (!mats.length) return;
  const im = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((m, i) => im.setMatrixAt(i, m));
  im.computeBoundingSphere(); im.name = name; root.add(im);
}

export function buildStreetKit(ctx, tex, root) {
  const L = ctx.layout, A = L.avenue, C = L.crossStreets;
  if (!A.medianHalf) return null;
  const g = new THREE.Group(); g.name = 'streetkit';
  const y0 = A.curbHeight || 0.15, kerb = A.roadHalfWidth;
  const colliders = [];
  const near = (z, list, d) => list.some((c) => Math.abs(z - c) < d);
  const crossPad = C.roadHalfWidth + C.sidewalkWidth + 2;
  // street lamps (signage/street.js): west at zStart-6-26k, east 13 m further north; keep 3 m away
  const lampsW = [], lampsE = [];
  for (let z = A.zStart - 6; z > A.zEnd + 5; z -= 26) { if (near(z, C.zs, C.roadHalfWidth + C.sidewalkWidth + 3)) continue; lampsW.push(z); lampsE.push(z - 13); }
  const shelters = L.busShelters || [];
  const bay = A.bay;
  const free = (side, z, pad) => !near(z, C.zs, crossPad) && !near(z, side > 0 ? lampsE : lampsW, 3)
    && !shelters.some((s) => s.side === side && Math.abs(z - s.z) < s.len / 2 + pad)
    && !(side > 0 && bay && z > bay.z0 - bay.taper - 1 && z < bay.z1 + bay.taper + 1)
    && Math.abs(z - L.alley.z) > (side < 0 ? 5 : 0) && !(side < 0 && L.plaza && z < L.plaza.z1 + 1 && z > L.plaza.z0 - 1);
  const m4 = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));

  // corner groups (trash can + two newsboxes) sit CORNER m from each cross street centre
  const CORNER = C.roadHalfWidth + C.sidewalkWidth + 5.5;
  const nearCorner = (z) => C.zs.some((c) => Math.abs(Math.abs(z - c) - CORNER - 0.8) < 2.2);
  // ---- fire hydrants (red, white reflective band) every ~45 m on both kerbs
  const hyd = [];
  for (const side of [1, -1]) {
    for (let z = A.zStart - (side > 0 ? 30 : 18); z > A.zEnd + 8; z -= 45) {
      let zz = z; for (let t = 0; t < 6 && !free(side, zz, 1); t++) zz -= 2.5;
      if (free(side, zz, 1) && !nearCorner(zz)) hyd.push(m4(side * (kerb + 0.35), y0, zz, side > 0 ? 0 : Math.PI));
    }
  }
  const hBody = new THREE.CylinderGeometry(0.15, 0.18, 0.62, 12); hBody.translate(0, 0.31, 0);
  const hCap = new THREE.SphereGeometry(0.16, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); hCap.translate(0, 0.62, 0);
  const hNoz = new THREE.CylinderGeometry(0.06, 0.06, 0.46, 8); hNoz.rotateZ(Math.PI / 2); hNoz.translate(0, 0.42, 0);
  const hBand = new THREE.CylinderGeometry(0.165, 0.165, 0.05, 12); hBand.translate(0, 0.5, 0);
  instanced(g, hBody, std(0xc4202c, 0.5, 0.3), hyd, 'hydrant_body');
  instanced(g, hCap, std(0xc4202c, 0.5, 0.3), hyd, 'hydrant_cap');
  instanced(g, hNoz, std(0x9a1820, 0.5, 0.4), hyd, 'hydrant_nozzles');
  instanced(g, hBand, std(0xf0eee6, 0.3, 0), hyd, 'hydrant_band');

  // ---- trash cans + newspaper boxes at the corners (kerb strip, past the crosswalks)
  const cans = [], boxes = [[], [], []];
  C.zs.forEach((zc, ci) => {
    for (const side of [1, -1]) for (const dz of [-1, 1]) {
      const z = zc + dz * CORNER; // past the crosswalk and clear of the STOP / speed / crossing sign poles (zc+12, +18, +22)
      if (near(z, side > 0 ? lampsE : lampsW, 2) || (side < 0 && L.plaza && z < L.plaza.z1 + 1 && z > L.plaza.z0 - 1)) continue;
      cans.push(m4(side * (kerb + 0.36), y0, z));
      for (let k = 0; k < 2; k++) boxes[(ci + k + (side > 0 ? 1 : 0)) % 3].push(m4(side * (kerb + 0.3), y0, z + dz * (1.0 + k * 0.62), side > 0 ? Math.PI / 2 : -Math.PI / 2)); // window faces the sidewalk
    }
  });
  const cBody = new THREE.CylinderGeometry(0.3, 0.27, 0.92, 14); cBody.translate(0, 0.46, 0);
  const cLid = new THREE.CylinderGeometry(0.32, 0.32, 0.12, 14); cLid.translate(0, 0.98, 0);
  const cBand = new THREE.CylinderGeometry(0.305, 0.305, 0.06, 14); cBand.translate(0, 0.72, 0);
  instanced(g, cBody, std(0x1f3a30, 0.55, 0.4), cans, 'trash_body');
  instanced(g, cLid, std(0x15161a, 0.5, 0.5), cans, 'trash_lid');
  instanced(g, cBand, glow([0.2, 0.9, 0.6], 1.2), cans, 'trash_band');
  const bBody = new THREE.BoxGeometry(0.46, 0.96, 0.42); bBody.translate(0, 0.48, 0);
  const bWin = new THREE.BoxGeometry(0.36, 0.26, 0.02); bWin.translate(0, 0.74, 0.215);
  [0x1d4fb8, 0xe0b31c, 0xc42234].forEach((c, i) => instanced(g, bBody, std(c, 0.45, 0.2), boxes[i], `newsbox_${i}`));
  instanced(g, bWin, glow([0.95, 0.92, 0.8], 0.9), boxes.flat(), 'newsbox_windows');
  for (const m of [...cans, ...boxes.flat()]) { const p = new THREE.Vector3().setFromMatrixPosition(m); colliders.push([p.x, y0 + 0.5, p.z, 0.3, 0.5, 0.3]); }

  // ---- bus shelters: steel posts, slanted roof with an LED edge, glass back, lit ad end panel, bench
  const steel = std(0x2a2c32, 0.4, 0.8), glass = new THREE.MeshStandardNodeMaterial({ color: 0x9fbccc, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false });
  const adMap = tex.ads3 || tex.ads; // four-panel holo atlas (one panel per shelter)
  shelters.forEach((sh, i) => {
    const s = sh.side, x0 = s * (kerb + 0.35), x1 = s * (kerb + sh.depth), xc = (x0 + x1) / 2, w = Math.abs(x1 - x0), z = sh.z, len = sh.len;
    const add = (geo, mat, x, y, zz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, zz); g.add(m); return m; };
    for (const dz of [-len / 2, len / 2]) for (const xx of [x0 + s * 0.08, x1 - s * 0.08]) add(new THREE.BoxGeometry(0.08, 2.5, 0.08), steel, xx, y0 + 1.25, z + dz);
    const roof = add(new THREE.BoxGeometry(w + 0.5, 0.1, len + 0.4), steel, xc, y0 + 2.58, z); roof.rotation.z = -s * 0.06;
    add(new THREE.BoxGeometry(0.06, 0.06, len + 0.4), glow([1.0, 0.25, 0.4], 3), x0 - s * 0.2, y0 + 2.52, z);           // LED edge (road side)
    add(new THREE.BoxGeometry(0.03, 1.9, len - 0.1), glass, x1 - s * 0.1, y0 + 1.2, z);                                // glass back
    add(new THREE.BoxGeometry(w * 0.7, 0.06, len * 0.7), std(0x6a6d74, 0.6, 0.6), xc + s * 0.2, y0 + 0.46, z);        // bench seat
    add(new THREE.BoxGeometry(0.05, 0.42, len * 0.7), steel, x1 - s * 0.25, y0 + 0.7, z);                              // bench back
    // lit ad panel closing the north end (faces the walkers coming south)
    const am = new THREE.MeshBasicNodeMaterial(); am.lineMask = 1;
    const au = uv();
    am.colorNode = texture(adMap, vec2(float(((i + 1) % 4) * 0.25 + 0.004).add(au.x.mul(0.242)), au.y)).rgb.mul(sin(time.mul(0.7).add(i)).mul(0.08).add(1.25)).add(vec3(0.02, 0.02, 0.04));
    const ad = add(new THREE.PlaneGeometry(w - 0.2, 2.0), am, xc, y0 + 1.25, z - len / 2 - 0.05); ad.rotation.y = Math.PI;
    add(new THREE.BoxGeometry(w - 0.05, 2.15, 0.08), steel, xc, y0 + 1.25, z - len / 2 + 0.01);
    const pl = new THREE.PointLight(0xffd0e0, 18, 6, 1.8); pl.position.set(xc, y0 + 2.2, z); g.add(pl);
    colliders.push([xc, y0 + 1.25, z - len / 2, w / 2, 1.25, 0.08], [x1 - s * 0.1, y0 + 1.2, z, 0.05, 1.2, len / 2]);
  });

  // merge the shelters' static parts per material (33 meshes -> one per material)
  const byMat = new Map();
  for (const m of [...g.children]) {
    if (!m.isMesh || m.isInstancedMesh) continue;
    m.updateMatrix();
    const geo = m.geometry.clone().applyMatrix4(m.matrix);
    if (!byMat.has(m.material)) byMat.set(m.material, []);
    byMat.get(m.material).push(geo);
    g.remove(m);
  }
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos.map((x) => (x.index ? x : x.toNonIndexed())), false);
    if (merged) { const mm = new THREE.Mesh(merged, mat); mm.name = 'streetkit_merged'; g.add(mm); }
  }

  root.add(g);
  if (ctx.physics?.world && ctx.physics.RAPIER) {
    const { RAPIER, world } = ctx.physics;
    for (const [x, y, z, hx, hy, hz] of colliders) world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z));
  }
  console.log(`[landmarks] street kit: ${hyd.length} hydrants, ${cans.length} trash cans, ${boxes.flat().length} newsboxes, ${shelters.length} bus shelters`);
  return { count: hyd.length + cans.length };
}
