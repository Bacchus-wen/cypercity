// Restyle rooftops (American city silhouette; ?art=legacy skips): blinking red aircraft-warning lights on tall roofs,
// NYC-style timber water tanks on stilts on mid-rise roofs, and painted helipads with edge lights on the tallest
// wide roofs. Returns meshes for the buildings group; everything instanced except the few helipads.
import * as THREE from 'three/webgpu';
import { attribute, vec3, float, sin, time, step, fract, uv } from 'three/tsl';
import { mulberry32 } from './rng.js';

export function buildRooftops2(ctx, lots) {
  const meshes = [];
  const lamps = [], tanks = [], pads = [];
  for (const lot of lots) {
    if (!lot.volumes?.length || lot.overlook) continue;
    const top = lot.volumes[lot.volumes.length - 1];
    const w = top.x1 - top.x0, d = top.z1 - top.z0, y = top.y1;
    const r = mulberry32((lot.id * 2654435761 + 77) >>> 0);
    if (y > 45 && w > 6 && d > 6 && r() < 0.6) {
      // warning lights on two or four roof corners (on short masts above the parapet)
      const corners = [[top.x0 + 0.5, top.z0 + 0.5], [top.x1 - 0.5, top.z1 - 0.5], [top.x1 - 0.5, top.z0 + 0.5], [top.x0 + 0.5, top.z1 - 0.5]];
      const n = y > 75 ? 4 : 2, ph = r() * 6.283;
      for (let k = 0; k < n; k++) lamps.push([corners[k][0], y + 2.0, corners[k][1], ph]);
    }
    const occ = lot.roofRects || [];
    const clear = (x0, z0, x1, z1) => !occ.some((q) => q[0] < x1 && q[2] > x0 && q[1] < z1 && q[3] > z0);
    if (y > 14 && y < 40 && w > 8 && d > 8 && r() < 0.32) {
      // first free roof corner (props.js / architecture.js record their roof furniture in lot.roofRects)
      const rad = 1.2 + r() * 0.6, h = 2.6 + r() * 0.8, k0 = Math.floor(r() * 4), rot = r() * 6.283;
      for (let k = 0; k < 4; k++) {
        const sx = (k0 + k) & 1 ? 1 : -1, sz = (k0 + k) & 2 ? 1 : -1;
        const cx = (top.x0 + top.x1) / 2 + sx * (w / 2 - rad - 1.6), cz = (top.z0 + top.z1) / 2 + sz * (d / 2 - rad - 1.6), e = rad + 0.3;
        if (clear(cx - e, cz - e, cx + e, cz + e)) { tanks.push([cx, y, cz, rad, h, rot]); occ.push([cx - e, cz - e, cx + e, cz + e]); break; }
      }
    }
    if (y > 45 && w > 18 && d > 18) {
      const cx = (top.x0 + top.x1) / 2, cz = (top.z0 + top.z1) / 2, R = Math.min(w, d) / 2 - 2.0;
      if (clear(cx - R, cz - R, cx + R, cz + R)) pads.push({ lot, top, y });
    }
  }

  // ---- warning lights: emissive red beads blinking in pairs (per-building phase), plus their masts
  if (lamps.length) {
    const bead = new THREE.SphereGeometry(0.45, 8, 6);
    const phase = new Float32Array(lamps.length);
    const m = new THREE.MeshBasicNodeMaterial();
    const ph = attribute('aPhase', 'float');
    const on = step(0.55, fract(time.mul(0.5).add(ph.mul(0.159))));
    m.colorNode = vec3(1.0, 0.08, 0.05).mul(float(0.5).add(on.mul(14.0)));
    m.lineMask = 1;
    const im = new THREE.InstancedMesh(bead, m, lamps.length);
    const mast = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 5).translate(0, -1.0, 0), new THREE.MeshStandardNodeMaterial({ color: 0x1b1c20, roughness: 0.5, metalness: 0.7 }), lamps.length);
    const M = new THREE.Matrix4();
    lamps.forEach(([x, yy, z, p], i) => { M.makeTranslation(x, yy, z); im.setMatrixAt(i, M); mast.setMatrixAt(i, M); phase[i] = p; });
    bead.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    im.computeBoundingSphere(); mast.computeBoundingSphere();
    im.name = 'roof_warning_lights'; mast.name = 'roof_warning_masts';
    meshes.push(im, mast);
  }

  // ---- water tanks: staved timber barrel, conical cap, steel legs + ring beam
  if (tanks.length) {
    const barrel = new THREE.CylinderGeometry(1, 1, 1, 16, 1).translate(0, 0.5, 0);
    const cap = new THREE.ConeGeometry(1.08, 0.6, 16).translate(0, 0.3, 0);
    const leg = new THREE.CylinderGeometry(0.08, 0.08, 1, 6).translate(0, 0.5, 0);
    const hoop = new THREE.TorusGeometry(1.02, 0.035, 4, 24).rotateX(Math.PI / 2);
    const wood = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
    const su = uv();
    wood.colorNode = vec3(0.36, 0.24, 0.15).mul(sin(su.x.mul(Math.PI * 2 * 24)).mul(0.08).add(0.92)); // vertical staves
    const capM = new THREE.MeshStandardNodeMaterial({ color: 0x2a2523, roughness: 0.7 });
    const steel = new THREE.MeshStandardNodeMaterial({ color: 0x24262b, roughness: 0.5, metalness: 0.7 });
    const legH = 2.2;
    const bI = new THREE.InstancedMesh(barrel, wood, tanks.length), cI = new THREE.InstancedMesh(cap, capM, tanks.length);
    const lI = new THREE.InstancedMesh(leg, steel, tanks.length * 4), hI = new THREE.InstancedMesh(hoop, steel, tanks.length * 3);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    tanks.forEach(([x, y, z, rad, h, rot], i) => {
      Q.setFromAxisAngle(UP, rot);
      bI.setMatrixAt(i, M.compose(P.set(x, y + legH, z), Q, S.set(rad, h, rad)));
      cI.setMatrixAt(i, M.compose(P.set(x, y + legH + h, z), Q, S.set(rad, 1, rad)));
      for (let k = 0; k < 4; k++) {
        const a = rot + k * Math.PI / 2 + Math.PI / 4;
        lI.setMatrixAt(i * 4 + k, M.compose(P.set(x + Math.cos(a) * rad * 0.75, y, z + Math.sin(a) * rad * 0.75), Q, S.set(1, legH, 1)));
      }
      for (let k = 0; k < 3; k++) hI.setMatrixAt(i * 3 + k, M.compose(P.set(x, y + legH + h * (0.2 + k * 0.3), z), Q, S.set(rad, 1, rad)));
    });
    for (const im of [bI, cI, lI, hI]) { im.computeBoundingSphere(); meshes.push(im); }
    bI.name = 'water_tanks';
  }

  // ---- helipads on the (up to) four tallest wide roofs
  pads.sort((a, b) => b.y - a.y);
  const cv = document.createElement('canvas'); cv.width = cv.height = 512;
  const g = cv.getContext('2d');
  g.fillStyle = '#26262b'; g.beginPath(); g.arc(256, 256, 250, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#f2ede4'; g.lineWidth = 16; g.beginPath(); g.arc(256, 256, 200, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#f2ede4'; g.fillRect(166, 136, 44, 240); g.fillRect(302, 136, 44, 240); g.fillRect(166, 234, 180, 44);
  g.strokeStyle = '#ffb547'; g.lineWidth = 8; g.setLineDash([26, 18]); g.beginPath(); g.arc(256, 256, 236, 0, Math.PI * 2); g.stroke();
  const padTex = new THREE.CanvasTexture(cv); padTex.colorSpace = THREE.SRGBColorSpace;
  const padM = new THREE.MeshStandardNodeMaterial({ map: padTex, roughness: 0.8, transparent: true, alphaTest: 0.5 });
  const edgeM = new THREE.MeshBasicNodeMaterial(); edgeM.colorNode = vec3(1.0, 0.7, 0.25).mul(4); edgeM.lineMask = 1;
  let nPads = 0;
  for (const p of pads.slice(0, 4)) {
    const cx = (p.top.x0 + p.top.x1) / 2, cz = (p.top.z0 + p.top.z1) / 2, R = Math.min(p.top.x1 - p.top.x0, p.top.z1 - p.top.z0) / 2 - 2.5;
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, 2 * R).rotateX(-Math.PI / 2), padM);
    disc.position.set(cx, p.y + 0.06, cz); disc.name = 'helipad'; meshes.push(disc);
    const beads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.12, 0.22), edgeM, 16);
    const M = new THREE.Matrix4();
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; M.makeTranslation(cx + Math.cos(a) * (R + 0.4), p.y + 0.1, cz + Math.sin(a) * (R + 0.4)); beads.setMatrixAt(k, M); }
    beads.computeBoundingSphere(); meshes.push(beads);
    nPads++;
  }
  console.log(`[buildings] rooftops2: ${lamps.length} roof beacons, ${tanks.length} water tanks, ${nPads} helipads`);
  return meshes;
}
