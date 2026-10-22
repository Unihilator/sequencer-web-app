import { describe, expect, it } from "vitest";
import { FLUID_SETTINGS, fluidSize, splatForce } from "./fluid";

describe("fluidSize", () => {
  it("keeps 160 rows and matches the canvas aspect", () => {
    expect(fluidSize(2)).toEqual({ width: 320, height: 160 });
    expect(fluidSize(0.5)).toEqual({ width: 80, height: 160 });
    expect(fluidSize(0)).toEqual({ width: 1, height: 160 });
  });
});

describe("splatForce", () => {
  const grid = { width: 320, height: 160 };
  it("pushes in the pointer direction, with y pointing up", () => {
    const [x, y] = splatForce(
      { ax: 0.2, ay: 0.5, bx: 0.3, by: 0.4, seconds: 0.1 },
      grid,
    );
    expect(x).toBeCloseTo(320 * 0.95 * 0.6);
    expect(y).toBeCloseTo(-160 * 0.95 * 0.6);
  });

  it("adds no force for a stationary pointer", () => {
    expect(
      splatForce({ ax: 0.5, ay: 0.5, bx: 0.5, by: 0.5, seconds: 0 }, grid),
    ).toEqual([0, 0]);
  });

  it("keeps total force independent of the number of events at 60–240 Hz", () => {
    const whole = splatForce(
      { ax: 0.4, ay: 0.4, bx: 0.41, by: 0.42, seconds: 1 / 60 },
      grid,
    );
    const quarter = splatForce(
      { ax: 0.4, ay: 0.4, bx: 0.4025, by: 0.405, seconds: 1 / 240 },
      grid,
    );
    expect(quarter[0] * 4).toBeCloseTo(whole[0]);
    expect(quarter[1] * 4).toBeCloseTo(whole[1]);
  });

  it("caps fast gestures without changing their direction", () => {
    const [x, y] = splatForce(
      { ax: 0, ay: 0, bx: 1, by: 1, seconds: 1 / 60 },
      grid,
    );
    expect(Math.hypot(x, y)).toBeCloseTo(FLUID_SETTINGS.maxSpeed * 0.95 * 0.6);
    expect(x / y).toBeCloseTo(2);
  });

  it("avoids infinite force for equal event timestamps", () => {
    const force = splatForce({ ax: 0, ay: 0, bx: 1, by: 1, seconds: 0 }, grid);
    expect(force.every(Number.isFinite)).toBe(true);
  });
});
