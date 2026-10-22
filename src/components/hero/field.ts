// Imperative WebGL2 renderer. React only mounts the canvas, like the audio
// engine split: simulation and rendering own their lifecycle here.

import { Fluid, type FluidSegment } from "./fluid";
import { linkProgram, uniformLocations } from "./gl";
import { FRAGMENT_SHADER, VERTEX_SHADER } from "./shaders";

export type FieldState =
  "loading" | "running" | "paused" | "static" | "unsupported";

const MAX_DPR = 1.5;
const RENDER_SCALE = 0.5;
const START_TIME = 12;
const MAX_FRAME_SECONDS = 0.1;
const POINTER_FOLLOW = 2.5;
// Bound fullscreen splat passes, even on high-frequency pointer hardware.
const MAX_SPLATS_PER_FRAME = 8;

type Rgb = [number, number, number];
const PALETTE_TOKENS = {
  uBackground: "--background",
  uAccent: "--accent",
  uAccentSoft: "--accent-soft",
  uSignal: "--signal",
} as const;
type PaletteUniform = keyof typeof PALETTE_TOKENS;

/** "#3e7198" → [0.24, 0.44, 0.6]; null for anything but #rrggbb. */
export function parseHexColor(value: string): Rgb | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(
    value.trim(),
  );
  if (!match) return null;
  return [match[1], match[2], match[3]].map(
    (channel) => parseInt(channel, 16) / 255,
  ) as Rgb;
}

function readPalette(): Record<PaletteUniform, Rgb> {
  const styles = getComputedStyle(document.documentElement);
  const read = (token: string): Rgb =>
    parseHexColor(styles.getPropertyValue(token)) ?? [0, 0, 0];
  return {
    uBackground: read(PALETTE_TOKENS.uBackground),
    uAccent: read(PALETTE_TOKENS.uAccent),
    uAccentSoft: read(PALETTE_TOKENS.uAccentSoft),
    uSignal: read(PALETTE_TOKENS.uSignal),
  };
}

/** Drawing buffer size; the soft field renders below screen resolution. */
export function renderSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
): { width: number; height: number } {
  const scale = Math.min(devicePixelRatio, MAX_DPR) * RENDER_SCALE;
  return {
    width: Math.max(1, Math.round(cssWidth * scale)),
    height: Math.max(1, Math.round(cssHeight * scale)),
  };
}

/** Starts the field; reports progress via data-state and returns cleanup. */
export function startField(canvas: HTMLCanvasElement): () => void {
  const setState = (state: FieldState) => {
    canvas.dataset.state = state;
  };
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: "low-power",
  });
  if (!gl) {
    setState("unsupported");
    return () => {};
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let renderer = createRenderer(gl, !reducedMotion.matches);
  if (!renderer) {
    setState("unsupported");
    return () => {};
  }

  const palette = readPalette();
  let elapsed = START_TIME;
  let lastFrame: number | null = null;
  let frameId = 0;
  let onScreen = true;
  let contextLost = false;
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  type Sample = { x: number; y: number; time: number; source: string };
  let previous: Sample | null = null;
  const segments: FluidSegment[] = [];
  const lift = () => {
    previous = null;
  };
  const clearInput = () => {
    lift();
    segments.length = 0;
  };

  const draw = () => {
    if (!renderer || contextLost) return;
    const { program, vertexArray, uniforms, fluid, zeroVelocity } = renderer;
    // Fluid passes change the framebuffer, viewport, program and VAO.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.bindVertexArray(vertexArray);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(
      gl.TEXTURE_2D,
      reducedMotion.matches
        ? zeroVelocity
        : (fluid?.velocityTexture ?? zeroVelocity),
    );
    gl.uniform1i(uniforms.uVelocity, 0);
    gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.uTime, elapsed);
    gl.uniform2f(uniforms.uPointer, pointer.x, pointer.y);
    for (const name of Object.keys(palette) as PaletteUniform[]) {
      gl.uniform3fv(uniforms[name], palette[name]);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const loop = (now: number) => {
    const dt =
      lastFrame === null
        ? 1 / 60
        : Math.min((now - lastFrame) / 1000, MAX_FRAME_SECONDS);
    elapsed += dt;
    const follow = 1 - Math.exp(-dt * POINTER_FOLLOW);
    pointer.x += (pointer.targetX - pointer.x) * follow;
    pointer.y += (pointer.targetY - pointer.y) * follow;
    if (renderer?.fluid) {
      for (const segment of segments) renderer.fluid.splat(segment);
      // Small substeps keep confinement stable after a slow frame.
      const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
      for (let i = 0; i < steps; i++) renderer.fluid.step(dt / steps);
    }
    segments.length = 0;
    lastFrame = now;
    draw();
    frameId = requestAnimationFrame(loop);
  };

  const update = () => {
    if (contextLost || !renderer) return;
    const animate =
      !reducedMotion.matches &&
      onScreen &&
      document.visibilityState === "visible";
    if (animate) {
      if (!frameId) {
        lastFrame = null;
        frameId = requestAnimationFrame(loop);
      }
      setState("running");
      return;
    }
    cancelAnimationFrame(frameId);
    frameId = 0;
    clearInput();
    // Dispose motion when reducing animation; resuming starts with calm smoke.
    if (reducedMotion.matches) {
      renderer.fluid?.dispose();
      renderer.fluid = null;
    }
    draw();
    setState(reducedMotion.matches ? "static" : "paused");
  };

  const sizeFluid = () => {
    if (!renderer) return;
    if (
      renderer.fluid &&
      !renderer.fluid.resize(canvas.width / canvas.height)
    ) {
      renderer.fluid.dispose();
      renderer.fluid = null;
    }
    canvas.dataset.motion = renderer.fluid ? "fluid" : "none";
  };
  const resize = () => {
    const { width, height } = renderSize(
      canvas.clientWidth,
      canvas.clientHeight,
      window.devicePixelRatio || 1,
    );
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      clearInput();
      if (!contextLost) sizeFluid();
      if (!frameId) draw();
    }
  };
  const onMotionChange = () => {
    if (!reducedMotion.matches && renderer && !contextLost) {
      renderer.fluid ??= Fluid.create(gl);
      sizeFluid();
    }
    update();
    if (reducedMotion.matches) canvas.dataset.motion = "none";
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    update();
  });
  intersectionObserver.observe(canvas);

  const onContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    cancelAnimationFrame(frameId);
    frameId = 0;
    clearInput();
    renderer = null; // GPU resources died with the context.
    setState("loading");
  };
  const onContextRestored = () => {
    contextLost = false;
    renderer = createRenderer(gl, !reducedMotion.matches);
    if (renderer) {
      sizeFluid();
      update();
    } else setState("unsupported");
  };

  type Position = { clientX: number; clientY: number };
  const addSample = (position: Position, time: number, source: string) => {
    if (!frameId || !renderer?.fluid) return;
    const rect = canvas.getBoundingClientRect();
    const x = (position.clientX - rect.left) / rect.width;
    const y = 1 - (position.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      lift();
      return;
    }
    if (previous && previous.source === source) {
      const seconds = (time - previous.time) / 1000;
      // Don't connect separate gestures across a pause or a tab switch.
      if (seconds > 0 && seconds < 0.15) {
        const segment = {
          ax: previous.x,
          ay: previous.y,
          bx: x,
          by: y,
          seconds,
        };
        if (segments.length < MAX_SPLATS_PER_FRAME) segments.push(segment);
        else {
          // Merge overflow into the last brush stroke instead of dropping force.
          const last = segments[segments.length - 1];
          last.bx = x;
          last.by = y;
          last.seconds += seconds;
        }
      }
    }
    previous = { x, y, time, source };
  };
  const onPointerMove = (event: PointerEvent) => {
    pointer.targetX = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.targetY = 1 - (event.clientY / window.innerHeight) * 2;
    if (event.pointerType === "touch") return;
    const coalesced = event.getCoalescedEvents?.() ?? [];
    for (const sample of coalesced.length ? coalesced : [event]) {
      addSample(sample, sample.timeStamp, `pointer-${event.pointerId}`);
    }
  };
  // Passive touch listeners keep page scrolling available on iOS Safari.
  const onTouchStart = (event: TouchEvent) => {
    lift();
    if (event.touches[0]) addSample(event.touches[0], event.timeStamp, "touch");
  };
  const onTouchMove = (event: TouchEvent) => {
    if (event.touches[0]) addSample(event.touches[0], event.timeStamp, "touch");
  };
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", lift, { passive: true });
  window.addEventListener("pointerup", lift, { passive: true });
  window.addEventListener("pointercancel", lift, { passive: true });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("touchend", lift);
  window.addEventListener("touchcancel", lift);
  document.documentElement.addEventListener("mouseleave", lift);
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  document.addEventListener("visibilitychange", update);
  reducedMotion.addEventListener("change", onMotionChange);

  resize();
  sizeFluid();
  onMotionChange();

  return () => {
    cancelAnimationFrame(frameId);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerdown", lift);
    window.removeEventListener("pointerup", lift);
    window.removeEventListener("pointercancel", lift);
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", lift);
    window.removeEventListener("touchcancel", lift);
    document.documentElement.removeEventListener("mouseleave", lift);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
    document.removeEventListener("visibilitychange", update);
    reducedMotion.removeEventListener("change", onMotionChange);
    if (renderer) deleteRenderer(gl, renderer);
  };
}

type Renderer = {
  program: WebGLProgram;
  vertexArray: WebGLVertexArrayObject;
  uniforms: Record<string, WebGLUniformLocation | null>;
  zeroVelocity: WebGLTexture;
  fluid: Fluid | null;
};

function createRenderer(
  gl: WebGL2RenderingContext,
  motion = true,
): Renderer | null {
  const program = linkProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  if (!program) return null;
  const vertexArray = gl.createVertexArray();
  const zeroVelocity = gl.createTexture();
  if (!vertexArray || !zeroVelocity) {
    gl.deleteProgram(program);
    if (vertexArray) gl.deleteVertexArray(vertexArray);
    if (zeroVelocity) gl.deleteTexture(zeroVelocity);
    return null;
  }
  // A valid zero texture for GPUs without float targets and for still frames.
  gl.bindTexture(gl.TEXTURE_2D, zeroVelocity);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array(4),
  );
  return {
    program,
    vertexArray,
    uniforms: uniformLocations(gl, program),
    zeroVelocity,
    fluid: motion ? Fluid.create(gl) : null,
  };
}

function deleteRenderer(gl: WebGL2RenderingContext, renderer: Renderer) {
  renderer.fluid?.dispose();
  gl.deleteProgram(renderer.program);
  gl.deleteVertexArray(renderer.vertexArray);
  gl.deleteTexture(renderer.zeroVelocity);
}
