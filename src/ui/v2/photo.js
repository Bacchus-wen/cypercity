// DUSKLINE photo mode (new interface only; the original has none). P while playing: the world freezes (traffic,
// crowd), the HUD goes away and the camera floats free around where you stood or parked:
//   mouse = orbit · wheel = distance · W A S D / R F = move the pivot (within 30 m) · Q / E = roll · Z / X = lens
//   1-5 = film look (NONE / DUSK / NOIR / SYNTH / PRINT) · T = frame & caption · ENTER = save a PNG · P / ESC = back
// The look is a CSS filter on the canvas while composing; the saved PNG redraws the frame through the same filter
// in a 2D canvas right after the render (engine afterRender hook) and adds the vignette, bars and caption.
import * as THREE from 'three/webgpu';

const LOOKS = [
  { name: 'NONE', css: '' },
  { name: 'DUSK', css: 'saturate(1.25) contrast(1.08) sepia(0.16) hue-rotate(-8deg)' },
  { name: 'NOIR', css: 'grayscale(1) contrast(1.35) brightness(0.95)' },
  { name: 'SYNTH', css: 'saturate(1.6) hue-rotate(18deg) contrast(1.1)' },
  { name: 'PRINT', css: 'contrast(1.22) saturate(0.78) sepia(0.32) brightness(1.05)' },
];

const CSS = `
#dl-photo { --ph: 'Avenir Next Condensed', 'DIN Condensed', 'Arial Narrow', Impact, sans-serif; position: fixed; inset: 0; pointer-events: none; z-index: 40; display: none; font-family: var(--ph); }
body.photo-mode #dl-photo { display: block; }
body.photo-mode #dl, body.photo-mode .dl-dmg { display: none !important; }
#dl-photo .vig { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 55%, rgba(8,6,10,.55) 100%); }
#dl-photo .bar { position: absolute; left: 0; right: 0; height: 7.5vh; background: #0d0b10; transition: height .3s; }
#dl-photo .bar.t { top: 0; } #dl-photo .bar.b { bottom: 0; }
#dl-photo.noframe .bar, #dl-photo.noframe .cap, #dl-photo.noframe .corner { opacity: 0; }
#dl-photo .cap { position: absolute; left: 4vw; bottom: calc(7.5vh + 22px); color: #f2ede4; text-shadow: 3px 3px 0 #c4142a; }
#dl-photo .cap .w { font: 900 italic 54px/0.9 var(--ph); letter-spacing: .02em; }
#dl-photo .cap .s { margin-top: 8px; font: 700 15px/1 var(--ph); letter-spacing: .28em; text-shadow: none; color: #ffb547; }
#dl-photo .corner { position: absolute; width: 34px; height: 34px; border: 3px solid rgba(242,237,228,.85); }
#dl-photo .corner.a { left: 3vw; top: calc(7.5vh + 18px); border-right: 0; border-bottom: 0; }
#dl-photo .corner.b { right: 3vw; top: calc(7.5vh + 18px); border-left: 0; border-bottom: 0; }
#dl-photo .corner.c { left: 3vw; bottom: calc(7.5vh + 18px); border-right: 0; border-top: 0; opacity: 0; }
#dl-photo .corner.d { right: 3vw; bottom: calc(7.5vh + 18px); border-left: 0; border-top: 0; }
#dl-photo .help { position: absolute; right: 3vw; bottom: 1.6vh; font: 700 12px/1.4 'SF Mono', Menlo, monospace; letter-spacing: .1em; color: rgba(242,237,228,.75); text-align: right; }
#dl-photo .look { position: absolute; left: 50%; top: calc(7.5vh + 18px); transform: translateX(-50%); padding: 6px 14px 5px; font: 800 14px/1 var(--ph); letter-spacing: .3em;
  color: #0d0b10; background: #f2ede4; border: 2px solid #0d0b10; box-shadow: 3px 3px 0 #ff2d3d; }
#dl-photo .flash { position: absolute; inset: 0; background: #fff; opacity: 0; transition: opacity .5s; }
#dl-photo .flash.on { opacity: .85; transition: none; }
`;

export class PhotoMode {
  constructor(ctx) {
    this.ctx = ctx; this.active = false;
    this.look = 1; this.frame = true; this.shots = 0;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = document.createElement('div'); el.id = 'dl-photo';
    el.innerHTML = `<div class="vig"></div><div class="bar t"></div><div class="bar b"></div>
      <div class="corner a"></div><div class="corner b"></div><div class="corner c"></div><div class="corner d"></div>
      <div class="look"></div>
      <div class="cap"><div class="w">DUSKLINE</div><div class="s"></div></div>
      <div class="help">MOUSE ORBIT · WHEEL DIST · WASD/RF MOVE · Q/E ROLL · Z/X LENS<br>1–5 LOOK · T FRAME · ENTER SAVE · P BACK</div>
      <div class="flash"></div>`;
    document.body.appendChild(el);
    this.el = el; this.lookEl = el.querySelector('.look'); this.capEl = el.querySelector('.cap .s'); this.flashEl = el.querySelector('.flash');
    this.pivot = new THREE.Vector3(); this.origin = new THREE.Vector3();
    this._v = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  enter(cam, anchor, caption) {
    this.active = true;
    this.pivot.copy(anchor); this.origin.copy(anchor);
    const off = this._v.subVectors(cam.position, anchor);
    let d = off.length();
    if (d < 1.0) { // first person: start just behind the eye along the view
      cam.getWorldDirection(off).multiplyScalar(-3); d = 3;
    }
    this.dist = THREE.MathUtils.clamp(d, 1.2, 14);
    this.yaw = Math.atan2(off.x, off.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(off.y / Math.max(off.length(), 1e-3), -0.95, 0.95));
    this.roll = 0; this.fov0 = cam.fov; this.fov = cam.fov;
    this.caption = caption;
    document.body.classList.add('photo-mode');
    this.apply();
  }

  exit(cam) {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this._vt);
    document.body.classList.remove('photo-mode');
    this.ctx.renderer.domElement.style.filter = '';
    if (cam && this.fov0) { cam.fov = this.fov0; cam.updateProjectionMatrix(); }
  }

  apply() {
    const L = LOOKS[this.look];
    this.ctx.renderer.domElement.style.filter = L.css;
    this.lookEl.textContent = `LOOK · ${L.name}`;
    this.el.classList.toggle('noframe', !this.frame);
    this.capEl.textContent = this.caption;
  }

  update(dt, input, cam) {
    const m = input.mouse;
    this.yaw -= m.dx * 0.0035; this.pitch = THREE.MathUtils.clamp(this.pitch + m.dy * 0.0035, -1.2, 1.35);
    if (m.wheel) this.dist = THREE.MathUtils.clamp(this.dist * Math.pow(1.12, m.wheel), 0.8, 18);
    // move the pivot in the view's horizontal frame
    const f = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0), r = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const u = (input.down('KeyR') ? 1 : 0) - (input.down('KeyF') ? 1 : 0);
    const sp = 6 * dt;
    this.pivot.x += (-Math.sin(this.yaw) * f + Math.cos(this.yaw) * r) * sp;
    this.pivot.z += (-Math.cos(this.yaw) * f - Math.sin(this.yaw) * r) * sp;
    this.pivot.y += u * sp;
    const o = this._v.subVectors(this.pivot, this.origin);
    if (o.length() > 30) { o.setLength(30); this.pivot.copy(this.origin).add(o); }
    this.pivot.y = Math.max(this.origin.y - 1.4, this.pivot.y);
    if (input.down('KeyQ')) this.roll += dt * 0.6;
    if (input.down('KeyE')) this.roll -= dt * 0.6;
    if (input.down('KeyZ')) this.fov = Math.max(14, this.fov - dt * 25);
    if (input.down('KeyX')) this.fov = Math.min(95, this.fov + dt * 25);
    for (let k = 0; k < LOOKS.length; k++) if (input.justPressed(`Digit${k + 1}`)) { this.look = k; this.apply(); }
    if (input.justPressed('KeyT')) { this.frame = !this.frame; this.apply(); }
    // camera
    const cp = Math.cos(this.pitch);
    cam.position.set(this.pivot.x + Math.sin(this.yaw) * cp * this.dist, this.pivot.y + Math.sin(this.pitch) * this.dist, this.pivot.z + Math.cos(this.yaw) * cp * this.dist);
    cam.lookAt(this.pivot);
    if (this.roll) cam.quaternion.multiply(this._q.setFromAxisAngle(this._v.set(0, 0, 1), this.roll));
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    if (input.justPressed('Enter') || input.justPressed('NumpadEnter')) this.capture(); // (after the camera is placed)
  }

  // save: redraw the rendered frame through the look in a 2D canvas right after the next render, add bars + caption
  capture() {
    const ctx = this.ctx;
    const camSnap = new THREE.PerspectiveCamera().copy(ctx.camera, false); camSnap.updateMatrixWorld(); // (the gig judges this exact framing - camera only, no children...)
    const showSnap = ctx.api.landmarks?.droneShow ? { ...ctx.api.landmarks.droneShow.state } : null; // (...and this formation)
    const look = LOOKS[this.look]; // (the look at the shutter: the encode is asynchronous)
    ctx.afterRender = () => {
      const src = ctx.renderer.domElement, W = src.width, H = src.height;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      g.filter = look.css || 'none';
      g.drawImage(src, 0, 0);
      g.filter = 'none';
      const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.55);
      vg.addColorStop(0, 'rgba(8,6,10,0)'); vg.addColorStop(1, 'rgba(8,6,10,0.55)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
      if (this.frame) {
        const bh = Math.round(H * 0.075), s = H / 1000;
        g.fillStyle = '#0d0b10'; g.fillRect(0, 0, W, bh); g.fillRect(0, H - bh, W, bh);
        const x = W * 0.04, y = H - bh - 30 * s;
        g.font = `900 italic ${Math.round(58 * s)}px "Avenir Next Condensed", "DIN Condensed", Impact, sans-serif`;
        g.fillStyle = '#c4142a'; g.fillText('DUSKLINE', x + 3 * s, y - 26 * s + 3 * s);
        g.fillStyle = '#f2ede4'; g.fillText('DUSKLINE', x, y - 26 * s);
        g.font = `700 ${Math.round(16 * s)}px "Avenir Next Condensed", "DIN Condensed", sans-serif`;
        g.fillStyle = '#ffb547'; g.fillText(this.caption.split('').join(String.fromCharCode(8202)), x, y);
        g.font = `700 ${Math.round(13 * s)}px Menlo, monospace`; g.fillStyle = 'rgba(242,237,228,.7)';
        g.textAlign = 'right'; g.fillText(`FRAME ${String(this.shots + 1).padStart(3, '0')} · ${look.name}`, W * 0.97, H - bh * 0.4);
      }
      cv.toBlob((blob) => {
        if (!blob) { console.warn('[photo] could not encode the PNG'); this.lookEl.textContent = 'SAVE FAILED'; return; }
        this.shots++;
        // contact sheet for the pause menu: the last six frames as small thumbnails
        try {
          const th = document.createElement('canvas'); th.width = 320; th.height = Math.round(320 * H / W);
          th.getContext('2d').drawImage(cv, 0, 0, th.width, th.height);
          // (this.film, not this.roll: roll is the camera's tilt angle)
          (this.film ||= []).unshift({ src: th.toDataURL('image/jpeg', 0.82), look: look.name, n: this.shots });
          if (this.film.length > 6) this.film.length = 6;
        } catch { /* thumbnails are optional */ }
        // a photo gig pays only for a shot that was actually saved
        const verdict = this.onCapture?.(camSnap, showSnap);
        if (verdict && this.active) { this.lookEl.textContent = verdict; clearTimeout(this._vt); this._vt = setTimeout(() => { if (this.active) this.apply(); }, 5000); }
        const a = document.createElement('a');
        const d = new Date(), p = (n) => String(n).padStart(2, '0');
        a.download = `duskline_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
        a.href = URL.createObjectURL(blob); a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        this.lastBlobSize = blob.size;
      }, 'image/png');
    };
    this.flashEl.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => this.flashEl.classList.remove('on')));
  }
}
