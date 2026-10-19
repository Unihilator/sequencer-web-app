"use client";

import { useEffect } from "react";
import { SequencerGrid } from "./SequencerGrid";
import { SequencerProvider, useSequencer } from "./SequencerProvider";
import { TransportBar } from "./TransportBar";

export function Sequencer() {
  return (
    <SequencerProvider>
      <SpaceToPlay />
      <div className="flex flex-col gap-6">
        <TransportBar />
        <SequencerGrid />
        <p className="text-sm text-foreground/50">
          Пробіл — play/stop. Стрілки — рух по сітці, Enter — увімкнути крок,
          Shift + ↑/↓ або перетягування вгору/вниз — висота ноти (Bass, Synth).
          Немає звуку на iPhone — перевірте перемикач беззвучного режиму.
        </p>
      </div>
    </SequencerProvider>
  );
}

// Space toggles playback anywhere on the page, like in a DAW — except while
// typing into a text field.
function SpaceToPlay() {
  const togglePlay = useSequencer((s) => s.togglePlay);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || isTextInput(e.target)) return;
      // Also stops the focused button from being "clicked" by Space.
      e.preventDefault();
      void togglePlay();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePlay]);
  return null;
}

const NON_TEXT_INPUTS = new Set(["range", "checkbox", "radio", "button"]);

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) {
    return true;
  }
  return (
    target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type)
  );
}
