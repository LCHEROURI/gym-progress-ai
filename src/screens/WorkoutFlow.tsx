import { useState } from "react";
import type { Firestore } from "firebase/firestore";
import { initFirebase } from "../data/firebase";
import { useSyncStatus } from "../data/useSyncStatus";
import { isoDate } from "../domain/session";
import { parseEnv } from "../shared/env";
import { templateForWeekday, type WorkoutTemplate } from "../domain/templates";
import { buildCompletionSummary } from "../workout/summary";
import { useWorkoutSession } from "../workout/useWorkoutSession";
import BottomNav, { type NavView } from "../nav/BottomNav";
import CompleteScreen from "./CompleteScreen";
import HistoryScreen from "./HistoryScreen";
import ProgressScreen from "./ProgressScreen";
import ReportsScreen from "./ReportsScreen";
import TodayScreen from "./TodayScreen";
import WorkoutScreen from "./WorkoutScreen";

export default function WorkoutFlow({ uid }: { uid: string }) {
  const [today] = useState(() => new Date());
  const [view, setView] = useState<NavView>("today");
  const template = templateForWeekday(today.getDay());
  const { app, db } = initFirebase(parseEnv(import.meta.env));
  const syncState = useSyncStatus(db, null);

  if (view === "history") {
    return (
      <>
        <HistoryScreen db={db} uid={uid} />
        <BottomNav view={view} onNavigate={setView} />
      </>
    );
  }
  if (view === "progress") {
    return (
      <>
        <ProgressScreen db={db} uid={uid} />
        <BottomNav view={view} onNavigate={setView} />
      </>
    );
  }
  if (view === "reports") {
    return (
      <>
        <ReportsScreen db={db} uid={uid} app={app} />
        <BottomNav view={view} onNavigate={setView} />
      </>
    );
  }
  if (!template) {
    return (
      <>
        <TodayScreen today={today} />
        <BottomNav view={view} onNavigate={setView} />
      </>
    );
  }
  return (
    <ActiveFlow
      uid={uid}
      db={db}
      template={template}
      date={isoDate(today)}
      syncState={syncState}
      view={view}
      onNavigate={setView}
    />
  );
}

function ActiveFlow(props: {
  uid: string;
  db: Firestore;
  template: WorkoutTemplate;
  date: string;
  syncState: ReturnType<typeof useSyncStatus>;
  view: NavView;
  onNavigate: (v: NavView) => void;
}) {
  const flow = useWorkoutSession({
    db: props.db,
    uid: props.uid,
    template: props.template,
    scheduledDate: props.date,
  });

  if (flow.phase === "complete" && flow.session) {
    return (
      <>
        <CompleteScreen
          summary={buildCompletionSummary({
            session: flow.session,
            template: props.template,
            exercises: flow.exercises,
            sets: flow.sets,
          })}
          onDone={() => {
            flow.reset();
            props.onNavigate("today");
          }}
        />
        <BottomNav view={props.view} onNavigate={props.onNavigate} />
      </>
    );
  }

  if (flow.phase === "today" || !flow.session) {
    return (
      <>
        <TodayScreen today={new Date()} onStart={() => void flow.start()} />
        <BottomNav view={props.view} onNavigate={props.onNavigate} />
      </>
    );
  }

  // Mid-workout: no navigation — one screen, one job (PROJECT-SPEC digital clipboard).
  return (
    <WorkoutScreen
      template={props.template}
      session={flow.session}
      exercises={flow.exercises}
      syncState={props.syncState}
      error={flow.error}
      onPatchExercise={(key, patch) => void flow.patchExercise(key, patch)}
      onPatchSession={(patch) => void flow.patchSession(patch)}
      onLogSet={(key, set) => void flow.logSet(key, set)}
      onFinish={() => void flow.complete()}
      recommendations={flow.recommendations}
      onDecide={(key, decision) => void flow.decide(key, decision)}
    />
  );
}
