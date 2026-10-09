import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NOISE } from '../glsl.js';
import { clock } from '../time.js';
import { pointScale } from '../stage.js';
import { stoneTexture } from '../textures.js';

// A Varanasi-style ghat: stone steps into the river, an open platform,
// then a wall of old havelis and temples crowding the bank.
export const PLATFORM_Y = 3;
export const STEPS = [1, 2, 3, 4, 5].map((i) => ({ y: 3 - i * 0.5, front: 2 - i * 1.2 }));
export const HERO = new THREE.Vector3(0, PLATFORM_Y, 2.35);
export const TULSI = new THREE.Vector3(5.0, PLATFORM_Y, 8.4);
export const TULSI_FACING = -0.675; // turned toward the sparkler camera

const UNLIT = 1e6;
let seed = 11;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];

/** Planar world-space UVs so the stone texture never stretches. */
function worldUV(g, s = 0.22) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (az >= ax) { u = p.getX(i); v = p.getY(i); }
    else { u = p.getZ(i); v = p.getY(i); }
    uv[i * 2] = u * s; uv[i * 2 + 1] = v * s;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function tint(g, hex) {
  const c = new THREE.Color(hex);
  const a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

function part(geo, x, y, z, color, { rx = 0, ry = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)),
    new THREE.Vector3(sx, sy, sz)
  );
  const out = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
  out.deleteAttribute('uv');
  worldUV(out);
  tint(out, color);
  return out;
}

const box = (w, h, d, x, y, z, color) => part(new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, color);

function shikharaGeometry(R, H) {
  const pts = [];
  const N = 36;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let r = R * (1 - Math.pow(t, 1.5) * 0.8);
    r *= 1 + 0.045 * (Math.floor(t * 14) % 2); // stacked tiers
    pts.push(new THREE.Vector2(r, t * H));
  }
  pts.push(new THREE.Vector2(0.001, H));
  const g = new THREE.LatheGeometry(pts, 48);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.09 * Math.pow(Math.abs(Math.cos(a * 4)), 3) + 0.03 * Math.abs(Math.cos(a * 12));
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function temple(parts, x, baseY, z, s, color) {
  const H = 15 * s, R = 3.4 * s;
  parts.push(part(shikharaGeometry(R, H), x, baseY, z, color));
  parts.push(part(new THREE.SphereGeometry(R * 0.32, 24, 10), x, baseY + H + 0.1 * s, z, color, { sy: 0.38 }));
  parts.push(part(new THREE.SphereGeometry(R * 0.14, 16, 10), x, baseY + H + 0.6 * s, z, '#c99a3a'));
  parts.push(part(new THREE.ConeGeometry(R * 0.07, 0.9 * s, 10), x, baseY + H + 1.2 * s, z, '#c99a3a'));
  // mandapa dome in front
  parts.push(part(new THREE.SphereGeometry(R * 0.55, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), x, baseY, z - R * 1.5, color));
  return { top: new THREE.Vector3(x, baseY + H + 1.6 * s, z) };
}

function chhatri(parts, x, y, z, s = 1, color = '#9a8068') {
  parts.push(box(2.6 * s, 0.35 * s, 2.6 * s, x, y, z, color));
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
    parts.push(part(new THREE.CylinderGeometry(0.09 * s, 0.11 * s, 2.0 * s, 10), x + dx * 1.0 * s, y + 0.35 * s + 1.0 * s, z + dz * 1.0 * s, color));
  }
  parts.push(box(2.8 * s, 0.25 * s, 2.8 * s, x, y + 2.35 * s, z, color));
  parts.push(part(new THREE.SphereGeometry(1.15 * s, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), x, y + 2.6 * s, z, color, { sy: 1.1 }));
  parts.push(part(new THREE.ConeGeometry(0.1 * s, 0.6 * s, 8), x, y + 4.1 * s, z, '#b8903c'));
}

function makeStoneMaterial(map, uplight) {
  const mat = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.93, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uUplight = uplight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWY; uniform float uUplight;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.5, 0.22) * uUplight * (0.025 + exp(-max(vWY - 3.0, 0.0) * 0.12) * 0.28);`);
  };
  return mat;
}

const PALETTE = ['#b5875a', '#a9726a', '#c2a684', '#98603e', '#8d8a90', '#b99a5c', '#a5806e', '#c9b296'];

export function createGhat(scene) {
  const stone = stoneTexture();
  const uplight = { value: 0 };
  const stoneMat = makeStoneMaterial(stone, uplight);

  // ---- steps + platform (kept separate for raycasting) ----
  const ground = [];
  ground.push(box(160, 6, 11, 0, PLATFORM_Y - 6, 7.5, '#9a8672'));
  for (const s of STEPS) ground.push(box(160, s.y + 2, 2 - s.front, 0, -2, (2 + s.front) / 2, '#968270'));
  // stepped side wall with a bastion
  for (const sx of [-1, 1]) ground.push(box(4, 4.5, 8, sx * 48, -1.5, -1, '#8a7562'));
  const ghatMesh = new THREE.Mesh(mergeGeometries(ground), stoneMat);
  scene.add(ghatMesh);

  // ---- city: havelis, temples, chhatris ----
  const parts = [];
  const fronts = []; // building faces for windows and light strings
  const tops = [];
  let x = -82;
  while (x < 82) {
    if (x > -8 && x < 8) { x = 8; continue; }
    const w = 5 + rnd() * 6.5;
    const h = 6 + rnd() * 13 + (Math.abs(x) > 40 ? 3 : 0);
    const fz = 13 + rnd() * 2.2;
    const color = pick(PALETTE);
    parts.push(box(w, h, 10, x + w / 2, PLATFORM_Y, fz + 5, color));
    parts.push(box(w + 0.4, 0.4, 0.7, x + w / 2, PLATFORM_Y + h - 0.6, fz - 0.1, color));
    parts.push(box(w, 0.8, 0.25, x + w / 2, PLATFORM_Y + h, fz + 0.1, color));
    if (h > 9) parts.push(box(w + 0.3, 0.25, 0.55, x + w / 2, PLATFORM_Y + 3.6, fz - 0.1, color));
    fronts.push({ x0: x, x1: x + w, z: fz, y0: PLATFORM_Y, y1: PLATFORM_Y + h });
    const r = rnd();
    if (r < 0.28) chhatri(parts, x + w * (0.3 + rnd() * 0.4), PLATFORM_Y + h, fz + 3, 0.7 + rnd() * 0.3, color);
    else if (r < 0.4 && Math.abs(x) > 15) tops.push(temple(parts, x + w / 2, PLATFORM_Y + h, fz + 6, 0.38 + rnd() * 0.15, color).top);
    x += w + (rnd() < 0.2 ? 0.6 : 0);
  }
  // the main temple
  parts.push(box(15, 5.5, 14, 0, PLATFORM_Y, 20, '#b08a5e'));
  parts.push(box(15.6, 0.45, 0.8, 0, PLATFORM_Y + 5.3, 12.9, '#b08a5e'));
  fronts.push({ x0: -7.5, x1: 7.5, z: 13, y0: PLATFORM_Y, y1: PLATFORM_Y + 5.5, temple: true });
  const mainTop = temple(parts, 0, PLATFORM_Y + 5.5, 21, 1, '#c09460').top;
  tops.push(mainTop);
  // chhatris along the ghat edge
  for (const cx of [-11, 11, -30, 30]) chhatri(parts, cx, PLATFORM_Y, 3.6, 1, '#a48a70');

  const cityMat = makeStoneMaterial(stone, uplight);
  const city = new THREE.Mesh(mergeGeometries(parts), cityMat);
  scene.add(city);

  // temples get a stronger warm floodlight
  const templeGlow = { value: 0 };

  // ---- umbrellas on the steps ----
  const umb = [];
  const umbSpots = [[-17, 3], [14, 2], [-33, 4], [27, 1], [41, 3], [-45, 2], [36, 5], [-6, 5]];
  for (const [ux, si] of umbSpots) {
    const s = STEPS[si - 1];
    const z = s.front + 0.6;
    umb.push(part(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), ux, s.y + 1.3, z, '#5a4128'));
    umb.push(part(new THREE.ConeGeometry(1.7, 0.75, 18, 1, true), ux, s.y + 2.75, z, '#a88a4c', { rx: (rnd() - 0.5) * 0.2 }));
    umb.push(part(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 18), ux, s.y + 0.4, z, '#7a5a3a'));
  }
  const umbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, map: stone });
  scene.add(new THREE.Mesh(mergeGeometries(umb), umbMat));


  // ---- boats ----
  const boats = [];
  const boatMat = new THREE.MeshStandardMaterial({ color: 0x6a4428, roughness: 0.85, side: THREE.DoubleSide });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x8a3020, roughness: 0.8 });
  for (const [bx, bz, ry] of [[-21, -8.5, 0.15], [17, -9.5, -0.25], [31, -7.5, 0.05], [-36, -11, 0.4], [44, -13, -0.1]]) {
    const L = 7;
    const hull = new THREE.CylinderGeometry(1, 1, L, 20, 8, true, Math.PI / 2, Math.PI);
    const p = hull.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / (L / 2);
      const k = 1 - Math.pow(Math.abs(y), 3) * 0.85;
      p.setX(i, p.getX(i) * k * 1.0); p.setZ(i, p.getZ(i) * k * 0.55);
    }
    hull.computeVertexNormals();
    const g = new THREE.Group();
    const hm = new THREE.Mesh(hull, boatMat);
    hm.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    g.add(hm);
    for (let k = -2; k <= 2; k++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 1.5 * (1 - Math.pow(Math.abs(k) / 3.2, 3))), trimMat);
      plank.position.set(k * 1.1, -0.02, 0);
      g.add(plank);
    }
    g.position.set(bx, 0.15, bz);
    g.rotation.y = ry;
    scene.add(g);
    boats.push({ g, phase: rnd() * 6, bx, bz, ry });
  }

  // ---- saffron flag on the main temple ----
  const flagGeo = new THREE.PlaneGeometry(2.2, 1.1, 16, 4);
  flagGeo.translate(1.1, 0, 0);
  const flagMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uGlow: templeGlow },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `uniform float uTime; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position;
      float k = p.x / 2.2; p.z += sin(p.x * 2.4 - uTime * 4.0) * 0.22 * k; p.y += sin(p.x * 1.7 - uTime * 3.0) * 0.08 * k;
      p.y *= 1.0 - k * 0.45; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uGlow; varying vec2 vUv; void main(){ vec3 c = pow(vec3(1.0, 0.42, 0.06), vec3(2.2)); gl_FragColor = vec4(c * (0.08 + 0.7 * uGlow), 1.0); }`,
  });
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.copy(mainTop).add(new THREE.Vector3(0.1, 1.6, 0));
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), boatMat);
  pole.position.copy(mainTop).add(new THREE.Vector3(0, 1.0, 0));
  scene.add(flag, pole);

  // ---- windows ----
  const win = [];
  for (const f of fronts) {
    const w = f.x1 - f.x0;
    if (f.temple) {
      // three arched temple doors
      for (const dx of [-4.5, 0, 4.5]) win.push([dx, f.y0 + 1.7, f.z - 0.04, dx === 0 ? 2.0 : 1.4, dx === 0 ? 3.4 : 2.6, 2]);
      continue;
    }
    const cols = Math.max(1, Math.floor((w - 0.8) / 1.9));
    const sp = w / cols;
    for (let fy = f.y0 + 1.6; fy < f.y1 - 1.6; fy += 2.7) {
      for (let c = 0; c < cols; c++) {
        if (rnd() < 0.18) continue;
        const ground = fy < f.y0 + 2;
        win.push([f.x0 + sp * (c + 0.5), fy + 0.75, f.z - 0.04, ground ? 1.1 : 0.78, ground ? 1.9 : 1.4, ground ? 1 : 0]);
      }
    }
  }
  const W = win.length;
  const wPos = new Float32Array(W * 3), wSize = new Float32Array(W * 3), wLit = new Float32Array(W).fill(UNLIT), wSeed = new Float32Array(W);
  win.forEach(([wx, wy, wz, ww, wh, kind], i) => {
    wPos.set([wx, wy, wz], i * 3); wSize.set([ww, wh, kind], i * 3); wSeed[i] = rnd();
  });
  const quad = new THREE.PlaneGeometry(1, 1);
  const wg = new THREE.InstancedBufferGeometry();
  wg.index = quad.index;
  wg.setAttribute('position', quad.getAttribute('position'));
  wg.setAttribute('uv', quad.getAttribute('uv'));
  wg.setAttribute('iPos', new THREE.InstancedBufferAttribute(wPos, 3));
  wg.setAttribute('iSize', new THREE.InstancedBufferAttribute(wSize, 3));
  const wLitAttr = new THREE.InstancedBufferAttribute(wLit, 1);
  wg.setAttribute('iLit', wLitAttr);
  wg.setAttribute('iSeed', new THREE.InstancedBufferAttribute(wSeed, 1));
  wg.instanceCount = W;
  const winMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 iPos, iSize; attribute float iLit, iSeed; uniform float uTime;
      varying vec2 vUv; varying vec2 vSz; varying float vLit, vSeed, vKind;
      void main(){ vUv = uv; vSz = iSize.xy; vKind = iSize.z; vSeed = iSeed;
        vLit = clamp((uTime - iLit) / 0.5, 0.0, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(iPos + vec3(position.xy * iSize.xy, 0.0), 1.0); }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform float uTime; varying vec2 vUv; varying vec2 vSz; varying float vLit, vSeed, vKind;
      void main(){
        float w = vSz.x, h = vSz.y;
        float X = (vUv.x - 0.5) * w, Y = vUv.y * h;
        float cy = h - w * 0.5;
        float d = Y < cy ? min(w * 0.5 - abs(X), Y) : w * 0.5 - length(vec2(X, Y - cy));
        if (d < 0.0) discard;
        float frame = smoothstep(0.05, 0.08, d);
        float bars = vKind < 0.5 ? min(smoothstep(0.015, 0.03, abs(X)), smoothstep(0.015, 0.03, abs(Y - h * 0.45))) : 1.0;
        vec3 warm = mix(vec3(1.0, 0.3, 0.06), vec3(1.0, 0.58, 0.2), Y / h);
        if (vSeed > 0.88) warm = vec3(1.0, 0.12, 0.3);
        else if (vSeed > 0.8) warm = vec3(0.15, 0.75, 0.45);
        float flick = 0.85 + 0.25 * vnoise(vec2(uTime * (vSeed > 0.6 ? 6.0 : 1.5), vSeed * 40.0));
        float inten = vKind > 1.5 ? 1.3 : (vKind > 0.5 ? 0.6 : 0.85);
        vec3 lit = warm * inten * flick * (0.55 + 0.45 * vSeed);
        vec3 dark = vec3(0.006, 0.006, 0.012);
        vec3 c = mix(dark, lit, vLit) * mix(0.15, 1.0, frame * bars);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const windows = new THREE.Mesh(wg, winMat);
  windows.frustumCulled = false;
  scene.add(windows);

  // ---- hanging fairy lights (ladis) ----
  const bulbs = [];
  const SCHEMES = [
    [[1, 0.62, 0.22]],
    [[1, 0.62, 0.22]],
    [[1, 0.15, 0.3], [0.2, 1, 0.35], [0.25, 0.45, 1], [1, 0.8, 0.15]],
    [[0.55, 0.75, 1], [1, 1, 1]],
    [[1, 0.2, 0.6], [1, 0.62, 0.22]],
  ];
  for (const f of fronts) {
    if (f.temple || rnd() < 0.35) continue;
    const scheme = pick(SCHEMES);
    const w = f.x1 - f.x0;
    const n = Math.floor(w / 0.55);
    const len = (f.y1 - f.y0) * (0.35 + rnd() * 0.5);
    const zz = f.z - 0.25;
    for (let s = 0; s <= n; s++) {
      const sx = f.x0 + (s / n) * w;
      const l = len * (0.8 + 0.2 * Math.sin(s * 0.7));
      for (let y = 0; y < l; y += 0.34) {
        const c = scheme[(s + Math.floor(y / 0.34)) % scheme.length];
        bulbs.push(sx, f.y1 - 0.3 - y, zz, ...c, s * 0.13 + y * 0.4);
      }
    }
    // roofline swag
    for (let t = 0; t <= 1; t += 0.4 / w) {
      const c = scheme[Math.floor(t * w * 3) % scheme.length];
      bulbs.push(f.x0 + t * w, f.y1 + 0.5 - Math.sin(t * Math.PI) * 0.6, f.z - 0.3, ...c, t * 9);
    }
  }
  // strings across the steps between the chhatris and poles
  for (const [ax, bx] of [[-30, -11], [-11, 11], [11, 30]]) {
    const scheme = pick(SCHEMES.slice(2));
    for (let t = 0; t <= 1; t += 0.008) {
      const c = scheme[Math.floor(t * 125) % scheme.length];
      bulbs.push(ax + (bx - ax) * t, PLATFORM_Y + 5.6 - Math.sin(t * Math.PI) * 1.6, 3.6, ...c, t * 20);
    }
  }
  const B = bulbs.length / 7;
  const bp = new Float32Array(B * 3), bc = new Float32Array(B * 3), bph = new Float32Array(B), bl = new Float32Array(B).fill(UNLIT);
  for (let i = 0; i < B; i++) {
    bp.set(bulbs.slice(i * 7, i * 7 + 3), i * 3);
    bc.set(bulbs.slice(i * 7 + 3, i * 7 + 6), i * 3);
    bph[i] = bulbs[i * 7 + 6];
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(bp, 3));
  bg.setAttribute('aCol', new THREE.BufferAttribute(bc, 3));
  bg.setAttribute('aPh', new THREE.BufferAttribute(bph, 1));
  const bLitAttr = new THREE.BufferAttribute(bl, 1);
  bg.setAttribute('aLit', bLitAttr);
  const bulbMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: pointScale },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 aCol; attribute float aPh, aLit; uniform float uTime, uScale; varying vec3 vC;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float on = clamp((uTime - aLit) / 0.3, 0.0, 1.0);
        float chase = 0.35 + 0.65 * smoothstep(0.2, 0.8, 0.5 + 0.5 * sin(uTime * 2.2 - aPh * 3.0));
        vC = aCol * chase * on * 2.2;
        gl_PointSize = clamp(0.085 * uScale / -mv.z, 1.5, 14.0) * step(0.001, on);
      }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 q = gl_PointCoord - 0.5; float d = dot(q, q) * 4.0; gl_FragColor = vec4(vC * (exp(-d * 6.0) + exp(-d * 30.0)), 1.0); }`,
  });
  const lights = new THREE.Points(bg, bulbMat);
  lights.frustumCulled = false;
  lights.renderOrder = 3;
  scene.add(lights);

  // ---- marigold garlands on chhatris and the temple front ----
  const mg = [];
  const garland = (x0, x1, y, z, sag) => {
    for (let t = 0; t <= 1; t += 0.03) mg.push([x0 + (x1 - x0) * t, y - Math.sin(t * Math.PI) * sag, z]);
  };
  for (const cx of [-11, 11, -30, 30]) { garland(cx - 1.0, cx + 1.0, PLATFORM_Y + 2.25, 2.55, 0.45); }
  garland(-7.2, 7.2, PLATFORM_Y + 5.2, 12.55, 1.1);
  garland(-7.2, 0, PLATFORM_Y + 5.2, 12.55, 0.6);
  garland(0, 7.2, PLATFORM_Y + 5.2, 12.55, 0.6);
  const flower = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.075, 1), new THREE.MeshStandardMaterial({ roughness: 0.8, emissive: 0x401000 }), mg.length);
  const mtx = new THREE.Matrix4();
  mg.forEach(([fx, fy, fz], i) => {
    mtx.makeTranslation(fx, fy, fz);
    flower.setMatrixAt(i, mtx);
    flower.setColorAt(i, new THREE.Color(i % 3 ? 0xff8a10 : 0xffc21a));
  });
  scene.add(flower);

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(0x3b4a9a, 0x1a0e06, 1.6);
  scene.add(hemi);
  const ghatLights = [-16, 0, 16].map((lx) => {
    const l = new THREE.PointLight(0xff8a3a, 0, 34, 1.3);
    l.position.set(lx, 2.6, -1.5);
    scene.add(l);
    return l;
  });
  // moonlight: a cool key from over the river so facades read, and a rim from the moon itself
  const moonKey = new THREE.DirectionalLight(0x9fb2ff, 1.3);
  moonKey.position.set(-25, 40, -60);
  const moonRim = new THREE.DirectionalLight(0xc8d4ff, 0.9);
  moonRim.position.set(-36, 30, 88);
  scene.add(moonKey, moonRim);
  const cityLight = new THREE.PointLight(0xff9a50, 0, 60, 1.1);
  cityLight.position.set(0, 9, 6);
  scene.add(cityLight);

  return {
    ghatMesh,
    boats,
    uplight,
    templeGlow,
    hemi,
    /** Ripple the city awake from an origin — windows, ladis, temple glow. */
    lightCity(origin, t0 = 0, speed = 0.045) {
      for (let i = 0; i < W; i++) {
        if (wSeed[i] < 0.12) continue;
        const dx = wPos[i * 3] - origin.x, dy = wPos[i * 3 + 1] - origin.y, dz = wPos[i * 3 + 2] - origin.z;
        wLit[i] = clock.t + t0 + Math.hypot(dx, dy, dz) * speed + Math.random() * 1.6;
      }
      wLitAttr.needsUpdate = true;
      for (let i = 0; i < B; i++) {
        const dx = bp[i * 3] - origin.x, dz = bp[i * 3 + 2] - origin.z;
        bl[i] = clock.t + t0 + 0.6 + Math.hypot(dx, dz) * speed * 1.1;
      }
      bLitAttr.needsUpdate = true;
    },
    moon: 1,
    light: 0,
    /** Scale moonlight (dimmed for intimate close-ups). */
    setMoon(m) { this.moon = m; this.applyMoon(); },
    applyMoon() {
      moonKey.intensity = (1.3 - this.light * 0.6) * this.moon;
      moonRim.intensity = (0.9 - this.light * 0.3) * this.moon;
      hemi.intensity = (1.6 - this.light * 0.3) * (0.35 + 0.65 * this.moon);
    },
    setLight(k) {
      uplight.value = k;
      ghatLights.forEach((l) => (l.intensity = k * 7));
      cityLight.intensity = k * 12;
      this.light = k;
      this.applyMoon();
      hemi.groundColor.setRGB(0.1 + k * 0.35, 0.055 + k * 0.14, 0.024 + k * 0.03);
    },
    update() {
      const t = clock.t;
      winMat.uniforms.uTime.value = t;
      bulbMat.uniforms.uTime.value = t;
      flagMat.uniforms.uTime.value = t;
      for (const b of boats) {
        b.g.position.y = 0.12 + Math.sin(t * 0.9 + b.phase) * 0.06;
        b.g.rotation.z = Math.sin(t * 0.7 + b.phase) * 0.03;
        b.g.rotation.x = Math.sin(t * 0.5 + b.phase * 2) * 0.02;
      }
    },
  };
}
