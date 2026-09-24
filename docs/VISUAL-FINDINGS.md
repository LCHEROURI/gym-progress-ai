# Visual findings — iPhone pass at 390×844

Date: 2026-09-24 · Viewport: 390×844 (verified per tab, fresh-tab recipe) · Harness: `smoke.html?screen=` (dev-only) · Method: DOM audit probe (overflow, tap targets < 44px, inputs < 32px, clipped text) + screenshot cross-checked against the live DOM.

Coverage: 9/9 screens probed at 390×844; 8/9 pixel-verified (workout frame stalled — its finding is DOM-measured, not pixel-seen). Row/card markup on history/progress/coach/reports fixtures renders error/empty states only.

## Findings (prioritized)

| ID | Sev | Screen(s) | Finding | Cause | Fix |
|----|-----|-----------|---------|-------|-----|
| V1 | P1 | workout | AI decision buttons USE / KEEP / CHOOSE ANOTHER are 22px tall (need ≥ 44px tap target) | `.coachButtons` unstyled (classname baseline debt) | style `.coachButtons` buttons ≥ 44px, burn the baseline entries |
| V2 | P2 | history, reports | Error copy and "Loading…" visible at the same time (dual data state) | error state renders alongside the list loading line | render exactly one data state |
| V3 | P2 | coach | Disabled SEND is white text on pale green (~1.5:1 contrast) | disabled button style | darker disabled bg or muted dark text |
| V4 | P3 | coach | 2-line suggestion chip centers its text; 1-line chips are left-aligned | chip text alignment inconsistent | consistent `text-align: left` |
| V5 | P3 | today | Double vertical gaps after date rows ("September 25", "September 21") | `.recoveryCopy` unstyled — default `<p>` margins double up | style `.recoveryCopy` margin, burn baseline entry |
| V6 | P3 | today-plan | Title→target gap inside plan cards ~35px vs 16–20px elsewhere | `.cardTop` spacing | normalize the gap |
| V7 | P3 | complete | Summary values sit flush right, ~200px from their labels | `dl` space-between | closer value column or divider (nit) |

## Status update (2026-09-24 identity pass)

The visual identity pass (soft cards, tokens, icon set) closed **V1** (coach decision buttons now 48px), **V3** (disabled SEND restyled — readable gray on light gray, cascade-pinned last), **V4** (chips left-aligned), **V5** (fixed earlier when `.recoveryCopy` got its rule), and **V7** (summary rows now carry hairline dividers). **V6** improved (card gaps tightened 12→10px, `.cardTop` gap 12→8px) — re-measure on the next pass.

## Clean screens

- settings: zero violations across all 1862px (toggles show selected state; time inputs clean).
- progress: zero violations (error state fits one viewport).
- complete: zero violations; summary + DONE read cleanly.

## Closed earlier this pass

- Bottom-nav labels broke mid-word at 390px (`HISTOR/Y`, `PROGRE/SS`) — **fixed** in `321f413` (nowrap + `min(14px, 2.3vw)` sizing + 44px gear cell). Verified one-line at 320 and 390.

## Not defects (checked)

- Complete capture showed a few-pixel green sliver near the nav: DOM dump shows 24 elements, no toast/stray node (DONE is the only green surface) — compositing artifact, not filed.
- Blue segment above the nav in every frame is the active-tab indicator — working as designed.
- GENERATE LAST WEEK'S REPORT wraps to 2 lines but keeps a ≥ 44px target — fine.

## Automation gap exposed

`npm run test:layout` was 20/20 green with V1 live: the overflow smoke asserts horizontal overflow only, never tap-target size. Candidate: extend the Playwright smoke with a ≥ 44px `button`/`a` assertion (distilled in `docs/PRINCIPLES.md`).
