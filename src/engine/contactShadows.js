// Contact shadows (anime look): the sun casts no shadow maps, so people and cars floated on the paving. A soft dark
// footprint under each one grounds them - an ellipse under a person, a rounded rectangle under a car - drawn as one
// instanced, depth-tested, non-depth-writing decal batch per kind. Transparent, so it never writes the G-buffer.
import * as THREE from 'three/webgpu';
import { uv, vec2, vec3, float, smoothstep, length, max, abs } from 'three/tsl';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

// Static footprints: systems register the bases of street furniture during init (anime look only); the landmarks
// system draws them all in one batch on its first frame, after every system has registered.
export function addFootprint(ctx, x, y, z, sx, sz = sx, yaw = 0) {
  if (!ANIME_FP) return;
  (ctx.footprints ||= []).push([x, y, z, yaw, sx, sz]);
}
const ANIME_FP = typeof location !== 'undefined' && new URLSearchParams(location.search).get('look') !== 'legacy';

export class ContactShadows {
  // shape: 'ellipse' (people) | 'box' (cars); strength: centre opacity
  constructor(parent, capacity, { shape = 'ellipse', strength = 0.5, name = 'contact_shadows' } = {}) {
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const q = uv().sub(0.5).mul(2); // -1..1
    const d = shape === 'box'
      ? length(max(abs(q).sub(vec2(0.55, 0.7)), 0)).div(0.4) // rounded rectangle, soft rim
      : length(q);
    m.colorNode = vec3(0.04, 0.03, 0.07); // a cool violet-black, like the shade bands
    m.opacityNode = smoothstep(1.0, shape === 'box' ? 0.0 : 0.3, d).mul(float(strength));
    m.lineMask = 1;
    this.mesh = new THREE.InstancedMesh(g, m, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 1; this.mesh.name = name;
    this.cap = capacity; this.n = 0;
    parent.add(this.mesh);
  }
  begin() { this.n = 0; }
  // footprint at (x, y, z), yaw, size (sx across, sz along the facing)
  add(x, y, z, yaw, sx, sz) {
    if (this.n >= this.cap) return;
    _q.setFromAxisAngle(_up, yaw);
    this.mesh.setMatrixAt(this.n++, _m.compose(_p.set(x, y + 0.03, z), _q, _s.set(sx, 1, sz)));
  }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; }
}
