"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { decodePattern, PATTERN_URL_PARAM } from "@/audio/encoding";
import { useSequencerStore } from "./SequencerProvider";

// Loads a shared pattern from ?p= into the existing store (no remount, so
// nothing the user already touched is thrown away mid-hydration).
// Must be rendered inside <Suspense>: the static page has no search params.
export function PatternFromUrl() {
  const encoded = useSearchParams().get(PATTERN_URL_PARAM);
  const store = useSequencerStore();
  const pattern = useMemo(
    () => (encoded ? decodePattern(encoded) : null),
    [encoded],
  );

  useEffect(() => {
    if (pattern) store.getState().dispatch({ type: "loadPattern", pattern });
  }, [store, pattern]);

  if (!encoded || pattern) return null;
  return (
    <p role="status" className="text-sm text-amber-300">
      Посилання пошкоджене або застаріле — відкрито порожній патерн.
    </p>
  );
}
