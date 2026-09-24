import type { CompletionSummary } from "../workout/summary";

interface Props {
  summary: CompletionSummary;
  onDone: () => void;
}

export default function CompleteScreen({ summary, onDone }: Props) {
  return (
    <section aria-label="Workout complete">
      <h2 className="workoutName">WORKOUT COMPLETE</h2>
      <dl className="summaryList">
        <div>
          <dt>Exercises:</dt>
          <dd>
            {summary.exercisesDone} / {summary.exercisesTotal}
          </dd>
        </div>
        <div>
          <dt>Strength sets:</dt>
          <dd>{summary.strengthSets}</dd>
        </div>
        <div>
          <dt>Cardio:</dt>
          <dd>{summary.cardioMinutes} minutes</dd>
        </div>
        <div>
          <dt>Workout duration:</dt>
          <dd>{summary.durationMinutes} minutes</dd>
        </div>
      </dl>
      <button type="button" className="primaryButton" onClick={onDone}>
        DONE
      </button>
    </section>
  );
}
