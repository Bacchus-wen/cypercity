// Holographic ad material shared by the restyle's plaza monument and the boulevard intersection holograms, and the
// intersection holograms themselves: over each boulevard intersection a pair of crossed, slowly turning holo panels
// floats ~20-40 m up between two light rings, fed by a light beam from a projector on the median nose.
import * as THREE from 'three/webgpu';
import { uv, vec2, vec3, float, mix, texture, time, sin, fract, step, clamp, max } from 'three/tsl';

// additive holographic panel: one quarter of a 4-panel ad atlas, scanlines + stepped flicker
export function holoMat(map, cell, intensity) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const u = uv();
  const c = texture(map, vec2(float(cell * 0.25 + 0.004).add(u.x.mul(0.242)), u.y)).rgb;
  const scan = sin(u.y.mul(420).add(time.mul(4))).mul(0.12).add(0.88);
  const flick = mix(float(1), step(0.05, fract(sin(time.mul(9).floor().add(cell)).mul(43758.5))), 0.5);
  m.colorNode = c.mul(intensity).mul(scan).mul(flick);
  m.opacityNode = clamp(max(c.r, max(c.g, c.b)).mul(1.6), 0, 1);
  m.fog = false;
  m.lineMask = 1;
  return m;
}

const glow = (c, i) => { const m = new THREE.MeshBasicNodeMaterial(); m.colorNode = vec3(...c).mul(i); m.lineMask = 1; return m; };

export function buildIntersectionHolos(ctx, tex, root) {
  const L = ctx.layout, A = L.avenue, C = L.crossStreets;
  if (!A.medianHalf) return null;
  const maps = [tex.ads, tex.ads3].filter(Boolean); // (four-panel atlases only; holo_ads2 is a two-row layout)
  if (!maps.length) return null;
  const g = new THREE.Group(); g.name = 'intersection_holos';
  const spinners = [];
  const ringCols = [[0.1, 0.85, 1.0], [1.0, 0.2, 0.5], [1.0, 0.7, 0.2]];
  C.zs.forEach((zc, i) => {
    const y0 = 21 + (i % 2) * 3, H = 17, W = H * 0.5;
    const holo = new THREE.Group(); holo.position.set(0, y0, zc); g.add(holo);
    const map = maps[i % maps.length];
    for (let k = 0; k < 2; k++) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(W, H), holoMat(map, (Math.floor(i / maps.length) * 2 + k) % 4, 3.2));
      pl.position.y = H / 2; pl.rotation.y = k * Math.PI / 2; pl.renderOrder = 6;
      holo.add(pl);
    }
    const col = ringCols[i % ringCols.length];
    const rings = [];
    for (const [r, y, tilt] of [[W * 0.85, 0, 0.12], [W * 0.7, H + 0.6, -0.16]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 6, 80), glow(col, 4));
      ring.position.set(0, y0 + y, zc); ring.rotation.x = Math.PI / 2 + tilt; g.add(ring); rings.push(ring);
    }
    // projector on the south median nose and its beam up to the base ring
    const pz = zc + C.roadHalfWidth + 7.6;
    const proj = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.9, 10), new THREE.MeshStandardNodeMaterial({ color: 0x1a1b20, roughness: 0.4, metalness: 0.7 }));
    proj.position.set(0, (A.curbHeight || 0.15) + 0.45, pz); g.add(proj);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 10), glow(col, 5));
    lens.position.set(0, (A.curbHeight || 0.15) + 0.92, pz); g.add(lens);
    const from = new THREE.Vector3(0, 1.1, pz), to = new THREE.Vector3(0, y0, zc);
    const len = from.distanceTo(to);
    const beamMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const bu = uv();
    beamMat.colorNode = vec3(...col).mul(0.45).mul(sin(bu.y.mul(60).sub(time.mul(6))).mul(0.25).add(0.75));
    beamMat.opacityNode = float(0.3);
    beamMat.fog = false; beamMat.lineMask = 1;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.22, len, 8, 1, true), beamMat);
    beam.position.copy(from).add(to).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    beam.renderOrder = 5; g.add(beam);
    const light = new THREE.PointLight(new THREE.Color(...col), 220, 40, 1.6); light.position.set(0, y0 - 2, zc); g.add(light);
    spinners.push({ holo, rings, speed: 0.1 + i * 0.03 });
  });
  root.add(g);
  console.log(`[landmarks] intersection holograms: ${spinners.length}`);
  return {
    update(dt) {
      for (const s of spinners) {
        s.holo.rotation.y += dt * s.speed;
        s.rings[0].rotation.z += dt * 0.35; s.rings[1].rotation.z -= dt * 0.28;
      }
    },
  };
}
