import { Vector2 } from 'three/webgpu';
import { ClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js';
import ClusteredLightsNode from 'three/addons/tsl/lighting/ClusteredLightsNode.js';
import { Fn, int, float, uniform, renderGroup, screenCoordinate, positionView, log, clamp } from 'three/tsl';

const _size = /*@__PURE__*/ new Vector2();

// three's ClusteredLightsNode sizes its cluster grid to the drawing buffer and bakes the grid dimensions into every
// lit shader. Any canvas resize (window resize, fullscreen) therefore re-creates the grid, changes the lights node's
// cache key and rebuilds every lit material in the game, which freezes it for tens of seconds.
//
// This variant builds the grid once, large enough for the biggest drawing buffer this screen can produce, and maps
// fragments to tiles in proportion to the current drawing buffer instead of in fixed 32 px steps. The light-culling
// compute is unchanged (its clusters already span NDC uniformly), so shading is the same at any size; only a drawing
// buffer larger than the grid (e.g. a bigger monitor) still rebuilds it, as before.
class StableClusteredLightsNode extends ClusteredLightsNode {

  static get type() { return 'StableClusteredLightsNode'; }

  constructor(...args) {
    super(...args);
    // tiles per drawing-buffer pixel (grid size / drawing buffer size), updated every render
    this._tileScale = uniform(new Vector2(1 / this.tileSize, 1 / this.tileSize)).setName('clusteredTileScale').setGroup(renderGroup);
  }

  updateProgram(renderer) {
    renderer.getDrawingBufferSize(_size);
    const { width, height } = _size;
    if (this._bufferSize === null || width > this._bufferSize.width || height > this._bufferSize.height) {
      const pr = renderer.getPixelRatio();
      const sw = typeof screen !== 'undefined' ? screen.width * pr : 0;
      const sh = typeof screen !== 'undefined' ? screen.height * pr : 0;
      this.create(this.getBufferFitSize(Math.max(width, sw)), this.getBufferFitSize(Math.max(height, sh)));
    }
    const NX = Math.floor(this._bufferSize.width / this.tileSize);
    const NY = Math.floor(this._bufferSize.height / this.tileSize);
    this._tileScale.value.set(NX / Math.max(1, width), NY / Math.max(1, height));
    return this;
  }

  create(width, height) {
    super.create(width, height);
    // Same cluster index as three's, except the screen tile is derived from the drawing-buffer fraction.
    const NX = Math.floor(width / this.tileSize);
    const NY = Math.floor(height / this.tileSize);
    const NZ = this.zSlices;
    const index = Fn(() => {
      const screenTile = screenCoordinate.mul(this._tileScale).floor();
      const viewDepth = positionView.z.negate();
      const invLogFarOverNear = float(1).div(log(this._cameraFar.div(this._cameraNear)));
      const sliceFloat = log(viewDepth.div(this._cameraNear)).mul(invLogFarOverNear).mul(float(NZ));
      const zSlice = clamp(sliceFloat.floor(), float(0), float(NZ - 1));
      return int(screenTile.x)
        .add(int(screenTile.y).mul(int(NX)))
        .add(int(zSlice).mul(int(NX * NY)));
    });
    this._screenClusterIndex = index().toVar();
  }

}

export class StableClusteredLighting extends ClusteredLighting {

  constructor(original = false, ...args) {
    super(...args);
    this.original = original;
  }

  createNode(lights = []) {
    const Node = this.original ? ClusteredLightsNode : StableClusteredLightsNode;
    return new Node(this.maxLights, this.tileSize, this.zSlices, this.maxLightsPerCluster).setLights(lights);
  }

}
