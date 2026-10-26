// Canal traffic of the restyle map: water taxis and small cabin cruisers gliding up and down the canal (two lanes, under
// the bridge, the rail and the expressway), with lit cabins, red/green navigation lights and a foam wake. Each boat is
// merged into a few meshes; motion is a simple loop along z with a gentle bob and roll.
import * as THREE from 'three/webgpu';
import { uv, vec3, float, time, sin, fract, smoothstep, mix } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const glow = (c, i) => { const m = new THREE.MeshBasicNodeMaterial(); m.colorNode = vec3(...c).mul(i); m.lineMask = 1; return m; };
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

function boatGeometry(kind) {
  // hull: box with a wedge bow (towards -z = forward), deck rail; cabin; window band; lights
  const L = kind === 'taxi' ? 7.5 : 9, W = kind === 'taxi' ? 2.4 : 2.8;
  const bow = new THREE.CylinderGeometry(0.01, W / 2, 2.2, 3, 1).rotateX(-Math.PI / 2).rotateZ(Math.PI / 6).scale(1, 0.55, 1).translate(0, 0.35, -L / 2 - 1.0);
  const hull = [box(W, 0.9, L, 0, 0.25, 0), bow];
  const trim = [box(W + 0.06, 0.1, L, 0, 0.72, 0)];
  const cabin = kind === 'taxi' ? [box(W * 0.8, 1.2, L * 0.45, 0, 1.3, 0.3), box(W * 0.84, 0.08, L * 0.5, 0, 1.94, 0.3)] : [box(W * 0.72, 1.0, L * 0.35, 0, 1.2, 0.8), box(W * 0.5, 0.7, L * 0.2, 0, 2.05, 1.2)];
  const win = kind === 'taxi' ? [box(W * 0.82, 0.38, L * 0.42, 0, 1.45, 0.3)] : [box(W * 0.74, 0.3, L * 0.32, 0, 1.3, 0.8)];
  const sign = kind === 'taxi' ? [box(0.9, 0.32, 0.5, 0, 2.15, 0.3)] : [];
  return { L, W, hull: mergeGeometries(hull.map((g) => g.toNonIndexed())), trim: mergeGeometries(trim), cabin: mergeGeometries(cabin), win: mergeGeometries(win), sign: sign.length ? mergeGeometries(sign) : null };
}

export function buildBoats(ctx, root) {
  const L = ctx.layout, R = L.river;
  if (!R.canal) return null;
  const g = new THREE.Group(); g.name = 'canal_boats';
  const wakeMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const u = uv();
  const foam = smoothstep(0.55, 0.9, fract(u.y.mul(7).add(time.mul(1.8)).add(sin(u.x.mul(14)).mul(0.15))));
  // (plane v runs from the far tail (0) to the stern (1)): densest at the stern, narrowing to the sides
  const fade = u.y.mul(u.y).mul(smoothstep(0.0, 0.3, float(0.5).sub(u.x.sub(0.5).abs()).mul(2)));
  wakeMat.colorNode = vec3(0.75, 0.85, 0.95).mul(mix(float(0.12), float(0.45), foam)).mul(fade);
  wakeMat.lineMask = 1;
  const defs = [
    // (right-hand rule on the water too: northbound on the east lane)
    // (one speed per lane so boats sharing a lane keep their spacing - they never overtake each other)
    { kind: 'taxi', paint: 0xf0b21a, x: R.xCenter + 6, dir: -1, speed: 3.8, z: 20 },
    { kind: 'cruiser', paint: 0xe9e6de, x: R.xCenter - 6, dir: 1, speed: 3.3, z: -180 },
    { kind: 'taxi', paint: 0xf0b21a, x: R.xCenter - 6, dir: 1, speed: 3.3, z: -470 },
    { kind: 'cruiser', paint: 0x2a2d36, x: R.xCenter + 6, dir: -1, speed: 3.8, z: -300 },
  ];
  const boats = [];
  const z0 = Math.min(R.zStart, (L.promenade?.zStart ?? 60) + 20), z1 = Math.max(R.zEnd, (L.promenade?.zEnd ?? -540) - 20);
  for (const d of defs) {
    const geo = boatGeometry(d.kind);
    const boat = new THREE.Group(), body = new THREE.Group(); // body rolls; the wake stays flat on the water
    boat.add(body);
    const paint = new THREE.MeshStandardNodeMaterial({ color: d.paint, roughness: 0.45, metalness: 0.2 });
    const dark = new THREE.MeshStandardNodeMaterial({ color: 0x15161b, roughness: 0.4, metalness: 0.4 });
    body.add(new THREE.Mesh(geo.hull, paint), new THREE.Mesh(geo.trim, d.kind === 'taxi' ? dark : glow([1.0, 0.25, 0.3], 1.5)), new THREE.Mesh(geo.cabin, d.kind === 'taxi' ? dark : paint));
    body.add(new THREE.Mesh(geo.win, glow([1.0, 0.8, 0.55], 1.6)));
    if (geo.sign) body.add(new THREE.Mesh(geo.sign, glow([1.0, 0.75, 0.2], 3.5)));
    // navigation lights: red port (left = -x when heading -z), green starboard, white stern
    const nav = [[-geo.W / 2 - 0.02, 1.0, -geo.L / 2 + 0.6, [1, 0.1, 0.08]], [geo.W / 2 + 0.02, 1.0, -geo.L / 2 + 0.6, [0.1, 1, 0.4]], [0, 1.0, geo.L / 2 + 0.02, [1, 1, 0.95]]];
    for (const [x, y, z, c] of nav) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 4), glow(c, 6)); m.position.set(x, y, z); body.add(m); }
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(geo.W * 1.8, 12).rotateX(-Math.PI / 2).translate(0, 0, geo.L / 2 + 6), wakeMat);
    wake.renderOrder = 3; boat.add(wake);
    boat.rotation.y = d.dir > 0 ? Math.PI : 0; // models face -z
    boat.position.set(d.x, R.waterLevel + 0.15, d.z);
    g.add(boat);
    boats.push({ obj: boat, body, wake, d, ph: Math.random() * 6.28 });
  }
  root.add(g);
  console.log(`[landmarks] canal boats: ${boats.length}`);
  let t = 0;
  return {
    update(dt, time, ctx) {
      if (ctx?.photoFreeze) return; // photo mode
      t += dt;
      for (const b of boats) {
        const p = b.obj.position;
        p.z += b.d.dir * b.d.speed * dt; // dir -1 heads north (-z), +1 south
        if (p.z < z1) p.z = z0; else if (p.z > z0) p.z = z1;
        p.y = R.waterLevel + 0.15 + Math.sin(t * 1.3 + b.ph) * 0.06;
        b.body.rotation.z = Math.sin(t * 0.9 + b.ph) * 0.025;
        b.wake.position.y = R.waterLevel + 0.03 - p.y; // wake pinned 3 cm above the water whatever the bob
      }
    },
  };
}
