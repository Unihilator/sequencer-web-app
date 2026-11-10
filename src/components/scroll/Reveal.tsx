"use client";

import type { ReactNode } from "react";
import { gsap } from "./gsap";
import { useScrollMotion } from "./useScrollMotion";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Seconds to wait after the block enters the viewport. */
  delay?: number;
};

// A block that rises and fades in the first time it scrolls into view.
// Only opacity is animated (not visibility), so links inside stay in the
// keyboard tab order; focusing one scrolls it into view and reveals it.
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const ref = useScrollMotion<HTMLDivElement>((element) => {
    gsap.from(element, {
      opacity: 0,
      y: 48,
      duration: 1.2,
      delay,
      ease: "power3.out",
      scrollTrigger: { trigger: element, start: "top 85%", once: true },
    });
  });

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
