import type { ReactElement } from "react";

export type NavView =
  | "today"
  | "history"
  | "progress"
  | "coach"
  | "reports"
  | "settings";

const TABS: [NavView, string][] = [
  ["today", "TODAY"],
  ["history", "HISTORY"],
  ["progress", "PROGRESS"],
  ["coach", "AI COACH"],
  ["reports", "REPORTS"],
];

/* Stroke icon set (24px, currentColor — the active tab recolors them via the
   button). Decorative: the visible label carries each button's name, so the
   SVGs stay out of the accessibility tree and test queries. */
const ICONS: Record<NavView, ReactElement> = {
  today: (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M6 10.5V20h12v-9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  ),
  history: (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  progress: (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 20V11M12 20V4M19 20V15" />
    </svg>
  ),
  coach: (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5.5h16v10.5H9.5L4 20z" />
    </svg>
  ),
  reports: (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 3.5h7l4 4V20.5H7z" />
      <path d="M14 3.5v4h4M10 12.5h6M10 16h6" />
    </svg>
  ),
  settings: (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2.4M12 18.6V21M21 12h-2.4M5.4 12H3M18.36 5.64l-1.7 1.7M7.34 16.66l-1.7 1.7M18.36 18.36l-1.7-1.7M7.34 7.34l-1.7-1.7" />
    </svg>
  ),
};

export default function BottomNav({
  view,
  onNavigate,
}: {
  view: NavView;
  onNavigate: (v: NavView) => void;
}) {
  return (
    <nav className="bottomNav" aria-label="Main">
      {TABS.map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-current={view === v ? "page" : undefined}
          onClick={() => onNavigate(v)}
        >
          {ICONS[v]}
          {label}
        </button>
      ))}
      <button
        type="button"
        className="gearButton"
        aria-label="Settings"
        aria-current={view === "settings" ? "page" : undefined}
        onClick={() => onNavigate("settings")}
      >
        {ICONS.settings}
      </button>
    </nav>
  );
}
