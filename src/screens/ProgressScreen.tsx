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
      <header className="screenHeader">
        <p className="screenKicker">YOUR TRAINING</p>
        <h2 className="workoutName">Progress</h2>
        <p className="screenIntro">A clear view of the work you’ve put in.</p>
      </header>
      {error && <p role="alert">{error}</p>}
      {loaded === null && !error && <p>Loading…</p>}
      {loaded && (
        <>
          <dl className="summaryList progressStats">
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

          <section className="screenSection" aria-labelledby="records-heading">
            <div className="sectionHeading">
              <div>
                <p className="sectionEyebrow">MILESTONES</p>
                <h3 id="records-heading">Personal records</h3>
              </div>
              <span className="sectionCount">{loaded.prs.length}</span>
            </div>
            {loaded.prs.length === 0 && (
              <p className="emptyHint">
                Your first logged weight starts the record book. Keep showing up.
              </p>
            )}
            <ul className="cardList recordList">
              {loaded.prs.map((pr) => (
                <li key={pr.exerciseKey} className="exerciseCard prCard">
                  <span className="prTag">PERSONAL BEST</span>
                  <span className="exerciseName">{pr.exerciseName}</span>
                  <span className="prWeight">
                    {pr.weight} <span>LB</span>
                  </span>
                  <span className="exerciseTarget">Set on {pr.achievedAt}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="screenSection" aria-labelledby="exercise-progress-heading">
            <div className="sectionHeading">
              <div>
                <p className="sectionEyebrow">BY MOVEMENT</p>
                <h3 id="exercise-progress-heading">Exercise progress</h3>
              </div>
              <span className="sectionCount">{loaded.rows.length}</span>
            </div>
            <ul className="cardList progressList">
              {loaded.rows.map((row) => (
                <li key={row.exerciseKey} className="exerciseCard">
                  <div className="cardTop">
                    <span className="exerciseName">{row.exerciseName}</span>
                    <span className={`trendPill trend-${row.trend}`}>
                      {row.trend === "up" ? "↑ UP" : row.trend === "down" ? "↓ DOWN" : "→ FLAT"}
                    </span>
                  </div>
                  <div className="progressMeasures" role="group" aria-label={`${row.exerciseName} weights`}>
                    <p><span>Started</span><strong>{row.startingWeight} lb</strong></p>
                    <p><span>Now</span><strong>{row.currentWeight} lb</strong></p>
                    <p><span>Best</span><strong>{row.highestWeight} lb</strong></p>
                  </div>
                  <div className="progressFoot">
                    <p className="tip">
                      {row.totalSessions} {row.totalSessions === 1 ? "session" : "sessions"} · Latest {row.latestResult}
                    </p>
                    <Sparkline points={row.points} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
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
