import type { WorkoutSession } from "./session";
import { TEMPLATES, templateForWeekday, type WorkoutTemplate } from "./templates";

export function templateForId(id: string): WorkoutTemplate | null {
  return TEMPLATES.find((template) => template.id === id) ?? null;
}

export function templateForActiveSession(
  session: Pick<WorkoutSession, "templateId"> | null,
  today: Date,
): WorkoutTemplate | null {
  return session
    ? templateForId(session.templateId)
    : templateForWeekday(today.getDay());
}

export function templateForRecovery(
  session: Pick<WorkoutSession, "templateId"> | null,
  today: Date,
  plannedTemplate: WorkoutTemplate | null,
): WorkoutTemplate | null {
  return session ? templateForActiveSession(session, today) : plannedTemplate;
}
