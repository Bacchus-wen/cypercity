// Restyle LED ribbons (?art=legacy skips): tall vertical LED screens hung on a corner of the boulevard-facing facade of
// the tallest boulevard buildings - scrolling chevrons, data blocks or colour waves. Planned right after the massing,
// before the facade API is built, so the signage treats them as blocked wall (lot.blocks) and never overlaps them.
import * as THREE from 'three/webgpu';
import { attribute, uv, vec3, time, sin, fract, floor, step, abs, mix, smoothstep, max } from 'three/tsl';
import { sideFrame } from './architecture.js';
import { STYLES } from './plan.js';

const P = (fr, s, y, off) => [fr.origin[0] + fr.right[0] * s + fr.normal[0] * off, y, fr.origin[2] + fr.right[2] * s + fr.normal[2] * off];
const RIB_W = 2.6;

export function planLedWraps(lots, L, maxCount = 16) {
  const cands = [];
  for (const lot of lots) {
    if (!lot.volumes?.length || lot.overlook || lot.h < 34) continue;
    const f = lot.fronts.find((q) => q.district === 'avenue' && !q.lane && (q.side === 'nx' || q.side === 'px'));
    if (!f) continue;
    // balconies run the full facade width on every floor (props.js rule) - a fin would cut through them
    const st = STYLES[lot.style];
    if (lot.detail === 'hi' && st && st.balcony > 0 && ((lot.seed * 97) % 1) < st.balcony) continue;
    const v = (lot.overhang && f.side === lot.overhangSide) ? lot.volumes[1] : lot.volumes[0];
    const fr = sideFrame(v, f.side, 0);
    if (fr.width < RIB_W + 4) continue;
    const plane = f.side === 'nx' ? v.x0 : v.x1;
    // the street plane's flush (non-gap) volumes give the height the ribbon can hang over
    let yTop = 0;
    for (const u of lot.volumes) if (!u.isGap && Math.abs((f.side === 'nx' ? u.x0 : u.x1) - plane) < 0.3) yTop = Math.max(yTop, u.y1);
    const y0 = Math.max(10, lot.groundH + 6.5), y1 = yTop - 1.6;
    if (y1 - y0 < 18) continue;
    cands.push({ lot, f, fr, y0, y1 });
  }
  cands.sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0));
  const out = [];
  for (const c of cands) {
    if (out.length >= maxCount) break;
    const { lot, f, fr, y0, y1 } = c;
    const free = (s) => !(lot.blocks || []).some((b) => {
      if (b.side !== f.side || b.y1 < y0 || b.y0 > y1) return false;
      const a0 = (b.p0[0] - fr.origin[0]) * fr.right[0] + (b.p0[2] - fr.origin[2]) * fr.right[2];
      const a1 = (b.p1[0] - fr.origin[0]) * fr.right[0] + (b.p1[2] - fr.origin[2]) * fr.right[2];
      return Math.max(a0, a1) > s - RIB_W / 2 - 0.4 && Math.min(a0, a1) < s + RIB_W / 2 + 0.4;
    });
    const first = lot.id % 2 ? fr.width - RIB_W / 2 - 1.0 : RIB_W / 2 + 1.0;
    const s = free(first) ? first : free(fr.width - first) ? fr.width - first : null;
    if (s == null) continue;
    (lot.blocks ||= []).push({ side: f.side, p0: P(fr, s - RIB_W / 2 - 0.3, 0, 0), p1: P(fr, s + RIB_W / 2 + 0.3, 0, 0), y0: y0 - 0.5, y1: y1 + 0.5 });
    // a fin standing out of the wall (perpendicular to the facade), so it faces the views up and down the boulevard
    const root = P(fr, s, 0, 0);
    (lot.leds ||= []).push({ x: root[0], z: root[2], y0, y1 });
    const c3 = P(fr, s, (y0 + y1) / 2, RIB_W / 2 + 0.3);
    out.push({ center: c3, normal: fr.right, right: fr.normal, w: RIB_W, h: y1 - y0, seed: ((lot.id * 2654435761) >>> 0) / 4294967296 });
  }
  return out;
}

export function buildLedWraps(plan) {
  if (!plan.length) return [];
  const n = plan.length;
  const geo = new THREE.PlaneGeometry(1, 1);
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const sd = attribute('aSeed', 'float'), H = attribute('aH', 'float');
  const u = uv().x, vm = uv().y.mul(H); // v in metres up the ribbon
  const kind = floor(sd.mul(3));
  const red = vec3(1.0, 0.16, 0.22), amber = vec3(1.0, 0.62, 0.16), cyan = vec3(0.2, 0.9, 1.0), white = vec3(0.92, 0.95, 1.0), mag = vec3(1.0, 0.25, 0.7);
  // 0: chevrons racing down
  const chev = step(0.5, fract(vm.mul(0.55).add(abs(u.sub(0.5)).mul(1.4)).add(time.mul(1.6).add(sd.mul(10)))));
  const c0 = mix(red.mul(0.25), mix(red, amber, step(0.5, fract(vm.mul(0.04).add(sd)))), chev);
  // 1: data blocks (6 columns, 0.45 m rows, random cells blinking)
  const col = floor(u.mul(6)), row = floor(vm.div(0.45));
  const h = fract(sin(col.mul(12.9898).add(row.mul(78.233)).add(floor(time.mul(3).add(col.mul(0.7))))).mul(43758.5453));
  const cell = step(0.58, h).mul(step(0.12, fract(u.mul(6))).mul(step(0.15, fract(vm.div(0.45)))));
  const c1 = mix(cyan.mul(0.08), mix(cyan, white, step(0.9, h)), cell);
  // 2: colour wave with scanlines
  const wave = sin(vm.mul(0.22).sub(time.mul(1.4)).add(u.mul(2.0)).add(sd.mul(20))).mul(0.5).add(0.5);
  const c2 = mix(mag, cyan, wave).mul(sin(vm.mul(18)).mul(0.15).add(0.85));
  const c = mix(mix(c0, c1, step(0.5, kind)), c2, step(1.5, kind));
  const edge = max(smoothstep(0.035, 0.0, u), smoothstep(0.965, 1.0, u)); // bright frame lines
  m.colorNode = mix(c, white, edge.mul(0.8)).mul(2.4);
  m.lineMask = 1;
  // two screen faces per fin (one each side of a thin steel frame)
  const im = new THREE.InstancedMesh(geo, m, n * 2);
  const back = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardNodeMaterial({ color: 0x101114, roughness: 0.5, metalness: 0.6 }), n);
  const seed2 = new Float32Array(n * 2), hgt2 = new Float32Array(n * 2);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pv = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
  plan.forEach((p, i) => {
    const nrm = new THREE.Vector3(...p.normal);
    Q.setFromUnitVectors(Z, nrm);
    back.setMatrixAt(i, M.compose(Pv.set(...p.center), Q, S.set(p.w + 0.24, p.h + 0.24, 0.12)));
    for (let k = 0; k < 2; k++) {
      const c = new THREE.Vector3(...p.center).addScaledVector(nrm, k ? -0.075 : 0.075);
      im.setMatrixAt(i * 2 + k, M.compose(c, Q, S.set(p.w, p.h, 1)));
      seed2[i * 2 + k] = p.seed; hgt2[i * 2 + k] = p.h;
    }
  });
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed2, 1));
  geo.setAttribute('aH', new THREE.InstancedBufferAttribute(hgt2, 1));
  im.computeBoundingSphere(); back.computeBoundingSphere();
  im.name = 'led_ribbons'; back.name = 'led_ribbon_backs';
  console.log(`[buildings] LED ribbons: ${n}`);
  return [back, im];
}
