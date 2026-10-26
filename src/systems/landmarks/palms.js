// Fan palms of the restyle map (Night City boulevard median and canal promenade). Models from
// pipeline/blender/palm_trees.py (models/landmarks2/palm_0..3.glb): nodes trunk / skirt / fronds with painted vertex
// colours. One InstancedMesh per variant and part; crowns and skirts sway with a per-instance phase.
import * as THREE from 'three/webgpu';
import { attribute, positionLocal, vec3, float, sin, cos, time, mix, clamp, smoothstep } from 'three/tsl';

function palmMaterial(part) {
  const m = new THREE.MeshStandardNodeMaterial({ side: part === 'trunk' ? THREE.FrontSide : THREE.DoubleSide });
  const c = attribute('color', 'vec4');
  m.colorNode = c.rgb;
  m.roughnessNode = float(part === 'fronds' ? 0.55 : 0.85);
  m.metalnessNode = float(0);
  if (part !== 'trunk') {
    // sway grows with height above the trunk top region (crown and skirt only); phase per instance
    const ph = attribute('aPhase', 'float');
    const h = clamp(positionLocal.y.div(14.0), 0, 1);
    const k = h.mul(h).mul(part === 'fronds' ? 0.18 : 0.08);
    const sw = vec3(sin(time.mul(0.9).add(ph)).mul(k), float(0), cos(time.mul(0.7).add(ph.mul(1.3))).mul(k.mul(0.7)));
    // fronds also flutter at the tips (further from the trunk axis = more)
    const r = clamp(positionLocal.xz.length().div(2.5), 0, 1);
    const fl = part === 'fronds' ? sin(time.mul(2.3).add(ph.mul(3.1)).add(positionLocal.x.mul(1.7))).mul(r).mul(0.06) : float(0);
    m.positionNode = positionLocal.add(sw).add(vec3(0, fl, 0));
  }
  m.lineMask = part === 'trunk' ? 0 : 1; // foliage: no inner crease lines
  m.animeFloor = 0.12;
  return m;
}

// spots: [{ x, y, z, rot, scale, variant }]
export async function buildPalms(ctx, root, spots) {
  if (!spots.length) return null;
  const models = await Promise.all([0, 1, 2, 3].map((i) => ctx.assets.gltf(`models/landmarks2/palm_${i}.glb`)));
  const mats = { trunk: palmMaterial('trunk'), skirt: palmMaterial('skirt'), fronds: palmMaterial('fronds') };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let count = 0;
  models.forEach((g, vi) => {
    if (!g) return;
    const list = spots.filter((sp) => sp.variant % models.length === vi);
    if (!list.length) return;
    g.scene.updateMatrixWorld(true);
    for (const part of ['trunk', 'skirt', 'fronds']) {
      const node = g.scene.getObjectByName(part);
      if (!node?.isMesh) continue;
      const geo = node.geometry.clone();
      geo.applyMatrix4(node.matrixWorld);
      // Blender 5 writes a blank white COLOR_0 next to the painted layer (COLOR_1 -> 'color_1'); use the painted one
      if (geo.attributes.color_1) { geo.setAttribute('color', geo.attributes.color_1); geo.deleteAttribute('color_1'); }
      if (!geo.attributes.color) continue;
      const phase = new Float32Array(list.length);
      const im = new THREE.InstancedMesh(geo, mats[part], list.length);
      list.forEach((sp, i) => {
        q.setFromAxisAngle(up, sp.rot); p.set(sp.x, sp.y ?? 0, sp.z); s.setScalar(sp.scale ?? 1);
        m4.compose(p, q, s); im.setMatrixAt(i, m4);
        phase[i] = (sp.x * 0.37 + sp.z * 0.71) % 6.283;
      });
      geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
      im.computeBoundingSphere();
      im.name = `palms_${part}_${vi}`;
      root.add(im);
    }
    count += list.length;
  });
  console.log(`[landmarks] palms: ${count}`);
  return { count };
}
