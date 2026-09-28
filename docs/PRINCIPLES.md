# Distilled Principles

Development principles distilled via `skills/progressive-distillation/SKILL.md`. Newest first. Distilled principles may add stricter guidance but must never weaken project safety, CI, security, deployment, or repository rules.

## 2026-09-28 · A cache that stores what it was asked for will store a lie

**Experience:** The blank-screen root cause was not "a chunk 404s" but "the cache believed it": Hosting answers a deleted asset with 200 `text/html`, and the worker wrote that response into the cache under the chunk's `.js` URL. Cache-first then replayed HTML into a module import on every load, and because the cache name never changed, no reload or redeploy could clear it. The fix guards both directions — a write needs `res.ok` plus a content type that matches the URL, and a *read* whose cached type does not match is deleted and refetched, so a client poisoned by the old worker heals on its next load. The v3→v4 bump evicts the rest. Verified by executing the real `sw.js` against fake caches; string assertions on the worker could not have caught the write-guard logic.

**Reflection:** A cache keyed by URL but not validated by type will happily store a wrong-typed payload, and the mistake outlives the deploy that caused it. A cache-first strategy needs a read-side check, not just a write-side one, or yesterday's bad entry is served forever.

**Distilled Principle:** Before caching a network response, assert both that it succeeded and that its content type is what that URL is supposed to return — on write *and* on read. Version the cache when the caching rules change, so old entries are evicted rather than trusted.

**Next Experiment:** Confirm in the field that no `stage: "boot"` reports with a MIME/`Script failed to load` message appear after the v4 deploy; then consider serving `/assets/**` outside the catch-all so a deleted chunk fails honestly instead of as HTML.

**Confidence:** Medium-High (the poisoning path was verified in the deployed rewrite and worker source, and the guard is behaviorally tested; no live device or real deploy observed yet)

**Scope:** Project

**Automation Opportunity:** Done — 20 behavioral tests in `tests/sw-cache-guard.test.ts` cover writes, reads, self-heal, offline, scope, and the version bump.

---

## 2026-09-28 · A blank screen should report itself

**Experience:** The iPhone blank screen could only be diagnosed from a bug report and a borrowed device, because nothing in the app observed its own startup. The failures worth catching happen *before* React exists — a poisoned chunk, a MIME error, a syntax failure in the entry bundle — so a monitoring solution built from inside the app would be subject to the very failure it observes. A dependency-free IIFE is injected into `index.html` by `bootProbePlugin()` and installed above the entry module: it watches for a mount signal, catches `error`/`unhandledrejection`/failed script loads, and posts one deduped report to `reportBootFailure` with the build ID. `AppErrorBoundary.componentDidCatch` feeds render crashes back into the same channel.

**Reflection:** Monitoring that imports a module cannot see a module that never ran, so the observer has to be the smallest possible thing in the page — no Firebase, no React, no shared import. The mount signal is deliberately deferred one frame: marking mounted synchronously after `render()` would make a crash on the first frame look like a healthy boot, which is the exact case being hunted.

**Distilled Principle:** To catch a failure that happens before your code runs, the reporter must not depend on your code running. Install the observer from the HTML, mark success only after a painted frame, and make every report self-identifying (build ID) so a screenshot is evidence.

**Next Experiment:** Watch the dedupe counts for a real deploy and tune the 15s mount timeout against observed healthy boots; add the sw.js cache-write guard (runbook item 1) so the poisoning window closes too.

**Confidence:** Medium (mechanism is unit-tested and verified in the built HTML; the endpoint has not yet run against real traffic)

**Scope:** Project

**Automation Opportunity:** Done — 38 unit tests cover the schema, the probe contract, the accessor, and server-side normalization; 3 emulator tests assert no client can write or read `bootFailures`.

---

## 2026-09-28 · Failure states need visible recovery paths

**Experience:** Reviewing an iPhone (Chrome) blank-screen report — blank *after deploys* — found auth initialization already transitioned to an error state, but `App` rendered no content for that state. Render-time failures also had no React error boundary, so a thrown screen/lazy-load error could leave users with no recovery guidance. Added an accessible auth error with retry and a root boundary with a reload action; tests cover both the failure UI and auth retry.

**Reflection:** A state machine can record failure correctly while the UI still appears blank if a state is not rendered. A recovery action must repeat the operation that failed (auth initialization retry) or give the user a safe reload path (render crash); neither catches failures before JavaScript boots. The deploy timing pointed at the real mechanism: a trailing Hosting catch-all returns 200 + `text/html` for a chunk a new deploy deleted, so `import()` fails on a MIME error — and because `sw.js` cached every same-origin response with no `res.ok`/content-type check, that HTML was written under the chunk's `.js` URL, making the failure permanent until site data was cleared. `docs/BLANK-SCREEN-RUNBOOK.md` documents the audit, the device checklist, and the hardening that closes it.

**Distilled Principle:** For every user-visible loading/error state, test both the rendered explanation and the recovery action; use a root React error boundary for render failures, while separately investigating failures that happen before app boot.

**Next Experiment:** Guard the service-worker cache write with `res.ok` + content type so a bad deploy cannot brick a client, then auto-reload-once on chunk-load failure; browser-level startup monitoring if a device reproduces a pre-React blank screen.

**Confidence:** Medium (one report; the MIME-error and cache-poisoning mechanism is verified in the deployed config and worker source, but no affected device was available to confirm)

**Scope:** Project

**Automation Opportunity:** Done — component and auth-hook tests cover both recovery paths.

---


## 2026-09-24 · A visual pass must not "fix" intentional accessibility defaults

**Experience:** The identity pass (soft cards, icon set, design tokens) nearly shrank the 20px base font — it is exactly what made the app read as "a bunch of text". But `body { font-size: 20px }` is the intentional large-text default (`largeTextEnabled`; `.smallText` opts down to 17px). The pass kept the type scale and changed the STRUCTURE instead: page background + white cards + hairline borders + shadows, a stroke icon set, green active states — "reads as an app" came from hierarchy and chrome, not smaller text. Verified live by computed-style probes (tokens applied, 6 nav SVGs, hairline card borders) after compositor frames went stale twice.

**Reflection:** Visual makeovers chase "sleek" by shrinking type; in an accessibility-first product that trades away the very default some users depend on. Identity comes from spacing, hierarchy, color, and iconography — dimensions that never fight legibility.

**Distilled Principle:** Never reduce type size in a visual pass without checking whether the size is an intentional accessibility default; build the identity from spacing, hierarchy, color, and icons instead.

**Next Experiment:** Candidate: record the accessibility floor (min text size, min tap target) in TESTING.md or a CSS comment block so future passes know what not to cut.

**Confidence:** Medium (one near-miss caught by asking why the base was 20px)

**Scope:** Project (candidate Universal)

**Automation Opportunity:** No.

## 2026-09-24 · Refactor copy-locked text into verbatim slices with a derived join

**Experience:** Replacing the install sheet's text-only steps with an illustrated diagram meant splitting one sentence across step captions — but the wording is copy-locked: `hintText()` required "Add to Home Screen", "Web App", "then Add" (+ Safari's "Edit Actions") in one element's text, per-language labels were pinned, and `getByText` uniqueness demanded each phrase appear exactly once in the DOM. Solution: split the 20 sentences (4 languages × 5 browsers) into verbatim slices (`share`/`home`/`add`/`note`) and keep `steps` DERIVED by joining them — every existing i18n assertion (including the locked label quotes) passed untouched, the sentence can never drift from the captions (single source), and only one query helper (`hintText()`) was re-pointed at the steps container with all assertion strings byte-identical. The SVG mockups stay label-free so the phrases remain unique.

**Reflection:** When copy must be restructured under a lock, the lock lives in the assertion strings, not in the element layout. A derived aggregate keeps every consumer and test on the old surface while the presentation splits — and decorative figures must not repeat copy that tests count.

**Distilled Principle:** To restructure test-locked copy: slice verbatim, derive the original aggregate from the slices (zero drift, old surface intact), re-point query helpers rather than assertion strings, and keep illustrated labels out of the DOM when tests count phrase occurrences.

**Next Experiment:** Candidate: apply to any future copy restructure (e.g. per-step onboarding translations) and assert phrase uniqueness with `getAllByText(...)` counts.

**Confidence:** Medium (one clean refactor, all locked tests green on the first run)

**Scope:** Project (candidate Universal)

**Automation Opportunity:** No — the derived join is the automation.

## 2026-09-24 · Journey tests: fake only the clock, wait for the destination screen's marker

**Experience:** The one-tap pre-fill journey test (tap NEXT → START WORKOUT → prefilled weight input) needed a Monday template while `WorkoutFlow` renders for the real date, so time was faked with `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(...)` — faking ONLY the clock leaves testing-library's real-timer `waitFor`/`findBy` untouched. The first run then failed for a subtler reason: `findAllByRole("listitem")` resolved against the OLD screen's plan cards (both screens render listitems) in the instant before the workout screen replaced them. Fixed by awaiting a marker unique to the destination (`findByRole "FINISH WORKOUT"`) before querying within it.

**Reflection:** Two recurring journey-test traps: full fake timers silently break async test helpers, and role queries happily resolve against the screen you just navigated away from. An element query is not a screen-transition barrier — only a destination-unique marker is.

**Distilled Principle:** When a test depends on wall-clock state (weekday templates), fake only `Date` (`toFake: ["Date"]`); when consecutive screens share roles, wait for a marker unique to the destination screen before asserting within it.

**Next Experiment:** Candidate TESTING.md note: journey tests assert a destination marker first; weekday-templated tests use `toFake: ["Date"]` instead of full fake timers.

**Confidence:** Medium (both traps hit and fixed in one session, one clean red→green)

**Scope:** Project (candidate Universal)

**Automation Opportunity:** No — the journey test is the automation.

## 2026-09-24 · Layout gates must assert tap-target size, not only overflow

**Experience:** The full 9-screen iPhone pass (390×844) found the workout screen's AI decision buttons (USE / KEEP / CHOOSE ANOTHER) at **22px tall** — half a finger, un-tappable in practice — while `npm run test:layout` was 20/20 green. The Playwright smoke asserts horizontal overflow (`scrollWidth > clientWidth`) and nothing else, so a screen full of sub-44px controls passes. The same pass found dual data states (error + "Loading…" together) and a ~1.5:1 disabled-button contrast — none of which any gate measures. Filed in `docs/VISUAL-FINDINGS.md`.

**Reflection:** Overflow is one axis of layout quality. The recurring defect class here is *interaction ergonomics* — target size, contrast, state clarity — which only a measured audit (bounding boxes + computed styles) or an explicit smoke assertion catches. A green gate says nothing about axes it does not measure.

**Distilled Principle:** A layout gate must enumerate the axes it checks and name the ones it does not; interaction-ergonomic axes (tap-target size, contrast, single data state) need their own assertions because overflow-only smokes pass broken UI.

**Next Experiment:** Extend `tests/overflow.spec.ts` (or a sibling `targets.spec.ts`) with a ≥ 44px width/height assertion for every `button`/`a` inside `main`, run at 320/390 — expect red on V1 (22px coach buttons), then fix and burn the classname baseline entries for `.coachButtons`.

**Confidence:** Medium (one clean counterexample: green smoke + clearly broken tap targets on the same screen)

**Scope:** Project (candidate Universal)

**Automation Opportunity:** Yes — tap-target assertion in the Playwright smoke.

## 2026-09-24 · Emulator suites must clear state to be re-runnable

**Experience:** Extending the installEvents funnel (`nudge_shown`/`nudge_dismissed`) shipped its first rules tests and the emulator suite went 3–4 red on cases that were green earlier — PERMISSION_DENIED on plain `create` calls. Cause: the Firestore emulator daemon persists docs across runs, the cases use fixed doc ids (`s6`, `pr1`, `w1`), so a second `.set()` is an *update* — and the append-only blocks deny updates. The failure count even grew between runs (the new `ev1` write flipped its own create to an update next run). Fixed with `env.clearFirestore()` in `beforeAll`; suite is now 17/17 on repeat runs.

**Reflection:** A suite that only passes on a fresh daemon is not green — it is unrun twice. Create-vs-update semantics depend on hidden external state, so any backend-backed suite needs explicit state clearing at start (or unique ids per run).

**Distilled Principle:** Emulator/integration suites must be hermetic across runs: clear backend state at suite start, and treat "passes only on a fresh daemon" as a defect.

**Next Experiment:** Candidate TESTING.md note: emulator suites clear state in `beforeAll`; per-run unique ids as a second line of defense.

**Confidence:** Medium (failure count grew run-over-run — a clean reproduction)

**Scope:** Project (candidate Universal)

**Automation Opportunity:** Done — `env.clearFirestore()` in the suite.

## 2026-09-24 · Verification traps: stale frames and false-negative globs

**Experience:** The weight-display build hit two verification traps in one session. (1) `preview_screenshot` returned **stale compositor frames** — screenshots showed pre-change cards while `innerText` probes proved the new DOM was live; the webview only produces frames while the Preview tab is visible, and `preview_resize` holds only until the next navigation (re-apply silently no-ops after). Caught by cross-checking each frame against a DOM measurement of the same state; fixed by fresh-tab-per-capture with resize at tab birth, panel visible. (2) `glob "src/**/TodayScreen*"` reported **0 files** although `TodayScreen.test.tsx` was tracked at HEAD — `write_file` silently clobbered 5 existing tests. Caught by reconciling test counts after the change (258 expected vs 253 observed); restored via `git show HEAD:` and merged.

**Reflection:** Pixels and tool inventories both lie quietly. A screenshot is evidence only when it agrees with a programmatic probe of the same state, and "not found" from one tool is not absence — confirm through git before creating or overwriting a file, and always reconcile test counts after touching tests.

**Distilled Principle:** Never trust a single verification channel: pair every visual capture with a programmatic probe of the same state, and confirm file absence through git (`git ls-files`) before overwriting — tool-reported absence is not evidence of absence.

**Next Experiment:** Candidate TESTING.md note: screenshot sessions cross-check frames against DOM probes; before `write_file` on any path, run `git ls-files --error-unmatch` when the name might exist.

**Confidence:** Medium (two independent traps in one session, both caught by cross-checking)

**Scope:** Project (candidate Universal)

**Automation Opportunity:** Yes — pre-overwrite existence check habit (candidate tool-level guard).

## 2026-09-24 · Roll a new lint out as a ratchet, not a wall

**Experience:** The className→CSS lint (closing the last candidate from the layout-smoke principle) found **39 orphan uses (32 file:class pairs) on its first run** — `tip`, `recoveryCopy`, `syncBadge`, `coachCard`, `sparkline`, and the whole `RestTimer`/`RecommendationCard` surfaces render markup with zero styling. Shipping the lint green immediately would have forced either a risky 32-class style sprint or a disabled lint. Instead the known debt became a committed baseline (`scripts/classname-lint-baseline.json`) and the gate fails only on NEW orphans — CLI (`npm run lint:classnames`, inside `npm run lint`) and vitest wiring test both name `file:line:class`; `-- --update-baseline` is reserved for intentional burn-down.

**Reflection:** Rolling a lint over a codebase with pre-existing violations is a policy decision, not a tooling one. A wall forces bad trade-offs; a ratchet locks the door while debt is paid down deliberately. Two details keep it honest: the baseline is exact-match (fixing a class forces the baseline to shrink, so the ledger can't rot), and the checker's detection power is proven with synthetic red fixtures so a green baseline never masks a broken checker.

**Distilled Principle:** When a new lint would fail on pre-existing violations, ship it as a ratchet: committed baseline of current debt, hard failure on anything new, an exact-match test so fixes must shrink the baseline, and a loudly documented override path for intentional cases only.

**Next Experiment:** Burn down `scripts/classname-lint-baseline.json` by styling the 32 orphan classes one component at a time (coach cards → rest timer → sync badge → sparkline), re-measuring each with `npm run test:layout`; delete the file when empty.

**Confidence:** Medium (one strong data point — 39 findings — plus a generalizable rollout pattern)

**Scope:** Project (candidate Universal)

**Automation Opportunity:** Done — `scripts/lint-classnames.ts` + baseline ledger.

## 2026-09-24 · Push reminders: raw SW push, poll + dedupe, device wall clock

**Experience:** FCM workout reminders shipped (`30152b9`). Three decisions worth keeping: (1) the service worker handles `push` **raw** (`event.data.json()` with defensive shapes) instead of `firebase-messaging`'s `onBackgroundMessage` — the SDK would need hardcoded config in a committed file and a second SW at the same scope; raw handling keeps keys/config out of git and the SW dependency-free (pwa test now asserts no `importScripts`/`firebase` in sw.js). (2) Delivery is one `*/5` poller with a 15-minute catch-up window plus a per-token `reminderState` dedupe doc (exactly-once, jitter-proof) instead of per-user Cloud Scheduler jobs — far fewer moving parts at single-user scale. (3) Reminder wall clock comes from each device's saved IANA `timeZone` via `Intl` (DST-correct) — never a fixed offset. Also confirmed live: `Notification.requestPermission()` on a real click **blocks the page's main thread** in the embedded browser until the prompt is answered.

**Reflection:** Platform push APIs push you toward SDK sugar that assumes a build-injected config; the raw web standard underneath is simpler and safer here. Exactly-once delivery is cheaper as "wide window + dedupe guard" than as precision scheduling.

**Distilled Principle:** Prefer the raw web standard over SDK sugar when the sugar forces secrets or config into committed files; achieve exactly-once scheduled delivery with an idempotency guard and generous catch-up windows, not precise schedulers.

**Next Experiment:** Candidate: assert in CI that no Firebase config values appear in `public/` files; revisit per-user Cloud Scheduler jobs only if multi-device users report uneven delivery.

**Confidence:** Medium (three converging decisions, one session)

**Scope:** Project

**Automation Opportunity:** Yes — secret-scan gate for `public/`.

## 2026-09-24 · Pin behavior in render tests when auth gates the dev origin

**Experience:** The dev-only `?screen=` deep link shipped with its production half provable live (`?screen=settings` on web.app lands on TODAY — compiled out) but its dev half unprovable in the browser: (1) a `&`-backgrounded vite dev server died silently when the command shell exited — fixed by daemonizing with a python double-fork + `os.setsid()`; (2) Google sign-in on `localhost` is blocked by Firebase Auth Authorized Domains (`auth/unauthorized-domain`, caught by the app's own error copy). Replaced the blocked live check with a permanent jsdom render test (`src/screens/WorkoutFlow.test.tsx`): opens the screen by URL, syncs the URL on navigate, falls back on unknown values.

**Reflection:** Live-browser verification is the weakest link whenever auth/origin config gates the dev environment; render tests cover the same wiring forever instead of once. And shell `&` is not process detachment — the harness reaps the process group at command exit.

**Distilled Principle:** When a live check is blocked by environment auth, pin the behavior in a render test rather than changing production auth config to make the check pass; keep long-running dev processes alive with double-fork + setsid (never bare `&`).

**Next Experiment:** Candidate TESTING.md note: dev-server runs use double-fork + setsid, and localhost sign-in requires adding `localhost` to Firebase Auth Authorized Domains (console-only).

**Confidence:** Medium (two independent walls in one session, both with durable fixes)

**Scope:** Project

**Automation Opportunity:** No — the render test is the automation.

## 2026-09-24 · A class name in markup is not evidence of styling

**Experience:** The iPhone check found shipped layout breakage at narrow widths while 218 tests were green: the bottom nav overflowed horizontally (scrollWidth 426 vs 247 viewport), `.setRow`/`.feelRow`/`.weightRow`/`.cardTop` had **zero CSS rules** so Settings and workout rows rendered as jumbled inline content, `.exerciseCard` laid its many children in a flex row, inputs had no `font-size` (iOS Safari zooms on focus below 16px), selected `aria-pressed` states were invisible, and three flex inputs overflowed because flex items don't shrink below intrinsic min-width without `min-width: 0`. Fixed across `src/styles.css` (commits `cc75a06`, `3dad918`, `5947bc4`), each re-measured after deploy (`scrollWidth <= clientWidth` on TODAY, Settings, AI COACH).

**Reflection:** DOM-level tests assert structure and text, never layout; jsdom has no layout engine. Nothing had been rendered or measured at the target viewport before shipping, and nothing in the toolchain flags a `className` with no matching rule. Two defect classes recurred (missing rules; unshrinkable flex inputs).

**Distilled Principle:** Render and measure every screen at the narrowest supported viewport before shipping UI — browser-measured horizontal overflow (`scrollWidth > clientWidth`) is the check, and a class name in markup is not evidence the class is styled.

**Next Experiment:** Done 2026-09-24 (both halves) — `npm run test:layout` (Playwright, 320/390px, per screen, `tests/overflow.spec.ts` + dev-only `smoke.html` harness) caught a real grid overflow on its first run: `display: grid` auto tracks size to max-content and push cards past the viewport (fixed with `grid-template-columns: minmax(0, 1fr)`). Then `npm run lint:classnames` began flagging `className` values with no matching CSS rule — its first run found 39 orphan uses, rolled out as a ratchet baseline (see next entry).

**Confidence:** Medium (multiple independent defects of the same two classes in one audit)

**Scope:** Project (candidate Universal)

**Automation Opportunity:** Yes — Playwright overflow smoke + className↔CSS-rule lint.

## 2026-09-24 · Platform install flows are OS-versioned documentation

**Experience:** The iOS "Add to Home Screen" hint shipped copy for the iOS 15–18 flow. iOS 26 changed the flow ("Add to Home Screen" now offers *Web App* vs *Bookmark*), and Apple documents a share-sheet quirk where the option is missing until enabled via "Edit Actions". Separately, `appinstalled` never fires on iOS Safari, so the post-install thank-you toast was unreachable on the platform the hint targets. Fixed: hint copy covers the "Web App" choice and the Edit Actions fallback; the toast now also fires once on the first Home Screen launch (storage-safe try/catch for Safari private mode).

**Reflection:** We assumed install flows and install-detection events are stable across OS versions. They are OS-versioned vendor documentation and engine-specific behavior. Event-only detection silently misses platforms that never emit the event.

**Distilled Principle:** Validate platform-specific user instructions against the current OS vendor docs at write time and re-check on every major OS version; every event-based platform signal needs a non-event fallback for platforms that never emit it.

**Next Experiment:** Done 2026-09-24 — copy-assertion test locks the share-sheet label, the "Web App" install choice, and the Edit Actions fallback (`src/install/IosInstallHint.test.tsx`, "iOS share-sheet wording (locked)"). Remaining: re-verify against Apple's iPhone user guide at each iOS major release (next: iOS 27) and update the lock only when the OS UI changes. Localization addendum (2026-09-24): iOS localizes these labels per language (fr « Sur l'écran d'accueil », de „Zum Home-Bildschirm"), so translating instructions means quoting the OS's localized labels, not literally translating English ones — verify each against the localized vendor guide, and paraphrase (never quote) labels that can't be verified (`src/install/i18n.ts`).

**Confidence:** Low (observed once; strongly supported by Apple docs)

**Scope:** Project (candidate Universal)

**Automation Opportunity:** Yes — copy-assertion test in `src/install/IosInstallHint.test.tsx`.
