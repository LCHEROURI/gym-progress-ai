// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultProfile } from "../data/settings";
import SettingsScreen from "./SettingsScreen";

describe("SettingsScreen", () => {
  it("switches weight unit and reports the save", () => {
    const onSave = vi.fn();
    render(<SettingsScreen profile={defaultProfile()} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "KG" }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0][0]).toMatchObject({ weightUnit: "kg" });
  });

  it("toggles large text and the AI coach", () => {
    const onSave = vi.fn();
    render(<SettingsScreen profile={defaultProfile()} onSave={onSave} />);
    fireEvent.click(screen.getByRole("group", { name: "Large text" }).querySelector('[aria-pressed="true"] + button')!);
    expect(onSave.mock.calls[0][0]).toMatchObject({ largeTextEnabled: false });
    fireEvent.click(screen.getByRole("group", { name: "AI coach suggestions" }).querySelector('[aria-pressed="true"] + button')!);
    expect(onSave.mock.calls[1][0]).toMatchObject({ aiRecommendationsEnabled: false });
  });

  it("sets the rest timer default and reminder times", () => {
    const onSave = vi.fn();
    render(<SettingsScreen profile={defaultProfile()} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "90s" }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ defaultRestSeconds: 90 });
    fireEvent.change(screen.getByLabelText("Monday reminder time"), {
      target: { value: "07:30" },
    });
    expect(onSave.mock.calls[1][0].reminderTimes).toMatchObject({ mon: "07:30" });
  });

  it("edits a machine increment", () => {
    const onSave = vi.fn();
    render(<SettingsScreen profile={defaultProfile()} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Leg Press increment"), {
      target: { value: "7.5" },
    });
    expect(onSave.mock.calls[0][0].machineIncrements).toMatchObject({
      "leg-press": 7.5,
    });
  });
});
