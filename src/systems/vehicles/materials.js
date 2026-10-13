// Vehicle materials (TSL node materials). All car meshes are rendered as InstancedMeshes:
//   - paint meshes carry the paint colour in instanceColor (auto-multiplied into the diffuse colour)
//   - light meshes carry the light state in instanceColor: r = headlights, g = tail/position, b = brake
// Rain (beads on up-facing panels, running streaks on vertical panels) is computed in car-local geometry space
// (positionGeometry / normalGeometry) so it sticks to the car body when it moves.
import * as THREE from 'three/webgpu';
import {
  float, vec2, vec3, vec4, uniform, time, floor, fract, length, smoothstep, mix, clamp, abs, max, min, normalize, step, sin,
  positionGeometry, normalGeometry, normalView, cameraViewMatrix, instanceColor, dot, pow, positionWorld, cameraPosition,
} from 'three/tsl';
import { hash21, hash22, hash23, vnoise } from '../../materials/noise.js';
import { wetUniforms } from '../../materials/wet.js';

export const vehUniforms = {
  rain: wetUniforms.rain,
  wet: wetUniforms.wetness,
  headBoost: uniform(1.0),
  tailBoost: uniform(1.0),
};

// ---------------------------------------------------------------------------------------------- rain helpers
function dropLayer(uv, scale, seed, density) {
  const q = uv.mul(scale).add(seed);
  const id = floor(q);
  const f = fract(q).sub(0.5);
  const h = hash23(id.add(seed * 3.1));
  const c = h.xy.sub(0.5).mul(0.45);
  const r = h.z.mul(0.2).add(0.1);
  const d = f.sub(c);
  const dl = length(d);
  const on = step(float(1).sub(density), hash21(id.add(seed + 7.7)));
  const m = smoothstep(r, r.mul(0.55), dl).mul(on);
  return { m, slope: d.div(r).mul(m) };
}

// returns { mask, offset(vec3 geometry-space normal perturbation) }
export function rainNodes({ beadScale = 1, streaks = true, strength = 1 } = {}) {
  const p = positionGeometry;
  const n = normalGeometry;
  const wet = vehUniforms.wet;
  const up = smoothstep(0.3, 0.75, n.y);
  const side = float(1).sub(up).mul(smoothstep(-0.35, 0.0, n.y));
  // beads (top surfaces): 3 layers of jittered cells
  const uvTop = vec2(p.x, p.z);
  const a = dropLayer(uvTop, 26 * beadScale, 0.0, 0.55);
  const b = dropLayer(uvTop, 41 * beadScale, 13.0, 0.5);
  const c = dropLayer(uvTop, 67 * beadScale, 31.0, 0.45);
  const beadM = max(max(a.m, b.m), c.m).mul(up);
  const beadS = a.slope.add(b.slope).add(c.slope.mul(0.7)).mul(up);
  // beads on sides too (smaller, sparser) using a side-projected coordinate
  const uvSide = vec2(p.x.add(p.z), p.y);
  const d = dropLayer(uvSide, 48 * beadScale, 5.0, 0.35);
  let mask = beadM.add(d.m.mul(side));
  let off = vec3(beadS.x, 0, beadS.y).add(vec3(d.slope.x, d.slope.y, d.slope.x).mul(side).mul(0.6));
  if (streaks) {
    const sx = p.x.add(p.z).mul(34.0);
    const sid = floor(sx);
    const hs = hash21(vec2(sid, 3.7));
    const speed = hs.mul(0.5).add(0.25);
    const fy = fract(p.y.mul(1.6).add(time.mul(speed)).add(hs.mul(9.0)));
    const fx = fract(sx).sub(0.5).add(hs.sub(0.5).mul(0.5));
    const line = smoothstep(0.16, 0.02, abs(fx)).mul(smoothstep(0.0, 0.05, fy)).mul(smoothstep(0.55, 0.2, fy)).mul(step(0.62, hs));
    const head = smoothstep(0.08, 0.0, abs(fy.sub(0.06))).mul(smoothstep(0.3, 0.0, abs(fx)));
    const st = line.max(head).mul(side);
    mask = mask.add(st);
    off = off.add(vec3(fx.sign().mul(st).mul(0.4), 0, 0));
  }
  const k = wet.mul(strength);
  return { mask: clamp(mask, 0, 1).mul(k), offset: off.mul(k) };
}

function perturbView(offsetGeom, amount) {
  // geometry-space offset treated as world-space (cars are upright; yaw error is invisible on random beads)
  const ov = cameraViewMatrix.mul(vec4(offsetGeom, 0)).xyz;
  return normalize(normalView.add(ov.mul(amount)));
}

// ---------------------------------------------------------------------------------------------- materials
export function makePaint({ metalness = 0.55, roughness = 0.34, flake = 1.0, coatRough = 0.035, solid = false } = {}, paintNode = null) {
  const m = new THREE.MeshPhysicalNodeMaterial();
  const p = positionGeometry;
  // metallic flakes: high-frequency jittered cells -> brightness + normal tilt (under the clearcoat)
  const fc = p.mul(520.0);
  const fh = hash23(floor(vec2(fc.x.add(fc.z.mul(0.71)), fc.y.add(fc.z.mul(0.43)))));
  const flakeB = fh.x.sub(0.5).mul(0.22 * flake).add(1.0);
  // road grime on the lower body + subtle panel macro variation
  const grime = smoothstep(0.55, 0.12, p.y).mul(vnoise(vec2(p.x.add(p.z), p.y).mul(6.0)).mul(0.6).add(0.4));
  const rain = rainNodes({});
  m.colorNode = vec3(flakeB).mul(float(1).sub(grime.mul(0.35)));
  if (paintNode) m.colorNode = m.colorNode.mul(paintNode);
  m.metalnessNode = float(solid ? 0.05 : metalness).mul(float(1).sub(grime.mul(0.4)));
  m.roughnessNode = float(Math.max(roughness, 0.48)).add(grime.mul(0.2)).add(fh.y.sub(0.5).mul(0.08 * flake)); // base layer stays fairly rough: gloss comes from the clearcoat (keeps SSR from smearing across panels)
  const flakeN = vec3(fh.x.sub(0.5), fh.y.sub(0.5), fh.z.sub(0.5)).mul(0.18 * flake);
  m.normalNode = perturbView(flakeN.add(rain.offset.mul(0.8)), 1.0);
  m.clearcoat = 1.0;
  m.clearcoatRoughnessNode = mix(float(coatRough), float(0.012), rain.mask).add(grime.mul(0.2));
  m.clearcoatNormalNode = perturbView(rain.offset, 1.1);
  m.envMapIntensity = 1.0;
  m.name = 'veh_paint';
  return m;
}

export function makeGlass({ opacity = 0.86 } = {}) {
  const m = new THREE.MeshPhysicalNodeMaterial({ transparent: true, depthWrite: true, side: THREE.FrontSide });
  const rain = rainNodes({ beadScale: 1.4, strength: 1.0 });
  m.colorNode = vec3(0.012, 0.014, 0.018);
  m.metalnessNode = float(0.0);
  m.roughnessNode = mix(float(0.03), float(0.0), rain.mask);
  m.opacityNode = float(opacity).add(rain.mask.mul(0.1));
  m.normalNode = perturbView(rain.offset, 1.4);
  m.specularIntensity = 1.0;
  m.ior = 1.52;
  m.name = 'veh_glass';
  return m;
}

export function makeStd(name, { color = 0x101010, metalness = 0, roughness = 0.5, wetRough = null, rain = false, emissive = null } = {}) {
  const m = new THREE.MeshStandardNodeMaterial();
  m.colorNode = vec3(new THREE.Color(color).r, new THREE.Color(color).g, new THREE.Color(color).b);
  m.metalnessNode = float(metalness);
  if (rain) {
    const r = rainNodes({ strength: 0.7, streaks: false });
    m.roughnessNode = mix(float(roughness), float(wetRough ?? roughness), vehUniforms.wet).mul(float(1).sub(r.mask.mul(0.7)));
    m.normalNode = perturbView(r.offset, 0.8);
  } else {
    m.roughnessNode = wetRough != null ? mix(float(roughness), float(wetRough), vehUniforms.wet) : float(roughness);
  }
  if (emissive) m.emissiveNode = emissive;
  m.name = 'veh_' + name;
  return m;
}

// Light materials driven by instanceColor (r=head, g=tail, b=brake).
export function makeHeadLight(L = instanceColor) {
  const m = new THREE.MeshStandardNodeMaterial();
  m.colorNode = vec3(0.02);
  m.roughnessNode = float(0.1);
  m.metalnessNode = float(0.0);
  const s = L.x.mul(vehUniforms.headBoost);
  m.emissiveNode = vec3(0.86, 0.93, 1.0).mul(s.mul(38.0));
  m.name = 'veh_head';
  return m;
}

export function makeTailLight(L = instanceColor) {
  const m = new THREE.MeshStandardNodeMaterial();
  m.colorNode = vec3(0.06, 0.0, 0.0);
  m.roughnessNode = float(0.15);
  m.metalnessNode = float(0.0);
  // LED segment pattern along the bar (car-local X) so the bar reads as a real light, not a flat strip
  const seg = smoothstep(0.0, 0.25, fract(positionGeometry.x.mul(55.0))).mul(smoothstep(1.0, 0.75, fract(positionGeometry.x.mul(55.0))));
  const ledMod = seg.mul(0.35).add(0.65);
  const s = L.y.mul(3.2).add(L.z.mul(11.0)).mul(vehUniforms.tailBoost).mul(ledMod);
  m.emissiveNode = vec3(1.0, 0.035, 0.02).mul(s).add(vec3(0.5, 0.02, 0.02).mul(s.mul(0.08).pow(2.0)));
  m.name = 'veh_tail';
  return m;
}

export function makeTurn(L = instanceColor) {
  const m = new THREE.MeshStandardNodeMaterial();
  m.colorNode = vec3(0.3, 0.12, 0.0);
  m.roughnessNode = float(0.2);
  m.emissiveNode = vec3(1.0, 0.42, 0.02).mul(L.y.mul(0.6));
  m.name = 'veh_turn';
  return m;
}

export function makeAux(kind, L = instanceColor) {
  const m = new THREE.MeshStandardNodeMaterial();
  m.colorNode = vec3(0.05);
  m.roughnessNode = float(0.3);
  if (kind === 'taxi') {
    m.emissiveNode = vec3(1.0, 0.75, 0.35).mul(L.y.mul(4.0));
  } else if (kind === 'av') {
    const pulse = sin(time.mul(6.0).add(positionGeometry.x.mul(3.0))).mul(0.15).add(0.85);
    m.emissiveNode = vec3(0.15, 0.75, 1.0).mul(L.y.mul(14.0).mul(pulse));
  } else {
    m.emissiveNode = vec3(0.2, 0.7, 1.0).mul(L.y.mul(3.0));
  }
  m.name = 'veh_aux_' + kind;
  return m;
}

export function makePlate(L = instanceColor) {
  const m = new THREE.MeshStandardNodeMaterial();
  const p = positionGeometry;
  // faux characters: blocky noise rows on the plate (reads as text at distance)
  const g = vec2(p.x.mul(60.0), p.y.mul(30.0));
  const ch = step(0.45, hash21(floor(g))).mul(step(0.25, fract(g.x))).mul(step(0.2, fract(g.y)));
  const row = smoothstep(0.0, 0.01, abs(fract(p.y.mul(6.0)).sub(0.5)).sub(0.2));
  m.colorNode = mix(vec3(0.72, 0.74, 0.68), vec3(0.05, 0.25, 0.1), ch.mul(0.85));
  m.roughnessNode = float(0.4);
  m.emissiveNode = vec3(0.06, 0.06, 0.055).mul(L.y);
  m.name = 'veh_plate';
  return m;
}

// Build the full material set for one vehicle type.
export function buildMaterialSet(type, solo = null) {
  const L = solo ? solo.light : instanceColor;
  const paintCfg = {
    hero: { metalness: 0.7, roughness: 0.3, flake: 1.0 },
    kei: { metalness: 0.35, roughness: 0.36, flake: 0.6 },
    taxi: { metalness: 0.05, roughness: 0.32, flake: 0.2, solid: true },
    van: { metalness: 0.1, roughness: 0.42, flake: 0.2, solid: true },
    av: { metalness: 0.75, roughness: 0.26, flake: 1.0 },
  }[type] || {};
  const rimCfg = {
    hero: { color: 0x0b0b0c, metalness: 1, roughness: 0.32 },
    kei: { color: 0x9a9ca0, metalness: 1, roughness: 0.38 },
    taxi: { color: 0xb8babd, metalness: 1, roughness: 0.25 },
    van: { color: 0xc8c8c4, metalness: 0.6, roughness: 0.45 },
    av: { color: 0x202022, metalness: 1, roughness: 0.3 },
  }[type];
  return {
    paint: makePaint(paintCfg, solo ? solo.paint : null),
    glass: makeGlass({ opacity: type === 'av' ? 0.78 : 0.86 }),
    chrome: makeStd('chrome', { color: 0xf2f2f4, metalness: 1, roughness: 0.06 }),
    rubber: makeStd('rubber', { color: 0x0b0b0c, roughness: 0.82, wetRough: 0.5 }),
    lights_head: makeHeadLight(L),
    lights_tail: makeTailLight(L),
    interior: makeStd('interior', { color: 0x0e0d0c, roughness: 0.8 }),
    trim: makeStd('trim', { color: 0x050506, roughness: 0.32, wetRough: 0.12, rain: true }),
    rim: makeStd('rim', rimCfg),
    metal: makeStd('metal', { color: 0x6a6a6c, metalness: 1, roughness: 0.42 }),
    caliper: makeStd('caliper', { color: type === 'hero' ? 0xb01010 : 0x2a2a2c, roughness: 0.4 }),
    plate: makePlate(L),
    lights_aux: makeAux(type, L),
    lights_turn: makeTurn(L),
  };
}

// materials whose InstancedMeshes need a per-instance colour
export const PAINT_MATS = new Set(['paint']);
export const LIGHT_MATS = new Set(['lights_head', 'lights_tail', 'lights_turn', 'lights_aux', 'plate']);
