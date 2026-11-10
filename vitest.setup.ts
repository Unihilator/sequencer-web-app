import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount rendered components between tests (globals are disabled, so
// Testing Library cannot register this automatically).
afterEach(() => {
  cleanup();
});

// jsdom has no matchMedia. No query ever matches, so scroll animations
// (gated on prefers-reduced-motion: no-preference) stay off in unit tests;
// motion itself is covered by Playwright. Node-environment tests skip it.
if (typeof window !== "undefined") {
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) satisfies MediaQueryList;
}
