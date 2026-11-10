import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { HERO_TITLE } from "@/components/hero/copy";
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
