// Solano Spire (restyle map): the skyline landmark on the boulevard axis, closing the canyon's vanishing point. A tall
// tapering octagonal shaft with light lines on its edges and floor bands, an open crown of four leaning ribs, a slowly
// turning halo ring with a scrolling SOLANO text band, and a blinking beacon. Original design for this project.
import * as THREE from 'three/webgpu';
import { uv, vec2, vec3, float, time, sin, fract, step, mix, texture } from 'three/tsl';

const glow = (c, i, fog = false) => { const m = new THREE.MeshBasicNodeMaterial(); m.colorNode = vec3(...c).mul(i); m.fog = fog; m.lineMask = 1; return m; };

export function buildSpire(ctx, root) {
  const S = ctx.layout.spire;
  if (!S) return null;
  const g = new THREE.Group(); g.name = 'solano_spire';
  const H = S.h, R0 = S.r, shaftH = H * 0.82, R1 = R0 * 0.42;

  // podium
  const podium = new THREE.Mesh(new THREE.BoxGeometry(R0 * 3.6, 14, R0 * 3.6), new THREE.MeshStandardNodeMaterial({ color: 0x15161b, roughness: 0.6, metalness: 0.3 }));
  podium.position.set(S.x, 7, S.z); g.add(podium);

  // shaft: graphite with emissive edge lines (8 edges), floor bands and sparse lit windows
  const shaftGeo = new THREE.CylinderGeometry(R1, R0, shaftH, 8, 1, true).translate(0, 14 + shaftH / 2, 0);
  const sm = new THREE.MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.6 });
  const u = uv(), up = u.y.mul(shaftH);
  const edgeLine = step(0.93, fract(u.x.mul(8)).sub(0.5).abs().mul(2)); // light lines on the 8 edges
  const band = step(0.92, fract(up.div(12)));
  const cell = fract(sin(vec2(u.x.mul(64).floor(), up.div(3.5).floor()).dot(vec2(12.9898, 78.233))).mul(43758.5));
  const win = step(0.78, cell).mul(step(0.3, fract(up.div(3.5)))).mul(step(0.2, fract(u.x.mul(64))));
  sm.colorNode = vec3(0.03, 0.03, 0.04);
  // black shaft, hot red edge lines, white floor bands every 12 m, few warm windows - unlike the cyan/orange skyline
  sm.emissiveNode = vec3(1.0, 0.12, 0.16).mul(edgeLine.mul(5.0)).add(vec3(0.95, 0.9, 0.95).mul(band.mul(0.9))).add(vec3(1.0, 0.82, 0.6).mul(win.mul(0.6)));
  const shaft = new THREE.Mesh(shaftGeo, sm); shaft.position.set(S.x, 0, S.z); g.add(shaft);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(R1 * 1.04, R1 * 1.04, 1.2, 8), new THREE.MeshStandardNodeMaterial({ color: 0x101116, roughness: 0.5, metalness: 0.6 }));
  cap.position.set(S.x, 14 + shaftH + 0.6, S.z); g.add(cap);

  // crown: four leaning ribs converging on a mast
  const yTop = 14 + shaftH, crownH = H - yTop;
  const ribM = glow([1.0, 0.25, 0.3], 3.2);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    const from = new THREE.Vector3(S.x + Math.cos(a) * R1, yTop, S.z + Math.sin(a) * R1), to = new THREE.Vector3(S.x, H - 6, S.z);
    const len = from.distanceTo(to);
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.7, len, 0.7), ribM);
    rib.position.copy(from).add(to).multiplyScalar(0.5);
    rib.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    g.add(rib);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, crownH + 8, 6), new THREE.MeshStandardNodeMaterial({ color: 0x1a1b20, roughness: 0.4, metalness: 0.8 }));
  mast.position.set(S.x, yTop + (crownH + 8) / 2, S.z); g.add(mast);

  // halo ring + scrolling text band
  const halo = new THREE.Mesh(new THREE.TorusGeometry(R1 * 2.6, 0.9, 6, 96), glow([1.0, 0.2, 0.25], 5.0));
  halo.position.set(S.x, yTop + crownH * 0.35, S.z); halo.rotation.x = Math.PI / 2 + 0.12; g.add(halo);
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 128;
  const c2 = cv.getContext('2d');
  c2.fillStyle = '#000'; c2.fillRect(0, 0, 2048, 128);
  c2.font = '900 italic 96px "Avenir Next Condensed", "DIN Condensed", Impact, sans-serif'; c2.textBaseline = 'middle'; c2.fillStyle = '#ffffff';
  for (let i = 0; i < 4; i++) c2.fillText('SOLANO  ◆', i * 512 + 16, 66);
  const tt = new THREE.CanvasTexture(cv); tt.wrapS = THREE.RepeatWrapping; tt.colorSpace = THREE.SRGBColorSpace;
  const bm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const bu = uv();
  const txt = texture(tt, vec2(bu.x.mul(2).add(time.mul(0.03)), bu.y)).r;
  bm.colorNode = mix(vec3(1.0, 0.3, 0.4), vec3(1.0, 0.75, 0.3), sin(bu.x.mul(12).add(time)).mul(0.5).add(0.5)).mul(txt.mul(3.0)).add(vec3(1.0, 0.25, 0.3).mul(0.15));
  bm.fog = false; bm.lineMask = 1;
  const bandMesh = new THREE.Mesh(new THREE.CylinderGeometry(R1 * 1.9, R1 * 1.9, 7, 64, 1, true), bm);
  bandMesh.position.set(S.x, yTop - 10, S.z); bandMesh.renderOrder = 4; g.add(bandMesh);

  // beacon
  const beaconM = new THREE.MeshBasicNodeMaterial(); beaconM.fog = false; beaconM.lineMask = 1;
  beaconM.colorNode = vec3(1.0, 0.95, 0.9).mul(float(0.6).add(step(0.85, fract(time.mul(0.7))).mul(14)));
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), beaconM);
  beacon.position.set(S.x, H + 2, S.z); g.add(beacon);

  root.add(g);
  console.log(`[landmarks] Solano Spire ${H} m at (${S.x}, ${S.z})`);
  return {
    update(dt) { halo.rotation.z += dt * 0.12; bandMesh.rotation.y -= dt * 0.05; },
  };
}
