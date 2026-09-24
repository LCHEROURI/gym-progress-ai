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
          {blocked ? "KEEP CURRENT WEIGHT" : `KEEP ${r.suggestedWeight === r.previousWeight ? r.previousWeight : r.previousWeight} LB`}
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
