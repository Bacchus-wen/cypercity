// DUSKLINE in-game HUD (the restyle's own interface; ?ui=legacy = the original). Same API as ui/hud.js:
// update(dt, state), newGig, gigComplete, toast, showDistrict, sweep, resize, applySettings; root / hudEl.
// Layout: gig card top-left, bearing chip top-centre, credits top-right, vitals + keys bottom-left, round map with
// clock and location bottom-right, speed bar bottom-centre in vehicles, episode-style district title cards.
import './hud2.css';
import { Minimap } from '../minimap.js';

const STANCE = {
  stand: '<svg viewBox="0 0 22 30"><circle cx="11" cy="4" r="3"/><path d="M7 9h8l1 9h-2l-1 11h-2.2l-.8-8-.8 8H7l-1-11H4z"/></svg>',
  run: '<svg viewBox="0 0 22 30"><circle cx="13" cy="4" r="3"/><path d="M9 9l6 1 2 6-2 .6-1.4-3.6-1.6 5 4 4-1 6.5-2.2-.4.8-5.2-4-3.6L6 26l-2-1 3.3-8.3L8 12l-3 3-1.4-1.5z"/></svg>',
  crouch: '<svg viewBox="0 0 22 30"><circle cx="12" cy="10" r="3"/><path d="M7 14h9l1 6-2 .5-1 2.5 3 6h-2.4l-3-5-2 5H7l1.6-6.5L6 20z"/></svg>',
};
export const CURRENCY = 'CR';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} KM` : `${Math.round(m)} M`);
const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export class HUD {
  constructor(ctx, settings) {
    this.ctx = ctx; this.settings = settings;
    const host = document.getElementById('hud') || document.body;
    const root = el('div'); root.id = 'dl';
    this.root = root;
    host.appendChild(root);
    const hud = el('div', 'hud'); root.appendChild(hud);
    this.hudEl = hud;

    // --- gig card
    this.obj = el('div', 'dl-gig', `<div class="tab">GIG</div><div class="card"><div class="title"></div><div class="txt"></div><div class="dist"></div></div>`);
    hud.appendChild(this.obj);
    this.objTag = this.obj.querySelector('.tab'); this.objTitle = this.obj.querySelector('.title');
    this.objTxt = this.obj.querySelector('.txt'); this.objDist = this.obj.querySelector('.dist');

    // --- bearing chip
    this.bearing = el('div', 'dl-bearing', `<div class="hd">N<small>000°</small></div><div class="tg"><i></i><span>—</span></div>`);
    hud.appendChild(this.bearing);
    this.hdEl = this.bearing.querySelector('.hd'); this.tgEl = this.bearing.querySelector('.tg'); this.tgArrow = this.tgEl.querySelector('i'); this.tgDist = this.tgEl.querySelector('span');

    // --- credits
    this.cr = el('div', 'dl-cr', `<div class="delta">+0</div><div class="tags" style="display:none"><b>0</b>/12<small>TAGS</small></div><div class="v"><span>1,200</span><small>${CURRENCY}</small></div>`);
    hud.appendChild(this.cr);
    this.crEl = this.cr.querySelector('.v span'); this.crDelta = this.cr.querySelector('.delta');
    this.crShown = 1200; this.crTarget = 1200;

    // --- vitals
    const vit = el('div', 'dl-vitals', `
      <div class="cap"><span class="lbl">VITALS</span><span class="lbl stance"></span></div>
      <div class="row"><div class="num">100</div><div class="bars"><div class="hp"><div class="ghost"></div><div class="fill"></div></div>
      <div class="charge">${'<i></i>'.repeat(8)}<span class="lbl">CHARGE</span></div></div></div>`);
    hud.appendChild(vit);
    this.hpBar = vit.querySelector('.hp'); this.hpFill = vit.querySelector('.fill'); this.hpGhost = vit.querySelector('.ghost'); this.hpNum = vit.querySelector('.num');
    this.chargeCells = [...vit.querySelectorAll('.charge i')];
    this.stance = vit.querySelector('.stance'); this.stanceKind = '';

    // --- keys
    const keys = el('div', 'dl-keys', `<span class="s" data-s="v"><span class="k">V</span>VIEW</span><span class="s" data-s="f"><span class="k">F</span>RIDE</span>
      <span class="s" data-s="h"><span class="k">H</span>HUD</span><span class="s" data-s="p"><span class="k">P</span>PHOTO</span><span class="tiny fps"></span>`);
    hud.appendChild(keys);
    this.slotV = keys.querySelector('[data-s="v"]'); this.slotF = keys.querySelector('[data-s="f"]'); this.fpsEl = keys.querySelector('.fps');

    // --- round map
    const mw = el('div', 'dl-mapwrap', `<div class="clock"><span class="wx">DUSK</span><span class="time">7:40<small>PM</small></span></div>
      <div class="dl-map"><canvas></canvas><div class="n">N</div></div><div class="loc"><b>—</b><span>—</span></div>`);
    hud.appendChild(mw);
    this.timeEl = mw.querySelector('.time'); this.wxEl = mw.querySelector('.wx'); this.mapNorth = mw.querySelector('.n');
    this.locB = mw.querySelector('.loc b'); this.locS = mw.querySelector('.loc span');
    this.minimap = new Minimap(ctx.layout, mw.querySelector('canvas'), ctx.api.buildings?.lots, 'ink');

    // --- crosshair, prompt, waypoint
    this.cross = el('div', 'dl-cross'); hud.appendChild(this.cross);
    this.promptEl = el('div', 'dl-prompt', '<span class="k">F</span><div><div class="sub">INTERACT</div><div class="txt"></div></div>');
    hud.appendChild(this.promptEl);
    this.promptKey = this.promptEl.querySelector('.k'); this.promptTxt = this.promptEl.querySelector('.txt'); this.promptSub = this.promptEl.querySelector('.sub');
    this.wp = el('div', 'dl-wp', '<div class="d"></div><div class="m"></div>'); hud.appendChild(this.wp);
    this.wpDist = this.wp.querySelector('.m');

    // --- district card + toasts
    this.district = el('div', 'dl-district', `<div class="band"><div class="pre">NOW ENTERING</div><div class="name"></div></div><div class="stripe"></div><div class="area"></div>`);
    hud.appendChild(this.district);
    this.toasts = el('div', 'dl-toasts'); hud.appendChild(this.toasts);

    // --- speed
    this.speedo = el('div', 'dl-speed', `<div class="top"><div class="num">0</div><div class="unit">KM/H</div><div class="gear">N</div></div>
      <div class="segs">${'<i></i>'.repeat(24)}</div><div class="car">VEHICLE</div>
      <div class="hint"><span class="k">F</span>EXIT<span class="k">R</span>RESET<span class="k">SPACE</span>HANDBRAKE<span class="k">N</span>RADIO</div>`);
    hud.appendChild(this.speedo);
    this.speedNum = this.speedo.querySelector('.num'); this.speedGear = this.speedo.querySelector('.gear'); this.speedCar = this.speedo.querySelector('.car');
    this.segs = [...this.speedo.querySelectorAll('.segs i')];

    this.wipe = el('div', 'dl-wipe'); hud.appendChild(this.wipe);

    this._last = {};
    this.clock = 19 * 60 + 40; // the restyle opens at dusk
    this.fpsAcc = 0; this.fpsN = 0;
    this.applySettings();
    settings.addEventListener('change', () => this.applySettings());
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const z = Math.max(0.55, Math.min(2.2, innerHeight / 1080));
    this.root.style.zoom = z;
    this.zoom = z;
  }

  applySettings() { this.root.classList.toggle('hud-hidden', !this.settings.get('hud')); }

  set(key, elx, val, prop = 'textContent') { if (this._last[key] !== val) { this._last[key] = val; elx[prop] = val; } }

  update(dt, st) {
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.set('fps', this.fpsEl, `${Math.round(this.fpsN / this.fpsAcc)} FPS`); this.fpsAcc = 0; this.fpsN = 0; }
    // clock (slow) + sky label
    this.clock += dt / 4;
    const mins = Math.floor(this.clock) % (24 * 60);
    const h = Math.floor(mins / 60), m = mins % 60, h12 = ((h + 11) % 12) + 1;
    this.set('time', this.timeEl, `${h12}:${String(m).padStart(2, '0')}<small>${h >= 12 ? 'PM' : 'AM'}</small>`, 'innerHTML');
    const rain = st.rain ?? 0;
    const sky = rain > 0.35 ? 'RAIN' : rain > 0.05 ? 'DRIZZLE' : h >= 18 && h < 20 ? 'DUSK' : h >= 20 || h < 5 ? 'NIGHT' : 'CLEAR';
    this.set('wx', this.wxEl, `${sky} · ${Math.round(24 - rain * 4 - Math.max(0, h - 19) * 0.5)}°C`);

    // vitals
    const hp = st.hp ?? 100;
    this.set('hp', this.hpNum, String(Math.round(hp)));
    this.hpFill.style.transform = `scaleX(${hp / 100})`; this.hpGhost.style.transform = `scaleX(${hp / 100})`;
    this.hpBar.classList.toggle('low', hp < 35);
    const ch = Math.round(st.ram ?? 8);
    if (this._last.ch !== ch) { this._last.ch = ch; this.chargeCells.forEach((c, i) => c.classList.toggle('off', i >= ch)); }

    // bearing + target arrow
    const heading = ((((-st.yaw * 180) / Math.PI) % 360) + 360) % 360;
    this.set('hd', this.hdEl, `${CARD[Math.round(heading / 45) % 8]}<small>${String(Math.round(heading) % 360).padStart(3, '0')}°</small>`, 'innerHTML');
    if (st.target) {
      const dx = st.target.x - st.pos.x, dz = st.target.z - st.pos.z;
      const bt = (Math.atan2(dx, -dz) * 180) / Math.PI;
      const rel = (((bt - heading) % 360) + 540) % 360 - 180;
      this.tgArrow.style.transform = `rotate(${rel.toFixed(1)}deg)`;
      this.set('tgd', this.tgDist, fmtDist(st.targetDist));
    }
    this.tgEl.style.display = st.target ? '' : 'none';

    // map (round: the north badge rides the rim)
    const r = this.minimap.draw(dt, st.pos, st.yaw, st.target, { car: st.mode === 'car', rotate: this.settings.get('minimapRotate'), dpr: (devicePixelRatio || 1) * this.zoom, pois: st.pois });
    if (r) {
      const R = 101, c0 = 120; // inner radius 120 (250 px ring, 5 px border)
      this.mapNorth.style.left = `${c0 + Math.sin(r.rot) * R}px`; this.mapNorth.style.top = `${c0 - Math.cos(r.rot) * R}px`;
    }
    if (st.zone) { this.set('locb', this.locB, st.zone.district); this.set('locs', this.locS, st.zone.area); }

    // credits tween
    if (Math.abs(this.crShown - this.crTarget) > 0.5) {
      this.crShown += (this.crTarget - this.crShown) * Math.min(1, dt * 3);
      if (Math.abs(this.crShown - this.crTarget) < 1) this.crShown = this.crTarget;
      this.crEl.textContent = fmt(this.crShown);
    }

    if (st.target) {
      const tl = st.gigTimer;
      const clock = tl != null ? `${Math.floor(Math.max(0, tl) / 60)}:${String(Math.floor(Math.max(0, tl) % 60)).padStart(2, '0')} LEFT · ` : st.gig?.vehicle ? 'GET IN A CAR · ' : '';
      this.set('od', this.objDist, `${clock}${fmtDist(st.targetDist)} · ${st.gig?.area || ''}`);
      this.obj.classList.toggle('timed', tl != null && tl < 15);
    }

    this.cross.classList.toggle('hidden', st.mode === 'car' || (st.view === 'tp' && st.speed > 0.5));
    this.cross.classList.toggle('wide', !!st.sprinting);

    if (st.wp) {
      this.wp.style.opacity = st.wp.visible ? 1 : 0;
      this.wp.style.transform = `translate(${st.wp.x / this.zoom}px, ${st.wp.y / this.zoom}px) translate(-50%,-50%)`;
      this.wp.classList.toggle('edge', st.wp.edge);
      this.set('wpd', this.wpDist, fmtDist(st.targetDist));
    } else this.wp.style.opacity = 0;

    const p = st.prompt;
    const pk = p ? `${p.key}|${p.text}|${p.sub || ''}` : '';
    if (this._last.prompt !== pk) {
      this._last.prompt = pk;
      if (p) { this.promptKey.textContent = p.key; this.promptTxt.textContent = p.text; this.promptSub.textContent = p.sub || 'INTERACT'; }
      this.promptEl.classList.toggle('show', !!p);
    }

    this.slotV.classList.toggle('on', st.view === 'tp');
    this.slotF.classList.toggle('on', st.mode === 'car' || !!(p && p.key === 'F'));

    const kind = st.mode === 'car' ? 'car' : st.crouch ? 'crouch' : st.sprinting ? 'run' : 'stand';
    if (kind !== this.stanceKind) {
      this.stanceKind = kind;
      this.stance.innerHTML = kind === 'car' ? 'DRIVING' : `${{ crouch: 'LOW', run: 'SPRINT', stand: 'ON FOOT' }[kind]}${STANCE[kind]}`;
    }

    this.speedo.classList.toggle('show', st.mode === 'car');
    if (st.mode === 'car') {
      const kmh = Math.round(st.carSpeed * 3.6);
      this.set('spd', this.speedNum, String(kmh));
      const lit = Math.round(Math.min(1, kmh / 220) * this.segs.length);
      if (this._last.lit !== lit) { this._last.lit = lit; this.segs.forEach((sg, i) => { sg.classList.toggle('on', i < lit); sg.classList.toggle('hot', i >= this.segs.length * 0.75); }); }
      const gear = st.carReverse ? 'R' : kmh < 2 ? 'N' : String(Math.min(6, 1 + Math.floor(kmh / 38)));
      this.set('gear', this.speedGear, gear);
      this.set('carname', this.speedCar, st.carName || 'VEHICLE');
    }
  }

  newGig(g, first = false) {
    this.obj.classList.add('out');
    setTimeout(() => {
      this.objTag.textContent = `${g.fixer} · GIG`;
      this.objTitle.textContent = g.title;
      this.objTxt.textContent = g.text;
      this.obj.classList.remove('out');
      this.obj.classList.remove('flash'); void this.obj.offsetWidth; this.obj.classList.add('flash');
    }, first ? 0 : 450);
    if (!first) this.toast({ kind: 'info', k: `${g.fixer} IS CALLING`, h: 'NEW GIG', body: `<span>${g.title}</span>` }, 4200);
    this.sweep();
  }

  setTags(n, total) {
    const t = this.cr.querySelector('.tags');
    t.style.display = '';
    t.innerHTML = `<b>${n}</b>/${total}<small>TAGS</small>`;
  }

  addCredits(total, delta) {
    this.crTarget = total;
    this.crDelta.textContent = `${delta < 0 ? '−' : '+'}${fmt(Math.abs(delta))} ${CURRENCY}`;
    this.crDelta.classList.add('show');
    clearTimeout(this._crT); this._crT = setTimeout(() => this.crDelta.classList.remove('show'), 2600);
  }

  gigComplete(g, credits) {
    this.crTarget = credits;
    this.crDelta.textContent = `+${fmt(g.reward)} ${CURRENCY}`;
    this.crDelta.classList.add('show');
    setTimeout(() => this.crDelta.classList.remove('show'), 3000);
    this.objTitle.textContent = 'GIG DONE'; this.objTxt.textContent = 'Hang around. Somebody will call.';
    this.set('od', this.objDist, 'PAID · STANDING BY');
    this.toast({ k: `${g.fixer} · PAYMENT SENT`, h: 'GIG DONE', body: `<span><b>+${fmt(g.reward)}</b>${CURRENCY}</span><span><b class="c">+${g.cred}</b>REP</span>` }, 5200);
    this.sweep();
  }

  toast({ kind = '', k, h, body }, ms = 4500) {
    const t = el('div', `dl-toast ${kind}`, `<div class="kk">${k}</div><div class="h">${h}</div><div class="rw">${body}</div>`);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 500); }, ms);
  }

  showDistrict(z) {
    const d = this.district;
    d.className = `dl-district tint-${z.tint || 'yellow'}`;
    d.querySelector('.name').textContent = z.district;
    d.querySelector('.area').textContent = z.area;
    void d.offsetWidth; d.classList.add('show');
  }

  sweep() { this.wipe.classList.remove('go'); void this.wipe.offsetWidth; this.wipe.classList.add('go'); }
}
