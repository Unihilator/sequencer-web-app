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
const SequencerContext = createContext<SequencerStore | null>(null);

export function SequencerProvider({
  initialPattern,
  children,
}: {
  initialPattern?: Pattern;
  children: React.ReactNode;
}) {
  const [{ store, engine }] = useState(() => {
    const pattern = initialPattern ?? createEmptyPattern();
    const engine = new AudioEngine(pattern);
    return {
      engine,
      store: createSequencerStore({ engine, initialPattern: pattern }),
    };
  });

  useEffect(() => {
    const disconnect = connectEngine(store, engine);
    return () => {
      disconnect();
      engine.dispose();
    };
  }, [store, engine]);

  return (
    <SequencerContext.Provider value={store}>
      {children}
    </SequencerContext.Provider>
  );
}

export function useSequencer<T>(selector: (state: SequencerState) => T): T {
  const store = useContext(SequencerContext);
  if (!store) {
    throw new Error("useSequencer must be used inside <SequencerProvider>");
  }
  return useStore(store, selector);
}
