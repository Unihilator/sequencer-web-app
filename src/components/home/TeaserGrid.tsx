"use client";

import { gsap } from "@/components/scroll/gsap";
import { useScrollMotion } from "@/components/scroll/useScrollMotion";
import { TEASER_PATTERN } from "./copy";

const STEPS = 16;

// A picture of the sequencer, not the real one: no audio, no input.
// Scrolling sweeps a playhead across it and lights each step it passes.
export function TeaserGrid() {
  const ref = useScrollMotion<HTMLDivElement>((grid) => {
    const playhead = grid.querySelector<HTMLElement>("[data-playhead]")!;
    // Distance from the first step column to the last one.
    const sweep = () =>
      (STEPS - 1) *
      (playhead.offsetWidth + parseFloat(getComputedStyle(grid).columnGap));

    const timeline = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        trigger: grid,
        // clamp() keeps the sweep reachable when the grid ends the page.
        start: "clamp(top 75%)",
        end: "clamp(bottom 40%)",
        scrub: 0.5,
        invalidateOnRefresh: true,
      },
    });

    // One timeline second per step: the playhead reaches step N at time N.
    gsap.set(playhead, { display: "block" });
    timeline.fromTo(playhead, { x: 0 }, { x: sweep, duration: STEPS - 1 }, 0);
    for (const cell of grid.querySelectorAll<HTMLElement>("[data-on]")) {
      timeline.from(
        cell,
        { opacity: 0.15, scale: 0.6, duration: 0.5, ease: "back.out(3)" },
        Number(cell.dataset.step),
      );
    }
  });

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="grid grid-cols-[2.5rem_repeat(16,minmax(0,1fr))] items-center gap-1 rounded-2xl bg-surface/60 p-4 sm:p-6"
    >
      {/* Every item has an explicit cell so the playhead can overlap them. */}
      {TEASER_PATTERN.map((track, row) => [
        <span
          key={track.label}
          style={{ gridRow: row + 1, gridColumn: 1 }}
          className="font-mono text-[10px] text-muted uppercase"
        >
          {track.label}
        </span>,
        ...[...track.steps].map((step, index) => (
          <span
            key={`${track.label}-${index}`}
            data-step={index}
            data-on={step === "x" ? "" : undefined}
            style={{ gridRow: row + 1, gridColumn: index + 2 }}
            className={`aspect-square rounded-sm ${
              step === "x"
                ? "bg-accent-soft"
                : index % 4 === 0
                  ? "bg-foreground/10"
                  : "bg-foreground/5"
            }`}
          />
        )),
      ])}
      {/* Covers the first step column; shown only while motion is allowed. */}
      <span
        data-playhead
        style={{ gridRow: `1 / ${TEASER_PATTERN.length + 1}`, gridColumn: 2 }}
        className="pointer-events-none -my-1 hidden self-stretch rounded-sm bg-foreground/10"
      />
    </div>
  );
}
