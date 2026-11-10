"use client";

import type { ReactNode } from "react";
import { gsap } from "@/components/scroll/gsap";
import { useScrollMotion } from "@/components/scroll/useScrollMotion";

type HeroScrollProps = { children: ReactNode; className?: string };

// The hero recedes as the page scrolls: the field drifts back and dims
// while the copy lifts away faster than the page. Children stay server-
// rendered; they only mark the layers with data-hero-field / data-hero-copy.
export function HeroScroll({ children, className }: HeroScrollProps) {
  const ref = useScrollMotion<HTMLElement>((section) => {
    gsap
      .timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      })
      .to("[data-hero-field]", { scale: 1.08, opacity: 0.3 }, 0)
      .to("[data-hero-copy]", { yPercent: -40, opacity: 0, duration: 0.6 }, 0);
  });

  return (
    <section ref={ref} className={className}>
      {children}
    </section>
  );
}
