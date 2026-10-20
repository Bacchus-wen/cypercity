// Anime / cel look, enabled with ?look=anime (the photoreal look stays the default for side-by-side comparison).
//
// 1. AnimeLightingModel replaces three's PhysicalLightingModel in every MeshStandard/MeshPhysical node material, so the
//    whole city changes in one place. Direct light is banded: a hard terminator, plus light intensity posterized in
//    log2 steps so lamp and neon pools get crisp rings instead of smooth falloff; specular becomes hard-edged shapes
//    that only glossy surfaces (wet ground, paint, glass) reach. The clustered point lights (all the neon) go through
//    direct() as well, so they are banded too.
//    direct() also runs inside the clustered light loop, whose early Break makes control flow non-uniform: WGSL forbids
//    derivatives (fwidth) there, so band edges use fixed-width smoothing.
// 2. animeStylize() is a screen-space pass on the HDR scene colour before TRAA (so TRAA anti-aliases the lines):
//    a Kuwahara filter flattens photographic texture detail into paint-like blocks, and ink outlines come from depth
//    and normal discontinuities (depth is tested on 1/z, which is linear across planes in screen space, so grazing
//    ground does not produce false lines).
import { Material, MeshStandardNodeMaterial, MeshPhysicalNodeMaterial, PhysicalLightingModel } from 'three/webgpu';
import {
  Fn, float, vec2, vec3, vec4, uniform, normalView, positionViewDirection, BRDF_GGX, BRDF_Lambert, diffuseContribution,
  specularColorBlended, roughness, luminance, materialReference, smoothstep, floor, fract, exp2, log2, max, min, mix, screenUV, screenSize,
  convertToTexture, perspectiveDepthToViewZ, unpackRGBToNormal, abs, dot, clamp, select, length,
} from 'three/tsl';

export const ANIME = typeof location !== 'undefined' && new URLSearchParams(location.search).get('look') === 'anime';

export const animeParams = {
  // lighting
  terminator: uniform(0.04),       // N·L where a light switches on
  terminatorSoft: uniform(0.035),  // half width of the terminator edge
  bandsPerOctave: uniform(0.75),   // total-irradiance posterize steps per doubling (few, wide bands)
  bandSoft: uniform(0.12),         // edge width of an irradiance band (in steps)
  specThreshold: uniform(0.3),     // GGX value above which a highlight shape appears
  specPeak: uniform(0.9),
  shadowFloor: uniform(0.025),     // lowest irradiance band (keeps dark forms readable)
  figureFloor: uniform(0.07),      // higher floor for characters and vehicles: never a black silhouette
  shadeTint: uniform(vec3(0.82, 0.74, 1.12)), // designed shadow colour: the dark band shifts to violet, not just darker
  rimColor: uniform(vec3(0.55, 0.38, 1.0)),
  rimIntensity: uniform(1.4),      // hard rim light on characters and vehicles (material.animeRim = 1)
  rimStart: uniform(0.62),         // 1 - N·V where the rim begins
  // stylized key light for characters and vehicles (animeRim = 1): fixed in view space, upper left front, so every
  // figure gets a readable lit side and shadow side regardless of the neon around it
  keyDir: uniform(vec3(-0.45, 0.62, 0.64)),
  keyColor: uniform(vec3(0.85, 0.62, 1.0)),
  keyIntensity: uniform(0.55),
  // ground albedo posterize (wet.js): steps per doubling of albedo luminance
  groundBands: uniform(1.1),
  // outlines
  lineWidth: uniform(1.0),         // px
  lineDepth: uniform(0.012),       // 1/z laplacian threshold (relative)
  lineNormal: uniform(0.45),       // 1 - N·N' threshold for creases
  lineFadeStart: uniform(35),      // m
  lineFadeEnd: uniform(150),       // m
  lineDepthInside: uniform(6),     // depth threshold multiplier inside foliage (only large jumps between clusters)
  lineStrength: uniform(0.92),
  inkColor: uniform(vec3(0.010, 0.004, 0.018)),
  // paint filter
  kuwahara: uniform(1.0),          // 0 = off, 1 = on
  kuwaharaK: uniform(14),          // sector selectivity (higher = flatter, more painterly)
  // reflections (SSR) as colour blocks
  reflBands: uniform(0.8),         // steps per doubling of reflected luminance
  reflIntensity: uniform(0.75),
};

// floor() with a fixed-width smooth step into the next integer (no derivatives: see header).
const softFloor = (x, w) => floor(x).add(smoothstep(float(1).sub(w), float(1), fract(x)));

class AnimeLightingModel extends PhysicalLightingModel {
  direct({ lightDirection, lightColor, reflectedLight }) {
    const P = animeParams;
    const dotNL = normalView.dot(lightDirection);
    const lit = smoothstep(P.terminator.sub(P.terminatorSoft), P.terminator.add(P.terminatorSoft), dotNL);
    const irradiance = lightColor.mul(lit).toVar();
    reflectedLight.directDiffuse.addAssign(irradiance.mul(BRDF_Lambert({ diffuseColor: diffuseContribution })));
    // hard highlight shapes, tinted by the specular colour (metals keep their hue)
    const ggx = BRDF_GGX({ lightDirection, f0: specularColorBlended, f90: 1, roughness });
    // highlight shapes only on genuinely glossy surfaces (puddles, paint, glass): the threshold rises with roughness,
    // so dull wet ground near a lamp no longer gets a hard orange blob
    // figures (characters, vehicles) use their per-material threshold, everything else a roughness-driven one
    const figure = materialReference('animeRim', 'float');
    const envTh = mix(float(1), float(5), smoothstep(0.15, 0.45, roughness));
    const th = P.specThreshold.mul(mix(envTh, materialReference('animeSpecTh', 'float'), figure));
    const hard = smoothstep(th.mul(0.8), th.mul(1.25), luminance(ggx));
    const tint = specularColorBlended.div(luminance(specularColorBlended).max(0.02)).min(vec3(1.5));
    reflectedLight.directSpecular.addAssign(irradiance.mul(hard).mul(P.specPeak).mul(tint));
  }

  // After every light (direct, clustered neon, ambient, environment) has been added: posterize the total diffuse
  // irradiance into a few wide log2 bands, keeping hue and albedo, so each surface shows only a few flat values.
  finish(builder) {
    const P = animeParams;
    const { directDiffuse, indirectDiffuse, directSpecular, indirectSpecular } = builder.context.reflectedLight;
    const diffuse = directDiffuse.add(indirectDiffuse);
    const irradiance = luminance(diffuse.div(diffuseContribution.max(vec3(1e-3)))).max(1e-5);
    const k = P.bandsPerOctave;
    const matFloor = materialReference('animeFloor', 'float');
    const floorIrr = select(matFloor.greaterThanEqual(0), matFloor, mix(P.shadowFloor, P.figureFloor, materialReference('animeRim', 'float')));
    const banded = max(exp2(softFloor(log2(irradiance).mul(k), P.bandSoft).div(k)), floorIrr);
    // hard rim light separates characters and vehicles from the background (scaled so black paint still shows it)
    const facing = float(1).sub(normalView.dot(positionViewDirection).clamp());
    const rim = smoothstep(P.rimStart, P.rimStart.add(0.06), facing).mul(materialReference('animeRim', 'float'));
    const rimLight = P.rimColor.mul(rim).mul(P.rimIntensity).mul(diffuseContribution.add(0.05));
    const figure = materialReference('animeRim', 'float');
    const keyLit = smoothstep(0.08, 0.16, normalView.dot(P.keyDir.normalize()));
    const keyLight = P.keyColor.mul(keyLit).mul(P.keyIntensity).mul(figure).mul(diffuseContribution.add(0.03));
    // designed shade colour: pixels in the lowest bands take a violet shade instead of a plain darker albedo
    const shade = float(1).sub(smoothstep(floorIrr.mul(1.5), floorIrr.mul(4), banded));
    const toon = diffuse.mul(banded.div(irradiance)).mul(mix(vec3(1), P.shadeTint, shade));
    builder.context.outgoingLight.assign(toon.add(rimLight).add(keyLight).add(directSpecular).add(indirectSpecular));
    super.finish(builder);
  }
}

export function installAnimeLighting() {
  // per-material outline control, written to the scene pass MRT (see PostFX): 1 = no inner crease lines (foliage)
  Material.prototype.lineMask = 0;
  Material.prototype.animeRim = 0; // 1 = hard rim light (characters, vehicles)
  Material.prototype.animeFloor = -1; // >= 0: per-material lowest irradiance band
  Material.prototype.animeSpecTh = 1; // per-material highlight threshold multiplier (figures)
  MeshStandardNodeMaterial.prototype.setupLightingModel = function () { return new AnimeLightingModel(); };
  MeshPhysicalNodeMaterial.prototype.setupLightingModel = function () {
    return new AnimeLightingModel(this.useClearcoat, this.useSheen, this.useIridescence, this.useAnisotropy, this.useTransmission, this.useDispersion, this.useRetroreflection);
  };
}

// color: HDR scene colour node; depthTex / normalTex: scene pass MRT texture nodes (normal packed to RGB); camera: the
// scene camera (this runs in a fullscreen quad pass, where cameraNear/cameraFar would be the quad's camera).
export function animeStylize({ color, depthTex, normalTex, metalRough, camera }) {
  const P = animeParams;
  const near = uniform(camera.near), far = uniform(camera.far);
  const src = convertToTexture(color);
  const px = vec2(1).div(screenSize);

  // --- generalized Kuwahara: 8 smooth, overlapping sectors on a disc (no blocky squares like the 4-quadrant box
  // version). Sector and radial weights depend only on the sample offset, so they are baked as constants; each sector
  // is weighted by 1 / (1 + (k*variance)^4) of its log-luminance, which strongly prefers the flattest sector.
  const kuwahara = Fn(() => {
    const uv = screenUV;
    const R = 4, SECTORS = 8, sigma = R * 0.5;
    const acc = [];
    for (let k = 0; k < SECTORS; k++) acc.push({ c: vec3(0).toVar(), l: float(0).toVar(), l2: float(0).toVar(), w: 0 });
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        const r2 = x * x + y * y;
        if (r2 > R * R) continue;
        const radial = Math.exp(-r2 / (2 * sigma * sigma));
        const ang = Math.atan2(y, x);
        const c = src.sample(uv.add(px.mul(vec2(x, y)))).rgb;
        const l = log2(luminance(c).add(0.01));
        const l2 = l.mul(l);
        for (let k = 0; k < SECTORS; k++) {
          const lobe = r2 === 0 ? 1 / SECTORS : Math.max(0, Math.cos(ang - (k * 2 * Math.PI) / SECTORS)) ** 4;
          const w = radial * lobe;
          if (w < 1e-3) continue;
          acc[k].c.addAssign(c.mul(w)); acc[k].l.addAssign(l.mul(w)); acc[k].l2.addAssign(l2.mul(w));
          acc[k].w += w;
        }
      }
    }
    const out = vec3(0).toVar();
    const wsum = float(0).toVar();
    for (const a of acc) {
      const mean = a.c.div(a.w);
      const mL = a.l.div(a.w);
      const v = a.l2.div(a.w).sub(mL.mul(mL)).max(0);
      const alpha = float(1).div(float(1).add(v.mul(P.kuwaharaK).pow(4)));
      out.addAssign(mean.mul(alpha));
      wsum.addAssign(alpha);
    }
    return mix(src.sample(uv).rgb, out.div(wsum), P.kuwahara);
  })();

  // --- ink outlines from depth (1/z laplacian) and normal creases --------------------------------------------------
  const lines = Fn(() => {
    const uv = screenUV;
    const invZ = (u) => float(1).div(perspectiveDepthToViewZ(depthTex.sample(u).r, near, far).negate().max(1e-3));
    const nrm = (u) => unpackRGBToNormal(normalTex.sample(u).rgb);
    const o = px.mul(P.lineWidth);
    const ox = vec2(o.x, 0), oy = vec2(0, o.y);
    const wc = invZ(uv);
    const lapX = abs(invZ(uv.add(ox)).add(invZ(uv.sub(ox))).sub(wc.mul(2)));
    const lapY = abs(invZ(uv.add(oy)).add(invZ(uv.sub(oy))).sub(wc.mul(2)));
    const mask = (u) => metalRough.sample(u).b;
    const inside = mask(uv).mul(min(min(mask(uv.add(ox)), mask(uv.sub(ox))), min(mask(uv.add(oy)), mask(uv.sub(oy)))));
    const thr = mix(P.lineDepth, P.lineDepth.mul(P.lineDepthInside), inside);
    const dEdge = smoothstep(thr, thr.mul(2), max(lapX, lapY).div(wc));
    const nc = nrm(uv);
    const crease = max(
      max(float(1).sub(dot(nc, nrm(uv.add(ox)))), float(1).sub(dot(nc, nrm(uv.sub(ox))))),
      max(float(1).sub(dot(nc, nrm(uv.add(oy)))), float(1).sub(dot(nc, nrm(uv.sub(oy))))),
    );
    const nEdgeRaw = smoothstep(P.lineNormal, P.lineNormal.mul(1.5), crease).mul(float(1).sub(metalRough.sample(uv).b));
    const dist = float(1).div(wc);
    const fade = float(1).sub(smoothstep(P.lineFadeStart, P.lineFadeEnd, dist));
    // line hierarchy: inner crease lines drop out well before silhouettes do
    const nEdge = nEdgeRaw.mul(float(1).sub(smoothstep(P.lineFadeStart.mul(0.4), P.lineFadeStart.mul(1.2), dist)));
    return clamp(max(dEdge, nEdge).mul(fade).mul(P.lineStrength), 0, 1);
  })();

  // ink: darken towards a deep violet rather than pure black
  return vec4(mix(kuwahara, kuwahara.mul(0.06).add(P.inkColor), lines), 1);
}

// SSR as flat colour blocks: posterize reflected luminance in log2 steps, keep hue (replaces the photoreal
// vertical streak filter, which smeared reflections into long brush strokes).
export function animeReflection(ssrTex, depthTex, camera) {
  const P = animeParams;
  const px = vec2(2).div(screenSize); // one SSR texel (SSR runs at half resolution)
  const near = uniform(camera.near), far = uniform(camera.far);
  const viewDepth = (u) => perspectiveDepthToViewZ(depthTex.sample(u).r, near, far).negate();
  return Fn(() => {
    // 3x3 depth-guided (bilateral) denoise: neighbours on a different surface do not bleed into the reflection,
    // which is what turned block edges into bead strings
    const zc = viewDepth(screenUV);
    const cc = ssrTex.sample(screenUV).rgb;
    const lc = log2(luminance(cc).add(0.01));
    const c = vec3(0).toVar();
    const wsum = float(0).toVar();
    for (let y = -1; y <= 1; y++) {
      for (let x = -1; x <= 1; x++) {
        const u = screenUV.add(px.mul(vec2(x, y)));
        const cs = ssrTex.sample(u).rgb;
        // depth keeps the receiving surface apart, colour keeps edges inside the reflected image apart
        const w = x === 0 && y === 0 ? float(1)
          : exp2(abs(viewDepth(u).sub(zc)).div(zc.mul(0.02)).add(abs(log2(luminance(cs).add(0.01)).sub(lc)).mul(1.5))
            .add(length(cs.div(luminance(cs).add(0.01)).sub(cc.div(luminance(cc).add(0.01)))).mul(2)).negate());
        c.addAssign(cs.mul(w));
        wsum.addAssign(w);
      }
    }
    const avg = c.div(wsum);
    const l = luminance(avg).max(1e-5);
    const k = P.reflBands;
    const q = exp2(softFloor(log2(l).mul(k), float(0.15)).div(k));
    return avg.mul(q.div(l)).mul(P.reflIntensity);
  })();
}

// Flat-toned ground: posterize albedo luminance in log2 steps (keeps hue), so patches, wheel paths and stains become a
// few flat tones instead of mottled photo detail. Used by wet.js for every ground surface.
export function animeGroundAlbedo(albedo) {
  const P = animeParams;
  const l = luminance(albedo).max(1e-4);
  const q = exp2(softFloor(log2(l).mul(P.groundBands), float(0.1)).div(P.groundBands));
  return albedo.mul(q.div(l));
}

// Display-grade overrides for the anime look (cleaner, punchier: no grain / chromatic aberration, less haze).
export function applyAnimeGrade(params) {
  // bloom input is masked to emitted light (PostFX), so only light sources glow; only their bright cores bloom
  params.bloomStrength = 0.2;
  params.bloomThreshold = 1.1;
  params.bloomRadius = 0.3;
  params.grain.value = 0;
  params.chroma.value = 0;
  params.vignette.value = 0.22;
  params.anamorphic.value = 0;
  params.scatter.value = 0.03;
  params.streak.value = 0.45;
  params.saturation.value = 1.28;
  params.contrast.value = 0.55;
  params.hueKeep.value = 0.75;
  params.shadowTint.value.set(-0.010, -0.020, 0.050);
  params.highlightTint.value.set(0.985, 0.975, 1.03);
  params.lift.value.set(0.004, 0.002, 0.012);
}
