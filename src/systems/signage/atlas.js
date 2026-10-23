// Runtime sign-art atlases rendered with Canvas2D (Windows JP fonts: Yu Gothic / Meiryo / MS Gothic).
//  - NeonAtlas: linear data mask. R = tube profile (soft core), G = wide halo, B = segment id (per glyph) for broken/flicker.
//    Tint is applied per-vertex in the shader so one mask can be reused in any colour.
//  - ColorAtlas: sRGB full-colour art for light boxes, posters, road signs, lantern paper, screens.
import * as THREE from 'three/webgpu';

export const FONTS = {
  goth: '"Yu Gothic", "YuGothic", "Meiryo", sans-serif',
  meiryo: '"Meiryo", "Yu Gothic", sans-serif',
  msgoth: '"MS Gothic", "Yu Gothic", monospace',
  mincho: '"Yu Mincho", "MS Mincho", serif',
  bahn: '"Bahnschrift", "Arial Narrow", sans-serif',
  script: '"Segoe Script", "Brush Script MT", cursive',
  impact: 'Impact, "Arial Black", sans-serif',
  arial: '"Arial Black", Arial, sans-serif',
};

export async function loadFonts() {
  const tries = ['300 64px "Yu Gothic"', '700 64px "Yu Gothic"', '400 64px "Meiryo"', '700 64px "Meiryo"', '400 64px "MS Gothic"',
    '400 64px "Yu Mincho"', '700 64px "Bahnschrift"', '400 64px "Segoe Script"', '400 64px Impact', '900 64px "Arial Black"'];
  try { await Promise.all(tries.map((f) => document.fonts.load(f, 'ラーメンABC居酒屋'))); } catch (e) { /* system fonts */ }
}

class Packer {
  constructor(size, pad = 6) { this.S = size; this.pad = pad; this.x = 0; this.y = 0; this.rowH = 0; }
  alloc(w, h) {
    w = Math.ceil(w); h = Math.ceil(h);
    const p = this.pad;
    if (this.x + w + p > this.S) { this.x = 0; this.y += this.rowH + p; this.rowH = 0; }
    if (this.y + h + p > this.S) return null;
    const r = { x: this.x + p, y: this.y + p, w, h };
    this.x += w + p; this.rowH = Math.max(this.rowH, h + p);
    r.uv = [r.x / this.S, 1 - (r.y + r.h) / this.S, (r.x + r.w) / this.S, 1 - r.y / this.S];
    return r;
  }
}

function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Expand text items into individual glyph draws (each glyph = one neon segment).
function layoutText(it) {
  const out = [];
  const chars = [...it.text];
  if (it.vertical && it.sideways) {
    // Latin word running down a vertical blade, glyphs turned 90 deg and spaced by their own width (reads sideways)
    const g = mkCanvas(8, 8).getContext('2d');
    g.font = `${it.weight || 700} ${it.size}px ${it.font}`;
    const track = it.track ?? 0.06;
    const widths = chars.map((c) => g.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + track * it.size * (chars.length - 1);
    let y = it.y - total / 2;
    chars.forEach((ch, i) => {
      out.push({ ...it, ch, x: it.x, y: y + widths[i] / 2, rot: Math.PI / 2, sz: it.size });
      y += widths[i] + track * it.size;
    });
  } else if (it.vertical) {
    const step = it.size * (it.spacing ?? 1.06);
    const total = step * chars.length;
    let y = it.y - total / 2 + step / 2;
    for (const ch of chars) {
      const rot = (ch === 'ー' || ch === '-' || ch === '〜' || ch === '…') ? Math.PI / 2 : 0;
      const small = 'ャュョッァィゥェォゃゅょっぁぃぅぇぉ'.includes(ch);
      out.push({ ...it, ch, x: it.x + (small ? it.size * 0.1 : 0), y: y - (small ? it.size * 0.1 : 0), rot, sz: small ? it.size * 0.8 : it.size });
      y += step;
    }
  } else {
    // horizontal: measure each glyph to place them with tracking
    const g = mkCanvas(8, 8).getContext('2d');
    g.font = `${it.weight || 700} ${it.size}px ${it.font}`;
    const track = it.track ?? 0;
    const widths = chars.map((c) => g.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + track * it.size * (chars.length - 1);
    const sx = Math.min(1, (it.maxW || 1e9) / total);
    let x = it.x - total * sx / 2;
    chars.forEach((ch, i) => {
      out.push({ ...it, ch, x: x + widths[i] * sx / 2, y: it.y, rot: 0, sz: it.size, sx });
      x += (widths[i] + track * it.size) * sx;
    });
  }
  return out;
}

function drawGlyph(g, d, style, lw) {
  g.save();
  g.translate(d.x, d.y);
  if (d.rot) g.rotate(d.rot);
  if (d.sx && d.sx < 1) g.scale(d.sx, 1);
  g.font = `${d.weight || 700} ${d.sz}px ${d.font}`;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const m = g.measureText(d.ch);
  const yo = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  if (style === 'stroke') { g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeText(d.ch, 0, yo); } else { g.fillText(d.ch, 0, yo); if (lw > 0) { g.lineWidth = lw; g.lineJoin = 'round'; g.strokeText(d.ch, 0, yo); } }
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

export class NeonAtlas {
  constructor(size = 4096) {
    this.S = size;
    this.canvas = mkCanvas(size, size);
    this.g = this.canvas.getContext('2d');
    this.g.fillStyle = '#000'; this.g.fillRect(0, 0, size, size);
    this.packer = new Packer(size, 4);
    this.tmp = mkCanvas(1024, 2048);
  }

  // spec: { w, h, items: [{type:'text', text, x, y, size, font, weight, vertical, style:'fill'|'stroke', lw}, {type:'rect', x,y,w,h,r,lw}, {type:'path', pts:[[x,y]..], lw, closed}] }
  // Coordinates in cell pixels.
  add(spec) {
    const r = this.packer.alloc(spec.w, spec.h);
    if (!r) { console.warn('[signage] neon atlas full'); return null; }
    const draws = [];
    let seg = 0;
    for (const it of spec.items) {
      if (it.type === 'text') for (const d of layoutText(it)) draws.push({ kind: 'glyph', d, seg: ++seg, it });
      else draws.push({ kind: it.type, it, seg: ++seg });
    }
    const T = this.tmp;
    if (T.width < spec.w || T.height < spec.h) { T.width = Math.max(T.width, spec.w); T.height = Math.max(T.height, spec.h); }
    const t = T.getContext('2d');
    const layer = (color, lwMul, segColor) => {
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.clearRect(0, 0, T.width, T.height);
      for (const dr of draws) {
        const c = segColor ? `rgb(0,0,${(dr.seg * 47) % 250 + 4})` : color;
        t.fillStyle = c; t.strokeStyle = c;
        const it = dr.it;
        const lw = (it.lw || 4) * lwMul;
        if (dr.kind === 'glyph') drawGlyph(t, dr.d, it.style || 'fill', it.style === 'stroke' ? lw : (lwMul > 1 ? lw * 0.5 : 0));
        else if (dr.kind === 'rect') { t.lineWidth = lw; roundRect(t, it.x, it.y, it.w, it.h, it.r || 0); t.stroke(); }
        else if (dr.kind === 'path') {
          t.lineWidth = lw; t.lineJoin = 'round'; t.lineCap = 'round'; t.beginPath();
          it.pts.forEach(([x, y], i) => (i ? t.lineTo(x, y) : t.moveTo(x, y)));
          if (it.closed) t.closePath(); t.stroke();
        } else if (dr.kind === 'circle') { t.lineWidth = lw; t.beginPath(); t.arc(it.x, it.y, it.r, 0, Math.PI * 2); t.stroke(); }
      }
    };
    const g = this.g;
    const blit = (filter) => {
      g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
      g.globalCompositeOperation = 'lighter'; g.filter = filter;
      g.drawImage(T, 0, 0, spec.w, spec.h, r.x, r.y, spec.w, spec.h);
      g.restore();
    };
    const lw0 = spec.items.reduce((a, it) => Math.max(a, it.lw || 4), 4);
    layer('#ff0000', 1, false); blit(`blur(${Math.max(0.8, lw0 * 0.28)}px)`);
    layer('#00ff00', 1.6, false); blit(`blur(${lw0 * 4}px) brightness(1.6)`); blit(`blur(${lw0 * 1.2}px) brightness(0.6)`);
    layer(null, 2.4, true); blit('none');
    return r;
  }

  texture() {
    const t = new THREE.CanvasTexture(this.canvas);
    t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    return t;
  }
}

export class ColorAtlas {
  constructor(size = 4096) {
    this.S = size;
    this.canvas = mkCanvas(size, size);
    this.g = this.canvas.getContext('2d');
    this.g.fillStyle = '#000'; this.g.fillRect(0, 0, size, size);
    this.packer = new Packer(size, 4);
  }

  // draw(g, w, h) draws the cell content in local coords.
  add(w, h, draw) {
    const r = this.packer.alloc(w, h);
    if (!r) { console.warn('[signage] color atlas full'); return null; }
    const g = this.g;
    g.save(); g.translate(r.x, r.y); g.beginPath(); g.rect(0, 0, r.w, r.h); g.clip();
    draw(g, r.w, r.h);
    g.restore();
    return r;
  }

  image(img, sx, sy, sw, sh, w, h) {
    return this.add(w, h, (g) => g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h));
  }

  texture() {
    const t = new THREE.CanvasTexture(this.canvas);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    return t;
  }
}

// ---- helpers for colour lightbox faces
export function fitText(g, text, font, weight, maxW, maxH) {
  let size = maxH;
  g.font = `${weight} ${size}px ${font}`;
  const w = g.measureText(text).width;
  if (w > maxW) size = size * maxW / w;
  g.font = `${weight} ${size}px ${font}`;
  return size;
}

export function textCentered(g, text, x, y, font, weight, maxW, maxH, fill, stroke = null, lw = 0) {
  const size = fitText(g, text, font, weight, maxW, maxH);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const m = g.measureText(text);
  const yo = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(text, x, y + yo); }
  g.fillStyle = fill; g.fillText(text, x, y + yo);
  return size;
}

export function textVertical(g, text, x, y0, y1, font, weight, maxW, fill, stroke = null, lw = 0) {
  const chars = [...text];
  const avail = y1 - y0;
  const size = Math.min(maxW, avail / chars.length / 1.04);
  const step = avail / chars.length;
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  chars.forEach((ch, i) => {
    const cy = y0 + step * (i + 0.5);
    g.save(); g.translate(x, cy);
    if (ch === 'ー' || ch === '-') g.rotate(Math.PI / 2);
    g.font = `${weight} ${size}px ${font}`;
    const m = g.measureText(ch);
    const yo = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(ch, 0, yo); }
    g.fillStyle = fill; g.fillText(ch, 0, yo);
    g.restore();
  });
}

export { roundRect };
