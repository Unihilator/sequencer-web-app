"use client";

import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect } from "react";
import { MOTION_OK, ScrollTrigger, gsap } from "./gsap";

// Smooth wheel scrolling for the pages that opt in through their layout.
// Touch keeps native iOS/Android inertia (Lenis leaves it alone by default).
// With reduced motion there is no Lenis at all, just the browser's scroll.
export function SmoothScroll() {
  useEffect(() => {
    const motionOk = window.matchMedia(MOTION_OK);
    let lenis: Lenis | null = null;

    // One frame loop for the whole page: GSAP's ticker drives Lenis, and
    // every Lenis scroll tells ScrollTrigger to re-read the position.
    const tick = (time: number) => lenis?.raf(time * 1000);

    const start = () => {
      lenis = new Lenis({ autoRaf: false, anchors: true });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(tick);
      // Lag smoothing would make the scroll jump after a slow frame.
      gsap.ticker.lagSmoothing(0);
    };

    const stop = () => {
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis?.destroy();
      lenis = null;
    };

    const sync = () => {
      if (motionOk.matches && !lenis) start();
      if (!motionOk.matches && lenis) stop();
    };

    sync();
    motionOk.addEventListener("change", sync);
    // Web fonts change block heights, so trigger positions go stale.
    void document.fonts.ready.then(() => ScrollTrigger.refresh());

    return () => {
      motionOk.removeEventListener("change", sync);
      stop();
    };
  }, []);

  return null;
}
