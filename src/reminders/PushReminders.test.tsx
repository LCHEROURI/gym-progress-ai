// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enablePushReminders: vi.fn(
    async (): Promise<"on" | "denied" | "unsupported"> => "on",
  ),
  pushSupported: vi.fn(() => true),
}));

vi.mock("./push", () => ({
  enablePushReminders: mocks.enablePushReminders,
  pushSupported: mocks.pushSupported,
}));

import PushReminders from "./PushReminders";

const props = { app: {} as never, db: {} as never, uid: "u1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pushSupported.mockReturnValue(true);
  mocks.enablePushReminders.mockResolvedValue("on");
  vi.stubGlobal("Notification", { permission: "default" });
});
afterEach(() => vi.unstubAllGlobals());

describe("PushReminders", () => {
  it("offers to enable reminders on a fresh device", () => {
    render(<PushReminders {...props} />);
    expect(
      screen.getByRole("button", { name: "ENABLE PUSH REMINDERS" }),
    ).toBeEnabled();
  });

  it("confirms once the device is armed", async () => {
    render(<PushReminders {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "ENABLE PUSH REMINDERS" }));
    await waitFor(() => {
      expect(
        screen.getByText("Push reminders are ON for this device."),
      ).toBeInTheDocument();
    });
  });

  it("explains a blocked permission honestly", async () => {
    mocks.enablePushReminders.mockResolvedValue("denied");
    render(<PushReminders {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "ENABLE PUSH REMINDERS" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Allow notifications/);
    });
  });

  it("surfaces configuration errors instead of failing silently", async () => {
    mocks.enablePushReminders.mockRejectedValue(
      new Error("Push key missing — set VITE_FCM_VAPID_KEY and rebuild."),
    );
    render(<PushReminders {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "ENABLE PUSH REMINDERS" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/VITE_FCM_VAPID_KEY/);
    });
    expect(
      screen.getByRole("button", { name: "ENABLE PUSH REMINDERS" }),
    ).toBeEnabled();
  });

  it("re-registers on mount for already-armed devices", async () => {
    vi.stubGlobal("Notification", { permission: "granted" });
    render(<PushReminders {...props} />);
    await waitFor(() => {
      expect(mocks.enablePushReminders).toHaveBeenCalledOnce();
    });
  });
});
