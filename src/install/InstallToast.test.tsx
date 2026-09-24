// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InstallToast from "./InstallToast";

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("InstallToast", () => {
  it("stays hidden until the app is installed", () => {
    render(<InstallToast />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("thanks the user on appinstalled, then auto-dismisses", () => {
    vi.useFakeTimers();
    render(<InstallToast />);
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      /Thanks for installing Gym Progress AI!/,
    );
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("thanks once on the first Home Screen launch (manual iOS install)", () => {
    // iOS Safari never fires `appinstalled`; installed is detected instead.
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { unmount } = render(<InstallToast />);
    expect(screen.getByRole("status")).toHaveTextContent(
      /Thanks for installing Gym Progress AI!/,
    );
    unmount();
    vi.unstubAllGlobals();
    render(<InstallToast />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("can be dismissed manually", () => {
    render(<InstallToast />);
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    fireEvent.click(screen.getByRole("button", { name: "DISMISS" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
