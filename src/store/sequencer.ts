// Sequencer state. Vanilla Zustand store (no React) so the engine binding and
// tests can use it directly; React reads it through SequencerProvider.

import { createStore } from "zustand/vanilla";
import type { AudioEngine, EngineStatus } from "@/audio/engine";
import {
  applyCommand,
  createEmptyPattern,
  type Pattern,
  type PatternCommand,
} from "@/audio/pattern";

export type SequencerEngine = Pick<
  AudioEngine,
  "init" | "play" | "stop" | "setPattern" | "onStep" | "onPlayingChange"
>;

export type SequencerState = {
  pattern: Pattern;
  isPlaying: boolean;
  /** Step currently sounding, or -1 when stopped. */
  currentStep: number;
  engineStatus: EngineStatus;
  /** The single entry point for pattern edits (local now, networked later). */
  dispatch: (command: PatternCommand) => void;
  play: () => Promise<void>;
  stop: () => void;
  togglePlay: () => Promise<void>;
};

export type SequencerStore = ReturnType<typeof createSequencerStore>;

export function createSequencerStore(options: {
  engine: SequencerEngine;
  initialPattern?: Pattern;
}) {
  const { engine } = options;

  const store = createStore<SequencerState>()((set, get) => ({
    pattern: options.initialPattern ?? createEmptyPattern(),
    isPlaying: false,
    currentStep: -1,
    engineStatus: "idle",

    dispatch: (command) =>
      set((state) => ({ pattern: applyCommand(state.pattern, command) })),

    play: async () => {
      if (get().engineStatus !== "ready") set({ engineStatus: "loading" });
      try {
        await engine.play();
        set({ engineStatus: "ready" });
      } catch (error) {
        console.error("Failed to start audio", error);
        set({ engineStatus: "error" });
      }
    },

    stop: () => engine.stop(),

    togglePlay: () =>
      get().isPlaying ? Promise.resolve(get().stop()) : get().play(),
  }));

  return store;
}

// Engine ⇄ store wiring. Like a Combine sink on @Published: the engine
// follows the pattern; the store mirrors the engine's playback state.
// Returns a disconnect function (React effects may connect twice).
export function connectEngine(
  store: SequencerStore,
  engine: SequencerEngine,
): () => void {
  engine.setPattern(store.getState().pattern);
  const unsubscribers = [
    store.subscribe((state, prev) => {
      if (state.pattern !== prev.pattern) engine.setPattern(state.pattern);
    }),
    engine.onStep((step) => store.setState({ currentStep: step })),
    engine.onPlayingChange((isPlaying) =>
      store.setState(
        isPlaying ? { isPlaying } : { isPlaying, currentStep: -1 },
      ),
    ),
  ];
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}
