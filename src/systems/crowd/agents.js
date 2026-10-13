// Pedestrian population: lanes from LAYOUT, seeded spawning, cheap steering + avoidance.
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildLanes(L) {
  const lanes = [];
  const A = L.avenue, C = L.crossStreets, P = L.promenade, AL = L.alley;
  const add = (ax, az, bx, bz, hw, density, district) => {
    const len = Math.hypot(bx - ax, bz - az);
    lanes.push({ ax, az, bx, bz, len, hw, density, district, dx: (bx - ax) / len, dz: (bz - az) / len });
  };
  const sx = A.roadHalfWidth + A.sidewalkWidth / 2; // 8
  // avenue sidewalks (dense, the hero street)
  add(sx + 0.15, A.zStart, sx + 0.15, A.zEnd, A.sidewalkWidth / 2 - 0.55, 1 / 2.6, 'avenue');
  add(-sx - 0.15, A.zStart, -sx - 0.15, A.zEnd, A.sidewalkWidth / 2 - 0.55, 1 / 2.6, 'avenue');
  // cross streets: both sidewalks, west and east of the avenue
  const cz = C.roadHalfWidth + C.sidewalkWidth / 2;
  const xIn = A.roadHalfWidth + A.sidewalkWidth + 0.5;
  for (const z of C.zs) {
    for (const s of [1, -1]) {
      add(-xIn, z + s * cz, C.xStart, z + s * cz, C.sidewalkWidth / 2 - 0.45, 1 / 9, 'cross');
      add(xIn, z + s * cz, P.xMin - 1, z + s * cz, C.sidewalkWidth / 2 - 0.45, 1 / 9, 'cross');
    }
  }
  // riverside promenade
  const pc = (P.xMin + P.xMax) / 2;
  add(pc - 1.2, P.zStart, pc - 1.2, P.zEnd, (P.xMax - P.xMin) / 2 - 2.2, 1 / 4.5, 'river');
  // alley (with stairs; y from ground.heightAt)
  add(AL.xStart - 1.5, AL.z, AL.xEnd + 4, AL.z, AL.width / 2 - 0.7, 1 / 5, 'alley');
  return lanes;
}

const WALK_CLIPS = ['walk_slow', 'walk', 'walk', 'walk', 'walk_fast'];

export class Population {
  constructor(ctx, lib, seed = 1337) {
    this.ctx = ctx; this.lib = lib;
    this.rnd = mulberry32(seed);
    this.agents = [];
    this.lanes = buildLanes(ctx.layout);
    this.grid = new Map();
  }

  pickLook(r) {
    const list = this.lib.outfitList;
    const o = list[Math.floor(r() * list.length)];
    return { sex: o.sex, outfit: o.outfit, tint: Math.floor(r() * 997), hairTint: Math.floor(r() * 991), scale: 0.95 + r() * 0.09 };
  }

  rainGear(r, ag) {
    // ~45% umbrellas in the rain (black most common, clear plastic, a few LED cyber umbrellas)
    const u = r();
    if (u < 0.22) ag.umbrella = 'black';
    else if (u < 0.36) ag.umbrella = 'clear';
    else if (u < 0.45) ag.umbrella = 'led';
    else ag.umbrella = null;
    ag.phone = !ag.umbrella && r() < 0.18;
  }

  spawn() {
    const r = this.rnd;
    for (let li = 0; li < this.lanes.length; li++) {
      const ln = this.lanes[li];
      const n = Math.floor(ln.len * ln.density);
      for (let i = 0; i < n; i++) {
        const s = r() * ln.len;
        const dir = r() < 0.5 ? 1 : -1;
        const ag = {
          id: this.agents.length, kind: 'walk', lane: li, s, dir,
          lat: (dir > 0 ? -0.35 : 0.35) * ln.hw + (r() - 0.5) * ln.hw * 1.1,
          ...this.pickLook(r),
          x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, phase: r(), pause: 0,
        };
        ag.lat = Math.max(-ln.hw, Math.min(ln.hw, ag.lat));
        this.rainGear(r, ag);
        ag.clip = ag.umbrella ? 'umbrella_walk' : ag.phone ? 'phone_walk' : WALK_CLIPS[Math.floor(r() * WALK_CLIPS.length)];
        ag.speedK = 0.93 + r() * 0.14;
        this.placeOnLane(ag);
        ag.yaw = Math.atan2(ln.dx * dir, ln.dz * dir);
        this.agents.push(ag);
      }
    }
    this.spawnIdlers();
  }

  spawnIdlers() {
    const r = this.rnd;
    const ctx = this.ctx;
    const facades = ctx.api.buildings?.facades || [];
    const spots = [];
    for (const f of facades) {
      if (!f.shopfront) continue;
      if (f.district === 'river') continue;
      spots.push(f);
    }
    const idleClip = (ag) => (ag.umbrella ? 'umbrella_idle' : ag.phone ? 'phone_idle' : (r() < 0.5 ? 'idle' : 'idle_b'));
    const addIdler = (x, z, yaw, look) => {
      const ag = { id: this.agents.length, kind: 'idle', x, z, y: 0, yaw, phase: r(), ...look, vx: 0, vz: 0 };
      this.rainGear(r, ag);
      if (r() < 0.25) ag.phone = !ag.umbrella;
      ag.clip = idleClip(ag);
      this.agents.push(ag);
      return ag;
    };
    if (spots.length) {
      for (const f of spots) {
        if (r() > 0.55) continue;
        const n = r() < 0.3 ? 2 : 1;
        const nx = f.normal.x, nz = f.normal.z, rx = f.right.x, rz = f.right.z;
        const off = (r() - 0.5) * Math.min(f.width, 10) * 0.7;
        const d = 0.55 + r() * 0.5; // under the awning, close to the shop window
        const x = f.center.x + nx * d + rx * off, z = f.center.z + nz * d + rz * off;
        const outYaw = Math.atan2(nx, nz);
        if (n === 2) {
          // two people chatting: face each other
          const yaw = outYaw + Math.PI / 2 + (r() - 0.5) * 0.4;
          const fx = Math.sin(yaw), fz = Math.cos(yaw);
          addIdler(x - fx * 0.5, z - fz * 0.5, yaw, this.pickLook(r));
          addIdler(x + fx * 0.5, z + fz * 0.5, yaw + Math.PI, this.pickLook(r));
        } else {
          const lookIn = r() < 0.3; // window shopping
          addIdler(x, z, (lookIn ? outYaw + Math.PI : outYaw) + (r() - 0.5) * 0.8, this.pickLook(r));
        }
      }
    } else {
      // fallback: along the avenue frontage
      const A = ctx.layout.avenue;
      for (let z = A.zStart; z > A.zEnd; z -= 7 + r() * 10) {
        for (const s of [1, -1]) {
          if (r() < 0.5) continue;
          const x = s * (A.roadHalfWidth + A.sidewalkWidth - 0.45);
          addIdler(x, z + r() * 3, s > 0 ? -Math.PI / 2 + (r() - 0.5) : Math.PI / 2 + (r() - 0.5), this.pickLook(r));
        }
      }
    }
  }

  placeOnLane(ag) {
    const ln = this.lanes[ag.lane];
    // lateral axis = (dz, -dx)
    ag.x = ln.ax + ln.dx * ag.s + ln.dz * ag.lat;
    ag.z = ln.az + ln.dz * ag.s - ln.dx * ag.lat;
  }

  // -------------------------------------------------------------------------------- simulation
  update(dt, clipInfo) {
    const grid = this.grid; grid.clear();
    const cell = 2.0;
    const key = (x, z) => ((Math.floor(x / cell) + 4096) * 8192 + (Math.floor(z / cell) + 4096));
    for (const ag of this.agents) {
      const k = key(ag.x, ag.z);
      let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(ag);
    }
    for (const ag of this.agents) {
      const info = clipInfo(ag);
      if (ag.kind === 'idle') {
        ag.phase = (ag.phase + dt / info.period) % 1;
        continue;
      }
      const ln = this.lanes[ag.lane];
      const fx = ln.dx * ag.dir, fz = ln.dz * ag.dir;
      // base speed
      let v = info.speed * ag.speedK;
      // avoidance: look at neighbours ahead
      let steer = 0;
      const cx = Math.floor(ag.x / cell), cz = Math.floor(ag.z / cell);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const a = grid.get((cx + i + 4096) * 8192 + (cz + j + 4096));
        if (!a) continue;
        for (const o of a) {
          if (o === ag) continue;
          const dx = o.x - ag.x, dz = o.z - ag.z;
          const ahead = dx * fx + dz * fz;
          if (ahead < -0.2 || ahead > 2.6) continue;
          const side = dx * fz - dz * fx; // + = to our right
          const rad = (ag.umbrella && o.umbrella) ? 1.05 : 0.62;
          if (Math.abs(side) > rad) continue;
          // same direction & slower -> follow / overtake
          const sameDir = o.kind === 'walk' && o.lane === ag.lane && o.dir === ag.dir;
          const urgency = 1 - Math.max(0, ahead) / 2.6;
          steer += (side >= 0 ? -1 : 1) * urgency * 1.1;
          if (ahead < 1.1) {
            if (sameDir) v = Math.min(v, (o.v ?? v) * 0.98);
            else v *= 0.85;
          }
        }
      }
      // drift back toward preferred lateral (keep-left habit) slowly
      const pref = (ag.dir > 0 ? -0.35 : 0.35) * ln.hw;
      steer += (pref - ag.lat) * 0.12;
      // lateral is measured along (dz,-dx): our right in walking direction = dir * lateral axis
      const latVel = Math.max(-0.6, Math.min(0.6, steer)) * ag.dir * -1;
      ag.lat = Math.max(-ln.hw, Math.min(ln.hw, ag.lat + latVel * dt * 0.8));
      ag.v = v;
      ag.s += ag.dir * v * dt;
      if (ag.s < 0 || ag.s > ln.len) {
        ag.dir *= -1; ag.s = Math.max(0, Math.min(ln.len, ag.s));
      }
      const ox = ag.x, oz = ag.z;
      this.placeOnLane(ag);
      const mvx = (ag.x - ox) / Math.max(dt, 1e-4), mvz = (ag.z - oz) / Math.max(dt, 1e-4);
      const targetYaw = Math.atan2(mvx * 0.5 + fx * v, mvz * 0.5 + fz * v);
      let dy = targetYaw - ag.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      ag.yaw += dy * Math.min(1, dt * 6);
      // phase: cycles = distance / stride
      const stride = info.speed * info.period;
      ag.phase = (ag.phase + (v * dt) / stride) % 1;
      ag.timeScale = v / info.speed;
    }
  }
}
