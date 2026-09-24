// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import InstallStepsDiagram from "./InstallStepsDiagram";
import { INSTALL_COPY } from "./i18n";

const en = INSTALL_COPY.en;

describe("InstallStepsDiagram", () => {
  it("shows one illustrated step per action plus the Safari fallback note", () => {
    render(
      <InstallStepsDiagram slices={en.slices} browser="safari" tail={en.tail} />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(
      screen.getByText("In Safari, tap the Share button,"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("then “Add to Home Screen”,"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("then Add — choose “Web App” if asked."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Don’t see the option? Scroll to Edit Actions and add it."),
    ).toBeInTheDocument();
    expect(screen.getByText(en.tail)).toBeInTheDocument();
  });

  it("shows three steps and no Edit Actions note for Chrome", () => {
    render(
      <InstallStepsDiagram slices={en.slices} browser="chrome" tail={en.tail} />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(
      screen.getByText("In Chrome, tap Share to the right of the address bar,"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Edit Actions/)).toBeNull();
  });

  it("keeps the figures decorative for screen readers", () => {
    render(
      <InstallStepsDiagram slices={en.slices} browser="safari" tail={en.tail} />,
    );
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });
});
