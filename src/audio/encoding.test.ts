// @vitest-environment node
import { describe, expect, test } from "vitest";
import { decodePattern, encodePattern } from "./encoding";
import {
  applyCommand,
  createEmptyPattern,
  type Pattern,
  type PatternCommand,
} from "./pattern";

function build(commands: PatternCommand[], start = createEmptyPattern()) {
  return commands.reduce(applyCommand, start);
}

// A two-bar DnB-ish pattern touching every encoded field.
const busyPattern: Pattern = build(
  [
    { type: "setBpm", bpm: 174 },
    { type: "setSwing", swing: 0.25 },
    { type: "toggleStep", track: "kick", step: 0 },
    { type: "toggleStep", track: "kick", step: 10 },
    { type: "toggleStep", track: "snare", step: 4 },
    { type: "toggleStep", track: "snare", step: 12 },
    { type: "toggleStep", track: "fx2", step: 31 },
    { type: "setNote", track: "bass", step: 0, note: 0 },
    { type: "setNote", track: "bass", step: 31, note: 9 },
    { type: "setNote", track: "synth", step: 7, note: 4 },
    { type: "setSend", track: "snare", send: "reverb", value: 0.4 },
    { type: "setSend", track: "synth", send: "delay", value: 1 },
    { type: "toggleMute", track: "ride" },
  ],
  createEmptyPattern(32),
);

describe("encodePattern / decodePattern", () => {
  test("round-trips an empty 16-step pattern", () => {
    const pattern = createEmptyPattern();
    expect(decodePattern(encodePattern(pattern))).toEqual(pattern);
  });

  test("round-trips a busy 32-step pattern", () => {
    expect(decodePattern(encodePattern(busyPattern))).toEqual(busyPattern);
  });

  test("produces a URL-safe, reasonably short string", () => {
    const encoded = encodePattern(busyPattern);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded.length).toBeLessThan(160);
  });

  test("quantizes swing and sends to whole percents", () => {
    const pattern = build([{ type: "setSwing", swing: 0.333 }]);
    expect(decodePattern(encodePattern(pattern))?.swing).toBe(0.33);
  });

  test.each([
    ["empty string", ""],
    ["not base64url", "abc$%^"],
    ["truncated data", encodePattern(busyPattern).slice(0, 20)],
    ["extra data", encodePattern(busyPattern) + "AAAA"],
  ])("rejects %s", (_, input) => {
    expect(decodePattern(input)).toBeNull();
  });

  test("rejects unknown versions and out-of-range header values", () => {
    const bytes = Uint8Array.from(
      atob(
        encodePattern(createEmptyPattern())
          .replace(/-/g, "+")
          .replace(/_/g, "/"),
      ),
      (c) => c.charCodeAt(0),
    );
    const tamper = (index: number, value: number) => {
      const copy = bytes.slice();
      copy[index] = value;
      const binary = String.fromCharCode(...copy);
      return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    };
    expect(decodePattern(tamper(0, 2))).toBeNull(); // version
    expect(decodePattern(tamper(1, 250))).toBeNull(); // bpm
    expect(decodePattern(tamper(2, 101))).toBeNull(); // swing
    expect(decodePattern(tamper(3, 24))).toBeNull(); // length
  });
});
