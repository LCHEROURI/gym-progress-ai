import { useEffect, useState } from "react";
import type { Firestore } from "firebase/firestore";
import { initFirebase } from "../data/firebase";
import { fetchProfile, saveProfile, type Profile } from "../data/settings";
import { useSyncStatus } from "../data/useSyncStatus";
import { fetchHistory, type HistoryRow } from "../data/history";
import { fetchSessionFacts } from "../data/progress";
import { isoDate } from "../domain/session";
import { buildRecoveryInfo } from "../today/recovery";
import { parseEnv } from "../shared/env";
import { templateForWeekday, type WorkoutTemplate } from "../domain/templates";
import { buildCompletionSummary } from "../workout/summary";
import { buildCelebration, type Celebration } from "../workout/streak";
import StreakToast from "../workout/StreakToast";
import { useWorkoutSession } from "../workout/useWorkoutSession";
import { usePlanPreview } from "../workout/usePlanPreview";
import { useInstallAnalytics } from "../install/useInstallAnalytics";
import PushReminders from "../reminders/PushReminders";
import BottomNav, { type NavView } from "../nav/BottomNav";
import { viewFromSearch } from "../nav/screenParam";
import CoachScreen from "./CoachScreen";
import CompleteScreen from "./CompleteScreen";
import HistoryScreen from "./HistoryScreen";
import ProgressScreen from "./ProgressScreen";
import ReportsScreen from "./ReportsScreen";
import SettingsScreen from "./SettingsScreen";
import TodayScreen from "./TodayScreen";
import WorkoutScreen from "./WorkoutScreen";

export default function WorkoutFlow({ uid }: { uid: string }) {
  const [today] = useState(() => new Date());
  // Dev-only ?screen= deep link so screens can be opened and tested by URL.
  const [view, setView] = useState<NavView>(
    () =>
      (import.meta.env.DEV
        ? viewFromSearch(
            typeof window === "undefined" ? "" : window.location.search,
          )
        : null) ?? "today",
  );
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const template = templateForWeekday(today.getDay());
  const { app, db } = initFirebase(parseEnv(import.meta.env));
  const syncState = useSyncStatus(db, null);
  useInstallAnalytics(db, uid);

  useEffect(() => {
    let cancelled = false;
    fetchProfile({ db }, uid)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        void 0;
      });
    return () => {
      cancelled = true;
    };
  }, [db, uid]);

  useEffect(() => {
    let cancelled = false;
    fetchHistory({ db }, uid, 20)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [db, uid]);

  const save = (p: Profile) => {
    setProfile(p);
    void saveProfile({ db }, uid, p).catch(() => {
      void 0;
    });
  };

  const navigate = (v: NavView) => {
    if (import.meta.env.DEV && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("screen", v);
      window.history.replaceState(null, "", url.toString());
    }
    setView(v);
  };

  const cls = profile && !profile.largeTextEnabled ? "smallText" : "";
  const nav = <BottomNav view={view} onNavigate={navigate} />;

  if (view === "settings") {
    return (
      <div className={cls}>
        {profile ? (
          <SettingsScreen profile={profile} onSave={save} />
        ) : (
          <p>Loading…</p>
        )}
        <PushReminders app={app} db={db} uid={uid} />
        {nav}
      </div>
    );
  }
  if (view === "history") {
    return (
      <div className={cls}>
        <HistoryScreen db={db} uid={uid} />
        {nav}
      </div>
    );
  }
  if (view === "progress") {
    return (
      <div className={cls}>
        <ProgressScreen db={db} uid={uid} />
        {nav}
      </div>
    );
  }
  if (view === "coach") {
    return (
      <div className={cls}>
        <CoachScreen db={db} uid={uid} app={app} />
        {nav}
      </div>
    );
  }
  if (view === "reports") {
    return (
      <div className={cls}>
        <ReportsScreen db={db} uid={uid} app={app} />
        {nav}
      </div>
    );
  }
  if (!template) {
    const info = rows ? buildRecoveryInfo(rows, today) : undefined;
    // The recovery tip is the brief's *optional* AI tip — hidden when AI is off.
    const recoveryInfo =
      info && profile?.aiRecommendationsEnabled === false ? { ...info, tip: "" } : info;
    return (
      <div className={cls}>
        <TodayScreen today={today} recovery={recoveryInfo} />
        {nav}
      </div>
    );
  }
  return (
    <div className={cls}>
      <ActiveFlow
        uid={uid}
        db={db}
        template={template}
        date={isoDate(today)}
        syncState={syncState}
        profile={profile}
        view={view}
        onNavigate={navigate}
      />
    </div>
  );
}

function ActiveFlow(props: {
  uid: string;
  db: Firestore;
  template: WorkoutTemplate;
  date: string;
  syncState: ReturnType<typeof useSyncStatus>;
  profile: Profile | null;
  view: NavView;
  onNavigate: (v: NavView) => void;
}) {
  const flow = useWorkoutSession({
    db: props.db,
    uid: props.uid,
    template: props.template,
    scheduledDate: props.date,
    coachEnabled: props.profile?.aiRecommendationsEnabled,
    weightUnit: props.profile?.weightUnit,
  });
  const planPreview = usePlanPreview({
    db: props.db,
    uid: props.uid,
    template: props.template,
    coachEnabled: props.profile?.aiRecommendationsEnabled,
    machineIncrements: props.profile?.machineIncrements,
  });

  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const completedDate = props.date;

  // Fresh facts at completion so the streak is right even in a long-lived tab.
  useEffect(() => {
    if (flow.phase !== "complete") return;
    let cancelled = false;
    fetchSessionFacts({ db: props.db }, props.uid, 60)
      .then((facts) => {
        if (cancelled) return;
        const dates = facts
          .filter((f) => f.status === "completed")
          .map((f) => f.scheduledDate);
        dates.push(completedDate); // the session just finished may not be in the fetch yet
        setCelebration(
          buildCelebration({ completedDates: dates, today: new Date() }),
        );
      })
      .catch(() => {
        if (cancelled) return;
        // Offline: never fabricate streak numbers we cannot compute.
        setCelebration({
          title: "WORKOUT SAVED!",
          body: "Your weekly streak will sync when you’re back online.",
          perfectWeek: false,
          streakWeeks: 0,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [flow.phase, props.db, props.uid, completedDate]);

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
        {celebration && <StreakToast celebration={celebration} />}
        <BottomNav view={props.view} onNavigate={props.onNavigate} />
      </>
    );
  }

  if (flow.phase === "today" || !flow.session) {
    return (
      <>
        <TodayScreen
          today={new Date()}
          onStart={() => void flow.start()}
          previousWeights={planPreview.previousWeights}
          nextWeights={planPreview.nextWeights}
          weightUnit={props.profile?.weightUnit}
        />
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
      restSeconds={props.profile?.defaultRestSeconds}
      increments={props.profile?.machineIncrements}
      onPatchExercise={(key, patch) => void flow.patchExercise(key, patch)}
      onPatchSession={(patch) => void flow.patchSession(patch)}
      onLogSet={(key, set) => void flow.logSet(key, set)}
      onFinish={() => void flow.complete()}
      recommendations={flow.recommendations}
      onDecide={(key, decision) => void flow.decide(key, decision)}
    />
  );
}
