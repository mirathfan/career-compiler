import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { JobNoteComposer } from "./JobNoteComposer";

it("keeps drafts local, rejects invalid text, discards and retains exact text after failure", async () => {
  const propose = vi.fn().mockRejectedValueOnce(new Error("Interrupted" )).mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<JobNoteComposer targetLabel="Example · Engineer" disabled={false} pendingNote={false} onPropose={propose}/>);
  await user.click(screen.getByRole("button", {name: "Propose a private note"}));
  const input = screen.getByRole("textbox", {name: "Replacement private note"});
  const prepare = screen.getByRole("button", {name: "Prepare note review"});
  expect(prepare).toBeDisabled();
  fireEvent.change(input, {target: {value: "x".repeat(4001)}});
  expect(prepare).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("Shorten");
  fireEvent.change(input, {target: {value: "  Exact note\nsecond line  "}});
  expect(propose).not.toHaveBeenCalled();
  await user.click(prepare);
  expect(await screen.findByRole("alert")).toHaveTextContent("draft is retained");
  expect(input).toHaveValue("  Exact note\nsecond line  ");
  await user.click(prepare);
  await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
  expect(propose).toHaveBeenLastCalledWith("  Exact note\nsecond line  ");
  await user.click(screen.getByRole("button", {name: "Propose a private note"}));
  expect(screen.getByRole("textbox")).toHaveValue("");
  await user.type(screen.getByRole("textbox"), "Unsubmitted draft");
  await user.click(screen.getByRole("button", {name: "Discard note draft"}));
  expect(propose).toHaveBeenCalledTimes(2);
});

it("suppresses repeated requests while preparing review", async () => {
  let finish!: () => void;
  const propose = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  render(<JobNoteComposer targetLabel="Example" disabled={false} pendingNote={false} onPropose={propose}/>);
  fireEvent.click(screen.getByRole("button", {name: "Propose a private note"}));
  fireEvent.change(screen.getByRole("textbox"), {target: {value: "Note"}});
  const button = screen.getByRole("button", {name: "Prepare note review"});
  fireEvent.click(button); fireEvent.click(button);
  expect(propose).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", {name: "Discard note draft"})).toBeDisabled();
  finish();
  await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
});
