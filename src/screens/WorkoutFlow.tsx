import { useState } from "react";
import { initFirebase } from "../data/firebase";
import { logSet } from "../data/session-repository";
import { useSyncStatus } from "../data/useSyncStatus";
import { isoDate, type WorkoutSet } from "../domain/session";
import { templateForWeekday, type WorkoutTemplate } from "../domain/templates";
import { useWorkoutSession } from "../workout/useWorkoutSession";
import TodayScreen from "./TodayScreen";
import WorkoutScreen from "./WorkoutScreen";

export default function WorkoutFlow({ uid }: { uid: string }) {
  const [today] = useState(() => new Date());
  const template = templateForWeekday(today.getDay());
  const { db } = initFirebase(parseEnvSafe());
  const syncState = useSyncStatus(db, null);

  if (!template) return <TodayScreen today={today} />;
  return (
    <ActiveFlow
      uid={uid}
      template={template}
      date={isoDate(today)}
      syncState={syncState}
    />
  );
}

function ActiveFlow(props: {
  uid: string;
  template: WorkoutTemplate;
  date: string;
  syncState: ReturnType<typeof useSyncStatus>;
}) {
  const { db } = initFirebase(parseEnvSafe());
  const flow = useWorkoutSession({
    db,
    uid: props.uid,
    template: props.template,
    scheduledDate: props.date,
  });

  if (flow.phase === "today" || !flow.session) {
    return <TodayScreen today={new Date()} onStart={() => void flow.start()} />;
  }
  const sessionId = flow.session.id;
  return (
    <WorkoutScreen
      template={props.template}
      session={flow.session}
      exercises={flow.exercises}
      syncState={props.syncState}
      error={flow.error}
      onPatchExercise={(key, patch) => void flow.patchExercise(key, patch)}
      onPatchSession={(patch) => void flow.patchSession(patch)}
      onLogSet={(key, set: WorkoutSet) => {
        void logSet({ db }, { uid: props.uid, sessionId, exerciseKey: key, set });
      }}
    />
  );
}

import { parseEnv } from "../shared/env";

function parseEnvSafe() {
  return parseEnv(import.meta.env);
}
