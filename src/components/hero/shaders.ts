// GLSL (WebGL2 / GLSL ES 3.00) for the hero field.

// Size of the trail uniform array (vec4 each; WebGL2 guarantees 224).
export const TRAIL_POINTS = 48;

// One triangle that covers the whole screen, generated from gl_VertexID, so
// no vertex buffers are needed.
export const VERTEX_SHADER = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

// A slow, "breathing" field: domain-warped fractal noise (fbm feeding fbm),
// tinted with the site palette (passed in from the CSS tokens).
// Depth comes from three layers with parallax (far haze, the main field,
// near dark wisps), a soft light source and a vignette; film grain on top.
export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
// Smoothed pointer position, -1..1 on both axes (0 = centre).
uniform vec2 uPointer;
// Palette: --background, --accent, --accent-soft, --signal.
uniform vec3 uBackground;
uniform vec3 uAccent;
uniform vec3 uAccentSoft;
uniform vec3 uSignal;
// Pointer trail, oldest first: x, y (same space as uv), life 1..0, and
// 1.0 when a segment joins it to the previous point.
uniform vec4 uTrail[${TRAIL_POINTS}];
uniform int uTrailCount;

out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  // Rotate each octave to hide the grid of the value noise.
  mat2 rotate = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = rotate * p * 2.02;
    amplitude *= 0.5;
  }
  return value;
}

// Glow of the pointer trail at uv: the brightest segment wins, so joints
// don't double up. Segments thin out and dim as they age.
float trailGlow(vec2 uv) {
  float glow = 0.0;
  for (int i = 1; i < ${TRAIL_POINTS}; i++) {
    if (i >= uTrailCount) break;
    vec4 b = uTrail[i];
    if (b.w < 0.5) continue;
    vec4 a = uTrail[i - 1];
    vec2 ab = b.xy - a.xy;
    float h = clamp(dot(uv - a.xy, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    float d = length(uv - a.xy - ab * h);
    float life = mix(a.z, b.z, h);
    float width = 0.004 + 0.006 * life;
    float core = smoothstep(width, 0.0, d);
    float halo = exp(-d * d / (0.0016 * life + 1e-5));
    glow = max(glow, (core + 0.45 * halo) * life * life);
  }
  return glow;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float t = uTime * 0.01;

  // Far layer: large, slow, barely moves with the pointer.
  float far = fbm((uv + uPointer * 0.015) * 1.1 + vec2(0.5 * t, -0.3 * t));

  // Main layer: the warped field.
  vec2 p = (uv + uPointer * 0.045) * 1.4;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(
    fbm(p + 3.5 * q + vec2(1.7, 9.2) + 1.3 * t),
    fbm(p + 3.5 * q + vec2(8.3, 2.8) - 0.9 * t)
  );
  float f = fbm(p + 3.5 * r);

  // Near layer: big soft wisps that drift faster and shift the most.
  float near = fbm((uv + uPointer * 0.13) * 0.9 + vec2(-1.6 * t, 0.9 * t) + 20.0);
  near = smoothstep(0.52, 0.8, near);

  vec3 color = uBackground + uAccent * 0.16 * smoothstep(0.3, 0.8, far);
  color = mix(color, uAccent * 0.8, smoothstep(0.22, 0.8, f));
  color = mix(color, uAccentSoft * 0.75, smoothstep(0.5, 0.95, f) * clamp(length(q), 0.0, 1.0));
  // Rare warm glints where the warped layers line up.
  color += uSignal * 0.22 * smoothstep(0.62, 0.9, r.x) * smoothstep(0.5, 0.85, f);

  // Soft key light from the upper right, like a lamp behind smoke.
  float light = smoothstep(1.6, 0.0, length(uv - vec2(0.55, 0.4)));
  color *= 0.55 + 0.75 * light;

  // Foreground wisps occlude the light: a dark silhouette in front.
  color = mix(color, uBackground * 0.7, near * 0.6);

  // The trail is light inside the smoke: brighter where the field is dense.
  if (uTrailCount > 1) {
    float glow = trailGlow(uv);
    color += mix(uAccentSoft, vec3(1.0), 0.35 * glow) * glow * (0.55 + 0.6 * f);
  }

  // Cinematic vignette.
  float vignette = smoothstep(1.45, 0.25, length(uv * vec2(0.85, 1.1)));
  color = mix(uBackground * 0.6, color, mix(0.3, 1.0, vignette));

  // Animated film grain: new every frame, strongest in the mid-tones.
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  float grain = hash(gl_FragCoord.xy + fract(uTime * 1.37) * 517.0) - 0.5;
  color += grain * (0.042 + 0.15 * luma);

  outColor = vec4(color, 1.0);
}
`;
