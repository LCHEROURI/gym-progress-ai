import type { TemplateExercise, WorkoutTemplate } from "./templates";
import type { Profile } from "../data/settings";

export function isStretchOrCooldown(e: TemplateExercise): boolean {
  return (
    e.kind === "stretch" ||
    /\b(stretch|cool[-_ ]?down)\b/i.test(e.key) ||
    /\b(stretch|cool[-_ ]?down)\b/i.test(e.name)
  );
}

/**
 * Returns the template's exercises plus the user's extra exercises appended at
 * the end, ordered before any trailing stretch/cool-down, with order numbers
 * continuing the sequence.
 *
 * If the profile has no extra exercises, the template's exercises array is
 * returned unchanged (preserving reference equality).
 */
export function buildEffectiveExercises(
  template: WorkoutTemplate,
  profile?: Pick<Profile, "extraExercises"> | null,
): TemplateExercise[] {
  const extras = profile?.extraExercises;
  if (!extras || extras.length === 0) {
    return template.exercises;
  }

  // Find where trailing stretch / cool-down exercises start
  let trailingIndex = template.exercises.length;
  while (trailingIndex > 0 && isStretchOrCooldown(template.exercises[trailingIndex - 1]!)) {
    trailingIndex--;
  }

  const head = template.exercises.slice(0, trailingIndex);
  const tail = template.exercises.slice(trailingIndex);

  const seenKeys = new Set<string>([
    ...head.map((e) => e.key),
    ...tail.map((e) => e.key),
  ]);

  const customExercises: TemplateExercise[] = extras.map((extra) => {
    let key = extra.key;
    if (seenKeys.has(key)) {
      let counter = 2;
      while (seenKeys.has(`${key}-${counter}`)) {
        counter++;
      }
      key = `${key}-${counter}`;
    }
    seenKeys.add(key);

    return {
      key,
      name: extra.name,
      order: 0,
      kind: "resistance" as const,
      targetSets: extra.targetSets,
      targetRepsMin: extra.targetRepsMin,
      targetRepsMax: extra.targetRepsMax,
      durationMinutes: null,
      tip: extra.tip ?? "",
    };
  });

  const combined = [...head, ...customExercises, ...tail];
  return combined.map((ex, index) => ({
    ...ex,
    order: index + 1,
  }));
}

/**
 * Returns a WorkoutTemplate with effective exercises applied. If no extra
 * exercises are defined, the original template is returned unchanged.
 */
export function buildEffectiveTemplate(
  template: WorkoutTemplate,
  profile?: Pick<Profile, "extraExercises"> | null,
): WorkoutTemplate {
  const exercises = buildEffectiveExercises(template, profile);
  return exercises === template.exercises ? template : { ...template, exercises };
}
