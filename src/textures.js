import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Weathered sandstone — blotches, speckle and a few cracks. */
export function stoneTexture() {
  const [c, g] = canvas(512, 512);
  const r = rand(7);
  g.fillStyle = '#8c7a68';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    const x = r() * 512, y = r() * 512, rad = 4 + r() * 46;
    const l = 30 + r() * 45;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `hsla(${24 + r() * 16}, ${12 + r() * 18}%, ${l}%, ${0.08 + r() * 0.12})`);
    grd.addColorStop(1, 'hsla(30, 20%, 50%, 0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 240 : 0},${r() > 0.5 ? 220 : 0},${r() * 0.07})`;
    g.fillRect(r() * 512, r() * 512, 1.5, 1.5);
  }
  g.strokeStyle = 'rgba(40,28,20,0.35)';
  for (let i = 0; i < 14; i++) {
    g.lineWidth = 0.6 + r();
    g.beginPath();
    let x = r() * 512, y = r() * 512;
    g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); }
    g.stroke();
  }
  // slab seams
  g.strokeStyle = 'rgba(30,20,14,0.5)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128 + (r() - 0.5) * 6, 512); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Hand-painted terracotta diya: white dot band and a saffron stripe. */
export function diyaTexture() {
  const [c, g] = canvas(512, 256);
  const grd = g.createLinearGradient(0, 256, 0, 0);
  grd.addColorStop(0, '#5a2210');
  grd.addColorStop(0.35, '#a8461f');
  grd.addColorStop(0.55, '#b9532a');
  grd.addColorStop(0.6, '#3a1a0c'); // inner surface (oiled)
  grd.addColorStop(1, '#2a1206');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 256);
  // lathe v runs bottom->rim->inside; canvas y is flipped (v=1 at top)
  const vy = (v) => 256 - v * 256;
  g.fillStyle = '#d9361e';
  g.fillRect(0, vy(0.5), 512, 10);
  g.fillStyle = '#f2b233';
  g.fillRect(0, vy(0.46), 512, 5);
  g.fillStyle = '#fff3d6';
  for (let i = 0; i < 32; i++) {
    g.beginPath(); g.arc(i * 16 + 8, vy(0.38), 3, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = '#f2b233';
  g.lineWidth = 2;
  for (let i = 0; i < 16; i++) {
    const x = i * 32 + 16;
    g.beginPath(); g.moveTo(x - 7, vy(0.3)); g.quadraticCurveTo(x, vy(0.22), x + 7, vy(0.3)); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Vertical warm gradient used as an emissive "uplight" on temples. */
export function uplightTexture() {
  const [c, g] = canvas(4, 256);
  const grd = g.createLinearGradient(0, 256, 0, 0);
  grd.addColorStop(0, '#ffb15a');
  grd.addColorStop(0.35, '#a1461c');
  grd.addColorStop(1, '#120604');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
