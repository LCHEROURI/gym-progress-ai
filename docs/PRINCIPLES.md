# Distilled Principles

Development principles distilled via `skills/progressive-distillation/SKILL.md`. Newest first. Distilled principles may add stricter guidance but must never weaken project safety, CI, security, deployment, or repository rules.

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

**Next Experiment:** Candidate automation: a Playwright smoke asserting `scrollWidth <= clientWidth` at 320/390px per screen (jsdom cannot measure layout), or a lint check flagging `className` values with no matching CSS rule. Until then, run the narrow-viewport probe per UI change.

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
