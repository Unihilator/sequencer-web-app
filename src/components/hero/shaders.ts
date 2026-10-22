// GLSL (WebGL2 / GLSL ES 3.00) for the hero field.

// One fullscreen triangle, generated without vertex buffers.
export const VERTEX_SHADER = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

// Domain-warped noise in three layers: far haze, the main field, near wisps.
// Fluid velocity bends those layers and changes their light, not an overlay.
export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
// Smoothed pointer position, -1..1 on both axes (0 = centre).
uniform vec2 uPointer;
uniform vec3 uBackground;
uniform vec3 uAccent;
uniform vec3 uAccentSoft;
uniform vec3 uSignal;
uniform sampler2D uVelocity;

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
  vec2 velocity = texture(uVelocity, gl_FragCoord.xy / uResolution).xy;
  // Selected in the motion lab: fluidWarp=1.5, fluidLight=0.6.
  vec2 offset = velocity * 0.0004 * 1.5;

  float far = fbm((uv + uPointer * 0.015 + offset * 0.3) * 1.1 + vec2(0.5 * t, -0.3 * t));

  vec2 p = (uv + uPointer * 0.045 + offset) * 1.4;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(
    fbm(p + 3.5 * q + vec2(1.7, 9.2) + 1.3 * t),
    fbm(p + 3.5 * q + vec2(8.3, 2.8) - 0.9 * t)
  );
  float f = fbm(p + 3.5 * r);

  float near = fbm((uv + uPointer * 0.13 + offset * 1.6) * 0.9 + vec2(-1.6 * t, 0.9 * t) + 20.0);
  near = smoothstep(0.52, 0.8, near);

  vec3 color = uBackground + uAccent * 0.16 * smoothstep(0.3, 0.8, far);
  color = mix(color, uAccent * 0.8, smoothstep(0.22, 0.8, f));
  color = mix(color, uAccentSoft * 0.75, smoothstep(0.5, 0.95, f) * clamp(length(q), 0.0, 1.0));
  color += uSignal * 0.22 * smoothstep(0.62, 0.9, r.x) * smoothstep(0.5, 0.85, f);

  float light = smoothstep(1.6, 0.0, length(uv - vec2(0.55, 0.4)));
  color *= 0.55 + 0.75 * light;
  color = mix(color, uBackground * 0.7, near * 0.6);

  // Light follows moving smoke, rather than drawing the pointer's path.
  color += uAccentSoft * 0.6 * 0.18
    * smoothstep(20.0, 260.0, length(velocity)) * smoothstep(0.25, 0.8, f);

  float vignette = smoothstep(1.45, 0.25, length(uv * vec2(0.85, 1.1)));
  color = mix(uBackground * 0.6, color, mix(0.3, 1.0, vignette));

  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  float grain = hash(gl_FragCoord.xy + fract(uTime * 1.37) * 517.0) - 0.5;
  color += grain * (0.042 + 0.15 * luma);
  outColor = vec4(color, 1.0);
}
`;
