// Imperative WebGL2 renderer for the hero field. No React: the component only
// mounts a canvas and calls startField(), like the audio engine split.

import {
  FRAGMENT_SHADER,
  TRAIL_FRAGMENT_SHADER,
  TRAIL_VERTEX_SHADER,
  VERTEX_SHADER,
} from "./shaders";
import {
  buildTrailMesh,
  Trail,
  TRAIL_VERTEX_FLOATS,
  toFieldSpace,
} from "./trail";

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
// The pointer trail. It stays while the pointer moves (so a whole shape can
// be drawn), then fades out as one piece once the pointer rests.
const TRAIL = {
  lifetime: 3.5,
  idleDelay: 0.35,
  idleFade: 0.7,
  maxPoints: 1024,
  // In units of canvas height; the spline fills in between.
  minDistance: 0.006,
};
// Most points the smoothed trail may have; each becomes a quad on the GPU.
const TRAIL_CURVE_POINTS = 1024;

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

  let renderer = createRenderer(gl);
  if (!renderer) {
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
  const trail = new Trail(TRAIL);
  const trailMesh = new Float32Array(
    TRAIL_CURVE_POINTS * 6 * TRAIL_VERTEX_FLOATS,
  );
  // Whether the glow texture holds anything (skip clearing an empty one).
  let glowDrawn = false;

  const draw = () => {
    if (!renderer || contextLost) return;
    const { field, glow } = renderer;
    const { width, height } = canvas;
    gl.viewport(0, 0, width, height);

    // Pass 1: the trail into the glow texture. Only a live animation has a
    // trail; still frames are drawn without it.
    const points = frameId
      ? trail.curve(performance.now() / 1000, TRAIL_CURVE_POINTS)
      : [];
    const vertices = buildTrailMesh(points, trailMesh);
    if (vertices > 0 || glowDrawn) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, glow.framebuffer);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (vertices > 0) {
        gl.useProgram(glow.program);
        gl.uniform2f(glow.uResolution, width, height);
        gl.bindVertexArray(glow.vertexArray);
        gl.bindBuffer(gl.ARRAY_BUFFER, glow.buffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          trailMesh.subarray(0, vertices * TRAIL_VERTEX_FLOATS),
          gl.DYNAMIC_DRAW,
        );
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.MAX);
        gl.drawArrays(gl.TRIANGLES, 0, vertices);
        gl.disable(gl.BLEND);
      }
      glowDrawn = vertices > 0;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // Pass 2: the field, lit by the glow.
    gl.useProgram(field.program);
    gl.bindVertexArray(field.vertexArray);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, glow.texture);
    gl.uniform1i(field.uTrailGlow, 0);
    gl.uniform2f(field.uResolution, width, height);
    gl.uniform1f(field.uTime, elapsed);
    gl.uniform2f(field.uPointer, pointer.x, pointer.y);
    for (const name of Object.keys(palette) as PaletteUniform[]) {
      gl.uniform3fv(field.palette[name], palette[name]);
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
      if (renderer) sizeGlowTexture(gl, renderer.glow.texture, width, height);
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
    renderer = null; // its GPU objects died with the context
    setState("loading"); // hides the canvas; the CSS fallback shows through
  };
  const onContextRestored = () => {
    contextLost = false;
    renderer = createRenderer(gl);
    glowDrawn = false;
    if (renderer) {
      sizeGlowTexture(gl, renderer.glow.texture, canvas.width, canvas.height);
      update();
    } else setState("unsupported");
  };

  const onPointerMove = (event: PointerEvent) => {
    pointer.targetX = (event.clientX / window.innerWidth) * 2 - 1;
    // Flipped: WebGL's y axis points up.
    pointer.targetY = 1 - (event.clientY / window.innerHeight) * 2;
    // Touches are traced by the touch listeners below, which keep firing
    // while the page scrolls (pointer events are cancelled by scrolling).
    if (event.pointerType === "touch") return;
    // The browser delivers one pointermove per frame; the positions in
    // between (up to ~1000 per second) wait in the coalesced list. Without
    // them a curve drawn during a slow frame turns into a straight line.
    const coalesced =
      typeof event.getCoalescedEvents === "function"
        ? event.getCoalescedEvents()
        : [];
    addTrailPoints(coalesced.length > 0 ? coalesced : [event]);
  };

  type Position = { clientX: number; clientY: number };
  const addTrailPoints = (positions: readonly Position[]) => {
    if (!frameId) return;
    const rect = canvas.getBoundingClientRect();
    const now = performance.now() / 1000;
    for (const position of positions) {
      const { x, y } = toFieldSpace(position.clientX, position.clientY, rect);
      trail.add(x, y, now);
    }
  };
  const addTrailPoint = (position: Position) => addTrailPoints([position]);
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

  sizeGlowTexture(gl, renderer.glow.texture, canvas.width, canvas.height);
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
    if (renderer) deleteRenderer(gl, renderer);
  };
}

type Renderer = {
  field: {
    program: WebGLProgram;
    vertexArray: WebGLVertexArrayObject;
    uResolution: WebGLUniformLocation | null;
    uTime: WebGLUniformLocation | null;
    uPointer: WebGLUniformLocation | null;
    uTrailGlow: WebGLUniformLocation | null;
    palette: Record<PaletteUniform, WebGLUniformLocation | null>;
  };
  glow: {
    program: WebGLProgram;
    vertexArray: WebGLVertexArrayObject;
    buffer: WebGLBuffer;
    texture: WebGLTexture;
    framebuffer: WebGLFramebuffer;
    uResolution: WebGLUniformLocation | null;
  };
};

function createRenderer(gl: WebGL2RenderingContext): Renderer | null {
  const fieldProgram = link(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  const glowProgram = link(gl, TRAIL_VERTEX_SHADER, TRAIL_FRAGMENT_SHADER);
  if (!fieldProgram || !glowProgram) return null;

  // The field's vertex shader needs no attributes, but drawing requires a
  // VAO bound.
  const fieldVertexArray = gl.createVertexArray();

  // Trail quads: interleaved floats, layout as in buildTrailMesh.
  const glowVertexArray = gl.createVertexArray();
  const buffer = gl.createBuffer();
  gl.bindVertexArray(glowVertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const stride = TRAIL_VERTEX_FLOATS * 4;
  const attributes: [string, number, number][] = [
    ["aPosition", 2, 0],
    ["aLocal", 2, 2],
    ["aLength", 1, 4],
    ["aLife", 2, 5],
  ];
  for (const [name, size, offset] of attributes) {
    const location = gl.getAttribLocation(glowProgram, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * 4);
  }
  gl.bindVertexArray(null);

  // The glow lives in a texture the size of the canvas (sized on resize).
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  sizeGlowTexture(gl, texture, 1, 1);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return {
    field: {
      program: fieldProgram,
      vertexArray: fieldVertexArray,
      uResolution: gl.getUniformLocation(fieldProgram, "uResolution"),
      uTime: gl.getUniformLocation(fieldProgram, "uTime"),
      uPointer: gl.getUniformLocation(fieldProgram, "uPointer"),
      uTrailGlow: gl.getUniformLocation(fieldProgram, "uTrailGlow"),
      palette: {
        uBackground: gl.getUniformLocation(fieldProgram, "uBackground"),
        uAccent: gl.getUniformLocation(fieldProgram, "uAccent"),
        uAccentSoft: gl.getUniformLocation(fieldProgram, "uAccentSoft"),
        uSignal: gl.getUniformLocation(fieldProgram, "uSignal"),
      },
    },
    glow: {
      program: glowProgram,
      vertexArray: glowVertexArray,
      buffer,
      texture,
      framebuffer,
      uResolution: gl.getUniformLocation(glowProgram, "uResolution"),
    },
  };
}

function sizeGlowTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  width: number,
  height: number,
) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
}

function deleteRenderer(gl: WebGL2RenderingContext, renderer: Renderer) {
  const { field, glow } = renderer;
  gl.deleteProgram(field.program);
  gl.deleteVertexArray(field.vertexArray);
  gl.deleteProgram(glow.program);
  gl.deleteVertexArray(glow.vertexArray);
  gl.deleteBuffer(glow.buffer);
  gl.deleteTexture(glow.texture);
  gl.deleteFramebuffer(glow.framebuffer);
}

function link(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  // Shaders are owned by the program once linked.
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Hero field: link failed", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
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
