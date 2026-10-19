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

type CurvePoint = { x: number; y: number; life: number };

// Each raw segment is split into this many pieces by the spline.
const SUBDIVISIONS = 6;

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
   * Packs the trail as vec4s for the shader: x, y, life (1 = fresh,
   * 0 = gone) and 1/0 for "connected to the previous point". The raw points
   * are smoothed into a curve and spread evenly along it so the shader's
   * straight segments read as one continuous line.
   * Returns the number of points written.
   */
  pack(now: number, target: Float32Array): number {
    const capacity = Math.floor(target.length / 4);
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
    const packed = resample(curves, capacity);
    packed.forEach((point, i) =>
      target.set(
        [point.x, point.y, point.life, point.connected ? 1 : 0],
        i * 4,
      ),
    );
    return packed.length;
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

/** Catmull-Rom spline through the points (passes through every one). */
export function smoothStroke(points: CurvePoint[]): CurvePoint[] {
  if (points.length < 3) return points;
  const curve: CurvePoint[] = [];
  const last = points.length - 1;
  for (let i = 0; i < last; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, last)];
    for (let step = 0; step < SUBDIVISIONS; step++) {
      const t = step / SUBDIVISIONS;
      curve.push({
        x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
        y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
        life: p1.life + (p2.life - p1.life) * t,
      });
    }
  }
  curve.push(points[last]);
  return curve;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (p2 - p0) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (3 * p1 - p0 - 3 * p2 + p3) * t3)
  );
}

/**
 * Re-spaces the curves evenly along their length so that together they fit
 * in `capacity` points. Each curve keeps its endpoints; the first point of a
 * curve is marked as not connected.
 */
export function resample(
  curves: CurvePoint[][],
  capacity: number,
): (CurvePoint & { connected: boolean })[] {
  const lengths = curves.map(polylineLength);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const spacing = total / Math.max(1, capacity - 2 * curves.length);
  const result: (CurvePoint & { connected: boolean })[] = [];

  for (const curve of curves) {
    if (curve.length === 0) continue;
    result.push({ ...curve[0], connected: false });
    let carried = 0; // distance walked since the last emitted point
    for (let i = 1; i < curve.length; i++) {
      const a = curve[i - 1];
      const b = curve[i];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      let offset = spacing - carried;
      while (spacing > 0 && offset < length) {
        const t = offset / length;
        result.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          life: a.life + (b.life - a.life) * t,
          connected: true,
        });
        offset += spacing;
      }
      carried = length - (offset - spacing);
    }
    if (curve.length > 1) {
      result.push({ ...curve[curve.length - 1], connected: true });
    }
  }

  // Rounding can overshoot by a point or two: drop the oldest.
  if (result.length > capacity) {
    result.splice(0, result.length - capacity);
    result[0].connected = false;
  }
  return result;
}

function polylineLength(points: CurvePoint[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
  }
  return length;
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
