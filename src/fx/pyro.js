import * as THREE from 'three';
import { clock } from '../time.js';
import { audio } from '../audio.js';
import { shake, camera } from '../stage.js';

export const COLORS = {
  gold: [1.0, 0.58, 0.16], saffron: [1.0, 0.36, 0.05], magenta: [1.0, 0.12, 0.55], emerald: [0.12, 1.0, 0.4],
  blue: [0.22, 0.42, 1.0], silver: [0.85, 0.9, 1.0], red: [1.0, 0.1, 0.07], violet: [0.62, 0.22, 1.0],
};
const NAMES = Object.keys(COLORS);
const pickColor = (except) => { let c; do c = NAMES[(Math.random() * NAMES.length) | 0]; while (c === except); return c; };
const rand = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3();

function sphereDir(i, n) {
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(1 - y * y);
  const a = i * 2.39996323;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

/** Everything that goes bang: sky shells and the ground crackers. */
export class Pyro {
  constructor(scene, { sparks, smoke, glows, sky }) {
    this.sparks = sparks; this.smoke = smoke; this.glows = glows; this.sky = sky;
    this.scene = scene;
    this.events = [];
    this.emitters = [];
    this.lights = [0, 1, 2].map(() => {
      const l = new THREE.PointLight(0xffffff, 0, 120, 1.2);
      scene.add(l);
      return { l, k: 0 };
    });
    this.li = 0;
    this.clay = new THREE.MeshStandardMaterial({ color: 0x9a4a22, roughness: 0.9 });
    this.paper = new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.7, emissive: 0x200000 });
    this.gold = new THREE.MeshStandardMaterial({ color: 0xd4a23a, roughness: 0.4, metalness: 0.6 });
  }

  at(delay, fn) { this.events.push({ t: clock.t + delay, fn }); }

  lightFlash(pos, rgb, k = 1) {
    const L = this.lights[this.li++ % this.lights.length];
    L.l.position.copy(pos);
    L.l.color.setRGB(rgb[0], rgb[1], rgb[2]);
    L.k = Math.max(L.k, 260 * k);
  }

  // ------------------------------------------------------------ sky shells
  shell(target, type = null, opts = {}) {
    const from = opts.from || new THREE.Vector3(target.x + rand(-3, 3), 3.5, Math.max(target.z - 4, 16));
    const T = opts.T || rand(1.3, 1.9);
    const g = 9;
    const vx = (target.x - from.x) / T, vz = (target.z - from.z) / T;
    const vy = (target.y - from.y) / T + 0.5 * g * T;
    this.sparks.streak(from.x, from.y, from.z, vx, vy, vz,
      { life: T, gravity: g, r: 1.4, g: 0.8, b: 0.35, size: 0.16, flags: 2 }, 16, 0.028);
    if (!opts.silent) audio.launch(T, 0.05);
    const t = type || ['peony', 'chrys', 'willow', 'ring', 'double', 'crackle', 'palm', 'peony', 'chrys'][(Math.random() * 9) | 0];
    this.at(T, () => this.burst(target, t, opts.color));
  }

  burst(p, type, colorName) {
    const c1 = colorName || pickColor();
    const C = COLORS[c1];
    const dist = camera.position.distanceTo(p);
    const S = this.sparks;
    const I = 3.2;
    const K = 1.75; // burst scale
    const star = (dx, dy, dz, speed, col, o = {}, tail = 3, gap = 0.03) =>
      S.streak(p.x, p.y, p.z, dx * speed * K, dy * speed * K, dz * speed * K,
        { life: rand(1.5, 2.2), drag: 1.35, gravity: 4.5, r: col[0] * I, g: col[1] * I, b: col[2] * I, ...o, size: (o.size || 0.24) * 1.7, flags: o.flags ?? (4 | 2) }, tail + 2, gap);

    if (type === 'peony') {
      const n = 170;
      for (let i = 0; i < n; i++) { const d = sphereDir(i, n); star(d[0], d[1], d[2], rand(10, 11.5), C); }
    } else if (type === 'chrys') {
      const n = 140;
      for (let i = 0; i < n; i++) { const d = sphereDir(i, n); star(d[0], d[1], d[2], rand(11, 12.5), C, { flags: 4 }, 7, 0.026); }
    } else if (type === 'willow') {
      const G = COLORS.gold, n = 120;
      for (let i = 0; i < n; i++) {
        const d = sphereDir(i, n);
        star(d[0], d[1], d[2], rand(8, 9.5), G, { life: rand(3.6, 4.6), drag: 0.95, gravity: 2.4, size: 0.2, flags: 2 | 1 }, 9, 0.055);
      }
    } else if (type === 'ring') {
      const n = 100;
      const ax = new THREE.Vector3(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize();
      const u = new THREE.Vector3().crossVectors(ax, new THREE.Vector3(0, 0, 1)).normalize();
      const v = new THREE.Vector3().crossVectors(ax, u);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        _v.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
        star(_v.x, _v.y, _v.z, 11, C, {}, 4);
      }
      const c2 = COLORS[pickColor(c1)];
      for (let i = 0; i < 50; i++) { const d = sphereDir(i, 50); star(d[0], d[1], d[2], 4, c2, { size: 0.18 }, 1); }
    } else if (type === 'double') {
      const c2 = COLORS[pickColor(c1)];
      for (let i = 0; i < 90; i++) { const d = sphereDir(i, 90); star(d[0], d[1], d[2], 6, c2, {}, 2); }
      for (let i = 0; i < 150; i++) { const d = sphereDir(i, 150); star(d[0], d[1], d[2], 12, C, {}, 4); }
    } else if (type === 'crackle') {
      const G = COLORS.gold;
      for (let i = 0; i < 80; i++) { const d = sphereDir(i, 80); star(d[0], d[1], d[2], 10, G, { flags: 2 }, 5, 0.03); }
      for (let i = 0; i < 320; i++) {
        const d = sphereDir(i, 320), r = rand(4, 8);
        S.emit(p.x + d[0] * r, p.y + d[1] * r - 1.5, p.z + d[2] * r, rand(-1, 1), rand(-1, 1), rand(-1, 1),
          { life: rand(0.08, 0.2), delay: rand(1.0, 1.6), r: 4, g: 3.6, b: 3, size: 0.2, flags: 0 });
      }
      audio.crackle(0.7, 60, 1.0 + dist / 340, 0.1);
    } else if (type === 'palm') {
      const G = COLORS.gold;
      for (let a = 0; a < 8; a++) {
        const d = sphereDir(a * 3 + 1, 26);
        if (d[1] < -0.2) d[1] = -d[1];
        for (let k = 0; k < 10; k++) star(d[0] + rand(-0.05, 0.05), d[1], d[2] + rand(-0.05, 0.05), rand(9, 12), G, { size: 0.28, life: rand(2.2, 2.8), flags: 2 | 1 }, 6, 0.04);
      }
    } else if (type === 'heart') {
      const n = 120;
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const x = 16 * Math.pow(Math.sin(t), 3) / 16;
        const y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
        star(x, y, 0, 10, COLORS.magenta, { gravity: 1.2 }, 3);
      }
    }
    // glitter core
    for (let i = 0; i < 40; i++) {
      const d = sphereDir(i, 40);
      S.emit(p.x, p.y, p.z, d[0] * 3, d[1] * 3, d[2] * 3, { life: rand(0.6, 1.2), drag: 2, gravity: 1, r: 3, g: 2.8, b: 2.4, size: 0.12, flags: 1 });
    }
    this.glows.flash(p.x, p.y, p.z, 34, new THREE.Color(C[0], C[1], C[2]), 0.9, 6);
    this.lightFlash(p, C, 1);
    this.sky?.flash(new THREE.Color(C[0], C[1], C[2]), 0.22);
    audio.boom(0.6 + Math.random() * 0.3, dist / 340);
    audio.crackle(0.9, 14, dist / 340 + 0.2, 0.05);
  }

  // ------------------------------------------------------------ ground crackers
  /** Anar / flower pot: a roaring golden fountain. */
  anar(pos, duration = 7) {
    const pot = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 16), this.clay);
    pot.position.copy(pos).add(new THREE.Vector3(0, 0.21, 0));
    this.scene.add(pot);
    const glow = this.glows.alloc();
    const start = clock.t;
    audio.loop('roar', true, 0.18);
    const tip = pos.clone().add(new THREE.Vector3(0, 0.42, 0));
    let acc = 0;
    this.emitters.push((dt) => {
      const age = clock.t - start;
      const env = Math.min(1, age / 0.8) * Math.min(1, Math.max(0, (duration - age) / 1.8));
      if (age > duration) {
        this.glows.release(glow);
        audio.loop('roar', false);
        setTimeout(() => this.scene.remove(pot), 1500);
        return false;
      }
      acc += 520 * env * dt;
      while (acc > 1) {
        acc--;
        const a = Math.random() * Math.PI * 2, s = Math.random() * 0.32 * (0.7 + env * 0.3);
        const sp = rand(6, 10.5) * (0.55 + env * 0.45);
        const kind = Math.random();
        const col = kind < 0.55 ? [3.2, 1.9, 0.6] : kind < 0.85 ? [3.4, 3.2, 3.0] : [1.2, 3.0, 1.0];
        this.sparks.streak(tip.x, tip.y, tip.z, Math.cos(a) * s * sp, sp, Math.sin(a) * s * sp,
          { life: rand(0.9, 1.6), drag: 0.45, gravity: 9, r: col[0], g: col[1], b: col[2], size: 0.07, flags: kind > 0.55 ? 1 : 2 }, 2, 0.02);
      }
      const fl = env * (0.8 + Math.random() * 0.4);
      this.glows.set(glow, tip.x, tip.y + 0.6, tip.z, 4.5, 1.6 * fl, 1.0 * fl, 0.4 * fl);
      if (Math.random() < 0.3) this.lightFlash(tip, [1, 0.65, 0.3], 0.12 * env);
      return true;
    });
  }

  /** Chakri / chakra: a ground spinner throwing a spiral of sparks. */
  chakri(pos, duration = 6.5) {
    const disc = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 20), this.paper);
    disc.rotation.x = Math.PI / 2;
    disc.position.copy(pos).add(new THREE.Vector3(0, 0.06, 0));
    this.scene.add(disc);
    const glow = this.glows.alloc();
    const start = clock.t;
    let ang = 0, acc = 0;
    const p = pos.clone().add(new THREE.Vector3(0, 0.08, 0));
    const scheme = [[[3.2, 1.8, 0.5], [0.8, 3.0, 1.0]], [[3.2, 1.8, 0.5], [3.0, 0.5, 0.6]], [[3.2, 1.8, 0.5], [3.2, 3.2, 3.2]]][(Math.random() * 3) | 0];
    audio.loop('whirr', true, 0.14);
    this.emitters.push((dt) => {
      const age = clock.t - start;
      if (age > duration) {
        this.glows.release(glow);
        audio.loop('whirr', false);
        setTimeout(() => this.scene.remove(disc), 800);
        return false;
      }
      const env = Math.min(1, age / 0.5) * Math.min(1, (duration - age) / 1.2);
      const w = 26 * env + 4;
      ang += w * dt;
      p.x += (Math.random() - 0.5) * dt * 1.2;
      p.z += (Math.random() - 0.5) * dt * 1.2;
      disc.position.x = p.x; disc.position.z = p.z;
      disc.rotation.z = ang;
      acc += 520 * env * dt;
      const steps = Math.floor(acc);
      acc -= steps;
      for (let k = 0; k < steps; k++) {
        const a = ang - (k / Math.max(steps, 1)) * w * dt;
        const rx = Math.cos(a), rz = Math.sin(a);
        const sp = rand(6, 10);
        const col = scheme[(Math.floor(age * 2) + (k & 1)) % 2];
        this.sparks.streak(p.x + rx * 0.2, p.y, p.z + rz * 0.2, -rz * sp + rx * 1.2, rand(0.5, 2.5), rx * sp + rz * 1.2,
          { life: rand(0.45, 0.85), drag: 1.8, gravity: 5, r: col[0], g: col[1], b: col[2], size: 0.085, flags: 4 }, 3, 0.014);
      }
      this.glows.set(glow, p.x, p.y + 0.2, p.z, 4.5, 1.6 * env, 1.0 * env, 0.4 * env);
      if (Math.random() < 0.25) this.lightFlash(p, [1, 0.7, 0.35], 0.08 * env);
      return true;
    });
  }

  /** A glass bottle with a paper rocket on a stick standing in it. */
  bottleRocket(pos) {
    if (!this.bottleGeo) {
      const prof = [[0, 0], [0.1, 0], [0.11, 0.01], [0.11, 0.3], [0.1, 0.34], [0.05, 0.42], [0.04, 0.48], [0.045, 0.5], [0.038, 0.5]]
        .map(([x, y]) => new THREE.Vector2(x, y));
      this.bottleGeo = new THREE.LatheGeometry(prof, 24);
      this.glass = new THREE.MeshPhysicalMaterial({ color: 0x2f6a3a, roughness: 0.08, metalness: 0, transmission: 0.0, transparent: true, opacity: 0.55, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
      this.rocketParts = {
        body: new THREE.CylinderGeometry(0.032, 0.032, 0.2, 12),
        tip: new THREE.ConeGeometry(0.034, 0.08, 12),
        stick: new THREE.CylinderGeometry(0.005, 0.005, 0.62, 5),
        band: new THREE.CylinderGeometry(0.034, 0.034, 0.03, 12),
      };
      this.stickMat = new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.9 });
    }
    const bottle = new THREE.Mesh(this.bottleGeo, this.glass);
    bottle.position.copy(pos);
    bottle.renderOrder = 3;
    const rocket = new THREE.Group();
    const body = new THREE.Mesh(this.rocketParts.body, this.paper); body.position.y = 0.1;
    const band = new THREE.Mesh(this.rocketParts.band, this.gold); band.position.y = 0.16;
    const tip = new THREE.Mesh(this.rocketParts.tip, this.gold); tip.position.y = 0.24;
    const stick = new THREE.Mesh(this.rocketParts.stick, this.stickMat); stick.position.set(0.035, -0.29, 0);
    rocket.add(body, band, tip, stick);
    // stand it in the bottle: stick down the neck, body just above the mouth
    rocket.position.copy(pos).add(new THREE.Vector3(-0.03, 0.56, 0));
    this.scene.add(bottle, rocket);
    return { bottle, rocket };
  }

  /** Ground rocket with a mind of its own — fizzes in its bottle, then swerves, loops, zig-zags. */
  rocket(pos) {
    const { bottle, rocket } = this.bottleRocket(pos);
    const fuse = 1.1;
    const life = rand(1.8, 2.8);
    const start = clock.t;
    const p = rocket.position.clone();
    const tilt = rand(0, 0.35), az = rand(0, Math.PI * 2);
    const v = new THREE.Vector3(Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az)).multiplyScalar(13);
    const swerve = new THREE.Vector3();
    let nextSwerve = 0, launched = false;
    const prev = p.clone();
    const glow = this.glows.alloc();
    const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    audio.fuse(fuse);
    const cleanup = () => {
      this.glows.release(glow);
      this.scene.remove(rocket);
      setTimeout(() => this.scene.remove(bottle), 5000);
    };
    this.emitters.push((dt) => {
      const age = clock.t - start;
      if (age < fuse) {
        // fuse fizzing at the rocket's tail
        const tx = p.x, ty = p.y - 0.01, tz = p.z;
        for (let i = 0; i < 4; i++) this.sparks.emit(tx, ty, tz, rand(-1.5, 1.5), rand(-0.5, 2), rand(-1.5, 1.5), { life: rand(0.12, 0.3), drag: 3, gravity: 5, r: 3.5, g: 2.3, b: 1, size: 0.03, flags: 4 });
        this.glows.set(glow, tx, ty, tz, 0.6, 1.2, 0.7, 0.3);
        return true;
      }
      if (!launched) { launched = true; audio.launch(life, 0.08); this.glows.flash(p.x, p.y, p.z, 2.5, new THREE.Color(1, 0.7, 0.4), 2, 8); }
      const fl = age - fuse;
      if (fl > life || p.y < -0.2) {
        cleanup();
        this.miniPop(p);
        return false;
      }
      if (fl > nextSwerve) {
        nextSwerve = fl + rand(0.08, 0.28);
        swerve.set(rand(-1, 1), rand(-0.6, 0.9), rand(-1, 1)).normalize().multiplyScalar(fl < 0.25 ? 10 : rand(40, 85));
      }
      v.addScaledVector(swerve, dt);
      v.y -= 4 * dt;
      // a corkscrew wobble on top of the swerves
      v.x += Math.sin(fl * 31) * 18 * dt;
      v.z += Math.cos(fl * 27) * 18 * dt;
      v.setLength(THREE.MathUtils.clamp(v.length(), 8, 17));
      prev.copy(p);
      p.addScaledVector(v, dt);
      if (p.y < 0.2 && v.y < 0) { v.y = Math.abs(v.y) * 0.8; p.y = 0.2; }
      rocket.position.copy(p);
      rocket.quaternion.setFromUnitVectors(up, dir.copy(v).normalize());
      // exhaust from the tail, behind the body
      const tail = p.clone().addScaledVector(dir, -0.02);
      const ptail = prev.clone().addScaledVector(dir, -0.02);
      const n = 7;
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const x = ptail.x + (tail.x - ptail.x) * t, y = ptail.y + (tail.y - ptail.y) * t, z = ptail.z + (tail.z - ptail.z) * t;
        this.sparks.emit(x, y, z, -v.x * 0.1 + rand(-0.6, 0.6), -v.y * 0.1 + rand(-0.6, 0.6), -v.z * 0.1 + rand(-0.6, 0.6),
          { life: rand(0.45, 0.9), drag: 1.5, gravity: 2, r: 3.0, g: 1.6, b: 0.45, size: 0.07, flags: 2 });
      }
      this.glows.set(glow, tail.x, tail.y, tail.z, 1.3, 2.0, 1.1, 0.4);
      return true;
    });
  }

  miniPop(p) {
    const c = COLORS[pickColor()];
    for (let i = 0; i < 46; i++) {
      const d = sphereDir(i, 46);
      this.sparks.streak(p.x, p.y, p.z, d[0] * 5, d[1] * 5, d[2] * 5, { life: rand(0.5, 0.9), drag: 2, gravity: 3, r: c[0] * 3, g: c[1] * 3, b: c[2] * 3, size: 0.12, flags: 4 }, 2, 0.02);
    }
    this.glows.flash(p.x, p.y, p.z, 6, new THREE.Color(c[0], c[1], c[2]), 1.5, 8);
    audio.boom(0.35);
  }

  /** Sutli bomb: hissing fuse, then a flash, a shockwave and a cloud of smoke. */
  bomb(pos) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 16), this.paper);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.07, 16), this.gold);
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5), this.clay);
    body.position.y = 0.15; band.position.y = 0.15; fuse.position.set(0.04, 0.42, 0); fuse.rotation.z = -0.3;
    g.add(body, band, fuse);
    g.position.copy(pos);
    this.scene.add(g);
    const fuseDur = 1.9;
    const start = clock.t;
    const glow = this.glows.alloc();
    audio.fuse(fuseDur);
    this.emitters.push(() => {
      const age = clock.t - start;
      if (age < fuseDur) {
        const k = 1 - age / fuseDur;
        const tip = new THREE.Vector3(pos.x + 0.04 + 0.08 * k, pos.y + 0.3 + 0.27 * k, pos.z);
        fuse.scale.y = Math.max(0.05, k);
        fuse.position.y = 0.3 + 0.15 * k;
        for (let i = 0; i < 6; i++) {
          this.sparks.emit(tip.x, tip.y, tip.z, rand(-2, 2), rand(0, 3), rand(-2, 2), { life: rand(0.15, 0.35), drag: 3, gravity: 6, r: 3.5, g: 2.4, b: 1.2, size: 0.04, flags: 4 });
        }
        this.glows.set(glow, tip.x, tip.y, tip.z, 1.0, 1.5, 0.9, 0.4);
        return true;
      }
      this.glows.release(glow);
      this.scene.remove(g);
      this.explode(pos.clone().add(new THREE.Vector3(0, 0.2, 0)));
      return false;
    });
  }

  explode(p) {
    const S = this.sparks;
    this.glows.flash(p.x, p.y + 0.6, p.z, 16, new THREE.Color(1, 0.7, 0.4), 1.6, 7);
    this.glows.flash(p.x, p.y, p.z, 4, new THREE.Color(1, 1, 1), 3, 12);
    this.lightFlash(p.clone().add(new THREE.Vector3(0, 1.5, 0)), [1, 0.7, 0.4], 0.6);
    this.sky?.flash(new THREE.Color(1, 0.6, 0.3), 0.5);
    for (let i = 0; i < 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      S.emit(p.x, p.y, p.z, Math.cos(a) * 16, rand(0, 1.2), Math.sin(a) * 16, { life: rand(0.25, 0.45), drag: 4, gravity: 0, r: 3.5, g: 2.6, b: 1.6, size: 0.12, flags: 4 });
    }
    for (let i = 0; i < 220; i++) {
      const d = sphereDir(i, 220);
      const dy = Math.abs(d[1]);
      S.streak(p.x, p.y, p.z, d[0] * rand(8, 18), dy * rand(8, 18), d[2] * rand(8, 18),
        { life: rand(0.45, 1.1), drag: 2.2, gravity: 7, r: 3.6, g: 2.2, b: 0.9, size: 0.12, flags: 4 | 2 }, 4, 0.014);
    }
    for (let i = 0; i < 80; i++) {
      const red = Math.random() < 0.7;
      this.smoke.emit(p.x, p.y + 0.2, p.z, rand(-4, 4), rand(2, 7), rand(-4, 4),
        { life: rand(2.5, 4), drag: 1.6, gravity: 2.5, r: red ? 0.5 : 0.55, g: red ? 0.04 : 0.45, b: red ? 0.03 : 0.25, size: 0.07, flags: 16 });
    }
    for (let i = 0; i < 26; i++) {
      const g = rand(0.1, 0.16);
      this.smoke.emit(p.x + rand(-0.4, 0.4), p.y + rand(0, 0.6), p.z + rand(-0.4, 0.4), rand(-1.5, 1.5), rand(0.8, 2.4), rand(-1.5, 1.5),
        { life: rand(3, 5.5), drag: 0.9, gravity: -0.3, r: g * 1.15, g: g, b: g * 0.95, size: rand(0.35, 0.6), flags: 8 });
    }
    audio.boom(1.9);
    audio.crackle(0.4, 30, 0.05, 0.16);
    shake(1.4);
  }

  update(dt) {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (clock.t >= this.events[i].t) { const e = this.events[i]; this.events.splice(i, 1); e.fn(); }
    }
    this.emitters = this.emitters.filter((f) => f(dt));
    for (const L of this.lights) { L.k *= Math.exp(-dt * 7); L.l.intensity = L.k; }
  }
}

// ------------------------------------------------------------ phuljhadi
/** Sur-sur kaddi / nakshatra kaddi — held at the pointer, lit from a diya. */
export class Sparkler {
  constructor(scene, sparks, glows) {
    this.sparks = sparks; this.glows = glows;
    this.group = new THREE.Group();
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.1, 6), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.4 }));
    wire.position.y = -0.55;
    this.coat = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x3d3a36, roughness: 1 }));
    this.coat.position.y = -0.3;
    this.group.add(wire, this.coat);
    this.group.visible = false;
    scene.add(this.group);
    this.light = new THREE.PointLight(0xffb060, 0, 16, 1.5);
    scene.add(this.light);
    this.tip = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.lit = false;
    this.active = false;
    this.glow = -1;
    this.acc = 0;
    this._grip = new THREE.Vector3();
  }

  setActive(on) {
    this.active = on;
    this.group.visible = on;
    if (!on) this.extinguish();
    this.reset();
    this.fresh = true;
  }

  ignite() {
    if (this.lit || this.spent) return;
    this.lit = true;
    this.litAt = clock.t;
    this.glow = this.glows.alloc();
    audio.ignite();
    audio.loop('sizzle', true, 0.2);
    for (let i = 0; i < 80; i++) {
      const d = sphereDir(i, 80);
      this.sparks.streak(this.tip.x, this.tip.y, this.tip.z, d[0] * 4, d[1] * 4, d[2] * 4, { life: rand(0.2, 0.5), drag: 3, gravity: 3, r: 4, g: 3, b: 1.6, size: 0.03, flags: 4 }, 3, 0.01);
    }
  }

  /** A fresh, unlit sparkler in hand. */
  reset() {
    this.spent = false;
    this.burn = 0;
    this.coat.visible = true;
  }

  extinguish() {
    if (!this.lit) return;
    this.lit = false;
    this.glows.release(this.glow); this.glow = -1;
    this.light.intensity = 0;
    audio.loop('sizzle', false);
  }

  /** tip: where the pointer is, in world space. */
  update(dt, tip) {
    if (!this.active) return;
    if (this.fresh) { this.tip.copy(tip); this.prev.copy(tip); this.fresh = false; }
    this.prev.copy(this.tip);
    this.tip.lerp(tip, Math.min(1, dt * 22));
    // stick hangs down-right from the tip toward the viewer's hand
    const camRight = _v.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this._grip.copy(this.tip).addScaledVector(camRight, 0.35).add(new THREE.Vector3(0, -1.0, 0));
    const toward = new THREE.Vector3().subVectors(camera.position, this.tip).normalize();
    this._grip.addScaledVector(toward, 0.35);
    const dir = new THREE.Vector3().subVectors(this.tip, this._grip).normalize();
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    // the grey coating burns down the wire; keep the burning point at the pointer
    const s = 1 - this.burn * 0.92;
    this.coat.scale.y = s;
    this.coat.position.y = -0.6 + 0.3 * s;
    this.group.position.copy(this.tip).addScaledVector(dir, 0.6 - 0.6 * s);

    if (this.spent && clock.t - this.spentAt > 1.8) this.reset();
    if (!this.lit) return;
    const age = clock.t - this.litAt;
    this.burn = Math.min(1, age / Sparkler.BURN);
    if (age >= Sparkler.BURN) {
      this.extinguish();
      this.spent = true;
      this.spentAt = clock.t;
      this.coat.visible = false;
      // a last dying ember
      this.sparks.emit(this.tip.x, this.tip.y, this.tip.z, 0, -0.2, 0, { life: 1.4, r: 1.2, g: 0.3, b: 0.05, size: 0.05, flags: 2 });
      this.onBurnout?.();
      return;
    }
    // sputter out over the last two seconds
    const env = Math.min(1, (Sparkler.BURN - age) / 2);
    const t = this.tip, p = this.prev;
    // long-exposure trail: stationary embers that linger and cool
    const d = t.distanceTo(p);
    const n = Math.min(80, Math.ceil(d / 0.01));
    for (let k = 0; k < n; k++) {
      const f = k / n;
      const x = p.x + (t.x - p.x) * f, y = p.y + (t.y - p.y) * f, z = p.z + (t.z - p.z) * f;
      this.sparks.emit(x, y, z, 0, -0.03, 0, { life: rand(1.5, 2.0), r: 1.5, g: 0.82, b: 0.24, size: 0.03, flags: 2, delay: -(1 - f) * dt });
      if (k % 4 === 0) this.sparks.emit(x, y, z, 0, 0, 0, { life: 1.0, r: 0.16, g: 0.06, b: 0.012, size: 0.14, flags: 2, delay: -(1 - f) * dt });
    }
    // crackling star sparks with secondary branches
    this.acc += 420 * dt * env * env;
    while (this.acc > 1) {
      this.acc--;
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const sp = Math.random() < 0.25 ? rand(6, 11) : rand(2, 6);
      const vx = r * Math.cos(a) * sp, vy = u * sp, vz = r * Math.sin(a) * sp;
      const life = rand(0.2, 0.7);
      this.sparks.streak(t.x, t.y, t.z, vx, vy, vz, { life, drag: 2.6, gravity: 3, r: 3.4, g: 2.2, b: 0.9, size: 0.022, flags: 4 | 2 }, 6, 0.011);
      if (Math.random() < 0.12) {
        const tau = life * 0.85, k = 2.8;
        const fd = (1 - Math.exp(-k * tau)) / k, fg = (tau - fd) / k;
        const bx = t.x + vx * fd, by = t.y + vy * fd - 3 * fg, bz = t.z + vz * fd;
        for (let j = 0; j < 5; j++) {
          const d2 = sphereDir(j, 5);
          this.sparks.streak(bx, by, bz, d2[0] * 1.6 + rand(-0.5, 0.5), d2[1] * 1.6, d2[2] * 1.6 + rand(-0.5, 0.5),
            { life: rand(0.08, 0.16), delay: tau, drag: 3, gravity: 2, r: 4, g: 3.2, b: 2, size: 0.018, flags: 0 }, 1, 0.01);
        }
      }
    }
    const fl = (0.8 + Math.random() * 0.4) * (0.25 + 0.75 * env);
    this.glows.set(this.glow, t.x, t.y, t.z, 0.9, 2.2 * fl, 1.4 * fl, 0.6 * fl);
    this.light.position.copy(t);
    this.light.intensity = 4.5 * fl;
  }
}
Sparkler.BURN = 10; // seconds a sparkler lasts
