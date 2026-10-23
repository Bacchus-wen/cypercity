// Tripo crowd character library (default; ?crowd=legacy restores the MakeHuman library in characters.js).
// Eight original cyberpunk pedestrians: Tripo image-to-model -> Tripo rig (Mixamo spec) -> pipeline/blender/character.py
// (feet on the ground, facing +Z, flattened 1024 texture, LOD0 <= 15k / LOD1 <= 3k tris, <= 4 weights).
// One clip set (models/crowd2/clips.glb, retargeted once onto char01) is adapted to every skeleton at load:
// rotation tracks are shared as-is, the Hips track is re-expressed relative to each rest pose. The nine crowd clips
// are derived from walk/idle: retimed walks match the original walking speeds, umbrella/phone variants replace the
// right-arm tracks with a held pose aimed in model space, and the props are procedural meshes on the right hand.
// Same interface as CharacterLibrary (sexes/outfitList/createCharacter/...), one "sex" entry per character.
import * as THREE from 'three/webgpu';
import { float, vec4, uniform, mix, clamp, normalWorld, texture, uv } from 'three/tsl';
import { recolorNode } from '../../materials/recolor.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CROWD_U } from './characters.js';

const ACC = ['umbrella_black', 'umbrella_clear', 'umbrella_led', 'phone'];
// walking speeds (m/s) of the original crowd clips; the shared walk is retimed to each
const WALK_SPEEDS = { walk_slow: 1.02, walk: 1.36, walk_fast: 1.73, umbrella_walk: 1.02, phone_walk: 0.9 };
// player / legacy variant names -> characters
const ALIASES = { male: 'char01_courier', female: 'char05_office' };
// far VAT tints: mild brightness only (one texture carries skin and clothes)
export const TRIPO_FAR_TINTS = [[1, 1, 1], [0.92, 0.92, 0.95], [0.86, 0.86, 0.86], [1, 0.97, 0.95], [0.95, 0.95, 1]];

// hue variants (radians) chosen from an agent's tint seed: about a third keep the designed colours
const HUES = [0, 0, 0, 2.1, -2.1, 1.05, -1.05, 3.14, 0.6, -0.6];
export function hueFor(t) { return HUES[(((t ?? 0) >>> 2) % HUES.length + HUES.length) % HUES.length]; }

const _v0 = new THREE.Vector3(), _v1 = new THREE.Vector3(), _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion();
const _m0 = new THREE.Matrix4();

function findBone(root, suffix) {
  let b = null;
  root.traverse((o) => { if (!b && o.isBone && o.name.endsWith(suffix)) b = o; });
  return b;
}

// model-space (root-relative) helpers; the gltf scene root is the model frame
function modelPos(o, root, out) { return out.setFromMatrixPosition(o.matrixWorld).applyMatrix4(_m0.copy(root.matrixWorld).invert()); }
function modelQuat(o, root, out) {
  o.getWorldQuaternion(out);
  return out.premultiply(root.getWorldQuaternion(_q1).invert());
}

function snapshot(root) {
  const s = [];
  root.traverse((o) => s.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
  return () => { for (const [o, p, q, sc] of s) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(sc); } root.updateMatrixWorld(true); };
}

// leave root in the clip's pose at time t (stopping a mixer restores the original state, so re-apply the sampled pose)
function poseAt(root, clip, t) {
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  mixer.setTime(t);
  const frozen = [];
  root.traverse((o) => frozen.push([o, o.position.clone(), o.quaternion.clone()]));
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  for (const [o, p, q] of frozen) { o.position.copy(p); o.quaternion.copy(q); }
  root.updateMatrixWorld(true);
}

// rotate `bone` (minimal rotation) so the direction to `child` points along dir (model space)
function aim(bone, child, dir, root) {
  root.updateMatrixWorld(true);
  const a = modelPos(bone, root, _v0), b = modelPos(child, root, _v1);
  const qd = new THREE.Quaternion().setFromUnitVectors(b.sub(a).normalize(), dir.clone().normalize());
  const qModel = modelQuat(bone, root, new THREE.Quaternion());
  const qParent = modelQuat(bone.parent, root, new THREE.Quaternion());
  bone.quaternion.copy(qParent.invert().multiply(qd.multiply(qModel)));
  root.updateMatrixWorld(true);
}

function restModelQuats(root) {
  root.updateMatrixWorld(true);
  const m = new Map();
  root.traverse((o) => { if (o !== root) m.set(o.name, modelQuat(o, root, new THREE.Quaternion())); });
  return m;
}

// Per-bone roll correction between the source rig and a target rig. Tripo's auto-rig orients every bone's +Y along
// the limb but picks the roll (twist about +Y) per mesh, so a shared local rotation would twist the target's skin
// about the limb (char07's right clavicle differs by ~90 deg). K = twist about +Y of (source rest, turned into the
// target's model frame)^-1 * target rest; the limb directions stay those of the animation, the binding roll is kept.
function rollCorrections(src, root, rq) {
  const K = new Map();
  root.traverse((o) => {
    if (!o.isBone) return;
    const s = src.restWorld.get(o.name);
    if (!s) return;
    const k = rq.clone().multiply(s).invert().multiply(modelQuat(o, root, new THREE.Quaternion()));
    const n = Math.hypot(k.y, k.w);
    K.set(o.name, n > 1e-6 ? new THREE.Quaternion(0, k.y / n, 0, k.w / n) : new THREE.Quaternion());
  });
  return K;
}
const isIdentity = (q) => !q || Math.abs(q.w) > 0.99999;

// pre-rotate `bone` by R about its pivot, R given in model space
function rotateInModel(bone, root, R) {
  root.updateMatrixWorld(true);
  const qModel = modelQuat(bone, root, new THREE.Quaternion());
  const qParent = modelQuat(bone.parent, root, new THREE.Quaternion());
  bone.quaternion.copy(qParent.invert().multiply(R.clone().multiply(qModel)));
  root.updateMatrixWorld(true);
}

// right-hand frame in model space: h wrist, m middle knuckle, d towards the fingers, w index -> pinky, n palm normal
function handFrame(root, H) {
  root.updateMatrixWorld(true);
  const h = modelPos(H.hand, root, new THREE.Vector3()), m = modelPos(H.mid, root, new THREE.Vector3());
  const d = m.clone().sub(h).normalize();
  const w0 = modelPos(H.pnk, root, new THREE.Vector3()).sub(modelPos(H.idx, root, new THREE.Vector3()));
  const n = new THREE.Vector3().crossVectors(d, w0).normalize(); // right hand: fingers x (index -> pinky)
  const w = new THREE.Vector3().crossVectors(n, d);
  return { h, m, d, w, n };
}

// Re-express a clip recorded on the source rig for a target rig. Bone b: q' = K(parent)^-1 * q * K(b); the root
// (Hips) is also turned by the rest difference rq. The Hips position becomes a delta (horizontal: around the clip
// mean, i.e. strictly in place; vertical: from the rest height) turned by rq and scaled by the hip-height ratio.
function adaptClip(clip, src, dst) {
  const dstHips = dst.hips;
  const dstP = dstHips.position;
  const rq = dst.rq;
  const ratio = dstP.length() / src.restP.length();
  const tracks = [];
  for (const tr of clip.tracks) {
    if (tr.name.endsWith('.quaternion')) {
      const name = tr.name.slice(0, -'.quaternion'.length);
      const bone = dst.bones.get(name);
      const Kb = dst.K.get(name);
      const root = name === src.hips;
      const Kp = bone && bone.parent?.isBone ? dst.K.get(bone.parent.name) : null;
      if (!root && isIdentity(Kb) && isIdentity(Kp)) { tracks.push(tr); continue; }
      const v = tr.values.slice();
      const KpInv = Kp ? Kp.clone().invert() : null;
      for (let i = 0; i < v.length; i += 4) {
        _q0.fromArray(v, i);
        if (Kb) _q0.multiply(Kb);
        if (root) _q0.premultiply(rq); else if (KpInv) _q0.premultiply(KpInv);
        _q0.toArray(v, i);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(tr.name, tr.times, v));
    } else if (tr.name === src.hips + '.position') {
      const v = tr.values.slice(), n = v.length / 3;
      let mx = 0, mz = 0;
      for (let i = 0; i < v.length; i += 3) { mx += v[i] / n; mz += v[i + 2] / n; }
      for (let i = 0; i < v.length; i += 3) {
        _v0.set(v[i] - mx, v[i + 1] - src.restP.y, v[i + 2] - mz).applyQuaternion(rq).multiplyScalar(ratio).add(dstP);
        _v0.toArray(v, i);
      }
      tracks.push(new THREE.VectorKeyframeTrack(dstHips.name + '.position', tr.times, v));
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

// Cut a clip that holds several loops of a cycle (Tripo presets: walk and run hold two) down to one loop, so the
// VAT samples a single cycle. The period is the lag (around duration / cycles) at which the thigh rotations repeat.
function oneCycle(clip, cycles) {
  if (!(cycles > 1)) return clip;
  const ref = clip.tracks.filter((t) => /UpLeg\.quaternion$/.test(t.name) && t.times.length > 8);
  if (!ref.length) return clip;
  const t = ref[0].times, n = t.length;
  const guess = (n - 1) / cycles;
  let best = Math.round(guess), bestErr = Infinity;
  for (let L = Math.floor(guess * 0.85); L <= Math.ceil(guess * 1.15) && L < n; L++) {
    let err = 0, cnt = 0;
    for (const tr of ref) {
      const v = tr.values;
      for (let i = 0; i + L < n; i++) {
        const d = Math.abs(v[i * 4] * v[(i + L) * 4] + v[i * 4 + 1] * v[(i + L) * 4 + 1] + v[i * 4 + 2] * v[(i + L) * 4 + 2] + v[i * 4 + 3] * v[(i + L) * 4 + 3]);
        err += 1 - d; cnt++;
      }
    }
    if (err / cnt < bestErr) { bestErr = err / cnt; best = L; }
  }
  const t0 = t[0], T = t[best] - t0;
  const tracks = clip.tracks.map((tr) => closeLoop(tr.clone().trim(t0, t0 + T + 1e-4).shift(-t0)));
  return new THREE.AnimationClip(clip.name, T, tracks);
}

// spread the seam error of a looping track over the cycle so the last key equals the first (thighs repeat at the
// chosen period, other bones can still be several degrees off)
function closeLoop(tr) {
  const v = tr.values, n = tr.times.length, L = n - 1;
  if (n < 3) return tr;
  if (tr.name.endsWith('.quaternion')) {
    const q0 = new THREE.Quaternion().fromArray(v, 0), qL = new THREE.Quaternion().fromArray(v, L * 4);
    if (q0.dot(qL) < 0) q0.set(-q0.x, -q0.y, -q0.z, -q0.w);
    const e = qL.clone().invert().multiply(q0), id = new THREE.Quaternion(), c = new THREE.Quaternion();
    for (let i = 1; i <= L; i++) {
      c.slerpQuaternions(id, e, i / L);
      _q0.fromArray(v, i * 4).multiply(c).toArray(v, i * 4);
    }
  } else if (tr.name.endsWith('.position')) {
    const d = [v[0] - v[L * 3], v[1] - v[L * 3 + 1], v[2] - v[L * 3 + 2]];
    for (let i = 1; i <= L; i++) for (let k = 0; k < 3; k++) v[i * 3 + k] += d[k] * i / L;
  }
  return tr;
}

function retime(clip, name, k) {
  const tracks = clip.tracks.map((tr) => {
    const t = tr.clone();
    t.times = Float32Array.from(tr.times, (x) => x / k);
    return t;
  });
  return new THREE.AnimationClip(name, clip.duration / k, tracks);
}

// copy of `clip` with constant tracks for the given bones (local quaternions) and premultiplied head/neck tilt
function withPose(clip, name, pose, tilt) {
  const tracks = [];
  for (const tr of clip.tracks) {
    const bone = tr.name.slice(0, tr.name.lastIndexOf('.'));
    if (tr.name.endsWith('.quaternion') && pose[bone]) continue;
    if (tr.name.endsWith('.quaternion') && tilt?.[bone]) {
      const v = tr.values.slice();
      for (let i = 0; i < v.length; i += 4) _q0.fromArray(v, i).premultiply(tilt[bone]).toArray(v, i);
      tracks.push(new THREE.QuaternionKeyframeTrack(tr.name, tr.times, v));
      continue;
    }
    tracks.push(tr);
  }
  for (const [bone, q] of Object.entries(pose)) {
    tracks.push(new THREE.QuaternionKeyframeTrack(bone + '.quaternion', [0, clip.duration], [...q.toArray(), ...q.toArray()]));
  }
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

// natural speed of an in-place walk: backward speed of a planted foot (model space), plus the sole lift needed so the
// lowest foot never sinks below the rest-pose ground contact
function measureWalk(root, clip, feet) {
  const restore = snapshot(root);
  root.updateMatrixWorld(true);
  const rest = feet.map((f) => modelPos(f, root, new THREE.Vector3()).y);
  const N = 72, dt = clip.duration / N;
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  const samples = feet.map(() => []);
  for (let i = 0; i <= N; i++) {
    mixer.setTime(i * dt);
    root.updateMatrixWorld(true);
    feet.forEach((f, k) => samples[k].push(modelPos(f, root, new THREE.Vector3())));
  }
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  restore();
  const vs = [];
  let sink = 0;
  samples.forEach((s, k) => {
    const minY = Math.min(...s.map((p) => p.y));
    sink = Math.max(sink, rest[k] - minY);
    for (let i = 1; i < s.length; i++) {
      if (s[i].y < minY + 0.02 && s[i - 1].y < minY + 0.02) vs.push(-(s[i].z - s[i - 1].z) / dt);
    }
  });
  vs.sort((a, b) => a - b);
  const speed = vs.length ? vs[Math.floor(vs.length / 2)] : 1;
  return { speed: Math.max(0.2, speed), sole: Math.min(0.08, Math.max(0, sink)) };
}

// ------------------------------------------------------------------------------------------- props
function umbrellaGeometry() {
  // local frame: origin at the grip, +Y along the shaft; faceted 8-panel canopy (reads well in the cel look)
  const pts = [[0.0, 0.97], [0.18, 0.94], [0.36, 0.86], [0.5, 0.75], [0.54, 0.71]].map(([r, y]) => new THREE.Vector2(r, y));
  const canopy = new THREE.LatheGeometry(pts, 8);
  const shaft = new THREE.CylinderGeometry(0.009, 0.009, 1.08, 6).translate(0, 0.46, 0);
  const handle = new THREE.TorusGeometry(0.032, 0.009, 4, 8, Math.PI).rotateZ(Math.PI).translate(0.032, -0.08, 0);
  const tip = new THREE.ConeGeometry(0.012, 0.06, 6).translate(0, 1.02, 0);
  const ring = new THREE.TorusGeometry(0.535, 0.009, 3, 32).rotateX(Math.PI / 2).translate(0, 0.72, 0);
  return { canopy, shaft, handle, tip, ring };
}

function propMaterials() {
  const flag = (m, floor, spec) => { m.animeRim = 1; m.animeFloor = floor; m.animeSpecTh = spec; return m; };
  const black = flag(new THREE.MeshPhysicalNodeMaterial({ color: 0x0a0a0c, roughness: 0.22, metalness: 0, side: THREE.DoubleSide }), 0.1, 0.8);
  black.clearcoat = 1; black.clearcoatRoughness = 0.05;
  const clear = flag(new THREE.MeshPhysicalNodeMaterial({ color: 0xdfe8f0, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }), 0.1, 0.8);
  clear.clearcoat = 1; clear.clearcoatRoughness = 0.02;
  const ledCanopy = flag(new THREE.MeshPhysicalNodeMaterial({ color: 0x141a2e, roughness: 0.25, metalness: 0, side: THREE.DoubleSide }), 0.1, 0.8);
  const led = new THREE.MeshStandardNodeMaterial({ color: 0x000000, roughness: 0.5 });
  led.emissive = new THREE.Color(0.15, 0.95, 1.0); led.emissiveIntensity = 5;
  const metal = flag(new THREE.MeshStandardNodeMaterial({ color: 0x1b1b20, roughness: 0.35, metalness: 0.7 }), 0.06, 1.5);
  const phoneBody = flag(new THREE.MeshStandardNodeMaterial({ color: 0x101014, roughness: 0.3, metalness: 0.2 }), 0.06, 1.5);
  const screen = new THREE.MeshStandardNodeMaterial({ color: 0x000000, roughness: 0.2 });
  screen.emissive = new THREE.Color(0.55, 0.75, 1.0); screen.emissiveIntensity = 1.6;
  for (const [k, m] of Object.entries({ black, clear, ledCanopy, led, metal, phoneBody, screen })) m.name = 'crowd2_' + k;
  return { black, clear, ledCanopy, led, metal, phoneBody, screen };
}

function buildProps() {
  const g = umbrellaGeometry(), M = propMaterials();
  const white = new THREE.Color(1, 1, 1);
  const parts = {
    black: [[g.canopy, M.black], [g.shaft, M.metal], [g.handle, M.metal], [g.tip, M.metal]],
    clear: [[g.canopy, M.clear], [g.shaft, M.metal], [g.handle, M.metal], [g.tip, M.metal]],
    led: [[g.canopy, M.ledCanopy], [g.ring, M.led], [g.shaft, M.metal], [g.handle, M.metal], [g.tip, M.metal]],
  };
  // phone: local +Y along the long side, +Z out of the screen, origin at the centre
  const phone = [[new THREE.BoxGeometry(0.072, 0.15, 0.009), M.phoneBody], [new THREE.PlaneGeometry(0.064, 0.138).translate(0, 0, 0.0047), M.screen]];
  const umbrellaParts = {};
  for (const [k, list] of Object.entries(parts)) umbrellaParts[k] = list.map(([geometry, material]) => ({ geometry, material, tint: white }));
  return { parts, phone, umbrellaParts };
}

function propGroup(list, name) {
  const g = new THREE.Group(); g.name = name;
  for (const [geo, mat] of list) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.frustumCulled = false; m.userData.tint = new THREE.Color(1, 1, 1);
    g.add(m);
  }
  g.matrixAutoUpdate = false;
  return g;
}

// ------------------------------------------------------------------------------------------- library
export class TripoCharacterLibrary {
  constructor(ctx) {
    this.ctx = ctx;
    this.sexes = {};
    this.matCache = new Map();
    this.farTints = TRIPO_FAR_TINTS;
  }

  async load() {
    const ctx = this.ctx;
    const index = await fetch(`${import.meta.env.BASE_URL}models/crowd2/characters.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!index) return false;
    const [clipsGltf, ...gltfs] = await Promise.all([ctx.assets.gltf(index.clips.file), ...index.characters.map((c) => ctx.assets.gltf(c.file))]);
    if (!clipsGltf) return false;
    const hips = findBone(clipsGltf.scene, 'Hips') || clipsGltf.scene.getObjectByProperty('name', 'mixamorigHips');
    if (!hips) return false;
    this.src = { hips: hips.name, restP: hips.position.clone(), restQ: hips.quaternion.clone(), restWorld: restModelQuats(clipsGltf.scene), clips: {} };
    for (const c of clipsGltf.animations) this.src.clips[c.name] = oneCycle(c, index.clips.cycles?.[c.name] ?? 1);
    if (!this.src.clips.walk || !this.src.clips.idle) return false;
    this.props = buildProps();
    index.characters.forEach((info, i) => {
      if (!gltfs[i]) return;
      try { this.addCharacter(info, gltfs[i]); } catch (e) { console.warn('[crowd2] character failed', info.id, e); }
    });
    this.outfitList = Object.keys(this.sexes).map((id) => ({ sex: id, outfit: id }));
    console.log('[crowd2]', Object.values(this.sexes).map((e) => `${e.sex} walk ${e.walkNatural.toFixed(2)}m/s/${e.clips.walk.duration.toFixed(2)}s sole ${e.meta.outfits[e.sex].sole.toFixed(3)}`).join(' | '));
    return this.outfitList.length > 0;
  }

  addCharacter(info, gltf) {
    const id = info.id;
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    let body = null, lod1 = null;
    root.traverse((o) => { if (o.isSkinnedMesh) { if (o.name.endsWith('_lod1')) lod1 = o; else body = o; } });
    if (!body || !lod1) throw new Error('missing LOD meshes');
    const B = {};
    for (const n of ['Hips', 'Neck', 'Head', 'RightArm', 'RightForeArm', 'RightHand', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase']) {
      B[n] = findBone(root, n);
      if (!B[n]) throw new Error('missing bone ' + n);
    }
    const F = (n) => findBone(B.RightHand, n);
    const HB = { hand: B.RightHand, idx: F('RightHandIndex1'), mid: F('RightHandMiddle1'), pnk: F('RightHandPinky1') };
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) for (let k = 1; k <= 3; k++) HB[f + k] = F(`RightHand${f}${k}`);
    B.handBones = HB.idx && HB.mid && HB.pnk ? HB : null;
    const map = body.material.map;
    const material = this.characterMaterial(id, map);
    body.material = material; lod1.material = material;

    // ---- clips
    const bones = new Map();
    root.traverse((o) => { if (o.isBone) bones.set(o.name, o); });
    const rq = B.Hips.quaternion.clone().multiply(this.src.restQ.clone().invert());
    const dst = { hips: B.Hips, bones, rq, K: rollCorrections(this.src, root, rq) };
    const base = {};
    for (const [n, c] of Object.entries(this.src.clips)) base[n] = adaptClip(c, this.src, dst);
    const walk = measureWalk(root, base.walk, [B.LeftFoot, B.RightFoot, B.LeftToeBase, B.RightToeBase]);
    const clips = {};
    const restore = snapshot(root);
    const H = info.height || 1.7;
    // held poses (model space: +Z forward, +Y up, -X = character's right)
    // umbrella: fist in front of the lower chest, fingers forward, palm to the midline, index up -> vertical grip axis
    const umbrellaPose = this.heldPose(root, B, base.walk, {
      upper: new THREE.Vector3(-0.14, -1, 0.18), fore: new THREE.Vector3(0.16, 0.42, 0.89),
      hand: { fingers: new THREE.Vector3(0.04, 0.18, 1), palm: new THREE.Vector3(1, 0, 0) }, curl: 1,
    });
    // phone: forearm forward, palm turned to the eyes, loose fingers; head and neck look down
    const eyeOf = (r) => modelPos(B.Head, r, new THREE.Vector3()).add(new THREE.Vector3(0, 0.06, 0.09));
    const phonePose = this.heldPose(root, B, base.walk, {
      upper: new THREE.Vector3(-0.06, -1, 0.3), fore: new THREE.Vector3(0.28, 0.34, 0.9), palmTo: eyeOf, curl: 0.4,
    });
    const phoneTilt = this.tilt(root, B, base.walk, { [B.Neck.name]: 0.12, [B.Head.name]: 0.26 });
    let umbAttach = new THREE.Matrix4(), phoneAttach = new THREE.Matrix4();
    if (B.handBones) {
      // umbrella: shaft through the closed fist (just inside the knuckles), vertical with a slight backward lean
      this.applyPose(root, base.walk, umbrellaPose);
      let f = handFrame(root, B.handBones);
      umbAttach = this.attach(root, B, f.m.clone().addScaledVector(f.n, 0.028).addScaledVector(f.d, -0.01),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.12));
      restore();
      // phone: lying on the palm (screen = palm normal), long side along the fingers, centred on the knuckles
      this.applyPose(root, base.walk, phonePose);
      f = handFrame(root, B.handBones);
      const phoneRot = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(f.d, f.n), f.d, f.n));
      phoneAttach = this.attach(root, B, f.m.clone().addScaledVector(f.n, 0.014), phoneRot);
      restore();
    }

    for (const [name, speed] of Object.entries(WALK_SPEEDS)) {
      const k = speed / walk.speed;
      let c = retime(base.walk, name, k);
      if (name === 'umbrella_walk') c = withPose(c, name, umbrellaPose);
      if (name === 'phone_walk') c = withPose(c, name, phonePose, phoneTilt);
      clips[name] = c;
    }
    clips.idle = base.idle;
    clips.idle_b = retime(base.idle, 'idle_b', 0.85);
    clips.umbrella_idle = withPose(base.idle, 'umbrella_idle', umbrellaPose);
    clips.phone_idle = withPose(base.idle, 'phone_idle', phonePose, phoneTilt);
    if (base.run) clips.run = base.run;

    const metaClips = {};
    for (const [name, c] of Object.entries(clips)) {
      metaClips[name] = { period: c.duration, speed: WALK_SPEEDS[name] ?? 0, frames: Math.max(2, Math.round(c.duration * 30)) };
    }
    if (base.run) metaClips.run.speed = measureWalk(root, base.run, [B.LeftFoot, B.RightFoot, B.LeftToeBase, B.RightToeBase]).speed;

    const meta = { sex: id, outfits: { [id]: { sole: walk.sole, tris: info.lod0_tris, lod1_tris: info.lod1_tris } }, clips: metaClips, textures: {}, materials: {} };
    // near template: everything but the LOD1 mesh (VAT bakes from the original gltf scene)
    const template = SkeletonUtils.clone(root);
    const drop = [];
    template.traverse((o) => { if (o.isSkinnedMesh && o.name.endsWith('_lod1')) drop.push(o); });
    for (const o of drop) o.parent.remove(o);
    this.sexes[id] = {
      sex: id, gltf, meta, clips, templates: { [id]: template }, lodTemplates: { [id]: lod1 }, outfits: [id], byName: {},
      handBone: B.RightHand.name, handAttach: umbAttach, phoneAttach, vatMap: map, height: H,
      walkNatural: walk.speed,
    };
  }

  // Held pose evaluated on the clip's first frame: the upper arm and the forearm aimed along model-space directions,
  // the hand turned to a target frame ({fingers, palm} directions) or twisted so the palm faces a point (palmTo), and
  // the fingers closed by `curl`. Returns local quaternions for the arm, hand and finger bones.
  heldPose(root, B, clip, { upper, fore, hand = null, palmTo = null, curl = 1 }) {
    const restore = snapshot(root);
    poseAt(root, clip, 0);
    aim(B.RightArm, B.RightForeArm, upper, root);
    aim(B.RightForeArm, B.RightHand, fore, root);
    const H = B.handBones;
    if (H && hand) {
      const f = handFrame(root, H);
      const d = hand.fingers.clone().normalize();
      const n = hand.palm.clone().sub(d.clone().multiplyScalar(hand.palm.dot(d))).normalize();
      const w = new THREE.Vector3().crossVectors(n, d);
      const M = new THREE.Matrix4().makeBasis(d, w, n).multiply(new THREE.Matrix4().makeBasis(f.d, f.w, f.n).transpose());
      rotateInModel(B.RightHand, root, new THREE.Quaternion().setFromRotationMatrix(M));
    } else if (H && palmTo) {
      // twist the wrist about the finger direction so the palm faces a model-space point (the eyes, for a phone)
      const { h, d, n } = handFrame(root, H);
      const want = palmTo(root).sub(h);
      want.sub(d.clone().multiplyScalar(want.dot(d))).normalize();
      const ang = Math.atan2(new THREE.Vector3().crossVectors(n, want).dot(d), n.dot(want));
      rotateInModel(B.RightHand, root, new THREE.Quaternion().setFromAxisAngle(d, ang));
    }
    const pose = { [B.RightArm.name]: B.RightArm.quaternion.clone(), [B.RightForeArm.name]: B.RightForeArm.quaternion.clone(), [B.RightHand.name]: B.RightHand.quaternion.clone() };
    if (H && curl > 0) {
      // close the fist: fingers flex about one fixed axis (d x n turns the fingers towards the palm); the thumb first
      // opposes (index side -> palm), then flexes
      const { d, w, n } = handFrame(root, H);
      const flex = new THREE.Vector3().crossVectors(d, n).normalize();
      const oppose = new THREE.Vector3().crossVectors(n, w).normalize();
      const segAng = [1.05, 1.3, 0.85];
      for (const f of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) {
        for (let k = 1; k <= 3; k++) {
          const bone = H[f + k];
          if (!bone) continue;
          const axis = f !== 'Thumb' ? flex : k === 1 ? oppose : flex;
          const ang = (f !== 'Thumb' ? segAng[k - 1] : k === 1 ? 0.55 : 0.4) * curl;
          rotateInModel(bone, root, new THREE.Quaternion().setFromAxisAngle(axis, ang));
          pose[bone.name] = bone.quaternion.clone();
        }
      }
    }
    restore();
    return pose;
  }

  // constant local premultipliers that pitch the given bones forward (look down) about the model +X axis
  tilt(root, B, clip, angles) {
    const restore = snapshot(root);
    poseAt(root, clip, 0);
    const out = {};
    for (const [name, ang] of Object.entries(angles)) {
      const bone = root.getObjectByName(name);
      const P = modelQuat(bone.parent, root, new THREE.Quaternion());
      const R = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), ang);
      out[name] = P.clone().invert().multiply(R).multiply(P);
    }
    restore();
    return out;
  }

  applyPose(root, clip, pose) {
    poseAt(root, clip, 0);
    for (const [name, q] of Object.entries(pose)) root.getObjectByName(name).quaternion.copy(q);
    root.updateMatrixWorld(true);
  }

  // hand-local matrix of a prop placed at model-space position `pos` with model-space rotation `rot`
  attach(root, B, pos, rot) {
    root.updateMatrixWorld(true);
    const U = new THREE.Matrix4().compose(pos, rot, new THREE.Vector3(1, 1, 1));
    const handModel = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(B.RightHand.matrixWorld);
    return handModel.invert().multiply(U);
  }

  characterMaterial(id, map) {
    if (this.matCache.has(id)) return this.matCache.get(id);
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.62, metalness: 0 });
    m.name = 'crowd2_' + id;
    m.animeRim = 1; m.animeFloor = 0.1; m.animeSpecTh = 2; // anime look: hard rim, lowest band, highlight threshold
    const tintU = uniform(new THREE.Color(1, 1, 1)).onObjectUpdate(({ object }) => object.userData.tint);
    const hueU = uniform(0).onObjectUpdate(({ object }) => object.userData.hue ?? 0);
    const base = map ? recolorNode(texture(map, uv()).rgb, hueU).mul(tintU) : tintU;
    const up = clamp(normalWorld.y.mul(0.6).add(0.55), 0, 1);
    const wet = CROWD_U.wetness.mul(up);
    m.colorNode = vec4(base.mul(mix(float(1), float(0.78), wet)), 1);
    m.roughnessNode = mix(float(0.62), float(0.38), wet);
    this.matCache.set(id, m);
    return m;
  }

  // far umbrella parts, local to the umbrella frame (handMatrix includes the attach): { kind: [{geometry, material, tint}] }
  umbrellaParts() { return this.props.umbrellaParts; }

  hueFor(t) { return hueFor(t); }

  tintFor(_name, _meta, tintIdx) {
    const t = TRIPO_FAR_TINTS[(tintIdx ?? 0) % TRIPO_FAR_TINTS.length];
    return new THREE.Color(t[0], t[1], t[2]);
  }

  material(name) { return this.matCache.get(name) || null; }

  createCharacter(variant = {}) {
    if (typeof variant === 'string') { const [sex, outfit] = variant.split(':'); variant = { sex, outfit }; }
    const ids = Object.keys(this.sexes);
    if (!ids.length) return null;
    const seed = variant.seed ?? 1;
    const want = this.sexes[variant.sex] ? variant.sex : this.sexes[variant.outfit] ? variant.outfit : ALIASES[variant.sex];
    const id = this.sexes[want] ? want : ids[seed % ids.length];
    const entry = this.sexes[id];
    const obj = SkeletonUtils.clone(entry.templates[id]);
    obj.name = 'crowd2_' + id;
    const lib = this;
    const tintOf = (t) => lib.tintFor(null, null, t ?? 0);
    obj.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false; // skinned bounds are unreliable when animated
        o.castShadow = true; o.receiveShadow = true;
        o.userData.matName = id;
        o.userData.tint = tintOf(variant.tint ?? (seed >>> 3));
        o.userData.hue = variant.tint == null ? 0 : hueFor(variant.tint);
      }
    });
    // props on the right hand
    const hand = obj.getObjectByName(entry.handBone);
    const acc = {};
    for (const k of ['black', 'clear', 'led']) {
      const g = propGroup(this.props.parts[k], 'umbrella_' + k);
      g.matrix.copy(entry.handAttach); g.visible = false; hand.add(g); acc['umbrella_' + k] = g;
    }
    const ph = propGroup(this.props.phone, 'phone');
    ph.matrix.copy(entry.phoneAttach); ph.visible = false; hand.add(ph); acc.phone = ph;

    const mixer = new THREE.AnimationMixer(obj);
    const actions = {};
    for (const [n, clip] of Object.entries(entry.clips)) {
      const a = mixer.clipAction(clip);
      a.enabled = true; a.setEffectiveWeight(0); a.play();
      actions[n] = a;
    }
    const ch = {
      object: obj, mixer, actions, sex: id, outfit: id, sole: entry.meta.outfits[id].sole, meta: entry.meta,
      current: null,
      clipInfo: entry.meta.clips,
      setTint(t) {
        const c = tintOf(t), h = hueFor(t);
        obj.traverse((o) => { if (o.isMesh && o.userData.matName) { o.userData.tint = c; o.userData.hue = h; } });
      },
      setAccessory(umbrella, phone) {
        for (const k of ACC) acc[k].visible = false;
        if (umbrella && acc['umbrella_' + umbrella]) acc['umbrella_' + umbrella].visible = true;
        if (phone) acc.phone.visible = true;
      },
      play(name, fade = 0.3) {
        const a = actions[name];
        if (!a || ch.current === a) return;
        // a faded-out action is disabled by the mixer: re-enable it and drop any pending fade before reusing it
        a.enabled = true; a.stopFading();
        if (ch.current && fade > 0) { a.setEffectiveWeight(1); ch.current.crossFadeTo(a, fade, false); }
        else { for (const x of Object.values(actions)) { x.stopFading(); x.setEffectiveWeight(0); } a.setEffectiveWeight(1); }
        a.time = ch.current ? ch.current.time / ch.current.getClip().duration * a.getClip().duration : 0;
        ch.current = a;
      },
      update(dt) { mixer.update(dt); },
    };
    ch.setAccessory(variant.umbrella, variant.phone);
    if (variant.clip) ch.play(variant.clip, 0);
    return ch;
  }
}
