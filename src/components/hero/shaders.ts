// GLSL (WebGL2 / GLSL ES 3.00) for the hero field.

// One triangle that covers the whole screen, generated from gl_VertexID, so
// no vertex buffers are needed.
export const VERTEX_SHADER = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

// A slow, "breathing" field: domain-warped fractal noise (fbm feeding fbm),
// tinted with the site palette. Colors mirror the tokens in globals.css.
// Depth comes from three layers with parallax (far haze, the main field,
// near dark wisps), a soft light source and a vignette; film grain on top.
export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
// Smoothed pointer position, -1..1 on both axes (0 = centre).
uniform vec2 uPointer;

out vec4 outColor;

const vec3 BACKGROUND = vec3(0.043, 0.047, 0.078); // #0b0c14
const vec3 ACCENT = vec3(0.239, 0.275, 0.984);     // #3d46fb
const vec3 ACCENT_SOFT = vec3(0.541, 0.565, 1.0);  // #8a90ff
const vec3 SIGNAL = vec3(1.0, 0.420, 0.290);       // #ff6b4a

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
  float t = uTime * 0.022;

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

  vec3 color = BACKGROUND + ACCENT * 0.16 * smoothstep(0.3, 0.8, far);
  color = mix(color, ACCENT * 0.8, smoothstep(0.22, 0.8, f));
  color = mix(color, ACCENT_SOFT * 0.75, smoothstep(0.5, 0.95, f) * clamp(length(q), 0.0, 1.0));
  // Rare warm glints where the warped layers line up.
  color += SIGNAL * 0.22 * smoothstep(0.62, 0.9, r.x) * smoothstep(0.5, 0.85, f);

  // Soft key light from the upper right, like a lamp behind smoke.
  float light = smoothstep(1.6, 0.0, length(uv - vec2(0.55, 0.4)));
  color *= 0.55 + 0.75 * light;

  // Foreground wisps occlude the light: a dark silhouette in front.
  color = mix(color, BACKGROUND * 0.7, near * 0.6);

  // Cinematic vignette.
  float vignette = smoothstep(1.45, 0.25, length(uv * vec2(0.85, 1.1)));
  color *= mix(0.3, 1.0, vignette);

  // Animated film grain: new every frame, strongest in the mid-tones.
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  float grain = hash(gl_FragCoord.xy + fract(uTime * 1.37) * 517.0) - 0.5;
  color += grain * (0.025 + 0.09 * luma);

  outColor = vec4(color, 1.0);
}
`;
