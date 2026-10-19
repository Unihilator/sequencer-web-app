// @vitest-environment node
import { describe, expect, test } from "vitest";
import { fitToCapacity, smoothStroke, Trail, toFieldSpace } from "./trail";

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

  test("packs x, y, remaining life and the connected flag", () => {
    const trail = makeTrail();
    trail.add(0, 0, 0);
    trail.add(0.2, 0.1, 0.5);
    const target = new Float32Array(4 * 4);
    expect(trail.pack(0.6, target)).toBe(2); // a straight line needs no more
    // First point: start of the stroke, 40% of its life left.
    [0, 0, 0.4, 0].forEach((value, i) => expect(target[i]).toBeCloseTo(value));
    // Last point: the head, connected, 90% left.
    [0.2, 0.1, 0.9, 1].forEach((value, i) =>
      expect(target[4 + i]).toBeCloseTo(value),
    );
  });

  test("fades the whole trail once the pointer rests", () => {
    const trail = makeTrail();
    trail.add(0, 0, 0);
    trail.add(0.2, 0, 0.1);
    const target = new Float32Array(8 * 4);
    // Resting past idleDelay (0.2) for half of idleFade (0.5).
    trail.pack(0.55, target);
    expect(target[2]).toBeCloseTo((1 - 0.55) * 0.5);
    expect(trail.pack(0.8, target)).toBe(0);
  });

  test("smooths a coarse circle into a round curve", () => {
    const trail = makeTrail(64);
    for (let i = 0; i <= 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      trail.add(0.3 * Math.cos(angle), 0.3 * Math.sin(angle), i * 0.01);
    }
    const target = new Float32Array(64 * 4);
    const count = trail.pack(0.12, target);
    expect(count).toBeLessThanOrEqual(64);
    const at = (i: number) => ({ x: target[i * 4], y: target[i * 4 + 1] });
    for (let i = 1; i < count; i++) {
      // The shader draws straight segments; even their midpoints must sit
      // on the circle (the raw 12-gon is 0.01 off in the middle of a side).
      const a = at(i - 1);
      const b = at(i);
      // The open ends leave straight by design; check the closed middle.
      const angle = Math.atan2(a.y, a.x);
      if (Math.abs(angle) < Math.PI / 6) continue;
      const middle = Math.hypot((a.x + b.x) / 2, (a.y + b.y) / 2);
      expect(Math.abs(middle - 0.3)).toBeLessThan(0.002);
    }
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

describe("toFieldSpace", () => {
  const rect = { left: 0, top: 100, width: 800, height: 400 };

  test("maps the canvas centre to the origin", () => {
    expect(toFieldSpace(400, 300, rect)).toEqual({ x: 0, y: 0 });
  });

  test("uses canvas height as the unit, with y pointing up", () => {
    expect(toFieldSpace(800, 100, rect)).toEqual({ x: 1, y: 0.5 });
  });
});
