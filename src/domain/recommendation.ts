import { z } from "zod";

/** Mirrors the aiRecommendations rules exactly (provenance immutable after create). */
export const recommendationSchema = z
  .object({
    exerciseKey: z.string().min(1).max(60),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    previousWeight: z.number().min(0).max(2000).nullable(),
    suggestedWeight: z.number().min(0).max(2000),
    reason: z.string().min(1).max(2000),
    accepted: z.boolean().nullable(),
    finalWeightChosen: z.number().min(0).max(2000).nullable(),
    model: z.string().max(120),
    promptVersion: z.string().max(40),
    contextFacts: z.record(z.unknown()).refine((m) => Object.keys(m).length <= 60, {
      message: "contextFacts may hold at most 60 entries",
    }),
    blockedBySafety: z.boolean(),
    createdAt: z.date(),
  })
  .strict();

export type RecommendationRecord = z.infer<typeof recommendationSchema>;

/** Only these two fields may change after create (rules enforce the same). */
export const decisionSchema = z
  .object({
    accepted: z.boolean().nullable(),
    finalWeightChosen: z.number().min(0).max(2000).nullable(),
  })
  .strict();

export type RecommendationDecision = z.infer<typeof decisionSchema>;
