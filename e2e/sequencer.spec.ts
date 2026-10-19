import { expect, test } from "@playwright/test";

test.describe("sequencer", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sequencer");
  });

  test("renders server-side content and metadata", async ({ page }) => {
    await expect(
      page.getByRole("heading", { level: 1, name: "Секвенсер" }),
    ).toBeVisible();
    await expect(page).toHaveTitle(/секвенсер.*· Roman Derkach/i);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/sequencer$/,
    );
    await expect(
      page.getByRole("grid", { name: "Сітка кроків" }),
    ).toBeVisible();
  });

  test("toggles steps with mouse and keyboard", async ({ page }) => {
    const kick1 = page.getByRole("button", {
      name: "Kick, крок 1",
      exact: true,
    });
    await kick1.click();
    await expect(kick1).toHaveAttribute("aria-pressed", "true");

    // Arrow keys move the roving focus; Enter toggles.
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("button", { name: "Kick, крок 2", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: "Kick, крок 2", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");

    // Melodic step shows its note and changes pitch with Shift+↑.
    const bass1 = page.getByRole("button", { name: /^Bass, крок 1(,|$)/ });
    await bass1.click();
    await expect(bass1).toHaveText("C1");
    await page.keyboard.press("Shift+ArrowUp");
    await expect(
      page.getByRole("button", { name: /^Bass, крок 1(,|$)/ }),
    ).toHaveText("Eb1");
  });

  test("plays with Space and advances the playhead", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    await page
      .getByRole("button", { name: "Kick, крок 1", exact: true })
      .click();
    await page.keyboard.press("Space");
    const play = page.getByRole("button", { name: "Stop" });
    await expect(play).toHaveAttribute("aria-pressed", "true");

    // The highlighted column moves while playing.
    const current = page.locator("[data-current]").first();
    await expect(current).toBeVisible();
    const first = await current.getAttribute("data-col");
    await expect
      .poll(async () =>
        page.locator("[data-current]").first().getAttribute("data-col"),
      )
      .not.toBe(first);

    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: "Play" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.locator("[data-current]")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe("sharing", () => {
  test("share link restores the pattern", async ({ page, context }) => {
    await page.goto("/sequencer");
    await page
      .getByRole("button", { name: "Kick, крок 1", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Snare, крок 5", exact: true })
      .click();
    await page.getByRole("button", { name: "32", exact: true }).click();
    await page.getByRole("button", { name: "Поділитися" }).click();

    // The address bar now holds the shareable link.
    await expect(page).toHaveURL(/\/sequencer\?p=[A-Za-z0-9_-]+$/);
    const shared = page.url();

    const friend = await context.newPage();
    await friend.goto(shared);
    await expect(
      friend.getByRole("button", { name: "Snare, крок 5", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    // 32 steps: the second bar repeats the first.
    await expect(
      friend.getByRole("button", { name: "Kick, крок 17", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("broken link shows a notice and an empty pattern", async ({ page }) => {
    await page.goto("/sequencer?p=broken");
    await expect(page.getByRole("status")).toContainText("пошкоджене");
    await expect(
      page.getByRole("button", { name: "Kick, крок 1", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});
