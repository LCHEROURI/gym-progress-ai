import { describe, expect, it } from "vitest";
import { buildSession } from "./session";
import { FRIDAY, MONDAY, WEDNESDAY } from "./templates";
import { templateForActiveSession, templateForRecovery } from "./recovery";

const monday = new Date("2026-09-28T09:00:00");

describe("templateForActiveSession", () => {
  it("uses a recovered session's saved template instead of today's template", () => {
    const session = {
      ...buildSession({
        sessionId: "friday-session",
        uid: "u1",
        template: FRIDAY,
        scheduledDate: "2026-09-25",
      }),
      templateId: "fri-full-body-walk",
    };

    expect(templateForActiveSession(session, monday)).toBe(FRIDAY);
  });

  it("keeps a user-selected off-plan workout when there is no active session", () => {
    expect(templateForRecovery(null, new Date("2026-09-29T09:00:00"), FRIDAY)).toBe(FRIDAY);
  });

  it("uses today's schedule if there is no active session or off-plan pick", () => {
    expect(templateForActiveSession(null, monday)).toBe(MONDAY);
    expect(templateForActiveSession(null, new Date("2026-09-30T09:00:00"))).toBe(WEDNESDAY);
    expect(templateForActiveSession(null, new Date("2026-09-29T09:00:00"))).toBeNull();
    expect(templateForRecovery(null, new Date("2026-09-29T09:00:00"), null)).toBeNull();
  });
});
