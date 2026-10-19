"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { AudioSessionType, EngineDiagnostics } from "@/audio/engine";
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
  // Filled on the first animation frame: browser-only values (like the
  // audio session) must not be part of the server-rendered HTML.
  const [live, setLive] = useState<EngineDiagnostics | null>(null);
  const [copied, setCopied] = useState(false);
  const [sessionType, setSessionType] = useState<AudioSessionType>(
    engine.audioSessionType,
  );
  const changeSessionType = (type: AudioSessionType) => {
    engine.setAudioSessionType(type);
    setSessionType(type);
  };

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

  const copy = async () => {
    const now = engine.diagnostics();
    const report = [
      navigator.userAgent,
      `live: context=${now.contextState} time=${now.contextTime.toFixed(2)} transport=${now.transportState} playing=${now.playing} contexts=${now.contextsCreated} audioSession=${now.audioSession} sessionSetting=${sessionType}`,
      ...lines,
    ].join("\n");
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
        {live && (
          <>
            <span>context: {live.contextState}</span>
            <span>time: {live.contextTime.toFixed(2)}</span>
            <span>transport: {live.transportState}</span>
            <span>playing: {String(live.playing)}</span>
            <span>contexts: {live.contextsCreated}</span>
            <span>audioSession: {live.audioSession}</span>
          </>
        )}
        <label className="flex items-center gap-1">
          type on Play:
          <select
            value={sessionType}
            onChange={(e) =>
              changeSessionType(e.target.value as AudioSessionType)
            }
            className="rounded bg-foreground/15 px-1 py-0.5"
          >
            <option value="playback">playback</option>
            <option value="auto">auto</option>
          </select>
        </label>
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
