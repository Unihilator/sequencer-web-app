"use client";

import dynamic from "next/dynamic";

// The WebGL field is client-only and lazy: the server sends a CSS gradient
// in the same colors, so the first paint is instant and LCP stays on the text.
const FieldCanvas = dynamic(() => import("./FieldCanvas"), { ssr: false });

// A still approximation of the field, shown before (or instead of) WebGL.
const FALLBACK_GRADIENT = [
  "radial-gradient(ellipse at 35% 45%, color-mix(in srgb, var(--accent) 35%, transparent), transparent 60%)",
  "radial-gradient(ellipse at 70% 65%, color-mix(in srgb, var(--accent-soft) 12%, transparent), transparent 55%)",
].join(", ");

export function HeroBackground() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 -z-10"
      style={{ background: FALLBACK_GRADIENT }}
    >
      <FieldCanvas />
      {/* Keeps the text at the bottom readable over the brightest areas. */}
      <div className="absolute inset-0 bg-linear-to-t from-background via-background/50 via-35% to-transparent to-70%" />
    </div>
  );
}
