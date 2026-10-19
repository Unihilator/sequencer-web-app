"use client";

import { useState } from "react";
import { encodePattern, PATTERN_URL_PARAM } from "@/audio/encoding";
import { useSequencerStore } from "./SequencerProvider";

type Status = "idle" | "copied" | "manual";

export function ShareButton() {
  const store = useSequencerStore();
  const [status, setStatus] = useState<Status>("idle");
  const [manualUrl, setManualUrl] = useState("");

  const share = async () => {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set(
      PATTERN_URL_PARAM,
      encodePattern(store.getState().pattern),
    );
    // Keep the address bar in sync so a reload restores the pattern.
    window.history.replaceState(null, "", url);

    const href = url.toString();
    // Native share sheet on phones; clipboard elsewhere; visible text field
    // as the last resort (e.g. clipboard blocked).
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: "Мій біт", url: href });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
      }
    }
    try {
      await navigator.clipboard.writeText(href);
      setStatus("copied");
    } catch {
      setManualUrl(href);
      setStatus("manual");
    }
  };

  return (
    <div className="flex items-center gap-3 text-sm">
      <button
        type="button"
        onClick={() => void share()}
        className="rounded-full border border-foreground/30 px-4 py-2 font-medium transition-colors hover:bg-foreground/10"
      >
        Поділитися
      </button>
      <span aria-live="polite" className="text-foreground/60">
        {status === "copied" && "Посилання скопійовано"}
      </span>
      {status === "manual" && (
        <input
          readOnly
          value={manualUrl}
          aria-label="Посилання на патерн"
          onFocus={(e) => e.currentTarget.select()}
          className="w-64 rounded border border-foreground/20 bg-transparent px-2 py-1"
        />
      )}
    </div>
  );
}
