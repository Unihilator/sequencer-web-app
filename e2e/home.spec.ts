import { expect, test } from "@playwright/test";

test("home page renders with metadata", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Roman Derkach/);
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  await expect(
    page.getByRole("heading", { level: 1, name: "Roman Derkach" }),
  ).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    // Absolute URL of the site root (Next.js omits the trailing slash).
    /^https?:\/\/[^/]+\/?$/,
  );
  // Shared Open Graph fields from the layout must survive page overrides.
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
    "content",
    "Roman Derkach",
  );
});

test.describe("hero field", () => {
  const canvas = (page: import("@playwright/test").Page) =>
    page.locator("main section canvas");

  test("animates the WebGL field behind the text", async ({ page }) => {
    await page.goto("/");
    await expect(canvas(page)).toHaveAttribute("data-state", "running");
    await expect(canvas(page)).toBeVisible();
  });

  test("shows a single still frame with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(canvas(page)).toHaveAttribute("data-state", "static");
  });

  test("falls back to the CSS gradient without WebGL2", async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...args: unknown[]
      ) {
        if (type === "webgl2") return null;
        return original.call(this, type as "2d", ...(args as []));
      } as typeof original;
    });
    await page.goto("/");
    await expect(canvas(page)).toHaveAttribute("data-state", "unsupported");
    await expect(canvas(page)).toBeHidden();
    await expect(
      page.getByRole("heading", { level: 1, name: "Roman Derkach" }),
    ).toBeVisible();
  });
});
