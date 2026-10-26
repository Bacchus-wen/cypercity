// DUSKLINE title screen and pause menu (the restyle's own; ?ui=legacy = the original). Same API as ui/menus.js.
import { QUALITY_PRESETS } from '../../systems/player/settings.js';
import { CURRENCY } from './hud2.js';

const CONTROLS = [
  ['MOVE', ['W', 'A', 'S', 'D']], ['LOOK', ['MOUSE']], ['SPRINT', ['SHIFT']], ['JUMP', ['SPACE']],
  ['CROUCH', ['C', 'CTRL']], ['FIRST / THIRD PERSON', ['V']], ['GET IN / OUT', ['F']], ['INTERACT', ['F']],
  ['HIDE HUD', ['H']], ['PAUSE', ['ESC']], ['DRIVE', ['W', 'S']], ['STEER', ['A', 'D']],
];

const LOOK_LEGACY = typeof location !== 'undefined' && new URLSearchParams(location.search).get('look') === 'legacy';
const SETTINGS = [
  { key: 'tod', label: 'TIME OF DAY', type: 'enum', options: ['dusk', 'night'], fmt: (v) => v.toUpperCase(), desc: 'Dusk: low sun, dry streets, nobody needs an umbrella. Night: rain and the full neon. Takes effect after a quick reload.' },
  { key: 'quality', label: 'GRAPHICS', type: 'enum', options: QUALITY_PRESETS, fmt: (v) => v.toUpperCase(), desc: 'Reflections, shadows and draw distance. Takes effect after a restart (?q=<preset>).' },
  { key: 'fov', label: 'FIELD OF VIEW', type: 'range', min: 55, max: 100, step: 5, fmt: (v) => `${v}°`, desc: 'Vertical field of view on foot. Sprinting widens it for a moment.' },
  { key: 'sensitivity', label: 'MOUSE SPEED', type: 'range', min: 0.3, max: 2.5, step: 0.1, fmt: (v) => v.toFixed(1), desc: 'How fast the camera turns with the mouse.' },
  { key: 'invertY', label: 'INVERT Y', type: 'bool', desc: 'Flip vertical mouse look.' },
  { key: 'headBob', label: 'HEAD BOB', type: 'bool', desc: 'Camera bob while walking and running. Turn off if it makes you queasy.' },
  { key: 'cameraSway', label: 'CAMERA SWAY', type: 'bool', desc: 'Breathing, lean and a little lag on the first-person camera.' },
  { key: 'minimapRotate', label: 'MAP FOLLOWS YOU', type: 'bool', desc: 'On: the map turns with you. Off: north stays up.' },
  { key: 'hud', label: 'SHOW HUD', type: 'bool', desc: 'Show or hide everything on screen. Shortcut [H].' },
].filter((s) => !(LOOK_LEGACY && s.key === 'tod')); // (the original look is a fixed rainy night)

const QUOTES = [
  'Out here the sun never really sets. It just gets sold back to you, one sign at a time.',
  'Everybody on Solano is on their way somewhere. Nobody remembers where.',
  'The canal doesn\'t reflect the city. It edits it.',
];

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const key = (k) => `<span class="k">${k}</span>`;

export class Menus {
  constructor(root, settings, cb) {
    this.root = root; this.settings = settings; this.cb = cb;
    this.buildTitle();
    this.buildPause();
    this.sel = 0; this.setSel = 0; this.tab = 'main';
    addEventListener('keydown', (e) => this.onKey(e));
  }

  buildTitle() {
    const t = el('div', 'dl-title', `
      <div class="wash"></div><div class="dl-halftone"></div>
      <div class="bar t"></div><div class="bar b"></div><div class="stripe"></div>
      <div class="ep"><span>EPISODE 01</span><b>LAST LIGHT</b></div>
      <div class="logo">
        <div class="kicker">SOLANO HEIGHTS · AFTER HOURS</div>
        <div class="word"><span class="a">DUSK</span><span class="b">LINE</span></div>
        <div class="sub">One boulevard, one canal, one long evening. Take the jobs, take the car, take the long way home.</div>
      </div>
      <div class="press">${key('ENTER')}<span>PRESS ANY KEY</span></div>
      <div class="foot"><span>A QUILLMERE PRODUCTION</span><span>MOUSE + KEYBOARD · WEBGPU · BUILD 26.10</span></div>`);
    this.root.appendChild(t);
    this.title = t;
    t.addEventListener('click', () => this.cb.start());
  }

  buildPause() {
    const m = el('div', 'dl-menu', `
      <div class="bg"></div><div class="dl-halftone"></div>
      <div class="side">
        <div class="brand">DUSKLINE<small>PAUSED</small></div>
        <div class="items"></div>
        <div class="legend"><span>${key('ESC')} BACK</span><span>${key('ENTER')} SELECT</span><span>${key('◀')}${key('▶')} CHANGE</span></div>
      </div>
      <div class="main">
        <div class="panel on" data-p="main"><h2>TONIGHT</h2>
          <div class="stats"><div><div class="kk">CREDITS</div><div class="v st-ed">0</div></div><div><div class="kk">GIGS DONE</div><div class="v st-gigs">0</div></div><div><div class="kk">REP</div><div class="v st-cred">0</div></div></div>
          <div class="stats"><div><div class="kk">WHERE</div><div class="v s st-zone">—</div></div><div><div class="kk">CURRENT GIG</div><div class="v s st-gig">—</div></div><div><div class="kk">TIME OUT</div><div class="v s st-time">0:00</div></div></div>
          <h2 style="margin-top:12px">JOBS</h2><div class="journal"></div>
          <div class="rollbox" style="display:none"><h2 style="margin-top:14px">ROLL</h2><div class="roll"></div></div>
          <div class="quote"></div>
        </div>
        <div class="panel" data-p="settings"><h2>SETTINGS</h2><div class="sets"></div><div class="desc"></div></div>
        <div class="panel" data-p="controls"><h2>CONTROLS</h2><div class="dl-ctrls">${CONTROLS.map(([n, ks]) => `<div class="c"><span>${n}</span><span class="ks">${ks.map(key).join('')}</span></div>`).join('')}</div></div>
      </div>`);
    this.root.appendChild(m);
    this.menu = m;
    this.items = [
      { label: 'RESUME', act: () => this.cb.resume() },
      { label: 'SETTINGS', panel: 'settings' },
      { label: 'CONTROLS', panel: 'controls' },
      { label: 'TITLE SCREEN', act: () => this.cb.quitToTitle() },
    ];
    const box = m.querySelector('.items');
    this.itemEls = this.items.map((it, i) => {
      const e = el('div', 'dl-mi', `<span class="ix">0${i + 1}</span><span>${it.label}</span>`);
      e.addEventListener('mouseenter', () => this.select(i));
      e.addEventListener('click', () => this.activate(i));
      box.appendChild(e);
      return e;
    });
    const sets = m.querySelector('.sets');
    this.setEls = SETTINGS.map((s, i) => {
      const e = el('div', 'dl-set', `<div class="lab"><span>${s.label}</span><span class="v"></span></div><div class="ctl"><div class="arrow l">◀</div><div class="pips"></div><div class="arrow r">▶</div></div>${s.key === 'quality' || s.key === 'tod' ? '<div class="note"></div>' : ''}`);
      e.querySelector('.l').addEventListener('click', () => { this.setSel = i; this.adjust(-1); });
      e.querySelector('.r').addEventListener('click', () => { this.setSel = i; this.adjust(1); });
      e.addEventListener('mouseenter', () => { this.setSel = i; this.renderSettings(); });
      if (s.key === 'quality') e.querySelector('.note').addEventListener('click', () => this.settings.qualityPending && this.settings.applyQualityReload());
      if (s.key === 'tod') e.querySelector('.note').addEventListener('click', () => this.settings.todPending && this.settings.applyTodReload());
      sets.appendChild(e);
      return e;
    });
    this.select(0);
    this.renderSettings();
  }

  select(i) {
    this.sel = i;
    this.tab = 'main'; // hovering / moving the menu leaves any sub-page, so keys never drive a hidden page
    this.renderSettings();
    this.itemEls.forEach((e, j) => e.classList.toggle('sel', j === i));
    this.showPanel(this.items[i].panel || 'main');
  }

  showPanel(p) {
    this.panel = p;
    this.menu.querySelectorAll('.panel').forEach((e) => e.classList.toggle('on', e.dataset.p === p));
  }

  activate(i) {
    const it = this.items[i];
    if (it.act) it.act();
    else { this.select(i); this.tab = it.panel; this.renderSettings(); }
  }

  adjust(dir) {
    const s = SETTINGS[this.setSel]; const v = this.settings.get(s.key);
    let nv = v;
    if (s.type === 'bool') nv = !v;
    else if (s.type === 'enum') { const i = s.options.indexOf(v); nv = s.options[Math.max(0, Math.min(s.options.length - 1, i + dir))]; }
    else nv = Math.round(Math.max(s.min, Math.min(s.max, v + dir * s.step)) * 100) / 100;
    if (nv !== v) this.settings.set(s.key, nv);
    this.renderSettings();
  }

  renderSettings() {
    SETTINGS.forEach((s, i) => {
      const e = this.setEls[i]; const v = this.settings.get(s.key);
      e.classList.toggle('sel', this.tab === 'settings' && i === this.setSel);
      e.querySelector('.v').textContent = s.type === 'bool' ? (v ? 'ON' : 'OFF') : s.fmt(v);
      let n = 8, on = 0;
      if (s.type === 'enum') { n = s.options.length; on = s.options.indexOf(v) + 1; }
      else if (s.type !== 'bool') { n = 10; on = Math.round(((v - s.min) / (s.max - s.min)) * 10); }
      const pips = e.querySelector('.pips');
      if (s.type === 'bool') { pips.innerHTML = `<b class="${v ? '' : 'on'}">OFF</b><b class="${v ? 'on' : ''}">ON</b>`; pips.classList.add('bool'); }
      else pips.innerHTML = Array.from({ length: n }, (_, j) => `<i class="${j < on ? 'on' : ''}"></i>`).join('');
      if (i === this.setSel) this.menu.querySelector('.desc').innerHTML = `<b>${s.label}</b>${s.desc || ''}`;
      if (s.key === 'quality') e.querySelector('.note').textContent = this.settings.qualityPending ? `RESTART NEEDED · PRESS [ENTER] OR CLICK TO SWITCH TO ${v.toUpperCase()}` : `RUNNING: ${this.settings.activeQuality.toUpperCase()}`;
      if (s.key === 'tod') e.querySelector('.note').textContent = this.settings.todPending ? `PRESS [ENTER] OR CLICK TO RELOAD AT ${v.toUpperCase()}` : `NOW: ${this.settings.activeTod.toUpperCase()}`;
    });
  }

  updateStats(s) {
    const q = (c) => this.menu.querySelector(c);
    q('.st-ed').textContent = `${Math.round(s.eddies).toLocaleString('en-US')} ${CURRENCY}`;
    q('.st-gigs').textContent = String(s.gigs);
    q('.st-cred').textContent = String(s.cred);
    q('.st-zone').textContent = s.zone || '—';
    q('.st-gig').textContent = s.gig === 'WAITING FOR CALL' ? 'WAITING FOR A CALL' : (s.gig || '—');
    if (s.journal) {
      q('.journal').innerHTML = s.journal.map((g) => `<div class="jr ${g.status}"><span class="st">${{ done: '✓', active: '▶', locked: '·' }[g.status]}</span><span class="tt">${g.status === 'locked' ? 'LOCKED' : g.title}</span><span class="ar">${g.area}</span><span class="rw">${g.status === 'locked' ? '—' : g.reward.toLocaleString('en-US') + ' ' + CURRENCY}</span></div>`).join('');
    }
    // photo-mode contact sheet (the last frames saved tonight)
    const roll = s.photos || [];
    q('.rollbox').style.display = roll.length ? '' : 'none';
    if (roll.length) q('.roll').innerHTML = roll.map((p, i) => `<figure style="--r:${((i * 37) % 7) - 3}deg"><img src="${p.src}" alt=""><figcaption>${String(p.n).padStart(3, '0')} · ${p.look}</figcaption></figure>`).join('');
    q('.quote').textContent = `“${QUOTES[(s.gigs || 0) % QUOTES.length]}”`;
    const t = Math.floor(s.time); q('.st-time').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }

  onKey(e) {
    const state = this.cb.state();
    if (state === 'title') {
      if (e.code === 'Escape' || e.repeat) return;
      this.cb.start();
      return;
    }
    if (state !== 'paused') return;
    if (this.tab === 'settings') {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { this.setSel = (this.setSel + SETTINGS.length - 1) % SETTINGS.length; this.renderSettings(); }
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.setSel = (this.setSel + 1) % SETTINGS.length; this.renderSettings(); }
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.adjust(-1);
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.adjust(1);
      else if (e.code === 'Enter') {
        const k = SETTINGS[this.setSel].key;
        if (k === 'quality' && this.settings.qualityPending) this.settings.applyQualityReload();
        else if (k === 'tod' && this.settings.todPending) this.settings.applyTodReload();
        else this.adjust(1);
      }
      else if (e.code === 'Escape' || e.code === 'Backspace') { this.tab = 'main'; this.renderSettings(); e.stopImmediatePropagation(); this.cb.consumeEsc(); }
      return;
    }
    if (this.tab === 'controls') {
      if (e.code === 'Escape' || e.code === 'Backspace' || e.code === 'Enter') { this.tab = 'main'; e.stopImmediatePropagation(); this.cb.consumeEsc(); }
      return;
    }
    if (e.code === 'ArrowUp' || e.code === 'KeyW') this.select((this.sel + this.items.length - 1) % this.items.length);
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.select((this.sel + 1) % this.items.length);
    else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'ArrowRight') this.activate(this.sel);
  }

  openPause() { this.tab = 'main'; this.select(0); this.renderSettings(); }
}
