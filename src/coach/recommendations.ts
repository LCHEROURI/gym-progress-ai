import { doc, setDoc, updateDoc } from "firebase/firestore";
import {
  decisionSchema,
  recommendationSchema,
  type RecommendationDecision,
  type RecommendationRecord,
} from "../domain/recommendation";
import type { RepoCtx } from "../data/session-repository";
import type { Recommendation } from "./progression";

const path = (uid: string, id: string) => `users/${uid}/aiRecommendations/${id}`;

export function newRecommendationId(): string {
  return `r${Date.now().toString(36)}`;
}

/** Every suggestion is recorded as an audit row before it is shown (AI-SAFETY). */
export function buildRecommendationRecord(input: {
  recommendation: Recommendation;
  exerciseKey: string;
  date: string;
  model: string;
  promptVersion: string;
  now?: Date;
}): RecommendationRecord {
  return recommendationSchema.parse({
    exerciseKey: input.exerciseKey,
    date: input.date,
    previousWeight: input.recommendation.previousWeight,
    suggestedWeight: input.recommendation.suggestedWeight,
    reason: input.recommendation.reason,
    accepted: null,
    finalWeightChosen: null,
    model: input.model,
    promptVersion: input.promptVersion,
    contextFacts: input.recommendation.contextFacts,
    blockedBySafety: input.recommendation.blockedBySafety,
    createdAt: input.now ?? new Date(),
  });
}

export async function saveRecommendation(
  ctx: RepoCtx,
  uid: string,
  id: string,
  record: RecommendationRecord,
): Promise<void> {
  const validated = recommendationSchema.parse(record);
  await setDoc(doc(ctx.db, path(uid, id)), validated as unknown as Record<string, unknown>);
}

/** The user's verdict: only accepted/finalWeightChosen change (rules enforce it). */
export async function recordDecision(
  ctx: RepoCtx,
  uid: string,
  id: string,
  decision: RecommendationDecision,
): Promise<void> {
  const validated = decisionSchema.parse(decision);
  await updateDoc(doc(ctx.db, path(uid, id)), validated as unknown as Record<string, unknown>);
}
