import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { HERO_TITLE } from "@/components/hero/copy";
import { MANIFESTO, TEASER } from "@/components/home/copy";
import Page from "./page";

test("home page leads with the content, not the owner's name", () => {
  render(<Page />);
  expect(screen.getByRole("main")).toBeDefined();
  expect(
    screen.getByRole("heading", { level: 1, name: HERO_TITLE }),
  ).toBeDefined();
  expect(
    screen.getByRole("link", { name: "Спробувати секвенсер" }),
  ).toBeDefined();
});

test("home page renders every section's text on the server", () => {
  render(<Page />);
  expect(
    screen.getByRole("heading", { level: 2, name: MANIFESTO.eyebrow }),
  ).toBeDefined();
  expect(screen.getByText(MANIFESTO.text)).toBeDefined();
  expect(
    screen.getByRole("heading", { level: 2, name: TEASER.title }),
  ).toBeDefined();
  expect(screen.getByRole("link", { name: TEASER.cta })).toBeDefined();
});
