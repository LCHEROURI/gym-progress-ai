import { templateForWeekday, type WorkoutTemplate } from "../domain/templates";
import InstallAppButton from "../install/InstallAppButton";
import IosNudgeBanner from "../install/IosNudgeBanner";
import type { RecoveryInfo } from "../today/recovery";
import type { NextWeight } from "../workout/usePlanPreview";

interface Props {
  today: Date;
  /** Off-plan day (rest-day workout): the plan to show instead of the weekday's. */
  plan?: WorkoutTemplate;
  onStart?: () => void;
  recovery?: RecoveryInfo;
  /** Last completed weight per exercise key (from exerciseStats). */
  previousWeights?: Record<string, number | null>;
  /** Deterministic progression preview per resistance exercise. */
  nextWeights?: Record<string, NextWeight | undefined>;
  /** Pre-picked "today's weight" per exercise key (tapped suggestion line). */
  pickedWeights?: Record<string, number | undefined>;
  /** Tap of a suggestion line: the weight to pick, or null to un-pick. */
  onPickWeight?: (exerciseKey: string, weight: number | null) => void;
  /** Recovery-day actions: start the next workout early, or jump to a tab. */
  onStartWorkout?: () => void;
  onSeeProgress?: () => void;
  onAskCoach?: () => void;
  weightUnit?: "lb" | "kg";
}

export default function TodayScreen({
  today,
  plan,
  onStart,
  recovery,
  previousWeights,
  nextWeights,
  pickedWeights,
  onPickWeight,
  onStartWorkout,
  onSeeProgress,
  onAskCoach,
  weightUnit,
}: Props) {
  const template = plan ?? templateForWeekday(today.getDay());
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
          pickedWeights={pickedWeights}
          onPickWeight={onPickWeight}
          weightUnit={weightUnit}
        />
      ) : (
        <RecoveryDay
          info={recovery}
          onStartWorkout={onStartWorkout}
          onSeeProgress={onSeeProgress}
          onAskCoach={onAskCoach}
        />
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
  pickedWeights,
  onPickWeight,
  weightUnit,
}: {
  template: WorkoutTemplate;
  onStart?: () => void;
  previousWeights?: Record<string, number | null>;
  nextWeights?: Record<string, NextWeight | undefined>;
  pickedWeights?: Record<string, number | undefined>;
  onPickWeight?: (exerciseKey: string, weight: number | null) => void;
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
          const picked =
            next !== undefined &&
            (pickedWeights?.[e.key] ?? null) === next.suggestedWeight;
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
                <button
                  type="button"
                  className="nextWeight"
                  aria-pressed={picked}
                  onClick={() =>
                    onPickWeight?.(e.key, picked ? null : next.suggestedWeight)
                  }
                >
                  {next.suggestedWeight === prev
                    ? `KEEP: ${next.suggestedWeight} ${unit}`
                    : `NEXT: ${next.suggestedWeight} ${unit}`}
                </button>
              )}
              <p className="tip">{e.tip}</p>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function RecoveryDay({
  info,
  onStartWorkout,
  onSeeProgress,
  onAskCoach,
}: {
  info?: RecoveryInfo;
  onStartWorkout?: () => void;
  onSeeProgress?: () => void;
  onAskCoach?: () => void;
}) {
  return (
    <>
      <h2 className="workoutName">RECOVERY DAY</h2>
      <p className="recoveryCopy">Rest, hydrate, and come back strong.</p>
      {/* Lead with actions — a rest day is still a screen you can use. */}
      <button type="button" className="primaryButton" onClick={onStartWorkout}>
        START A WORKOUT TODAY
      </button>
      <div className="ctaRow">
        <button type="button" className="secondaryButton" onClick={onSeeProgress}>
          SEE PROGRESS
        </button>
        <button type="button" className="secondaryButton" onClick={onAskCoach}>
          ASK THE COACH
        </button>
      </div>
      {info && (
        <div className="recoveryGrid">
          <div className="recoveryCard">
            <p className="eyebrow">NEXT WORKOUT</p>
            <p className="dateLine">
              {info.next.weekday} · {info.next.name}
            </p>
            <p className="recoveryCopy">{info.next.dateLabel}</p>
          </div>
          <div className="recoveryCard">
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
          </div>
          <div className="recoveryCard">
            <p className="eyebrow">THIS WEEK</p>
            <p className="dateLine">
              {info.week.completed} of {info.week.planned} complete
            </p>
          </div>
          {info.tip && (
            <div className="recoveryCard">
              <p className="eyebrow">RECOVERY TIP</p>
              <p className="recoveryCopy">{info.tip}</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
