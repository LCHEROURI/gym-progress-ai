import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import type { RepoCtx } from "./session-repository";
import {
  weeklyReportSchema,
  type WeeklyReport,
} from "../reports/weekly";

const path = (uid: string) => `users/${uid}/weeklyReports`;

/** All stored reports, newest week first. */
export async function fetchReports(ctx: RepoCtx, uid: string): Promise<WeeklyReport[]> {
  const snap = await getDocs(
    query(collection(ctx.db, path(uid)), orderBy("weekStart", "desc")),
  );
  return snap.docs.map((d) => weeklyReportSchema.parse(d.data()));
}

export async function fetchReport(
  ctx: RepoCtx,
  uid: string,
  reportId: string,
): Promise<WeeklyReport | null> {
  const snap = await getDoc(doc(ctx.db, `${path(uid)}/${reportId}`));
  return snap.data() ? weeklyReportSchema.parse(snap.data()) : null;
}
