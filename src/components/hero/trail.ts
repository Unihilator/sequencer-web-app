// Pointer trail: a short history of recent pointer positions that fade out.
// Pure data (no DOM, no WebGL) so it can be unit tested and later fed to the
// shape recognizer.

export type TrailPoint = {
  x: number;
  y: number;
  /** Seconds, same clock as the `now` passed to the other calls. */
  time: number;
  /** False for the first point of a stroke: no segment leads into it. */
  connected: boolean;
};

export type TrailOptions = {
  /** How long a point stays visible while the pointer keeps moving, in s. */
  lifetime: number;
  /** After the pointer rests this long, the whole trail starts to fade. */
  idleDelay: number;
  /** Seconds the whole trail takes to fade out once idle. */
  idleFade: number;
  /** Oldest raw points are dropped beyond this. */
  maxPoints: number;
  /** Moves shorter than this update the last point instead of adding one. */
  minDistance: number;
};

export type CurvePoint = { x: number; y: number; life: number };
/** A curve point; `connected` is false where a new stroke starts. */
export type FittedPoint = CurvePoint & { connected: boolean };

// The spline puts a point about every SUBDIVISION_LENGTH (units of canvas
// height, ~2px on a laptop screen) along each raw segment.
const SUBDIVISION_LENGTH = 0.003;
const MAX_SUBDIVISIONS = 32;
// Largest gap allowed between the curve and its straight-segment
// approximation before the trail runs out of points (~half a pixel).
const FIT_TOLERANCE = 0.0006;

export class Trail {
  private points: TrailPoint[] = [];
  private strokeOpen = false;
  private lastMove = -Infinity;

  constructor(private readonly options: TrailOptions) {}

  /** Adds a position; the first one after `lift()` starts a new stroke. */
  add(x: number, y: number, now: number): void {
    this.lastMove = now;
    const last = this.points.at(-1);
    if (
      this.strokeOpen &&
      last &&
      Math.hypot(x - last.x, y - last.y) < this.options.minDistance
    ) {
      // Keep the head of the trail exactly under the pointer.
      last.x = x;
      last.y = y;
      last.time = now;
      return;
    }
    this.points.push({ x, y, time: now, connected: this.strokeOpen });
    this.strokeOpen = true;
    if (this.points.length > this.options.maxPoints) {
      this.points.splice(0, this.points.length - this.options.maxPoints);
      this.points[0].connected = false;
    }
  }

  /** Ends the current stroke (pointer left, finger lifted). */
  lift(): void {
    this.strokeOpen = false;
  }

  clear(): void {
    this.points = [];
    this.strokeOpen = false;
  }

  /** Drops expired points and returns the rest, oldest first. */
  live(now: number): readonly TrailPoint[] {
    if (this.idleLife(now) <= 0) {
      this.clear();
      return this.points;
    }
    const firstAlive = this.points.findIndex(
      (point) => now - point.time < this.options.lifetime,
    );
    if (firstAlive === -1) {
      this.points = [];
    } else if (firstAlive > 0) {
      this.points.splice(0, firstAlive);
      this.points[0].connected = false;
    }
    return this.points;
  }

  /**
   * The trail as a smooth curve, ready to draw: the raw points are smoothed
   * with a spline, then thinned where the line is straight, to at most
   * `capacity` points. Life runs from 1 (fresh) to 0 (gone).
   */
  curve(now: number, capacity: number): FittedPoint[] {
    const idle = this.idleLife(now);
    const curves = this.strokes(now).map((stroke) =>
      smoothStroke(
        stroke.map((point) => ({
          x: point.x,
          y: point.y,
          life:
            idle * Math.max(0, 1 - (now - point.time) / this.options.lifetime),
        })),
      ),
    );
    return fitToCapacity(curves, capacity);
  }

  /** 1 while the pointer moves, then down to 0 over `idleFade`. */
  private idleLife(now: number): number {
    const { idleDelay, idleFade } = this.options;
    const idle = now - this.lastMove - idleDelay;
    return Math.min(1, Math.max(0, 1 - idle / idleFade));
  }

  private strokes(now: number): TrailPoint[][] {
    const strokes: TrailPoint[][] = [];
    for (const point of this.live(now)) {
      if (!point.connected || strokes.length === 0) strokes.push([]);
      strokes[strokes.length - 1].push(point);
    }
    return strokes;
  }
}

/**
 * Centripetal Catmull-Rom spline through the points (passes through every
 * one). Unlike the uniform variant it never overshoots or loops when the
 * points are unevenly spaced, as pointer events often are.
 */
export function smoothStroke(points: CurvePoint[]): CurvePoint[] {
  if (points.length < 3) return points;
  const curve: CurvePoint[] = [];
  const last = points.length - 1;
  for (let i = 0; i < last; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    // Mirror the neighbours at the ends so the curve leaves straight.
    const p0 = i > 0 ? points[i - 1] : mirror(p2, p1);
    const p3 = i + 2 <= last ? points[i + 2] : mirror(p1, p2);
    const steps = Math.min(
      MAX_SUBDIVISIONS,
      Math.max(1, Math.ceil(distance(p1, p2) / SUBDIVISION_LENGTH)),
    );
    for (let step = 0; step < steps; step++) {
      curve.push(centripetal(p0, p1, p2, p3, step / steps));
    }
  }
  curve.push(points[last]);
  return curve;
}

function mirror(from: CurvePoint, around: CurvePoint): CurvePoint {
  return {
    x: 2 * around.x - from.x,
    y: 2 * around.y - from.y,
    life: around.life,
  };
}

// Barry-Goldman evaluation of the segment p1 → p2 at u in 0..1.
function centripetal(
  p0: CurvePoint,
  p1: CurvePoint,
  p2: CurvePoint,
  p3: CurvePoint,
  u: number,
): CurvePoint {
  // Knot spacing = sqrt(distance); the epsilon guards repeated points.
  const t1 = Math.sqrt(distance(p0, p1)) + 1e-6;
  const t2 = t1 + Math.sqrt(distance(p1, p2)) + 1e-6;
  const t3 = t2 + Math.sqrt(distance(p2, p3)) + 1e-6;
  const t = t1 + (t2 - t1) * u;
  const lerp = (a: number, b: number, from: number, to: number) =>
    (a * (to - t) + b * (t - from)) / (to - from);
  const axis = (k: "x" | "y") => {
    const a1 = lerp(p0[k], p1[k], 0, t1);
    const a2 = lerp(p1[k], p2[k], t1, t2);
    const a3 = lerp(p2[k], p3[k], t2, t3);
    const b1 = lerp(a1, a2, 0, t2);
    const b2 = lerp(a2, a3, t1, t3);
    return lerp(b1, b2, t1, t2);
  };
  return {
    x: axis("x"),
    y: axis("y"),
    life: p1.life + (p2.life - p1.life) * u,
  };
}

/**
 * Thins the curves to at most `capacity` points in total, keeping points
 * where the line bends and dropping them on straight runs
 * (Ramer-Douglas-Peucker with a tolerance that grows until it fits).
 * The first point of each curve is marked as not connected.
 */
export function fitToCapacity(
  curves: CurvePoint[][],
  capacity: number,
): FittedPoint[] {
  let tolerance = FIT_TOLERANCE;
  let fitted = curves.map((curve) => simplify(curve, tolerance));
  const count = () => fitted.reduce((sum, curve) => sum + curve.length, 0);
  while (count() > capacity && tolerance < 1) {
    tolerance *= 1.5;
    fitted = curves.map((curve) => simplify(curve, tolerance));
  }
  const result = fitted.flatMap((curve) =>
    curve.map((point, i) => ({ ...point, connected: i > 0 })),
  );
  // Many tiny strokes can still overflow: drop the oldest.
  if (result.length > capacity) {
    result.splice(0, result.length - capacity);
    result[0].connected = false;
  }
  return result;
}

function simplify(points: CurvePoint[], tolerance: number): CurvePoint[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let farthestDistance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i], points[first], points[last]);
      if (d > farthestDistance) {
        farthest = i;
        farthestDistance = d;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function distance(a: CurvePoint, b: CurvePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function distanceToSegment(p: CurvePoint, a: CurvePoint, b: CurvePoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared),
        );
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

// Floats per vertex in the mesh: position (2), position inside the segment's
// capsule (along, across), segment length, life at its start and end.
export const TRAIL_VERTEX_FLOATS = 7;
// How far the glow reaches from the line; each segment's quad is this much
// larger than the segment on every side (see the trail shader).
export const TRAIL_REACH = 0.08;

/**
 * Triangles for the trail: one quad around every segment, two triangles
 * each. The fragment shader turns the local coordinates into the distance
 * to the segment, so every quad draws a soft capsule; overlapping capsules
 * merge at the joints (blended with MAX).
 * Returns the vertex count; `out` must hold TRAIL_VERTEX_FLOATS * 6 per
 * segment.
 */
export function buildTrailMesh(
  points: readonly FittedPoint[],
  out: Float32Array,
): number {
  let vertices = 0;
  const capacity = Math.floor(out.length / (TRAIL_VERTEX_FLOATS * 6));
  for (let i = 1; i < points.length && vertices / 6 < capacity; i++) {
    const b = points[i];
    if (!b.connected) continue;
    const a = points[i - 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    // Direction along the segment and its normal (any for a zero length).
    const dx = length > 0 ? (b.x - a.x) / length : 1;
    const dy = length > 0 ? (b.y - a.y) / length : 0;
    const corner = (along: number, across: number) => {
      out.set(
        [
          a.x + dx * along - dy * across,
          a.y + dy * along + dx * across,
          along,
          across,
          length,
          a.life,
          b.life,
        ],
        vertices * TRAIL_VERTEX_FLOATS,
      );
      vertices++;
    };
    const r = TRAIL_REACH;
    corner(-r, -r);
    corner(length + r, -r);
    corner(length + r, r);
    corner(-r, -r);
    corner(length + r, r);
    corner(-r, r);
  }
  return vertices;
}

/**
 * Converts a client (CSS pixel) position into the shader's coordinate space:
 * origin at the canvas centre, y up, units of canvas height.
 */
export function toFieldSpace(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  const height = rect.height || 1;
  return {
    x: (clientX - rect.left - rect.width / 2) / height,
    y: (rect.top + rect.height / 2 - clientY) / height,
  };
}
