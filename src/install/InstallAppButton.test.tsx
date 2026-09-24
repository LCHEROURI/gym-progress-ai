// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import InstallAppButton from "./InstallAppButton";

function dispatchInstallPrompt() {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = new Event("beforeinstallprompt");
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome: "accepted" }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return prompt;
}

describe("InstallAppButton", () => {
  it("stays hidden until the browser offers installation", () => {
    render(<InstallAppButton />);
    expect(screen.queryByRole("button", { name: "INSTALL APP" })).toBeNull();
  });

  it("appears on beforeinstallprompt and installs in one tap", async () => {
    render(<InstallAppButton />);
    const prompt = dispatchInstallPrompt();
    const button = screen.getByRole("button", { name: "INSTALL APP" });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "INSTALL APP" })).toBeNull();
  });

  it("hides again when the app is installed", () => {
    render(<InstallAppButton />);
    dispatchInstallPrompt();
    expect(screen.getByRole("button", { name: "INSTALL APP" })).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(screen.queryByRole("button", { name: "INSTALL APP" })).toBeNull();
  });
});
