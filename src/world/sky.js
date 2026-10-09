import * as THREE from 'three';
import { NOISE } from '../glsl.js';
import { clock } from '../time.js';
import { pointScale } from '../stage.js';

// Amavasya — the new-moon night. No moon, only stars, a faint galaxy
// and (later) the warm haze of a city full of lamps on the horizon.
export const MOON_DIR = new THREE.Vector3(-0.36, 0.3, 0.88).normalize();

export function createSky(scene) {
  const group = new THREE.Group();
  const uniforms = {
    uTime: { value: 0 },
    uGlow: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 0.7, 0.3) },
    uMoonDir: { value: MOON_DIR },
  };

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(600, 48, 24),
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        ${NOISE}
        uniform float uTime, uGlow, uFlash; uniform vec3 uFlashColor, uMoonDir; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 zen = srgb(vec3(0.03, 0.035, 0.09));
          vec3 mid = srgb(vec3(0.08, 0.09, 0.2));
          vec3 hor = srgb(vec3(0.2, 0.17, 0.32));
          vec3 col = mix(hor, mid, smoothstep(0.0, 0.22, h));
          col = mix(col, zen, smoothstep(0.18, 0.75, h));
          col = mix(col, srgb(vec3(0.03, 0.025, 0.06)), smoothstep(0.0, -0.08, h));

          // galaxy band
          vec3 n = normalize(vec3(0.35, 0.55, -0.75));
          float b = dot(d, n);
          float band = exp(-b * b * 22.0) * smoothstep(0.02, 0.35, h);
          float cloud = fbm(d.xz * 5.0 / (0.4 + h) + d.y * 3.0);
          col += srgb(vec3(0.28, 0.22, 0.42)) * band * (0.25 + cloud * 0.9) * 0.35;
          col -= band * smoothstep(0.55, 0.75, fbm(d.xz * 11.0)) * 0.012;

          // city haze — the ghat lies toward +z
          float toward = 0.45 + 0.55 * max(d.z, 0.0);
          float haze = exp(-max(h, 0.0) * 7.0) * toward;
          col += srgb(vec3(1.0, 0.45, 0.16)) * haze * uGlow * 0.12;
          col += srgb(vec3(0.45, 0.16, 0.35)) * exp(-max(h, 0.0) * 4.0) * uGlow * 0.025;

          // the moon: a cratered disc wrapped in a cool halo
          float md = dot(d, uMoonDir);
          float disc = smoothstep(0.99935, 0.99945, md);
          vec3 tang = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
          vec2 mp = vec2(dot(d, tang), dot(d, cross(tang, uMoonDir))) * 38.0;
          float mare = fbm(mp * 1.6 + 3.0);
          vec3 moon = srgb(vec3(1.0, 0.97, 0.9)) * (1.15 - smoothstep(0.45, 0.75, mare) * 0.4) * 1.05;
          col += srgb(vec3(0.5, 0.6, 0.95)) * (pow(max(md, 0.0), 2200.0) * 0.5 + pow(max(md, 0.0), 160.0) * 0.12 + pow(max(md, 0.0), 12.0) * 0.03) * (1.0 - disc);
          col = mix(col, moon, disc);

          col += uFlashColor * uFlash * 0.18 * smoothstep(-0.05, 0.6, h);
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  dome.renderOrder = -10;
  group.add(dome);

  // stars
  const N = 3200;
  const pos = new Float32Array(N * 3), size = new Float32Array(N), seed = new Float32Array(N), tint = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const u = Math.random(), v = Math.random();
    const theta = u * Math.PI * 2;
    const y = Math.pow(v, 0.8) * 0.98 + 0.02;
    const r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(theta) * r * 500, y * 500, Math.sin(theta) * r * 500], i * 3);
    size[i] = Math.pow(Math.random(), 6) * 3.2 + 0.6;
    seed[i] = Math.random() * 100;
    tint[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uDim: { value: 1 }, uPx: { value: Math.min(devicePixelRatio, 1.75) } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    vertexShader: /* glsl */ `
      attribute float aSize, aSeed, aTint; uniform float uTime, uPx; varying float vA; varying vec3 vC;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.65 + 0.35 * sin(uTime * (1.2 + fract(aSeed) * 2.5) + aSeed);
        float hz = smoothstep(0.0, 60.0, position.y) * smoothstep(0.985, 0.95, dot(normalize(position), normalize(vec3(-0.36, 0.3, 0.88)))); 
        vA = tw * hz;
        vC = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.86, 0.7), aTint);
        gl_PointSize = aSize * uPx * 1.4;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uDim; varying float vA; varying vec3 vC;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * a * a * vA * uDim * 1.3, 1.0); }`,
  });
  const stars = new THREE.Points(g, starMat);
  stars.renderOrder = -9;
  stars.frustumCulled = false;
  group.add(stars);
  scene.add(group);

  return {
    uniforms,
    starMat,
    update(camera) {
      uniforms.uTime.value = clock.t;
      group.position.copy(camera.position);
      uniforms.uFlash.value *= Math.exp(-clock.dt * 5);
    },
    flash(color, amount = 1) {
      uniforms.uFlashColor.value.copy(color);
      uniforms.uFlash.value = Math.min(1.6, uniforms.uFlash.value + amount);
    },
  };
}
