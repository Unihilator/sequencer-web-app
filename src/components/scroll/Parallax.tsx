"use client";

import type { ReactNode } from "react";
import { gsap } from "./gsap";
import { useScrollMotion } from "./useScrollMotion";

type ParallaxProps = {
  children: ReactNode;
  className?: string;
  /**
   * Share of the element's own height it drifts while crossing the
   * viewport. Positive moves up faster than the page, negative lags behind.
   */
  speed?: number;
};

// A layer that moves at its own pace while the page scrolls past it.
// It sits at its natural position when centred in the viewport.
export function Parallax({ children, className, speed = 0.2 }: ParallaxProps) {
  const ref = useScrollMotion<HTMLDivElement>((element) => {
    gsap.fromTo(
      element,
      { yPercent: speed * 50 },
      {
        yPercent: speed * -50,
        ease: "none",
        scrollTrigger: {
          trigger: element,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      },
    );
  });

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
