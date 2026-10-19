// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  applyCommand,
  BPM_MAX,
  BPM_MIN,
  createEmptyPattern,
  NOTE_COUNT,
  type Pattern,
  TRACK_IDS,
  type TrackId,
} from "./pattern";

function track(pattern: Pattern, id: TrackId) {
  const found = pattern.tracks.find((t) => t.id === id);
  if (!found) throw new Error(`missing track ${id}`);
  return found;
}

describe("createEmptyPattern", () => {
  test("has every track in a fixed order with empty steps", () => {
    const pattern = createEmptyPattern();
    expect(pattern.tracks.map((t) => t.id)).toEqual(TRACK_IDS);
    expect(pattern.length).toBe(16);
    for (const t of pattern.tracks) {
      expect(t.steps).toHaveLength(16);
      expect(t.steps.every((s) => s === false || s === null)).toBe(true);
    }
    expect(track(pattern, "bass").kind).toBe("melodic");
    expect(track(pattern, "kick").kind).toBe("drum");
  });
});

describe("applyCommand", () => {
  test("toggleStep flips a drum step and does not mutate the input", () => {
    const before = createEmptyPattern();
    const after = applyCommand(before, {
      type: "toggleStep",
      track: "kick",
      step: 4,
    });
    expect(track(after, "kick").steps[4]).toBe(true);
    expect(track(before, "kick").steps[4]).toBe(false);
    const again = applyCommand(after, {
      type: "toggleStep",
      track: "kick",
      step: 4,
    });
    expect(track(again, "kick").steps[4]).toBe(false);
  });

  test("toggleStep on a melodic track sets the default note, then clears", () => {
    const on = applyCommand(createEmptyPattern(), {
      type: "toggleStep",
      track: "bass",
      step: 0,
    });
    expect(track(on, "bass").steps[0]).toBe(0);
    const off = applyCommand(on, {
      type: "toggleStep",
      track: "bass",
      step: 0,
    });
    expect(track(off, "bass").steps[0]).toBeNull();
  });

  test("ignores out-of-range and non-integer steps", () => {
    const pattern = createEmptyPattern();
    for (const step of [-1, 16, 1.5]) {
      expect(
        applyCommand(pattern, { type: "toggleStep", track: "kick", step }),
      ).toEqual(pattern);
    }
  });

  test("setNote clamps to the scale and allows clearing", () => {
    const pattern = createEmptyPattern();
    const high = applyCommand(pattern, {
      type: "setNote",
      track: "synth",
      step: 2,
      note: 99,
    });
    expect(track(high, "synth").steps[2]).toBe(NOTE_COUNT - 1);
    const cleared = applyCommand(high, {
      type: "setNote",
      track: "synth",
      step: 2,
      note: null,
    });
    expect(track(cleared, "synth").steps[2]).toBeNull();
  });

  test("setBpm rounds and clamps; setSwing clamps", () => {
    const pattern = createEmptyPattern();
    expect(applyCommand(pattern, { type: "setBpm", bpm: 174.4 }).bpm).toBe(174);
    expect(applyCommand(pattern, { type: "setBpm", bpm: 10 }).bpm).toBe(
      BPM_MIN,
    );
    expect(applyCommand(pattern, { type: "setBpm", bpm: 999 }).bpm).toBe(
      BPM_MAX,
    );
    expect(applyCommand(pattern, { type: "setSwing", swing: 2 }).swing).toBe(1);
  });

  test("setLength 16 → 32 duplicates the first bar, 32 → 16 truncates", () => {
    const withKick = applyCommand(createEmptyPattern(), {
      type: "toggleStep",
      track: "kick",
      step: 0,
    });
    const long = applyCommand(withKick, { type: "setLength", length: 32 });
    expect(long.length).toBe(32);
    expect(track(long, "kick").steps).toHaveLength(32);
    expect(track(long, "kick").steps[16]).toBe(true);

    const short = applyCommand(long, { type: "setLength", length: 16 });
    expect(track(short, "kick").steps).toHaveLength(16);
  });

  test("setSend, toggleMute and clearTrack keep other tracks intact", () => {
    let pattern = applyCommand(createEmptyPattern(), {
      type: "toggleStep",
      track: "snare",
      step: 4,
    });
    pattern = applyCommand(pattern, {
      type: "setSend",
      track: "snare",
      send: "reverb",
      value: 0.5,
    });
    pattern = applyCommand(pattern, { type: "toggleMute", track: "snare" });
    const snare = track(pattern, "snare");
    expect(snare.sends).toEqual({ reverb: 0.5, delay: 0 });
    expect(snare.muted).toBe(true);

    const cleared = applyCommand(pattern, {
      type: "clearTrack",
      track: "snare",
    });
    expect(track(cleared, "snare").steps.some(Boolean)).toBe(false);
    // Mix settings survive clearing the notes.
    expect(track(cleared, "snare").sends.reverb).toBe(0.5);
    expect(track(cleared, "snare").muted).toBe(true);
    expect(track(cleared, "kick")).toBe(track(pattern, "kick"));
  });
});
