// Central plaza of the restyle map (LAYOUT.plaza, west side of the boulevard): paved square (ground system), a
// holographic monument (dark plinth + rotating three-sided holo-ad prism + orbiting light rings), a raised deck along
// the back with wide steps and a glass rail, benches, lamp posts. Palms are placed by landmarks/index.js.
import * as THREE from 'three/webgpu';
import { uv, vec2, vec3, float, texture, sin } from 'three/tsl';
import { holoMat } from './holo.js';

// raised planters with young palms on the square (between the crowd lanes, clear of the monument and the steps)
export function plazaPlanters(L) {
  const P = L.plaza; if (!P) return [];
  const cx = (P.x0 + P.x1) / 2 + 4, cz = (P.z0 + P.z1) / 2;
  return [[cx, P.z1 - 13], [cx, P.z0 + 13], [cx + 18, cz]].map(([x, z]) => ({ x, z, w: 5.2, d: 3.4, h: 0.65 }));
}

export function plazaPalmSpots(L) {
  const P = L.plaza; if (!P) return [];
  const spots = [];
  const xi = -(L.avenue.roadHalfWidth + L.avenue.sidewalkWidth + 0.6);
  const cz = (P.z0 + P.z1) / 2;
  // a row along the boulevard edge, and a row up on the deck either side of the stair opening
  for (let z = P.z1 - 6; z > P.z0 + 4; z -= 11) {
    spots.push({ x: xi - 3, z, rot: z * 1.7, scale: 1.0 });
    if (Math.abs(z - 4 - cz) > 12 && z - 4 > P.z0 + 6) spots.push({ x: P.x0 + 8.5, y: P.deckY, z: z - 4, rot: z * 2.3, scale: 0.9 });
  }
  for (const p of plazaPlanters(L)) spots.push({ x: p.x, y: 0.15 + p.h, z: p.z, rot: p.x * 3.1 + p.z, scale: 0.55 });
  return spots;
}

export function buildPlaza(ctx, tex, root) {
  const L = ctx.layout, P = L.plaza;
  if (!P) return null;
  const g = new THREE.Group(); g.name = 'plaza';
  const cx = (P.x0 + P.x1) / 2 + 4, cz = (P.z0 + P.z1) / 2, gy = 0.15;
  const concrete = new THREE.MeshStandardNodeMaterial({ color: 0x4a4d52, roughness: 0.85 });
  const darkMetal = new THREE.MeshStandardNodeMaterial({ color: 0x15161a, roughness: 0.45, metalness: 0.7 });
  const trim = new THREE.MeshStandardNodeMaterial({ color: 0x0a0a0c, roughness: 0.5 });
  const glow = (c, i) => { const m = new THREE.MeshBasicNodeMaterial(); m.colorNode = vec3(...c).mul(i); m.lineMask = 1; return m; };
  const colliders = [];
  const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };
  const boxC = (w, h, d, mat, x, y, z) => { add(new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z); colliders.push([x, y + h / 2, z, w / 2, h / 2, d / 2]); };

  // ---- monument: stepped plinth + obelisk core + rotating holo prism + rings
  boxC(9, 0.6, 9, concrete, cx, gy, cz);
  boxC(6.5, 0.6, 6.5, concrete, cx, gy + 0.6, cz);
  boxC(3.2, 7.5, 3.2, darkMetal, cx, gy + 1.2, cz);
  add(new THREE.BoxGeometry(3.3, 0.12, 3.3), glow([1.0, 0.18, 0.14], 3), cx, gy + 8.7, cz);       // red crown line
  // obelisk faces: inset video panels (one ad cell each), dimmer than the holo prism
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    const sm = new THREE.MeshBasicNodeMaterial(); sm.lineMask = 1;
    const su = uv();
    const sc = texture(tex.ads3 || tex.ads, vec2(float(((k + 1) % 4) * 0.25 + 0.004).add(su.x.mul(0.242)), su.y.mul(0.8).add(0.1))).rgb;
    sm.colorNode = sc.mul(sin(su.y.mul(300)).mul(0.1).add(0.9)).mul(1.1);
    const pn = add(new THREE.PlaneGeometry(2.4, 5.6), sm, cx + Math.sin(a) * 1.61, gy + 4.9, cz + Math.cos(a) * 1.61, a);
    pn.renderOrder = 1;
  }
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.08, 7.0, 0.08), glow([0.1, 0.8, 1.0], 3), cx + s * 1.62, gy + 4.9, cz + 1.62);
  const prism = new THREE.Group(); prism.position.set(cx, gy + 9.2, cz); g.add(prism);
  const R = 3.4, Hh = 13;
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI * 2 / 3;
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(2 * R * Math.sin(Math.PI / 3), Hh), holoMat(tex.ads3 || tex.ads, k, 2.6));
    pl.position.set(Math.sin(a) * R * 0.5, Hh / 2, Math.cos(a) * R * 0.5); pl.rotation.y = a; pl.renderOrder = 6;
    prism.add(pl);
  }
  const rings = [];
  for (let k = 0; k < 3; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.2 + k * 1.3, 0.06, 6, 72), glow(k === 1 ? [1.0, 0.2, 0.35] : [0.1, 0.85, 1.0], 4));
    ring.position.set(cx, gy + 10 + k * 3.6, cz); ring.rotation.x = Math.PI / 2 + (k - 1) * 0.18; g.add(ring); rings.push(ring);
  }
  const lights = [];
  const pl1 = new THREE.PointLight(0x40d0ff, 260, 30, 1.6); pl1.position.set(cx, gy + 12, cz); g.add(pl1); lights.push(pl1);

  // ---- raised deck along the back (west) with wide steps and a glass rail
  const deckW = 12, deckY = P.deckY, dz0 = P.z0 + 3, dz1 = P.z1 - 3, dx0 = P.x0, dx1 = P.x0 + deckW;
  boxC(deckW, deckY, dz1 - dz0, concrete, (dx0 + dx1) / 2, 0, (dz0 + dz1) / 2);
  add(new THREE.BoxGeometry(0.18, 0.08, dz1 - dz0), glow([1.0, 0.75, 0.45], 2.2), dx1 + 0.02, deckY - 0.3, (dz0 + dz1) / 2); // fascia light
  const nSteps = Math.round(deckY / 0.3), run = 0.42, sw = 18;
  for (let i = 0; i < nSteps; i++) {
    const h = (i + 1) * (deckY / nSteps);
    boxC(run, h, sw, concrete, dx1 + (nSteps - i - 0.5) * run, 0, cz);
  }
  // glass rail + posts on the deck edge (leaving the stair opening)
  const glass = new THREE.MeshStandardNodeMaterial({ color: 0x3a5060, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.35 });
  for (const [z0, z1] of [[dz0, cz - sw / 2], [cz + sw / 2, dz1]]) {
    if (z1 - z0 < 1) continue;
    add(new THREE.BoxGeometry(0.04, 1.05, z1 - z0), glass, dx1 - 0.15, deckY + 0.55, (z0 + z1) / 2);
    add(new THREE.BoxGeometry(0.06, 0.06, z1 - z0), darkMetal, dx1 - 0.15, deckY + 1.1, (z0 + z1) / 2);
  }
  // deck storefront band (lit shop windows under a canopy) facing the square
  const shopMat = new THREE.MeshBasicNodeMaterial(); shopMat.colorNode = vec3(1.0, 0.72, 0.42).mul(0.9);
  add(new THREE.BoxGeometry(0.05, 2.6, dz1 - dz0 - 2), shopMat, dx0 + 0.6, deckY + 1.5, (dz0 + dz1) / 2);

  // ---- benches + lamp posts around the monument
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4 + Math.PI / 8, r = 9.5;
    const bx = cx + Math.cos(a) * r, bz = cz + Math.sin(a) * r;
    add(new THREE.BoxGeometry(2.2, 0.45, 0.6), concrete, bx, gy + 0.22, bz, -a);
    add(new THREE.BoxGeometry(2.2, 0.06, 0.04), glow([0.1, 0.8, 1.0], 1.5), bx, gy + 0.06, bz, -a);
  }
  const lampMat = glow([1.0, 0.82, 0.6], 4);
  for (const [lx, lz] of [[cx - 15, cz - 15], [cx - 15, cz + 15], [cx + 15, cz - 15], [cx + 15, cz + 15]]) {
    add(new THREE.CylinderGeometry(0.09, 0.12, 6, 8), darkMetal, lx, gy + 3, lz);
    add(new THREE.BoxGeometry(0.9, 0.12, 0.4), lampMat, lx, gy + 6, lz);
    const pl = new THREE.PointLight(0xffd2a0, 60, 16, 1.6); pl.position.set(lx, gy + 5.6, lz); g.add(pl); lights.push(pl);
  }
  // ---- reflecting pool around the plinth (dark mirror water, cyan inset rim) and ground light lines
  const water = new THREE.MeshStandardNodeMaterial({ color: 0x04070b, roughness: 0.04, metalness: 0.65 });
  const rimMat = glow([0.1, 0.85, 1.0], 2.2);
  const ph = 7.2; // pool half size
  for (const [w, d, x, z] of [[2 * ph, ph - 4.5, cx, cz - (ph + 4.5) / 2], [2 * ph, ph - 4.5, cx, cz + (ph + 4.5) / 2], [ph - 4.5, 9, cx - (ph + 4.5) / 2, cz], [ph - 4.5, 9, cx + (ph + 4.5) / 2, cz]]) {
    add(new THREE.BoxGeometry(w, 0.06, d), water, x, gy + 0.03, z);
  }
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(2 * ph + 0.3, 0.08, 0.15), rimMat, cx, gy + 0.04, cz + s * (ph + 0.07));
    add(new THREE.BoxGeometry(0.15, 0.08, 2 * ph + 0.3), rimMat, cx + s * (ph + 0.07), gy + 0.04, cz);
  }
  const lineMat = glow([0.1, 0.8, 1.0], 1.4), lineMatR = glow([1.0, 0.22, 0.4], 1.6);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    // diagonal inlays from the pool corners toward the square's corners
    const len = 15, a = Math.atan2(sz, sx);
    const mx = cx + sx * (ph + 0.3) + Math.cos(a) * len / 2, mz = cz + sz * (ph + 0.3) + Math.sin(a) * len / 2;
    add(new THREE.BoxGeometry(len, 0.03, 0.1), sx > 0 ? lineMat : lineMatR, mx, gy + 0.012, mz, -a);
  }

  // ---- raised planters (young palms are placed by landmarks/index.js on top)
  const planterMat = new THREE.MeshStandardNodeMaterial({ color: 0x2c2e33, roughness: 0.8 });
  const soil = new THREE.MeshStandardNodeMaterial({ color: 0x1a1612, roughness: 1 });
  for (const p of plazaPlanters(L)) {
    boxC(p.w, p.h, p.d, planterMat, p.x, gy, p.z);
    add(new THREE.BoxGeometry(p.w - 0.4, 0.04, p.d - 0.4), soil, p.x, gy + p.h + 0.01, p.z);
    add(new THREE.BoxGeometry(p.w + 0.04, 0.05, 0.05), glow([1.0, 0.7, 0.4], 1.8), p.x, gy + p.h - 0.08, p.z + p.d / 2 + 0.01);
    add(new THREE.BoxGeometry(p.w + 0.04, 0.05, 0.05), glow([1.0, 0.7, 0.4], 1.8), p.x, gy + p.h - 0.08, p.z - p.d / 2 - 0.01);
  }

  // ---- food kiosks along the north edge: counter, slanted canopy, lit name board, menu light box
  const kioskNames = [['NOODLE', [1.0, 0.25, 0.3]], ['TACO', [1.0, 0.8, 0.2]], ['BOBA', [0.25, 0.9, 1.0]], ['KEBAB', [1.0, 0.35, 0.8]]];
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
  const c2 = cv.getContext('2d');
  kioskNames.forEach(([name, col], i) => {
    const y0 = i * 128;
    c2.fillStyle = '#07080b'; c2.fillRect(0, y0, 1024, 128);
    const css = `rgb(${col.map((v) => Math.round(v * 255)).join(',')})`;
    c2.strokeStyle = css; c2.lineWidth = 6; c2.strokeRect(10, y0 + 10, 1004, 108);
    c2.fillStyle = css; c2.font = '900 82px "Arial Black", Arial, sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
    c2.fillText(name, 512, y0 + 68);
  });
  const boardTex = new THREE.CanvasTexture(cv); boardTex.colorSpace = THREE.SRGBColorSpace; boardTex.generateMipmaps = false; boardTex.minFilter = THREE.LinearFilter;
  const kx = [cx - 6.5, cx, cx + 6.5, cx + 17.5], kz = P.z0 + 3.2;
  const counterMat = new THREE.MeshStandardNodeMaterial({ color: 0x1c1d22, roughness: 0.6, metalness: 0.3 });
  kx.forEach((x, i) => {
    const [, col] = kioskNames[i];
    boxC(4.4, 1.1, 1.0, counterMat, x, gy, kz + 1.2);                                  // counter
    boxC(4.4, 2.9, 0.25, counterMat, x, gy, kz - 1.2);                                 // back wall
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.1, 2.9, 0.1), darkMetal, x + s * 2.15, gy + 1.45, kz + 1.65);
    const canopy = add(new THREE.BoxGeometry(5.0, 0.1, 3.6), new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(...col).multiplyScalar(0.35), roughness: 0.7 }), x, gy + 3.05, kz + 0.3);
    canopy.rotation.x = -0.12;
    add(new THREE.BoxGeometry(5.0, 0.08, 0.06), glow(col, 2.4), x, gy + 2.86, kz + 2.12);  // canopy edge light
    add(new THREE.BoxGeometry(4.2, 1.6, 0.06), glow([1.0, 0.86, 0.62], 1.3), x, gy + 1.9, kz - 1.05); // lit back menu
    const bm = new THREE.MeshBasicNodeMaterial();
    bm.colorNode = texture(boardTex, vec2(uv().x, uv().y.mul(0.25).add(0.75 - i * 0.25))).rgb.mul(2.2);
    add(new THREE.PlaneGeometry(4.2, 0.55), bm, x, gy + 3.55, kz + 2.0).rotation.x = -0.05;
    add(new THREE.BoxGeometry(4.2, 0.03, 0.9), glow([1.0, 0.8, 0.55], 1.2), x, gy + 1.12, kz + 1.2); // lit counter top
  });
  for (const x of [cx - 3.2, cx + 12]) {
    const pl = new THREE.PointLight(0xffb070, 70, 14, 1.6); pl.position.set(x, gy + 2.6, kz + 3); g.add(pl); lights.push(pl);
  }

  // ---- bollards along the boulevard edge of the square
  const xi = -(L.avenue.roadHalfWidth + L.avenue.sidewalkWidth + 0.6);
  const bolGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.9, 8), capGeo = new THREE.CylinderGeometry(0.125, 0.125, 0.06, 8);
  const bolN = Math.floor((P.z1 - P.z0 - 4) / 3);
  const bol = new THREE.InstancedMesh(bolGeo, darkMetal, bolN), cap = new THREE.InstancedMesh(capGeo, glow([0.1, 0.85, 1.0], 2.5), bolN);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < bolN; i++) {
    const z = P.z1 - 2 - i * 3;
    m4.makeTranslation(xi - 0.5, gy + 0.45, z); bol.setMatrixAt(i, m4);
    m4.makeTranslation(xi - 0.5, gy + 0.78, z); cap.setMatrixAt(i, m4);
  }
  g.add(bol, cap);

  root.add(g);

  if (ctx.physics?.world && ctx.physics.RAPIER) {
    const { RAPIER, world } = ctx.physics;
    for (const [x, y, z, hx, hy, hz] of colliders) world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z));
  }
  console.log(`[landmarks] plaza: monument, deck, ${nSteps} steps, ${lights.length} lights`);
  return {
    update(dt) {
      prism.rotation.y += dt * 0.25;
      rings.forEach((r, i) => { r.rotation.z += dt * (i === 1 ? -0.4 : 0.3); });
    },
  };
}
