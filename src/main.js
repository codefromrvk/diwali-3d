import * as THREE from 'three';
import gsap from 'gsap';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0x111122, 0.3);
scene.add(ambientLight);

const moonLight = new THREE.DirectionalLight(0xfffacd, 0.5);
moonLight.position.set(50, 50, 50);
moonLight.castShadow = true;
moonLight.shadow.mapSize.width = 2048;
moonLight.shadow.mapSize.height = 2048;
scene.add(moonLight);

const warmLight = new THREE.PointLight(0xff8c00, 0.8, 100);
warmLight.position.set(0, 10, 0);
scene.add(warmLight);

// Fog for depth
scene.fog = new THREE.FogExp2(0x000011, 0.015);

// Camera position
camera.position.set(0, 5, 20);
camera.lookAt(0, 0, 0);

// ============ SKY ============
const skyGeometry = new THREE.SphereGeometry(500, 60, 40);
const skyMaterial = new THREE.ShaderMaterial({
  uniforms: {
    topColor: { value: new THREE.Color(0x000011) },
    bottomColor: { value: new THREE.Color(0x000033) },
    offset: { value: 33 },
    exponent: { value: 0.6 }
  },
  vertexShader: `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform float offset;
    uniform float exponent;
    varying vec3 vWorldPosition;
    void main() {
      float h = normalize(vWorldPosition + offset).y;
      gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
    }
  `,
  side: THREE.BackSide
});
const sky = new THREE.Mesh(skyGeometry, skyMaterial);
scene.add(sky);

// ============ STARS ============
const starCount = 2000;
const starGeometry = new THREE.BufferGeometry();
const starPositions = new Float32Array(starCount * 3);
const starSizes = new Float32Array(starCount);

for (let i = 0; i < starCount; i++) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const r = 400;

  starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
  starPositions[i * 3 + 2] = r * Math.cos(phi);
  starSizes[i] = Math.random() * 2 + 0.5;
}

starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
starGeometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));

const starMaterial = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 1,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0.8
});

const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

// ============ MOON ============
const moonGeometry = new THREE.SphereGeometry(8, 32, 32);
const moonMaterial = new THREE.MeshStandardMaterial({
  color: 0xfffacd,
  emissive: 0xdaa520,
  emissiveIntensity: 0.3,
  roughness: 0.8,
  metalness: 0.2
});
const moon = new THREE.Mesh(moonGeometry, moonMaterial);
moon.position.set(80, 60, -150);
scene.add(moon);

// Moon glow
const moonGlowGeometry = new THREE.SphereGeometry(12, 32, 32);
const moonGlowMaterial = new THREE.MeshBasicMaterial({
  color: 0xffd700,
  transparent: true,
  opacity: 0.1,
  side: THREE.BackSide
});
const moonGlow = new THREE.Mesh(moonGlowGeometry, moonGlowMaterial);
moonGlow.position.copy(moon.position);
scene.add(moonGlow);

// ============ GROUND ============
const groundGeometry = new THREE.PlaneGeometry(200, 200);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x0a0a1a,
  roughness: 0.9,
  metalness: 0.1
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ============ DIYA CLASS ============
class Diya {
  constructor(x, z) {
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this.createBody();
    this.createFlame();
    this.createGlow();
    scene.add(this.group);
  }

  createBody() {
    // Diya body
    const bodyGeometry = new THREE.CylinderGeometry(1.2, 0.8, 0.8, 32);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.7,
      metalness: 0.3
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.4;
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // Rim
    const rimGeometry = new THREE.TorusGeometry(1.2, 0.1, 16, 32);
    const rimMaterial = new THREE.MeshStandardMaterial({
      color: 0xdaa520,
      roughness: 0.3,
      metalness: 0.8
    });
    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.8;
    this.group.add(rim);

    // Oil
    const oilGeometry = new THREE.CylinderGeometry(1, 1, 0.1, 32);
    const oilMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xff8c00,
      emissiveIntensity: 0.3,
      roughness: 0.1,
      metalness: 0.9
    });
    const oil = new THREE.Mesh(oilGeometry, oilMaterial);
    oil.position.y = 0.75;
    this.group.add(oil);

    // Decorative pattern
    const patternGeometry = new THREE.TorusGeometry(0.6, 0.05, 16, 32);
    const patternMaterial = new THREE.MeshStandardMaterial({
      color: 0xdaa520,
      roughness: 0.4,
      metalness: 0.6
    });
    const pattern = new THREE.Mesh(patternGeometry, patternMaterial);
    pattern.rotation.x = Math.PI / 2;
    pattern.position.y = 0.4;
    this.group.add(pattern);
  }

  createFlame() {
    // Flame core
    const flameGeometry = new THREE.ConeGeometry(0.3, 1.5, 16);
    const flameMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        flameColor: { value: new THREE.Color(0xff8c00) },
        flameColor2: { value: new THREE.Color(0xff4500) }
      },
      vertexShader: `
        uniform float time;
        varying vec2 vUv;
        varying vec3 vPosition;
        void main() {
          vUv = uv;
          vPosition = position;
          vec3 pos = position;
          pos.x += sin(time * 10.0 + position.y * 5.0) * 0.05;
          pos.z += cos(time * 8.0 + position.y * 3.0) * 0.03;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 flameColor;
        uniform vec3 flameColor2;
        varying vec2 vUv;
        varying vec3 vPosition;
        void main() {
          float noise = sin(vPosition.y * 10.0 + time * 5.0) * 0.5 + 0.5;
          vec3 color = mix(flameColor2, flameColor, vUv.y + noise * 0.3);
          float alpha = smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
          gl_FragColor = vec4(color, alpha * 0.9);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide
    });
    this.flame = new THREE.Mesh(flameGeometry, flameMaterial);
    this.flame.position.y = 1.5;
    this.group.add(this.flame);

    // Inner flame
    const innerGeometry = new THREE.ConeGeometry(0.15, 0.8, 16);
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9
    });
    const inner = new THREE.Mesh(innerGeometry, innerMaterial);
    inner.position.y = 1.3;
    this.group.add(inner);
  }

  createGlow() {
    // Point light for each diya
    this.light = new THREE.PointLight(0xff8c00, 2, 10);
    this.light.position.y = 1.5;
    this.light.castShadow = true;
    this.light.shadow.mapSize.width = 512;
    this.light.shadow.mapSize.height = 512;
    this.group.add(this.light);

    // Glow sprite
    const glowGeometry = new THREE.PlaneGeometry(4, 4);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.y = 1.5;
    glow.rotation.x = -Math.PI / 2;
    this.group.add(glow);
  }

  update(time) {
    this.flame.material.uniforms.time.value = time;
    this.light.intensity = 2 + Math.sin(time * 10) * 0.5;
  }
}

// Create diyas
const diyas = [];
const diyaPositions = [
  { x: -6, z: -3 }, { x: -3, z: -5 }, { x: 0, z: -4 }, { x: 3, z: -5 }, { x: 6, z: -3 },
  { x: -4, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 2 }
];

diyaPositions.forEach(pos => {
  diyas.push(new Diya(pos.x, pos.z));
});

// ============ FIREWORK PARTICLES ============
class Firework {
  constructor() {
    this.geometry = new THREE.BufferGeometry();
    this.particleCount = 100;
    this.positions = new Float32Array(this.particleCount * 3);
    this.colors = new Float32Array(this.particleCount * 3);
    this.velocities = [];
    this.life = 1.0;

    const color = new THREE.Color();
    color.setHSL(Math.random(), 1, 0.6);

    for (let i = 0; i < this.particleCount; i++) {
      this.positions[i * 3] = 0;
      this.positions[i * 3 + 1] = 0;
      this.positions[i * 3 + 2] = 0;

      this.colors[i * 3] = color.r;
      this.colors[i * 3 + 1] = color.g;
      this.colors[i * 3 + 2] = color.b;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = Math.random() * 10 + 5;
      this.velocities.push({
        x: speed * Math.sin(phi) * Math.cos(theta),
        y: speed * Math.sin(phi) * Math.sin(theta),
        z: speed * Math.cos(phi)
      });
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    this.material = new THREE.PointsMaterial({
      size: 0.5,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.visible = false;
    scene.add(this.points);
  }

  explode(x, y, z) {
    this.points.position.set(x, y, z);
    this.points.visible = true;
    this.life = 1.0;
    this.positions.fill(0);
    this.geometry.attributes.position.needsUpdate = true;
  }

  update(delta) {
    if (!this.points.visible) return;

    this.life -= delta * 0.5;
    if (this.life <= 0) {
      this.points.visible = false;
      return;
    }

    for (let i = 0; i < this.particleCount; i++) {
      this.positions[i * 3] += this.velocities[i].x * delta;
      this.positions[i * 3 + 1] += this.velocities[i].y * delta;
      this.positions[i * 3 + 2] += this.velocities[i].z * delta;
      this.velocities[i].y -= 9.8 * delta; // gravity
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.material.opacity = this.life;
  }
}

// Create firework pool
const fireworks = [];
for (let i = 0; i < 10; i++) {
  fireworks.push(new Firework());
}

let fireworkIndex = 0;
function launchFirework() {
  const fw = fireworks[fireworkIndex];
  const x = (Math.random() - 0.5) * 40;
  const y = Math.random() * 20 + 10;
  const z = (Math.random() - 0.5) * 20 - 10;
  fw.explode(x, y, z);
  fireworkIndex = (fireworkIndex + 1) % fireworks.length;
}

// ============ RANGOLI ============
class Rangoli {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.y = 0.01;
    this.createPattern();
    scene.add(this.group);
  }

  createPattern() {
    // Center circle
    const centerGeo = new THREE.RingGeometry(0, 2, 64);
    const centerMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    const center = new THREE.Mesh(centerGeo, centerMat);
    center.rotation.x = -Math.PI / 2;
    this.group.add(center);

    // Rings
    for (let i = 1; i <= 5; i++) {
      const ringGeo = new THREE.RingGeometry(i * 2, i * 2 + 0.3, 64);
      const hue = (i * 0.1) % 1;
      const color = new THREE.Color().setHSL(hue, 1, 0.5);
      const ringMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      this.group.add(ring);
    }

    // Petals
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const petalGeo = new THREE.CircleGeometry(1.5, 32);
      const petalMat = new THREE.MeshBasicMaterial({
        color: 0xff8c00,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
      });
      const petal = new THREE.Mesh(petalGeo, petalMat);
      petal.rotation.x = -Math.PI / 2;
      petal.position.x = Math.cos(angle) * 6;
      petal.position.z = Math.sin(angle) * 6;
      this.group.add(petal);
    }
  }

  update(time) {
    this.group.rotation.y = time * 0.1;
  }
}

const rangoli = new Rangoli();
rangoli.group.position.set(0, 0.01, -5);

// ============ LANTERNS ============
class Lantern {
  constructor() {
    this.group = new THREE.Group();
    this.createLantern();
    this.reset();
    scene.add(this.group);
  }

  createLantern() {
    // Body
    const bodyGeo = new THREE.SphereGeometry(1, 16, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xff6b6b,
      emissive: 0xff4500,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.8
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.set(1, 1.3, 1);
    this.group.add(body);

    // Ribs
    for (let i = 0; i < 4; i++) {
      const ribGeo = new THREE.TorusGeometry(1, 0.02, 8, 16);
      const ribMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
      const rib = new THREE.Mesh(ribGeo, ribMat);
      rib.rotation.x = Math.PI / 2;
      rib.rotation.z = (i / 4) * Math.PI;
      this.group.add(rib);
    }

    // Light
    this.light = new THREE.PointLight(0xff8c00, 1, 15);
    this.group.add(this.light);
  }

  reset() {
    this.group.position.set(
      (Math.random() - 0.5) * 60,
      Math.random() * 30 + 5,
      (Math.random() - 0.5) * 60
    );
    this.speed = Math.random() * 0.5 + 0.3;
    this.wobbleOffset = Math.random() * Math.PI * 2;
  }

  update(time, delta) {
    this.group.position.y += this.speed * delta;
    this.group.position.x += Math.sin(time * 0.5 + this.wobbleOffset) * 0.02;
    this.group.position.z += Math.cos(time * 0.3 + this.wobbleOffset) * 0.02;

    if (this.group.position.y > 50) {
      this.reset();
      this.group.position.y = -5;
    }
  }
}

// Create lanterns
const lanterns = [];
for (let i = 0; i < 15; i++) {
  lanterns.push(new Lantern());
}

// ============ SCENE MANAGEMENT ============
let currentScene = 'all';
const clock = new THREE.Clock();

function setScene(sceneName) {
  currentScene = sceneName;

  // Update buttons
  document.querySelectorAll('.control-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.scene === sceneName);
  });

  // Animate camera and elements based on scene
  switch(sceneName) {
    case 'diyas':
      gsap.to(camera.position, { x: 0, y: 3, z: 12, duration: 2, ease: 'power2.inOut' });
      gsap.to(camera, { lookAt: { x: 0, y: 1, z: 0 }, duration: 2 });
      diyas.forEach(d => gsap.to(d.group.scale, { x: 1.5, y: 1.5, z: 1.5, duration: 1 }));
      rangoli.group.visible = false;
      break;
    case 'fireworks':
      gsap.to(camera.position, { x: 0, y: 10, z: 30, duration: 2, ease: 'power2.inOut' });
      diyas.forEach(d => gsap.to(d.group.scale, { x: 1, y: 1, z: 1, duration: 1 }));
      rangoli.group.visible = false;
      break;
    case 'rangoli':
      gsap.to(camera.position, { x: 0, y: 20, z: 5, duration: 2, ease: 'power2.inOut' });
      gsap.to(camera, { lookAt: { x: 0, y: 0, z: -5 }, duration: 2 });
      diyas.forEach(d => gsap.to(d.group.scale, { x: 1, y: 1, z: 1, duration: 1 }));
      rangoli.group.visible = true;
      break;
    default:
      gsap.to(camera.position, { x: 0, y: 5, z: 20, duration: 2, ease: 'power2.inOut' });
      gsap.to(camera, { lookAt: { x: 0, y: 0, z: 0 }, duration: 2 });
      diyas.forEach(d => gsap.to(d.group.scale, { x: 1, y: 1, z: 1, duration: 1 }));
      rangoli.group.visible = true;
  }
}

// Button event listeners
document.querySelectorAll('.control-btn').forEach(btn => {
  btn.addEventListener('click', () => setScene(btn.dataset.scene));
});

// ============ ANIMATION LOOP ============
let time = 0;
let fireworkTimer = 0;

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  time += delta;

  // Update elements
  diyas.forEach(d => d.update(time));
  lanterns.forEach(l => l.update(time, delta));
  fireworks.forEach(f => f.update(delta));
  rangoli.update(time);

  // Auto fireworks
  if (currentScene === 'fireworks' || currentScene === 'all') {
    fireworkTimer += delta;
    if (fireworkTimer > 3) {
      launchFirework();
      fireworkTimer = 0;
    }
  }

  // Animate moon glow
  moonGlow.material.opacity = 0.1 + Math.sin(time * 0.5) * 0.05;

  renderer.render(scene, camera);
}

// ============ INIT ============
function init() {
  // Hide loading
  setTimeout(() => {
    document.getElementById('loading').classList.add('hidden');

    // Animate hero content
    gsap.to('#heroContent', { opacity: 1, duration: 2, delay: 0.5 });

    // Show message and footer after delay
    setTimeout(() => {
      document.getElementById('messageSection').classList.add('visible');
      document.getElementById('footer').classList.add('visible');
    }, 2000);
  }, 1000);

  // Start animation
  animate();
}

// Handle resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

init();
