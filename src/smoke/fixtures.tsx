import type { ReactElement } from "react";
import type { FirebaseApp } from "firebase/app";
import type { Firestore } from "firebase/firestore";
import { MONDAY } from "../domain/templates";
import {
  buildExerciseSession,
  buildSession,
  type ExerciseSession,
} from "../domain/session";
import { buildRecoveryInfo } from "../today/recovery";
import { defaultProfile } from "../data/settings";
import {
  recommendWeight,
  type ExerciseLoad,
  type Recommendation,
} from "../coach/progression";
import CoachScreen from "../screens/CoachScreen";
import CompleteScreen from "../screens/CompleteScreen";
import HistoryScreen from "../screens/HistoryScreen";
import ProgressScreen from "../screens/ProgressScreen";
import ReportsScreen from "../screens/ReportsScreen";
import SettingsScreen from "../screens/SettingsScreen";
import TodayScreen from "../screens/TodayScreen";
import WorkoutScreen from "../screens/WorkoutScreen";
import PushReminders from "../reminders/PushReminders";
import type { SmokeScreen } from "./screen-names";

// Fixture fakes: the smoke measures layout, not data. Data-fetching screens
// render their honest empty/error states (and all of their chrome); row markup
// is exercised by the fixtures that own it (today-plan, workout, settings).
const fakeDb = {} as Firestore;
const fakeApp = {} as FirebaseApp;

const now = new Date("2026-09-28T09:00:00Z");
const session = buildSession({
  sessionId: "s1",
  uid: "smoke",
  template: MONDAY,
  scheduledDate: "2026-09-28",
  now,
});

// Synthetic last-session weights per machine (fake by design, like the rest of
// the fixture data) so the "@ weight" display renders with and without history.
const PREVIOUS: Record<string, number> = {
  "leg-press": 70,
  "chest-press": 50,
  "seated-row": 60,
  "leg-curl": 40,
};

const exercises: ExerciseSession[] = MONDAY.exercises.map((t) =>
  buildExerciseSession({
    template: MONDAY,
    order: t.order,
    previousWeight: PREVIOUS[t.key] ?? null,
    weightUnit: "lb",
    now,
  }),
);

const fixtureLoad = (
  weight: number,
  repsPerSet: number[],
  difficulty: "easy" | "good" | "hard",
): ExerciseLoad => ({
  weight,
  repsPerSet,
  difficulty,
  painStatus: "none",
  symptoms: { pain: false, dizziness: false, shortnessOfBreath: false },
});

// Suggestions computed by the REAL progression engine over synthetic loads,
// varied so all three actions (increase/keep/decrease) render in the smoke.
const FIXTURE_HISTORIES: Record<string, ExerciseLoad[]> = {
  "leg-press": [fixtureLoad(70, [10, 10], "good")],
  "chest-press": [fixtureLoad(50, [10, 10], "hard")],
  "seated-row": [fixtureLoad(60, [7, 8], "good"), fixtureLoad(60, [8, 7], "good")],
  "leg-curl": [fixtureLoad(40, [10, 10], "easy")],
};

const fixtureRecommendations: Record<
  string,
  { recommendation: Recommendation; reason: string }
> = {};
for (const t of MONDAY.exercises) {
  if (t.kind !== "resistance") continue;
  const recommendation = recommendWeight({
    loads: FIXTURE_HISTORIES[t.key] ?? [],
    targetSets: t.targetSets ?? 1,
    targetRepsMin: t.targetRepsMin ?? 10,
    increment: 5,
  });
  fixtureRecommendations[t.key] = { recommendation, reason: recommendation.reason };
}

const fixtureNextWeights = Object.fromEntries(
  Object.entries(fixtureRecommendations).map(([key, { recommendation: r }]) => [
    key,
    { action: r.action, suggestedWeight: r.suggestedWeight },
  ]),
);

const fixtureIncrements = Object.fromEntries(
  Object.keys(PREVIOUS).map((key) => [key, 5]),
);

export const fixtures: Record<SmokeScreen, () => ReactElement> = {
  today: () => (
    <TodayScreen
      today={new Date("2026-09-24T09:00:00")}
      onStartWorkout={() => undefined}
      onSeeProgress={() => undefined}
      onAskCoach={() => undefined}
      recovery={buildRecoveryInfo(
        [
          {
            scheduledDate: "2026-09-21",
            status: "completed",
            workoutType: "strength_bike",
          },
        ],
        new Date("2026-09-24T12:00:00Z"),
      )}
    />
  ),
  "today-plan": () => (
    <TodayScreen
      today={new Date("2026-09-28T09:00:00")}
      onStart={() => undefined}
      previousWeights={PREVIOUS}
      nextWeights={fixtureNextWeights}
      // Leg-press shows the picked (tapped) suggestion state in the smoke.
      pickedWeights={{
        "leg-press": fixtureNextWeights["leg-press"]!.suggestedWeight,
      }}
      onPickWeight={() => undefined}
      weightUnit="lb"
    />
  ),
  settings: () => (
    <>
      <SettingsScreen profile={defaultProfile()} onSave={() => undefined} />
      <PushReminders app={fakeApp} db={fakeDb} uid="smoke" />
    </>
  ),
  workout: () => (
    <WorkoutScreen
      template={MONDAY}
      session={session}
      exercises={exercises}
      syncState="saved"
      error={null}
      increments={fixtureIncrements}
      recommendations={fixtureRecommendations}
      onPatchExercise={() => undefined}
      onPatchSession={() => undefined}
      onLogSet={() => undefined}
      onFinish={() => undefined}
      onDecide={() => undefined}
    />
  ),
  complete: () => (
    <CompleteScreen
      summary={{
        exercisesDone: 6,
        exercisesTotal: 7,
        strengthSets: 12,
        cardioMinutes: 18,
        durationMinutes: 52,
      }}
      onDone={() => undefined}
    />
  ),
  history: () => <HistoryScreen db={fakeDb} uid="smoke" />,
  progress: () => <ProgressScreen db={fakeDb} uid="smoke" />,
  coach: () => <CoachScreen db={fakeDb} uid="smoke" app={fakeApp} />,
  reports: () => <ReportsScreen db={fakeDb} uid="smoke" app={fakeApp} />,
};
