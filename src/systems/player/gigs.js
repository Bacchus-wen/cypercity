// Light gameplay loop: fixer "gigs" — waypoint beam in the world, objective text, reward toasts, next gig.
import * as THREE from 'three/webgpu';
import { uv, time, float, sin, abs, smoothstep, normalView, pow, vec3, color, fract, mix, step, positionLocal, atan, length, uniform } from 'three/tsl';

export function makeGigList(L) {
  const al = L.alley, ov = L.overlook, pr = L.promenade, br = L.bridges[0];
  if (L.plaza) {
    // restyle map: original fixers, stops at the plaza kiosks, the canal walk, the back stairs, the skydeck, the bridge
    const P = L.plaza, kx = (P.x0 + P.x1) / 2 + 4 - 6.5, kz = P.z0 + 3.2 + 3.2;
    return [
      { id: 'kiosk', fixer: 'VEGA', title: 'NOODLE RUN', area: 'MONUMENT PLAZA', text: 'Meet the courier at the noodle kiosk on the plaza', jp: '',
        pos: [kx, 0.15, kz], reward: 850, cred: 4, radius: 3.2 },
      // (timed driving gig: the DUSKLINE interface shows its clock; the original interface has no timer readout)
      ...(new URLSearchParams(location.search).get('ui') === 'legacy' ? [] : [{ id: 'sprint', fixer: 'ODELL', title: 'CANAL SPRINT', area: 'CROSSTOWN', text: 'Grab any car and hit the canal end of Crosstown before the clock runs out', jp: '',
        pos: [L.crossStreets.xEnd - 8, 0, L.crossStreets.zs[1] + 2.75], reward: 1800, cred: 7, radius: 6, vehicle: true, timer: 60 }]),
      // (photo gig: needs the DUSKLINE photo mode - the marker only suggests the plaza deck as a vantage point)
      ...(new URLSearchParams(location.search).get('ui') === 'legacy' || !L.droneShow ? [] : [{ id: 'photo', fixer: 'VEGA', title: 'SHOOT THE MANTA', area: 'MONUMENT PLAZA', text: 'The drone show flies a manta every cycle. Find a clear view (the plaza deck works), frame it in photo mode [P] and save [ENTER]', jp: '',
        pos: [-55, P.deckY, -262], reward: 1500, cred: 6, radius: 0, photo: 'manta' }]),
      { id: 'river', fixer: 'VEGA', title: 'PALM DEAD DROP', area: 'PALM CANAL WALK', text: 'Pick up the drive taped under a palm bench by the canal', jp: '',
        pos: [pr.xMin + 3.5, pr.y, (L.crossStreets.zs[0] + L.elevatedRail.z) / 2], reward: 2400, cred: 9, radius: 3.5 },
      // (fare gig: two legs by car - pick up just past the west bus shelter (clear of a bus standing at it: front at
      //  shelter + 6 m), drop at the canal end of the first cross street)
      ...(new URLSearchParams(location.search).get('ui') === 'legacy' || !L.busShelters ? [] : (() => {
        const sh = L.busShelters.find((q) => q.side < 0) || L.busShelters[0], A = L.avenue;
        const lx = sh.side * (A.medianHalf + 0.3 + A.laneWidth * 1.5);
        return [{ id: 'fare', fixer: 'ODELL', title: 'LATE FARE', area: 'BOULEVARD', text: 'Drive to the bus shelter, pick up the fare, then get them to the canal end of Crosstown before the meter runs out', jp: '',
          pos: [lx, 0, sh.z + sh.len / 2 + 9], reward: 2600, cred: 9, radius: 5, fare: { drop: [L.crossStreets.xEnd - 8, 0, L.crossStreets.zs[0] + 2.75], timer: 70 } }];
      })()),
      { id: 'alley', fixer: 'ODELL', title: 'BACK STAIRS HANDOFF', area: 'BACK STAIRS', text: 'Climb the back stairs and meet the hacker', jp: '',
        pos: [al.stairs.xEnd - 6, al.stairs.rise, al.z], reward: 3100, cred: 12, radius: 3.2 },
      { id: 'overlook', fixer: 'ODELL', title: 'EYES ON THE BOULEVARD', area: 'SKYDECK', text: 'Take the service lift to the skydeck', jp: '',
        pos: [ov.position[0], ov.position[1] - 1.7, ov.position[2]], reward: 4200, cred: 15, radius: 4, elevator: true },
      { id: 'bridge', fixer: 'VEGA', title: 'BRIDGE PICKUP', area: 'VARGAS BRIDGE', text: 'Meet the fixer\'s driver at the foot of the canal bridge', jp: '',
        pos: [pr.xMax - 2.5, 0, br.z + 9], reward: 5600, cred: 20, radius: 4 },
    ];
  }
  return [
    {
      id: 'ramen', fixer: 'WAKAKO', title: 'NOODLE DROP', area: 'NEON AVENUE',
      text: 'Meet the courier outside the ramen stand', jp: 'ラーメン',
      pos: [-(L.avenue.roadHalfWidth + 2.2), 0, -18], reward: 850, cred: 4, radius: 3.2,
    },
    {
      id: 'river', fixer: 'WAKAKO', title: 'SAKURA DEAD DROP', area: 'SAKURA RIVERWALK',
      text: 'Collect the shard hidden under the cherry trees', jp: '桜',
      pos: [(pr.xMin + pr.xMax) / 2, pr.y, -120], reward: 2400, cred: 9, radius: 3.5,
    },
    {
      id: 'alley', fixer: 'REGINA', title: 'LANTERN ALLEY HANDOFF', area: 'LANTERN ALLEY',
      text: 'Climb the alley stairs and meet the netrunner', jp: '提灯',
      pos: [al.stairs.xEnd - 6, al.stairs.rise, al.z], reward: 3100, cred: 12, radius: 3.2,
    },
    {
      id: 'overlook', fixer: 'REGINA', title: 'EYES ON THE SKYLINE', area: 'SKYLINE OVERLOOK',
      text: 'Take the service lift to the rooftop overlook', jp: '展望',
      pos: [ov.position[0], ov.position[1] - 1.7, ov.position[2]], reward: 4200, cred: 15, radius: 4, elevator: true,
    },
    {
      id: 'bridge', fixer: 'WAKAKO', title: 'BRIDGE RENDEZVOUS', area: 'MIRAI BRIDGE',
      text: 'Meet the fixer\'s driver at the river crossing', jp: '橋',
      pos: [pr.xMax + 6, 0, br.z + 12], reward: 5600, cred: 20, radius: 4,
    },
  ];
}

export const beamNear = uniform(1);
function beamMaterial(col, gain = 1, nearK = 0.4) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const v = uv().y;
  const edge = pow(float(1).sub(abs(normalView.z)), 1.6);
  const scan = sin(v.mul(420).sub(time.mul(9))).mul(0.5).add(0.5);
  const bands = smoothstep(0.92, 1.0, fract(v.mul(14).sub(time.mul(0.35))));
  const fade = smoothstep(0.0, 0.02, v).mul(float(1).sub(smoothstep(0.25, 1.0, v)));
  const a = edge.mul(0.85).add(0.12).mul(scan.mul(0.35).add(0.65)).add(bands.mul(0.6)).mul(fade);
  const g = mix(float(nearK), float(1), beamNear).mul(gain);
  m.colorNode = col.mul(a).mul(g).mul(3.2);
  m.opacityNode = a.mul(g);
  return m;
}

function ringMaterial(col) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const p = positionLocal.xy;
  const ang = atan(p.y, p.x).div(Math.PI * 2).add(0.5);
  const seg = step(0.35, fract(ang.mul(24).add(time.mul(0.25))));
  const r = length(p);
  const pulse = fract(time.mul(0.6));
  const wave = smoothstep(0.12, 0.0, abs(r.div(2.2).sub(pulse))).mul(float(1).sub(pulse));
  const a = seg.mul(0.8).add(wave.mul(1.2));
  m.colorNode = col.mul(a).mul(3);
  m.opacityNode = a;
  return m;
}

export class Gigs {
  constructor(ctx, hud) {
    this.ctx = ctx; this.hud = hud;
    this.list = makeGigList(ctx.layout);
    this.index = 0;
    this.state = 'active'; // 'active' | 'cooldown'
    this.cooldown = 0;
    this.eddies = 1200;
    this.cred = 0;
    this.completed = 0;
    this.timerLeft = null; this.retryT = 0; // timed driving gigs
    this.groundY = new Map();

    const col = color(0xffe23a);
    this.marker = new THREE.Group();
    this.marker.name = 'gig-marker';
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 260, 32, 1, true), beamMaterial(col));
    const halo = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 200, 32, 1, true), beamMaterial(col, 0.28, 0.0));
    halo.position.y = 100; halo.renderOrder = 9; halo.frustumCulled = false;
    beam.position.y = 130; beam.renderOrder = 10; beam.frustumCulled = false;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 260, 8, 1, true), beamMaterial(color(0xfff6c0)));
    core.position.y = 130; core.renderOrder = 10; core.frustumCulled = false;
    const ring = new THREE.Mesh(new THREE.CircleGeometry(2.2, 64), ringMaterial(col));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.renderOrder = 11;
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.85, 0.95, 6), ringMaterial(color(0xff3b4e)));
    inner.rotation.x = -Math.PI / 2; inner.position.y = 0.07; inner.renderOrder = 11;
    // floating diamond glyph
    const dia = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshBasicNodeMaterial({ color: 0xffe23a, fog: false }));
    dia.material.colorNode = color(0xffe23a).mul(float(5).add(sin(time.mul(4)).mul(2)));
    dia.scale.y = 1.6; dia.position.y = 2.4;
    const light = new THREE.PointLight(0xffd24a, 18, 9, 2);
    light.position.y = 1.2;
    this.marker.add(beam, halo, core, ring, inner, dia, light);
    this.dia = dia; this.innerRing = inner;
    ctx.scene.add(this.marker);
    this.place();
  }

  get current() { return this.list[this.index % this.list.length]; }

  journal() {
    const cur = this.index % this.list.length;
    return this.list.map((g, i) => ({
      title: g.title, area: g.area, reward: g.reward,
      status: i < cur ? 'done' : i === cur ? (this.state === 'active' ? 'active' : 'done') : 'locked',
    }));
  }

  surfaceY(g) {
    if (this.groundY.has(g.id)) return this.groundY.get(g.id);
    const { RAPIER, world } = this.ctx.physics;
    const top = g.pos[1] + 6;
    const hit = world.castRay(new RAPIER.Ray({ x: g.pos[0], y: top, z: g.pos[2] }, { x: 0, y: -1, z: 0 }), 40, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const y = hit ? top - hit.timeOfImpact : g.pos[1];
    this.groundY.set(g.id, y);
    return y;
  }

  place() {
    const g = this.current;
    this.groundY.delete(g.id);
    this.marker.position.set(g.pos[0], g.pos[1], g.pos[2]);
    this.marker.visible = true;
    this.surfaceResolved = false;
  }

  worldPos(out = new THREE.Vector3()) { return out.copy(this.marker.position).setY(this.marker.position.y + 1.4); }

  // Returns interaction prompt (e.g. elevator) or null
  update(dt, t, playerPos, mode) {
    if (!this.surfaceResolved) {
      // (the fare's drop leg has its own point: resolve the ground there, cached under its own key)
      const cg = this.current, drop = cg.fare && this.farePhase === 'drop';
      this.marker.position.y = this.surfaceY(drop ? { id: cg.id + ':drop', pos: cg.fare.drop } : cg);
      this.surfaceResolved = true;
    }
    const dCam = this.ctx.camera.position.distanceTo(this.marker.position);
    beamNear.value = Math.min(1, Math.max(0, (dCam - 8) / 45));
    this.dia.rotation.y += dt * 1.6;
    this.dia.position.y = 2.4 + Math.sin(t * 2) * 0.15;
    this.innerRing.rotation.z -= dt * 0.8;
    if (this.state === 'cooldown') {
      this.cooldown -= dt;
      if (this.cooldown <= 0) { this.state = 'active'; this.index++; this.place(); this.hud.newGig(this.current); }
      return null;
    }
    const g = this.current;
    const m = this.marker.position;
    const dx = playerPos.x - m.x, dz = playerPos.z - m.z;
    const d2 = Math.hypot(dx, dz);
    const dy = playerPos.y - m.y;
    if (g.vehicle) {
      // timed driving gig (restyle): the clock starts the moment the player is behind a wheel
      this.retryT = Math.max(0, (this.retryT || 0) - dt);
      if (mode === 'car') {
        if (this.timerLeft == null && this.retryT <= 0) {
          this.timerLeft = g.timer;
          this.hud.toast({ kind: 'info', k: `${g.fixer} · CLOCK STARTED`, h: `${g.timer} SECONDS`, body: '<span>Go. Now.</span>' }, 2600);
        }
        if (this.timerLeft != null) {
          this.timerLeft -= dt;
          if (this.timerLeft <= 0) { // (timeout first: a long last frame must not count as a win)
            this.timerLeft = null; this.retryT = 4;
            this.hud.toast({ k: `${g.fixer} · TOO SLOW`, h: 'MISSED IT', body: '<span>The clock resets in a moment. Go again.</span>' }, 3600);
          } else if (d2 < g.radius) { this.timerLeft = null; this.complete(); return null; }
        }
      } else if (this.timerLeft != null) {
        // getting out of the car ends the attempt (no pausing the clock on foot)
        this.timerLeft = null; this.retryT = 2;
        this.hud.toast({ k: `${g.fixer} · CLOCK STOPPED`, h: 'YOU LEFT THE CAR', body: '<span>Get back behind a wheel to start over.</span>' }, 3200);
      }
      return null;
    }
    if (g.fare) return this.fareUpdate(g, dt, mode, d2);
    if (g.photo) return null; // (completed by photoTaken)
    if (mode === 'foot' && d2 < g.radius && Math.abs(dy) < 2.6) { this.complete(); return null; }
    if (g.elevator && mode === 'foot' && d2 < 34 && dy < -6) return { key: 'F', text: 'TAKE SERVICE LIFT', action: 'elevator', target: [m.x, m.y, m.z] };
    return null;
  }

  // fare gig: pickup leg (stop by the shelter in a car), then a timed drop leg; leaving the car loses the fare
  fareUpdate(g, dt, mode, d2) {
    const car = this.ctx.api.vehicles?.activeCar;
    const speed = Math.abs(car?.speed ?? 0);
    if (!this.farePhase) this.farePhase = 'pickup';
    if (this.farePhase === 'pickup') {
      if (mode === 'car' && d2 < g.radius && speed < 2.5) {
        this.farePhase = 'drop'; this.timerLeft = g.fare.timer;
        this.marker.position.set(...g.fare.drop); this.surfaceResolved = false;
        this.hud.toast({ kind: 'info', k: `${g.fixer} · FARE ON BOARD`, h: 'CANAL END, CROSSTOWN', body: `<span>“And step on it.” · ${g.fare.timer} s on the meter</span>` }, 3200);
      }
      return null;
    }
    // drop leg
    if (mode !== 'car') return this.fareLost(g, 'YOU LEFT THE CAR');
    this.timerLeft -= dt;
    if (this.timerLeft <= 0) return this.fareLost(g, 'THE METER RAN OUT'); // (timeout first, as in the sprint)
    if (d2 < g.radius + 1) { this.timerLeft = null; this.farePhase = null; this.complete(); }
    return null;
  }

  fareLost(g, why) {
    this.timerLeft = null; this.farePhase = 'pickup';
    this.marker.position.set(...g.pos); this.surfaceResolved = false;
    this.hud.toast({ k: `${g.fixer} · FARE LOST`, h: why, body: '<span>Another one is waiting at the shelter.</span>' }, 3400);
    return null;
  }

  // photo mode shutter: a photo gig completes when its subject is formed and inside the frame. Returns a verdict line.
  photoTaken(cam, shot = null) {
    const g = this.current;
    if (!g.photo || this.state !== 'active') return null;
    const show = this.ctx.api.landmarks?.droneShow;
    if (!show) return null;
    const v = show.center.clone().project(cam);
    const inFrame = v.z < 1 && Math.abs(v.x) < 0.85 && Math.abs(v.y) < 0.85 && cam.position.distanceTo(show.center) < 950;
    if (!inFrame) return 'NO DRONES IN THE FRAME';
    const st = shot || show.state; // (the formation at the moment of the shutter)
    if (st.name !== g.photo || !st.formed) return `THAT'S THE ${st.formed ? st.name.toUpperCase() : 'SWARM MOVING'} · WAIT FOR THE MANTA`;
    this.complete();
    return 'GOT IT · VEGA PAYS +' + g.reward + ' CR';
  }

  complete() {
    const g = this.current;
    this.farePhase = null; this.timerLeft = null;
    this.state = 'cooldown';
    this.cooldown = 4.5;
    this.marker.visible = false;
    this.eddies += g.reward; this.cred += g.cred; this.completed++;
    this.hud.gigComplete(g, this.eddies);
    this.ctx.events.dispatchEvent(new CustomEvent('gig-complete', { detail: { id: g.id, reward: g.reward } }));
  }
}
