import type { TrackId } from "@/audio/pattern";

export const TRACK_LABELS: Record<TrackId, string> = {
  kick: "Kick",
  snare: "Snare",
  clap: "Clap",
  closedHat: "Closed hat",
  openHat: "Open hat",
  ride: "Ride",
  tom: "Tom",
  perc: "Perc",
  fx1: "FX: Crash",
  fx2: "FX: Zap",
  bass: "Bass",
  synth: "Synth",
};

export type TrackGroup = "drums" | "fx" | "melodic";

export function trackGroup(id: TrackId): TrackGroup {
  if (id === "fx1" || id === "fx2") return "fx";
  if (id === "bass" || id === "synth") return "melodic";
  return "drums";
}
