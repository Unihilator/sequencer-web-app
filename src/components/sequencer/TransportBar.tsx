"use client";

import { BPM_MAX, BPM_MIN, PATTERN_LENGTHS } from "@/audio/pattern";
import { useSequencer } from "./SequencerProvider";

export function TransportBar() {
  const isPlaying = useSequencer((s) => s.isPlaying);
  const status = useSequencer((s) => s.engineStatus);
  const bpm = useSequencer((s) => s.pattern.bpm);
  const swing = useSequencer((s) => s.pattern.swing);
  const length = useSequencer((s) => s.pattern.length);
  const dispatch = useSequencer((s) => s.dispatch);
  const togglePlay = useSequencer((s) => s.togglePlay);

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <button
        type="button"
        onClick={() => void togglePlay()}
        aria-pressed={isPlaying}
        aria-keyshortcuts="Space"
        className="min-w-24 rounded-full bg-accent px-5 py-2 font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
      >
        {status === "loading" ? "…" : isPlaying ? "Stop" : "Play"}
      </button>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-foreground/70">BPM</span>
        <input
          type="range"
          min={BPM_MIN}
          max={BPM_MAX}
          value={bpm}
          onChange={(e) =>
            dispatch({ type: "setBpm", bpm: Number(e.target.value) })
          }
          className="w-28 accent-foreground"
        />
        <input
          type="number"
          min={BPM_MIN}
          max={BPM_MAX}
          value={bpm}
          aria-label="BPM"
          onChange={(e) =>
            dispatch({ type: "setBpm", bpm: Number(e.target.value) })
          }
          className="w-16 rounded border border-foreground/20 bg-transparent px-2 py-1 tabular-nums"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-foreground/70">Swing</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(swing * 100)}
          onChange={(e) =>
            dispatch({ type: "setSwing", swing: Number(e.target.value) / 100 })
          }
          className="w-24 accent-foreground"
        />
        <span className="w-10 text-right tabular-nums">
          {Math.round(swing * 100)}%
        </span>
      </label>

      <fieldset className="flex items-center gap-1 text-sm">
        <legend className="sr-only">Довжина патерну</legend>
        {PATTERN_LENGTHS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={length === value}
            onClick={() => dispatch({ type: "setLength", length: value })}
            className="rounded px-3 py-1 tabular-nums aria-pressed:bg-foreground/15"
          >
            {value}
          </button>
        ))}
      </fieldset>

      <p aria-live="polite" className="text-sm text-foreground/60">
        {status === "error"
          ? "Не вдалося запустити звук. Спробуйте ще раз."
          : status === "loading"
            ? "Завантаження звуку…"
            : ""}
      </p>
    </div>
  );
}
