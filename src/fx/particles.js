import * as THREE from 'three';
import { clock } from '../time.js';
import { pointScale } from '../stage.js';

// GPU-analytic particles: each particle is written once (start, velocity,
// drag, gravity, life) and its whole trajectory is evaluated in the vertex
// shader. Spawning is a ring-buffer write; nothing is simulated on the CPU.
//
// flags: 1 = twinkle, 2 = cool to ember red, 4 = hot white flash at birth,
//        8 = grow (smoke), 16 = flutter (petals/paper)
export class Particles {
  constructor(scene, { capacity = 40000, additive = true, renderOrder = 5 } = {}) {
    this.cap = capacity;
    this.head = 0;
    this.dirtyMin = Infinity;
    this.dirtyMax = -1;
    const g = new THREE.BufferGeometry();
    this.p0 = new Float32Array(capacity * 3);
    this.v = new Float32Array(capacity * 3);
    this.t = new Float32Array(capacity * 4); // t0, life, drag, gravity
    this.c = new Float32Array(capacity * 4); // rgb, size
    this.f = new Float32Array(capacity * 2); // flags, seed
    this.t.fill(-1000);
    const mk = (arr, n) => { const a = new THREE.BufferAttribute(arr, n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.attrs = [mk(this.p0, 3), mk(this.v, 3), mk(this.t, 4), mk(this.c, 4), mk(this.f, 2)];
    g.setAttribute('position', this.attrs[0]);
    g.setAttribute('aV', this.attrs[1]);
    g.setAttribute('aT', this.attrs[2]);
    g.setAttribute('aC', this.attrs[3]);
    g.setAttribute('aF', this.attrs[4]);
    this.uniforms = { uTime: { value: 0 }, uScale: pointScale };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aV; attribute vec4 aT, aC; attribute vec2 aF;
        uniform float uTime, uScale;
        varying vec4 vCol;
        float hash(float n){ return fract(sin(n) * 43758.5453); }
        void main(){
          float age = uTime - aT.x;
          float life = aT.y;
          if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
          float k = aT.z, gr = aT.w;
          float fd = k > 0.0 ? (1.0 - exp(-k * age)) / k : age;
          float fg = k > 0.0 ? (age - fd) / k : 0.5 * age * age;
          vec3 p = position + aV * fd;
          p.y -= gr * fg;
          float flags = aF.x, seed = aF.y;
          if (mod(floor(flags / 16.0), 2.0) == 1.0) {
            p.x += sin(age * 3.0 + seed * 6.0) * 0.25 * min(age, 1.0);
            p.z += cos(age * 2.3 + seed * 4.0) * 0.25 * min(age, 1.0);
          }
          float u = age / life;
          vec3 col = aC.rgb;
          float a = pow(1.0 - u, 1.4);
          if (mod(floor(flags / 2.0), 2.0) == 1.0) col = mix(col, vec3(1.0, 0.18, 0.04) * length(col) * 0.5, smoothstep(0.35, 1.0, u));
          if (mod(floor(flags / 4.0), 2.0) == 1.0) col = mix(vec3(1.0, 0.95, 0.85) * max(max(col.r, col.g), col.b) * 1.4, col, smoothstep(0.0, 0.12, u));
          if (mod(flags, 2.0) == 1.0) a *= step(0.45, hash(floor(uTime * 22.0) + seed * 91.0)) * 1.6;
          float size = aC.a;
          if (mod(floor(flags / 8.0), 2.0) == 1.0) { size *= 1.0 + u * 3.0; a = smoothstep(0.0, 0.1, u) * (1.0 - u) * 0.45; }
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float px = size * uScale / max(-mv.z, 0.05);
          if (px < 1.5) { a *= px / 1.5; px = 1.5; }
          gl_PointSize = min(px, 256.0);
          vCol = vec4(col, a);
        }`,
      fragmentShader: additive
        ? /* glsl */ `varying vec4 vCol; void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard; float f = (exp(-r * r * 4.0) + exp(-r * r * 18.0)) * (1.0 - smoothstep(0.6, 1.0, r)); gl_FragColor = vec4(vCol.rgb * f * vCol.a, 1.0); }`
        : /* glsl */ `varying vec4 vCol; void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q) * 2.0; float a = pow(max(1.0 - d, 0.0), 1.5) * vCol.a; if (a < 0.01) discard; gl_FragColor = vec4(vCol.rgb, a); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
    scene.add(this.points);
  }

  /** Spawn one particle. `delay` shifts the birth time (used for trails). */
  emit(x, y, z, vx, vy, vz, { life = 1, drag = 0, gravity = 0, r = 1, g = 1, b = 1, size = 0.1, flags = 0, delay = 0 } = {}) {
    const i = this.head;
    this.head = (this.head + 1) % this.cap;
    const i3 = i * 3, i4 = i * 4, i2 = i * 2;
    this.p0[i3] = x; this.p0[i3 + 1] = y; this.p0[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.t[i4] = clock.t + delay; this.t[i4 + 1] = life; this.t[i4 + 2] = drag; this.t[i4 + 3] = gravity;
    this.c[i4] = r; this.c[i4 + 1] = g; this.c[i4 + 2] = b; this.c[i4 + 3] = size;
    this.f[i2] = flags; this.f[i2 + 1] = Math.random();
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
  }

  /**
   * A star plus `tail` lagging copies of itself. Copies share the trajectory
   * but are born later, so at any moment they sit where the star *was* — a streak.
   */
  streak(x, y, z, vx, vy, vz, opts, tail = 4, gap = 0.018) {
    this.emit(x, y, z, vx, vy, vz, opts);
    const base = opts.size ?? 0.1;
    for (let k = 1; k <= tail; k++) {
      const f = 1 - k / (tail + 1);
      this.emit(x, y, z, vx, vy, vz, {
        ...opts,
        delay: (opts.delay || 0) + k * gap,
        life: Math.max(0.05, opts.life - k * gap),
        size: base * (0.45 + 0.55 * f),
        r: opts.r * f, g: opts.g * f, b: opts.b * f,
      });
    }
  }

  update() {
    this.uniforms.uTime.value = clock.t;
    if (this.dirtyMax >= 0) {
      const lo = this.dirtyMin, n = this.dirtyMax - lo + 1;
      const sizes = [3, 3, 4, 4, 2];
      this.attrs.forEach((a, k) => {
        a.clearUpdateRanges();
        a.addUpdateRange(lo * sizes[k], n * sizes[k]);
        a.needsUpdate = true;
      });
      this.dirtyMin = Infinity;
      this.dirtyMax = -1;
    }
  }
}
