import * as THREE from 'three';
import gsap from 'gsap';
import { shot, rig, fadeTo, pointer, rayFromPointer, toScreen, camera, reducedMotion, isMobile } from './stage.js';
import { clock } from './time.js';
import { audio, PHRASES } from './audio.js';
import { RANGOLI_CENTER } from './world/rangoli.js';

const $ = (s) => document.querySelector(s);
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const params = new URLSearchParams(location.search);
const clean = (s) => (s || '').replace(/[<>]/g, '').trim().slice(0, 40);
const TO = clean(params.get('to'));
const FROM = clean(params.get('from'));

// ------------------------------------------------------------------ UI
const ui = {
  caption: $('#caption'),
  prompt: $('#prompt'),
  next: $('#next'),
  hold: $('#hold'),
  holdFill: $('#hold .fill'),
  bars: $('#bars'),
  hud: $('#hud'),
  meter: [...document.querySelectorAll('#meter li')],
  finale: $('#finale'),
  tools: $('#tools'),
  toast: $('#toast'),
};

function words(el, text) {
  el.textContent = '';
  for (const w of text.split(/(\s+)/)) {
    const s = document.createElement('span');
    s.className = 'w';
    s.textContent = w;
    el.appendChild(s);
  }
  return el.querySelectorAll('.w');
}

async function caption(kicker, title, body = '') {
  await hideCaption();
  const c = ui.caption;
  const k = c.querySelector('.kicker');
  k.textContent = '';
  const [roman, dev] = kicker.split('|');
  k.append(document.createTextNode(roman.trim() + (dev ? '  ·  ' : '')));
  if (dev) { const d = document.createElement('span'); d.className = 'dev'; d.textContent = dev.trim(); k.append(d); }
  const tw = words(c.querySelector('.title'), title);
  const bw = words(c.querySelector('.body'), body);
  c.style.setProperty('--scrim', 1);
  gsap.set(c, { opacity: 1 });
  const tl = gsap.timeline();
  tl.fromTo(k, { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 1, ease: 'power3.out' })
    .fromTo(tw, { opacity: 0, y: 18, filter: 'blur(8px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.3, stagger: 0.07, ease: 'power3.out' }, 0.2)
    .fromTo(bw, { opacity: 0, y: 8, filter: 'blur(4px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1, stagger: 0.025, ease: 'power2.out' }, 0.7);
  return tl;
}

function hideCaption() {
  const c = ui.caption;
  c.style.setProperty('--scrim', 0);
  return new Promise((r) => gsap.to(c, { opacity: 0, y: -6, duration: 0.6, ease: 'power2.in', onComplete: () => { gsap.set(c, { y: 0 }); r(); } }));
}

function prompt(text) {
  if (!text) { ui.prompt.classList.remove('on'); return; }
  ui.prompt.querySelector('.prompt-text').textContent = text;
  ui.prompt.classList.add('on');
}

function meter(n) {
  ui.meter.forEach((li, i) => { li.classList.toggle('done', i < n - 1); li.classList.toggle('now', i === n - 1); });
}

function toast(msg) {
  ui.toast.textContent = msg;
  ui.toast.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => ui.toast.classList.remove('on'), 2600);
}

let nextResolve = null;
function waitNext(label = 'Continue', delay = 0) {
  return new Promise((resolve) => {
    setTimeout(() => {
      ui.next.querySelector('span').textContent = label;
      ui.next.classList.add('on');
      nextResolve = () => { ui.next.classList.remove('on'); nextResolve = null; audio.whoosh(0.06); resolve(); };
    }, delay * 1000);
  });
}
ui.next.addEventListener('click', (e) => { e.stopPropagation(); nextResolve?.(); });
addEventListener('keydown', (e) => {
  if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') && nextResolve && mode !== 'hold') { e.preventDefault(); nextResolve(); }
});
let wheelLock = 0;
addEventListener('wheel', (e) => {
  if (e.deltaY > 30 && nextResolve && performance.now() > wheelLock) { wheelLock = performance.now() + 1200; nextResolve(); }
}, { passive: true });

// ------------------------------------------------------------------ interaction
let world;
let mode = 'none';
let tool = null;
const stage = $('#stage');
const isUI = (e) => e.target.closest('button, input, form, .finale, .tools');

const hold = { down: false, k: 0, resolve: null };
const paint = { down: false, resolve: null, started: 0 };
const counters = { lanterns: 0, shells: 0, crackers: 0 };
let sparklerTarget = new THREE.Vector3();
let sparklerDist = 4.6;
let sparklerOnlyTulsi = false;
let inChapterPlay = false;

addEventListener('pointerdown', (e) => {
  if (isUI(e)) return;
  if (mode === 'hold') { hold.down = true; positionHold(e.clientX, e.clientY); }
  else if (mode === 'paint') { paint.down = true; paintAt(true); }
  else if (mode === 'lantern') releaseLanternAtPointer(true);
  else if (mode === 'fireworks') shellAtPointer();
  else if (mode === 'play') drag = { x0: e.clientX, panStart: panTarget, moved: false };
});
// in Celebrate mode a tap places a cracker; a sideways drag walks along the ghat
let drag = null;
addEventListener('pointermove', (e) => {
  if (!drag || mode !== 'play') return;
  const dx = e.clientX - drag.x0;
  if (Math.abs(dx) > 10) drag.moved = true;
  if (drag.moved && canPan() && tool !== 'sparkler') panTarget = THREE.MathUtils.clamp(drag.panStart - (dx / innerWidth) * 2.2, -1, 1);
});
addEventListener('pointerup', (e) => {
  if (drag && mode === 'play' && !drag.moved && !isUI(e)) useTool();
  drag = null;
});
addEventListener('pointermove', (e) => {
  if (mode === 'hold') positionHold(e.clientX, e.clientY);
  if (mode === 'paint' && (paint.down || e.pointerType === 'mouse')) paintAt(false);
});
addEventListener('pointerup', () => { hold.down = false; paint.down = false; world?.rangoli.endStroke(); });
addEventListener('pointercancel', () => { hold.down = false; paint.down = false; });
addEventListener('keydown', (e) => { if (mode === 'hold' && e.code === 'Space') { e.preventDefault(); hold.down = true; positionHold(innerWidth / 2, innerHeight / 2); } });
addEventListener('keyup', (e) => { if (e.code === 'Space') hold.down = false; });

function positionHold(x, y) { ui.hold.style.transform = `translate(${x}px, ${y}px)`; }

function paintAt(fresh) {
  const hit = rayFromPointer().intersectObject(world.rangoli.mesh, false)[0];
  if (!hit) { world.rangoli.endStroke(); return; }
  world.rangoli.paint(hit.uv, fresh);
  if (!paint.started) { paint.started = clock.t; hideCaption(); }
  const c = world.rangoli.randomColor();
  for (let i = 0; i < 5; i++) {
    world.smoke.emit(hit.point.x + (Math.random() - 0.5) * 0.15, hit.point.y + 0.5 + Math.random() * 0.3, hit.point.z + (Math.random() - 0.5) * 0.15,
      (Math.random() - 0.5) * 0.4, -1.5, (Math.random() - 0.5) * 0.4, { life: 0.35, gravity: 4, r: c[0], g: c[1], b: c[2], size: 0.035, flags: 0 });
  }
  if (Math.random() < 0.08) audio.ping(587 * [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3][(Math.random() * 5) | 0], 0.015);
}

function pointerPointAt(dist) {
  const r = rayFromPointer().ray;
  return r.origin.clone().addScaledVector(r.direction, dist);
}

function releaseLanternAtPointer(byUser) {
  const r = rayFromPointer().ray;
  let t = (-17 - r.origin.z) / r.direction.z;
  if (!(t > 6 && t < 50)) t = 18;
  const p = r.origin.clone().addScaledVector(r.direction, t);
  p.y = Math.max(p.y, 1.2);
  world.lanterns.release(p.x, p.y, p.z);
  audio.pentatonicPing((Math.random() * 10) | 0, 0.05);
  if (byUser) counters.lanterns++;
}

function shellAtPointer(type) {
  counters.crackers++;
  const r = rayFromPointer().ray;
  // burst somewhere in front of the camera, whichever way it faces
  const towardCity = r.direction.z > 0.3 && r.origin.z < 0;
  let t = towardCity ? (24 - r.origin.z) / r.direction.z : 55;
  if (!(t > 0)) t = 55;
  const p = r.origin.clone().addScaledVector(r.direction, t);
  p.y = THREE.MathUtils.clamp(p.y, 16, 52);
  p.x = THREE.MathUtils.clamp(p.x, -70, 70);
  world.pyro.shell(p, type);
  counters.shells++;
}

function useTool() {
  const ray = rayFromPointer();
  if (tool === 'shell') return shellAtPointer();
  if (tool === 'lantern') return releaseLanternAtPointer(true);
  if (tool === 'sparkler') return;
  if (tool === 'diya') {
    const p = world.groundHit(ray);
    if (!p) { toast('Tap on the ghat to place a diya'); return; }
    if (world.placeDiya(p)) audio.pentatonicPing((Math.random() * 10) | 0, 0.05); else toast('The ghat is full of lamps!');
    return;
  }
  const p = world.courtyardHit(ray);
  if (!p) { toast('Tap the floor beside the rangoli'); return; }
  counters.crackers++;
  if (tool === 'anar') world.pyro.anar(p);
  else if (tool === 'chakri') world.pyro.chakri(p);
  else if (tool === 'rocket') world.pyro.rocket(p);
  else if (tool === 'bomb') world.pyro.bomb(p);
}

// ------------------------------------------------------------------ per-frame hooks
export function storyUpdate(dt) {
  if (!world) return;
  panUpdate(dt);
  if (mode === 'hold') {
    hold.k = hold.down ? Math.min(1, hold.k + dt / 1.5) : Math.max(0, hold.k - dt * 1.5);
    ui.hold.classList.toggle('on', hold.down || hold.k > 0.02);
    ui.holdFill.style.strokeDashoffset = String(276.5 * (1 - hold.k));
    world.charge(hold.k);
    rig.shake = Math.max(rig.shake, hold.k * 0.02);
    audio.charge(hold.down);
    if (hold.k >= 1) { const r = hold.resolve; hold.resolve = null; mode = 'none'; ui.hold.classList.remove('on'); audio.charge(false); r?.(); }
  }
  const sp = world.sparkler;
  if (sp.active) {
    sparklerTarget.copy(pointerPointAt(sparklerDist));
    sp.update(dt, sparklerTarget);
    if (!sp.lit && !sp.spent && world.nearestLitFlame(toScreen(sp.tip), toScreen, isMobile ? 46 : 34, sparklerOnlyTulsi)) {
      const relight = sp.litAt !== undefined;
      sp.ignite();
      if (inChapterPlay) { world.beacon(false); if (relight) prompt('Draw circles of light'); }
      else if (relight && mode !== 'play') { prompt('Draw circles of light'); world.beacon(false); }
    }
  }
}

// ------------------------------------------------------------------ chapters
const SHOTS = {
  intro: { pos: [0, 6, -76], target: [13, 4.2, 4], fov: 46 },
  river: { pos: [0, 4.5, -46], target: [0, 8.5, 10], fov: 46 },
  hero: { pos: [0.55, 3.55, 0.8], target: [0, 3.18, 2.45], fov: 38 },
  heroPull: { pos: [0.8, 4.2, -4.5], target: [0, 3.4, 4], fov: 44 },
  wide: { pos: [0, 6.5, -30], target: [0, 7, 12], fov: 48 },
  rangoli: { pos: [0, 11.8, 7.3], target: [0, 3, 6.6], fov: 42 },
  sparkler: { pos: [1.8, 5.4, 12.4], target: [6.0, 3.7, -1.0], fov: 52 },
  lantern: { pos: [1.5, 3.6, 1.0], target: [-3, 6.2, -40], fov: 54 },
  fireworks: { pos: [0, 4.2, -36], target: [0, 15, 18], fov: 54 },
  play: { pos: [0, 4.6, -27], target: [0, 9.5, 10], fov: 54 },
  courtyard: { pos: [0.6, 6.2, 12.3], target: [2.2, 3.0, -0.5], fov: 54 },
};

export function placeIntroCamera() { shot({ ...SHOTS.intro, duration: 0 }); }

async function chapterDarkness() {
  meter(1);
  ui.bars.classList.add('on');
  caption('Chapter I | Nightfall', 'Before the lamps', 'The ghats lie quiet under a pale moon. The river holds its breath — and a whole town waits for a single flame.');
  shot({ ...SHOTS.river, duration: reducedMotion ? 2 : 11, ease: 'power2.inOut' });
  setTimeout(() => audio.flute(PHRASES.dawn, { bpm: 64 }), 2500);
  await waitNext('Continue', 5);
}

async function chapterFirstFlame() {
  meter(2);
  hideCaption();
  const moon = { k: 1 };
  const setMoon = () => world.ghat.setMoon(moon.k);
  gsap.to(moon, { k: 0.55, duration: 5, delay: 1, ease: 'power2.inOut', onUpdate: setMoon });
  await shot({ ...SHOTS.hero, duration: 6, ease: 'power2.inOut', via: [0, 4.5, -10] });
  rig.parallax = 0.25;
  caption('Chapter II | The first diya', 'The first flame', 'Every Diwali begins the same way — with one small lamp, and someone brave enough to light it.');
  await sleep(1.4);
  prompt(isMobile ? 'Press and hold to light the diya' : 'Press and hold anywhere to light the diya');
  mode = 'hold';
  await new Promise((r) => (hold.resolve = r));
  prompt('');
  world.igniteHero();
  audio.ignite();
  await sleep(0.8);
  caption('Chapter II | The first diya', 'A flame loses nothing', 'by lighting another.');
  await sleep(2.6);
  rig.parallax = 1;
  world.cascade((i) => audio.pentatonicPing(i, 0.035));
  gsap.to(moon, { k: 1, duration: 6, ease: 'power1.inOut', onUpdate: setMoon });
  audio.flute(PHRASES.spread, { bpm: 76, t: audio.now + 1 });
  await shot({ ...SHOTS.heroPull, duration: 4.5, ease: 'power2.inOut' });
  hideCaption();
  await shot({ ...SHOTS.wide, duration: 7, ease: 'power1.inOut' });
  caption('Chapter II | Coming home', 'The way home', 'When Rama returned to Ayodhya after fourteen years of exile, the people lit every doorway to guide him home. We have been lighting the way ever since.');
  await waitNext('Continue', 2);
}

async function chapterRangoli() {
  meter(3);
  hideCaption();
  gsap.to(world.rangoli.uniforms.uChalk, { value: 1, duration: 3, delay: 2 });
  await shot({ ...SHOTS.rangoli, duration: 6, ease: 'power2.inOut', via: [0, 13, -4] });
  rig.parallax = 0.12;
  caption('Chapter III | Rangoli', 'Colours at the threshold', 'Patterns poured by hand at the doorstep, to welcome Lakshmi — and every guest — inside.');
  await sleep(1);
  prompt(isMobile ? 'Drag across the floor to pour colour' : 'Move across the floor to pour colour');
  mode = 'paint';
  paint.started = 0;
  await new Promise((resolve) => {
    let half = false;
    const check = setInterval(() => {
      const p = world.rangoli.progress;
      if (p > 2.4 && !half) { half = true; prompt('Keep going — every stroke is mirrored sixteen ways'); }
      if (p > 3.8 || (paint.started && clock.t - paint.started > 14)) { clearInterval(check); resolve(); }
    }, 200);
  });
  mode = 'none';
  prompt('');
  world.rangoli.complete(2.8);
  audio.flute(PHRASES.rangoli, { bpm: 84 });
  await sleep(1.6);
  world.igniteRing();
  world.petals();
  audio.bell(880, 0.12);
  rig.parallax = 1;
  caption('Chapter III | Rangoli', 'Welcome home', 'No two are ever the same. Every one says the same thing: you are welcome here.');
  await waitNext('Continue', 2.5);
}

async function chapterSparkler() {
  meter(4);
  hideCaption();
  await shot({ ...SHOTS.sparkler, duration: 6, ease: 'power2.inOut', via: [1, 9, 8] });
  rig.parallax = 0.15;
  caption('Chapter IV | Sparklers', 'Hold a star', 'Every child’s first firework — a wire of starlight that crackles and spits in your hand.');
  // the whole cracker box is open in this scene
  inChapterPlay = true;
  counters.crackers = 0;
  view = 'chapter';
  document.body.classList.add('chapter-tools');
  ui.tools.classList.add('on');
  mode = 'play';
  sparklerOnlyTulsi = true;
  setTool('sparkler');
  prompt('Light your sparkler at the tulsi katta — or pick any cracker below');
  await new Promise((r) => { const iv = setInterval(() => { if (world.sparkler.lit || counters.crackers > 0) { clearInterval(iv); r(); } }, 100); });
  prompt(world.sparkler.lit ? 'Draw circles of light — it burns for ten seconds' : 'Light as many as you like');
  hideCaption();
  await sleep(4);
  caption('Chapter IV | Sparklers', 'Write your name in light', 'It lasts only a moment. That is exactly why we remember it.');
  await waitNext('Continue', 4);
  prompt('');
  setTool(null);
  mode = 'none';
  inChapterPlay = false;
  sparklerOnlyTulsi = false;
  world.beacon(false);
  ui.tools.classList.remove('on');
  document.body.classList.remove('chapter-tools');
  view = 'courtyard';
  rig.parallax = 1;
}

async function chapterLanterns() {
  meter(5);
  hideCaption();
  await shot({ ...SHOTS.lantern, duration: 6.5, ease: 'power2.inOut', via: [0, 8, 6] });
  caption('Chapter V | Sky lanterns', 'Wishes on the wind', 'Paper lanterns carry our hopes up, over the river, into the dark.');
  for (let i = 0; i < 8; i++) {
    setTimeout(() => {
      world.lanterns.release((Math.random() - 0.5) * 22, 0.6 + Math.random() * 1.2, -6 - Math.random() * 8);
      audio.pentatonicPing(i + 3, 0.03);
    }, 800 + i * 900);
  }
  audio.flute(PHRASES.wish, { bpm: 60, t: audio.now + 2 });
  await sleep(1.5);
  counters.lanterns = 0;
  prompt('Tap over the river to release a lantern — make a wish');
  mode = 'lantern';
  await new Promise((r) => {
    const t0 = clock.t;
    const iv = setInterval(() => { if (counters.lanterns >= 3 || clock.t - t0 > 12) { clearInterval(iv); r(); } }, 200);
  });
  await waitNext('Continue', 1.5);
  prompt('');
}

const CHOREO = [
  [0.0, 'gold', 'willow', [0, 30]], [1.4, 'magenta', 'peony', [-16, 26]], [2.2, 'emerald', 'peony', [16, 27]],
  [3.6, 'blue', 'ring', [0, 34]], [5.0, 'saffron', 'chrys', [-24, 30]], [5.3, 'saffron', 'chrys', [24, 30]],
  [7.0, 'gold', 'crackle', [0, 38]], [8.6, 'violet', 'double', [-10, 33]], [9.2, 'red', 'double', [10, 31]],
  [10.6, 'magenta', 'heart', [0, 30]], [12.0, 'gold', 'palm', [-20, 34]], [12.4, 'gold', 'palm', [20, 34]],
  [14.0, 'silver', 'chrys', [-8, 40]], [14.2, 'blue', 'peony', [8, 38]], [14.8, 'emerald', 'ring', [-28, 28]], [15.1, 'magenta', 'ring', [28, 28]],
  [16.2, 'gold', 'willow', [-14, 42]], [16.4, 'gold', 'willow', [14, 42]], [16.8, 'gold', 'willow', [0, 46]],
  [17.6, 'red', 'peony', [-30, 32]], [17.8, 'saffron', 'peony', [30, 32]], [18.2, 'violet', 'chrys', [-6, 30]], [18.4, 'emerald', 'chrys', [6, 30]],
  [19.2, 'gold', 'crackle', [-18, 40]], [19.4, 'gold', 'crackle', [18, 40]], [19.8, 'silver', 'double', [0, 36]],
  [21.0, 'gold', 'willow', [-26, 44]], [21.1, 'gold', 'willow', [-9, 48]], [21.2, 'gold', 'willow', [9, 48]], [21.3, 'gold', 'willow', [26, 44]],
  [22.2, 'gold', 'crackle', [0, 42]],
];

async function chapterFireworks() {
  meter(6);
  hideCaption();
  ui.bars.classList.remove('on');
  await shot({ ...SHOTS.fireworks, duration: 6, ease: 'power2.inOut' });
  caption('Chapter VI | Fireworks', 'And the sky answers', '');
  mode = 'fireworks';
  prompt('Tap anywhere to light up the sky');
  audio.flute(PHRASES.finale, { bpm: 80, t: audio.now + 14 });
  for (const [t, color, type, [x, y]] of CHOREO) {
    world.pyro.at(t + 0.6, () => world.pyro.shell(new THREE.Vector3(x * 1.1 + (Math.random() - 0.5) * 3, y - 2, 22 + Math.random() * 6), type, { color }));
  }
  // ground crackers along the ghat join in
  world.pyro.at(3, () => [-14, 14].forEach((x) => world.pyro.anar(new THREE.Vector3(x, 3, 3.2), 9)));
  world.pyro.at(9, () => [-22, 0, 22].forEach((x) => world.pyro.chakri(new THREE.Vector3(x, 2.0, -0.7), 6)));
  world.pyro.at(13, () => [-6, 6].forEach((x) => world.pyro.anar(new THREE.Vector3(x, 0.5, -3.6), 8)));
  await sleep(6);
  hideCaption();
  await sleep(10);
  prompt('');
  await sleep(5);
  showFinale();
  ambientShow(true);
}

// ------------------------------------------------------------------ finale & free play
let ambientTimer = null;
function ambientShow(on, interval = [2.5, 5]) {
  clearTimeout(ambientTimer);
  if (!on) return;
  const fire = () => {
    world.pyro.shell(new THREE.Vector3((Math.random() - 0.5) * 70, 26 + Math.random() * 16, 22 + Math.random() * 8), null, { silent: Math.random() < 0.5 });
    ambientTimer = setTimeout(fire, (interval[0] + Math.random() * (interval[1] - interval[0])) * 1000);
  };
  ambientTimer = setTimeout(fire, 1500);
}

function showFinale() {
  mode = 'fireworks';
  ui.tools.classList.remove('on');
  setTool(null);
  ui.finale.classList.add('on');
  ui.hud.classList.add('on');
  $('#skip').style.display = 'none';
  ui.meter.forEach((li) => { li.classList.add('done'); li.classList.remove('now'); });
  if (FROM) { const f = $('#fromLine'); f.textContent = `— with love, ${FROM}`; f.hidden = false; }
  if (TO) $('#finaleBody').textContent = `${TO}, may the light you share tonight find its way back to you — brighter.`;
  shot({ ...SHOTS.fireworks, duration: 3 });
}

const GROUND_TOOLS = ['chakri', 'anar', 'rocket', 'bomb'];
let view = 'courtyard';
const PAN_RANGE = 10;
let pan = 0, panTarget = 0, panHold = 0, courtyardReady = false;
const canPan = () => mode === 'play' && view === 'courtyard' && courtyardReady;
function courtyardShot() {
  const c = SHOTS.courtyard, o = pan * PAN_RANGE;
  return { ...c, pos: [c.pos[0] + o, c.pos[1], c.pos[2]], target: [c.target[0] + o, c.target[1], c.target[2]] };
}
function panUpdate(dt) {
  document.body.classList.toggle('can-pan', canPan());
  if (!canPan()) return;
  panTarget = THREE.MathUtils.clamp(panTarget + panHold * dt * 0.7, -1, 1);
  pan += (panTarget - pan) * Math.min(1, dt * 5);
  const c = SHOTS.courtyard, o = pan * PAN_RANGE;
  rig.pos.x = c.pos[0] + o;
  rig.target.x = c.target[0] + o;
}
addEventListener('keydown', (e) => {
  if (mode !== 'play' || e.target.closest?.('input')) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') panHold = -1;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') panHold = 1;
});
addEventListener('keyup', (e) => { if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(e.code)) panHold = 0; });
function setView(v) {
  if (v === view && ui.tools.classList.contains('on')) return;
  const from = view;
  view = v;
  $('#viewLabel').textContent = view === 'courtyard' ? 'River view' : 'Courtyard view';
  if (tool === 'sparkler') sparklerDist = view === 'courtyard' ? 4.6 : 6;
  const crane = from !== v ? { via: [0, 12, -4] } : {};
  courtyardReady = false;
  shot({ ...(view === 'courtyard' ? courtyardShot() : SHOTS.play), duration: 3.6, ease: 'power2.inOut', ...crane })
    .then(() => { if (view === 'courtyard') courtyardReady = true; });
}
function setTool(t) {
  tool = t;
  if (GROUND_TOOLS.includes(t) && view !== 'courtyard' && !inChapterPlay) setView('courtyard');
  document.querySelectorAll('.tools [data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  const sp = world.sparkler;
  if (t === 'sparkler') {
    sparklerDist = view === 'river' ? 6 : 4.6;
    sp.setActive(true);
    document.body.classList.add('cursor-hide');
    if (inChapterPlay) {
      world.beacon(true);
      sp.onBurnout = () => { prompt('Burnt out — light a fresh one at the tulsi katta'); world.beacon(true); };
    } else {
      toast('Touch any diya flame to light it');
      sp.onBurnout = () => toast('Burnt out — grab another and light it from a diya');
    }
  } else {
    if (sp.active) { sp.setActive(false); document.body.classList.remove('cursor-hide'); }
    if (inChapterPlay) world.beacon(false);
  }
  const hints = {
    diya: 'Tap the ghat to place a diya', chakri: 'Tap the floor beside the rangoli for a ground spinner', anar: 'Tap the floor beside the rangoli to light a flower pot',
    rocket: 'Tap the floor to stand a rocket in its bottle', bomb: 'Tap the floor to light a bomb — then step back', shell: 'Tap the sky', lantern: 'Tap to release a lantern',
  };
  if (hints[t]) toast(hints[t]);
}

function celebrate() {
  ui.finale.classList.remove('on');
  ui.tools.classList.add('on');
  mode = 'play';
  view = '';
  pan = panTarget = -0.5; // start on the open floor beside the rangoli
  setView('courtyard');
  setTool('anar');
  ambientShow(true, [5, 10]);
  setTimeout(() => toast(isMobile ? 'Swipe sideways to walk along the ghat' : 'Drag sideways or use ← → to walk along the ghat'), 2800);
}

function wireFinale() {
  $('#celebrate').addEventListener('click', celebrate);
  $('#replay').addEventListener('click', () => {
    $('#veil').classList.remove('off');
    const u = new URL(location.href); u.searchParams.delete('skip');
    setTimeout(() => (location.href = u.toString()), 900);
  });
  $('#shareOpen').addEventListener('click', () => { const f = $('#share'); f.hidden = !f.hidden; if (!f.hidden) $('#toName').focus(); });
  $('#share').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = new URL(location.origin + location.pathname);
    const to = clean($('#toName').value), from = clean($('#fromName').value);
    if (to) u.searchParams.set('to', to);
    if (from) u.searchParams.set('from', from);
    const url = u.toString();
    try {
      if (navigator.share && isMobile) await navigator.share({ title: 'Happy Diwali', text: to ? `${to}, I lit a diya for you` : 'A little film of light, for you', url });
      else { await navigator.clipboard.writeText(url); toast('Link copied — send it with love'); }
    } catch { toast(url); }
  });
  document.querySelectorAll('.tools [data-tool]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); setTool(b.dataset.tool); }));
  $('.tools [data-view]').addEventListener('click', () => {
    setView(view === 'courtyard' ? 'river' : 'courtyard');
  });
  document.querySelectorAll('[data-pan]').forEach((b) => {
    const dir = Number(b.dataset.pan);
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); panHold = dir; b.setPointerCapture?.(e.pointerId); });
    const stop = () => { panHold = 0; };
    b.addEventListener('pointerup', stop);
    b.addEventListener('pointercancel', stop);
    b.addEventListener('lostpointercapture', stop);
  });
  $('.tools [data-action="card"]').addEventListener('click', () => { ambientShow(true); showFinale(); });
  $('#skip').addEventListener('click', () => {
    const u = new URL(location.href); u.searchParams.set('skip', '1');
    $('#veil').classList.remove('off');
    setTimeout(() => (location.href = u.toString()), 700);
  });
  const snd = $('#sound');
  snd.addEventListener('click', () => {
    const m = !audio.muted;
    audio.setMuted(m);
    snd.setAttribute('aria-pressed', String(m));
    snd.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
  });
}

// ------------------------------------------------------------------ intro
/** Golden dust drifting in the air between the viewer and the river. */
function startIntroMotes() {
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  return setInterval(() => {
    camera.getWorldDirection(fwd);
    right.crossVectors(fwd, up).normalize();
    const d = 5 + Math.random() * 18;
    const p = camera.position.clone().addScaledVector(fwd, d)
      .addScaledVector(right, (Math.random() - 0.5) * d * 1.3)
      .addScaledVector(up, (Math.random() - 0.6) * d * 0.7);
    const warm = Math.random();
    world.sparks.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 0.25, 0.08 + Math.random() * 0.2, (Math.random() - 0.5) * 0.25,
      { life: 5 + Math.random() * 4, r: 2.0, g: 1.1 + warm * 0.3, b: 0.4 + warm * 0.2, size: 0.02 + Math.random() * 0.03 * (d / 12), flags: 0 });
  }, 90);
}

function showIntro() {
  if (TO) { const f = $('#forLine'); f.textContent = `For ${TO}`; f.hidden = false; }
  const items = [...document.querySelectorAll('.intro-inner > *:not([hidden])')];
  const title = $('.intro-title .dev');
  const rest = items.filter((el) => !el.classList.contains('intro-title'));
  gsap.fromTo(title, { opacity: 0, letterSpacing: '0.24em', filter: 'blur(16px)' }, { opacity: 1, letterSpacing: '0.01em', filter: 'blur(0px)', duration: 3.2, ease: 'power3.out', delay: 0.9 });
  gsap.fromTo('.intro-title .en', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 1.8, ease: 'power3.out', delay: 2.4 });
  gsap.fromTo('.orn-line', { scaleX: 0 }, { scaleX: (i) => (i ? -1 : 1), duration: 1.6, ease: 'power3.inOut', delay: 2.8 });
  gsap.fromTo(rest, { opacity: 0, y: 14, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.6, ease: 'power3.out', delay: (i) => (i === 0 ? 0.4 : 2.8 + i * 0.2) });
  return new Promise((resolve) => {
    $('#begin').addEventListener('click', () => {
      audio.init();
      audio.startAmbience();
      audio.ignite();
      // the little lamp flares, and its light washes over the screen into the film
      const btn = $('#begin');
      btn.classList.add('lit');
      const r = btn.querySelector('.begin-flame').getBoundingClientRect();
      const flare = document.createElement('div');
      flare.className = 'flare';
      flare.style.left = `${r.left + r.width / 2}px`;
      flare.style.top = `${r.top + r.height * 0.6}px`;
      document.body.appendChild(flare);
      const size = Math.hypot(innerWidth, innerHeight) / 20;
      gsap.timeline({ onComplete: () => flare.remove() })
        .to(flare, { scale: size, duration: 1.6, ease: 'power2.in' })
        .to(flare, { opacity: 0, duration: 1.4, ease: 'power2.out' }, 1.1);
      gsap.to('.intro-inner', { opacity: 0, y: -10, filter: 'blur(6px)', duration: 1.2, ease: 'power2.in', delay: 0.25 });
      gsap.to('#intro', { opacity: 0, duration: 1.2, delay: 1.2, ease: 'power2.inOut', onComplete: () => { $('#intro').style.display = 'none'; } });
      setTimeout(resolve, 900);
    }, { once: true });
  });
}

/** Arrived via "Skip to celebration": go straight to the lit ghat, no title screen. */
async function runSkipped() {
  history.replaceState(null, '', location.pathname + location.search.replace(/[?&]skip=1/, '').replace(/^&/, '?'));
  $('#intro').style.display = 'none';
  $('#skip').style.display = 'none';
  world.lightEverything();
  world.rangoli.uniforms.uChalk.value = 1;
  world.igniteRing();
  shot({ ...SHOTS.fireworks, duration: 0 });
  fadeTo(0, 2);
  $('#veil').classList.add('off');
  ui.hud.classList.add('on');
  // browsers only allow sound after a gesture: start it on the first one
  const unlock = () => { audio.init(); audio.startAmbience(); removeEventListener('pointerdown', unlock, true); removeEventListener('keydown', unlock, true); };
  addEventListener('pointerdown', unlock, true);
  addEventListener('keydown', unlock, true);
  setTimeout(() => { showFinale(); ambientShow(true, [1.5, 3]); }, 900);
}

export async function run(w) {
  world = w;
  wireFinale();
  if (params.has('skip')) return runSkipped();
  placeIntroCamera();
  fadeTo(0, 3);
  $('#veil').classList.add('off');
  shot({ pos: [-2, 4.8, -60], target: [12, 4.6, 8], fov: 46, duration: 45, ease: 'sine.out' });
  const motes = startIntroMotes();
  await showIntro();
  clearInterval(motes);
  ui.hud.classList.add('on');

  const chapters = [chapterDarkness, chapterFirstFlame, chapterRangoli, chapterSparkler, chapterLanterns, chapterFireworks];
  let from = 0;
  if (import.meta.env.DEV && params.has('ch')) {
    from = Number(params.get('ch')) - 1;
    if (from > 1) { world.lightEverything(); world.rangoli.uniforms.uFill.value = from > 2 ? 1.05 : 0; world.rangoli.uniforms.uChalk.value = from > 2 ? 1 : 0; if (from > 2) world.igniteRing(); ui.bars.classList.add('on'); }
  }
  for (const ch of chapters.slice(from)) await ch();
}
