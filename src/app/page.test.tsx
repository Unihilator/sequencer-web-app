import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Page from "./page";

test("home page renders a main landmark", () => {
  render(<Page />);
  expect(screen.getByRole("main")).toBeDefined();
});
