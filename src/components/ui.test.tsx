import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { Tabs } from "./ui";

function ExampleTabs() {
  const [value, setValue] = useState("profile");
  return <Tabs tabs={[{ id: "profile", label: "Profile" }, { id: "answers", label: "Answers" }, { id: "stories", label: "Stories" }]} value={value} onChange={setValue} />;
}

it("moves focus and selection with arrow keys, Home, and End", async () => {
  const user = userEvent.setup();
  render(<ExampleTabs />);
  await user.tab();
  expect(screen.getByRole("tab", { name: "Profile" })).toHaveFocus();
  await user.keyboard("{ArrowLeft}");
  expect(screen.getByRole("tab", { name: "Stories" })).toHaveFocus();
  expect(screen.getByRole("tab", { name: "Stories" })).toHaveAttribute("aria-selected", "true");
  await user.keyboard("{Home}{ArrowRight}");
  expect(screen.getByRole("tab", { name: "Answers" })).toHaveFocus();
  await user.keyboard("{End}");
  expect(screen.getByRole("tab", { name: "Stories" })).toHaveAttribute("tabindex", "0");
  expect(screen.getByRole("tab", { name: "Profile" })).toHaveAttribute("tabindex", "-1");
});
