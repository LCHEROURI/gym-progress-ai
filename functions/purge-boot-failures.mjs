/**
 * Purge bootFailures documents for one exact buildId.
 *
 * Fail-closed by design, per AGENTS.md rule 7 (no destructive database actions
 * without confirmation, and cleanup scripts must prove what they delete):
 *
 *   - it never deletes a whole collection; BUILD_ID must be an exact match
 *   - it prints every candidate in full BEFORE deleting anything
 *   - it refuses to run if the match is empty, or if the match is larger than
 *     the delete ceiling (a bulk delete is a deliberate decision, not a
 *     script's). The ceiling is 1 by default and must be raised explicitly with
 *     --max, so "delete everything matching X" is always a typed decision.
 *   - it re-reads afterwards and reports the count that survived
 *
 * Usage:
 *   node purge-boot-failures.mjs smoke-test-build --confirm
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT = process.env.FIRESTORE_PROJECT_ID ?? "gym-progress-ai-lcherouri";
const COLLECTION = "bootFailures";
const DEFAULT_MAX_DELETE = 1;

const buildId = process.argv[2];
const confirmed = process.argv.includes("--confirm");
const maxIdx = process.argv.indexOf("--max");
const maxDelete = maxIdx === -1 ? DEFAULT_MAX_DELETE : Number(process.argv[maxIdx + 1]);

if (!buildId) {
  console.error(
    "usage: node purge-boot-failures.mjs <exact-buildId> --confirm [--max N]",
  );
  process.exit(2);
}
if (!Number.isInteger(maxDelete) || maxDelete < 1) {
  console.error("--max must be a positive integer");
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
if (candidates.length > maxDelete) {
  console.error(
    `refusing: ${candidates.length} documents match, ceiling is ${maxDelete}. ` +
      "Re-run with --max N if a bulk delete is genuinely intended. The default " +
      "of 1 exists so that 'delete everything matching X' is always a typed decision.",
  );
  console.error("candidates:");
  for (const doc of candidates) console.error("  " + doc.id);
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
