import * as THREE from 'three/webgpu';
import { velocity } from 'three/tsl';
import RAPIER from '@dimforge/rapier3d-compat';
import { StableClusteredLighting } from './StableClusteredLighting.js';
import { ANIME, installAnimeLighting } from './AnimeLook.js';
import { LAYOUT, SHOT_VIEWS } from '../world/layout.js';
import { Assets } from './Assets.js';
import { Input } from './Input.js';
import { PostFX } from './PostFX.js';
import { TOD_PRESET } from './timeOfDay.js';

// Core engine. Systems are plain objects: { name, async init(ctx), update(dt, t, ctx), postUpdate?(dt, t, ctx) }.
// ctx is the shared context passed to every system (see below). Systems must only touch their own content.
export class Engine {
  constructor(container) {
    this.container = container;
    this.systems = [];
    const qs = new URLSearchParams(location.search);
    this.shot = qs.get('shot');
    this.shotFrames = parseInt(qs.get('frames') || '90', 10);
    this.quality = qs.get('q') || 'ultra';
  }

  async init(systems, onProgress = () => {}) {
    if (ANIME) installAnimeLighting(); // must precede any material build
    const renderer = new THREE.WebGPURenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(this.shot ? 1 : Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.NoToneMapping; // tone mapping is done in PostFX
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    // Clustered lighting supports hundreds of point lights (neon, lanterns, street lamps). ?lighting=resize restores
    // three's original node, whose grid (and every lit shader) is rebuilt on each canvas resize.
    renderer.lighting = new StableClusteredLighting(new URLSearchParams(location.search).get('lighting') === 'resize');
    this.container.appendChild(renderer.domElement);
    await renderer.init();
    if (!renderer.backend.isWebGPUBackend) console.warn('[engine] WebGPU unavailable, running on WebGL2 fallback');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);
    const sp = LAYOUT.spawn.position;
    camera.position.set(sp[0], sp[1], sp[2]);
    scene.add(camera);

    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.timer = new THREE.Timer();
    this.time = 0;
    this.frame = 0;

    this.ctx = {
      THREE, renderer, scene, camera, engine: this,
      physics: { RAPIER, world },
      layout: LAYOUT,
      assets: new Assets(renderer),
      input: new Input(renderer.domElement, !!this.shot),
      isShot: !!this.shot,
      quality: this.quality,
      // Global weather state shared by materials/particles/audio. Systems read these values each frame.
      weather: { rain: TOD_PRESET?.weather.rain ?? 1.0, wetness: TOD_PRESET?.weather.wetness ?? 1.0, wind: new THREE.Vector2(0.6, -0.25), lightning: 0 },
      // Uniform-style shared time for TSL shaders: import { time } from 'three/tsl' is also available.
      cameraMode: this.shot ? 'shot' : 'player',
      // Simple event bus
      events: new EventTarget(),
      // Systems can expose APIs here by name, e.g. ctx.api.vehicles.spawnTraffic()
      api: {},
      postfx: null,
    };

    this.postfx = new PostFX(renderer, scene, camera, this.ctx);
    this.ctx.postfx = this.postfx;

    for (let i = 0; i < systems.length; i++) {
      const s = systems[i];
      const t0 = performance.now();
      try {
        await s.init?.(this.ctx);
      } catch (e) {
        console.error(`[engine] system "${s.name}" failed to init`, e);
        s._failed = true;
      }
      console.log(`[engine] ${s.name} init ${(performance.now() - t0).toFixed(0)}ms`);
      this.systems.push(s);
      onProgress((i + 1) / systems.length, s.name);
    }

    this.postfx.build();

    if (this.shot) this.applyShotView(this.shot);

    window.addEventListener('resize', () => this.resize());
    window.__engine = this;
    window.__ctx = this.ctx;

    await this.precompile(onProgress);
  }

  // Compile every pipeline the game will use, asynchronously, before the first frame.
  // Pipelines are keyed by render context (target formats + MRT + render call depth), so each pass must be compiled
  // against the exact context it renders with, and with frustum culling off so objects outside the initial view are
  // included too. Systems with extra scene passes (river reflection, rain heightfield) compile them in their
  // precompile(ctx) hook via ctx.engine.compilePass(). (?pc=legacy restores the old single-pass precompile.)
  async precompile(onProgress) {
    const { renderer, scene, camera } = this;
    const t0 = performance.now();
    const sp = this.postfx.scenePass;
    const legacy = new URLSearchParams(location.search).get('pc') === 'legacy';
    // Call depth of the scene pass inside the PostFX graph (nested passes, e.g. the river reflector, are one deeper).
    this.sceneDepth = legacy ? 0 : this._sceneDepth();
    // The clustered lights node builds its light-culling compute only on its first render, and that compute's cache
    // key is part of every lit object's cache key (so every object would be rebuilt on the first frame). Build it now
    // at the real drawing-buffer size so we compile with the keys used at runtime.
    if (!legacy) renderer.lighting.getNode?.(scene)?.updateProgram?.(renderer);
    const culled = [];
    scene.traverse((o) => { if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    // compileAsync() awaits each GPU pipeline before building the next object's shaders. Collect the pipeline
    // promises instead so the GPU compiles them on its worker threads while JS keeps building node graphs.
    const pending = [];
    const pipes = renderer._pipelines;
    const getForRender = pipes.getForRender;
    if (!legacy) pipes.getForRender = function (ro, promises = null) { return getForRender.call(this, ro, promises ? pending : null); };
    let base = 0;
    this.compilePass = async (sc, cam, { renderTarget = null, mrt = null, callDepth = 0, label = '', weight = 0 } = {}) => {
      const b = base; base += weight;
      await this._compilePass(sc, cam, { renderTarget, mrt, callDepth: legacy ? 0 : callDepth }, (e) => {
        onProgress(b + weight * (e.total ? e.loaded / e.total : 1), `compiling shaders · ${label} ${e.loaded}/${e.total}`);
      });
    };
    try {
      // TRAA points the velocity node at its unjittered projection matrix while the scene pass renders: an extra
      // uniform in every shader that is not part of the cache key, so it must be the very same matrix object.
      if (!legacy && this.postfx.traa) velocity.setProjectionMatrix(this.postfx.traa._originalProjectionMatrix);
      try {
        await this.compilePass(scene, camera, { renderTarget: sp.renderTarget, mrt: sp.getMRT(), callDepth: this.sceneDepth, label: 'city', weight: 0.6 });
      } finally {
        velocity.setProjectionMatrix(null);
      }
      if (!legacy) await this.precompileSystems();
      onProgress(0.98, 'linking shaders');
      await Promise.all(pending);
    } catch (e) {
      console.warn('[engine] precompile failed', e);
    } finally {
      delete pipes.getForRender;
      for (const o of culled) o.frustumCulled = true;
    }
    console.log(`[engine] shader precompile ${(performance.now() - t0).toFixed(0)}ms (${pipes.caches.size} pipelines, scene pass depth ${this.sceneDepth})`);
    this._pipelinesAfterPrecompile = pipes.caches.size;
  }

  async precompileSystems() {
    for (const s of this.systems) {
      if (s._failed || !s.precompile) continue;
      try { await s.precompile(this.ctx); } catch (e) { console.warn(`[engine] ${s.name}.precompile failed`, e); }
    }
  }

  // Which render call depth does the scene pass run at? It depends on the PostFX node graph (the ?pfx= debug flags
  // change it). Render one PostFX frame with the scene hidden (only the fullscreen passes and the background draw)
  // and note the depth at which the scene pass target is bound.
  _sceneDepth() {
    const { renderer, scene } = this;
    const target = this.postfx.scenePass.renderTarget;
    const contexts = renderer._renderContexts;
    const get = contexts.get;
    let depth = null;
    contexts.get = function (rt, mrt, d = 0) { if (rt === target && depth === null) depth = d; return get.call(this, rt, mrt, d); };
    const visible = scene.visible;
    scene.visible = false;
    try {
      this.postfx.render();
    } catch (e) {
      console.warn('[engine] scene pass depth probe failed', e);
    } finally {
      scene.visible = visible;
      delete contexts.get;
    }
    return depth ?? 1;
  }

  // renderer.compileAsync() always looks up the call-depth-0 render context, but the render context id is part of
  // every render object's cache key: a pass that renders nested (depth > 0) would rebuild all of its shaders on the
  // first frame. Point the lookup at the pass's real depth while compileAsync() resolves its context (synchronously,
  // before its first await).
  async _compilePass(scene, camera, { renderTarget, mrt, callDepth }, onProgress) {
    const { renderer } = this;
    const contexts = renderer._renderContexts;
    const get = contexts.get;
    const prevRT = renderer.getRenderTarget(), prevMRT = renderer.getMRT();
    renderer.setRenderTarget(renderTarget);
    renderer.setMRT(mrt);
    contexts.get = function (rt, m) { return get.call(this, rt, m, callDepth); };
    // With scene.overrideMaterial, renderObject() puts each object's own state (positionNode, alphaTest, side...) on the
    // shared override material and restores it right after queueing the object, i.e. before compileAsync() builds it.
    // Queue a snapshot instead so the shader matches what the real pass will build for that object.
    const override = scene.overrideMaterial;
    if (override) {
      const create = renderer._createObjectPipeline;
      renderer._createObjectPipeline = function (object, material, ...rest) {
        return create.call(this, object, material === override ? override.clone() : material, ...rest);
      };
    }
    let compiling;
    try {
      compiling = renderer.compileAsync(scene, camera, null, onProgress);
    } finally {
      delete contexts.get;
      if (override) delete renderer._createObjectPipeline;
    }
    // While compileAsync() walks the objects it runs their nodes' updateBefore hooks, and the river reflector would
    // really render the whole scene there (at a call depth it never uses at runtime). Its pass is compiled on its own.
    renderer.render = () => {};
    try {
      await compiling;
    } finally {
      delete renderer.render;
      renderer.setRenderTarget(prevRT);
      renderer.setMRT(prevMRT);
    }
  }

  applyShotView(name) {
    const v = SHOT_VIEWS[name];
    if (!v) { console.error('[engine] unknown shot view', name); return; }
    this.camera.position.set(...v.pos);
    this.camera.fov = v.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(new THREE.Vector3(...v.look));
    this.ctx.cameraMode = 'shot';
    document.body.classList.add('shot');
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  start() {
    const step = 1 / 60;
    let acc = 0;
    this.renderer.setAnimationLoop(() => {
      // Deterministic timestep in shot mode so screenshots are reproducible
      this.timer.update();
      const dt = this.shot ? step : Math.min(this.timer.getDelta(), 0.1);
      this.time += dt;
      acc += dt;
      while (acc >= step) {
        this.ctx.physics.world.timestep = step;
        this.ctx.physics.world.step();
        acc -= step;
      }
      for (const s of this.systems) if (!s._failed && s.update) {
        try { s.update(dt, this.time, this.ctx); } catch (e) { console.error(`[engine] ${s.name}.update`, e); s._failed = true; }
      }
      for (const s of this.systems) if (!s._failed && s.postUpdate) s.postUpdate(dt, this.time, this.ctx);
      if (this.shot) this.applyShotView(this.shot);
      this.ctx.input.endFrame();
      this.postfx.render(dt);
      this.frame++;
      if (this.frame === 5 && this._pipelinesAfterPrecompile) console.log(`[engine] pipelines built after precompile: ${this.renderer._pipelines.caches.size - this._pipelinesAfterPrecompile}`);
      if (this.shot && this.frame === this.shotFrames) window.__shotReady = true;
    });
  }
}
