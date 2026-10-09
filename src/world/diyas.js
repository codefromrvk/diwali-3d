import * as THREE from 'three';
import { NOISE, BILLBOARD } from '../glsl.js';
import { clock } from '../time.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { diyaTexture } from '../textures.js';

const UNLIT = 1e6;

// Clay diya: a lathe bowl pinched into a spout on +x.
function diyaGeometry() {
  const pts = [
    [0.0, 0.0], [0.07, 0.0], [0.12, 0.012], [0.155, 0.035], [0.18, 0.07], [0.192, 0.1],
    [0.186, 0.112], [0.17, 0.108], [0.14, 0.082], [0.09, 0.062], [0.0, 0.058],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 40);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const lift = THREE.MathUtils.smoothstep(y, 0.03, 0.11);
    const pinch = Math.pow(Math.max(Math.cos(a), 0), 8) * lift;
    p.setX(i, x * (1 + 0.55 * pinch));
    p.setZ(i, z * (1 - 0.35 * pinch));
    p.setY(i, y + 0.02 * pinch);
  }
  g.computeVertexNormals();
  return g;
}
const SPOUT = new THREE.Vector3(0.235, 0.13, 0);

/**
 * Ghee pooled in the bowl, plus a twisted cotton batti: soaked where it lies in
 * the oil, clean cotton where it climbs the spout, charred at the tip.
 * `glow` sets how strongly each part warms once the diya is lit.
 */
function oilGeometry() {
  const finish = (g, colorAt, glowAt) => {
    g = g.index ? g.toNonIndexed() : g;
    const n = g.attributes.position.count, col = new Float32Array(n * 3), glow = new Float32Array(n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) { colorAt(i, c); col.set([c.r, c.g, c.b], i * 3); glow[i] = glowAt(i); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
    if (g.attributes.uv) g.deleteAttribute('uv');
    return g;
  };

  // oil surface: the bowl's inner outline at oil height, stretched into the spout
  const oil = new THREE.CircleGeometry(0.145, 32);
  oil.rotateX(-Math.PI / 2);
  const p = oil.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x);
    const pinch = Math.pow(Math.max(Math.cos(a), 0), 8);
    p.setX(i, x * (1 + 0.45 * pinch)); p.setZ(i, z * (1 - 0.3 * pinch));
  }
  oil.translate(0, 0.088, 0);
  const oilCol = new THREE.Color(0x4f3208);

  // batti: a tapered, twisted tube that rests in the oil and rises along the spout
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.02, 0.083, 0.03),
    new THREE.Vector3(0.06, 0.085, 0.012),
    new THREE.Vector3(0.14, 0.09, 0.0),
    new THREE.Vector3(0.195, 0.104, 0.0),
    new THREE.Vector3(0.226, 0.121, 0.0),
    new THREE.Vector3(0.236, 0.136, 0.0),
  ]);
  const SEG = 40, RAD = 8;
  const hash = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const tube = new THREE.TubeGeometry(curve, SEG, 0.0085, RAD, false);
  const tp = tube.attributes.position;
  const ringOf = [];
  for (let j = 0; j <= SEG; j++) {
    const t = j / SEG;
    const center = curve.getPointAt(t);
    // fat in the oil, narrowing to a fine point at the flame
    const taper = t < 0.55 ? 1 : 1 - Math.pow((t - 0.55) / 0.45, 1.3) * 0.65;
    for (let k = 0; k <= RAD; k++) {
      const i = j * (RAD + 1) + k;
      ringOf[i] = [t, k];
      // two plies twisted together: a lumpy, fibrous cross-section
      const fiber = taper * (1 + 0.14 * Math.sin((k / RAD) * Math.PI * 4 + t * 70) + (hash(j * 31 + (k % RAD)) - 0.5) * 0.18); // k % RAD: seam vertices must match
      tp.setXYZ(i, center.x + (tp.getX(i) - center.x) * fiber, center.y + (tp.getY(i) - center.y) * fiber, center.z + (tp.getZ(i) - center.z) * fiber);
    }
  }
  // cap the tip so it reads as a burnt nub, not an open pipe
  const nub = new THREE.SphereGeometry(0.0034, 6, 4);
  nub.translate(0.236, 0.136, 0);
  tube.computeVertexNormals();

  const soaked = new THREE.Color(0x9a7430), cotton = new THREE.Color(0xd9cdb4), char = new THREE.Color(0x1c120c);
  const wickColor = (t, k, c) => {
    // two twisted plies: a helical stripe of slightly darker cotton
    const ply = 0.86 + 0.14 * Math.pow(0.5 + 0.5 * Math.sin((k / RAD) * Math.PI * 4 + t * 70), 2);
    if (t < 0.45) c.copy(soaked).lerp(cotton, Math.max(0, (t - 0.3) / 0.15));
    else c.copy(cotton);
    if (t > 0.86) c.lerp(char, Math.min(1, (t - 0.86) / 0.08));
    c.multiplyScalar(ply);
  };
  // TubeGeometry is indexed; expand per-vertex data before de-indexing
  const n = tp.count, col = new Float32Array(n * 3), glow = new Float32Array(n);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const [t, k] = ringOf[i];
    wickColor(t, k, c);
    col.set([c.r, c.g, c.b], i * 3);
    glow[i] = t > 0.88 ? 3.0 : t > 0.45 ? 0.12 : 0.35; // tip becomes an ember
  }
  tube.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tube.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
  tube.deleteAttribute('uv');
  const wick = tube.toNonIndexed();

  return mergeGeometries([
    finish(oil, (i, out) => out.copy(oilCol), () => 1),
    wick,
    finish(nub, (i, out) => out.copy(char), () => 3.0),
  ]);
}

/**
 * Deep daan: a dona — a shallow bowl stitched from dried sal leaves — heaped
 * with marigold and rose petals, cradling a small diya. Floated on the Ganga.
 */
function donaGeometry() {
  const parts = [];
  const tint = (g, colorAt) => {
    g = g.index ? g.toNonIndexed() : g;
    const n = g.attributes.position.count, a = new Float32Array(n * 3), c = new THREE.Color();
    for (let i = 0; i < n; i++) { colorAt(i, g, c); a.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    if (g.attributes.uv) g.deleteAttribute('uv');
    return g;
  };
  // leaf bowl: shallow lathe, rim scalloped into overlapping leaves
  const prof = [[0, -0.02], [0.22, -0.02], [0.33, 0.0], [0.4, 0.04], [0.43, 0.075]].map(([x, y]) => new THREE.Vector2(x, y));
  const bowl = new THREE.LatheGeometry(prof, 48);
  const p = bowl.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const rim = THREE.MathUtils.smoothstep(y, 0.0, 0.075);
    const leaf = 1 + 0.07 * rim * Math.pow(Math.abs(Math.sin(a * 4.5)), 0.6);
    p.setX(i, x * leaf); p.setZ(i, z * leaf); p.setY(i, y + rim * 0.025 * Math.abs(Math.sin(a * 4.5)));
  }
  bowl.computeVertexNormals();
  const dry = new THREE.Color(0x9a7a34), green = new THREE.Color(0x5a7a2a);
  parts.push(tint(bowl, (i, g, c) => {
    const pp = g.attributes.position, a = Math.atan2(pp.getZ(i), pp.getX(i));
    c.copy(dry).lerp(green, 0.35 + 0.35 * Math.sin(a * 4.5)).multiplyScalar(0.8 + 0.25 * THREE.MathUtils.smoothstep(pp.getY(i), -0.02, 0.08));
  }));
  // petals: two rings of marigold heads and scattered rose petals around the diya
  const cols = [0xff8a0a, 0xffb41a, 0xff6a00, 0xd81a3a];
  let k = 0;
  for (const [r, n, y, s] of [[0.27, 11, 0.05, 0.055], [0.34, 15, 0.065, 0.045]]) {
    for (let j = 0; j < n; j++, k++) {
      const a = (j / n) * Math.PI * 2 + r * 7;
      const ball = new THREE.IcosahedronGeometry(s * (0.85 + ((k * 37) % 10) / 30), 1);
      ball.scale(1, 0.7, 1);
      ball.translate(Math.cos(a) * r, y, Math.sin(a) * r);
      const col = new THREE.Color(cols[(k * 7) % (k % 5 === 0 ? 4 : 3)]);
      parts.push(tint(ball, (i, g, c) => c.copy(col)));
    }
  }
  const g = mergeGeometries(parts);
  g.scale(1.25, 1.25, 1.25); // floaters use a smaller diya; keep the dona full size
  g.translate(0, -0.02, 0);
  return g;
}

const shared = {};
function sharedAssets() {
  if (shared.geo) return shared;
  shared.geo = diyaGeometry();
  shared.mat = new THREE.MeshStandardMaterial({ map: diyaTexture(), roughness: 0.72, metalness: 0.0 });
  shared.oilGeo = oilGeometry();
  return shared;
}

/** Oil material that warms and glows once its own diya is lit. */
function oilMaterial(uTime) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true }); // no specular: no moon glare on the oil
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float iLit; attribute float glow; uniform float uTime; varying float vLitK; varying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLitK = clamp((uTime - iLit) / 0.8, 0.0, 1.0) * glow; vGlow = glow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLitK; varying float vGlow;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (abs(vGlow - 1.0) > 0.01) roughnessFactor = 0.95; // cotton is matte, oil is glossy')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += mix(diffuseColor.rgb * 1.6, vec3(1.0, 0.35, 0.08), step(1.5, vLitK)) * vec3(1.0, 0.55, 0.2) * vLitK * 0.9;');
  };
  return m;
}

const flameVert = /* glsl */ `
  attribute vec3 iOffset; attribute float iScale, iLit, iSeed;
  uniform float uTime; varying vec2 vUv; varying float vLit, vSeed;
  ${BILLBOARD}
  void main(){
    float lit = clamp((uTime - iLit) / 0.7, 0.0, 1.0);
    float pop = 1.0 + sin(lit * 3.14159) * 0.6;
    vLit = lit; vSeed = iSeed; vUv = uv;
    float s = iScale * pop * step(0.0001, lit);
    vec2 local = vec2(position.x * 0.55, position.y + 0.3) * 0.62 * s;
    gl_Position = projectionMatrix * billboard(iOffset, local);
  }`;

const flameFrag = /* glsl */ `
  ${NOISE}
  uniform float uTime; varying vec2 vUv; varying float vLit, vSeed;
  void main(){
    vec2 p = vec2((vUv.x - 0.5) * 0.55, vUv.y - 0.2);
    float t = uTime + vSeed * 17.0;
    float fh = 0.46 * (0.88 + 0.22 * vnoise(vec2(t * 3.1, vSeed * 9.0)));
    float y = p.y / fh;
    float sway = (vnoise(vec2(t * 2.2, y * 1.6 + vSeed * 5.0)) - 0.5) * 0.16 * y * y;
    float x = (p.x - sway) / 0.085;
    float yy = y - 0.3;
    float width = yy > 0.0 ? 1.0 - pow(clamp(yy / 0.7, 0.0, 1.0), 1.3) : sqrt(max(1.0 - (yy / 0.3) * (yy / 0.3), 0.0));
    float d = abs(x) / max(width, 0.0001);
    float body = (y > 0.0 && y < 1.0) ? 1.0 - smoothstep(0.45, 1.0, d) : 0.0;
    body *= 1.0 - smoothstep(0.7, 1.0, y);
    float core = (1.0 - smoothstep(0.0, 0.5, d)) * (1.0 - smoothstep(0.05, 0.5, y)) * step(0.0, y);
    vec3 outer = vec3(1.0, 0.28, 0.03), mid = vec3(1.0, 0.6, 0.16), hot = vec3(1.0, 0.94, 0.78);
    vec3 col = mix(outer, mid, smoothstep(1.0, 0.35, d));
    col = mix(col, hot, core);
    col = mix(col, vec3(0.25, 0.4, 1.0), smoothstep(0.14, 0.0, y) * 0.55 * (1.0 - d) * step(0.0, y));
    float hd = length(vec2(p.x, (p.y - fh * 0.35) * 0.85));
    float halo = exp(-hd * 7.0) * 0.28 + exp(-hd * 22.0) * 0.45;
    float flick = 0.85 + 0.3 * vnoise(vec2(t * 9.0, 2.0));
    float win = smoothstep(0.5, 0.25, abs(vUv.x - 0.5)) * smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
    vec3 c = col * body * 1.9 + vec3(1.0, 0.42, 0.1) * halo * flick * 0.6 * win;
    gl_FragColor = vec4(c * vLit, 1.0);
  }`;

const poolVert = /* glsl */ `
  attribute vec4 iPool; attribute float iLit, iSeed;
  uniform float uTime, uRiser; varying vec2 vUv; varying float vLit, vSeed;
  void main(){
    vUv = uv; vSeed = iSeed;
    vLit = clamp((uTime - iLit) / 1.2, 0.0, 1.0);
    float on = uRiser > 0.5 ? step(1.5, iPool.w) : step(0.5, iPool.w);
    vec3 p = uRiser > 0.5 ? vec3(position.x * 2.2, position.y * 0.5, 0.0) : vec3(position.x * 2.4, 0.0, -position.y * 2.4);
    vec3 c = uRiser > 0.5 ? iPool.xyz + vec3(0.0, -0.25, -0.367) : iPool.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(c + p * on, 1.0);
  }`;

const poolFrag = /* glsl */ `
  ${NOISE}
  uniform float uTime, uRiser, uGain; varying vec2 vUv; varying float vLit, vSeed;
  void main(){
    vec2 q = vUv - 0.5;
    float f;
    if (uRiser > 0.5) f = exp(-q.x * q.x * 9.0) * smoothstep(-0.5, 0.5, q.y) * 0.6;
    else { float d = length(q) * 2.0; f = exp(-d * d * 3.5) * (1.0 - d); }
    f = max(f, 0.0);
    float flick = 0.82 + 0.3 * vnoise(vec2(uTime * 7.0 + vSeed * 30.0, vSeed));
    gl_FragColor = vec4(vec3(1.0, 0.48, 0.16) * f * vLit * flick * uGain, 1.0);
  }`;

export class DiyaField {
  constructor(scene, capacity, { pools = true, gain = 0.5, dona = false } = {}) {
    const { geo, mat } = sharedAssets();
    this.cap = capacity;
    this.count = 0;
    this.bowls = new THREE.InstancedMesh(geo, mat, capacity);
    this.bowls.count = 0;
    this.bowls.frustumCulled = false;
    scene.add(this.bowls);
    this.wick = new Float32Array(capacity * 3);
    this.lit = new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(UNLIT), 1).setUsage(THREE.DynamicDrawUsage);
    this.seed = new THREE.InstancedBufferAttribute(new Float32Array(capacity).map(() => Math.random()), 1);
    this.offset = new THREE.InstancedBufferAttribute(this.wick, 3).setUsage(THREE.DynamicDrawUsage);
    this.scale = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.uniforms = { uTime: { value: 0 } };
    const oilGeo = sharedAssets().oilGeo.clone();
    oilGeo.setAttribute('iLit', this.lit);
    this.oil = new THREE.InstancedMesh(oilGeo, oilMaterial(this.uniforms.uTime), capacity);
    this.oil.instanceMatrix = this.bowls.instanceMatrix; // same transforms as the bowls
    this.oil.count = 0;
    this.oil.frustumCulled = false;
    scene.add(this.oil);
    if (dona) {
      this.dona = new THREE.InstancedMesh(donaGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), capacity);
      this.dona.instanceMatrix = this.bowls.instanceMatrix;
      this.dona.count = 0;
      this.dona.frustumCulled = false;
      scene.add(this.dona);
    }

    const quad = new THREE.PlaneGeometry(1, 1);
    const fg = new THREE.InstancedBufferGeometry();
    fg.index = quad.index;
    fg.setAttribute('position', quad.getAttribute('position'));
    fg.setAttribute('uv', quad.getAttribute('uv'));
    fg.setAttribute('iOffset', this.offset);
    fg.setAttribute('iScale', this.scale);
    fg.setAttribute('iLit', this.lit);
    fg.setAttribute('iSeed', this.seed);
    fg.instanceCount = 0;
    this.flames = new THREE.Mesh(fg, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: flameVert, fragmentShader: flameFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.flames.frustumCulled = false;
    this.flames.renderOrder = 4;
    scene.add(this.flames);

    this.poolMeshes = [];
    if (pools) {
      this.pool = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
      for (const riser of [0, 1]) {
        const pg = new THREE.InstancedBufferGeometry();
        pg.index = quad.index;
        pg.setAttribute('position', quad.getAttribute('position'));
        pg.setAttribute('uv', quad.getAttribute('uv'));
        pg.setAttribute('iPool', this.pool);
        pg.setAttribute('iLit', this.lit);
        pg.setAttribute('iSeed', this.seed);
        pg.instanceCount = 0;
        const m = new THREE.Mesh(pg, new THREE.ShaderMaterial({
          uniforms: { uTime: this.uniforms.uTime, uRiser: { value: riser }, uGain: { value: gain } },
          vertexShader: poolVert, fragmentShader: poolFrag,
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        }));
        m.frustumCulled = false;
        m.renderOrder = 2;
        scene.add(m);
        this.poolMeshes.push(m);
      }
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  /** riser: diya sits 0.35 behind a step edge, so also light the face below. */
  add(x, y, z, { rot = Math.PI / 2, scale = 1, riser = false, pool = true } = {}) {
    if (this.count >= this.cap) return -1;
    const i = this.count++;
    this.scale.array[i] = scale;
    this.setTransform(i, x, y, z, rot, scale);
    if (this.pool) {
      const kind = pool ? (riser ? 2 : 1) : 0;
      this.pool.array.set([x, y + 0.004, z, kind], i * 4);
      this.pool.needsUpdate = true;
    }
    this.bowls.count = this.oil.count = this.count;
    if (this.dona) this.dona.count = this.count;
    this.flames.geometry.instanceCount = this.count;
    this.poolMeshes.forEach((m) => (m.geometry.instanceCount = this.count));
    this.scale.needsUpdate = true;
    return i;
  }

  setTransform(i, x, y, z, rot, scale = this.scale.array[i]) {
    this._q.setFromAxisAngle(this._up, rot);
    this._s.setScalar(scale);
    this._m.compose(this._v.set(x, y, z), this._q, this._s);
    this.bowls.setMatrixAt(i, this._m);
    this.bowls.instanceMatrix.needsUpdate = true;
    const w = SPOUT.clone().multiplyScalar(scale).applyQuaternion(this._q);
    this.wick[i * 3] = x + w.x; this.wick[i * 3 + 1] = y + w.y; this.wick[i * 3 + 2] = z + w.z;
    this.offset.needsUpdate = true;
  }

  wickPos(i, out = new THREE.Vector3()) {
    return out.set(this.wick[i * 3], this.wick[i * 3 + 1], this.wick[i * 3 + 2]);
  }

  ignite(i, delay = 0) {
    if (i < 0 || this.lit.array[i] < UNLIT) return false;
    this.lit.array[i] = clock.t + delay;
    this.lit.needsUpdate = true;
    return true;
  }

  isLit(i) { return this.lit.array[i] <= clock.t; }
  igniteAll(delayFn) { for (let i = 0; i < this.count; i++) this.ignite(i, delayFn(i)); }

  update() { this.uniforms.uTime.value = clock.t; }
}
