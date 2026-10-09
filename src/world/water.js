import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { NOISE } from '../glsl.js';
import { clock } from '../time.js';
import { renderer, isMobile } from '../stage.js';

// The Ganga: a real planar reflection, rippled and stretched vertically so
// every lamp becomes a long trembling streak of gold on the water.
const WaterShader = {
  name: 'GangaWater',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld;
    void main(){
      vUv = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    ${NOISE}
    uniform sampler2D tDiffuse; uniform float uTime; varying vec4 vUv; varying vec3 vWorld;
    void main(){
      vec2 w = vWorld.xz;
      float t = uTime;
      vec2 flow = vec2(t * 0.35, 0.0);
      float n1 = vnoise(w * vec2(0.35, 1.1) + flow);
      float n2 = vnoise(w * vec2(0.9, 2.6) - flow * 1.7 + 4.0);
      float n3 = vnoise(w * vec2(2.2, 6.0) + flow * 2.3 + 9.0);
      vec2 dist = vec2(n1 - 0.5, (n2 - 0.5) * 0.6 + (n3 - 0.5) * 0.4);
      float far = length(vWorld - cameraPosition);
      float amp = mix(0.06, 0.012, smoothstep(5.0, 120.0, far));
      vec4 uv = vUv;
      uv.x += dist.x * amp * 0.35 * uv.w;
      uv.y += dist.y * amp * uv.w;

      // vertical smear — the long golden streaks
      vec3 refl = vec3(0.0);
      float wsum = 0.0;
      for (int i = -3; i <= 3; i++){
        float o = float(i) * 0.012 * (1.0 + n3);
        float wt = 1.0 - abs(float(i)) / 4.0;
        refl += texture2DProj(tDiffuse, uv + vec4(0.0, o * uv.w, 0.0, 0.0)).rgb * wt;
        wsum += wt;
      }
      refl /= wsum;

      vec3 V = normalize(cameraPosition - vWorld);
      float fres = 0.18 + 0.82 * pow(1.0 - max(V.y, 0.0), 4.0);
      vec3 deep = srgb(vec3(0.012, 0.016, 0.035));
      vec3 col = deep + refl * fres * 0.9;
      // glints
      col += vec3(1.0, 0.7, 0.4) * pow(n3, 14.0) * 0.04 * fres;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createWater(scene) {
  const scale = isMobile ? 0.35 : 0.5;
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const water = new Reflector(new THREE.PlaneGeometry(900, 500), {
    shader: WaterShader,
    textureWidth: Math.round(size.x * scale),
    textureHeight: Math.round(size.y * scale),
    clipBias: 0.003,
    multisample: 0,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0, -254);
  water.renderOrder = -1;
  scene.add(water);

  addEventListener('resize', () => {
    renderer.getDrawingBufferSize(size);
    water.getRenderTarget().setSize(Math.round(size.x * scale), Math.round(size.y * scale));
  });

  return {
    mesh: water,
    update() { water.material.uniforms.uTime.value = clock.t; },
  };
}
