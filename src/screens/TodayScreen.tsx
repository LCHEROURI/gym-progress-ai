import { templateForWeekday, type WorkoutTemplate } from "../domain/templates";

interface Props {
  today: Date;
}

export default function TodayScreen({ today }: Props) {
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
      {template ? <WorkoutPlan template={template} /> : <RecoveryDay />}
    </section>
  );
}

function WorkoutPlan({ template }: { template: WorkoutTemplate }) {
  return (
    <>
      <h2 className="workoutName">{template.name.toUpperCase()}</h2>
      <p className="progressLine">0 of {template.exercises.length} complete</p>
      <button type="button" className="primaryButton">
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

function RecoveryDay() {
  return (
    <>
      <h2 className="workoutName">RECOVERY DAY</h2>
      <p className="recoveryCopy">Rest, hydrate, and come back strong.</p>
    </>
  );
}
