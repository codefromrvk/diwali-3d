import * as THREE from 'three';
import gsap from 'gsap';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { clock } from './time.js';

export const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05040c);
scene.fog = new THREE.FogExp2(0x0d0a1e, 0.0042);

export const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 1500);

// Shared uniform: converts a world-space size into pixels for point sprites.
export const pointScale = { value: 1 };

// ---------- post ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.62, 0.42, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uFade: { value: 1 },
    uRes: { value: new THREE.Vector2(innerWidth, innerHeight) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uFade; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec2 dc = vUv - 0.5;
      float d2 = dot(dc, dc);
      vec2 off = dc * d2 * 0.012;
      vec3 c = vec3(texture2D(tDiffuse, vUv - off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + off).b);
      float vig = smoothstep(1.05, 0.28, length(dc * vec2(1.0, 0.85)) * 1.25);
      c *= mix(0.55, 1.0, vig);
      c += (h(vUv * uRes + fract(uTime * 7.13) * 431.0) - 0.5) * 0.045;
      gl_FragColor = vec4(c * (1.0 - uFade), 1.0);
    }`,
});
composer.addPass(finish);

export function fadeTo(v, duration = 1.6, ease = 'power2.inOut') {
  return gsap.to(finish.uniforms.uFade, { value: v, duration, ease });
}

// ---------- camera rig ----------
export const rig = {
  pos: new THREE.Vector3(0, 40, -60),
  target: new THREE.Vector3(0, 60, 40),
  fov: 45,
  parallax: 1,
  shake: 0,
};
let shotTween = null;

/** Glide the camera to a new framing. Optional `via` bends the path (quadratic bezier). */
export function shot({ pos, target, fov = rig.fov, duration = 4, ease = 'power2.inOut', via = null }) {
  shotTween?.kill();
  const p0 = rig.pos.clone(), t0 = rig.target.clone(), f0 = rig.fov;
  const p1 = new THREE.Vector3(...pos), t1 = new THREE.Vector3(...target);
  const v = via ? new THREE.Vector3(...via) : null;
  const k = { t: 0 };
  return new Promise((resolve) => {
    if (duration === 0) {
      rig.pos.copy(p1); rig.target.copy(t1); rig.fov = fov; resolve(); return;
    }
    shotTween = gsap.to(k, {
      t: 1, duration, ease,
      onUpdate() {
        const t = k.t;
        if (v) {
          const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
          rig.pos.set(p0.x * a + v.x * b + p1.x * c, p0.y * a + v.y * b + p1.y * c, p0.z * a + v.z * b + p1.z * c);
        } else rig.pos.lerpVectors(p0, p1, t);
        rig.target.lerpVectors(t0, t1, t);
        rig.fov = f0 + (fov - f0) * t;
      },
      onComplete: resolve,
    });
  });
}

export function shake(amount = 1) {
  rig.shake = Math.max(rig.shake, amount);
}

// ---------- pointer ----------
export const pointer = { x: 0, y: 0, sx: 0, sy: 0, px: innerWidth / 2, py: innerHeight / 2, ndc: new THREE.Vector2() };
addEventListener('pointermove', (e) => {
  pointer.px = e.clientX; pointer.py = e.clientY;
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  pointer.ndc.set(pointer.x, pointer.y);
}, { passive: true });
addEventListener('pointerdown', (e) => {
  pointer.px = e.clientX; pointer.py = e.clientY;
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  pointer.ndc.set(pointer.x, pointer.y);
}, { passive: true });

const raycaster = new THREE.Raycaster();
export function rayFromPointer() {
  raycaster.setFromCamera(pointer.ndc, camera);
  return raycaster;
}

/** Project a world point to CSS pixels. */
const _v = new THREE.Vector3();
export function toScreen(p) {
  _v.copy(p).project(camera);
  return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight, behind: _v.z > 1 };
}

// ---------- frame ----------
const right = new THREE.Vector3(), up = new THREE.Vector3(), fwd = new THREE.Vector3();
export function updateCamera() {
  const t = clock.t;
  const ease = reducedMotion ? 0 : 1;
  pointer.sx += (pointer.x - pointer.sx) * Math.min(1, clock.dt * 2.5);
  pointer.sy += (pointer.y - pointer.sy) * Math.min(1, clock.dt * 2.5);

  camera.position.copy(rig.pos);
  fwd.subVectors(rig.target, rig.pos).normalize();
  right.crossVectors(fwd, camera.up).normalize();
  up.crossVectors(right, fwd).normalize();

  const par = rig.parallax * ease;
  camera.position.addScaledVector(right, pointer.sx * 0.35 * par);
  camera.position.addScaledVector(up, pointer.sy * 0.2 * par);
  // handheld breathing
  camera.position.addScaledVector(up, Math.sin(t * 0.7) * 0.03 * ease);
  camera.position.addScaledVector(right, Math.sin(t * 0.43 + 1.3) * 0.03 * ease);

  if (rig.shake > 0.001) {
    const s = rig.shake * 0.25 * ease;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    rig.shake *= Math.exp(-clock.dt * 6);
  }
  camera.lookAt(rig.target);
  // tall screens: open the vertical field of view so the horizontal framing survives
  const fov = rig.fov * THREE.MathUtils.clamp(Math.pow(1.25 / camera.aspect, 0.5), 1, 1.55);
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  pointScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}

export function render() {
  finish.uniforms.uTime.value = clock.t;
  composer.render();
}

export function mount(el) {
  el.appendChild(renderer.domElement);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  finish.uniforms.uRes.value.set(innerWidth, innerHeight);
});
camera.aspect = innerWidth / innerHeight;
camera.updateProjectionMatrix();
