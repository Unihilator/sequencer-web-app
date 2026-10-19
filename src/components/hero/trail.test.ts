// @vitest-environment node
import { describe, expect, test } from "vitest";
import { Trail, toFieldSpace } from "./trail";

const makeTrail = () =>
  new Trail({ lifetime: 1, maxPoints: 4, minDistance: 0.01 });

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
    const points = trail.live(1.2);
    expect(points).toHaveLength(1);
    // The survivor no longer has a segment leading into it.
    expect(points[0].connected).toBe(false);
    expect(trail.live(2)).toHaveLength(0);
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
    expect(trail.pack(0.75, target)).toBe(2);
    const expected = [0, 0, 0.25, 0, 0.2, 0.1, 0.75, 1];
    expected.forEach((value, i) => expect(target[i]).toBeCloseTo(value));
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
