import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { siteConfig } from "@/lib/site";
import Page from "./page";

test("home page renders the owner's name as the main heading", () => {
  render(<Page />);
  expect(screen.getByRole("main")).toBeDefined();
  expect(
    screen.getByRole("heading", { level: 1, name: siteConfig.name }),
  ).toBeDefined();
});
