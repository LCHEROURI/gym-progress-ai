export type NavView = "today" | "history" | "progress" | "reports";

export default function BottomNav({
  view,
  onNavigate,
}: {
  view: NavView;
  onNavigate: (v: NavView) => void;
}) {
  return (
    <nav className="bottomNav" aria-label="Main">
      {(["today", "history", "progress", "reports"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-current={view === v ? "page" : undefined}
          onClick={() => onNavigate(v)}
        >
          {v.toUpperCase()}
        </button>
      ))}
    </nav>
  );
}
