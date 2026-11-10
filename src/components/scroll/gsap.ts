import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

// Register plugins once; every scroll component imports GSAP from here.
gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

// Animations only run when the user has not asked for less motion. Without
// them, content simply sits in place and is visible from the first paint.
export const MOTION_OK = "(prefers-reduced-motion: no-preference)";

export { gsap, ScrollTrigger, SplitText, useGSAP };
