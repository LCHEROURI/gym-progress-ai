import { z } from "zod";

/** The brief: workout reminders Mon/Wed/Fri. JS weekday numbers. */
export const REMINDER_DAYS = { mon: 1, wed: 3, fri: 5 } as const;
export type ReminderDay = keyof typeof REMINDER_DAYS;

const DAY_BY_SHORT: Record<string, ReminderDay | undefined> = {
  Mon: "mon",
  Wed: "wed",
  Fri: "fri",
};

const DAY_NAME: Record<ReminderDay, string> = {
  mon: "Monday",
  wed: "Wednesday",
  fri: "Friday",
};

/** Mirrors the reminderState rules (strict, Admin-SDK-written). */
export const reminderStateSchema = z
  .object({
    tokenId: z.string().min(1).max(128),
    slot: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    sentAt: z.date(),
  })
  .strict();

export interface DueSlot {
  dayKey: ReminderDay;
  time: string;
  slot: string;
}

/**
 * Wall-clock parts of `now` in `timeZone`. Intl is the only correct way to
 * read local time across DST — every number here is derived, never guessed.
 */
export function localParts(
  now: Date,
  timeZone: string,
): { dayKey: ReminderDay | null; minutes: number; date: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour")) % 24; // some ICU versions emit "24" at midnight
  return {
    dayKey: DAY_BY_SHORT[get("weekday")] ?? null,
    minutes: hour * 60 + Number(get("minute")),
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/**
 * Slots due at `now` (device wall clock). A slot is due inside [t, t + window)
 * — the window is the catch-up tolerance for scheduler runs delayed by jitter;
 * the reminderState guard makes delivery exactly-once per slot.
 */
export function slotsDue(input: {
  reminderTimes: Record<string, string>;
  timeZone: string;
  now: Date;
  windowMinutes?: number;
}): DueSlot[] {
  const windowMin = input.windowMinutes ?? 15;
  const { dayKey, minutes, date } = localParts(input.now, input.timeZone);
  if (!dayKey) return [];
  const time = input.reminderTimes[dayKey];
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return [];
  const [h, m] = time.split(":").map(Number);
  const elapsed = minutes - (h * 60 + m);
  if (elapsed < 0 || elapsed >= windowMin) return [];
  return [{ dayKey, time, slot: `${date}T${time}` }];
}

/** Exactly-once guard: the slot key is day + set time, per device. */
export function alreadySent(
  lastSlot: string | null | undefined,
  slot: string,
): boolean {
  return lastSlot === slot;
}

/** Deterministic reminder copy — no AI in a nudge. */
export function buildReminderMessage(dayKey: ReminderDay): {
  title: string;
  body: string;
} {
  return {
    title: "Gym Progress AI",
    body: `It’s ${DAY_NAME[dayKey]} — workout time. Today’s session is ready when you are.`,
  };
}
