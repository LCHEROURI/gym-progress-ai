import { templateForWeekday, type WorkoutTemplate } from "../domain/templates";
import InstallAppButton from "../install/InstallAppButton";
import IosNudgeBanner from "../install/IosNudgeBanner";
import type { RecoveryInfo } from "../today/recovery";
import type { NextWeight } from "../workout/usePlanPreview";

interface Props {
  today: Date;
  onStart?: () => void;
  recovery?: RecoveryInfo;
  /** Last completed weight per exercise key (from exerciseStats). */
  previousWeights?: Record<string, number | null>;
  /** Deterministic progression preview per resistance exercise. */
  nextWeights?: Record<string, NextWeight | undefined>;
  weightUnit?: "lb" | "kg";
}

export default function TodayScreen({
  today,
  onStart,
  recovery,
  previousWeights,
  nextWeights,
  weightUnit,
}: Props) {
  const template = templateForWeekday(today.getDay());
  const dateLine = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <section aria-label="Today">
      <p className="eyebrow">TODAY</p>
      <p className="dateLine">{dateLine}</p>
      <IosNudgeBanner />
      {template ? (
        <WorkoutPlan
          template={template}
          onStart={onStart}
          previousWeights={previousWeights}
          nextWeights={nextWeights}
          weightUnit={weightUnit}
        />
      ) : (
        <RecoveryDay info={recovery} />
      )}
      <InstallAppButton />
    </section>
  );
}

function WorkoutPlan({
  template,
  onStart,
  previousWeights,
  nextWeights,
  weightUnit,
}: {
  template: WorkoutTemplate;
  onStart?: () => void;
  previousWeights?: Record<string, number | null>;
  nextWeights?: Record<string, NextWeight | undefined>;
  weightUnit?: "lb" | "kg";
}) {
  const unit = (weightUnit ?? "lb").toUpperCase();
  return (
    <>
      <h2 className="workoutName">{template.name.toUpperCase()}</h2>
      <p className="progressLine">0 of {template.exercises.length} complete</p>
      <button type="button" className="primaryButton" onClick={onStart}>
        START WORKOUT
      </button>
      <ul className="cardList">
        {template.exercises.map((e) => {
          const prev = previousWeights?.[e.key] ?? null;
          const next = nextWeights?.[e.key];
          return (
            <li key={e.key} className="exerciseCard">
              <span className="exerciseName">{e.name}</span>
              <span className="exerciseTarget">
                {e.targetSets
                  ? `${e.targetSets} × ${e.targetRepsMin}${e.targetRepsMax !== e.targetRepsMin ? `–${e.targetRepsMax}` : ""}${
                      prev !== null ? ` @ ${prev} ${unit}` : " · NO WEIGHT YET"
                    }`
                  : `${e.durationMinutes} min`}
              </span>
              {next && (
                <p className="nextWeight">
                  {next.suggestedWeight === prev
                    ? `KEEP: ${next.suggestedWeight} ${unit}`
                    : `NEXT: ${next.suggestedWeight} ${unit}`}
                </p>
              )}
              <p className="tip">{e.tip}</p>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function RecoveryDay({ info }: { info?: RecoveryInfo }) {
  return (
    <>
      <h2 className="workoutName">RECOVERY DAY</h2>
      <p className="recoveryCopy">Rest, hydrate, and come back strong.</p>
      {info && (
        <>
          <p className="eyebrow">NEXT WORKOUT</p>
          <p className="dateLine">
            {info.next.weekday} · {info.next.name}
          </p>
          <p className="recoveryCopy">{info.next.dateLabel}</p>

          <p className="eyebrow">LAST COMPLETED</p>
          {info.last ? (
            <>
              <p className="dateLine">
                {info.last.weekday} · {info.last.name}
              </p>
              <p className="recoveryCopy">{info.last.dateLabel}</p>
            </>
          ) : (
            <p className="dateLine">No workouts yet</p>
          )}

          <p className="eyebrow">THIS WEEK</p>
          <p className="dateLine">
            {info.week.completed} of {info.week.planned} complete
          </p>

          {info.tip && (
            <>
              <p className="eyebrow">RECOVERY TIP</p>
              <p className="recoveryCopy">{info.tip}</p>
            </>
          )}
        </>
      )}
    </>
  );
}
