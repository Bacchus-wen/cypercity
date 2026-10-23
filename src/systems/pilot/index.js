// Tripo pilot assets (?pilot=1): AI-generated props run through pipeline/ (normalize: meters, front = -Z in game,
// origin on the ground) and placed near the spawn for side-by-side review with the original assets.
// Sources and generation parameters: ../../../assets/derived/tripo/pilot_*/provenance.json (outside the game repo).
import * as THREE from 'three/webgpu';

const ENABLED = typeof location !== 'undefined' && new URLSearchParams(location.search).get('pilot') === '1';
const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const FIGURE = QS.get('pilotfig') !== '0'; // debug: ?pilotfig=0 lights the pilot car like the environment

// rotY: game yaw (radians); front (-Z) turns towards -sin(rotY), -cos(rotY)
const PLACEMENTS = [
  { file: 'models/pilot/vending.glb', name: 'pilot_vending', pos: [-9.3, 0.15, 14], rotY: -Math.PI / 2, figure: false, collider: true },
  // v2: reference with real kei proportions (Codex image), flattened palette, wheels split into wheel_FL/FR/RL/RR.
  // ?pilotkei=1 shows the first version instead.
  QS.get('pilotkei') === '1'
    ? { file: 'models/pilot/kei.glb', name: 'pilot_kei', pos: [-4.4, 0, 5.5], rotY: 0, figure: true, collider: true, albedo: 0.72 }
    : { file: 'models/pilot/kei_v2.glb', name: 'pilot_kei', pos: [-4.4, 0, 5.5], rotY: 0, figure: true, collider: true, albedo: 0.85 },
];

export default {
  async init(ctx) {
    if (!ENABLED) return;
    const { RAPIER, world } = ctx.physics;
    const root = new THREE.Group();
    root.name = 'pilot';
    ctx.scene.add(root);
    for (const p of PLACEMENTS) {
      const gltf = await ctx.assets.gltf(p.file);
      if (!gltf) { console.warn('[pilot] missing', p.file); continue; }
      const obj = gltf.scene;
      obj.name = p.name;
      obj.position.set(...p.pos);
      obj.rotation.y = p.rotY;
      const seen = new Set(); // parts (e.g. split wheels) share one material: adjust it once
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = true;
        if (seen.has(o.material)) return;
        seen.add(o.material);
        // anime look: vehicles get the figure treatment (rim/key light, designed lows); props stay environment
        if (p.figure && FIGURE) { o.material.animeRim = 1; o.material.animeFloor = 0.05; o.material.animeSpecTh = 0.8; o.material.animeKey = 0.25; }
        // Tripo colour maps carry baked light (no de-lighting step yet): tone them down so they sit with the scene
        if (p.albedo) o.material.color.multiplyScalar(p.albedo);
      });
      root.add(obj);
      if (p.collider) {
        obj.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
        const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(c.x, c.y, c.z));
        world.createCollider(RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2), body);
      }
      console.log(`[pilot] placed ${p.name}`);
    }
  },
};
