import * as THREE from 'three';
import gsap from 'gsap';
import { NOISE } from '../glsl.js';
import { clock } from '../time.js';

// A procedural rangoli on the ghat floor. It starts as a faint chalk sketch;
// the viewer pours colour with the pointer and every stroke is mirrored
// sixteen ways, the way rangoli is actually drawn.
export const RANGOLI_CENTER = new THREE.Vector3(0, 3.004, 6.6);
export const RANGOLI_RADIUS = 3.1;

const frag = /* glsl */ `
${NOISE}
#define PI 3.14159265
uniform sampler2D uMask; uniform float uFill, uTime, uLight, uChalk;
varying vec2 vUv;

// almond petal inside an angular sector: u in [-1,1] across, v in [0,1] outward
float petal(float u, float v, float wdt){ return wdt * pow(max(sin(PI * clamp(v, 0.0, 1.0)), 0.0), 0.85) - abs(u); }

void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  float grain = hash21(floor(vUv * 1100.0));
  float wob = (vnoise(p * 38.0) - 0.5) * 0.008;
  float r = length(p) + wob;
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);

  vec3 white = srgb(vec3(0.97, 0.94, 0.88)), yellow = srgb(vec3(1.0, 0.78, 0.08)), orange = srgb(vec3(1.0, 0.42, 0.04));
  vec3 pink = srgb(vec3(0.95, 0.15, 0.48)), magenta = srgb(vec3(0.55, 0.04, 0.38)), teal = srgb(vec3(0.0, 0.58, 0.6));
  vec3 green = srgb(vec3(0.1, 0.5, 0.16)), blue = srgb(vec3(0.08, 0.2, 0.7)), red = srgb(vec3(0.82, 0.06, 0.06));

  vec3 col; float line = 0.0;
  float s8 = mod(a + PI / 8.0, PI / 4.0) / (PI / 8.0) - 1.0;   // [-1,1] in each of 8 sectors
  float s16 = mod(a, PI / 8.0) / (PI / 16.0) - 1.0;
  float s32 = mod(a + PI / 32.0, PI / 16.0) / (PI / 32.0) - 1.0;

  if (r < 0.07) { col = r < 0.045 ? yellow : orange; line = smoothstep(0.006, 0.0, abs(r - 0.07)); }
  else if (r < 0.27) {
    float v = (r - 0.07) / 0.2;
    float e = petal(s8, v, 0.95);
    col = orange;
    if (e > 0.0) col = mix(magenta, pink, v);
    line = smoothstep(0.08, 0.0, abs(e));
  }
  else if (r < 0.3) { col = blue; float dd = length(vec2(s32 * 0.6, (r - 0.285) * 40.0)); col = mix(col, white, smoothstep(0.55, 0.4, dd)); }
  else if (r < 0.47) {
    float v = (r - 0.3) / 0.17;
    float e = petal(s16, v, 0.9);
    col = blue;
    if (e > 0.0) col = mix(green, teal, v);
    if (e > 0.0 && v > 0.72) col = yellow;
    line = smoothstep(0.09, 0.0, abs(e));
  }
  else if (r < 0.5) { col = red; }
  else if (r < 0.71) {
    float v = (r - 0.5) / 0.21;
    float e = petal(s8, v, 0.85);
    col = yellow;
    float dot1 = length(vec2(abs(s8) - 1.0, (v - 0.55) * 0.9));
    if (dot1 < 0.22) col = orange;
    if (e > 0.0) col = mix(pink, magenta, abs(s8) * 1.3);
    if (e > 0.0 && abs(s8) < 0.025 && v > 0.25 && v < 0.75) col = white;
    line = smoothstep(0.08, 0.0, abs(e));
  }
  else if (r < 0.75) {
    col = green;
    float zig = abs(fract(a * 48.0 / (2.0 * PI)) - 0.5) * 0.04 + 0.71;
    line = smoothstep(0.006, 0.0, abs(r - zig - 0.01));
    col = mix(col, white, line);
  }
  else if (r < 0.94) {
    float v = (r - 0.75) / 0.19;
    float ang = s16;
    float sc = length(vec2(ang, (v - 0.05) * 1.4));
    col = srgb(vec3(0.06, 0.3, 0.12));
    float idx = floor((a + PI) / (PI / 8.0));
    if (sc < 1.0) col = mod(idx, 2.0) < 1.0 ? orange : pink;
    if (sc < 0.5) col = yellow;
    line = smoothstep(0.08, 0.0, abs(sc - 1.0)) + smoothstep(0.06, 0.0, abs(sc - 0.5));
  }
  else {
    col = red;
    float dd = length(vec2(s32 * 0.55, (r - 0.97) * 36.0));
    col = mix(col, white, smoothstep(0.5, 0.35, dd));
  }
  // ring boundaries for the chalk sketch
  for (int i = 0; i < 7; i++){
    float rr = i == 0 ? 0.07 : i == 1 ? 0.27 : i == 2 ? 0.3 : i == 3 ? 0.47 : i == 4 ? 0.5 : i == 5 ? 0.75 : 0.94;
    line = max(line, smoothstep(0.006, 0.0, abs(r - rr)));
  }
  line = max(line, smoothstep(0.006, 0.0, abs(r - 0.995)));
  line = clamp(line, 0.0, 1.0);

  col = mix(col, white, line * 0.85);
  col *= 0.78 + 0.4 * grain;
  col *= 0.85 + 0.3 * fbm(p * 6.0);

  float m = texture2D(uMask, vUv).r;
  float reveal = max(m, smoothstep(uFill, uFill - 0.04, r));
  reveal = smoothstep(0.32, 0.62, reveal + (grain - 0.5) * 0.35);

  vec3 chalk = vec3(0.9, 0.86, 0.8) * line * uChalk * (0.6 + 0.4 * grain);
  vec3 outCol = mix(chalk, col * uLight, reveal);
  float alpha = max(reveal, line * uChalk * 0.9);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(outCol, alpha);
}`;

const PALETTE = [[1, 0.78, 0.08], [1, 0.42, 0.04], [0.95, 0.15, 0.48], [0.0, 0.58, 0.6], [0.1, 0.5, 0.16], [0.97, 0.94, 0.88]];

export function createRangoli(scene) {
  const S = 512;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = S;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  const mask = new THREE.CanvasTexture(cvs);

  const uniforms = {
    uMask: { value: mask }, uFill: { value: 0 }, uTime: { value: 0 },
    uLight: { value: 0.75 }, uChalk: { value: 0 },
  };
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(RANGOLI_RADIUS, 128),
    new THREE.ShaderMaterial({
      uniforms, fragmentShader: frag, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(RANGOLI_CENTER);
  mesh.renderOrder = 1;
  scene.add(mesh);

  let painted = 0;
  let last = null;
  const stamp = (u, v, rad) => {
    const cx = u - 0.5, cy = v - 0.5;
    const r = Math.hypot(cx, cy), a = Math.atan2(cy, cx);
    for (let k = 0; k < 8; k++) {
      for (const m of [1, -1]) {
        const aa = m * a + (k * Math.PI) / 4;
        const x = (0.5 + Math.cos(aa) * r) * S, y = (1 - (0.5 + Math.sin(aa) * r)) * S;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, 'rgba(255,255,255,0.9)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }
  };

  return {
    mesh,
    uniforms,
    get progress() { return painted; },
    /** Paint at a uv; interpolates from the previous stroke for smooth lines. */
    paint(uv, fresh) {
      if (fresh || !last) last = uv.clone();
      const d = last.distanceTo(uv);
      const n = Math.max(1, Math.ceil(d / 0.012));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        stamp(last.x + (uv.x - last.x) * t, last.y + (uv.y - last.y) * t, 26);
      }
      painted += d;
      last = uv.clone();
      mask.needsUpdate = true;
    },
    endStroke() { last = null; },
    complete(duration = 2.6) {
      return gsap.to(uniforms.uFill, { value: 1.05, duration, ease: 'power2.inOut' });
    },
    randomColor() { return PALETTE[Math.floor(Math.random() * PALETTE.length)]; },
    update() { uniforms.uTime.value = clock.t; },
  };
}
