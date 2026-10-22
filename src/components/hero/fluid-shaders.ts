// GLSL for the fluid simulation under the hero field (see fluid.ts).
// Velocities are stored in texels per second of the simulation grid.

// Fullscreen triangle with texture coordinates (0..1).
export const FLUID_VERTEX_SHADER = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const HEADER = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
// Size of one grid cell in texture coordinates.
uniform vec2 uTexel;
`;

// Neighbours of the current cell in a texture (left, right, top, bottom).
const NEIGHBOURS = /* glsl */ `
#define LEFT(t) texture(t, vUv - vec2(uTexel.x, 0.0))
#define RIGHT(t) texture(t, vUv + vec2(uTexel.x, 0.0))
#define TOP(t) texture(t, vUv + vec2(0.0, uTexel.y))
#define BOTTOM(t) texture(t, vUv - vec2(0.0, uTexel.y))
`;

// Pushes the fluid along the pointer's path a → b: a soft brush around
// the segment adds uForce (texels per second).
export const SPLAT_SHADER =
  HEADER +
  /* glsl */ `
uniform sampler2D uVelocity;
uniform vec2 uA;
uniform vec2 uB;
uniform vec2 uForce;
// Squared brush radius, in units of grid height.
uniform float uRadius;
uniform float uAspect;

void main() {
  vec2 scale = vec2(uAspect, 1.0);
  vec2 p = vUv * scale;
  vec2 a = uA * scale;
  vec2 ab = uB * scale - a;
  float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
  float d = length(p - a - ab * h);
  vec2 velocity = texture(uVelocity, vUv).xy + uForce * exp(-d * d / uRadius);
  outColor = vec4(velocity, 0.0, 1.0);
}
`;

// Rotation of the velocity at every cell.
export const CURL_SHADER =
  HEADER +
  NEIGHBOURS +
  /* glsl */ `
uniform sampler2D uVelocity;
void main() {
  float curl =
    RIGHT(uVelocity).y - LEFT(uVelocity).y - TOP(uVelocity).x + BOTTOM(uVelocity).x;
  outColor = vec4(0.5 * curl, 0.0, 0.0, 1.0);
}
`;

// Vorticity confinement: feeds the small swirls back so they don't smear
// out. This is what turns a push into turbulence.
export const VORTICITY_SHADER =
  HEADER +
  NEIGHBOURS +
  /* glsl */ `
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float uStrength;
uniform float uDt;
void main() {
  vec2 force = 0.5 * vec2(
    abs(TOP(uCurl).x) - abs(BOTTOM(uCurl).x),
    abs(RIGHT(uCurl).x) - abs(LEFT(uCurl).x)
  );
  force /= length(force) + 1e-4;
  force *= uStrength * texture(uCurl, vUv).x * vec2(1.0, -1.0);
  vec2 velocity = texture(uVelocity, vUv).xy + force * uDt;
  outColor = vec4(clamp(velocity, -1000.0, 1000.0), 0.0, 1.0);
}
`;

export const DIVERGENCE_SHADER =
  HEADER +
  NEIGHBOURS +
  /* glsl */ `
uniform sampler2D uVelocity;
void main() {
  float divergence =
    RIGHT(uVelocity).x - LEFT(uVelocity).x + TOP(uVelocity).y - BOTTOM(uVelocity).y;
  outColor = vec4(0.5 * divergence, 0.0, 0.0, 1.0);
}
`;

// One Jacobi iteration of the pressure equation.
export const PRESSURE_SHADER =
  HEADER +
  NEIGHBOURS +
  /* glsl */ `
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main() {
  float sum =
    LEFT(uPressure).x + RIGHT(uPressure).x + TOP(uPressure).x + BOTTOM(uPressure).x;
  outColor = vec4((sum - texture(uDivergence, vUv).x) * 0.25, 0.0, 0.0, 1.0);
}
`;

// Removes the pressure gradient: the flow becomes swirly, not compressive.
export const GRADIENT_SHADER =
  HEADER +
  NEIGHBOURS +
  /* glsl */ `
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main() {
  vec2 gradient = vec2(
    RIGHT(uPressure).x - LEFT(uPressure).x,
    TOP(uPressure).x - BOTTOM(uPressure).x
  );
  outColor = vec4(texture(uVelocity, vUv).xy - 0.5 * gradient, 0.0, 1.0);
}
`;

// Moves the velocity along itself and lets it slowly die down.
export const ADVECT_SHADER =
  HEADER +
  /* glsl */ `
uniform sampler2D uVelocity;
uniform float uDt;
uniform float uDissipation;
void main() {
  vec2 from = vUv - uDt * texture(uVelocity, vUv).xy * uTexel;
  outColor = texture(uVelocity, from) / (1.0 + uDissipation * uDt);
}
`;
