"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useStore } from "zustand";
import { AudioEngine } from "@/audio/engine";
import { createEmptyPattern, type Pattern } from "@/audio/pattern";
import {
  connectEngine,
  createSequencerStore,
  type SequencerState,
  type SequencerStore,
} from "@/store/sequencer";

// One store + engine per mounted sequencer (like an @EnvironmentObject),
// instead of a module-level singleton that would leak between SSR requests.
const SequencerContext = createContext<{
  store: SequencerStore;
  engine: AudioEngine;
} | null>(null);

export function SequencerProvider({
  initialPattern,
  children,
}: {
  initialPattern?: Pattern;
  children: React.ReactNode;
}) {
  const [value] = useState(() => {
    const pattern = initialPattern ?? createEmptyPattern();
    const engine = new AudioEngine(pattern);
    return {
      engine,
      store: createSequencerStore({ engine, initialPattern: pattern }),
    };
  });

  const { store, engine } = value;
  useEffect(() => {
    const disconnect = connectEngine(store, engine);
    return () => {
      disconnect();
      engine.dispose();
    };
  }, [store, engine]);

  return (
    <SequencerContext.Provider value={value}>
      {children}
    </SequencerContext.Provider>
  );
}

export function useSequencer<T>(selector: (state: SequencerState) => T): T {
  return useStore(useSequencerStore(), selector);
}

/** Raw store, for reading state in event handlers without re-rendering. */
export function useSequencerStore(): SequencerStore {
  return useSequencerContext().store;
}

/** The engine itself; only for diagnostics, everything else goes via the store. */
export function useSequencerEngine(): AudioEngine {
  return useSequencerContext().engine;
}

function useSequencerContext() {
  const value = useContext(SequencerContext);
  if (!value) {
    throw new Error("useSequencer must be used inside <SequencerProvider>");
  }
  return value;
}
