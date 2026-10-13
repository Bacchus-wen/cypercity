// Ground traffic (avenue, cross streets, expressway) with IDM car-following + traffic signals, and flying AV lanes.
// Fully deterministic: seeded RNG for spawn, fixed dt in shot mode.
import * as THREE from 'three/webgpu';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PALETTE = {
  hero: [0x0a0a0c],
  kei: [0xd8d6d0, 0x2a3a52, 0x8a1c22, 0x101012, 0xb7b9bc, 0x5b6b4a, 0xc9b48a, 0x1d4a5c],
  taxi: [0xf0b21a, 0x12161a, 0x1c3f2a, 0xe8e4da],
  van: [0xb4b4b0, 0xaaa8a2, 0x7d838a, 0x24425e, 0xbcbcb6],
  av: [0x0c0c10, 0x2b2f38, 0xd9d9dd, 0x4a0d14, 0x0e2a3a],
};

const SIGNAL_CYCLE = 30;
// phase of an intersection: returns { avenue: 'g'|'y'|'r', cross: ... }
export function signalState(t, offset) {
  const p = ((t + offset) % SIGNAL_CYCLE + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  const avenue = p < 14 ? 'g' : p < 17 ? 'y' : 'r';
  const cross = p >= 18 && p < 27 ? 'g' : p >= 27 && p < 30 ? 'y' : 'r';
  return { avenue, cross };
}

class Lane {
  constructor(o) {
    Object.assign(this, o);
    this.dir = o.dir.clone().normalize();
    this.cars = [];
    this.yaw = Math.atan2(-this.dir.x, -this.dir.z); // car forward is -Z
    this.quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    this.stops = o.stops || [];
  }
  point(s, out) { return out.copy(this.p0).addScaledVector(this.dir, s); }
}

export class Traffic {
  constructor(ctx, models, opts) {
    this.ctx = ctx; this.models = models;
    this.lanes = [];
    this.cars = [];
    this.rng = mulberry32(opts.seed || 1234);
    const L = ctx.layout;
    const av = L.avenue, cs = L.crossStreets;
    const crossZs = cs.zs;
    const offs = (z) => (-z / 60) * 3.0; // green wave offset
    const yA = 0;
    // --- avenue lanes (Japanese LEFT-hand traffic, matches the expressway). northbound (-Z) at -x, southbound (+Z) at +x
    const aStops = (sign) => crossZs.map((z) => ({ pos: z + sign * (cs.roadHalfWidth + 2.2), group: 'avenue', off: offs(z) }));
    this.addLane({ kind: 'avenue', p0: new THREE.Vector3(-1.5, yA, av.zStart), dir: new THREE.Vector3(0, 0, -1), length: av.zStart - av.zEnd, v0: 12, stopsAt: aStops(1), axis: 'z' });
    this.addLane({ kind: 'avenue', p0: new THREE.Vector3(1.5, yA, av.zEnd), dir: new THREE.Vector3(0, 0, 1), length: av.zStart - av.zEnd, v0: 12, stopsAt: aStops(-1), axis: 'z' });
    // --- cross streets: eastbound (+X) at z-1.6, westbound at z+1.6
    for (const z of crossZs) {
      const hw = av.roadHalfWidth + 2.2;
      this.addLane({ kind: 'cross', p0: new THREE.Vector3(cs.xStart, yA, z - 2.2), dir: new THREE.Vector3(1, 0, 0), length: cs.xEnd - cs.xStart, v0: 10, stopsAt: [{ pos: -hw, group: 'cross', off: offs(z) }], axis: 'x' });
      this.addLane({ kind: 'cross', p0: new THREE.Vector3(cs.xEnd, yA, z + 2.2), dir: new THREE.Vector3(-1, 0, 0), length: cs.xEnd - cs.xStart, v0: 10, stopsAt: [{ pos: hw, group: 'cross', off: offs(z) }], axis: 'x' });
    }
    // --- expressway (elevated): use the landmarks lane list when present
    const ex = opts.expressway;
    if (ex) {
      const lanes = ex.lanes?.length ? ex.lanes : [{ z: ex.z - 5.25, dir: 1 }, { z: ex.z - 1.75, dir: 1 }, { z: ex.z + 1.75, dir: -1 }, { z: ex.z + 5.25, dir: -1 }];
      lanes.forEach((ln, i) => {
        const v0 = (ex.speedLimit || 22) * (i % 2 ? 1.12 : 0.92);
        this.addLane({ kind: 'express', p0: new THREE.Vector3(ln.dir > 0 ? ex.xStart : ex.xEnd, ex.deckY, ln.z), dir: new THREE.Vector3(ln.dir, 0, 0), length: ex.xEnd - ex.xStart, v0, stopsAt: [], axis: 'x' });
      });
    }
    // --- populate
    const typeFor = (kind) => {
      const r = this.rng();
      if (kind === 'express') return r < 0.35 ? 'van' : r < 0.65 ? 'kei' : r < 0.85 ? 'taxi' : 'hero';
      return r < 0.38 ? 'kei' : r < 0.66 ? 'taxi' : r < 0.86 ? 'van' : 'hero';
    };
    for (const lane of this.lanes) {
      const spacing = lane.kind === 'express' ? 34 : lane.kind === 'avenue' ? 26 : 32;
      let s = this.rng() * spacing;
      while (s < lane.length - 8) {
        const type = typeFor(lane.kind);
        if (!models[type]) { s += spacing; continue; }
        const pal = PALETTE[type];
        const car = this.makeCar(type, new THREE.Color(pal[Math.floor(this.rng() * pal.length)]));
        car.lane = lane; car.s = s; car.v = lane.v0 * (0.75 + this.rng() * 0.3); car.v0 = lane.v0 * (0.85 + this.rng() * 0.3);
        lane.cars.push(car); this.cars.push(car);
        s += spacing * (0.6 + this.rng() * 1.1);
      }
      this.placeLaneCars(lane);
    }
  }

  addLane(o) {
    const lane = new Lane(o);
    // convert stop world coordinate to lane s
    lane.stops = (o.stopsAt || []).map((st) => {
      const p = o.axis === 'z' ? st.pos - lane.p0.z : st.pos - lane.p0.x;
      const s = o.axis === 'z' ? p / lane.dir.z : p / lane.dir.x;
      return { s, group: st.group, off: st.off };
    }).filter((st) => st.s > 0 && st.s < lane.length);
    this.lanes.push(lane);
    return lane;
  }

  makeCar(type, paint) {
    const M = this.models[type];
    return {
      type, kind: 'traffic', paint, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), light: new THREE.Vector3(1, 1, 0),
      spin: 0, steer: 0, v: 0, s: 0, len: M.length, radius: M.length * 0.6, position: null, speed: 0,
    };
  }

  placeLaneCars(lane) {
    for (const c of lane.cars) {
      lane.point(c.s, c.pos);
      c.quat.copy(lane.quat);
      c.position = c.pos; c.speed = c.v;
    }
  }

  // obstacles: array of Vector3 (player / driven car) that traffic must not run into
  update(dt, t, obstacles) {
    const tmp = this._tmp || (this._tmp = new THREE.Vector3());
    for (const lane of this.lanes) {
      const cars = lane.cars;
      cars.sort((a, b) => b.s - a.s);
      // obstacles projected onto this lane
      const obsS = [];
      for (const o of obstacles) {
        tmp.subVectors(o, lane.p0);
        const s = tmp.dot(lane.dir);
        const lat = tmp.addScaledVector(lane.dir, -s);
        if (Math.abs(lat.x) + Math.abs(lat.z) < 2.0 && Math.abs(lat.y) < 3 && s > 0 && s < lane.length) obsS.push(s);
      }
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        let gap = 1e9, vLead = c.v0;
        if (i > 0) { const L = cars[i - 1]; gap = L.s - c.s - (L.len + c.len) * 0.5; vLead = L.v; }
        else if (cars.length > 1) { const L = cars[cars.length - 1]; gap = L.s + lane.length - c.s - (L.len + c.len) * 0.5; vLead = L.v; }
        // traffic signals
        for (const st of lane.stops) {
          const ds = st.s - c.s - c.len * 0.5;
          if (ds < -0.5 || ds > 60) continue;
          const sig = signalState(t, st.off)[st.group];
          const stopDist = (c.v * c.v) / (2 * 4.0);
          if (sig === 'r' || (sig === 'y' && ds > stopDist + 1)) { if (ds < gap) { gap = Math.max(ds, 0.01); vLead = 0; } }
        }
        for (const s of obsS) {
          const ds = s - c.s - c.len * 0.5 - 1.2;
          if (ds > -1 && ds < gap) { gap = Math.max(ds, 0.01); vLead = 0; }
        }
        // IDM
        const a = 2.2, b = 3.5, s0 = 2.2, T = 1.2;
        const dv = c.v - vLead;
        const sStar = s0 + Math.max(0, c.v * T + (c.v * dv) / (2 * Math.sqrt(a * b)));
        let acc = a * (1 - Math.pow(c.v / c.v0, 4) - Math.pow(sStar / Math.max(gap, 0.01), 2));
        acc = Math.max(acc, -9);
        c.v = Math.max(0, c.v + acc * dt);
        c.s += c.v * dt;
        c.brake = acc < -0.8 || c.v < 0.3 ? 1 : 0;
        if (c.s > lane.length) c.s -= lane.length;
        c.spin -= (c.v * dt) / (this.models[c.type].wheelRadius || 0.33);
        c.light.set(1, 1, c.brake);
        c.speed = c.v;
      }
      this.placeLaneCars(lane);
    }
  }
}

// ------------------------------------------------------------------------------------------------ flying AVs
export class SkyTraffic {
  constructor(models, opts = {}) {
    this.cars = [];
    if (!models.av) return;
    const rng = mulberry32(opts.seed || 777);
    const center = opts.center || new THREE.Vector3(20, 0, -160);
    const loops = [
      { h: 48, rx: 150, rz: 210, n: 10, w: 0.06 },
      { h: 64, rx: 210, rz: 260, n: 12, w: -0.05 },
      { h: 85, rx: 120, rz: 300, n: 9, w: 0.045 },
      { h: 112, rx: 280, rz: 340, n: 12, w: -0.035 },
      { h: 140, rx: 360, rz: 420, n: 10, w: 0.03 },
    ];
    for (const L of loops) {
      for (let i = 0; i < L.n; i++) {
        const pal = PALETTE.av;
        this.cars.push({
          type: 'av', kind: 'flying', paint: new THREE.Color(pal[Math.floor(rng() * pal.length)]),
          pos: new THREE.Vector3(), quat: new THREE.Quaternion(), light: new THREE.Vector3(1, 1, 0), spin: 0, steer: 0,
          radius: 4, loop: L, th0: (i / L.n) * Math.PI * 2 + rng() * 0.3, hOff: (rng() - 0.5) * 8, bob: rng() * 6, lane: (rng() - 0.5) * 10,
          position: null, speed: 0,
        });
      }
    }
    // straight skyways crossing the district (wrap around)
    for (let k = 0; k < 4; k++) {
      const x = [-70, -40, 60, 95][k], h = [58, 74, 96, 66][k], dir = k % 2 ? 1 : -1;
      for (let i = 0; i < 8; i++) {
        this.cars.push({
          type: 'av', kind: 'flying', paint: new THREE.Color(PALETTE.av[Math.floor(rng() * 5)]), pos: new THREE.Vector3(), quat: new THREE.Quaternion(),
          light: new THREE.Vector3(1, 1, 0), spin: 0, steer: 0, radius: 4, sky: { x, h, dir, v: 30 + rng() * 15, s0: i * 120 + rng() * 60 },
          bob: rng() * 6, position: null, speed: 0,
        });
      }
    }
    this.center = center;
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
  }
  update(t) {
    const c0 = this.center, e = this._e;
    for (const c of this.cars) {
      if (c.loop) {
        const L = c.loop;
        const th = c.th0 + L.w * t;
        const rx = L.rx + c.lane, rz = L.rz + c.lane;
        c.pos.set(c0.x + Math.cos(th) * rx, L.h + c.hOff + Math.sin(t * 0.6 + c.bob) * 0.8, c0.z + Math.sin(th) * rz);
        const tx = -Math.sin(th) * rx * Math.sign(L.w), tz = Math.cos(th) * rz * Math.sign(L.w);
        e.set(-0.03, Math.atan2(-tx, -tz), Math.sign(L.w) * 0.12);
        c.quat.setFromEuler(e);
        c.speed = Math.abs(L.w) * (rx + rz) * 0.5;
      } else {
        const S = c.sky, span = 960;
        const s = ((S.s0 + S.v * t) % span + span) % span - span / 2;
        c.pos.set(S.x, S.h + Math.sin(t * 0.5 + c.bob) * 0.7, -160 + s * S.dir);
        e.set(-0.02, S.dir > 0 ? Math.PI : 0, 0);
        c.quat.setFromEuler(e);
        c.speed = S.v;
      }
      c.position = c.pos;
    }
  }
}
