"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { EngineDiagnostics } from "@/audio/engine";
import { useSequencerEngine } from "./SequencerProvider";

const MAX_LINES = 80;

// Hidden on-device audio diagnostics: open /sequencer?debug=audio.
// Must be rendered inside <Suspense> (reads search params).
export function AudioDebugPanel() {
  const enabled = useSearchParams().get("debug") === "audio";
  return enabled ? <Panel /> : null;
}

function Panel() {
  const engine = useSequencerEngine();
  const [lines, setLines] = useState<string[]>([]);
  const [live, setLive] = useState<EngineDiagnostics>(() =>
    engine.diagnostics(),
  );
  const [copied, setCopied] = useState(false);

  useEffect(
    () =>
      engine.onDebug((line) =>
        setLines((prev) => [...prev, line].slice(-MAX_LINES)),
      ),
    [engine],
  );

  // UI polling only (no audio is scheduled here).
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setLive(engine.diagnostics());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [engine]);

  const report = [
    navigator.userAgent,
    `live: context=${live.contextState} time=${live.contextTime.toFixed(2)} transport=${live.transportState} playing=${live.playing} contexts=${live.contextsCreated}`,
    ...lines,
  ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      aria-label="Діагностика аудіо"
      className="fixed inset-x-2 bottom-2 z-50 flex max-h-[45vh] flex-col gap-2 rounded-lg border border-foreground/20 bg-background/95 p-3 font-mono text-[11px] leading-snug shadow-lg"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <strong>audio debug</strong>
        <span>context: {live.contextState}</span>
        <span>time: {live.contextTime.toFixed(2)}</span>
        <span>transport: {live.transportState}</span>
        <span>playing: {String(live.playing)}</span>
        <span>contexts: {live.contextsCreated}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="ml-auto rounded bg-foreground/15 px-2 py-1"
        >
          {copied ? "Скопійовано" : "Копіювати лог"}
        </button>
      </div>
      <pre className="overflow-auto whitespace-pre-wrap">
        {lines.join("\n") || "Натисніть Play, щоб побачити події."}
      </pre>
    </section>
  );
}
