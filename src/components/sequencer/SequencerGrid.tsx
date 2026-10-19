"use client";

import { memo, useRef, useState } from "react";
import { melodicNoteName } from "@/audio/instruments";
import {
  type MelodicTrackId,
  NOTE_COUNT,
  type Note,
  type SendName,
  type Track,
  type TrackId,
} from "@/audio/pattern";
import { useSequencer } from "./SequencerProvider";
import { TRACK_LABELS, trackGroup } from "./tracks";

type Position = { row: number; col: number };

// Pixels of vertical drag per scale step when changing a note by touch/mouse.
const DRAG_PX_PER_NOTE = 12;

const ACTIVE_COLORS = {
  drums: "bg-sky-400",
  fx: "bg-amber-400",
  melodic: "bg-fuchsia-400",
} as const;

export function SequencerGrid() {
  const tracks = useSequencer((s) => s.pattern.tracks);
  const length = useSequencer((s) => s.pattern.length);
  const [focus, setFocus] = useState<Position>({ row: 0, col: 0 });
  const gridRef = useRef<HTMLDivElement>(null);

  // Roving tabindex: only one cell is in the Tab order; arrows move focus.
  // Clamped so shrinking the pattern never leaves the grid without a stop.
  const focusCol = Math.min(focus.col, length - 1);
  const moveFocus = (row: number, col: number) => {
    const r = Math.max(0, Math.min(tracks.length - 1, row));
    const c = Math.max(0, Math.min(length - 1, col));
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-row="${r}"][data-col="${c}"]`)
      ?.focus();
  };
  // Clicks and Tab also move the roving position.
  const onFocus = (e: React.FocusEvent) => {
    const { row, col } = (e.target as HTMLElement).dataset;
    if (row !== undefined && col !== undefined) {
      setFocus({ row: Number(row), col: Number(col) });
    }
  };

  return (
    <div className="overflow-x-auto pb-2">
      <div
        ref={gridRef}
        role="grid"
        aria-label="Сітка кроків"
        aria-rowcount={tracks.length}
        aria-colcount={length}
        onFocus={onFocus}
        className="inline-flex min-w-full flex-col gap-1"
      >
        {tracks.map((track, row) => (
          <TrackRow
            key={track.id}
            track={track}
            row={row}
            focusCol={focus.row === row ? focusCol : -1}
            onMoveFocus={moveFocus}
          />
        ))}
      </div>
    </div>
  );
}

const TrackRow = memo(function TrackRow({
  track,
  row,
  focusCol,
  onMoveFocus,
}: {
  track: Track;
  row: number;
  focusCol: number;
  onMoveFocus: (row: number, col: number) => void;
}) {
  return (
    <div role="row" className="flex items-center gap-1">
      <div
        role="rowheader"
        className="sticky left-0 z-10 flex w-28 shrink-0 items-center gap-2 bg-background pr-2 md:w-60"
      >
        <TrackHeader track={track} />
      </div>
      {track.steps.map((value, col) => (
        <StepCell
          key={col}
          trackId={track.id}
          melodic={track.kind === "melodic"}
          value={value}
          row={row}
          col={col}
          tabbable={col === focusCol}
          onMoveFocus={onMoveFocus}
        />
      ))}
    </div>
  );
});

function TrackHeader({ track }: { track: Track }) {
  const dispatch = useSequencer((s) => s.dispatch);
  const label = TRACK_LABELS[track.id];
  return (
    <>
      <button
        type="button"
        aria-pressed={track.muted}
        aria-label={`Вимкнути звук: ${label}`}
        onClick={() => dispatch({ type: "toggleMute", track: track.id })}
        className="size-6 shrink-0 rounded text-xs font-semibold text-foreground/60 aria-pressed:bg-red-500/80 aria-pressed:text-white"
      >
        M
      </button>
      <span
        className={`truncate text-sm ${track.muted ? "text-foreground/40" : ""}`}
      >
        {label}
      </span>
      {/* Sends are hidden on small screens to keep the grid usable. */}
      <div className="ml-auto hidden gap-2 md:flex">
        <SendKnob track={track} send="reverb" short="Rev" />
        <SendKnob track={track} send="delay" short="Dly" />
      </div>
    </>
  );
}

function SendKnob({
  track,
  send,
  short,
}: {
  track: Track;
  send: SendName;
  short: string;
}) {
  const dispatch = useSequencer((s) => s.dispatch);
  return (
    <label className="flex flex-col items-center text-[10px] text-foreground/50">
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(track.sends[send] * 100)}
        aria-label={`${send === "reverb" ? "Reverb" : "Delay"}: ${TRACK_LABELS[track.id]}`}
        onChange={(e) =>
          dispatch({
            type: "setSend",
            track: track.id,
            send,
            value: Number(e.target.value) / 100,
          })
        }
        className="w-12 accent-foreground"
      />
      {short}
    </label>
  );
}

const StepCell = memo(function StepCell({
  trackId,
  melodic,
  value,
  row,
  col,
  tabbable,
  onMoveFocus,
}: {
  trackId: TrackId;
  melodic: boolean;
  value: boolean | Note | null;
  row: number;
  col: number;
  tabbable: boolean;
  onMoveFocus: (row: number, col: number) => void;
}) {
  const dispatch = useSequencer((s) => s.dispatch);
  // Per-cell subscription: only the two cells whose state flips re-render
  // on each step, not the whole grid.
  const isCurrent = useSequencer((s) => s.currentStep === col);
  const drag = useRef<{ y: number; note: Note; moved: boolean } | null>(null);

  const active = value !== false && value !== null;
  const note = typeof value === "number" ? value : null;
  const label = TRACK_LABELS[trackId];

  const toggle = () =>
    dispatch({ type: "toggleStep", track: trackId, step: col });
  const setNote = (next: Note) => {
    if (!melodic) return;
    dispatch({
      type: "setNote",
      track: trackId as MelodicTrackId,
      step: col,
      note: Math.max(0, Math.min(NOTE_COUNT - 1, next)),
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      toggle();
      return;
    }
    if (
      e.shiftKey &&
      note !== null &&
      (e.key === "ArrowUp" || e.key === "ArrowDown")
    ) {
      e.preventDefault();
      setNote(note + (e.key === "ArrowUp" ? 1 : -1));
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowUp: [row - 1, col],
      ArrowDown: [row + 1, col],
      ArrowLeft: [row, col - 1],
      ArrowRight: [row, col + 1],
      Home: [row, 0],
      End: [row, Number.MAX_SAFE_INTEGER],
    };
    const target = moves[e.key];
    if (target) {
      e.preventDefault();
      onMoveFocus(target[0], target[1]);
    }
  };

  // Vertical drag on an active melodic cell changes its pitch (touch-friendly).
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (note === null) return;
    drag.current = { y: e.clientY, note, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const delta = Math.round((drag.current.y - e.clientY) / DRAG_PX_PER_NOTE);
    if (delta === 0) return;
    drag.current.moved = true;
    setNote(drag.current.note + delta);
  };
  const onClick = () => {
    const dragged = drag.current?.moved;
    drag.current = null;
    if (!dragged) toggle();
  };

  const group = trackGroup(trackId);
  const beatStart = col % 4 === 0;

  return (
    <div role="gridcell" className={beatStart && col > 0 ? "ml-1" : ""}>
      <button
        type="button"
        data-row={row}
        data-col={col}
        tabIndex={tabbable ? 0 : -1}
        aria-pressed={active}
        data-current={isCurrent || undefined}
        aria-label={`${label}, крок ${col + 1}${note !== null ? `, нота ${melodicNoteName(trackId as MelodicTrackId, note)}` : ""}`}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onClick={onClick}
        className={[
          "flex size-8 items-center justify-center rounded text-[10px] font-semibold text-background transition-colors select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground",
          active
            ? ACTIVE_COLORS[group]
            : beatStart
              ? "bg-foreground/15 hover:bg-foreground/25"
              : "bg-foreground/8 hover:bg-foreground/20",
          isCurrent ? "ring-2 ring-foreground" : "",
          // Only pitch-draggable cells block touch scrolling.
          note !== null ? "touch-none" : "",
        ].join(" ")}
      >
        {note !== null ? melodicNoteName(trackId as MelodicTrackId, note) : ""}
      </button>
    </div>
  );
});
