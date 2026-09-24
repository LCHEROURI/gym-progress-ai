// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  initFirebase: vi.fn(() => ({ app: {} as never, db: {} as never })),
  fetchProfile: vi.fn(async () => ({ mocked: true })),
  saveProfile: vi.fn(async () => undefined),
  fetchHistory: vi.fn(async () => []),
  useSyncStatus: vi.fn(() => "saved"),
}));

vi.mock("../data/firebase", () => ({ initFirebase: mocks.initFirebase }));
vi.mock("../data/settings", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchProfile: mocks.fetchProfile,
  saveProfile: mocks.saveProfile,
}));
vi.mock("../data/history", () => ({ fetchHistory: mocks.fetchHistory }));
vi.mock("../data/useSyncStatus", () => ({ useSyncStatus: mocks.useSyncStatus }));
vi.mock("../shared/env", () => ({ parseEnv: () => ({}) }));

import WorkoutFlow from "./WorkoutFlow";
import { defaultProfile } from "../data/settings";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchProfile.mockResolvedValue(defaultProfile() as never);
  window.history.replaceState(null, "", "/");
});

describe("WorkoutFlow ?screen= deep links (dev)", () => {
  it("opens the requested screen directly by URL", async () => {
    window.history.replaceState(null, "", "/?screen=settings");
    render(<WorkoutFlow uid="u1" />);
    expect(
      await screen.findByRole("heading", { name: "SETTINGS" }),
    ).toBeInTheDocument();
  });

  it("keeps the URL in sync while navigating", async () => {
    window.history.replaceState(null, "", "/?screen=settings");
    render(<WorkoutFlow uid="u1" />);
    await screen.findByRole("heading", { name: "SETTINGS" });
    fireEvent.click(screen.getByRole("button", { name: "HISTORY" }));
    expect(window.location.search).toBe("?screen=history");
    expect(screen.getByRole("heading", { name: "HISTORY" })).toBeInTheDocument();
  });

  it("falls back to today for unknown screens", async () => {
    window.history.replaceState(null, "", "/?screen=bogus");
    render(<WorkoutFlow uid="u1" />);
    expect(await screen.findByRole("button", { name: "TODAY" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(window.location.search).toBe("?screen=bogus");
  });
});
