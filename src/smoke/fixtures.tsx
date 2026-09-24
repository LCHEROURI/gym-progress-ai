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
const exercises: ExerciseSession[] = MONDAY.exercises.map((t) =>
  buildExerciseSession({
    template: MONDAY,
    order: t.order,
    previousWeight: t.key === "leg-press" ? 70 : null,
    weightUnit: "lb",
    now,
  }),
);

export const fixtures: Record<SmokeScreen, () => ReactElement> = {
  today: () => (
    <TodayScreen
      today={new Date("2026-09-24T09:00:00")}
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
    <TodayScreen today={new Date("2026-09-28T09:00:00")} onStart={() => undefined} />
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
      onPatchExercise={() => undefined}
      onPatchSession={() => undefined}
      onLogSet={() => undefined}
      onFinish={() => undefined}
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
