import { useState } from "react";

const DISMISS_KEY = "gpa-welcome-dismissed";

/** First visit returns false and remembers; dismissals persist. */
function alreadyDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    // storage unavailable: don't nag on every page
    return true;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // storage unavailable: the card simply returns next visit
  }
}

/**
 * First-run welcome card: a brand-new user learns in seconds what the app
 * does and what to do first. One-time per device (dismissal persists) and it
 * stays away for good once any workout is completed. Rendered only when the
 * parent KNOWS the user is new (`hasCompleted === false`) — so it never greets
 * an established account and never flashes while history is loading.
 */
export default function WelcomeCard({
  hasCompleted,
}: {
  hasCompleted?: boolean;
}) {
  const [dismissed, setDismissed] = useState(alreadyDismissed);
  if (hasCompleted !== false || dismissed) return null;
  return (
    <section className="welcomeCard" aria-label="Welcome">
      <p className="eyebrow">WELCOME TO GYM PROGRESS AI</p>
      <p className="welcomeLine">
        Log the weight and reps on each machine — the app remembers every
        machine and suggests your next weight.
      </p>
      <p className="welcomeLine">
        Three workouts a week (Mon / Wed / Fri). On any other day you can start
        the next workout early.
      </p>
      <p className="welcomeLine">
        First step: tap START A WORKOUT TODAY (or START WORKOUT) — one real set
        is enough to begin.
      </p>
      <button
        type="button"
        className="secondaryButton"
        onClick={() => {
          markDismissed();
          setDismissed(true);
        }}
      >
        GOT IT
      </button>
    </section>
  );
}
