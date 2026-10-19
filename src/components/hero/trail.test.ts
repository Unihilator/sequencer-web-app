// @vitest-environment node
import { describe, expect, test } from "vitest";
import { Trail, toFieldSpace } from "./trail";

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
    expect(trail.pack(0.6, target)).toBe(3); // start, middle, head
    // First point: start of the stroke, 40% of its life left.
    [0, 0, 0.4, 0].forEach((value, i) => expect(target[i]).toBeCloseTo(value));
    // Last point: the head, connected, 90% left.
    [0.2, 0.1, 0.9, 1].forEach((value, i) =>
      expect(target[8 + i]).toBeCloseTo(value),
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

  test("smooths a coarse circle into an even, round curve", () => {
    const trail = makeTrail(64);
    for (let i = 0; i <= 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      trail.add(0.3 * Math.cos(angle), 0.3 * Math.sin(angle), i * 0.01);
    }
    const target = new Float32Array(64 * 4);
    const count = trail.pack(0.12, target);
    expect(count).toBeGreaterThan(48);
    expect(count).toBeLessThanOrEqual(64);
    const steps: number[] = [];
    for (let i = 0; i < count; i++) {
      const x = target[i * 4];
      const y = target[i * 4 + 1];
      // Stays close to the circle between the raw points...
      expect(Math.abs(Math.hypot(x, y) - 0.3)).toBeLessThan(0.01);
      if (i > 0) {
        steps.push(Math.hypot(x - target[i * 4 - 4], y - target[i * 4 - 3]));
      }
    }
    // ...with far shorter steps than the 0.157 between the raw points.
    expect(Math.max(...steps)).toBeLessThan(0.04);
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
