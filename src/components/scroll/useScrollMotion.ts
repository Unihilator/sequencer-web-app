import { useRef } from "react";
import { MOTION_OK, gsap, useGSAP } from "./gsap";

// Runs `setup` once the element mounts, but only while motion is allowed.
// Everything GSAP creates inside (tweens, ScrollTriggers, SplitText) is
// reverted on unmount or when the user switches reduced motion on, like a
// SwiftUI .task that is cancelled when its view disappears.
export function useScrollMotion<T extends HTMLElement>(
  setup: (element: T) => void,
) {
  const ref = useRef<T>(null);

  useGSAP(
    () => {
      const element = ref.current;
      if (!element) return;
      gsap.matchMedia().add(MOTION_OK, () => setup(element));
    },
    { scope: ref },
  );

  return ref;
}
