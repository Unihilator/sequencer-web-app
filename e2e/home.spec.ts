import { expect, test } from "@playwright/test";

test("home page renders with metadata", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Roman Derkach/);
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  await expect(
    page.getByRole("heading", { level: 1, name: "Звук, який можна побачити" }),
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

  test("stirs the velocity texture without WebGL errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/");
    await expect(canvas(page)).toHaveAttribute("data-motion", "fluid");
    await expect(canvas(page)).toHaveAttribute("data-state", "running");
    // A real mouse reports every ~8 ms. Playwright's mouse.move waits for
    // each event to be handled, and with software WebGL in headless browsers
    // a frame can take over 150 ms, which the field reads as a pause between
    // two gestures. So the stroke is dispatched within one task, 16 ms apart.
    await canvas(page).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      for (let i = 0; i <= 12; i++) {
        const start = performance.now();
        while (performance.now() - start < 16) {
          // Hold the main thread so event timestamps are evenly spaced.
        }
        window.dispatchEvent(
          new PointerEvent("pointermove", {
            pointerId: 1,
            pointerType: "mouse",
            clientX: rect.left + rect.width * (0.3 + i * 0.025),
            clientY: rect.top + rect.height * (0.3 + i * 0.01),
          }),
        );
      }
    });
    await expect
      .poll(() =>
        canvas(page).evaluate((element) => {
          const gl = (element as HTMLCanvasElement).getContext("webgl2")!;
          // The field's texture unit 0 holds the current fluid velocity.
          gl.activeTexture(gl.TEXTURE0);
          const texture = gl.getParameter(
            gl.TEXTURE_BINDING_2D,
          ) as WebGLTexture;
          const framebuffer = gl.createFramebuffer();
          gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
          gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            texture,
            0,
          );
          // Scan the whole 160-row simulation grid: the swirl drifts away
          // from the stroke as the fluid advects it.
          const height = 160;
          const width = Math.round(
            (height * (element as HTMLCanvasElement).width) /
              (element as HTMLCanvasElement).height,
          );
          const pixels = new Float32Array(width * height * 4);
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, pixels);
          let speed = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            speed = Math.max(speed, Math.hypot(pixels[i], pixels[i + 1]));
          }
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.deleteFramebuffer(framebuffer);
          if (gl.getError() !== gl.NO_ERROR)
            throw new Error("Fluid readback failed");
          return speed;
        }),
      )
      .toBeGreaterThan(0.1);
    await expect(canvas(page)).toHaveAttribute("data-state", "running");
    expect(errors).toEqual([]);
  });

  test("restores the fluid after losing the GPU context", async ({ page }) => {
    await page.goto("/");
    await expect(canvas(page)).toHaveAttribute("data-motion", "fluid");
    const extension = await canvas(page).evaluateHandle((element) =>
      (element as HTMLCanvasElement)
        .getContext("webgl2")!
        .getExtension("WEBGL_lose_context")!,
    );
    await extension.evaluate((value) => value.loseContext());
    await expect(canvas(page)).toHaveAttribute("data-state", "loading");
    await extension.evaluate((value) => value.restoreContext());
    await extension.dispose();
    await expect(canvas(page)).toHaveAttribute("data-state", "running");
    await expect(canvas(page)).toHaveAttribute("data-motion", "fluid");
    expect(
      await canvas(page).evaluate((element) =>
        (element as HTMLCanvasElement).getContext("webgl2")!.getError(),
      ),
    ).toBe(0);
  });

  test("recreates motion after reduced motion is switched off", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(canvas(page)).toHaveAttribute("data-motion", "fluid");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(canvas(page)).toHaveAttribute("data-state", "static");
    await expect(canvas(page)).toHaveAttribute("data-motion", "none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(canvas(page)).toHaveAttribute("data-state", "running");
    await expect(canvas(page)).toHaveAttribute("data-motion", "fluid");
  });

  test("keeps the animated field without float render targets", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const original = WebGL2RenderingContext.prototype.getExtension;
      WebGL2RenderingContext.prototype.getExtension = function (name: string) {
        if (
          name === "EXT_color_buffer_float" ||
          name === "EXT_color_buffer_half_float"
        )
          return null;
        return original.call(this, name);
      };
    });
    await page.goto("/");
    await expect(canvas(page)).toHaveAttribute("data-state", "running");
    await expect(canvas(page)).toHaveAttribute("data-motion", "none");
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
      page.getByRole("heading", {
        level: 1,
        name: "Звук, який можна побачити",
      }),
    ).toBeVisible();
  });
});
