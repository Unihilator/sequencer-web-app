// Imperative WebGL2 renderer for the hero field. No React: the component only
// mounts a canvas and calls startField(), like the audio engine split.

import { FRAGMENT_SHADER, VERTEX_SHADER } from "./shaders";

export type FieldState =
  "loading" | "running" | "paused" | "static" | "unsupported";

// The field is soft and blurry, so it renders below screen resolution and is
// upscaled by the browser. Keeps phones cool and frames cheap.
const MAX_DPR = 1.5;
const RENDER_SCALE = 0.5;
// Start a little "into" the animation so the first frame is already formed.
const START_TIME = 12;
// Clamp long frame gaps (tab switch, debugger) so the field never jumps.
const MAX_FRAME_SECONDS = 0.1;
// How quickly the parallax follows the pointer (per second); lower = lazier.
const POINTER_FOLLOW = 2.5;

/** Size of the drawing buffer for a canvas of the given CSS size. */
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

/**
 * Starts rendering into `canvas` and returns a cleanup function.
 * Progress is reported as `data-state` on the canvas (used by CSS and tests).
 */
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

  let program = createProgram(gl);
  if (!program) {
    setState("unsupported");
    return () => {};
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let elapsed = START_TIME;
  let lastFrame: number | null = null;
  let frameId = 0;
  let onScreen = true;
  let contextLost = false;
  // Pointer in -1..1 (target) and the smoothed value sent to the shader.
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };

  const draw = () => {
    if (!program || contextLost) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program.handle);
    gl.uniform2f(program.uResolution, canvas.width, canvas.height);
    gl.uniform1f(program.uTime, elapsed);
    gl.uniform2f(program.uPointer, pointer.x, pointer.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const loop = (now: number) => {
    if (lastFrame !== null) {
      const dt = Math.min((now - lastFrame) / 1000, MAX_FRAME_SECONDS);
      elapsed += dt;
      // Frame-rate independent easing towards the pointer.
      const follow = 1 - Math.exp(-dt * POINTER_FOLLOW);
      pointer.x += (pointer.targetX - pointer.x) * follow;
      pointer.y += (pointer.targetY - pointer.y) * follow;
    }
    lastFrame = now;
    draw();
    frameId = requestAnimationFrame(loop);
  };

  // Single place that decides between animating, one still frame, or idle.
  const update = () => {
    if (contextLost) return;
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
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
    draw();
    setState(reducedMotion.matches ? "static" : "paused");
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
      // Resizing clears the buffer; repaint right away when not animating.
      if (!frameId) draw();
    }
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    update();
  });
  intersectionObserver.observe(canvas);

  const onContextLost = (event: Event) => {
    event.preventDefault(); // allows "webglcontextrestored" to fire
    contextLost = true;
    cancelAnimationFrame(frameId);
    frameId = 0;
    program = null;
    setState("loading"); // hides the canvas; the CSS fallback shows through
  };
  const onContextRestored = () => {
    contextLost = false;
    program = createProgram(gl);
    if (program) update();
    else setState("unsupported");
  };

  const onPointerMove = (event: PointerEvent) => {
    pointer.targetX = (event.clientX / window.innerWidth) * 2 - 1;
    // Flipped: WebGL's y axis points up.
    pointer.targetY = 1 - (event.clientY / window.innerHeight) * 2;
  };

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  document.addEventListener("visibilitychange", update);
  reducedMotion.addEventListener("change", update);

  resize();
  update();

  return () => {
    cancelAnimationFrame(frameId);
    window.removeEventListener("pointermove", onPointerMove);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
    document.removeEventListener("visibilitychange", update);
    reducedMotion.removeEventListener("change", update);
    if (program) gl.deleteProgram(program.handle);
  };
}

type FieldProgram = {
  handle: WebGLProgram;
  uResolution: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
  uPointer: WebGLUniformLocation | null;
};

function createProgram(gl: WebGL2RenderingContext): FieldProgram | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const handle = gl.createProgram();
  if (!vertex || !fragment || !handle) return null;
  gl.attachShader(handle, vertex);
  gl.attachShader(handle, fragment);
  gl.linkProgram(handle);
  // Shaders are owned by the program once linked.
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
    console.error("Hero field: link failed", gl.getProgramInfoLog(handle));
    gl.deleteProgram(handle);
    return null;
  }
  // The vertex shader needs no attributes, but drawing requires a VAO bound.
  gl.bindVertexArray(gl.createVertexArray());
  return {
    handle,
    uResolution: gl.getUniformLocation(handle, "uResolution"),
    uTime: gl.getUniformLocation(handle, "uTime"),
    uPointer: gl.getUniformLocation(handle, "uPointer"),
  };
}

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Hero field: compile failed", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}
