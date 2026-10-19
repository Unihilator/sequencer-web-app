// Compact, versioned binary encoding of a Pattern for share URLs (base64url).
//
// Version 1 layout (bytes):
//   [0] version = 1
//   [1] bpm (BPM_MIN..BPM_MAX)
//   [2] swing × 100 (0..100)
//   [3] length (16 | 32)
//   then for each track, in TRACK_IDS order:
//     [flags: bit0 = muted] [reverb × 100] [delay × 100]
//     drum:    length / 8 bytes, one bit per step (LSB first)
//     melodic: length / 2 bytes, one nibble per step (0 = off, n = note n - 1)
//
// Never change an existing version's layout: old links must keep decoding.
// Add a new version instead.

import {
  BPM_MAX,
  BPM_MIN,
  createEmptyPattern,
  isMelodicTrackId,
  NOTE_COUNT,
  type Pattern,
  PATTERN_LENGTHS,
  type PatternLength,
  TRACK_IDS,
  type Track,
} from "./pattern";

const VERSION = 1;
const HEADER_BYTES = 4;
const TRACK_HEADER_BYTES = 3;

export function encodePattern(pattern: Pattern): string {
  const bytes: number[] = [
    VERSION,
    pattern.bpm,
    toPercent(pattern.swing),
    pattern.length,
  ];
  for (const id of TRACK_IDS) {
    const track = pattern.tracks.find((t) => t.id === id);
    if (!track) throw new Error(`Pattern is missing track "${id}"`);
    bytes.push(
      track.muted ? 1 : 0,
      toPercent(track.sends.reverb),
      toPercent(track.sends.delay),
    );
    bytes.push(
      ...(track.kind === "drum"
        ? packBits(track.steps)
        : packNibbles(track.steps)),
    );
  }
  return toBase64Url(Uint8Array.from(bytes));
}

// Returns null for anything that is not a valid pattern, so a broken or
// tampered link never crashes the page.
export function decodePattern(encoded: string): Pattern | null {
  const bytes = fromBase64Url(encoded);
  if (!bytes || bytes.length < HEADER_BYTES || bytes[0] !== VERSION) {
    return null;
  }
  const [, bpm, swing, length] = bytes;
  if (bpm < BPM_MIN || bpm > BPM_MAX || swing > 100) return null;
  if (!(PATTERN_LENGTHS as readonly number[]).includes(length)) return null;

  const expected =
    HEADER_BYTES +
    TRACK_IDS.length * TRACK_HEADER_BYTES +
    TRACK_IDS.reduce(
      (sum, id) => sum + (isMelodicTrackId(id) ? length / 2 : length / 8),
      0,
    );
  if (bytes.length !== expected) return null;

  const template = createEmptyPattern(length as PatternLength);
  let offset = HEADER_BYTES;
  const tracks: Track[] = [];
  for (const empty of template.tracks) {
    const [flags, reverb, delay] = bytes.subarray(
      offset,
      offset + TRACK_HEADER_BYTES,
    );
    offset += TRACK_HEADER_BYTES;
    if (flags > 1 || reverb > 100 || delay > 100) return null;
    const base = {
      muted: flags === 1,
      sends: { reverb: reverb / 100, delay: delay / 100 },
    };

    if (empty.kind === "drum") {
      const size = length / 8;
      tracks.push({
        ...empty,
        ...base,
        steps: unpackBits(bytes.subarray(offset, offset + size), length),
      });
      offset += size;
    } else {
      const size = length / 2;
      const steps = unpackNibbles(bytes.subarray(offset, offset + size));
      if (steps.some((n) => n !== null && n >= NOTE_COUNT)) return null;
      tracks.push({ ...empty, ...base, steps });
      offset += size;
    }
  }

  return { bpm, swing: swing / 100, length: length as PatternLength, tracks };
}

function toPercent(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 100);
}

function packBits(steps: boolean[]): number[] {
  const out = new Array<number>(steps.length / 8).fill(0);
  steps.forEach((on, i) => {
    if (on) out[i >> 3] |= 1 << (i & 7);
  });
  return out;
}

function unpackBits(bytes: Uint8Array, length: number): boolean[] {
  return Array.from(
    { length },
    (_, i) => (bytes[i >> 3] & (1 << (i & 7))) !== 0,
  );
}

function packNibbles(steps: (number | null)[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < steps.length; i += 2) {
    out.push((nibble(steps[i]) << 4) | nibble(steps[i + 1]));
  }
  return out;
}

function nibble(note: number | null): number {
  return note === null ? 0 : note + 1;
}

function unpackNibbles(bytes: Uint8Array): (number | null)[] {
  const steps: (number | null)[] = [];
  for (const byte of bytes) {
    for (const n of [byte >> 4, byte & 0x0f])
      steps.push(n === 0 ? null : n - 1);
  }
  return steps;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(encoded: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(encoded)) return null;
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}
