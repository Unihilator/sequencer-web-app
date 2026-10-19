// Pattern model: plain data + pure functions. No React, no Tone.js.

export const DRUM_TRACK_IDS = [
  "kick",
  "snare",
  "clap",
  "closedHat",
  "openHat",
  "ride",
  "tom",
  "perc",
  "fx1",
  "fx2",
] as const;
export const MELODIC_TRACK_IDS = ["bass", "synth"] as const;
export const TRACK_IDS = [...DRUM_TRACK_IDS, ...MELODIC_TRACK_IDS] as const;

export type DrumTrackId = (typeof DRUM_TRACK_IDS)[number];
export type MelodicTrackId = (typeof MELODIC_TRACK_IDS)[number];
export type TrackId = (typeof TRACK_IDS)[number];

export const BPM_MIN = 60;
export const BPM_MAX = 200;
export const PATTERN_LENGTHS = [16, 32] as const;
export type PatternLength = (typeof PATTERN_LENGTHS)[number];

// Melodic steps store a scale degree (index into the instrument's scale).
export const NOTE_COUNT = 10; // two octaves of a pentatonic scale
export type Note = number; // 0 .. NOTE_COUNT - 1

export type Sends = { reverb: number; delay: number }; // each 0..1

type TrackBase = { muted: boolean; sends: Sends };
export type DrumTrack = TrackBase & {
  kind: "drum";
  id: DrumTrackId;
  steps: boolean[];
};
export type MelodicTrack = TrackBase & {
  kind: "melodic";
  id: MelodicTrackId;
  steps: (Note | null)[];
};
export type Track = DrumTrack | MelodicTrack;

export type Pattern = {
  bpm: number;
  swing: number; // 0..1
  length: PatternLength;
  tracks: Track[]; // always in TRACK_IDS order
};

// Serializable commands: the only way to change a pattern. The same objects
// will later be sent over the network in live sessions.
export type SendName = keyof Sends;
export type PatternCommand =
  | { type: "toggleStep"; track: TrackId; step: number }
  | { type: "setNote"; track: MelodicTrackId; step: number; note: Note | null }
  | { type: "setBpm"; bpm: number }
  | { type: "setSwing"; swing: number }
  | { type: "setLength"; length: PatternLength }
  | { type: "setSend"; track: TrackId; send: SendName; value: number }
  | { type: "toggleMute"; track: TrackId }
  | { type: "clearTrack"; track: TrackId }
  | { type: "loadPattern"; pattern: Pattern };

export const DEFAULT_BPM = 120;
export const DEFAULT_MELODIC_NOTE: Note = 0;

export function isMelodicTrackId(id: TrackId): id is MelodicTrackId {
  return (MELODIC_TRACK_IDS as readonly TrackId[]).includes(id);
}

export function createEmptyPattern(length: PatternLength = 16): Pattern {
  return {
    bpm: DEFAULT_BPM,
    swing: 0,
    length,
    tracks: TRACK_IDS.map((id) => createEmptyTrack(id, length)),
  };
}

function createEmptyTrack(id: TrackId, length: number): Track {
  const base = { muted: false, sends: { reverb: 0, delay: 0 } };
  return isMelodicTrackId(id)
    ? { ...base, kind: "melodic", id, steps: Array(length).fill(null) }
    : { ...base, kind: "drum", id, steps: Array(length).fill(false) };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function applyCommand(
  pattern: Pattern,
  command: PatternCommand,
): Pattern {
  switch (command.type) {
    case "toggleStep":
      return updateTrack(pattern, command.track, (track) =>
        withStep(track, command.step, (value) =>
          track.kind === "drum"
            ? !value
            : value === null
              ? DEFAULT_MELODIC_NOTE
              : null,
        ),
      );
    case "setNote": {
      const note =
        command.note === null
          ? null
          : clamp(Math.round(command.note), 0, NOTE_COUNT - 1);
      return updateTrack(pattern, command.track, (track) =>
        track.kind === "melodic"
          ? withStep(track, command.step, () => note)
          : track,
      );
    }
    case "setBpm":
      return {
        ...pattern,
        bpm: clamp(Math.round(command.bpm), BPM_MIN, BPM_MAX),
      };
    case "setSwing":
      return { ...pattern, swing: clamp(command.swing, 0, 1) };
    case "setLength":
      return setLength(pattern, command.length);
    case "setSend":
      return updateTrack(pattern, command.track, (track) => ({
        ...track,
        sends: { ...track.sends, [command.send]: clamp(command.value, 0, 1) },
      }));
    case "toggleMute":
      return updateTrack(pattern, command.track, (track) => ({
        ...track,
        muted: !track.muted,
      }));
    case "clearTrack":
      return updateTrack(pattern, command.track, (track) =>
        createEmptyTrackLike(track, pattern.length),
      );
    case "loadPattern":
      return command.pattern;
  }
}

function updateTrack(
  pattern: Pattern,
  id: TrackId,
  update: (track: Track) => Track,
): Pattern {
  return {
    ...pattern,
    tracks: pattern.tracks.map((track) =>
      track.id === id ? update(track) : track,
    ),
  };
}

// Out-of-range steps are ignored so a stale remote command cannot corrupt
// the pattern.
function withStep<T extends Track>(
  track: T,
  step: number,
  update: (value: T["steps"][number]) => T["steps"][number],
): T {
  if (!Number.isInteger(step) || step < 0 || step >= track.steps.length) {
    return track;
  }
  const steps = [...track.steps];
  steps[step] = update(steps[step]);
  return { ...track, steps } as T;
}

function createEmptyTrackLike(track: Track, length: number): Track {
  const empty = createEmptyTrack(track.id, length);
  return { ...empty, muted: track.muted, sends: track.sends };
}

// Growing 16 → 32 duplicates the first bar (the usual sequencer behaviour);
// shrinking keeps the first bar.
function setLength(pattern: Pattern, length: PatternLength): Pattern {
  if (pattern.length === length) return pattern;
  const resize = <S>(steps: S[]): S[] =>
    length > steps.length ? [...steps, ...steps] : steps.slice(0, length);
  return {
    ...pattern,
    length,
    tracks: pattern.tracks.map(
      (track) => ({ ...track, steps: resize<unknown>(track.steps) }) as Track,
    ),
  };
}
