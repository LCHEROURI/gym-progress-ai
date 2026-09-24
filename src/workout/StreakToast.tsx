import { useEffect, useState } from "react";
import type { Celebration } from "./streak";

const VISIBLE_MS = 8000;

/** Celebration toast on the WORKOUT COMPLETE screen. Auto-dismisses so it
 * never blocks the DONE button. */
export default function StreakToast({
  celebration,
}: {
  celebration: Celebration;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [celebration]);

  if (!visible) return null;
  return (
    <div className="appToast" role="status">
      <p>{celebration.title}</p>
      <p>{celebration.body}</p>
      <button
        type="button"
        className="secondaryButton"
        onClick={() => setVisible(false)}
      >
        DISMISS
      </button>
    </div>
  );
}
