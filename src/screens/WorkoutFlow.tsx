import { useCallback, useEffect, useState } from "react";
import type { Firestore } from "firebase/firestore";
import { initFirebase, type FirebaseServices } from "../data/firebase";
import { fetchProfile, saveProfile, type Profile } from "../data/settings";
import { useSyncStatus } from "../data/useSyncStatus";
import { fetchHistory, type HistoryRow } from "../data/history";
import { fetchSessionFacts } from "../data/progress";
import { isoDate } from "../domain/session";
import { templateForRecovery } from "../domain/recovery";
import { buildRecoveryInfo, nextWorkout } from "../today/recovery";
import { parseEnv } from "../shared/env";
import { templateForWeekday, type WorkoutTemplate } from "../domain/templates";
import { buildEffectiveTemplate } from "../domain/effectiveTemplate";
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
  const [services, setServices] = useState<FirebaseServices | null>(null);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);

  useInstallAnalytics(services, uid);

  useEffect(() => {
    let cancelled = false;
    void initFirebase(parseEnv(import.meta.env))
      .then((value) => {
        if (!cancelled) setServices(value);
      })
      .catch(() => {
        if (!cancelled) {
          setFirebaseError("Could not connect to your workout data. Check your connection and try again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!services) {
    return <p role={firebaseError ? "alert" : undefined}>{firebaseError ?? "Loading…"}</p>;
  }
  return <LoadedWorkoutFlow uid={uid} services={services} />;
}

function LoadedWorkoutFlow({ uid, services }: { uid: string; services: FirebaseServices }) {
  const { app, db } = services;
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
  // Rest days (Tue/Thu/Sat/Sun) can still work out: the plan picked via
  // START A WORKOUT TODAY takes over the day until the session is done.
  const [offPlan, setOffPlan] = useState<WorkoutTemplate | null>(null);
  const plannedTemplate = templateForWeekday(today.getDay()) ?? offPlan;
  const [recoveredTemplate, setRecoveredTemplate] = useState<WorkoutTemplate | null>(null);
  const template = view === "today" ? recoveredTemplate ?? plannedTemplate : plannedTemplate;
  const syncState = useSyncStatus(db, null);

  const [profileError, setProfileError] = useState<string | null>(null);

  const loadProfile = useCallback(() => {
    setProfileError(null);
    return fetchProfile({ db }, uid)
      .then((p) => {
        setProfile(p);
      })
      .catch(() => {
        setProfileError(
          "Couldn't load your settings — check your connection and try again.",
        );
      });
  }, [db, uid]);

  useEffect(() => {
    let cancelled = false;
    setProfileError(null);
    fetchProfile({ db }, uid)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        if (!cancelled) {
          setProfileError(
            "Couldn't load your settings — check your connection and try again.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [db, uid]);

  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHistory = useCallback(() => {
    setHistoryError(null);
    return fetchHistory({ db }, uid, 20)
      .then((r) => {
        setRows(r);
      })
      .catch(() => {
        setHistoryError(
          "Couldn't load your workout history — check your connection and try again.",
        );
      });
  }, [db, uid]);

  useEffect(() => {
    let cancelled = false;
    setHistoryError(null);
    fetchHistory({ db }, uid, 20)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch(() => {
        if (!cancelled) {
          setHistoryError(
            "Couldn't load your workout history — check your connection and try again.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [db, uid]);

  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async (p: Profile): Promise<void> => {
    setProfile(p);
    setSaveError(null);
    try {
      await saveProfile({ db }, uid, p);
    } catch (err) {
      setSaveError("Couldn't save — check your connection and try again.");
      throw err;
    }
  };

  const navigate = (v: NavView) => {
    if (import.meta.env.DEV && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("screen", v);
      window.history.replaceState(null, "", url.toString());
    }
    setView(v);
  };

  // The welcome card greets KNOWN new users only (never flashes during load).
  const hasCompleted = rows
    ? rows.some((r) => r.status === "completed")
    : undefined;
  const cls = profile && !profile.largeTextEnabled ? "smallText" : "";
  const nav = <BottomNav view={view} onNavigate={navigate} />;
  const historyBanner = historyError ? (
    <div role="alert">
      <p>{historyError}</p>
      <button type="button" onClick={() => void loadHistory()}>
        Retry
      </button>
    </div>
  ) : null;

  if (view === "settings") {
    return (
      <div className={cls}>
        {profile ? (
          <SettingsScreen
            profile={profile}
            onSave={save}
            saveError={saveError}
          />
        ) : profileError ? (
          <div role="alert">
            <p>{profileError}</p>
            <button type="button" onClick={() => void loadProfile()}>
              Retry
            </button>
          </div>
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
        <CoachScreen
          db={db}
          uid={uid}
          app={app}
          profile={profile}
          onSaveProfile={save}
        />
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
        {historyBanner}
        <TodayScreen
          today={today}
          recovery={recoveryInfo}
          hasCompleted={hasCompleted}
          onStartWorkout={() => setOffPlan(nextWorkout(today).template)}
          onSeeProgress={() => navigate("progress")}
          onAskCoach={() => navigate("coach")}
          profile={profile}
        />
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
        onRecoveredTemplate={setRecoveredTemplate}
        date={isoDate(today)}
        syncState={syncState}
        profile={profile}
        view={view}
        onNavigate={navigate}
        hasCompleted={hasCompleted}
        onResetPlan={() => setOffPlan(null)}
        historyBanner={historyBanner}
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
  hasCompleted?: boolean;
  /** Clears an off-plan pick so the rest day comes back after DONE. */
  onResetPlan?: () => void;
  onRecoveredTemplate: (template: WorkoutTemplate | null) => void;
  historyBanner?: React.ReactNode;
}) {
  const flow = useWorkoutSession({
    db: props.db,
    uid: props.uid,
    template: props.template,
    scheduledDate: props.date,
    coachEnabled: props.profile?.aiRecommendationsEnabled,
    weightUnit: props.profile?.weightUnit,
    profile: props.profile,
  });
  const planPreview = usePlanPreview({
    db: props.db,
    uid: props.uid,
    template: props.template,
    coachEnabled: props.profile?.aiRecommendationsEnabled,
    machineIncrements: props.profile?.machineIncrements,
    profile: props.profile,
  });

  const [celebration, setCelebration] = useState<Celebration | null>(null);
  // One-tap pre-fill: suggestion lines on plan cards pick "today's weight",
  // consumed when the workout starts (un-picked exercises keep LAST weight).
  const [pickedWeights, setPickedWeights] = useState<Record<string, number>>({});
  const pickWeight = (exerciseKey: string, weight: number | null) => {
    setPickedWeights((prev) => {
      const next = { ...prev };
      if (weight === null) delete next[exerciseKey];
      else next[exerciseKey] = weight;
      return next;
    });
  };
  const completedDate = props.date;
  const onRecoveredTemplate = props.onRecoveredTemplate;
  const plannedTemplate = props.template;
  const rawRecoveryTemplate =
    templateForRecovery(flow.session, new Date(), plannedTemplate) ?? plannedTemplate;
  const workoutTemplate = buildEffectiveTemplate(rawRecoveryTemplate, props.profile);

  useEffect(() => {
    const raw = flow.session ? templateForRecovery(flow.session, new Date(), plannedTemplate) : null;
    onRecoveredTemplate(raw ? buildEffectiveTemplate(raw, props.profile) : null);
  }, [flow.session, onRecoveredTemplate, plannedTemplate, props.profile]);

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
            template: workoutTemplate,
            exercises: flow.exercises,
            sets: flow.sets,
            profile: props.profile,
          })}
          onDone={() => {
            flow.reset();
            props.onResetPlan?.();
            props.onRecoveredTemplate(null);
            props.onNavigate("today");
          }}
        />
        {celebration && <StreakToast celebration={celebration} />}
        <BottomNav view={props.view} onNavigate={props.onNavigate} />
      </>
    );
  }

  if (flow.phase === "restoring") {
    return (
      <section aria-label="Workout recovery">
        <p role={flow.error ? "alert" : "status"}>
          {flow.error ?? "Checking for an unfinished workout…"}
        </p>
        {flow.error && (
          <button type="button" onClick={() => void flow.retryRestore()}>
            Retry
          </button>
        )}
      </section>
    );
  }

  if (flow.phase === "today" || !flow.session) {
    return (
      <>
        {props.historyBanner}
        <TodayScreen
          today={new Date()}
          plan={props.template}
          hasCompleted={props.hasCompleted}
          onStart={() => void flow.start(pickedWeights)}
          previousWeights={planPreview.previousWeights}
          nextWeights={planPreview.nextWeights}
          pickedWeights={pickedWeights}
          onPickWeight={pickWeight}
          weightUnit={props.profile?.weightUnit}
          profile={props.profile}
        />
        <BottomNav view={props.view} onNavigate={props.onNavigate} />
      </>
    );
  }

  return (
    <>
      <WorkoutScreen
        template={workoutTemplate}
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
      <BottomNav view={props.view} onNavigate={props.onNavigate} />
    </>
  );
}
