import { useEffect, useState } from "react";
import type { Firestore } from "firebase/firestore";
import { fetchProgressFacts } from "../data/progress";
import {
  buildExerciseProgress,
  buildProgressStats,
  detectPersonalRecords,
  type ExerciseProgress,
  type PersonalRecord,
  type ProgressStats,
} from "../progress/stats";

interface Loaded {
  stats: ProgressStats;
  prs: PersonalRecord[];
  rows: ExerciseProgress[];
}

export default function ProgressScreen({ db, uid }: { db: Firestore; uid: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProgressFacts({ db }, uid)
      .then((facts) => {
        if (cancelled) return;
        setLoaded({
          stats: buildProgressStats({ ...facts, today: new Date() }),
          prs: detectPersonalRecords(facts.exercises),
          rows: buildExerciseProgress(facts.exercises),
        });
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your progress. Go back and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [db, uid]);

  return (
    <section aria-label="Progress">
      <h2 className="workoutName">PROGRESS</h2>
      {error && <p role="alert">{error}</p>}
      {loaded === null && !error && <p>Loading…</p>}
      {loaded && (
        <>
          <dl className="summaryList">
            <div>
              <dt>Total workouts:</dt>
              <dd>{loaded.stats.totalWorkouts}</dd>
            </div>
            <div>
              <dt>Workouts this month:</dt>
              <dd>{loaded.stats.workoutsThisMonth}</dd>
            </div>
            <div>
              <dt>Current week:</dt>
              <dd>
                {loaded.stats.currentWeek.completed} / {loaded.stats.currentWeek.planned}
              </dd>
            </div>
            <div>
              <dt>Completion rate:</dt>
              <dd>{Math.round(loaded.stats.completionRate * 100)}%</dd>
            </div>
            <div>
              <dt>Total cardio minutes:</dt>
              <dd>{loaded.stats.totalCardioMinutes}</dd>
            </div>
          </dl>

          <h3 className="sectionTitle">PERSONAL RECORDS</h3>
          {loaded.prs.length === 0 && (
            <p className="recoveryCopy">
              No personal records yet — they appear after your first logged weight.
            </p>
          )}
          <ul className="cardList">
            {loaded.prs.map((pr) => (
              <li key={pr.exerciseKey} className="exerciseCard prCard">
                <span className="prTag">PERSONAL BEST</span>
                <span className="exerciseName">{pr.exerciseName.toUpperCase()}</span>
                <span className="exerciseTarget">
                  {pr.weight} LB · {pr.achievedAt}
                </span>
              </li>
            ))}
          </ul>

          <h3 className="sectionTitle">EXERCISE PROGRESS</h3>
          <ul className="cardList">
            {loaded.rows.map((row) => (
              <li key={row.exerciseKey} className="exerciseCard">
                <div className="cardTop">
                  <span className="exerciseName">{row.exerciseName}</span>
                  <span className="exerciseTarget">
                    {row.trend === "up" ? "↑ UP" : row.trend === "down" ? "↓ DOWN" : "→ FLAT"}
                  </span>
                </div>
                <p className="lastTime">
                  Start {row.startingWeight} lb → Current {row.currentWeight} lb · Best{" "}
                  {row.highestWeight} lb · {row.totalSessions} sessions
                </p>
                <p className="tip">Latest: {row.latestResult}</p>
                <Sparkline points={row.points} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Sparkline({ points }: { points: { date: string; weight: number }[] }) {
  if (points.length < 2) return null;
  const weights = points.map((p) => p.weight);
  const max = Math.max(...weights);
  const min = Math.min(...weights);
  const span = Math.max(1, max - min);
  const coords = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 98 + 1;
      const y = 29 - ((p.weight - min) / span) * 27;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg className="sparkline" viewBox="0 0 100 30" role="img" aria-label="Weight trend">
      <polyline points={coords} fill="none" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}
