// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  buildTrailMesh,
  fitToCapacity,
  type FittedPoint,
  smoothStroke,
  Trail,
  TRAIL_REACH,
  TRAIL_VERTEX_FLOATS,
  toFieldSpace,
} from "./trail";

const makeTrail = (maxPoints = 4) =>
  new Trail({
    lifetime: 1,
    idleDelay: 0.2,
    idleFade: 0.5,
    maxPoints,
    minDistance: 0.01,
  });

describe("Trail", () => {
  test("connects points within a stroke", () => {
    const trail = makeTrail();
    trail.add(0, 0, 0);
    trail.add(0.1, 0, 0.1);
    expect(trail.live(0.1).map((point) => point.connected)).toEqual([
      false,
      true,
    ]);
  });

  test("starts a new stroke after lift", () => {
    const trail = makeTrail();
    trail.add(0, 0, 0);
    trail.lift();
    trail.add(0.5, 0, 0.1);
    expect(trail.live(0.1).map((point) => point.connected)).toEqual([
      false,
      false,
    ]);
  });

  test("moves the head instead of adding tiny steps", () => {
    const trail = makeTrail();
    trail.add(0, 0, 0);
    trail.add(0.1, 0, 0.1);
    trail.add(0.105, 0, 0.2);
    const points = trail.live(0.2);
    expect(points).toHaveLength(2);
    expect(points[1]).toMatchObject({ x: 0.105, time: 0.2 });
  });

  test("forgets points older than the lifetime", () => {
    const trail = makeTrail();
    trail.add(0, 0, 0);
    trail.add(0.1, 0, 0.5);
    trail.add(0.2, 0, 1.1);
    const points = trail.live(1.2);
    expect(points.map((point) => point.x)).toEqual([0.1, 0.2]);
    // The new oldest point no longer has a segment leading into it.
    expect(points[0].connected).toBe(false);
  });

  test("keeps at most maxPoints, dropping the oldest", () => {
    const trail = makeTrail();
    for (let i = 0; i < 6; i++) trail.add(i, 0, i * 0.01);
    const points = trail.live(0.05);
    expect(points.map((point) => point.x)).toEqual([2, 3, 4, 5]);
    expect(points[0].connected).toBe(false);
  });

  test("returns a curve with remaining life and stroke starts", () => {
    const trail = makeTrail();
    trail.add(0, 0, 0);
    trail.add(0.2, 0.1, 0.5);
    const curve = trail.curve(0.6, 64);
    expect(curve).toHaveLength(2); // a straight line needs no more
    // Start of the stroke with 40% of its life left; the head with 90%.
    expect(curve[0]).toMatchObject({ x: 0, y: 0, connected: false });
    expect(curve[0].life).toBeCloseTo(0.4);
    expect(curve[1]).toMatchObject({ x: 0.2, y: 0.1, connected: true });
    expect(curve[1].life).toBeCloseTo(0.9);
  });

  test("fades the whole trail once the pointer rests", () => {
    const trail = makeTrail();
    trail.add(0, 0, 0);
    trail.add(0.2, 0, 0.1);
    // Resting past idleDelay (0.2) for half of idleFade (0.5).
    expect(trail.curve(0.55, 64)[0].life).toBeCloseTo((1 - 0.55) * 0.5);
    expect(trail.curve(0.8, 64)).toHaveLength(0);
  });

  // Straight segments between the curve points are what gets drawn; even
  // their midpoints must sit on the circle that was drawn.
  const midpointError = (curve: FittedPoint[], radius: number) => {
    let worst = 0;
    for (let i = 1; i < curve.length; i++) {
      const a = curve[i - 1];
      const b = curve[i];
      // The open ends leave straight by design; check the closed middle.
      if (Math.abs(Math.atan2(a.y, a.x)) < Math.PI / 6) continue;
      const middle = Math.hypot((a.x + b.x) / 2, (a.y + b.y) / 2);
      worst = Math.max(worst, Math.abs(middle - radius));
    }
    return worst;
  };

  test("smooths a coarse circle into a round curve", () => {
    const trail = makeTrail(64);
    for (let i = 0; i <= 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      trail.add(0.3 * Math.cos(angle), 0.3 * Math.sin(angle), i * 0.01);
    }
    const curve = trail.curve(0.12, 64);
    expect(curve.length).toBeLessThanOrEqual(64);
    // The raw 12-gon is 0.01 off in the middle of a side.
    expect(midpointError(curve, 0.3)).toBeLessThan(0.002);
  });

  test("keeps many loops round", () => {
    // Six circles in a row, the case that used to turn into polygons.
    const trail = new Trail({
      lifetime: 10,
      idleDelay: 1,
      idleFade: 1,
      maxPoints: 1024,
      minDistance: 0.006,
    });
    for (let i = 0; i <= 6 * 40; i++) {
      const angle = (i / 40) * Math.PI * 2;
      trail.add(0.25 * Math.cos(angle), 0.25 * Math.sin(angle), i * 0.01);
    }
    const curve = trail.curve(2.4, 1024);
    expect(curve.length).toBeLessThanOrEqual(1024);
    expect(midpointError(curve, 0.25)).toBeLessThan(0.002);
  });

  test("handles unevenly spaced points without loops", () => {
    // A long jump followed by tiny steps: a uniform spline overshoots here.
    const curve = smoothStroke([
      { x: 0, y: 0, life: 1 },
      { x: 0.5, y: 0, life: 1 },
      { x: 0.51, y: 0.01, life: 1 },
      { x: 0.52, y: 0.02, life: 1 },
    ]);
    for (const point of curve) {
      expect(point.x).toBeGreaterThanOrEqual(-1e-9);
      expect(point.x).toBeLessThanOrEqual(0.52 + 1e-9);
    }
  });
});

describe("fitToCapacity", () => {
  const line = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ x: i / n, y: 0, life: 1 }));

  test("collapses straight runs to their endpoints", () => {
    expect(fitToCapacity([line(50)], 64)).toHaveLength(2);
  });

  test("never exceeds the capacity and keeps the newest points", () => {
    const wiggle = Array.from({ length: 500 }, (_, i) => ({
      x: i * 0.01,
      y: i % 2 ? 0.05 : -0.05,
      life: 1,
    }));
    const fitted = fitToCapacity([wiggle], 64);
    expect(fitted.length).toBeLessThanOrEqual(64);
    expect(fitted.at(-1)).toMatchObject({ x: 4.99 });
    expect(fitted[0].connected).toBe(false);
  });

  test("marks where each stroke starts", () => {
    const fitted = fitToCapacity([line(3), line(3)], 64);
    expect(fitted.map((point) => point.connected)).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });
});

describe("buildTrailMesh", () => {
  const point = (x: number, connected: boolean): FittedPoint => ({
    x,
    y: 0,
    life: 1,
    connected,
  });

  test("draws one quad (six vertices) per connected segment", () => {
    const out = new Float32Array(16 * 6 * TRAIL_VERTEX_FLOATS);
    // Two strokes: 0 → 0.1 → 0.2, then 0.5 → 0.6.
    const points = [
      point(0, false),
      point(0.1, true),
      point(0.2, true),
      point(0.5, false),
      point(0.6, true),
    ];
    expect(buildTrailMesh(points, out)).toBe(3 * 6);
  });

  test("covers the segment plus the glow reach around it", () => {
    const out = new Float32Array(6 * TRAIL_VERTEX_FLOATS);
    buildTrailMesh([point(0, false), point(0.1, true)], out);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let v = 0; v < 6; v++) {
      xs.push(out[v * TRAIL_VERTEX_FLOATS]);
      ys.push(out[v * TRAIL_VERTEX_FLOATS + 1]);
      // Segment length travels with every vertex for the fragment shader.
      expect(out[v * TRAIL_VERTEX_FLOATS + 4]).toBeCloseTo(0.1);
    }
    expect(Math.min(...xs)).toBeCloseTo(-TRAIL_REACH);
    expect(Math.max(...xs)).toBeCloseTo(0.1 + TRAIL_REACH);
    expect(Math.min(...ys)).toBeCloseTo(-TRAIL_REACH);
    expect(Math.max(...ys)).toBeCloseTo(TRAIL_REACH);
  });

  test("stops when the buffer is full", () => {
    const out = new Float32Array(6 * TRAIL_VERTEX_FLOATS);
    const points = [point(0, false), point(0.1, true), point(0.2, true)];
    expect(buildTrailMesh(points, out)).toBe(6);
  });
});

describe("toFieldSpace", () => {
  const rect = { left: 0, top: 100, width: 800, height: 400 };

  test("maps the canvas centre to the origin", () => {
    expect(toFieldSpace(400, 300, rect)).toEqual({ x: 0, y: 0 });
  });

  test("uses canvas height as the unit, with y pointing up", () => {
    expect(toFieldSpace(800, 100, rect)).toEqual({ x: 1, y: 0.5 });
  });
});
