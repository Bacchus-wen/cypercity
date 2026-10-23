// Loads the Blender-built vehicle GLBs and converts them into instancing-friendly data:
//   per type, per LOD: body geometry merged per material + wheel geometry per material + 4 wheel slots.
// Car-local frame used in-game: forward = -Z, right = +X, up = +Y, origin on the ground under the car centre.
// Models come from models/vehicles2/ (Tripo cars, pipeline/blender/vehicle.py: one textured material 'veh_tex*' with
// UVs, LOD1..3 reuse the LOD0 textures) and fall back per type to the original models/vehicles/; ?cars=legacy forces
// the originals.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TYPES = ['hero', 'kei', 'taxi', 'van', 'av'];
const LOD_SUFFIX = ['', '_lod1', '_lod2', '_lod3'];
const FLIP = new THREE.Matrix4().makeRotationY(Math.PI); // GLB front is +Z -> rotate to -Z forward

const LEGACY = typeof location !== 'undefined' && new URLSearchParams(location.search).get('cars') === 'legacy';
const isTex = (name) => name.startsWith('veh_tex');

function cleanGeom(g, m, keepUV = false) {
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.getAttribute('position').clone());
  if (g.getAttribute('normal')) out.setAttribute('normal', g.getAttribute('normal').clone());
  if (keepUV && g.getAttribute('uv')) out.setAttribute('uv', g.getAttribute('uv').clone());
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
  let tex = null;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const wn = isWheelDesc(o);
    const raw = (o.material?.name || 'trim').replace(/\.\d+$/, '');
    const textured = isTex(raw);
    const name = textured ? 'tex' : raw;
    if (textured && o.material.map) {
      if (!tex) tex = { map: o.material.map, emissiveMap: o.material.emissiveMap || null, emissiveIntensity: o.material.emissiveIntensity ?? 1 };
      else if (tex.map !== o.material.map) console.warn('[vehicles] more than one textured material in', scene.name || 'a model', '- only the first texture set is used');
    }
    if (wn) {
      if (wn.name !== 'wheel_FR') return; // shared mesh, take one copy in wheel-local space
      const local = new THREE.Matrix4().copy(wn.matrixWorld).invert().multiply(o.matrixWorld);
      const g = cleanGeom(o.geometry, local, textured);
      if (!wheelGeo.has(name)) wheelGeo.set(name, []);
      wheelGeo.get(name).push(g);
    } else {
      const g = cleanGeom(o.geometry, new THREE.Matrix4().multiplyMatrices(FLIP, o.matrixWorld), textured);
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
  return { parts, wheel: merge(wheelGeo), slots, wheelRadius, box, tex };
}

export async function loadModels(ctx) {
  const models = {};
  await Promise.all(TYPES.map(async (type) => {
    const load = (dir) => Promise.all(LOD_SUFFIX.map((s) => ctx.assets.gltf(`models/${dir}/${type}${s}.glb`)));
    let lods = LEGACY ? [null] : await load('vehicles2');
    if (!lods[0]) lods = await load('vehicles');
    const data = lods.map((g) => (g ? extract(g) : null));
    for (let i = 1; i < data.length; i++) if (!data[i]) data[i] = data[i - 1];
    if (!data[0]) { console.warn('[vehicles] missing model', type); return; }
    const box = data[0].box;
    const size = box.getSize(new THREE.Vector3());
    if (data[0].tex) data[0].tex.halfLength = size.z / 2;
    models[type] = {
      type, lods: data, slots: data[0].slots, wheelRadius: data[0].wheelRadius, box, size, tex: data[0].tex,
      length: size.z, width: size.x, height: size.y,
      axleF: data[0].slots.find((s) => s.front)?.pos.z ?? -size.z * 0.3,
      axleR: data[0].slots.find((s) => !s.front)?.pos.z ?? size.z * 0.3,
    };
  }));
  return models;
}
