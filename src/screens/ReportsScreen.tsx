import { useEffect, useState } from "react";
import type { FirebaseApp } from "firebase/app";
import type { Firestore } from "firebase/firestore";
import { fetchReports } from "../data/reports";
import { generateWeeklyReport } from "../reports/generate";
import {
  latestCompletedWeekStart,
  type WeeklyReport,
} from "../reports/weekly";
import { TEMPLATES } from "../domain/templates";

const nameFor = (key: string): string =>
  TEMPLATES.flatMap((t) => t.exercises).find((e) => e.key === key)?.name ?? key;

export function weekLabel(r: { weekStart: string; weekEnd: string }): string {
  const a = new Date(`${r.weekStart}T00:00:00Z`);
  const b = new Date(`${r.weekEnd}T00:00:00Z`);
  const monthA = a.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const monthB = b.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return monthA === monthB
    ? `${monthA} ${a.getUTCDate()}–${b.getUTCDate()}`
    : `${monthA} ${a.getUTCDate()} – ${monthB} ${b.getUTCDate()}`;
}

export default function ReportsScreen({
  db,
  uid,
  app,
}: {
  db: Firestore;
  uid: string;
  app: FirebaseApp;
}) {
  const [reports, setReports] = useState<WeeklyReport[] | null>(null);
  const [detail, setDetail] = useState<WeeklyReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchReports({ db }, uid)
      .then((rows) => {
        if (!cancelled) setReports(rows);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your reports. Go back and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [db, uid]);

  const generate = () => {
    setBusy(true);
    setError(null);
    void generateWeeklyReport({
      ctx: { db },
      app,
      uid,
      weekStart: latestCompletedWeekStart(new Date()),
    })
      .then((r) => {
        setReports((list) => [r, ...(list ?? []).filter((x) => x.weekStart !== r.weekStart)]);
        setDetail(r);
      })
      .catch(() => setError("Could not generate the report. Try again."))
      .finally(() => setBusy(false));
  };

  if (detail) {
    return <ReportView report={detail} onBack={() => setDetail(null)} />;
  }

  return (
    <section aria-label="Reports">
      <h2 className="workoutName">REPORTS</h2>
      {error && <p role="alert">{error}</p>}
      <h3 className="sectionTitle">THIS WEEK</h3>
      <p className="tip">Reports cover the last completed week (Monday–Sunday).</p>
      <button type="button" className="primaryButton" onClick={generate} disabled={busy}>
        {busy ? "Generating…" : "GENERATE LAST WEEK'S REPORT"}
      </button>

      <h3 className="sectionTitle">PAST REPORTS</h3>
      {reports === null && <p>Loading…</p>}
      {reports?.length === 0 && (
        <p className="recoveryCopy">No reports yet — generate your first above.</p>
      )}
      <ul className="cardList">
        {reports?.map((r) => (
          <li key={r.weekStart} className="exerciseCard">
            <button type="button" className="rowButton" onClick={() => setDetail(r)}>
              <span className="historyStamp">{weekLabel(r).toUpperCase()}</span>
              <span className="exerciseTarget">
                {r.completed}/{r.planned} workouts
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReportView({ report, onBack }: { report: WeeklyReport; onBack: () => void }) {
  return (
    <section aria-label="Weekly fitness report">
      <button type="button" onClick={onBack}>
        ← BACK
      </button>
      <h2 className="workoutName">WEEKLY FITNESS REPORT</h2>
      <p className="dateLine">WEEK: {weekLabel(report)}</p>
      <dl className="summaryList">
        <div>
          <dt>Planned workouts:</dt>
          <dd>{report.planned}</dd>
        </div>
        <div>
          <dt>Completed:</dt>
          <dd>{report.completed}</dd>
        </div>
        <div>
          <dt>Completion:</dt>
          <dd>{Math.round(report.completionRate * 100)}%</dd>
        </div>
      </dl>

      <h3 className="sectionTitle">STRENGTH</h3>
      {report.strengthChanges.map((c) => (
        <p key={c.exerciseKey} className="lastTime">
          {nameFor(c.exerciseKey)} {c.from} → {c.to} lb
        </p>
      ))}

      <h3 className="sectionTitle">CARDIO</h3>
      <p className="lastTime">Total: {report.cardioMinutes} minutes</p>

      <h3 className="sectionTitle">PERSONAL RECORDS</h3>
      {report.prs.length === 0 && <p className="tip">No new records this week.</p>}
      {report.prs.map((pr) => (
        <p key={`${pr.exerciseKey}-${pr.date}`} className="lastTime">
          {nameFor(pr.exerciseKey)} {pr.weight} lb · {pr.date}
        </p>
      ))}

      <h3 className="sectionTitle">AI OBSERVATIONS</h3>
      <ul>
        {report.aiObservations.map((line, i) => (
          <li key={i} className="tip">
            {line}
          </li>
        ))}
      </ul>

      <h3 className="sectionTitle">NEXT WEEK</h3>
      {report.nextWeek.map((n) => (
        <p key={n.exerciseKey} className="tip">
          <strong>{nameFor(n.exerciseKey)}:</strong> {n.guidance}
        </p>
      ))}
    </section>
  );
}
