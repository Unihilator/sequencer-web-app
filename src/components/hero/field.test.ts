// @vitest-environment node
import { describe, expect, test } from "vitest";
import { renderSize } from "./field";

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
