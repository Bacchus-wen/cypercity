import { Engine } from './engine/Engine.js';
import { SYSTEMS } from './systems/index.js';

const loading = document.getElementById('loading');
const fill = loading.querySelector('.fill');
const label = loading.querySelector('.label');

const engine = new Engine(document.getElementById('app'));
await engine.init(SYSTEMS, (p, name) => {
  fill.style.width = `${(p * 100).toFixed(0)}%`;
  label.textContent = name.toUpperCase();
});
label.textContent = 'WARMING UP';
for (let i = 0; i < 2; i++) { engine.postfx.render(); await new Promise((r) => requestAnimationFrame(r)); }
loading.classList.add('done');
engine.start();
