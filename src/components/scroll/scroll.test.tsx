import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Parallax } from "./Parallax";
import { Reveal } from "./Reveal";
import { SplitReveal } from "./SplitReveal";

test("scroll primitives render their content as is", () => {
  render(
    <>
      <SplitReveal as="h3">Line by line</SplitReveal>
      <Reveal>
        <a href="/sequencer">Open</a>
      </Reveal>
      <Parallax>
        <p>Layer</p>
      </Parallax>
    </>,
  );
  expect(
    screen.getByRole("heading", { level: 3, name: "Line by line" }),
  ).toBeDefined();
  expect(screen.getByRole("link", { name: "Open" })).toBeDefined();
  expect(screen.getByText("Layer")).toBeDefined();
});
