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
