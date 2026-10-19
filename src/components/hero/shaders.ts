// GLSL (WebGL2 / GLSL ES 3.00) for the hero field.

import { TRAIL_REACH } from "./trail";

// The trail pass stores glow / TRAIL_GLOW_SCALE so it fits an 8-bit texture.
const TRAIL_GLOW_SCALE = "2.0";

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
// Glow of the pointer trail, drawn by the trail pass at the same size.
uniform sampler2D uTrailGlow;

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
  float glow =
    texelFetch(uTrailGlow, ivec2(gl_FragCoord.xy), 0).r * ${TRAIL_GLOW_SCALE};
  if (glow > 0.0) {
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

// Trail pass: one quad per segment (see buildTrailMesh), drawn into a
// texture with MAX blending so that overlapping capsules don't add up.
export const TRAIL_VERTEX_SHADER = /* glsl */ `#version 300 es
uniform vec2 uResolution;
// Field space: origin at the centre, y up, units of canvas height.
in vec2 aPosition;
// Position inside the segment's capsule: along it (0..length), across it.
in vec2 aLocal;
in float aLength;
// Life at the start and the end of the segment.
in vec2 aLife;
out vec2 vLocal;
flat out float vLength;
flat out vec2 vLife;

void main() {
  vLocal = aLocal;
  vLength = aLength;
  vLife = aLife;
  gl_Position = vec4(
    aPosition.x * 2.0 * uResolution.y / uResolution.x,
    aPosition.y * 2.0,
    0.0,
    1.0
  );
}
`;

export const TRAIL_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
in vec2 vLocal;
flat in float vLength;
flat in vec2 vLife;
out vec4 outColor;

const float REACH = ${TRAIL_REACH.toFixed(4)};

void main() {
  // Distance to the segment: zero along it, round beyond its ends.
  float along = clamp(vLocal.x, 0.0, vLength);
  float d = length(vec2(vLocal.x - along, vLocal.y));
  float life = mix(vLife.x, vLife.y, along / max(vLength, 1e-6));
  // A bright core that thins with age, and a soft halo around it.
  float core = smoothstep(0.004 + 0.006 * life, 0.0, d);
  float halo = exp(-d * d / (0.0016 * life + 1e-5)) * smoothstep(REACH, 0.6 * REACH, d);
  // Stays bright for most of its life, dims only near the end.
  float glow = (core + 0.45 * halo) * smoothstep(0.0, 0.7, life);
  outColor = vec4(glow / ${TRAIL_GLOW_SCALE}, 0.0, 0.0, 1.0);
}
`;
