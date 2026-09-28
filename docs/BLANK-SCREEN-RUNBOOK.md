# BLANK-SCREEN RUNBOOK — iPhone Chrome, after deploys

Symptom seen in the field: after a production deploy, the app opens blank on iPhone Chrome (no error, no content). Not reproduced locally; diagnosis below is code-path analysis, confidence noted per finding. iOS Chrome is WebKit under Apple's engine requirement, so caching behavior matches Safari's.

## The deploy race (primary suspected cause, HIGH confidence)

Every deploy changes which hashed asset files exist on Hosting, but does nothing to clients that already loaded the previous version's HTML:

1. Client loads `/` → HTML referencing `/assets/index-<hash-A>.js` (deploy N).
2. You deploy (deploy N+1) → Hosting now serves HTML referencing `index-<hash-B>.js`; the file `index-<hash-A>.js` no longer exists.
3. The still-open (or backgrounded) client lazily imports a chunk it doesn't have yet — e.g. `firebase/firestore` in `initFirebase()`, which loads only after sign-in — requesting the old `hash-A` URL → **404** → `initFirebase()` rejects.
4. Before the recovery work (uncommitted as of the last commit), a rejected promise or thrown render error inside `WorkoutFlow` unmounted the React tree with no fallback → **blank screen**.

This explains the "after a deploy" timing exactly: nothing is wrong with either version — the failure lives in the gap between them.

### Mitigations already in this branch (why each exists)

| Change | Failure it covers |
|---|---|
| Root `<AppErrorBoundary>` (`src/components/AppErrorBoundary.tsx`) | Chunk-404 render crash now shows a "Reload app" screen instead of blanking |
| Auth error UI + `retry` in `useAuthSession`/`App` | Auth init failure (offline, deploy racing `firebase-auth` chunk) renders an explanation with a working retry |
| `BuildStatus` header badge (`src/pwa/BuildStatus.tsx`) | Waiting service worker surfaces as "Update ready → RELOAD" so users move to deploy N+1 before old chunks vanish |
| `__APP_BUILD_ID__` (vite `define`, `src/vite-env.d.ts`) | Any future screenshot of the badge tells you exactly which deploy a device is running |

## Other findings from the audit

- **F2 — `sw.js` runtime cache is not the villain (MEDIUM confidence).** Navigations are network-first with cache fallback, and `/`, `*.html`, `/sw.js`, `/manifest.webmanifest` are served `no-cache` (`firebase.json`), so the shell is not stale. The runtime cache only answers when the network fails — it can't produce a blank screen on a working connection. Cache name is `gym-progress-ai-v3`; bump on next SW-behavior change.
- **F3 — deep-link HTML may cache heuristically (LOW).** The `no-cache` header patterns cover `/` and `*.html`, but rewritten deep paths like `/history` (no `.html` suffix) match neither. Harmless today — the home-screen start URL is `/` — but would matter if deep links are ever shared. Fix only if needed.
- **F4 — `signInWithPopup` is unreliable in iOS standalone WebApps (KNOWN ISSUE).** In installed-home-screen mode iOS may block popups entirely; sign-in would hang or fail rather than blank. If field reports include "can't sign in", switch to `signInWithRedirect` for iOS standalone contexts.

## Recommended hardening (not yet implemented)

1. **Chunk-load auto-reload, once.** Catch dynamic-import failures, set a `sessionStorage` flag, `location.reload()`; the flag prevents a reload loop when the new deploy is genuinely unreachable. Turns the error boundary's manual step into a self-heal.
2. **Keep the previous release's assets** for one deploy cycle (build step copies old `dist/assets` into the new deploy before upload). Eliminates the 404 window instead of handling it.
3. **iOS standalone sign-in** via `signInWithRedirect` (F4).
4. **Startup monitoring** (PRINCIPLES 2026-09-28 "Next Experiment"): a tiny beacon on boot failure with the build ID, so the next incident reports itself with evidence.

## Device diagnostic checklist (iPhone Chrome)

Work top to bottom; stop when the cause is found. Capture evidence at every step — screenshots beat memory.

1. **Identify the running build.** Open the app; read the build ID in the header badge (e.g. `Build 20260928…`). Compare with the latest deploy's build ID. A mismatch on a fresh open means the device is running a stale shell → jump to step 5.
2. **Reproduce with the console attached.** Enable Web Inspector on the iPhone (Settings → Safari → Advanced → Web Inspector — it inspects iOS Chrome too, since it is WebKit). On the Mac, Safari → Develop → [device] → inspect the Gym Progress AI page. Reproduce the blank screen and read the console.
   - `Failed to fetch dynamically imported module: …/assets/index-<hash>.js` or a 404 for an asset → **the deploy race (F1)** confirmed.
   - Auth/network errors instead → auth init path; check airplane-mode behavior and Firebase Auth status.
3. **Check the service worker state** (same inspector): Application/storage → is a service worker registered? Is a version waiting? Note the cache name present (`gym-progress-ai-v…`).
4. **Rule out extensions/NetworkLinkConditioner-style interference** by reproducing in iOS Chrome *private mode* (no extensions, empty cache) once. Blank in private too ⇒ not cache.
5. **Flush and retest.** Chrome iOS → Settings → Content Settings → Clear Browsing Data (cache + site data), or delete and reinstall the home-screen app. Fresh open must show the latest build ID. If still blank on a clean cache with the latest build → the bug is in current code, not staleness; file with console output from step 2.
6. **Verify the recovery UIs fire.** On a stale shell, exercise "Update ready → RELOAD" and, if you can trigger a chunk failure, the error boundary's "Reload app". Both landing on a working app = the mitigation works; a dead end in either = new bug, capture it.
7. **Record the incident** in `docs/PRINCIPLES.md` (newest entry): build IDs on both sides, deploy timestamp, console evidence, and which step identified the cause.

## If there is no device (paper triage)

- Ask the reporter for: the build-ID badge screenshot, the exact time of the blank screen, and whether the app was already open before the deploy (deploy race) or freshly opened (code bug).
- A blank screen that self-resolves after "Clear browsing data" confirms F1/F2 staleness without console access.
