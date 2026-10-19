// Imperative WebGL2 renderer for the hero field. No React: the component only
// mounts a canvas and calls startField(), like the audio engine split.

import { FRAGMENT_SHADER, TRAIL_POINTS, VERTEX_SHADER } from "./shaders";
import { Trail, toFieldSpace } from "./trail";

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
// The pointer trail: seconds a point glows, and the smallest step (in units
// of canvas height) that adds a new point.
const TRAIL_LIFETIME = 1.2;
const TRAIL_MIN_STEP = 0.01;

type Rgb = [number, number, number];

// CSS tokens from globals.css that tint the field (single source of truth).
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

  const palette = readPalette();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let elapsed = START_TIME;
  let lastFrame: number | null = null;
  let frameId = 0;
  let onScreen = true;
  let contextLost = false;
  // Pointer in -1..1 (target) and the smoothed value sent to the shader.
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  const trail = new Trail({
    lifetime: TRAIL_LIFETIME,
    maxPoints: TRAIL_POINTS,
    minDistance: TRAIL_MIN_STEP,
  });
  const trailData = new Float32Array(TRAIL_POINTS * 4);

  const draw = () => {
    if (!program || contextLost) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program.handle);
    gl.uniform2f(program.uResolution, canvas.width, canvas.height);
    gl.uniform1f(program.uTime, elapsed);
    gl.uniform2f(program.uPointer, pointer.x, pointer.y);
    // Only a live animation has a trail; still frames are drawn without it.
    const trailCount = frameId
      ? trail.pack(performance.now() / 1000, trailData)
      : 0;
    gl.uniform4fv(program.uTrail, trailData);
    gl.uniform1i(program.uTrailCount, trailCount);
    for (const name of Object.keys(palette) as PaletteUniform[]) {
      gl.uniform3fv(program.palette[name], palette[name]);
    }
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
    trail.clear();
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
    // Touches are traced by the touch listeners below, which keep firing
    // while the page scrolls (pointer events are cancelled by scrolling).
    if (event.pointerType !== "touch") addTrailPoint(event);
  };

  const addTrailPoint = (position: { clientX: number; clientY: number }) => {
    if (!frameId) return;
    const { x, y } = toFieldSpace(
      position.clientX,
      position.clientY,
      canvas.getBoundingClientRect(),
    );
    trail.add(x, y, performance.now() / 1000);
  };
  const liftTrail = () => trail.lift();
  const onTouchStart = (event: TouchEvent) => {
    trail.lift();
    addTrailPoint(event.touches[0]);
  };
  const onTouchMove = (event: TouchEvent) => addTrailPoint(event.touches[0]);

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("touchend", liftTrail);
  window.addEventListener("touchcancel", liftTrail);
  document.documentElement.addEventListener("mouseleave", liftTrail);
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  document.addEventListener("visibilitychange", update);
  reducedMotion.addEventListener("change", update);

  resize();
  update();

  return () => {
    cancelAnimationFrame(frameId);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", liftTrail);
    window.removeEventListener("touchcancel", liftTrail);
    document.documentElement.removeEventListener("mouseleave", liftTrail);
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
  uTrail: WebGLUniformLocation | null;
  uTrailCount: WebGLUniformLocation | null;
  palette: Record<PaletteUniform, WebGLUniformLocation | null>;
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
    uTrail: gl.getUniformLocation(handle, "uTrail"),
    uTrailCount: gl.getUniformLocation(handle, "uTrailCount"),
    palette: {
      uBackground: gl.getUniformLocation(handle, "uBackground"),
      uAccent: gl.getUniformLocation(handle, "uAccent"),
      uAccentSoft: gl.getUniformLocation(handle, "uAccentSoft"),
      uSignal: gl.getUniformLocation(handle, "uSignal"),
    },
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
