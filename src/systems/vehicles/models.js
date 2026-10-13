// Loads the Blender-built vehicle GLBs and converts them into instancing-friendly data:
//   per type, per LOD: body geometry merged per material + wheel geometry per material + 4 wheel slots.
// Car-local frame used in-game: forward = -Z, right = +X, up = +Y, origin on the ground under the car centre.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TYPES = ['hero', 'kei', 'taxi', 'van', 'av'];
const LOD_SUFFIX = ['', '_lod1', '_lod2', '_lod3'];
const FLIP = new THREE.Matrix4().makeRotationY(Math.PI); // GLB front is +Z -> rotate to -Z forward

function cleanGeom(g, m) {
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.getAttribute('position').clone());
  if (g.getAttribute('normal')) out.setAttribute('normal', g.getAttribute('normal').clone());
  if (g.index) out.setIndex(g.index.clone());
  out.applyMatrix4(m);
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  return out.index ? out : out; // keep indexed state
}

function ensureIndexed(list) {
  const anyNon = list.some((g) => !g.index);
  if (!anyNon) return list;
  return list.map((g) => (g.index ? g.toNonIndexed() : g));
}

function extract(gltf) {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const body = new Map();
  const wheelGeo = new Map();
  const slots = [];
  let wheelRadius = 0.33;
  const wheelNodes = [];
  scene.traverse((o) => { if (/^wheel_/.test(o.name) && !wheelNodes.includes(o) && !/^wheel_/.test(o.parent?.name || '')) wheelNodes.push(o); });
  const isWheelDesc = (o) => { for (let p = o; p; p = p.parent) if (wheelNodes.includes(p)) return p; return null; };
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const wn = isWheelDesc(o);
    const name = (o.material?.name || 'trim').replace(/\.\d+$/, '');
    if (wn) {
      if (wn.name !== 'wheel_FR') return; // shared mesh, take one copy in wheel-local space
      const local = new THREE.Matrix4().copy(wn.matrixWorld).invert().multiply(o.matrixWorld);
      const g = cleanGeom(o.geometry, local);
      if (!wheelGeo.has(name)) wheelGeo.set(name, []);
      wheelGeo.get(name).push(g);
    } else {
      const g = cleanGeom(o.geometry, new THREE.Matrix4().multiplyMatrices(FLIP, o.matrixWorld));
      if (!body.has(name)) body.set(name, []);
      body.get(name).push(g);
    }
  });
  for (const wn of wheelNodes) {
    const m = new THREE.Matrix4().multiplyMatrices(FLIP, wn.matrixWorld);
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    m.decompose(pos, quat, scl);
    slots.push({ name: wn.name, pos, quat, front: /F[LR]$/.test(wn.name) });
    wheelRadius = pos.y;
  }
  const merge = (map) => {
    const out = [];
    for (const [mat, list] of map) {
      const g = list.length === 1 ? list[0] : mergeGeometries(ensureIndexed(list), false);
      if (!g) continue;
      g.computeBoundingSphere();
      out.push({ mat, geom: g });
    }
    return out;
  };
  const parts = merge(body);
  const box = new THREE.Box3();
  for (const p of parts) { p.geom.computeBoundingBox(); box.union(p.geom.boundingBox); }
  return { parts, wheel: merge(wheelGeo), slots, wheelRadius, box };
}

export async function loadModels(ctx) {
  const models = {};
  await Promise.all(TYPES.map(async (type) => {
    const lods = await Promise.all(LOD_SUFFIX.map((s) => ctx.assets.gltf(`models/vehicles/${type}${s}.glb`)));
    const data = lods.map((g) => (g ? extract(g) : null));
    for (let i = 1; i < data.length; i++) if (!data[i]) data[i] = data[i - 1];
    if (!data[0]) { console.warn('[vehicles] missing model', type); return; }
    const box = data[0].box;
    const size = box.getSize(new THREE.Vector3());
    models[type] = {
      type, lods: data, slots: data[0].slots, wheelRadius: data[0].wheelRadius, box, size,
      length: size.z, width: size.x, height: size.y,
      axleF: data[0].slots.find((s) => s.front)?.pos.z ?? -size.z * 0.3,
      axleR: data[0].slots.find((s) => !s.front)?.pos.z ?? size.z * 0.3,
    };
  }));
  return models;
}
