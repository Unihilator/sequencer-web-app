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
    // The dev server compiles /sequencer on first visit, which can be slow.
    await expect(page).toHaveURL(/\/sequencer$/, { timeout: 15_000 });
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

test.describe("scroll scenes", () => {
  const scrollTo = (page: import("@playwright/test").Page, y: number) =>
    page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);

  test("pins the manifesto and lights it word by word", async ({ page }) => {
    await page.goto("/");
    const manifesto = page.getByTestId("manifesto");
    await expect(manifesto.locator(".pin-spacer")).toHaveCount(1);
    const top = await manifesto.evaluate(
      (element) => element.getBoundingClientRect().top + window.scrollY,
    );
    const viewport = page.viewportSize()!.height;
    // Halfway through the pin: the section holds still at the top...
    await scrollTo(page, top + viewport * 0.75);
    await expect
      .poll(() =>
        manifesto
          .locator("[data-pin]")
          .evaluate((element) =>
            Math.round(element.getBoundingClientRect().top),
          ),
      )
      .toBe(0);
    // ...with the first words lit and the last ones still dim.
    const opacity = (index: number) =>
      manifesto
        .locator("[data-words] .word")
        .nth(index)
        .evaluate((word) => Number(getComputedStyle(word).opacity));
    await expect.poll(() => opacity(0)).toBeGreaterThan(0.9);
    expect(await opacity(-1)).toBeLessThan(0.5);
  });

  test("lights the whole teaser pattern by the end of the page", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(".pin-spacer")).toHaveCount(1);
    await scrollTo(page, await page.evaluate(() => document.body.scrollHeight));
    const lastStep = page.locator("[data-on]").last();
    await expect
      .poll(() =>
        lastStep.evaluate((cell) => Number(getComputedStyle(cell).opacity)),
      )
      .toBe(1);
  });

  test("keeps every scene static with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.locator(".pin-spacer")).toHaveCount(0);
    await expect(page.locator("[data-playhead]")).toBeHidden();
    // Text is whole (never split into words) and nothing starts faded.
    await expect(
      page.getByTestId("manifesto").locator("[data-words] .word"),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Відкрити секвенсер" }),
    ).toHaveCSS("opacity", "1");
  });
});
