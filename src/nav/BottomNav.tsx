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
        ⚙
      </button>
    </nav>
  );
}
