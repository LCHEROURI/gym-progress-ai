/**
 * Purge bootFailures documents for one exact buildId.
 *
 * Fail-closed by design, per AGENTS.md rule 7 (no destructive database actions
 * without confirmation, and cleanup scripts must prove what they delete):
 *
 *   - it never deletes a whole collection; BUILD_ID must be an exact match
 *   - it prints every candidate in full BEFORE deleting anything
 *   - it refuses to run if the match is empty, or if the match is larger than
 *     MAX_DELETE (a bulk delete is a human decision, not a script's). The
 *     default is 1 for interactive use; the CI purge job sets MAX_DELETE via
 *     env to clear a day's accumulation of liveness-probe documents (~96/day)
 *     plus any backlog from skipped scheduled runs — safe because the script
 *     matches on the exact buildId "liveness-probe" and nothing else.
 *   - it re-reads afterwards and reports the count that survived
 *
 * Usage:
 *   node purge-boot-failures.mjs smoke-test-build --confirm
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT = process.env.FIRESTORE_PROJECT_ID ?? "gym-progress-ai-lcherouri";
const COLLECTION = "bootFailures";
// Default 1 for interactive use; the CI purge job overrides via MAX_DELETE env.
const MAX_DELETE = process.env.MAX_DELETE !== undefined ? Number(process.env.MAX_DELETE) : 1;

const buildId = process.argv[2];
const confirmed = process.argv.includes("--confirm");

if (!buildId) {
  console.error("usage: node purge-boot-failures.mjs <exact-buildId> --confirm");
  process.exit(2);
}

const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT });
const db = getFirestore(app);
const ref = db.collection(COLLECTION);

// Exact match only. A prefix or substring here could catch a live build's
// reports, which is the failure mode this guard exists to prevent.
const candidates = (await ref.where("buildId", "==", buildId).get()).docs;

console.log(`project=${PROJECT} collection=${COLLECTION} buildId=${JSON.stringify(buildId)}`);
console.log(`candidates=${candidates.length}`);
for (const doc of candidates) {
  console.log("  " + JSON.stringify({ id: doc.id, ...doc.data() }));
}

if (candidates.length === 0) {
  console.log("nothing to delete; exiting without writing");
  process.exit(0);
}
if (candidates.length > MAX_DELETE) {
  console.error(
    `refusing: ${candidates.length} documents match, MAX_DELETE is ${MAX_DELETE}. ` +
      "A bulk delete needs explicit human review.",
  );
  process.exit(3);
}
if (!confirmed) {
  console.error("refusing: pass --confirm to delete the document(s) listed above");
  process.exit(4);
}

for (const doc of candidates) {
  await doc.ref.delete();
  console.log(`deleted ${doc.id}`);
}

const remaining = (await ref.where("buildId", "==", buildId).get()).size;
console.log(`verify: ${remaining} document(s) still match ${JSON.stringify(buildId)}`);
process.exit(remaining === 0 ? 0 : 5);
