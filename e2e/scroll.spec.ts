import { expect, test } from "@playwright/test";

test.describe("smooth scroll", () => {
  test("is enabled on content pages", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/\blenis\b/);
  });

  test("turns off when navigating to the sequencer", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/\blenis\b/);
    await page.getByRole("link", { name: "Спробувати секвенсер" }).click();
    await expect(page).toHaveURL(/\/sequencer$/);
    await expect(page.locator("html")).not.toHaveClass(/\blenis\b/);
  });

  test("follows reduced motion at runtime", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.locator("html")).not.toHaveClass(/\blenis\b/);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(page.locator("html")).toHaveClass(/\blenis\b/);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator("html")).not.toHaveClass(/\blenis\b/);
  });
});
