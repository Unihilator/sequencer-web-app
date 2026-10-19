// @vitest-environment node
import { describe, expect, test } from "vitest";
import { parseHexColor, renderSize, trailBounds } from "./field";

describe("renderSize", () => {
  test("renders at half resolution on a standard screen", () => {
    expect(renderSize(1280, 800, 1)).toEqual({ width: 640, height: 400 });
  });

  test("caps the device pixel ratio at 1.5", () => {
    expect(renderSize(390, 844, 3)).toEqual(renderSize(390, 844, 1.5));
    expect(renderSize(390, 844, 3)).toEqual({ width: 293, height: 633 });
  });

  test("never returns an empty buffer", () => {
    expect(renderSize(0, 0, 2)).toEqual({ width: 1, height: 1 });
  });
});

describe("parseHexColor", () => {
  test("converts #rrggbb to 0..1 channels", () => {
    expect(parseHexColor("#ff0080")).toEqual([1, 0, 128 / 255]);
    expect(parseHexColor(" #3E7198 ")).toEqual([
      62 / 255,
      113 / 255,
      152 / 255,
    ]);
  });

  test("rejects other formats", () => {
    expect(parseHexColor("")).toBeNull();
    expect(parseHexColor("#fff")).toBeNull();
    expect(parseHexColor("rgb(0, 0, 0)")).toBeNull();
  });
});

describe("trailBounds", () => {
  test("wraps the points plus the reach of the glow", () => {
    const data = new Float32Array([0, 0, 1, 0, 0.5, -0.2, 1, 1, 9, 9, 9, 9]);
    const [minX, minY, maxX, maxY] = trailBounds(data, 2);
    expect(minX).toBeCloseTo(-0.15);
    expect(minY).toBeCloseTo(-0.35);
    expect(maxX).toBeCloseTo(0.65);
    expect(maxY).toBeCloseTo(0.15);
  });

  test("is an empty box without points", () => {
    const [minX, , maxX] = trailBounds(new Float32Array(8), 0);
    expect(minX).toBeGreaterThan(maxX);
  });
});
