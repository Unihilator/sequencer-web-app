// A small GPU fluid simulation under the hero field (Stam's "stable fluids",
// structured like Pavel Dobryakov's WebGL-Fluid-Simulation). The pointer
// stirs it; the field shader then bends and lights the smoke with the
// velocity, so moving through the hero feels like a hand through clouds.
// No React and no DOM: field.ts feeds it pointer segments in grid space.

import {
  ADVECT_SHADER,
  CURL_SHADER,
  DIVERGENCE_SHADER,
  FLUID_VERTEX_SHADER,
  GRADIENT_SHADER,
  PRESSURE_SHADER,
  SPLAT_SHADER,
  VORTICITY_SHADER,
} from "./fluid-shaders";
import { linkProgram, uniformLocations } from "./gl";

// Tuned in tools/field-motion-lab.html
// ("motion fluid force=0.95 curl=13 fluidFade=0.1 radius=0.7").
export const FLUID_SETTINGS = {
  /** Grid rows; columns follow the aspect ratio. The smoke is soft. */
  height: 160,
  force: 0.95,
  /** Vorticity confinement: how strongly small swirls are kept alive. */
  curl: 13,
  /** Per second; low = swirls linger for many seconds. */
  dissipation: 0.1,
  /** Brush size relative to the lab's default. */
  radius: 0.7,
  pressureIterations: 16,
  /** Fastest pointer speed that still adds force, texels per second. */
  maxSpeed: 1500,
};

/** Pointer movement between two events, in grid space (0..1, y up). */
export type FluidSegment = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Time between the two events. */
  seconds: number;
};

export function fluidSize(
  aspect: number,
  height = FLUID_SETTINGS.height,
): { width: number; height: number } {
  return { width: Math.max(1, Math.round(height * aspect)), height };
}

/**
 * Force a pointer segment adds to the fluid, in texels per second: the
 * pointer's speed, capped, scaled by the segment's share of a 60 Hz frame
 * so the push doesn't depend on how many events the browser delivers.
 */
export function splatForce(
  segment: FluidSegment,
  grid: { width: number; height: number },
  force = FLUID_SETTINGS.force,
): [number, number] {
  const seconds = Math.max(segment.seconds, 1 / 240);
  let vx = ((segment.bx - segment.ax) / seconds) * grid.width;
  let vy = ((segment.by - segment.ay) / seconds) * grid.height;
  const speed = Math.hypot(vx, vy);
  if (speed > FLUID_SETTINGS.maxSpeed) {
    vx *= FLUID_SETTINGS.maxSpeed / speed;
    vy *= FLUID_SETTINGS.maxSpeed / speed;
  }
  const scale = force * 0.6 * Math.min(seconds * 60, 1);
  return [vx * scale, vy * scale];
}

type Target = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
};

type Pass = {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
};

const SHADERS = {
  splat: SPLAT_SHADER,
  curl: CURL_SHADER,
  vorticity: VORTICITY_SHADER,
  divergence: DIVERGENCE_SHADER,
  pressure: PRESSURE_SHADER,
  gradient: GRADIENT_SHADER,
  advect: ADVECT_SHADER,
};

export class Fluid {
  private grid = { width: 1, height: 1 };
  private aspect = 1;
  private velocity: [Target, Target] | null = null;
  private pressure: [Target, Target] | null = null;
  private divergence: Target | null = null;
  private curl: Target | null = null;

  private constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly passes: Record<keyof typeof SHADERS, Pass>,
    private readonly vertexArray: WebGLVertexArrayObject,
  ) {}

  /** Null when the GPU can't render into float textures (then: no stirring). */
  static create(gl: WebGL2RenderingContext): Fluid | null {
    const floatTargets =
      gl.getExtension("EXT_color_buffer_float") ??
      gl.getExtension("EXT_color_buffer_half_float");
    if (!floatTargets) return null;
    const passes = {} as Record<keyof typeof SHADERS, Pass>;
    for (const [name, source] of Object.entries(SHADERS)) {
      const program = linkProgram(gl, FLUID_VERTEX_SHADER, source);
      if (!program) {
        for (const pass of Object.values(passes))
          gl.deleteProgram(pass.program);
        return null;
      }
      passes[name as keyof typeof SHADERS] = {
        program,
        uniforms: uniformLocations(gl, program),
      };
    }
    const vertexArray = gl.createVertexArray();
    if (!vertexArray) {
      for (const pass of Object.values(passes)) gl.deleteProgram(pass.program);
      return null;
    }
    const fluid = new Fluid(gl, passes, vertexArray);
    return fluid.resize(1) ? fluid : (fluid.dispose(), null);
  }

  /** The velocity field, for the field shader (texels per second). */
  get velocityTexture(): WebGLTexture | null {
    return this.velocity?.[0].texture ?? null;
  }

  /** Re-creates the grid for a new aspect ratio (clears the motion). */
  resize(aspect: number): boolean {
    const grid = fluidSize(aspect);
    this.aspect = aspect;
    if (
      this.velocity &&
      grid.width === this.grid.width &&
      grid.height === this.grid.height
    ) {
      return true;
    }
    this.deleteTargets();
    this.grid = grid;
    this.aspect = aspect;
    const make = () => this.createTarget();
    const targets = [make(), make(), make(), make(), make(), make()];
    if (targets.some((target) => !target)) {
      for (const target of targets) {
        if (!target) continue;
        this.gl.deleteTexture(target.texture);
        this.gl.deleteFramebuffer(target.framebuffer);
      }
      return false;
    }
    const [v0, v1, p0, p1, divergence, curl] = targets as Target[];
    this.velocity = [v0, v1];
    this.pressure = [p0, p1];
    this.divergence = divergence;
    this.curl = curl;
    return true;
  }

  /** Stirs the fluid along one pointer segment. */
  splat(segment: FluidSegment): void {
    if (!this.velocity) return;
    const [fx, fy] = splatForce(segment, this.grid);
    const radius = 0.0012 * FLUID_SETTINGS.radius ** 2;
    this.run("splat", this.velocity[1], {
      uVelocity: this.velocity[0],
      uA: [segment.ax, segment.ay],
      uB: [segment.bx, segment.by],
      uForce: [fx, fy],
      uRadius: radius,
      uAspect: this.aspect,
    });
    this.velocity.reverse();
  }

  /** Advances the simulation by `dt` seconds. */
  step(dt: number): void {
    const { velocity, pressure, divergence, curl } = this;
    if (!velocity || !pressure || !divergence || !curl) return;
    this.run("curl", curl, { uVelocity: velocity[0] });
    this.run("vorticity", velocity[1], {
      uVelocity: velocity[0],
      uCurl: curl,
      uStrength: FLUID_SETTINGS.curl,
      uDt: dt,
    });
    velocity.reverse();
    this.run("divergence", divergence, { uVelocity: velocity[0] });
    for (let i = 0; i < FLUID_SETTINGS.pressureIterations; i++) {
      this.run("pressure", pressure[1], {
        uPressure: pressure[0],
        uDivergence: divergence,
      });
      pressure.reverse();
    }
    this.run("gradient", velocity[1], {
      uPressure: pressure[0],
      uVelocity: velocity[0],
    });
    velocity.reverse();
    this.run("advect", velocity[1], {
      uVelocity: velocity[0],
      uDt: dt,
      uDissipation: FLUID_SETTINGS.dissipation,
    });
    velocity.reverse();
  }

  dispose(): void {
    this.deleteTargets();
    for (const pass of Object.values(this.passes)) {
      this.gl.deleteProgram(pass.program);
    }
    this.gl.deleteVertexArray(this.vertexArray);
  }

  // One fullscreen pass of `name` into `target`. Uniform values: numbers,
  // vec2 arrays, or targets (bound as textures).
  private run(
    name: keyof typeof SHADERS,
    target: Target,
    values: Record<string, number | [number, number] | Target>,
  ) {
    const { gl } = this;
    const { program, uniforms } = this.passes[name];
    gl.useProgram(program);
    gl.bindVertexArray(this.vertexArray);
    gl.uniform2f(
      uniforms.uTexel ?? null,
      1 / this.grid.width,
      1 / this.grid.height,
    );
    let unit = 0;
    for (const [uniform, value] of Object.entries(values)) {
      const location = uniforms[uniform] ?? null;
      if (typeof value === "number") gl.uniform1f(location, value);
      else if (Array.isArray(value)) gl.uniform2f(location, value[0], value[1]);
      else {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, value.texture);
        gl.uniform1i(location, unit++);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, this.grid.width, this.grid.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private createTarget(): Target | null {
    const { gl } = this;
    const texture = gl.createTexture();
    if (!texture) return null;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Linear filtering: advection and the field read between cells.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      this.grid.width,
      this.grid.height,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null,
    );
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) {
      gl.deleteTexture(texture);
      return null;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    const complete =
      gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (complete) {
      gl.viewport(0, 0, this.grid.width, this.grid.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!complete) {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
      return null;
    }
    return { texture, framebuffer };
  }

  private deleteTargets() {
    const targets = [
      ...(this.velocity ?? []),
      ...(this.pressure ?? []),
      this.divergence,
      this.curl,
    ];
    for (const target of targets) {
      if (!target) continue;
      this.gl.deleteTexture(target.texture);
      this.gl.deleteFramebuffer(target.framebuffer);
    }
    this.velocity = this.pressure = null;
    this.divergence = this.curl = null;
  }
}
