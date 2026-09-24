# Distilled Principles

Development principles distilled via `skills/progressive-distillation/SKILL.md`. Newest first. Distilled principles may add stricter guidance but must never weaken project safety, CI, security, deployment, or repository rules.

## 2026-09-24 · Platform install flows are OS-versioned documentation

**Experience:** The iOS "Add to Home Screen" hint shipped copy for the iOS 15–18 flow. iOS 26 changed the flow ("Add to Home Screen" now offers *Web App* vs *Bookmark*), and Apple documents a share-sheet quirk where the option is missing until enabled via "Edit Actions". Separately, `appinstalled` never fires on iOS Safari, so the post-install thank-you toast was unreachable on the platform the hint targets. Fixed: hint copy covers the "Web App" choice and the Edit Actions fallback; the toast now also fires once on the first Home Screen launch (storage-safe try/catch for Safari private mode).

**Reflection:** We assumed install flows and install-detection events are stable across OS versions. They are OS-versioned vendor documentation and engine-specific behavior. Event-only detection silently misses platforms that never emit the event.

**Distilled Principle:** Validate platform-specific user instructions against the current OS vendor docs at write time and re-check on every major OS version; every event-based platform signal needs a non-event fallback for platforms that never emit it.

**Next Experiment:** Re-verify install/share-sheet copy against Apple's iPhone user guide at each iOS major release (iOS 27), and add a test asserting the hint includes the current share-sheet label and the Edit Actions fallback.

**Confidence:** Low (observed once; strongly supported by Apple docs)

**Scope:** Project (candidate Universal)

**Automation Opportunity:** Yes — copy-assertion test in `src/install/IosInstallHint.test.tsx`.
