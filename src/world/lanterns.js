import * as THREE from 'three';
import { NOISE } from '../glsl.js';
import { clock } from '../time.js';

// Akash deep — paper sky lanterns that carry wishes up and over the river.
export class Lanterns {
  constructor(scene, glows, capacity = 70) {
    this.glows = glows;
    this.cap = capacity;
    const geo = new THREE.CylinderGeometry(0.42, 0.3, 1.0, 16, 4, true);
    geo.translate(0, 0.5, 0);
    this.seed = new THREE.InstancedBufferAttribute(new Float32Array(capacity).map(() => Math.random()), 1);
    geo.setAttribute('iSeed', this.seed);
    this.uniforms = { uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float iSeed; varying vec2 vUv; varying float vSeed; varying vec3 vN, vV;
        void main(){
          vUv = uv; vSeed = iSeed;
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        ${NOISE}
        uniform float uTime; varying vec2 vUv; varying float vSeed; varying vec3 vN, vV;
        void main(){
          float y = vUv.y;
          float seams = 0.8 + 0.2 * smoothstep(0.0, 0.06, abs(fract(vUv.x * 6.0) - 0.5));
          float flick = 0.85 + 0.25 * vnoise(vec2(uTime * 5.0, vSeed * 30.0));
          vec3 hot = vec3(1.0, 0.5, 0.14), edge = vec3(0.85, 0.16, 0.03);
          if (vSeed > 0.75) edge = vec3(0.95, 0.12, 0.2);
          float rim = 1.0 - abs(dot(vN, vV));
          vec3 c = mix(hot, edge, smoothstep(0.0, 0.9, y) * 0.8 + rim * 0.4);
          float inten = mix(1.25, 0.32, y) * flick * seams;
          gl_FragColor = vec4(c * inten * 0.75, 1.0);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.count = capacity;
    this.items = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    for (let i = 0; i < capacity; i++) {
      this.items.push({ alive: false, glow: -1 });
      this.mesh.setMatrixAt(i, this._m.makeScale(0, 0, 0));
    }
    scene.add(this.mesh);
    this.next = 0;
  }

  release(x, y, z) {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    const it = this.items[i];
    if (it.glow < 0) it.glow = this.glows.alloc();
    Object.assign(it, {
      alive: true, x, y, z, born: clock.t,
      vy: 0.9 + Math.random() * 0.6,
      drift: (Math.random() - 0.5) * 0.4,
      toward: -0.6 - Math.random() * 0.6,
      ph: Math.random() * 10,
      s: 0.85 + Math.random() * 0.35,
    });
  }

  update(dt) {
    const t = clock.t;
    this.uniforms.uTime.value = t;
    for (let i = 0; i < this.cap; i++) {
      const it = this.items[i];
      if (!it.alive) continue;
      const age = t - it.born;
      const lift = Math.min(1, age / 1.5);
      it.y += it.vy * lift * dt;
      it.x += (it.drift + Math.sin(t * 0.4 + it.ph) * 0.25) * dt;
      it.z += it.toward * lift * dt;
      const grow = Math.min(1, age / 0.6) * it.s;
      const fade = it.y > 70 ? Math.max(0, 1 - (it.y - 70) / 25) : 1;
      if (fade <= 0) {
        it.alive = false;
        this.glows.release(it.glow); it.glow = -1;
        this.mesh.setMatrixAt(i, this._m.makeScale(0, 0, 0));
        continue;
      }
      this._e.set(Math.sin(t * 0.8 + it.ph) * 0.08, t * 0.2 + it.ph, Math.cos(t * 0.6 + it.ph) * 0.08);
      this._q.setFromEuler(this._e);
      this._m.compose(this._p.set(it.x, it.y, it.z), this._q, this._s.setScalar(grow * fade));
      this.mesh.setMatrixAt(i, this._m);
      const k = grow * fade * (0.85 + 0.15 * Math.sin(t * 9 + it.ph));
      this.glows.set(it.glow, it.x, it.y + 0.3 * grow, it.z, 3.0 * grow, 0.32 * k, 0.12 * k, 0.03 * k);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
