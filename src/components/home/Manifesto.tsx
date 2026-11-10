"use client";

import { SplitText, gsap } from "@/components/scroll/gsap";
import { useScrollMotion } from "@/components/scroll/useScrollMotion";

type ManifestoProps = { eyebrow: string; text: string };

// A pinned statement: the section holds still while scrolling lights it up
// word by word, like scrubbing a UIViewPropertyAnimator's fractionComplete.
export function Manifesto({ eyebrow, text }: ManifestoProps) {
  const ref = useScrollMotion<HTMLElement>((section) => {
    // Words don't move when the width changes (lines do), so one split is
    // enough; re-splitting would also recreate the pin out of order.
    const split = SplitText.create("[data-words]", {
      type: "words",
      wordsClass: "word",
    });
    // The pinned block sits inside a plain section: ScrollTrigger turns
    // pin spacing off when the pin's parent is a flex container (<main>).
    const panel = section.querySelector("[data-pin]");
    gsap.fromTo(
      split.words,
      { opacity: 0.15 },
      {
        opacity: 1,
        stagger: 0.1,
        ease: "none",
        scrollTrigger: {
          trigger: panel,
          start: "top top",
          end: "+=150%",
          pin: panel,
          scrub: true,
        },
      },
    );
  });

  return (
    <section ref={ref} data-testid="manifesto">
      <div
        data-pin
        className="flex min-h-svh flex-col justify-center gap-8 px-gutter py-section"
      >
        <h2 className="font-mono text-xs tracking-[0.2em] text-muted uppercase">
          {eyebrow}
        </h2>
        <p
          data-words
          className="max-w-5xl font-display text-headline font-medium"
        >
          {text}
        </p>
      </div>
    </section>
  );
}
