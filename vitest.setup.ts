import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount rendered components between tests (globals are disabled, so
// Testing Library cannot register this automatically).
afterEach(() => {
  cleanup();
});
