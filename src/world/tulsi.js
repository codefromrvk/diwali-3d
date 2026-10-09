import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clock } from '../time.js';

// Tulsi katta: a lime-washed pedestal with a lamp niche, a flared crown with
// corner horns, a marigold garland and a living holy-basil plant on top.
const BODY_H = 0.9, BODY_Y = 0.26;
const R_BOT = 0.56, R_TOP = 0.48; // corner radii of the tapered square body
const NICHE_Y = 0.6;

function paintedTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#efe7d6';
  g.fillRect(0, 0, 512, 512);
  // lime wash grime
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(${120 + Math.random() * 60},${100 + Math.random() * 40},${70 + Math.random() * 30},${Math.random() * 0.05})`;
    const r = 2 + Math.random() * 16;
    g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, r, 0, 7); g.fill();
  }
  // ochre frame and red inner line
  g.strokeStyle = '#c9772c'; g.lineWidth = 26; g.strokeRect(13, 13, 486, 486);
  g.strokeStyle = '#a3271a'; g.lineWidth = 6; g.strokeRect(40, 40, 432, 432);
  // red plinth band
  g.fillStyle = '#a3271a'; g.fillRect(0, 470, 512, 42);
  // painted lotus near the top
  g.save(); g.translate(256, 150);
  for (let k = -3; k <= 3; k++) {
    g.save(); g.rotate(k * 0.36);
    g.fillStyle = k % 2 ? '#d9452f' : '#e8a33a';
    g.beginPath(); g.ellipse(0, -42, 15, 44, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  g.fillStyle = '#f2c24a'; g.beginPath(); g.arc(0, 0, 14, 0, 7); g.fill();
  g.restore();
  // kumkum and turmeric dots
  for (const [x, col] of [[226, '#b3141c'], [256, '#e8b21c'], [286, '#b3141c']]) {
    g.fillStyle = col; g.beginPath(); g.arc(x, 236, 9, 0, 7); g.fill();
  }
  // vine border dots
  g.fillStyle = '#5b7a2c';
  for (let i = 0; i < 22; i++) { g.beginPath(); g.arc(70 + i * 17.5, 68, 4, 0, 7); g.fill(); g.beginPath(); g.arc(70 + i * 17.5, 444, 4, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(4, 1);
  t.anisotropy = 4;
  return t;
}

function squareFrustum(rBot, rTop, h) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, 4, 1);
  g.rotateY(Math.PI / 4);
  return g.toNonIndexed();
}

function arch(w, h) {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r);
  s.absarc(0, h - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return s;
}

function leafGeometry(len) {
  const s = new THREE.Shape();
  const w = len * 0.42;
  s.moveTo(0, 0);
  s.bezierCurveTo(w, len * 0.2, w * 0.9, len * 0.75, 0, len);
  s.bezierCurveTo(-w * 0.9, len * 0.75, -w, len * 0.2, 0, 0);
  const g = new THREE.ShapeGeometry(s, 4);
  // cup the leaf slightly
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.pow(p.getX(i) / w, 2) * len * 0.12);
  g.computeVertexNormals();
  g.deleteAttribute('uv');
  return g;
}

function colorize(g, c) {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}

/** One tulsi stem: a gently curved stalk, paired leaves, a purple flower spike. */
function stemGeometry(height, lean, purple) {
  const pts = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    pts.push(new THREE.Vector3(lean.x * t * t, height * t, lean.y * t * t));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const parts = [colorize(new THREE.TubeGeometry(curve, 8, 0.007, 4), new THREE.Color(purple ? 0x4a2a38 : 0x4f5a2a))];
  const nodes = 9;
  for (let k = 1; k <= nodes; k++) {
    const t = 0.25 + (k / nodes) * 0.68;
    const pos = curve.getPoint(t);
    const len = 0.1 * (1.15 - t * 0.55);
    for (const side of [0, 1]) {
      const g = leafGeometry(len);
      const yaw = (k % 2) * (Math.PI / 2) + side * Math.PI + (Math.random() - 0.5) * 0.4;
      g.rotateX(-1.15 + t * 0.5); // leaves reach out and up
      g.rotateY(yaw);
      g.translate(pos.x, pos.y, pos.z);
      const base = purple ? new THREE.Color(0x3c4a24) : new THREE.Color(0x335f22);
      const tip = purple ? new THREE.Color(0x5a3046) : new THREE.Color(0x6a9a3a);
      parts.push(colorize(g, base.lerp(tip, t * 0.7 + Math.random() * 0.2)));
    }
  }
  // manjari: the flower spike
  const top = curve.getPoint(1);
  const spike = new THREE.ConeGeometry(0.014, 0.11, 6);
  spike.translate(top.x, top.y + 0.05, top.z);
  parts.push(colorize(spike, new THREE.Color(purple ? 0x7a3a6a : 0x8a7a9a)));
  return mergeGeometries(parts);
}

export function createTulsi(scene, position, facing) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.rotation.y = facing;

  const painted = new THREE.MeshStandardMaterial({ map: paintedTexture(), roughness: 0.9 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x9a8a78, roughness: 0.95 });
  const red = new THREE.MeshStandardMaterial({ color: 0xa3271a, roughness: 0.8 });
  const ochre = new THREE.MeshStandardMaterial({ color: 0xc9772c, roughness: 0.85 });

  // plinth
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.14, 1.08), stone); p1.position.y = 0.07;
  const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.12, 0.94), red); p2.position.y = 0.2;
  // body
  const body = new THREE.Mesh(squareFrustum(R_BOT, R_TOP, BODY_H), painted);
  body.position.y = BODY_Y + BODY_H / 2;
  // crown: flared lip, cap and four horns
  const lip = new THREE.Mesh(squareFrustum(R_TOP * 0.98, 0.66, 0.12), ochre);
  lip.position.y = BODY_Y + BODY_H + 0.06;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.05, 0.94), red);
  cap.position.y = BODY_Y + BODY_H + 0.145;
  group.add(p1, p2, body, lip, cap);
  const topY = BODY_Y + BODY_H + 0.17;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2, 8), ochre);
    horn.position.set(sx * 0.42, topY + 0.08, sz * 0.42);
    horn.rotation.set(sz * 0.35, 0, -sx * 0.35);
    group.add(horn);
  }
  // soil bed
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 20), new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 1 }));
  soil.position.y = topY;
  group.add(soil);

  // lamp niche on the front face
  const apothem = (r) => r * Math.SQRT1_2;
  const tilt = Math.atan2(apothem(R_BOT) - apothem(R_TOP), BODY_H);
  const faceZ = apothem(R_BOT) - ((NICHE_Y - 0.17 - BODY_Y) / BODY_H) * (apothem(R_BOT) - apothem(R_TOP));
  const niche = new THREE.Group();
  niche.position.set(0, NICHE_Y - 0.17, faceZ + 0.012);
  niche.rotation.x = -tilt;
  const frameShape = arch(0.36, 0.42);
  frameShape.holes.push(arch(0.27, 0.35));
  const frame = new THREE.Mesh(new THREE.ShapeGeometry(frameShape, 12), new THREE.MeshStandardMaterial({ color: 0xb8401f, roughness: 0.8 }));
  const hollow = new THREE.Mesh(new THREE.ShapeGeometry(arch(0.27, 0.35), 12), new THREE.MeshStandardMaterial({ color: 0x3a1a0c, roughness: 1, emissive: 0x2a0e04 }));
  hollow.position.z = -0.001;
  frame.position.z = 0.002;
  niche.add(hollow, frame);
  // a little ledge for the diya
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.1), stone);
  ledge.position.set(0, -0.012, 0.04);
  niche.add(ledge);
  group.add(niche);

  // tulsi plant
  const plantMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, side: THREE.DoubleSide });
  const stems = [];
  const N = 24;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + Math.random() * 0.4;
    const r = Math.sqrt(Math.random()) * 0.16;
    const h = 0.34 + Math.random() * 0.36 - r * 0.6;
    const m = new THREE.Mesh(stemGeometry(h, new THREE.Vector2(Math.cos(a) * (0.08 + r), Math.sin(a) * (0.08 + r)), i % 3 === 0), plantMat);
    m.position.set(Math.cos(a) * r, topY, Math.sin(a) * r);
    m.userData.ph = Math.random() * 6;
    group.add(m);
    stems.push(m);
  }

  // marigold garland draped along the crown
  const balls = [];
  const corners = [[-0.47, -0.47], [0.47, -0.47], [0.47, 0.47], [-0.47, 0.47]];
  for (let s = 0; s < 4; s++) {
    const [ax, az] = corners[s], [bx, bz] = corners[(s + 1) % 4];
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      balls.push([ax + (bx - ax) * t, BODY_Y + BODY_H + 0.04 - Math.sin(t * Math.PI) * 0.13, az + (bz - az) * t]);
    }
  }
  const garland = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.03, 1), new THREE.MeshStandardMaterial({ roughness: 0.8, emissive: 0x2a0800 }), balls.length);
  const m4 = new THREE.Matrix4();
  balls.forEach(([x, y, z], i) => {
    m4.makeTranslation(x * 1.04, y, z * 1.04);
    garland.setMatrixAt(i, m4);
    garland.setColorAt(i, new THREE.Color(i % 4 === 0 ? 0xffc21a : 0xff7a0a));
  });
  group.add(garland);

  // warm light from the niche lamp
  const light = new THREE.PointLight(0xff9a40, 0, 4, 2);
  light.position.set(0, NICHE_Y + 0.1, faceZ + 0.6);
  group.add(light);

  scene.add(group);
  group.updateMatrixWorld(true);

  const diyaPos = new THREE.Vector3(0, NICHE_Y - 0.17 + 0.005, faceZ + 0.05).applyMatrix4(group.matrixWorld);

  return {
    group,
    diyaPos,
    diyaRot: facing - Math.PI / 2, // spout toward the viewer
    setLamp(k) { light.intensity = k * (0.35 + Math.random() * 0.08); },
    update() {
      const t = clock.t;
      for (const s of stems) {
        s.rotation.z = Math.sin(t * 1.1 + s.userData.ph) * 0.035;
        s.rotation.x = Math.cos(t * 0.9 + s.userData.ph) * 0.03;
      }
    },
  };
}
