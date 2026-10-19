"use client";

import { useEffect, useRef } from "react";
import { startField } from "./field";

export default function FieldCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  // Like a UIView that owns a CADisplayLink: start on mount, tear down on
  // unmount. All the frame logic lives in field.ts.
  useEffect(() => {
    if (!ref.current) return;
    return startField(ref.current);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-state="loading"
      className="absolute inset-0 size-full transition-opacity duration-1500 ease-out data-[state=loading]:opacity-0 data-[state=unsupported]:hidden"
    />
  );
}
