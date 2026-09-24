/** Screens the layout smoke renders, one per URL (?screen=). */
export const SMOKE_SCREENS = [
  "today",
  "today-plan",
  "settings",
  "workout",
  "complete",
  "history",
  "progress",
  "coach",
  "reports",
] as const;

export type SmokeScreen = (typeof SMOKE_SCREENS)[number];
