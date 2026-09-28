import type { Recommendation } from "./progression";

interface Props {
  recommendation: Recommendation;
  reason: string;
  onUse: (weight: number) => void;
  onKeep: () => void;
  onChooseOther: () => void;
}

export default function RecommendationCard({
  recommendation: r,
  reason,
  onUse,
  onKeep,
  onChooseOther,
}: Props) {
  const blocked = r.blockedBySafety;
  return (
    <section className="coachCard" aria-label="AI suggestion">
      <p className="aiLabel">AI SUGGESTION</p>
      {blocked ? (
        <p className="safetyMessage" role="alert">
          {reason}
        </p>
      ) : (
        <>
          <p className="suggestedWeight">{r.suggestedWeight} lb</p>
          <p className="whyLabel">WHY?</p>
          <blockquote className="whyText">{reason}</blockquote>
        </>
      )}
      <div className="coachButtons">
        {!blocked && (
          <button type="button" onClick={() => onUse(r.suggestedWeight)}>
            USE {r.suggestedWeight} LB
          </button>
        )}
        <button type="button" onClick={onKeep}>
          {/* previousWeight is null when there is not enough history to judge
              (progression.ts returns that for the insufficient-data case), so
              naming a number is impossible — and the old ternary interpolated
              it anyway, rendering a literal "KEEP null LB" on every new
              account. Fall back to the same wording the blocked case uses. */}
          {blocked || r.previousWeight === null
            ? "KEEP CURRENT WEIGHT"
            : `KEEP ${r.previousWeight} LB`}
        </button>
        {!blocked && (
          <button type="button" onClick={onChooseOther}>
            CHOOSE ANOTHER
          </button>
        )}
      </div>
    </section>
  );
}
