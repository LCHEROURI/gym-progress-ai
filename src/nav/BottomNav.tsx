export type NavView = "today" | "history" | "progress" | "coach" | "reports";

const LABELS: Record<NavView, string> = {
  today: "TODAY",
  history: "HISTORY",
  progress: "PROGRESS",
  coach: "AI COACH",
  reports: "REPORTS",
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
      {(Object.keys(LABELS) as NavView[]).map((v) => (
        <button
          key={v}
          type="button"
          aria-current={view === v ? "page" : undefined}
          onClick={() => onNavigate(v)}
        >
          {LABELS[v]}
        </button>
      ))}
    </nav>
  );
}
