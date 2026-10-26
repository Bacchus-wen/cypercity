import * as THREE from 'three/webgpu';
import {
  positionGeometry, normalGeometry, vec2, vec3, float, mix, smoothstep, step, abs, fract, floor, hash, max, min, clamp,
  length, sin, time, instancedBufferAttribute, uniform, mx_noise_float, positionWorld, instanceIndex,
} from 'three/tsl';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch, profileGeometry, beamBetween, cuboid, groundY, mulberry32, unitBox } from './util.js';
import { surface, metal, emissiveMat, U } from './materials.js';
import { ART_RESTYLE } from '../restyleArt.js';

// Elevated commuter rail viaduct + catenary + animated trains.
export function buildRail(ctx, tex, root) {
  const L = ctx.layout.elevatedRail;
  const H = L.height; // deck top
  const Z = L.z;
  const x0 = L.xStart, x1 = L.xEnd;
  const b = new Batch();
  const rng = mulberry32(1401);
  const halfW = L.width / 2;
  const tracks = [{ z: Z - 2.0, dir: 1 }, { z: Z + 2.0, dir: -1 }]; // left-hand running: eastbound on north (-z) track
  const river = ctx.layout.river;

  // ---------- deck (box girder), chunked every 40m ----------
  const prof = [[-halfW, 0], [-halfW, -0.28], [-3.0, -0.5], [-2.4, -2.5], [2.4, -2.5], [3.0, -0.5], [halfW, -0.28], [halfW, 0]];
  for (let x = x0; x < x1; x += 40) {
    const g = profileGeometry(prof, x + 0.03, Math.min(x1, x + 40) - 0.03);
    b.add('concrete', g, 0, H, Z);
    // parapets with cap
    for (const s of [-1, 1]) {
      b.box('concrete', 40 - 0.06, 1.25, 0.24, x + 20, H + 0.62, Z + s * (halfW - 0.12));
      b.box('concreteDark', 40 - 0.06, 0.1, 0.4, x + 20, H + 1.27, Z + s * (halfW - 0.1));
      // drip edge / outer fascia strip
      b.box('concreteDark', 40 - 0.06, 0.32, 0.12, x + 20, H - 0.2, Z + s * (halfW + 0.05));
      // cable trough inside parapet
      b.box('concreteDark', 40 - 0.06, 0.35, 0.5, x + 20, H + 0.17, Z + s * (halfW - 0.55));
    }
    // expansion joint dark gap line handled by 0.06 gaps
  }
  // ---------- track: slab blocks + rails ----------
  for (const t of tracks) {
    for (let x = x0; x < x1; x += 5) {
      b.box('slab', 4.92, 0.22, 2.3, x + 2.5, H + 0.11, t.z);
    }
    for (const s of [-0.5335, 0.5335]) {
      b.box('rail', x1 - x0, 0.16, 0.075, (x0 + x1) / 2, H + 0.3, t.z + s);
    }
  }
  // ---------- pillars ----------
  const pillarXs = [];
  for (let x = x0 + 16; x < x1; x += 32) {
    if (Math.abs(x) < 16) continue; // avenue handled explicitly
    if (x > river.xCenter - river.halfWidth - 20 && x < river.xCenter + river.halfWidth + 20) continue;
    pillarXs.push(x);
  }
  // (restyle map: one central column on the boulevard median instead of a pair at the kerbs)
  pillarXs.push(...(ctx.layout.avenue.medianHalf ? [0] : [-12.5, 12.5]), river.xCenter - river.halfWidth - 15, river.xCenter, river.xCenter + river.halfWidth + 15);
  const colGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
  colGeo.rotateY(Math.PI / 8);
  const capProf = [[-3.6, 0], [-3.6, -0.6], [-1.4, -2.0], [1.4, -2.0], [1.4, -2.0], [3.6, -0.6], [3.6, 0]];
  for (const px of pillarXs) {
    const inRiver = px > river.xCenter - river.halfWidth && px < river.xCenter + river.halfWidth;
    const gy = inRiver ? river.waterLevel - 3 : groundY(ctx, px, Z);
    const top = H - 2.5 - 2.0; // under cap
    const h = top - gy;
    b.add('concrete', colGeo, px, gy + h / 2, Z, 0, 0, 0, 1.05, h, 1.45);
    // cap (pier head)
    b.add('concrete', profileGeometry(capProf, px - 1.2, px + 1.2), 0, H - 2.5, Z);
    // bearings
    for (const s of [-1.6, 1.6]) b.box('darkMetal', 0.9, 0.12, 0.9, px, H - 2.56, Z + s);
    // footing
    if (inRiver) b.box('concrete', 4.5, 3.6, 5.0, px, river.waterLevel - 1.2, Z, 0);
    else b.box('concreteDark', 2.9, 0.5, 3.6, px, gy + 0.2, Z);
    // drain pipe
    b.box('darkMetal', 0.16, h, 0.16, px + 1.0, gy + h / 2, Z + 1.25);
    cuboid(ctx, px, gy + h / 2, Z, 1.1, h / 2, 1.5);
  }
  // deck collider
  cuboid(ctx, (x0 + x1) / 2, H - 1.25, Z, (x1 - x0) / 2, 1.25, halfW);

  // ---------- underside LED fixtures ----------
  const lights = [];
  for (let x = x0 + 5; x < x1; x += 10) {
    for (const s of [-1.5, 1.5]) b.box('ledCool', 1.6, 0.06, 0.18, x, H - 2.53, Z + s);
    b.box('darkMetal', 1.8, 0.1, 0.3, x, H - 2.47, Z - 1.5);
    b.box('darkMetal', 1.8, 0.1, 0.3, x, H - 2.47, Z + 1.5);
  }
  // emissive accent strip along outer fascias (segmented)
  for (let x = x0; x < x1; x += 40) {
    for (const s of [-1, 1]) b.box('ledAccent', 39.0, 0.035, 0.03, x + 20, H - 0.36, Z + s * (halfW + 0.12));
  }
  for (let x = -150; x <= 270; x += 18) {
    const l = new THREE.PointLight(0xbfd6ff, 70, 20, 1.6);
    l.position.set(x, H - 3.2, Z);
    root.add(l); lights.push(l);
  }

  // ---------- catenary ----------
  const masts = [];
  for (let x = x0 + 25; x < x1; x += 50) masts.push(x);
  for (let i = 0; i < masts.length; i++) {
    const mx = masts[i];
    for (const s of [-1, 1]) {
      // H-section mast
      b.box('steel', 0.28, 7.6, 0.08, mx, H + 3.8, Z + s * 4.05);
      b.box('steel', 0.06, 7.6, 0.3, mx, H + 3.8, Z + s * 4.05);
      b.box('steel', 0.5, 0.3, 0.5, mx, H + 0.15, Z + s * 4.05);
      // insulators / cantilever arms to each track
      for (const t of tracks) {
        const stagger = (i % 2 ? 0.2 : -0.2);
        const a = new THREE.Vector3(mx, H + 6.15, t.z + stagger);
        beamBetween(b, 'steel', new THREE.Vector3(mx, H + 6.6, t.z + stagger), a, 0.06, 0.06);
        beamBetween(b, 'steel', a, new THREE.Vector3(mx, H + 5.1, t.z + stagger), 0.04, 0.04);
        b.box('insul', 0.12, 0.35, 0.12, mx, H + 5.4, t.z + stagger);
      }
    }
    // truss crossbeam
    const ya = H + 6.6, yb = H + 7.3;
    for (const y of [ya, yb]) b.box('steel', 0.14, 0.14, 8.4, mx, y, Z);
    for (let k = 0; k < 8; k++) {
      const za = Z - 4.05 + k * (8.1 / 8), zb = za + 8.1 / 8;
      beamBetween(b, 'steel', new THREE.Vector3(mx, k % 2 ? ya : yb, za), new THREE.Vector3(mx, k % 2 ? yb : ya, zb), 0.05, 0.05);
    }
  }
  // wires (sagging catenary between masts)
  const wire = (y0, sag, z0, z1, xa, xb, th = 0.022) => {
    const n = 8;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const ya = y0 - sag * 4 * t0 * (1 - t0), yb = y0 - sag * 4 * t1 * (1 - t1);
      beamBetween(b, 'wire', new THREE.Vector3(xa + (xb - xa) * t0, ya, z0 + (z1 - z0) * t0), new THREE.Vector3(xa + (xb - xa) * t1, yb, z0 + (z1 - z0) * t1), th, th);
    }
  };
  const allM = [x0, ...masts, x1];
  for (let i = 0; i < allM.length - 1; i++) {
    const xa = allM[i], xb = allM[i + 1];
    for (const t of tracks) {
      const sa = i % 2 ? -0.2 : 0.2, sb = -sa;
      wire(H + 6.15, 0.55, t.z + sa, t.z + sb, xa, xb); // messenger
      wire(H + 5.1, 0.0, t.z + sa, t.z + sb, xa, xb, 0.018); // contact
      for (let d = 1; d < 8; d++) {
        const tt = d / 8; const xm = xa + (xb - xa) * tt; const zm = t.z + sa + (sb - sa) * tt;
        const ym = H + 6.15 - 0.55 * 4 * tt * (1 - tt);
        b.box('wire', 0.012, ym - (H + 5.1), 0.012, xm, (ym + H + 5.1) / 2, zm);
      }
    }
    for (const s of [-1, 1]) wire(H + 7.55, 0.8, Z + s * 4.05, Z + s * 4.05, xa, xb, 0.03); // feeders
  }

  const concreteMat = surface({ map: tex.concrete, nmap: tex.concrete_n, rmap: tex.concrete_r }, { uvScale: 1 / 4, tint: [0.95, 0.93, 0.9], normalScale: 1.2, macro: 0.6 });
  const concreteDark = surface({ map: tex.concrete, nmap: tex.concrete_n, rmap: tex.concrete_r }, { uvScale: 1 / 3, tint: [0.55, 0.55, 0.56], normalScale: 1.0 });
  const slabMat = surface({ map: tex.concrete, nmap: tex.concrete_n, rmap: tex.concrete_r }, { uvScale: 1 / 2, tint: [0.7, 0.68, 0.64], streaks: false });
  const mats = {
    concrete: concreteMat, concreteDark, slab: slabMat,
    rail: metal({ color: [0.5, 0.48, 0.46], rough: 0.25, metal: 1 }),
    darkMetal: metal({ color: [0.07, 0.07, 0.075], rough: 0.5 }),
    steel: metal({ color: [0.32, 0.34, 0.36], rough: 0.45, metal: 0.8 }),
    wire: metal({ color: [0.08, 0.08, 0.08], rough: 0.4, metal: 0.6 }),
    insul: metal({ color: [0.45, 0.3, 0.2], rough: 0.25, metal: 0 }),
    ledCool: emissiveMat([0.8, 0.9, 1.0], 9),
    ledAccent: emissiveMat([1.0, 0.82, 0.6], 3),
  };
  const worldUV = { concrete: 1, concreteDark: 1, slab: 1 };
  const g = b.build(mats, { worldUV, chunk: 80 });
  g.name = 'elevatedRail';
  root.add(g);

  const trains = buildTrains(ctx, root, tracks, H);
  return {
    api: { z: Z, height: H, railTop: H + 0.38, width: L.width, xStart: x0, xEnd: x1, tracks, pillars: pillarXs, trains: trains.state },
    update: trains.update,
  };
}

// ---------------- trains ----------------
function carProfile() {
  // (z, y) relative to rail top; y from body bottom 0.95 to roof 3.95
  const pts = [];
  pts.push([-1.42, 0.98]);
  pts.push([-1.48, 1.5]);
  pts.push([-1.49, 2.3]);
  pts.push([-1.46, 2.9]);
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (1 - i / 8);
    const zz = Math.cos(a) * 1.46; const yy = 2.9 + Math.sin(a) * 0.98;
    if (i > 0 && i < 8) pts.push([zz, Math.min(3.92, yy)]);
  }
  pts.push([1.46, 2.9]);
  pts.push([1.49, 2.3]);
  pts.push([1.48, 1.5]);
  pts.push([1.42, 0.98]);
  return pts;
}

function makeCarGeometry(cab) {
  const len = 19.5;
  const shape = new THREE.Shape(carProfile().map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: len, steps: cab ? 40 : 4, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.06, bevelSegments: 2, curveSegments: 6 });
  // shape XY -> (z,y), extrude Z -> x
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
  g.applyMatrix4(m);
  g.translate(-len / 2, 0, 0);
  const pos = g.attributes.position;
  const nonIdx = g.index ? g.toNonIndexed() : g;
  const p = nonIdx.attributes.position;
  // swap winding
  for (let i = 0; i < p.count; i += 3) {
    for (let k = 0; k < 3; k++) { const t = p.array[(i + 1) * 3 + k]; p.array[(i + 1) * 3 + k] = p.array[(i + 2) * 3 + k]; p.array[(i + 2) * 3 + k] = t; }
  }
  if (cab) {
    // slanted, rounded nose at +x
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (x > len / 2 - 2.6) {
        const t = (x - (len / 2 - 2.6)) / 2.6; // 0..1
        const yN = (y - 0.98) / 3.0; // 0..1
        x -= t * (yN * yN) * 1.1;
        // round plan shape corners
        const zf = 1 - 0.18 * t * t;
        z *= zf;
        p.setXYZ(i, x, y, z);
      }
    }
  }
  nonIdx.deleteAttribute('uv');
  nonIdx.deleteAttribute('normal');
  return toCreasedNormals(nonIdx, Math.PI / 5);
}

function buildTrains(ctx, root, tracks, H) {
  const CARS = 6, CAR_LEN = 20.0;
  const cabGeo = makeCarGeometry(true);
  const midGeo = makeCarGeometry(false);
  const nTrains = 2;
  const nCab = nTrains * 2, nMid = nTrains * (CARS - 2);

  const makeBodyMat = (isCab) => {
    const m = new THREE.MeshStandardNodeMaterial();
    const p = positionGeometry;
    const ng = normalGeometry;
    const head = instancedBufferAttribute(isCab ? cabHead : midHead); // 1 = front (white lights), 0 = rear (red)
    const stripeC = instancedBufferAttribute(isCab ? cabStripe : midStripe);
    const side = smoothstep(0.55, 0.8, abs(ng.z));
    const x = p.x, y = p.y;
    // window band
    const inBand = smoothstep(1.5, 1.53, y).mul(smoothstep(2.68, 2.65, y));
    const cellW = float(1.25);
    const cx = x.div(cellW);
    const cid = floor(cx);
    const fx = fract(cx);
    const winX = smoothstep(0.1, 0.13, fx).mul(smoothstep(0.9, 0.87, fx));
    // doors at fixed positions
    const doorD = min(min(abs(x.sub(-7.0)), abs(x.sub(-2.35))), min(abs(x.sub(2.35)), abs(x.sub(7.0))));
    const inDoor = step(doorD, 0.68);
    const doorGlass = smoothstep(0.62, 0.58, doorD).mul(smoothstep(0.03, 0.06, doorD)).mul(smoothstep(1.45, 1.48, y)).mul(smoothstep(2.7, 2.67, y));
    const ends = smoothstep(9.1, 9.0, abs(x));
    const glassSide = mix(inBand.mul(winX), doorGlass, inDoor).mul(ends).mul(side);
    // passengers: silhouettes inside each window cell
    const hcell = hash(cid.add(float(instanceIndex).mul(31.0)).add(stripeC.x.mul(311.0)).add(step(0, p.z).mul(57.0)));
    const occ = step(0.38, hcell); // occupied
    const standing = step(0.75, hcell);
    const px = fract(hcell.mul(13.7)).mul(0.5).add(0.25);
    const headY = mix(float(1.98), float(2.36), standing);
    const dxp = fx.sub(px).mul(cellW);
    const headD = length(vec2(dxp, y.sub(headY).mul(0.85)));
    const headM = smoothstep(0.13, 0.11, headD);
    const bodyM = smoothstep(0.26, 0.22, abs(dxp)).mul(step(y, headY.sub(0.12)));
    const sil = max(headM, bodyM).mul(occ);
    // second, farther person (dimmer)
    const h2 = fract(hcell.mul(91.3));
    const px2 = fract(h2.mul(7.1)).mul(0.6).add(0.2);
    const d2 = fx.sub(px2).mul(cellW);
    const sil2 = max(smoothstep(0.1, 0.085, length(vec2(d2, y.sub(2.32)))), smoothstep(0.19, 0.16, abs(d2)).mul(step(y, 2.2))).mul(step(0.55, h2));
    const ceiling = smoothstep(2.5, 2.6, y);
    const interior = vec3(1.0, 0.96, 0.88).mul(mix(float(2.6), float(5.0), ceiling));
    const silMix = max(sil, sil2.mul(0.6));
    const winEmit = interior.mul(mix(float(1), float(0.06), silMix));
    // body colour: stainless + stripe
    const stripe = smoothstep(1.02, 1.05, y).mul(smoothstep(1.36, 1.33, y)).add(smoothstep(2.74, 2.77, y).mul(smoothstep(2.86, 2.83, y)));
    const steel = vec3(0.6, 0.62, 0.65).mul(mx_noise_float(vec3(x.mul(0.3), y.mul(4), p.z)).mul(0.08).add(0.95));
    // corrugated lower side
    const corr = sin(y.mul(60)).mul(0.5).add(0.5).mul(step(y, 1.45)).mul(side);
    let base = mix(steel.mul(mix(1, 0.85, corr)), stripeC, clamp(stripe.mul(side), 0, 1));
    if (ART_RESTYLE) {
      // restyle livery (Solano Metro): graphite body, wide signal-red belt under the windows, thin amber pinstripe
      const belt = smoothstep(0.95, 0.98, y).mul(smoothstep(1.62, 1.59, y)).mul(side);
      const pin = smoothstep(1.7, 1.72, y).mul(smoothstep(1.78, 1.76, y)).mul(side);
      base = mix(mix(vec3(0.075, 0.078, 0.09), vec3(0.85, 0.08, 0.1), belt), vec3(1.0, 0.62, 0.15), pin);
    }
    // roof darker grey
    const roof = smoothstep(3.3, 3.6, y);
    base = mix(base, vec3(0.18, 0.18, 0.2), roof);
    m.colorNode = mix(base, vec3(0.01), glassSide);
    m.metalnessNode = mix(mix(float(ART_RESTYLE ? 0.3 : 0.85), float(0.2), roof), float(0), glassSide); // (restyle: painted body)
    m.roughnessNode = mix(float(0.3), float(0.05), glassSide);
    let emis = winEmit.mul(glassSide);
    if (isCab) {
      // windshield + head/tail lights on +x nose
      const nose = smoothstep(9.05, 9.3, x);
      const wind = nose.mul(smoothstep(2.0, 2.05, y)).mul(smoothstep(3.25, 3.2, y)).mul(smoothstep(1.2, 1.1, abs(p.z)));
      const lampD = length(vec2(abs(p.z).sub(1.0).mul(1.4), y.sub(1.3)));
      const lamp = nose.mul(smoothstep(0.17, 0.12, lampD));
      const lampCol = mix(vec3(1.0, 0.04, 0.02).mul(14), vec3(1.0, 0.95, 0.85).mul(60), head);
      emis = emis.add(vec3(0.25, 0.32, 0.38).mul(wind).mul(0.8)).add(lampCol.mul(lamp));
      m.colorNode = mix(m.colorNode, vec3(0.01), max(wind, lamp));
      // front destination sign
      const sign = nose.mul(smoothstep(3.32, 3.35, y)).mul(smoothstep(3.6, 3.57, y)).mul(smoothstep(0.75, 0.7, abs(p.z)));
      emis = emis.add(vec3(1.0, 0.55, 0.1).mul(6).mul(sign));
    }
    m.emissiveNode = emis;
    return m;
  };

  // per-instance attributes
  const cabHead = new THREE.InstancedBufferAttribute(new Float32Array(nCab), 1);
  const cabStripe = new THREE.InstancedBufferAttribute(new Float32Array(nCab * 3), 3);
  const midHead = new THREE.InstancedBufferAttribute(new Float32Array(nMid), 1);
  const midStripe = new THREE.InstancedBufferAttribute(new Float32Array(nMid * 3), 3);
  const stripes = [[0.05, 0.55, 0.22], [0.9, 0.35, 0.05]];
  for (let i = 0; i < nCab; i++) { cabHead.setX(i, i % 2 === 0 ? 1 : 0); cabStripe.setXYZ(i, ...stripes[Math.floor(i / 2)]); }
  for (let i = 0; i < nMid; i++) { midStripe.setXYZ(i, ...stripes[Math.floor(i / (CARS - 2))]); }

  const cabMesh = new THREE.InstancedMesh(cabGeo, makeBodyMat(true), nCab);
  const midMesh = new THREE.InstancedMesh(midGeo, makeBodyMat(false), nMid);
  for (const mm of [cabMesh, midMesh]) { mm.frustumCulled = false; mm.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(mm); }

  // undercarriage (bogies + equipment) and pantographs
  const ub = new Batch();
  for (const bx of [-7.0, 7.0]) {
    ub.box('d', 2.8, 0.75, 2.3, bx, 0.55, 0);
    for (const wx of [-1.05, 1.05]) for (const wz of [-0.72, 0.72]) {
      ub.add('d', new THREE.CylinderGeometry(0.43, 0.43, 0.14, 12), bx + wx, 0.43, wz, Math.PI / 2, 0, 0);
    }
  }
  ub.box('d', 9.0, 0.6, 2.2, 0, 0.75, 0);
  ub.box('d', 0.5, 0.9, 1.0, 9.9, 1.6, 0); // gangway
  const underGeo = ub.build({ d: new THREE.MeshBasicNodeMaterial() }).children[0].geometry;
  const darkM = metal({ color: [0.04, 0.04, 0.045], rough: 0.6 });
  const underMesh = new THREE.InstancedMesh(underGeo, darkM, nTrains * CARS);
  underMesh.frustumCulled = false; root.add(underMesh);

  const pb = new Batch();
  const base = 3.92, top = 5.12; // contact wire at H+5.1 relative rail top ~ +4.72
  pb.box('p', 1.6, 0.12, 1.2, 0, base + 0.06, 0);
  beamBetween(pb, 'p', new THREE.Vector3(-0.7, base + 0.1, 0), new THREE.Vector3(0.25, base + 0.55, 0), 0.06, 0.06);
  beamBetween(pb, 'p', new THREE.Vector3(0.25, base + 0.55, 0), new THREE.Vector3(-0.1, top - 0.05, 0), 0.05, 0.05);
  pb.box('p', 0.12, 0.06, 1.7, -0.1, top - 0.02, 0);
  const pantoGeo = pb.build({ p: new THREE.MeshBasicNodeMaterial() }).children[0].geometry;
  const pantoMesh = new THREE.InstancedMesh(pantoGeo, metal({ color: [0.25, 0.25, 0.27], rough: 0.4 }), nTrains * 2);
  pantoMesh.frustumCulled = false; root.add(pantoMesh);

  // moving lights: interior spill per 2 cars + headlight
  const carLights = [];
  for (let i = 0; i < nTrains * 3; i++) {
    const l = new THREE.PointLight(0xfff0dc, 60, 16, 1.5);
    root.add(l); carLights.push(l);
  }
  const headLights = [];
  for (let i = 0; i < nTrains; i++) {
    const l = new THREE.PointLight(0xfff4e0, 160, 24, 1.4);
    root.add(l); headLights.push(l);
  }

  const L = ctx.layout.elevatedRail;
  const span = (L.xEnd - L.xStart) + CARS * CAR_LEN + 80;
  const speed = 21; // m/s (~75 km/h)
  const period = span / speed + 14; // includes pause off-screen
  // phases chosen so at t=2s (shot capture) train 0's head is at x=118 and train 1's head at x=135
  const shotT = 2.0;
  const trainDefs = tracks.map((tr, i) => {
    const targetHead = i === 0 ? 118 : 135;
    const start = tr.dir > 0 ? L.xStart - 40 : L.xEnd + 40;
    const phase = Math.abs(targetHead - start) / speed - shotT;
    return { track: tr, start, phase: i === 0 ? phase : phase };
  });
  const state = trainDefs.map(() => ({ head: 0, dir: 1, z: 0, cars: CARS, carLength: CAR_LEN, visible: true }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
  const qFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const qId = new THREE.Quaternion();
  const railTop = H + 0.38;

  function update(dt, t) {
    let ci = 0, mi = 0, ui = 0, pi = 0, li = 0;
    trainDefs.forEach((td, ti) => {
      const local = ((t + td.phase) % period + period) % period;
      const dir = td.track.dir;
      const head = td.start + dir * local * speed;
      state[ti].head = head; state[ti].dir = dir; state[ti].z = td.track.z;
      for (let c = 0; c < CARS; c++) {
        const cxm = head - dir * (CAR_LEN * (c + 0.5));
        pv.set(cxm, railTop, td.track.z);
        // cab cars: nose toward +x locally; lead faces dir, tail faces -dir
        const isCab = c === 0 || c === CARS - 1;
        let faceDir = c === 0 ? dir : -dir;
        q.copy(faceDir > 0 ? qId : qFlip);
        m4.compose(pv, isCab ? q : (dir > 0 ? qId : qFlip), sc);
        if (isCab) { cabMesh.setMatrixAt(ci, m4); cabHead.setX(ci, c === 0 ? 1 : 0); ci++; }
        else { midMesh.setMatrixAt(mi++, m4); }
        underMesh.setMatrixAt(ui++, m4);
        if (c === 1 || c === 4) pantoMesh.setMatrixAt(pi++, m4);
        if (c % 2 === 0) { carLights[li++].position.set(cxm - dir * CAR_LEN * 0.5, railTop + 2.2, td.track.z + (td.track.z < L.z ? -1.8 : 1.8)); }
      }
      headLights[ti].position.set(head + dir * 6, railTop + 1.5, td.track.z);
    });
    cabHead.needsUpdate = true;
    for (const mm of [cabMesh, midMesh, underMesh, pantoMesh]) mm.instanceMatrix.needsUpdate = true;
  }
  update(0, 0);
  return { update, state };
}
