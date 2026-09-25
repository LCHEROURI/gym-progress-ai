import { useState } from "react";
import { useAuthSession } from "../auth/useAuthSession";
import { templateForWeekday } from "../domain/templates";
import IosNudgeBanner from "../install/IosNudgeBanner";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function todayWorkout() {
  const weekdayIndex = new Date().getDay();
  const template = templateForWeekday(weekdayIndex);
  return {
    weekday: WEEKDAYS[weekdayIndex] ?? "Today",
    template,
    nextWorkout: weekdayForNextWorkout(weekdayIndex),
  };
}

export default function LoginPage() {
  const { signIn } = useAuthSession();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { weekday, template, nextWorkout } = todayWorkout();
  const exercises = template?.exercises ?? [];
  const previewExercises = exercises.slice(0, 4);

  const onClick = () => {
    setBusy(true);
    setMessage(null);
    void signIn()
      .catch((e: unknown) =>
        setMessage(e instanceof Error ? e.message : "Could not sign in. Please try again."),
      )
      .finally(() => setBusy(false));
  };

  return (
    <section className="landingPage" aria-label="Sign in">
      <div className="landingIntro">
        <IosNudgeBanner />
        <p className="landingKicker"><span aria-hidden="true" /> YOUR WORKOUT, REMEMBERED</p>
        <h2 className="landingHeadline">A steadier way<br />to get stronger.</h2>
        <p className="landingCopy">
          Your gym routine, saved as you go. Pick up where you left off, see what you lifted last time,
          and choose what feels right today.
        </p>
        <div className="landingActions">
          <button className="landingSignIn" type="button" onClick={onClick} disabled={busy}>
            <GoogleMark />
            <span>{busy ? "Signing in…" : "Continue with Google"}</span>
            <span className="landingArrow" aria-hidden="true">↗</span>
          </button>
          {message && <p className="landingError" role="alert">{message}</p>}
          <p className="landingPrivacy">Private to you. Your training history stays yours.</p>
        </div>
      </div>

      <aside className="trainingSheet" aria-label="Today's workout preview">
        <div className="sheetTopline">
          <span className="sheetBrand"><span aria-hidden="true">G</span> / TRAINING LOG</span>
          <span className="sheetLive"><span aria-hidden="true" /> TODAY</span>
        </div>
        <div className="sheetHeading">
          <p className="sheetDate">
            {weekday.toUpperCase()} · {template ? "YOUR PLAN" : "RECOVERY DAY"}
          </p>
          <h3>{template?.name ?? "Recovery day"}</h3>
          <p>{template ? `${exercises.length} movements · start at your pace` : "Rest is part of the work."}</p>
        </div>
        {template ? (
          <ol className="sheetExerciseList">
            {previewExercises.map((exercise) => (
              <li key={exercise.key}>
                <span className="sheetExerciseName">{exercise.name}</span>
                <span className="sheetExerciseTarget">
                  {exercise.targetSets
                    ? `${exercise.targetSets} × ${exercise.targetRepsMin}${exercise.targetRepsMax !== exercise.targetRepsMin ? `–${exercise.targetRepsMax}` : ""}`
                    : `${exercise.durationMinutes} ${exercise.kind === "balance" ? "rounds" : "min"}`}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="sheetRecovery">
            <span className="sheetRecoveryIcon" aria-hidden="true">↗</span>
            <p>Next session: {nextWorkout}</p>
            <span>You can start early whenever you’re ready.</span>
          </div>
        )}
        <div className="sheetFooter">
          <span>NO PRESSURE</span>
          <span>JUST SHOW UP</span>
        </div>
      </aside>

      <p className="landingFootnote">Made for real routines, real machines, and the days in between.</p>
    </section>
  );
}

function weekdayForNextWorkout(fromWeekday: number): string {
  for (let offset = 1; offset <= 7; offset += 1) {
    const weekday = (fromWeekday + offset) % 7;
    const template = templateForWeekday(weekday);
    if (template) return `${WEEKDAYS[weekday]} · ${template.name}`;
  }
  return "your next training day";
}

function GoogleMark() {
  return (
    <svg className="googleMark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.23c1.89-1.74 2.99-4.3 2.99-7.39Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.38l-3.23-2.53c-.9.6-2.05.96-3.39.96-2.6 0-4.8-1.75-5.59-4.1H3.08v2.61A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.41 13.95a6.02 6.02 0 0 1 0-3.9V7.44H3.08a10 10 0 0 0 0 9.12l3.33-2.61Z" />
      <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.86C16.96 2.98 14.7 2 12 2a10 10 0 0 0-8.92 5.44l3.33 2.61c.8-2.34 2.99-4.1 5.59-4.1Z" />
    </svg>
  );
}
