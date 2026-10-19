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
  /** How long a point stays visible, in seconds. */
  lifetime: number;
  /** Oldest points are dropped beyond this (the shader has a fixed array). */
  maxPoints: number;
  /** Moves shorter than this update the last point instead of adding one. */
  minDistance: number;
};

export class Trail {
  private points: TrailPoint[] = [];
  private strokeOpen = false;

  constructor(private readonly options: TrailOptions) {}

  /** Adds a position; the first one after `lift()` starts a new stroke. */
  add(x: number, y: number, now: number): void {
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
   * Packs the live points as vec4s for the shader: x, y, life (1 = fresh,
   * 0 = gone) and 1/0 for "connected to the previous point".
   * Returns the number of points written.
   */
  pack(now: number, target: Float32Array): number {
    const points = this.live(now);
    const count = Math.min(points.length, target.length / 4);
    for (let i = 0; i < count; i++) {
      const point = points[i];
      const life = 1 - (now - point.time) / this.options.lifetime;
      target.set(
        [point.x, point.y, Math.max(0, life), point.connected ? 1 : 0],
        i * 4,
      );
    }
    return count;
  }
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
