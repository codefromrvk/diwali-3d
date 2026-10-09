export const NOISE = /* glsl */ `
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * vnoise(p); p *= 2.03; a *= 0.5; } return v; }
vec3 srgb(vec3 c){ return pow(c, vec3(2.2)); }
`;

// Billboard in view space whose "up" follows world-up, so flames stay upright
// (and appear inverted in the water reflection, as they should).
export const BILLBOARD = /* glsl */ `
vec4 billboard(vec3 center, vec2 local){
  vec4 mv = modelViewMatrix * vec4(center, 1.0);
  vec2 up = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xy;
  float l = length(up);
  up = l > 0.0001 ? up / l : vec2(0.0, 1.0);
  vec2 right = vec2(up.y, -up.x);
  mv.xy += right * local.x + up * local.y;
  return mv;
}
`;
