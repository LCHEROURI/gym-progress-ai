# BLANK-SCREEN RUNBOOK — iPhone Chrome, after deploys

Symptom in the field: after a production deploy the app opens blank on iPhone Chrome — no error, no content. Not reproduced on a device; the diagnosis below is code-path analysis of the deployed build, with per-finding confidence. iOS Chrome is WebKit, so caching behavior matches Safari.

## Root cause: deleted chunk → HTML → module MIME error (HIGH confidence)

The Hosting config is a trailing catch-all:

```json
"rewrites": [{ "source": "**", "destination": "/index.html" }]
```

So when a client requests an asset that a new deploy deleted, Hosting does **not** return 404 — it returns **HTTP 200 with `text/html`** (the SPA shell). The failure chain:

1. Client loads `/` on deploy N. HTML references `/assets/index-<hashA>.js`; `/sw.js` precaches the shell (`/`, `/index.html`, manifest, icons).
2. You deploy deploy N+1. Vite's `__APP_BUILD_ID__` `define` (`vite.config.ts`) changes on **every build**, so entry and app chunks get new hashes — verified across two builds this session: `index-DkiSMyIi` → `index-DsrP3sFP`, `WorkoutFlow-CQIPF7rS` → `WorkoutFlow-h5qa7dAa`.
3. The still-open client lazily imports a chunk it has not loaded yet — `WorkoutFlow` (`src/App.tsx:7`, React `lazy`) or `firebase/firestore` (`src/data/firebase.ts:75`, loaded only after sign-in).
4. That request hits the catch-all, returns 200 + `text/html`, and `import()` rejects with a **module MIME error** (`Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html"`).
5. Before this branch, a rejected render threw with no error boundary above it → React unmounted the tree → **blank screen**.

Why the timing is "after deploys" and never otherwise: both the served HTML and the deleted asset only diverge in the window between a client loading deploy N and requesting a lazy chunk after deploy N+1. Nothing is wrong with either version in isolation.

### The part that makes it stick (HIGH confidence — this is why the user stays blank)

`public/sw.js` caches every same-origin GET with **no `res.ok` and no content-type check** (zero occurrences of either, verified). The non-navigate branch is cache-first:

```js
caches.match(req).then((hit) => hit || fetch(req).then((res) => {
  const copy = res.clone();
  caches.open(CACHE).then((cache) => cache.put(req, copy));  // stores HTML under the .js URL
  return res;
}));
```

So the **HTML response gets written into the cache under the missing chunk's `.js` URL**. Every subsequent load replays that poisoned entry from cache — the client is now permanently broken for that chunk, and no reload or new deploy fixes it, because the cache is consulted first and the cache name (`gym-progress-ai-v3`) never changes. The user must clear site data. This matches "blank after deploys, persists, we never had this problem": the condition is self-inflicted and sticky once triggered.

**Now fixed (cache v4).** The write guard makes new poisoning impossible, the read guard heals clients that are already poisoned, and the version bump evicts the poisoned cache. The root cause below is still worth understanding — a device can still request a chunk its deploy removed — but it can no longer turn into a permanent blank screen.

### Why a normal deploy is *usually* fine (MEDIUM confidence)

Navigations are network-first with cache fallback, and `/`, `**/*.html`, `/sw.js`, `/manifest.webmanifest` are served `no-cache` (`firebase.json`, commit `014d589`), so a fresh open gets new HTML. The failure needs a client that was **already open** (home-screen app, backgrounded tab) across the deploy and then triggered a lazy import. That is why it reads as random and why it correlates with deploying while you use the app.

## Contributing findings

- **Auth init can blank the shell, independently of any deploy (HIGH).** `useAuthSession` already transitioned to `state: "error"` when `initAuth` rejected or the auth observer errored, but the old `App.tsx` rendered **nothing** for that state — a bare header over empty content. `initAuth` (`src/data/firebase.ts:27`) rejects on a bad/missing env config or a chunk 404, so the same deploy race can land here instead. Fixed in this branch: error screen with a working retry.
- **Render crashes had no boundary (HIGH).** A thrown screen or failed `lazy()` import unmounted everything. Fixed in this branch: `src/components/AppErrorBoundary.tsx`.
- **F3 — `signInWithPopup` is unreliable in iOS standalone webapps (KNOWN, separate symptom).** iOS may block popups in installed-home-screen mode; sign-in fails or hangs rather than blanking. Symptom is "can't sign in", not a blank screen. If it shows up, switch to `signInWithRedirect` for iOS standalone contexts.
- **F4 — no automation bumps the SW cache (LOW, process).** `gym-progress-ai-v3` is edited by hand only; `tests/pwa.test.ts` asserts the literal string, so a bump means editing both. Any future SW behavior change needs the bump or stale workers linger.

## Fixes in this branch (why each exists)

| Change | Failure it covers |
|---|---|
| `AppErrorBoundary` (`src/components/AppErrorBoundary.tsx`) | Chunk-404 / render crash now shows "Reload app" instead of blanking |
| Auth error UI + `retry` (`src/App.tsx`, `src/auth/useAuthSession.ts`) | `state: "error"` renders an explanation and a working retry |
| `BuildStatus` badge (`src/pwa/BuildStatus.tsx`) | A waiting worker surfaces as "Update ready → RELOAD"; the build ID identifies the running deploy |
| `__APP_BUILD_ID__` (`vite.config.ts`, `src/vite-env.d.ts`) | Any screenshot now names the exact deploy a device runs |

These make the failure **visible and recoverable**. They do not close the cache-poisoning window below.

## Remaining hardening (in priority order, not yet implemented)

1. ~~**Stop the poisoning (highest value).**~~ **DONE (cache v4).** `sw.js` now caches only when `res.ok` **and** the content type matches the URL — a `.js` slot accepts only script types, `.css` only `text/css`, `.html` only `text/html` — and refuses opaque responses. Both paths are guarded: the write, and the *read* (a cache hit whose type does not match is deleted and refetched), so clients already poisoned by an earlier worker self-heal on the next load instead of needing a manual site-data clear. Locked down by `tests/sw-cache-guard.test.ts`, which executes the real `sw.js` against fake caches. The v3→v4 bump also flushes poisoned caches on activate.
2. ~~**Auto-reload-once on chunk-load failure.**~~ **DONE.** `src/shared/chunk-recovery.ts` recognises the real chunk-failure wordings browsers emit (Chromium, Firefox, Safari, Vite, CSS preloads) and reloads at most **once per session**, guarded by `sessionStorage["gym-progress-ai:chunk-reload"]` and a per-document flag. Wired into both ends: `AppErrorBoundary.componentDidCatch` covers the lazy `WorkoutFlow` and post-signin Firestore imports, and the pre-React probe covers an entry chunk that never loaded (where React never existed to catch anything). A healthy mount clears the marker in `main.tsx`, earning a fresh attempt later. Anything else — a real bug, a second failure — falls through to the error boundary. Deliberately strict: alternation between two broken chunks cannot drive a loop, because the guard checks presence, not the reason.
3. **Serve assets outside the catch-all.** Add a Hosting rewrite for `/assets/**` that 404s instead of returning HTML, so a deleted chunk fails as a real error the boundary can name honestly.
4. **Keep the previous release's assets** for one deploy cycle (copy old `dist/assets` into the new deploy) — eliminates the window instead of handling it.
5. **Automate the SW bump** and drop the literal-string assertion in `tests/pwa.test.ts`.
6. **Startup monitoring** — a boot beacon carrying the build ID, so the next incident self-reports with evidence.

## Device diagnostic checklist (iPhone Chrome)

Work top to bottom; stop when the cause is found. Capture evidence at every step — screenshots beat memory.

1. **Read the build ID.** Open the app; note the badge (`Build 20260928…`). Compare with the newest deploy. On a *fresh* open they must match; a mismatch means you are already on a stale shell → go to step 5.
2. **Attach the inspector and reproduce.** On the iPhone: Settings → Safari → Advanced → Web Inspector (inspects iOS Chrome too — it is WebKit). On the Mac: Safari → Develop → [device] → the Gym Progress AI page. Reproduce the blank screen and read the console.
   - `Failed to load module script … MIME type of "text/html"` → **root cause above, confirmed.**
   - A 404 for `/assets/…` → the asset guard/rewrite is already deployed; the poisoning path differs.
   - Auth/network errors instead → the auth-init branch.
3. **Check service worker state** in the same inspector (Storage/Application): is a worker registered, is one waiting, which cache name exists (`gym-progress-ai-v…`)?
4. **Poison test.** Application → Cache Storage → open `gym-progress-ai-v3` → find a `.js` entry and read its `Content-Type`/first bytes. `text/html` under a `.js` name is the smoking gun for the sticky case. Record the entry name — it is the exact chunk that broke.
5. **Clear and retest.** Chrome iOS → Settings → Content Settings → Clear Browsing Data (cache + site data), or delete and reinstall the home-screen app. Fresh open must show the newest build ID.
   - Works after clearing → the poisoned-cache case, matching "never had this problem before" (condition is sticky until cleared).
   - Still blank on a clean cache with the newest build → a real bug in current code; file it with the step-2 console output.
6. **Rule out interference.** Reproduce once in iOS Chrome private mode (no extensions, empty cache). Blank in private too ⇒ not cache, not extensions.
7. **Verify the recovery paths fire.** On a stale shell, exercise "Update ready → RELOAD" and, if you can trigger a chunk failure, "Reload app". Both landing on a working app = mitigations work; a dead end in either = new bug, capture it.
8. **Record the incident** in `docs/PRINCIPLES.md` (newest first): build IDs on both sides, deploy timestamp, cache-entry name from step 4, console evidence, and which step identified the cause.

## Startup monitoring (added 2026-09-28) — the app now reports its own blank screens

A boot failure no longer needs a bug report. A dependency-free probe is inlined
into `index.html` **above** the entry module (why it cannot be a module: a
monitor that imports code is subject to the failure it observes) and posts one
deduped report when it sees one of:

| `stage` | Meaning | Watch for |
|---|---|---|
| `boot` | React never mounted — a chunk 404/MIME error, a syntax failure, or a mount that took >15s | The blank screen. A cluster on one `buildId` right after a deploy is the deploy race, visible without a device |
| `window-error` | `error` or `unhandledrejection` before mount, or a `<script>` that failed to load | The `Script failed to load: <src>` message names the exact asset |
| `render` | `AppErrorBoundary` caught a crash | Replaces the generic timeout with the real message |

Reports land in `bootFailures/{dedupeKey}` (schema in `docs/DATA-MODEL.md`),
written by the `reportBootFailure` Function with the Admin SDK, readable by
operators only. `buildId` matches the badge in the app header, so one document
tells you which deploy, which stage, how many devices, and whether they were
installed home-screen apps. Repeats inside a 10-minute window bump `count`
instead of creating documents.

**Reading them after a deploy:**

1. Query `bootFailures` ordered by `lastSeenAt` after shipping.
2. A `stage: "boot"` doc with a fresh `buildId` = a client was still on the
   old shell. Its `message` says whether the chunk vanished (`Script failed to
   load`) or the boot merely timed out.
3. `stage: "render"` with a MIME/`Failed to fetch dynamically imported module`
   message confirms the same root cause the audit found, now self-reported.
4. High `count` on one key = many devices, one bad deploy — not a device quirk.

**Caveats, stated honestly:** the endpoint is a public write path (no App
Check, no auth — a broken shell often cannot complete either handshake), so
the length caps, field allow-list, and dedupe window are the real defenses. A
15s mount timeout is a guess until real healthy boots are measured; if slow
phones produce false positives, raise `BOOT_MOUNT_TIMEOUT_MS` in
`src/shared/boot-probe.ts`. Reports carry no user data by design, and a failed
write still returns 202 so a broken client never retry-storms.

## Paper triage (no device available)

- Ask for: build-ID badge screenshot, exact time of the blank screen, whether the app was **already open before the deploy** (the race signature), and whether **clearing site data fixed it** (poisoning signature).
- "Already open + fixed by clearing" ⇒ the documented root cause, no console needed.
- "Fresh open + never fixed by clearing" ⇒ treat as an unknown boot/render failure and get device access before changing code.
