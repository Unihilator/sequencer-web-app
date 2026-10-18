import { afterEach, describe, expect, test, vi } from "vitest";

async function loadUrl() {
  vi.resetModules();
  const { siteConfig } = await import("./site");
  return siteConfig.url;
}

describe("siteConfig.url", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("prefers NEXT_PUBLIC_SITE_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.dev");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "app.vercel.app");
    expect(await loadUrl()).toBe("https://example.dev");
  });

  test("falls back to the Vercel production domain", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "app.vercel.app");
    expect(await loadUrl()).toBe("https://app.vercel.app");
  });

  test("defaults to the local dev server", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(await loadUrl()).toBe("http://localhost:3000");
  });
});
