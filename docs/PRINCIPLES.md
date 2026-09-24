# Distilled Principles

Development principles distilled via `skills/progressive-distillation/SKILL.md`. Newest first. Distilled principles may add stricter guidance but must never weaken project safety, CI, security, deployment, or repository rules.

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
