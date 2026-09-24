import { doc, setDoc } from "firebase/firestore";
import type { RepoCtx } from "../data/session-repository";
import { reportIdFor, weeklyReportSchema, type WeeklyReport } from "./weekly";

export { reportIdFor };

const path = (uid: string, id: string) => `users/${uid}/weeklyReports/${id}`;

export async function saveWeeklyReport(
  ctx: RepoCtx,
  uid: string,
  report: WeeklyReport,
): Promise<void> {
  const validated = weeklyReportSchema.parse(report);
  await setDoc(
    doc(ctx.db, path(uid, reportIdFor(validated.weekStart))),
    validated as unknown as Record<string, unknown>,
  );
}
