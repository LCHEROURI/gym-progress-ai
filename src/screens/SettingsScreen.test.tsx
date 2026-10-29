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

  it("offers one-tap suggestions when empty and saves them", () => {
    const onSave = vi.fn();
    render(<SettingsScreen profile={defaultProfile()} onSave={onSave} />);
    const bicepBtn = screen.getByRole("button", { name: "+ Biceps Curl (2 × 10)" });
    fireEvent.click(bicepBtn);
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0][0].extraExercises).toEqual([
      {
        key: "custom-biceps-curl",
        name: "Biceps Curl",
        targetSets: 2,
        targetRepsMin: 10,
        targetRepsMax: 10,
        tip: "",
      },
    ]);
  });

  it("adds custom exercises via the add form and removes them", () => {
    const onSave = vi.fn();
    const profileWithOne = {
      ...defaultProfile(),
      extraExercises: [
        {
          key: "custom-biceps-curl",
          name: "Biceps Curl",
          targetSets: 2,
          targetRepsMin: 10,
          targetRepsMax: 10,
          tip: "",
        },
      ],
    };
    render(<SettingsScreen profile={profileWithOne} onSave={onSave} />);

    // Shows existing exercise and remove button
    expect(screen.getByText("Biceps Curl")).toBeInTheDocument();
    const removeBtn = screen.getByRole("button", { name: "Remove Biceps Curl" });
    fireEvent.click(removeBtn);
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0][0].extraExercises).toEqual([]);

    // Add new exercise via form
    fireEvent.change(screen.getByLabelText("New exercise name"), {
      target: { value: "Lateral Raise" },
    });
    fireEvent.change(screen.getByLabelText("New exercise sets"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("New exercise reps"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ADD EXERCISE" }));

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1][0].extraExercises).toEqual([
      {
        key: "custom-biceps-curl",
        name: "Biceps Curl",
        targetSets: 2,
        targetRepsMin: 10,
        targetRepsMax: 10,
        tip: "",
      },
      {
        key: "custom-lateral-raise",
        name: "Lateral Raise",
        targetSets: 3,
        targetRepsMin: 12,
        targetRepsMax: 12,
        tip: "",
      },
    ]);
  });
});
