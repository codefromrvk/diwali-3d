import { mount, updateCamera, render } from './stage.js';
import { clock } from './time.js';
import { createWorld } from './world/index.js';
import { run, storyUpdate } from './story.js';

document.documentElement.classList.add('styled');
mount(document.getElementById('stage'));
const world = createWorld();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock.dt = dt;
  clock.t += dt;
  storyUpdate(dt);
  updateCamera();
  world.update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.fonts?.ready.finally(() => run(world));
if (!document.fonts) run(world);

if (import.meta.env.DEV) Promise.all([import('./stage.js'), import('./audio.js')]).then(([s, a]) => { window.__world = world; window.__stage = s; window.__audio = a; });
