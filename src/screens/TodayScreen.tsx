import { templateForWeekday, type WorkoutTemplate } from "../domain/templates";
import type { RecoveryInfo } from "../today/recovery";

interface Props {
  today: Date;
  onStart?: () => void;
  recovery?: RecoveryInfo;
}

export default function TodayScreen({ today, onStart, recovery }: Props) {
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
      {template ? (
        <WorkoutPlan template={template} onStart={onStart} />
      ) : (
        <RecoveryDay info={recovery} />
      )}
    </section>
  );
}

function WorkoutPlan({
  template,
  onStart,
}: {
  template: WorkoutTemplate;
  onStart?: () => void;
}) {
  return (
    <>
      <h2 className="workoutName">{template.name.toUpperCase()}</h2>
      <p className="progressLine">0 of {template.exercises.length} complete</p>
      <button type="button" className="primaryButton" onClick={onStart}>
        START WORKOUT
      </button>
      <ul className="cardList">
        {template.exercises.map((e) => (
          <li key={e.key} className="exerciseCard">
            <span className="exerciseName">{e.name}</span>
            <span className="exerciseTarget">
              {e.targetSets
                ? `${e.targetSets} × ${e.targetRepsMin}${e.targetRepsMax !== e.targetRepsMin ? `–${e.targetRepsMax}` : ""}`
                : `${e.durationMinutes} min`}
            </span>
          </li>
        ))}
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
