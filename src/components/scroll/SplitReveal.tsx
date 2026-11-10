"use client";

import { SplitText, gsap } from "./gsap";
import { useScrollMotion } from "./useScrollMotion";

type SplitRevealProps = {
  /** Plain text only: SplitText rewrites the element's DOM into lines. */
  children: string;
  as?: "h2" | "h3";
  className?: string;
};

// A headline whose lines slide up from behind a mask, one after another.
// The server renders the plain text; lines are measured in the browser.
export function SplitReveal({
  children,
  as: Tag = "h2",
  className,
}: SplitRevealProps) {
  const ref = useScrollMotion<HTMLHeadingElement>((element) => {
    SplitText.create(element, {
      type: "lines",
      mask: "lines",
      // Re-split when fonts load or the width changes; returning the tween
      // lets SplitText carry its progress over to the new lines.
      autoSplit: true,
      onSplit: (split) =>
        gsap.from(split.lines, {
          yPercent: 110,
          duration: 1.1,
          stagger: 0.09,
          ease: "expo.out",
          scrollTrigger: { trigger: element, start: "top 85%", once: true },
        }),
    });
  });

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
