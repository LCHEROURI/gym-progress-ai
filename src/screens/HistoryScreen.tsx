import { useEffect, useState } from "react";
import type { Firestore } from "firebase/firestore";
import { fetchHistory, fetchHistoryDetail, type HistoryDetail, type HistoryRow } from "../data/history";
import type { LoggedSet } from "../workout/summary";
import { TEMPLATES } from "../domain/templates";

function nameForType(workoutType: HistoryRow["workoutType"]): string {
  return TEMPLATES.find((t) => t.workoutType === workoutType)?.name ?? workoutType;
}

function formatRowDate(scheduledDate: string): { stamp: string; weekday: string } {
  const d = new Date(`${scheduledDate}T00:00:00`);
  return {
    stamp: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase(),
    weekday: d.toLocaleDateString("en-US", { weekday: "long" }),
  };
}

export default function HistoryScreen({ db, uid }: { db: Firestore; uid: string }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHistory({ db }, uid)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your history. Pull the tab again to retry.");
      });
    return () => {
      cancelled = true;
    };
  }, [db, uid]);

  const open = (id: string) => {
    setError(null);
    fetchHistoryDetail({ db }, uid, id)
      .then(setDetail)
      .catch(() => setError("Could not open that workout. Go back and try again."));
  };

  if (detail) {
    return <HistoryDetail detail={detail} onBack={() => setDetail(null)} />;
  }

  return (
    <section aria-label="History">
      <h2 className="workoutName">HISTORY</h2>
      {error && <p role="alert">{error}</p>}
      {rows === null && <p>Loading…</p>}
      {rows?.length === 0 && <p className="recoveryCopy">No workouts yet. Your first one starts today.</p>}
      <ul className="cardList">
        {rows?.map((r) => {
          const { stamp, weekday } = formatRowDate(r.scheduledDate);
          return (
            <li key={r.id} className="exerciseCard">
              <button type="button" className="rowButton" onClick={() => open(r.id)}>
                <span className="historyStamp">{stamp}</span>
                <span className="historyMeta">
                  {weekday} · {nameForType(r.workoutType)}
                </span>
                <span className="exerciseTarget">
                  {r.exercisesDone}/{r.exercisesTotal} completed
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function HistoryDetail({ detail, onBack }: { detail: HistoryDetail; onBack: () => void }) {
  const { stamp, weekday } = formatRowDate(detail.session.scheduledDate);
  const setsByKey = new Map<string, LoggedSet[]>();
  for (const s of detail.sets) {
    const list = setsByKey.get(s.exerciseKey) ?? [];
    list.push(s);
    setsByKey.set(s.exerciseKey, list);
  }

  return (
    <section aria-label="Workout detail">
      <button type="button" onClick={onBack}>
        ← BACK
      </button>
      <h2 className="workoutName">
        {stamp} · {weekday}
      </h2>
      <p className="dateLine">{nameForType(detail.session.workoutType)}</p>
      <ul className="cardList">
        {detail.exercises.map((e) => (
          <li key={e.exerciseKey} className="exerciseCard">
            <div className="cardTop">
              <span className="exerciseName">{e.exerciseName}</span>
              <span className="exerciseTarget">{e.completed ? "✓" : "—"}</span>
            </div>
            <p className="lastTime">
              {e.weightUsed !== null ? `${e.weightUsed} ${e.weightUnit ?? "LB"}` : `${e.durationMinutes ?? 0} min`}
              {e.difficulty ? ` · ${e.difficulty.toUpperCase()}` : ""}
              {e.painStatus && e.painStatus !== "none" ? ` · PAIN: ${e.painStatus.toUpperCase()}` : ""}
            </p>
            <p className="tip">
              {(setsByKey.get(e.exerciseKey) ?? [])
                .map((s) => `${s.reps} reps`)
                .join(" / ") || "No sets logged"}
            </p>
            {e.notes && <p className="tip">{e.notes}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
