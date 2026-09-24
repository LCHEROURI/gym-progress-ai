// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./auth/useAuthSession", () => ({
  useAuthSession: () => ({
    user: null,
    state: "ready",
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

import App from "./App";

describe("App", () => {
  it("renders the app heading and sign-in for signed-out users", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Gym Progress AI");
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });
});
