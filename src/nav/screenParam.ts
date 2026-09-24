import type { NavView } from "./BottomNav";

const SCREENS: readonly string[] = [
  "today",
  "history",
  "progress",
  "coach",
  "reports",
  "settings",
];

/**
 * Dev-only deep links (?screen=history) so screens can be opened and tested by
 * URL. Strict lowercase match; anything missing or unknown returns null and
 * the caller falls back to "today".
 */
export function viewFromSearch(search: string): NavView | null {
  const value = new URLSearchParams(search).get("screen");
  return value !== null && SCREENS.includes(value) ? (value as NavView) : null;
}
