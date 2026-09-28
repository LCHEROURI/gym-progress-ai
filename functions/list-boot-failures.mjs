/**
 * READ-ONLY inventory of production bootFailures.
 *
 * Run with Application Default Credentials (gcloud auth application-default
 * login) against the real project. Prints every document so the deletion
 * target is chosen from evidence rather than from a remembered name.
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT = process.env.FIRESTORE_PROJECT_ID ?? "gym-progress-ai-lcherouri";
const COLLECTION = process.env.COLLECTION ?? "bootFailures";

const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT });
const db = getFirestore(app);

const snap = await db.collection(COLLECTION).get();
console.log(`project=${PROJECT} collection=${COLLECTION} docs=${snap.size}`);
for (const doc of snap.docs) {
  const d = doc.data();
  console.log(
    JSON.stringify(
      {
        id: doc.id,
        buildId: d.buildId,
        stage: d.stage,
        message: d.message,
        count: d.count,
        firstSeenAt: d.firstSeenAt,
        lastSeenAt: d.lastSeenAt,
        uid: d.uid ?? null,
      },
      null,
      0,
    ),
  );
}
process.exit(0);
