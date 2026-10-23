// Sign design library: renders all sign artwork into the two atlases and returns design descriptors.
// Each design: { rect (atlas rect with uv), aspect (w/h), mode, natural: [wm, hm] }
import { NeonAtlas, ColorAtlas, FONTS, textCentered, textVertical, fitText, roundRect, loadFonts } from './atlas.js';
import { mulberry32 } from './util.js';
import { ART_RESTYLE } from '../restyleArt.js';

// Restyle (Night City direction): signs read mostly in English with a few Japanese / kanji accents. Designs keep
// their original Japanese key in `text` (featured.js looks them up by it); only the drawn text changes.
// ?art=legacy draws the original texts. Names are original (no Cyberpunk 2077 brands).
const RESTYLE_TEXT = {
  'ラーメン': 'RAMEN', 'カラオケ': 'KARAOKE', '居酒屋': 'BAR', 'やきとり': 'GRILL', '飲み屋': 'DRINKS', 'ネオン': 'NEON', '質': 'PAWN',
  'ホテル': 'HOTEL', 'カフェ': 'CAFE', 'パチンコ': 'SLOTS', '麻雀': 'MAHJONG', '焼肉': 'BBQ', 'ゲーム': 'GAMES', '喫茶': 'COFFEE',
  'スナック': 'LOUNGE', 'クラブ': 'CLUB', 'バー': 'BAR', '餃子': 'GYOZA', 'うどん': 'NOODLE', '質屋': 'LOANS', 'マッサージ': 'MASSAGE',
  '漫画喫茶': 'NETCAFE', '中華': 'WOK', '銭湯': 'BATHS', '本日開店': 'OPEN', '整骨院': 'CLINIC', '立呑み': 'PUB', '串カツ': 'SKEWER',
  // kept as accents: 寿司 電脳 夜市 薬 酒場 占い
  'ネットカフェ': 'NET CAFE 24', 'カラオケ館': 'KARAOKE HALL', '焼肉 鉄火': 'TEKKA GRILL', '焼鳥 灯': 'AKARI SKEWERS',
  '黒潮': 'KUROSHIO',
};
const show = (t) => (ART_RESTYLE ? RESTYLE_TEXT[t] ?? t : t);
const isJP = (t) => /[^\x00-\x7f]/.test(t);
// extra English horizontal neon of the restyle (appended to H_TXT)
const H_TXT_R = ['NO VACANCY', 'LIQUOR', 'DINER', 'TATTOO', 'CHROME & CO', 'IMPLANTS', 'MOTEL', 'OPEN 24/7'];

export const JP_V = ['ラーメン', 'カラオケ', '居酒屋', 'やきとり', '飲み屋', 'ネオン', '薬', '質', 'ホテル', 'カフェ', 'パチンコ', '寿司', '酒場',
  '麻雀', '占い', '焼肉', 'ゲーム', '喫茶', '電脳', '夜市', 'スナック', 'クラブ', 'バー', '餃子', 'うどん', '質屋', 'マッサージ', '漫画喫茶', '中華', '銭湯', '本日開店', '整骨院', '立呑み', '串カツ'];
export const LAT_V = ['BAR', 'HOTEL', 'CLUB', 'SUSHI', 'SAKE', 'GAME'];
export const H_TXT = ['NEON', 'IZAKAYA', 'HOTEL', 'KARAOKE', 'BAR', 'OPEN 24H', 'SUSHI', 'NOODLES', 'PACHINKO', 'ARCADE', 'LIQUOR', 'CLUB STATIC', 'RAMEN',
  'CYBER CAFE', 'SAKE', 'GAME CENTER', 'ネットカフェ', 'カラオケ館', '焼肉 鉄火', '焼鳥 灯', 'HOSTEL', 'MOTEL', 'DRUGS', '24H', 'ROBO DOCK', 'HARBOR NIGHTS', 'LUCKY', 'NEST 8'];
export const SCRIPT_TXT = ['Bar', 'Open', 'Love', 'Sushi', 'Cafe', 'Dreams', 'Neon', 'Night'];

const PXM = 190; // atlas pixels per metre (nominal)

export async function buildLibrary(images) {
  await loadFonts();
  const NA = new NeonAtlas(4096);
  const CA = new ColorAtlas(4096);
  const rnd = mulberry32(4242);
  const L = { neonV: [], neonH: [], neonIcon: [], chanH: [], boxV: [], boxH: [], boxSq: [], posters: [], screens: [], screensWide: [], tenant: [], misc: {} };
  const put = (arr, rect, mode, extra = {}) => { if (rect) { const d = { rect, mode, aspect: rect.w / rect.h, natural: [rect.w / PXM, rect.h / PXM], ...extra }; arr.push(d); return d; } return null; };

  // ---------------- neon vertical blades (tube text, optional border)
  const vlist = [...JP_V, ...LAT_V];
  vlist.forEach((txt, i) => {
    const dt = show(txt);
    const chars = [...dt].length;
    // (stacked Latin capitals need less than a CJK square per character: smaller size + tighter step keeps the
    //  restyle's longer words inside the shared atlas)
    const lat = ART_RESTYLE && !isJP(dt); // (legacy keeps the original stacked sizing for its Latin blades)
    const sideways = lat && chars > 4; // long Latin words run sideways down the blade instead of letter-stacking
    const outline = rnd() < 0.4;
    const fontJP = rnd.pick([FONTS.goth, FONTS.meiryo, FONTS.goth, FONTS.mincho]);
    const font = isJP(dt) ? fontJP : (outline ? FONTS.impact : FONTS.bahn);
    const W = 160, size = sideways ? 104 : lat ? 84 : chars > 4 ? 92 : 108, spacing = lat ? 0.9 : 1.06;
    let H;
    if (sideways) {
      const gm = document.createElement('canvas').getContext('2d');
      gm.font = `${outline ? 800 : 300} ${size}px ${font}`;
      H = Math.round(gm.measureText(dt).width * 1.08 + 84);
    } else H = Math.round(chars * size * (lat ? spacing : 1.08) + 84); // (non-restyle keeps the original height)
    const items = [{ type: 'text', text: dt, x: W / 2, y: H / 2, size, font, weight: outline ? 800 : 300, vertical: true, sideways, spacing, style: outline ? 'stroke' : 'fill', lw: outline ? 5 : 5 }];
    if (rnd() < 0.75) items.push({ type: 'rect', x: 14, y: 14, w: W - 28, h: H - 28, r: 20, lw: 5 });
    if (rnd() < 0.3) items.push({ type: 'rect', x: 26, y: 26, w: W - 52, h: H - 52, r: 10, lw: 4 });
    put(L.neonV, NA.add({ w: W, h: H, items }), 0, { text: txt });
  });

  // overlook hero: ネオン + stacked NEON
  {
    const W = 230, size = 150, H = 7 * size * 1.04 + 120;
    const items = [ART_RESTYLE
      ? { type: 'text', text: 'ROOMS', x: W / 2, y: 60 + 1.5 * size * 1.04, size: size * 0.55, font: FONTS.bahn, weight: 300, vertical: true, style: 'fill', lw: 6 }
      : { type: 'text', text: 'ネオン', x: W / 2, y: 60 + 1.5 * size * 1.04, size, font: FONTS.goth, weight: 300, vertical: true, style: 'fill', lw: 6 },
      { type: 'text', text: 'NEON', x: W / 2, y: 60 + 5 * size * 1.04, size: size * 0.92, font: FONTS.bahn, weight: 300, vertical: true, style: 'fill', lw: 6 },
      { type: 'rect', x: 16, y: 16, w: W - 32, h: H - 32, r: 30, lw: 7 }];
    L.misc.neonOverlook = put([], NA.add({ w: W, h: Math.round(H), items }), 0, { text: 'ネオンNEON' });
  }

  // ---------------- neon horizontal (tube) + script
  (ART_RESTYLE ? [...H_TXT.map(show), ...H_TXT_R] : H_TXT).forEach((txt) => {
    const isJP = /[^\x00-\x7f]/.test(txt);
    const size = 96;
    const font = isJP ? FONTS.goth : rnd.pick([FONTS.bahn, FONTS.arial, FONTS.bahn, FONTS.impact]);
    const g = document.createElement('canvas').getContext('2d');
    g.font = `700 ${size}px ${font}`;
    const tw = g.measureText(txt).width * 1.08;
    const W = Math.min(1100, Math.round(tw + 90)), H = 172;
    const outline = rnd() < 0.55;
    const items = [{ type: 'text', text: txt, x: W / 2, y: H / 2, size, font, weight: outline ? 700 : 300, style: outline ? 'stroke' : 'fill', lw: 5, maxW: W - 76, track: 0.05 }];
    if (rnd() < 0.6) items.push({ type: 'rect', x: 12, y: 12, w: W - 24, h: H - 24, r: 30, lw: 5 });
    put(L.neonH, NA.add({ w: W, h: H, items }), 0, { text: txt });
  });
  SCRIPT_TXT.forEach((txt) => {
    const W = 460, H = 220;
    const items = [{ type: 'text', text: txt, x: W / 2, y: H / 2 + 8, size: 126, font: FONTS.script, weight: 400, style: 'fill', lw: 6, maxW: W - 60 }];
    if (rnd() < 0.5) items.push({ type: 'path', pts: [[60, H - 50], [W - 60, H - 50]], lw: 7 });
    put(L.neonH, NA.add({ w: W, h: H, items }), 0, { text: txt, script: true });
  });

  // ---------------- neon icons (cocktail, heart, arrow, note, sake)
  {
    const W = 400, H = 400;
    const cocktail = [{ type: 'path', pts: [[90, 90], [310, 90], [200, 220], [90, 90]], lw: 9, closed: true }, { type: 'path', pts: [[200, 220], [200, 320]], lw: 9 }, { type: 'path', pts: [[140, 325], [260, 325]], lw: 9 }, { type: 'circle', x: 270, y: 80, r: 26, lw: 8 }, { type: 'path', pts: [[200, 160], [300, 50]], lw: 6 }];
    put(L.neonIcon, NA.add({ w: W, h: H, items: cocktail }), 0, { text: 'cocktail' });
    const heart = []; const hp = [];
    for (let i = 0; i <= 64; i++) { const t = i / 64 * Math.PI * 2; const x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); hp.push([200 + x * 9.5, 190 - y * 9.5]); }
    heart.push({ type: 'path', pts: hp, lw: 10, closed: true });
    heart.push({ type: 'path', pts: hp.map(([x, y]) => [200 + (x - 200) * 0.72, 190 + (y - 190) * 0.72]), lw: 7, closed: true });
    put(L.neonIcon, NA.add({ w: W, h: H, items: heart }), 0, { text: 'heart' });
    const arrow = [];
    for (let k = 0; k < 4; k++) arrow.push({ type: 'path', pts: [[60 + k * 80, 110], [120 + k * 80, 200], [60 + k * 80, 290]], lw: 12 });
    put(L.neonIcon, NA.add({ w: W, h: H, items: arrow }), 0, { text: 'arrow', chase: true });
    const note = [{ type: 'path', pts: [[150, 300], [150, 90], [290, 60], [290, 270]], lw: 10 }, { type: 'circle', x: 120, y: 300, r: 32, lw: 10 }, { type: 'circle', x: 260, y: 272, r: 32, lw: 10 }];
    put(L.neonIcon, NA.add({ w: W, h: H, items: note }), 0, { text: 'note' });
    const eye = []; const ep = [];
    for (let i = 0; i <= 48; i++) { const t = i / 48 * Math.PI * 2; ep.push([200 + Math.cos(t) * 160, 200 + Math.sin(t) * 80 * Math.abs(Math.sin(t)) ** 0.3 * Math.sign(Math.sin(t))]); }
    eye.push({ type: 'path', pts: ep, lw: 9, closed: true }, { type: 'circle', x: 200, y: 200, r: 44, lw: 9 }, { type: 'circle', x: 200, y: 200, r: 12, lw: 9 });
    put(L.neonIcon, NA.add({ w: W, h: H, items: eye }), 0, { text: 'eye' });
  }

  // ---------------- LED channel letters (filled bold) – used for rooftop / big horizontal signs
  ['TSUBAME', 'HOTEL', 'SYNAPSE+', 'LUMI NOVA', '黒潮', 'NEON', 'HAKOBU', 'カラオケ', 'SPARKBITE', 'MINATO BANK', '電脳', 'GAME HIVE'].map(show).forEach((txt) => {
    const isJP = /[^\x00-\x7f]/.test(txt);
    const size = 150;
    const font = isJP ? FONTS.goth : FONTS.bahn;
    const g = document.createElement('canvas').getContext('2d');
    g.font = `700 ${size}px ${font}`;
    const W = Math.min(1600, Math.round(g.measureText(txt).width * 1.12 + 60)), H = 210;
    put(L.chanH, NA.add({ w: W, h: H, items: [{ type: 'text', text: txt, x: W / 2, y: H / 2, size, font, weight: 700, style: 'fill', lw: 4, maxW: W - 60, track: 0.08 }] }), 4, { text: txt });
  });

  // ---------------- colour light boxes: codex lightbox atlas (8 cells, 4x2)
  if (images.lightbox) {
    const im = images.lightbox, cw = im.width / 4, ch = im.height / 2;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) put(L.boxSq, CA.image(im, i * cw + 6, j * ch + 6, cw - 12, ch - 12, 360, 360), 1, { text: 'lb' + (j * 4 + i) });
  }
  // canvas light boxes – vertical blades
  const schemesL = [
    { bg: '#f4f1ea', fg: '#d0101a', band: '#d0101a' }, { bg: '#fff6d0', fg: '#101010', band: '#e02020' }, { bg: '#ffd400', fg: '#151515', band: '#151515' },
    { bg: '#ffffff', fg: '#1840c0', band: '#1840c0' }, { bg: '#d8102a', fg: '#ffffff', band: '#ffe060' }, { bg: '#151515', fg: '#ffd030', band: '#ffd030' },
    { bg: '#1a2a8a', fg: '#ffffff', band: '#40d0ff' }, { bg: '#ff5a9a', fg: '#ffffff', band: '#ffffff' }, { bg: '#20a050', fg: '#ffffff', band: '#ffffff' },
    { bg: '#ffffff', fg: '#111111', band: '#ff7a00' }, { bg: '#6a1ab0', fg: '#ffffff', band: '#ff60d0' }, { bg: '#f07010', fg: '#ffffff', band: '#ffffff' },
  ];
  // restyle: white-faced boxes become dark-faced (Night City signage is dark-based; white boxes out-shone the neon)
  const schemes = ART_RESTYLE ? schemesL.map((s) => (/^#f[0-9a-f]f/i.test(s.bg) || s.bg === '#ffffff' ? { bg: '#16161a', fg: s.fg === '#111111' || s.fg === '#101010' ? '#f2efe8' : s.fg, band: s.band } : s)) : schemesL;
  vlist.slice(0, 30).forEach((txt, i) => {
    const s = schemes[i % schemes.length];
    const chars = [...show(txt)].length;
    const W = 150, H = Math.max(320, Math.round(chars * (!ART_RESTYLE || isJP(show(txt)) ? 120 : 92) + 90));
    put(L.boxV, CA.add(W, H, (g) => {
      const gr = g.createLinearGradient(0, 0, W, 0);
      gr.addColorStop(0, s.bg); gr.addColorStop(0.5, s.bg); gr.addColorStop(1, s.bg);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = s.band; g.fillRect(0, 0, W, 26); g.fillRect(0, H - 26, W, 26);
      g.strokeStyle = s.band; g.lineWidth = 4; g.strokeRect(10, 34, W - 20, H - 68);
      const dt = show(txt);
      if (ART_RESTYLE && !isJP(dt) && [...dt].length > 4) {
        // long Latin words run sideways (rotated) on the light box, like the neon blades
        g.save(); g.translate(W / 2, H / 2); g.rotate(Math.PI / 2);
        textCentered(g, dt, 0, 4, FONTS.bahn, 900, H - 120, 104, s.fg);
        g.restore();
      } else textVertical(g, dt, W / 2, 52, H - 52, isJP(dt) ? FONTS.goth : FONTS.bahn, 900, isJP(dt) ? 112 : 92, s.fg);
      // small latin sub-text in bands
      g.fillStyle = s.bg; g.font = `700 15px ${FONTS.bahn}`; g.textAlign = 'center'; g.fillText('SINCE 2079', W / 2, 18);
    }), 1, { text: txt });
  });
  // canvas light boxes – horizontal fascia (shop name + sub line)
  // shop names of the restyle's own harbour-district brand set (shared with the generated ads / posters / light boxes)
  const fasc = [['麺屋 黒潮', 'RAMEN · KUROSHIO'], ['居酒屋 灯', 'IZAKAYA AKARI'], ['カラオケ', 'KARAOKE ECHO FIN'], ['AMEDROP', 'DRUG & BEAUTY 薬'], ['寿司 波止場', 'SUSHI HATOBA'], ['焼肉 鉄火', 'YAKINIKU'],
    ['RAINMART', 'OPEN 24 HOURS'], ['ゲームハイブ', 'GAME HIVE'], ['パチンコ 流星', 'PACHINKO'], ['中華 青龍', 'CHINESE'], ['喫茶 雨音', 'COFFEE'], ['質 波屋', 'PAWN SHOP'],
    ['HARBOR POD', 'HOTEL · NEST 8'], ['シナプス義体院', 'SYNAPSE+ CLINIC'], ['うどん 潮', 'UDON'], ['餃子 汐', 'GYOZA'], ['BYTE DEN', 'NET CAFE'], ['立呑み 港', 'STANDING BAR']];
  // restyle: English name first, the Japanese name (if any) moves to the small sub line
  const FASC_R = {
    '麺屋 黒潮': ['KUROSHIO', 'RAMEN · 麺屋 黒潮'], '居酒屋 灯': ['AKARI', 'BAR & GRILL · 灯'], 'カラオケ': ['ECHO FIN', 'KARAOKE BOXES'],
    '寿司 波止場': ['HATOBA', 'SUSHI · 寿司'], '焼肉 鉄火': ['TEKKA', 'BBQ GRILL'], 'ゲームハイブ': ['GAME HIVE', 'ARCADE · VR'],
    'パチンコ 流星': ['RYUSEI', 'SLOTS · OPEN 24H'], '中華 青龍': ['BLUE DRAGON', 'WOK · NOODLES'], '喫茶 雨音': ['AMANE', 'COFFEE · 喫茶'],
    '質 波屋': ['NAMIYA', 'PAWN · LOANS'], 'シナプス義体院': ['SYNAPSE+', 'CHROME CLINIC'], 'うどん 潮': ['USHIO', 'NOODLE BAR'],
    '餃子 汐': ['SHIO', 'DUMPLINGS'], '立呑み 港': ['MINATO', 'STANDING BAR'],
  };
  fasc.forEach(([a, b], i) => {
    const s = schemes[(i * 5 + 3) % schemes.length];
    const W = 720, H = 160;
    const [ma, mb] = ART_RESTYLE && FASC_R[a] ? FASC_R[a] : [a, b];
    put(L.boxH, CA.add(W, H, (g) => {
      g.fillStyle = s.bg; g.fillRect(0, 0, W, H);
      g.fillStyle = s.band; g.fillRect(0, H - 20, W, 20);
      textCentered(g, ma, W / 2 - 50, 64, isJP(ma) ? FONTS.goth : FONTS.bahn, 900, W - 160, 96, s.fg);
      textCentered(g, mb, W / 2 - 50, 126, FONTS.bahn, 700, W - 240, 26, s.fg);
      g.fillStyle = s.band; g.beginPath(); g.arc(W - 72, 72, 52, 0, Math.PI * 2); g.fill();
      textCentered(g, [...ma][0], W - 72, 72, isJP(ma) ? FONTS.goth : FONTS.bahn, 900, 72, 64, s.bg);
    }), 1, { text: a });
  });
  // small tenant-directory boxes (stacked zakkyo building signs)
  const tenants = ART_RESTYLE
    ? ['BAR NOIR', 'PUB 23', 'DARTS', 'NAILS', 'TATTOO', 'LOANS', 'CLINIC 4F', 'MAHJONG', 'KARAOKE', 'LOUNGE', 'SNACK MAMA', 'DENTIST', 'TAROT', 'MASSAGE', 'GYM', 'PAWN', 'SALON', 'POOL', '雀荘', 'BAR 月']
    : ['スナック 恋', 'BAR 月', '麻雀 東', 'クラブ 蝶', 'マッサージ', '占い 星', '歯科', '質 屋', 'ラウンジ 華', '英会話', '整体', 'カラオケ', 'BAR NOIR', '鍼灸', 'PUB 23', '雀荘', '焼鳥 鳥八', 'ダーツ', 'SNACK MAMA', 'ネイル'];
  tenants.forEach((t, i) => {
    const s = schemes[(i * 7 + 1) % schemes.length];
    put(L.tenant, CA.add(300, 150, (g) => {
      g.fillStyle = s.bg; g.fillRect(0, 0, 300, 150);
      g.strokeStyle = s.band; g.lineWidth = 6; g.strokeRect(8, 8, 284, 134);
      textCentered(g, t, 150, 78, FONTS.goth, 800, 260, 80, s.fg);
    }), 1, { text: t });
  });
  // posters (painted)
  if (images.posters) {
    const im = images.posters, cw = im.width / 4, ch = im.height / 2;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) put(L.posters, CA.image(im, i * cw, j * ch, cw, ch, 256, 256), 3);
  }
  // video ads (screens)
  if (images.ads) {
    const im = images.ads, cw = im.width / 2, ch = im.height / 2;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) put(L.screens, CA.image(im, i * cw, j * ch, cw, ch, 300, 300), 5);
    // restyle: 2:1 landscape crops (centre band of each ad) for the wide street screens of podium stores
    if (ART_RESTYLE) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) put(L.screensWide, CA.image(im, i * cw, j * ch + ch * 0.25, cw, ch * 0.5, 400, 200), 5);
  }
  // misc: P parking, road signs, GOOD GAMES wall text, IZAKAYA 飲み屋 box, 24 sign
  L.misc.parking = put([], CA.add(256, 256, (g) => {
    g.fillStyle = '#1050d0'; roundRect(g, 0, 0, 256, 256, 28); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 8; roundRect(g, 12, 12, 232, 232, 20); g.stroke();
    textCentered(g, 'P', 128, 128, FONTS.arial, 900, 200, 200, '#ffffff');
  }), 1);
  L.misc.parkingSub = put([], CA.add(256, 512, (g) => {
    g.fillStyle = '#f5f5f5'; g.fillRect(0, 0, 256, 512);
    textVertical(g, '駐車場', 128, 30, 330, FONTS.goth, 900, 150, '#1050d0');
    g.fillStyle = '#1aa040'; g.fillRect(28, 360, 200, 120);
    textCentered(g, '空', 128, 420, FONTS.goth, 900, 120, 100, '#ffffff');
  }), 1);
  L.misc.goodgames = put([], CA.add(1024, 384, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 384);
    textCentered(g, 'GOOD GAMES', 512, 120, FONTS.bahn, 700, 960, 150, '#f4f2ee');
    textCentered(g, 'GOOD PEOPLE', 512, 280, FONTS.bahn, 700, 960, 150, '#f4f2ee');
  }), 3);
  L.misc.nomiya = put([], CA.add(700, 300, (g) => {
    g.fillStyle = ART_RESTYLE ? '#16161a' : '#f4eee0'; g.fillRect(0, 0, 700, 300);
    g.strokeStyle = '#a01010'; g.lineWidth = 10; g.strokeRect(10, 10, 680, 280);
    textCentered(g, ART_RESTYLE ? 'DRINKS' : '飲み屋', 350, 120, ART_RESTYLE ? FONTS.bahn : FONTS.mincho, 900, 600, 170, ART_RESTYLE ? '#f2efe8' : '#151010');
    textCentered(g, ART_RESTYLE ? '飲み屋 · IZAKAYA' : 'IZAKAYA', 350, 245, FONTS.bahn, 700, 400, 60, '#a01010');
  }), 1);
  L.misc.sign24 = put([], CA.add(256, 256, (g) => {
    g.fillStyle = '#101010'; g.fillRect(0, 0, 256, 256);
    textCentered(g, '24', 128, 110, FONTS.arial, 900, 220, 150, '#ffe040');
    textCentered(g, 'HOURS', 128, 210, FONTS.bahn, 700, 200, 46, '#ffffff');
  }), 1);
  L.misc.stop = put([], CA.add(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256); g.fillStyle = '#101010'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(10, 20); g.lineTo(246, 20); g.lineTo(128, 236); g.closePath(); g.fill();
    g.fillStyle = '#d01818'; g.beginPath(); g.moveTo(30, 32); g.lineTo(226, 32); g.lineTo(128, 214); g.closePath(); g.fill();
    textCentered(g, '止まれ', 128, 82, FONTS.goth, 900, 140, 50, '#ffffff');
  }), 3);
  L.misc.speed = put([], CA.add(256, 256, (g) => {
    g.fillStyle = '#101010'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill();
    g.fillStyle = '#d01818'; g.beginPath(); g.arc(128, 128, 118, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(128, 128, 92, 0, 7); g.fill();
    textCentered(g, '40', 128, 132, FONTS.bahn, 700, 140, 110, '#1040a0');
  }), 3);
  L.misc.crossing = put([], CA.add(256, 256, (g) => {
    g.fillStyle = '#1050c0'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(128, 26); g.lineTo(232, 214); g.lineTo(24, 214); g.closePath(); g.fill();
    g.fillStyle = '#101010'; g.beginPath(); g.arc(128, 96, 14, 0, 7); g.fill(); g.fillRect(118, 112, 20, 50);
    g.fillRect(100, 180, 56, 10);
  }), 3);
  L.misc.direction = put([], CA.add(768, 384, (g) => {
    g.fillStyle = '#1048b8'; g.fillRect(0, 0, 768, 384);
    g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(12, 12, 744, 360);
    g.fillStyle = '#fff'; g.fillRect(372, 60, 24, 300); g.beginPath(); g.moveTo(384, 30); g.lineTo(430, 90); g.lineTo(338, 90); g.closePath(); g.fill();
    g.fillRect(80, 220, 300, 24); g.beginPath(); g.moveTo(50, 232); g.lineTo(110, 190); g.lineTo(110, 274); g.closePath(); g.fill();
    textCentered(g, '新宿', 200, 140, FONTS.goth, 800, 220, 90, '#fff'); textCentered(g, 'Shinjuku', 200, 300, FONTS.bahn, 600, 220, 40, '#fff');
    textCentered(g, '神田川', 590, 140, FONTS.goth, 800, 260, 90, '#fff'); textCentered(g, 'Kandagawa', 590, 220, FONTS.bahn, 600, 260, 40, '#fff');
    textCentered(g, '未来港', 590, 300, FONTS.goth, 800, 260, 70, '#fff');
  }), 3);
  // pedestrian signal icons (red standing man, green walking man) 2 cells
  const pedIcon = (walk) => (g) => {
    g.fillStyle = '#050505'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = walk ? '#30ffd0' : '#ff2a18';
    g.beginPath(); g.arc(64, 26, 12, 0, 7); g.fill();
    g.lineCap = 'round'; g.strokeStyle = g.fillStyle; g.lineWidth = 14;
    g.beginPath();
    if (walk) { g.moveTo(64, 44); g.lineTo(58, 80); g.lineTo(40, 112); g.moveTo(58, 80); g.lineTo(80, 110); g.moveTo(62, 52); g.lineTo(40, 72); g.moveTo(62, 52); g.lineTo(86, 70); }
    else { g.moveTo(64, 44); g.lineTo(64, 82); g.moveTo(56, 82); g.lineTo(54, 118); g.moveTo(72, 82); g.lineTo(74, 118); g.moveTo(60, 50); g.lineTo(46, 84); g.moveTo(68, 50); g.lineTo(82, 84); }
    g.stroke();
  };
  L.misc.pedR = put([], CA.add(128, 128, pedIcon(false)), 1);
  L.misc.pedG = put([], CA.add(128, 128, pedIcon(true)), 1);
  // lantern kanji cells (ink mask drawn black on white) – used by lantern material
  L.lanternCells = {};
  const lanternTexts = ['ら', 'ー', 'め', 'ん', '居', '酒', '屋', '祭', '焼鳥', '赤提灯', 'やきとり', '酒', '提灯', '御食事', '串'];
  for (const t of new Set(lanternTexts)) {
    const n = [...t].length;
    const H = n >= 3 ? 512 : 256;
    L.lanternCells[t] = CA.add(256, H, (g) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, H);
      if (n === 1) textCentered(g, t, 128, 128, FONTS.mincho, 900, 200, 200, '#000');
      else textVertical(g, t, 128, 14, H - 14, FONTS.mincho, 900, n >= 3 ? 180 : 120, '#000');
    });
  }
  // brand logo glyph & holo text ring
  L.misc.holoRing = put([], CA.add(2048, 160, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 2048, 160);
    const txt = '  ようこそ 港の夜へ  ◆  WELCOME  ◆  RIDE THE STORM  ◆  TSUBAME E-MOTO  ◆ ';
    textCentered(g, txt, 1024, 80, FONTS.goth, 800, 2000, 110, '#ffffff');
  }), 3);

  console.log(`[signage] atlas usage neon ${NA.packer.y + NA.packer.rowH}/${NA.S}px, colour ${CA.packer.y + CA.packer.rowH}/${CA.S}px`);
  return { L, neonTex: NA.texture(), colorTex: CA.texture(), NA, CA };
}
