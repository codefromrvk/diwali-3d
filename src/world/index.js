import * as THREE from 'three';
import gsap from 'gsap';
import { scene, camera, isMobile } from '../stage.js';
import { clock } from '../time.js';
import { createSky } from './sky.js';
import { createWater } from './water.js';
import { createGhat, STEPS, HERO, TULSI, TULSI_FACING, PLATFORM_Y } from './ghat.js';
import { createTulsi } from './tulsi.js';
import { DiyaField } from './diyas.js';
import { createRangoli, RANGOLI_CENTER } from './rangoli.js';
import { Lanterns } from './lanterns.js';
import { Particles } from '../fx/particles.js';
import { Glows } from '../fx/glows.js';
import { Pyro, Sparkler } from '../fx/pyro.js';

export function createWorld() {
  const sky = createSky(scene);
  const water = createWater(scene);
  const ghat = createGhat(scene);
  const glows = new Glows(scene, 200);
  const sparks = new Particles(scene, { capacity: isMobile ? 45000 : 90000, additive: true });
  const smoke = new Particles(scene, { capacity: 8000, additive: false, renderOrder: 4 });
  const rangoli = createRangoli(scene);
  const lanterns = new Lanterns(scene, glows, 70);
  const pyro = new Pyro(scene, { sparks, smoke, glows, sky });
  const sparkler = new Sparkler(scene, sparks, glows);

  // ---- diyas ----
  const diyas = new DiyaField(scene, 900, { gain: 0.32 });
  const hero = diyas.add(HERO.x, HERO.y, HERO.z, { scale: 1.3, riser: true });
  const jitter = () => (Math.random() - 0.5) * 0.12;
  const spin = () => Math.PI / 2 + (Math.random() - 0.5) * 0.7;
  for (let x = -37.8; x <= 37.8; x += 1.05) {
    if (Math.abs(x) < 0.6) continue;
    diyas.add(x + jitter(), PLATFORM_Y, 2.35, { rot: spin(), riser: true });
  }
  for (const s of STEPS) {
    for (let x = -37.8 + (s.y * 1.3) % 1; x <= 37.8; x += 1.05) diyas.add(x + jitter(), s.y, s.front + 0.35, { rot: spin(), riser: true });
  }
  const ringStart = diyas.count;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    diyas.add(RANGOLI_CENTER.x + Math.cos(a) * 3.45, PLATFORM_Y, RANGOLI_CENTER.z + Math.sin(a) * 3.45, { rot: -a + Math.PI, scale: 1.05 });
  }
  const ringEnd = diyas.count;
  const tulsi = createTulsi(scene, TULSI, TULSI_FACING);
  const tulsiDiya = diyas.add(tulsi.diyaPos.x, tulsi.diyaPos.y, tulsi.diyaPos.z, { scale: 0.62, rot: tulsi.diyaRot, pool: false });
  // chhatri bases & temple steps
  const extrasStart = diyas.count;
  for (const cx of [-11, 11, -30, 30]) for (const dx of [-1.15, -0.4, 0.4, 1.15]) diyas.add(cx + dx, PLATFORM_Y + 0.35, 2.55, { rot: spin() });
  for (let x = -7; x <= 7; x += 0.7) diyas.add(x, PLATFORM_Y, 12.6, { rot: spin() });
  const extrasEnd = diyas.count;

  // ---- floating diyas on the river ----
  const floatN = isMobile ? 36 : 60;
  const floaters = new DiyaField(scene, floatN, { pools: false, dona: true });
  const fl = [];
  for (let i = 0; i < floatN; i++) {
    const f = { x: (Math.random() - 0.5) * 110, z: -5.5 - Math.pow(Math.random(), 1.6) * 40, sp: 0.25 + Math.random() * 0.35, ph: Math.random() * 10, rot: Math.random() * 6 };
    fl.push(f);
    floaters.add(f.x, 0.03, f.z, { rot: f.rot, scale: 1.1, pool: false });
  }

  // ---- hero diya light ----
  const heroLight = new THREE.PointLight(0xff9a40, 0, 9, 1.6);
  heroLight.position.copy(diyas.wickPos(hero)).add(new THREE.Vector3(0, 0.15, -0.1));
  scene.add(heroLight);
  const heroGlow = glows.alloc();

  const state = { light: 0, heroOn: 0, embers: 0, beacon: -1 };
  let emberAcc = 0;

  const world = {
    sky, water, ghat, glows, sparks, smoke, rangoli, lanterns, pyro, sparkler, diyas, floaters, hero, tulsi, tulsiDiya, state,

    setLight(k) {
      state.light = k;
      ghat.setLight(k);
      sky.uniforms.uGlow.value = k;
      sky.starMat.uniforms.uDim.value = 1 - k * 0.35;
      ghat.templeGlow.value = k;
    },

    /** Glow at the wick while the viewer holds to ignite. */
    charge(k) {
      const w = diyas.wickPos(hero);
      glows.set(heroGlow, w.x, w.y + 0.03, w.z, 0.25 + k * 0.5, 1.4 * k, 0.45 * k, 0.1 * k);
      heroLight.intensity = k * 0.8;
      if (k > 0.05 && Math.random() < k * 0.9) {
        const a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.3, y = (Math.random() - 0.3) * 0.3;
        const px = w.x + Math.cos(a) * r, py = w.y + y, pz = w.z + Math.sin(a) * r, life = 0.45;
        sparks.emit(px, py, pz, (w.x - px) / life, (w.y - py) / life, (w.z - pz) / life, { life, r: 2.6, g: 1.4, b: 0.5, size: 0.012, flags: 0 });
      }
    },

    igniteHero() {
      diyas.ignite(hero);
      glows.release(heroGlow);
      const w = diyas.wickPos(hero);
      glows.flash(w.x, w.y + 0.08, w.z, 2.2, new THREE.Color(1, 0.6, 0.25), 2.5, 2.5);
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * Math.PI * 2, u = Math.random();
        sparks.streak(w.x, w.y + 0.05, w.z, Math.cos(a) * 1.2 * u, 0.5 + Math.random() * 1.6, Math.sin(a) * 1.2 * u,
          { life: 0.5 + Math.random() * 0.8, drag: 1.5, gravity: 1, r: 3, g: 1.6, b: 0.5, size: 0.012, flags: 2 }, 2, 0.02);
      }
      state.heroOn = 1;
      gsap.to(heroLight, { intensity: 3.2, duration: 1.2, ease: 'power2.out' });
    },

    /** The light spreads: every diya, outward from the first, then the town. */
    cascade(onPing) {
      const origin = diyas.wickPos(hero);
      const p = new THREE.Vector3();
      let pings = 0;
      for (let i = 0; i < diyas.count; i++) {
        if (i === hero || i === tulsiDiya || (i >= ringStart && i < ringEnd)) continue;
        diyas.wickPos(i, p);
        const d = p.distanceTo(origin);
        const delay = 0.3 + Math.pow(d, 0.85) * 0.16 + Math.random() * 0.25;
        diyas.ignite(i, delay);
        if (onPing && i % 23 === 0 && pings++ < 26) setTimeout(() => onPing(pings), delay * 1000);
      }
      diyas.ignite(tulsiDiya, 1.2);
      ghat.lightCity(origin, 1.2, 0.06);
      floaters.igniteAll(() => 2.5 + Math.random() * 3);
      gsap.to(state, { light: 1, duration: 7, delay: 0.4, ease: 'power1.inOut', onUpdate: () => world.setLight(state.light) });
      gsap.to(state, { embers: 1, duration: 6, delay: 2 });
    },

    /** Pulse a soft halo around the tulsi lamp to show where to light the sparkler. */
    beacon(on) {
      if (on && state.beacon < 0) state.beacon = glows.alloc();
      else if (!on && state.beacon >= 0) { glows.release(state.beacon); state.beacon = -1; }
    },

    igniteRing() {
      for (let i = ringStart; i < ringEnd; i++) diyas.ignite(i, (i - ringStart) * 0.09);
      rangoli.uniforms.uLight.value = 0.75;
      gsap.to(rangoli.uniforms.uLight, { value: 1.05, duration: 2 });
    },

    /** Marigold petals drifting down over the rangoli. */
    petals(n = 220) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 4.2;
        const orange = Math.random() < 0.6;
        smoke.emit(RANGOLI_CENTER.x + Math.cos(a) * r, 9 + Math.random() * 3, RANGOLI_CENTER.z + Math.sin(a) * r, 0, -0.2, 0, {
          life: 4 + Math.random() * 2, drag: 1.4, gravity: 1.1, delay: Math.random() * 2.5,
          r: orange ? 0.95 : 1.0, g: orange ? 0.38 : 0.72, b: orange ? 0.03 : 0.05, size: 0.05 + Math.random() * 0.03, flags: 16,
        });
      }
    },

    /** Jump straight to the fully lit night (for skip / free play). */
    lightEverything() {
      diyas.igniteAll(() => Math.random() * 1.5);
      floaters.igniteAll(() => Math.random() * 2);
      ghat.lightCity(diyas.wickPos(hero), 0, 0.02);
      rangoli.uniforms.uFill.value = 1.05;
      rangoli.uniforms.uChalk.value = 1;
      rangoli.uniforms.uLight.value = 1.05;
      state.heroOn = 1;
      heroLight.intensity = 3.2;
      glows.release(heroGlow);
      gsap.to(state, { light: 1, embers: 1, duration: 2, onUpdate: () => world.setLight(state.light) });
    },

    /** Where on the ghat a ray lands (upward faces only). */
    groundHit(raycaster) {
      const h = raycaster.intersectObject(ghat.ghatMesh, false)[0];
      if (!h || !h.face) return null;
      if (h.face.normal.y > 0.7) return h.point;
      // tapped a riser: stand it on the step just below, in front of the face
      if (h.face.normal.z < -0.7) {
        const y = Math.floor(h.point.y * 2 + 0.001) / 2;
        if (y >= 0.5) return new THREE.Vector3(h.point.x, y, h.point.z - 0.35);
      }
      return null;
    },

    /** Open floor beside the rangoli, where crackers are set down. */
    courtyardHit(raycaster) {
      const p = world.groundHit(raycaster);
      if (!p || Math.abs(p.y - PLATFORM_Y) > 0.01 || p.z < 2.6 || p.z > 12.2 || Math.abs(p.x) > 21) return null;
      // keep the rangoli itself clear
      const dx = p.x - RANGOLI_CENTER.x, dz = p.z - RANGOLI_CENTER.z, d = Math.hypot(dx, dz);
      if (d < 3.9) { const k = 3.9 / Math.max(d, 0.001); p.x = RANGOLI_CENTER.x + dx * k; p.z = RANGOLI_CENTER.z + dz * k; }
      // not right under the viewer's nose, and not on the tulsi katta
      p.z = Math.min(p.z, 7.6);
      const keepClear = (cx, cz, r) => {
        const tx = p.x - cx, tz = p.z - cz, td = Math.hypot(tx, tz);
        if (td < r) { p.x = cx + (tx / (td || 1)) * r; p.z = cz + (tz / (td || 1)) * r; }
      };
      keepClear(tulsi.group.position.x, tulsi.group.position.z, 1.3);
      keepClear(-11, 3.6, 1.9); // chhatri pavilions
      keepClear(11, 3.6, 1.9);
      return p;
    },

    placeDiya(p) {
      const i = diyas.add(p.x, p.y, p.z, { rot: Math.random() * Math.PI * 2, pool: true });
      if (i >= 0) diyas.ignite(i, 0.15);
      return i >= 0;
    },

    nearestLitFlame(screenPt, toScreen, maxPx = 40, onlyTulsi = false) {
      const p = new THREE.Vector3();
      const check = (field, i) => {
        if (!field.isLit(i)) return false;
        field.wickPos(i, p);
        p.y += 0.08;
        const s = toScreen(p);
        return !s.behind && Math.hypot(s.x - screenPt.x, s.y - screenPt.y) < maxPx;
      };
      if (onlyTulsi) return check(diyas, tulsiDiya);
      for (let i = 0; i < diyas.count; i++) if (check(diyas, i)) return true;
      for (let i = 0; i < floaters.count; i++) if (check(floaters, i)) return true;
      return false;
    },

    update(dt) {
      sky.update(camera);
      water.update();
      ghat.update();
      diyas.update();
      floaters.update();
      rangoli.update();
      tulsi.update();
      tulsi.setLamp(diyas.isLit(tulsiDiya) ? 1 : 0);
      if (state.beacon >= 0) {
        const w = diyas.wickPos(tulsiDiya), k = 0.5 + 0.5 * Math.sin(clock.t * 3);
        glows.set(state.beacon, w.x, w.y + 0.06, w.z, 0.9 + k * 0.5, 0.5 * k, 0.25 * k, 0.06 * k);
      }
      lanterns.update(dt);
      pyro.update(dt);
      glows.update(dt);
      const t = clock.t;
      for (let i = 0; i < fl.length; i++) {
        const f = fl[i];
        f.x += f.sp * dt;
        if (f.x > 60) f.x = -60;
        floaters.setTransform(i, f.x, 0.02 + Math.sin(t * 1.3 + f.ph) * 0.025, f.z + Math.sin(t * 0.3 + f.ph) * 0.3, f.rot + Math.sin(t * 0.2 + f.ph) * 0.3, 1.1);
      }
      if (state.heroOn) heroLight.intensity = 3.2 * (0.85 + Math.random() * 0.15 + Math.sin(t * 13) * 0.05);
      // embers drifting up off the lamps
      emberAcc += dt * 40 * state.embers;
      while (emberAcc > 1) {
        emberAcc--;
        const x = (Math.random() - 0.5) * 60, z = -4 + Math.random() * 7;
        sparks.emit(x, 0.6 + Math.random() * 3, z, (Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3,
          { life: 3 + Math.random() * 3, r: 1.6, g: 0.65, b: 0.18, size: 0.03, flags: 1 });
      }
      sparks.update();
      smoke.update();
    },
  };
  world.setLight(0);
  return world;
}
