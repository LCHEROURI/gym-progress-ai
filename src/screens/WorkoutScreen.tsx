import { useState } from "react";
import type { ExerciseSession, WorkoutSession, WorkoutSet } from "../domain/session";
import type { WorkoutTemplate } from "../domain/templates";
import RestTimer from "../workout/RestTimer";
import type { SyncState } from "../data/useSyncStatus";

interface Props {
  template: WorkoutTemplate;
  session: WorkoutSession;
  exercises: ExerciseSession[];
  syncState: SyncState;
  error: string | null;
  onPatchExercise: (exerciseKey: string, patch: Partial<ExerciseSession>) => void;
  onPatchSession: (patch: Partial<WorkoutSession>) => void;
  onLogSet: (exerciseKey: string, set: WorkoutSet) => void;
}

const SYNC_LABEL: Record<SyncState, string> = {
  saved: "SAVED",
  syncing: "SYNCING",
  offline: "OFFLINE",
};

export default function WorkoutScreen(props: Props) {
  const [resting, setResting] = useState<string | null>(null);
  const done = props.exercises.filter((e) => e.completed).length;

  return (
    <section aria-label="Active workout">
      <header className="workoutHeader">
        <h2 className="workoutName">{props.template.name.toUpperCase()}</h2>
        <p className="progressLine">
          {done} of {props.exercises.length} complete
        </p>
        <span className={`syncBadge sync-${props.syncState}`} aria-live="polite">
          {SYNC_LABEL[props.syncState]}
        </span>
      </header>
      {props.error && <p role="alert">{props.error}</p>}
      {resting && <RestTimer onSkip={() => setResting(null)} />}
      <ul className="cardList">
        {props.exercises.map((e) => (
          <ExerciseCard
            key={e.exerciseKey}
            exercise={e}
            templateExercise={props.template.exercises.find((t) => t.key === e.exerciseKey)!}
            onPatch={(patch) => props.onPatchExercise(e.exerciseKey, patch)}
            onLogSet={(set) => props.onLogSet(e.exerciseKey, set)}
            onSetLogged={() => setResting(e.exerciseKey)}
          />
        ))}
      </ul>
    </section>
  );
}

function ExerciseCard(props: {
  exercise: ExerciseSession;
  templateExercise: WorkoutTemplate["exercises"][number];
  onPatch: (patch: Partial<ExerciseSession>) => void;
  onLogSet: (set: WorkoutSet) => void;
  onSetLogged: () => void;
}) {
  const { exercise: e, templateExercise: t } = props;
  const isResistance = t.kind === "resistance";

  return (
    <li className="exerciseCard">
      <div className="cardTop">
        <span className="exerciseName">{t.name}</span>
        <span className="exerciseTarget">
          {t.targetSets
            ? `${t.targetSets} × ${t.targetRepsMin}${t.targetRepsMax !== t.targetRepsMin ? `–${t.targetRepsMax}` : ""}`
            : `${t.durationMinutes} min`}
        </span>
      </div>
      <p className="tip">{t.tip}</p>
      {isResistance && (
        <>
          <p className="lastTime">
            LAST: {e.previousWeight !== null ? `${e.previousWeight} LB` : "—"}
          </p>
          <div className="weightRow" role="group" aria-label="Today's weight">
            <button
              type="button"
              aria-label="Decrease weight"
              onClick={() => props.onPatch({ weightUsed: Math.max(0, (e.weightUsed ?? 0) - 5) })}
            >
              −
            </button>
            <input
              type="number"
              inputMode="numeric"
              aria-label="Today's weight in pounds"
              value={e.weightUsed ?? 0}
              onChange={(ev) =>
                props.onPatch({
                  weightUsed: Math.min(2000, Math.max(0, Number(ev.target.value) || 0)),
                })
              }
            />
            <span aria-hidden="true">LB</span>
            <button
              type="button"
              aria-label="Increase weight"
              onClick={() => props.onPatch({ weightUsed: Math.min(2000, (e.weightUsed ?? 0) + 5) })}
            >
              +
            </button>
          </div>
          {Array.from({ length: e.targetSets ?? 0 }, (_, i) => (
            <label key={i} className="setRow">
              SET {i + 1}
              <input
                type="number"
                inputMode="numeric"
                aria-label={`Set ${i + 1} reps`}
                onChange={(ev) => {
                  props.onLogSet({
                    setNumber: i + 1,
                    weight: e.weightUsed ?? 0,
                    reps: Number(ev.target.value) || 0,
                    completed: true,
                    createdAt: new Date(),
                  });
                  props.onSetLogged();
                }}
              />
              reps
            </label>
          ))}
        </>
      )}
      <div className="feelRow" role="group" aria-label="How did it feel?">
        {(["easy", "good", "hard"] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={e.difficulty === d}
            onClick={() => props.onPatch({ difficulty: d })}
          >
            {d.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="feelRow" role="group" aria-label="Pain or discomfort?">
        {(["none", "mild", "stopped"] as const).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={e.painStatus === p}
            onClick={() => props.onPatch({ painStatus: p })}
          >
            {p.toUpperCase()}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="primaryButton"
        aria-pressed={e.completed}
        onClick={() => props.onPatch({ completed: !e.completed })}
      >
        {e.completed ? "COMPLETED ✓" : "COMPLETE EXERCISE"}
      </button>
    </li>
  );
}
