import * as THREE from 'three';
import { BILLBOARD } from '../glsl.js';

// Soft additive halos (lantern bodies, sparkler tips, explosion flashes).
// CPU owns position/size/colour per slot; one draw call for all of them.
export class Glows {
  constructor(scene, capacity = 160) {
    this.cap = capacity;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.pos);
    g.setAttribute('iCol', this.col);
    g.instanceCount = capacity;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 iPos; attribute vec4 iCol; varying vec2 vUv; varying vec3 vC;
        ${BILLBOARD}
        void main(){
          vUv = uv; vC = iCol.rgb;
          gl_Position = projectionMatrix * billboard(iPos, position.xy * iCol.a);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vC;
        void main(){ float d = length(vUv - 0.5) * 2.0; float f = exp(-d * d * 5.0) * 0.6 + exp(-d * 14.0) * 0.8; f *= smoothstep(1.0, 0.7, d); gl_FragColor = vec4(vC * f, 1.0); }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    this.free = [];
    for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
    this.flashes = [];
  }

  alloc() { return this.free.pop() ?? -1; }
  release(i) { if (i < 0) return; this.set(i, 0, 0, 0, 0, 0, 0, 0); this.free.push(i); }

  set(i, x, y, z, size, r, g, b) {
    if (i < 0) return;
    this.pos.array.set([x, y, z], i * 3);
    this.col.array.set([r, g, b, size], i * 4);
    this.pos.needsUpdate = this.col.needsUpdate = true;
  }

  /** One-shot flash that decays on its own. */
  flash(x, y, z, size, color, intensity = 3, decay = 5) {
    const i = this.alloc();
    if (i < 0) return;
    this.flashes.push({ i, x, y, z, size, color, k: intensity, decay });
  }

  update(dt) {
    for (let n = this.flashes.length - 1; n >= 0; n--) {
      const f = this.flashes[n];
      f.k *= Math.exp(-dt * f.decay);
      if (f.k < 0.02) { this.release(f.i); this.flashes.splice(n, 1); continue; }
      this.set(f.i, f.x, f.y, f.z, f.size * (1.2 - 0.2 * f.k / 3), f.color.r * f.k, f.color.g * f.k, f.color.b * f.k);
    }
  }
}
