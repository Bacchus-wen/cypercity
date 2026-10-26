// Pigeons (restyle map): small flocks pecking around the plaza square and the canal promenade. Walk up to them (or
// drive past) and they burst into the air with a wing clatter, circle the square and settle again once you have moved
// on. One InstancedMesh per flock group; wings flap in the vertex shader from a per-instance flap attribute, heads
// bob while pecking. Original design for this project.
import * as THREE from 'three/webgpu';
import { attribute, positionLocal, vec3, float, sin, mix, step, abs, uniform } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SCARE = 4.2, SETTLE = 13;

function birdGeometry() {
  // parts tagged in aPart: 0 body, 1 neck (iridescent), 2 head, 3 wing (flaps, |x| = lever), 4 tail / wing tips dark
  const tag = (g, part) => { const n = g.attributes.position.count; g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(part), 1)); return g.index ? g.toNonIndexed() : g; };
  const body = new THREE.SphereGeometry(0.1, 8, 6).scale(0.85, 0.8, 1.55).translate(0, 0.13, 0.02);
  const neck = new THREE.SphereGeometry(0.06, 6, 5).scale(1, 1.2, 1).translate(0, 0.2, -0.1);
  const head = new THREE.SphereGeometry(0.045, 6, 5).translate(0, 0.25, -0.14);
  const beak = new THREE.ConeGeometry(0.012, 0.035, 4).rotateX(-Math.PI / 2).translate(0, 0.245, -0.195);
  const tail = new THREE.BoxGeometry(0.09, 0.012, 0.11).translate(0, 0.12, 0.17);
  const wl = new THREE.PlaneGeometry(0.22, 0.13, 3, 1).rotateX(-Math.PI / 2).translate(-0.12, 0.17, 0.03);
  const wr = new THREE.PlaneGeometry(0.22, 0.13, 3, 1).rotateX(-Math.PI / 2).translate(0.12, 0.17, 0.03);
  const legs = new THREE.BoxGeometry(0.05, 0.07, 0.012).translate(0, 0.035, 0.02);
  return mergeGeometries([tag(body, 0), tag(neck, 1), tag(head, 2), tag(beak, 4), tag(tail, 4), tag(wl, 3), tag(wr, 3), tag(legs, 4)]);
}

const uT = uniform(0); // bird clock (stops in photo mode, unlike the global shader time)

function birdMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide });
  const part = attribute('aPart', 'float'), fly = attribute('aFly', 'vec2'); // x = flap amount (0 folded .. 1 flying), y = phase
  const p = positionLocal;
  const isWing = step(2.5, part).mul(step(part, 3.5));
  const lever = abs(p.x).sub(0.02).max(0);
  const flap = sin(uT.mul(17).add(fly.y)).mul(lever).mul(1.6).mul(fly.x);
  // folded on the ground: wings pulled in against the body
  const fold = float(1).sub(fly.x).mul(isWing);
  const wx = p.x.mul(mix(float(1), float(0.35), fold));
  // pecking: head + neck dip on the ground
  const isHead = step(0.5, part).mul(step(part, 2.5));
  const peck = sin(uT.mul(6).add(fly.y)).max(0).pow(3).mul(0.07).mul(float(1).sub(fly.x)).mul(isHead);
  m.positionNode = vec3(wx, p.y.add(flap.mul(isWing)).sub(peck), p.z.sub(peck.mul(0.6)));
  const grey = vec3(0.42, 0.45, 0.52), neck = mix(vec3(0.25, 0.55, 0.42), vec3(0.5, 0.3, 0.6), sin(uT.mul(0.7).add(fly.y)).mul(0.5).add(0.5)), dark = vec3(0.1, 0.1, 0.12);
  m.colorNode = mix(mix(mix(grey, neck, step(0.5, part).mul(step(part, 1.5))), grey.mul(0.8), step(1.5, part).mul(step(part, 2.5))), dark, step(3.5, part));
  return m;
}

// obstacles: [{ x, z, r, y0, y1 }] vertical cylinders flying birds keep out of (palm crowns + trunks, lamp posts)
export function buildPigeons(ctx, root, obstacles = []) {
  const L = ctx.layout;
  if (!L.plaza) return null;
  const P = L.plaza, PR = L.promenade;
  const cx = (P.x0 + P.x1) / 2 + 4, cz = (P.z0 + P.z1) / 2;
  // flock areas: open paving clear of the walkways, planters, kiosk queues and the deck steps (plaza: the two eastern
  // quarters of the square, paving at y 0.15; canal walk: a stretch north of the bridge)
  const flocks = [
    // (kept clear of the plaza lamp posts at cx+15, cz+-15, of the promenade palm row at xMax - 1 and of the crowns
    //  (r 3.2) of the plaza palm row at x = boulevard edge - 3 = cx + 21.4: the flocks end 0.6 m outside them)
    { n: 14, x0: cx + 12.5, x1: cx + 17.6, z0: cz + 16.6, z1: cz + 30, y: 0.15 },
    { n: 12, x0: cx + 12.5, x1: cx + 17.6, z0: cz - 26, z1: cz - 16.6, y: 0.15 },
    { n: 12, x0: PR.xMin + 1.0, x1: PR.xMax - 2.8, z0: L.bridges[0].z + 14, z1: L.bridges[0].z + 34, y: PR.y },
  ];
  const total = flocks.reduce((a, f) => a + f.n, 0);
  const obs = [...obstacles];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) obs.push({ x: cx + sx * 15, z: cz + sz * 15, r: 0.9, y0: 0, y1: 7 }); // plaza lamp posts
  let dtNow = 1 / 60;
  const keepOut = (b) => {
    for (const o of obs) {
      if (b.pos.y < o.y0 || b.pos.y > o.y1) continue;
      const dx = b.pos.x - o.x, dz = b.pos.z - o.z, d = Math.hypot(dx, dz);
      if (d < o.r + 0.3) {
        // bounce off: cancel (and reflect) the inward part of the velocity near the edge, then ease out if inside -
        // no pop to the edge, and no sliding deep into a palm crown
        const nx = dx / Math.max(d, 1e-3), nz = dz / Math.max(d, 1e-3), vin = b.vel.x * nx + b.vel.z * nz;
        if (vin < 0) { b.vel.x -= vin * nx * 1.6; b.vel.z -= vin * nz * 1.6; }
        if (d < o.r) { const push = Math.min(o.r - d, 6 * dtNow); b.pos.x += nx * push; b.pos.z += nz * push; b.vel.y = Math.max(b.vel.y, 1.5); }
      }
    }
  };
  const geo = birdGeometry();
  const aFly = new THREE.InstancedBufferAttribute(new Float32Array(total * 2), 2); aFly.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aFly', aFly);
  const im = new THREE.InstancedMesh(geo, birdMaterial(), total);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.name = 'pigeons';
  root.add(im);
  let seed = 9001; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const birds = [];
  for (const f of flocks) {
    f.state = 'ground'; f.t = 0; f.cx = (f.x0 + f.x1) / 2; f.cz = (f.z0 + f.z1) / 2;
    for (let i = 0; i < f.n; i++) {
      const b = { f, pos: new THREE.Vector3(f.x0 + rnd() * (f.x1 - f.x0), f.y, f.z0 + rnd() * (f.z1 - f.z0)), yaw: rnd() * 6.28, ph: rnd() * 6.28, walkT: rnd() * 3, vel: new THREE.Vector3(), flyK: 0, orbitA: rnd() * 6.28, orbitR: 5 + rnd() * 6, orbitH: 14 + rnd() * 8 };
      b.home = b.pos.clone();
      birds.push(b);
      aFly.setXY(birds.length - 1, 0, b.ph);
    }
  }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), SC = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
  console.log(`[landmarks] pigeons: ${total} in ${flocks.length} flocks`);
  const api = { onTakeoff: null };
  return {
    api,
    update(dt, t, c) {
      if (c?.photoFreeze || dt <= 0) return;
      uT.value += dt; dtNow = dt;
      const pl = c?.api?.player;
      const car = c?.api?.vehicles?.activeCar;
      const who = car?.pos || pl?.object?.position;
      for (const f of flocks) {
        f.t += dt;
        const near = who ? Math.hypot(who.x - f.cx, who.z - f.cz) : 1e9;
        if (f.state === 'ground' && who && Math.abs(who.y - f.y) < 4) {
          // scared when someone walks into the flock (any bird within SCARE m) or a car comes close at speed
          let close = false;
          for (const b of birds) if (b.f === f && Math.hypot(who.x - b.pos.x, who.z - b.pos.z) < (car ? SCARE + 2 : SCARE)) { close = true; break; }
          if (close) {
            f.state = 'air'; f.t = 0;
            for (const b of birds) if (b.f === f) { b.vel.set(b.pos.x - who.x, 0, b.pos.z - who.z).setLength(1.2 + rnd() * 1.2).setY(6 + rnd() * 2.5); b.flyDelay = rnd() * 0.35; b.land = null; } // (steep climb: clear of posts and palms)
            api.onTakeoff?.(f.cx, f.y + 1, f.cz);
          }
        } else if (f.state === 'air' && f.t > 9 && near > SETTLE) {
          f.state = 'landing'; f.t = 0;
          for (const b of birds) if (b.f === f) b.land = new THREE.Vector3(f.x0 + rnd() * (f.x1 - f.x0), f.y, f.z0 + rnd() * (f.z1 - f.z0)); // (drawn once)
        } else if (f.state === 'landing') {
          // settled when every bird is down (or, failing that, after 15 s)
          let down = true;
          for (const b of birds) if (b.f === f && b.land && b.pos.distanceToSquared(b.land) > 0.01) { down = false; break; }
          if (down || f.t > 15) { f.state = 'ground'; for (const b of birds) if (b.f === f && b.land) { b.pos.copy(b.land); b.land = null; b.flyK = 0; } }
        }
      }
      for (let i = 0; i < birds.length; i++) {
        const b = birds[i], f = b.f;
        if (f.state === 'ground') {
          b.flyK = Math.max(0, b.flyK - dt * 3);
          b.walkT -= dt;
          if (b.walkT < 0) { b.walkT = 1.5 + rnd() * 3; b.yaw += (rnd() - 0.5) * 2.2; b.step = 0.5 + rnd() * 0.8; }
          if (b.step > 0) {
            const s = Math.min(b.step, dt * 0.45); b.step -= s;
            b.pos.x += -Math.sin(b.yaw) * s; b.pos.z += -Math.cos(b.yaw) * s;
            // stay inside the flock area
            if (b.pos.x < f.x0 || b.pos.x > f.x1 || b.pos.z < f.z0 || b.pos.z > f.z1) { b.yaw += Math.PI; b.pos.x = THREE.MathUtils.clamp(b.pos.x, f.x0, f.x1); b.pos.z = THREE.MathUtils.clamp(b.pos.z, f.z0, f.z1); }
          }
          b.pos.y = f.y;
        } else if (f.state === 'air') {
          if ((b.flyDelay -= dt) > 0) { /* still on the ground for a beat */ } else if (f.t < 1.6) {
            b.flyK = Math.min(1, b.flyK + dt * 6);
            b.vel.y -= dt * 1.2; b.pos.addScaledVector(b.vel, dt);
            b.yaw = Math.atan2(-b.vel.x, -b.vel.z);
          } else {
            // circle the square overhead
            b.flyK = 1;
            b.orbitA += dt * (0.55 + (i % 3) * 0.08);
            tmp.set(f.cx + Math.cos(b.orbitA) * b.orbitR, f.y + b.orbitH + Math.sin(b.orbitA * 2 + b.ph) * 1.2, f.cz + Math.sin(b.orbitA) * b.orbitR);
            const d = tmp.sub(b.pos); d.setLength(Math.min(d.length() / Math.max(dt, 1e-3), 7));
            b.vel.lerp(d, Math.min(1, dt * 1.8)); b.pos.addScaledVector(b.vel, dt);
            b.yaw = Math.atan2(-b.vel.x, -b.vel.z);
          }
        } else if (b.land) { // landing: glide back down to the spot drawn for it on the paving
          const d = tmp.subVectors(b.land, b.pos), dist = d.length();
          if (dist > 0.05) {
            const v = Math.min(dist / 0.6, 6);
            b.vel.lerp(d.setLength(v), Math.min(1, dt * 2.5)); b.pos.addScaledVector(b.vel, dt);
            b.yaw = Math.atan2(-b.vel.x, -b.vel.z);
            b.flyK = dist > 0.6 ? 1 : dist / 0.6;
          } else { b.pos.copy(b.land); b.flyK = 0; }
        }
        if (f.state !== 'ground') keepOut(b);
        Q.setFromAxisAngle(UP, b.yaw);
        M.compose(b.pos, Q, SC); im.setMatrixAt(i, M);
        aFly.setXY(i, b.flyK, b.ph);
      }
      im.instanceMatrix.needsUpdate = true; aFly.needsUpdate = true;
    },
  };
}
