# Gym Progress AI — Product Specification

Mobile-first personal gym application for one user training three days per
week. The active screen behaves like a **digital gym clipboard**: large text,
large buttons, large checkboxes, large number inputs, minimal typing,
immediate autosave, effortless recovery. Multi-user support is a later
extension; everything is already namespaced per `uid`.

## 1. Navigation

Bottom navigation, thumb-reachable, five tabs:

**TODAY · HISTORY · PROGRESS · AI COACH · REPORTS**

Settings lives behind a small gear icon (top-right), not a tab.

## 2. Workout schedule

| Day | Workout |
|---|---|
| Monday | Strength + Bike |
| Wednesday | Balance + Strength |
| Friday | Full Body + Walk |
| Tue / Thu / Sat / Sun | RECOVERY DAY |

### Monday — Strength + Bike

1. Bike Warm-up — 5–8 minutes
2. Leg Press — 2 sets × 10 reps
3. Chest Press — 2 sets × 10 reps
4. Seated Row — 2 sets × 10 reps
5. Leg Curl — 2 sets × 8–10 reps
6. Bike — 10–15 minutes
7. Stretch — 5 minutes

### Wednesday — Balance + Strength

1. Bike Warm-up — 5–8 minutes
2. Leg Press — 2 sets × 10 reps
3. Lat Pulldown — 2 sets × 10 reps
4. Leg Extension OR Step-ups — 2 sets × 8–10 reps
5. Seated Shoulder Press — 2 sets × 8 reps
6. Cable Core / Pallof Press — 2 sets × 10 each side
7. Treadmill Walk — 15 minutes
8. Supported Balance — 2 rounds × 10–20 seconds each leg

### Friday — Full Body + Walk

1. Bike or Treadmill Warm-up — 5–8 minutes
2. Leg Press — 2 sets × 10 reps
3. Chest Press — 2 sets × 10 reps
4. Seated Row — 2 sets × 10 reps
5. Leg Curl — 2 sets × 8–10 reps
6. Cable Core or Ab Machine — 2 sets × 10 reps
7. Treadmill or Bike — 10–15 minutes
8. Stretch — 5 minutes

(These three templates match the user's printed "Large-Print Gym Workout
Sheet" exactly; the sheet is the source of truth for wording.)

## 3. Today screen

```
TODAY
Wednesday · September 23

BALANCE + STRENGTH
3 of 8 complete

[ CONTINUE WORKOUT ]     (or [ START WORKOUT ] when not started)

… exercise cards …
```

On a recovery day:

```
RECOVERY DAY

Next workout:  Friday — Full Body + Walk
Last completed: Wednesday — Balance + Strength · 8 of 8
This week:      1 of 3 workouts complete
Tip (optional): "A gentle walk today can help tomorrow's session."
```

## 4. Active workout screen (the clipboard)

One screen for the whole workout. One card per exercise, large and stacked:

```
[✓] LEG PRESS

TARGET               2 × 10

LAST TIME            70 lb · 10 reps · 10 reps · Difficulty: GOOD

AI SUGGESTION        75 lb            (blue accent)
  WHY?  "You completed both sets at the target repetitions and rated the
         previous resistance as comfortable. A small increase may be
         reasonable."
  [ USE 75 LB ]   [ KEEP 70 LB ]   [ CHOOSE ANOTHER ]

TODAY'S WEIGHT       [ − ] [ 75 ] lb [ + ]     (tap number to type)

SET 1   [ 10 ] reps
SET 2   [ 10 ] reps

HOW DID IT FEEL?     [ EASY ] [ GOOD ] [ HARD ]
PAIN / DISCOMFORT?   [ NONE ] [ MILD ] [ STOPPED ]

[ COMPLETE EXERCISE ]      → turns green
```

Cardio/stretch/balance cards show duration or round inputs instead of
weight/sets (e.g. Bike 10–15 minutes → a minutes field).

After each strength set the app offers the **rest timer** (default 75 s;
choices 60 / 75 / 90) with START · PAUSE · RESET · SKIP.

### Weight input rules

- Large stepper `[ − ] 75 lb [ + ]` with direct numeric entry also allowed.
- Increment per exercise is configurable ("machine increment", default:
  upper body 5 lb, lower body 10 lb) because machines differ.
- Saves to Firestore immediately. The most recently used weight per exercise is
  remembered and prefilled as TODAY'S WEIGHT.
- Every card shows LAST (previous weight) and AI SUGGESTION side by side.

### Autosave rules

Autosave on every tap: weight, reps, exercise completion, difficulty, symptoms,
notes, workout start time. No SAVE button anywhere in routine entry. The
workout survives refresh, browser close, network loss, and app restart
(Firestore offline persistence + a local in-flight mirror). A small chip shows
**SAVED · SYNCING · OFFLINE**.

## 5. Workout completion

```
WORKOUT COMPLETE

Exercises:        7 / 7
Strength sets:    8
Cardio:           20 minutes
Workout duration: 46 minutes

AI SESSION SUMMARY (blue)
"You completed all planned strength exercises. Leg press increased from 70 to
 75 lb while maintaining target repetitions. Chest press remained unchanged."
```

## 6. History screen

Chronological list:

```
SEP 23 · Wednesday — Balance + Strength · 8/8 completed
SEP 21 · Monday    — Strength + Bike    · 7/7 completed
```

Tapping a session opens its detail: each exercise with weight, sets, reps,
difficulty, cardio duration, notes, the AI recommendation and whether it was
accepted or rejected.

## 7. Progress dashboard

- TOTAL WORKOUTS · WORKOUTS THIS MONTH · CURRENT WEEK COMPLETION RATE ·
  TOTAL CARDIO MINUTES · PERSONAL RECORDS
- Per machine (Leg Press, Chest Press, Seated Row, Lat Pulldown, Leg Curl,
  Shoulder Press, Cable Core / Ab Machine): starting weight, current weight,
  highest weight, total sessions, latest result, recent trend, and a
  DATE-versus-WEIGHT graph (hand-rolled SVG, large-print style).
- Personal records are detected from real Firestore history only and shown as
  `NEW PERSONAL BEST — LEG PRESS · 90 lb · October 12`. A PR is never claimed
  without the history to prove it.

## 8. AI Coach screen

Chat with Gemini over your real history. It must retrieve relevant Firestore
records before answering and may never invent history. Supported questions
include: "What weight should I use today?", "How am I progressing on leg
press?", "Show my chest press improvement.", "Which exercise has improved
most?", "Which exercise has stalled?", "How many workouts did I complete this
month?", "How much cardio did I do?", "What should I focus on next week?"
Insufficient data → "I don't have enough workout history yet."

## 9. Weekly reports

Generated Sundays by Cloud Scheduler → Cloud Function: collect the week's
workouts, compute stats/cardio/weight changes/PRs/missed workouts in
deterministic code, ask Gemini for a short analysis of those computed facts,
save permanently.

```
WEEKLY FITNESS REPORT — September 21–27

PLANNED WORKOUTS: 3      COMPLETED: 3      COMPLETION: 100%

STRENGTH
Leg Press   70 → 75 lb
Chest Press 50 → 50 lb
Seated Row  60 → 65 lb

CARDIO  Total: 42 minutes

PERSONAL RECORDS  Leg Press 75 lb

AI OBSERVATIONS
"You completed all scheduled workouts this week."
"You increased resistance on two exercises."
"Chest press remained stable."

NEXT WEEK
Leg Press:  Consider maintaining 75 lb until it feels comfortable.
Chest Press: Continue 50 lb.
Seated Row: Consider a small increase if target repetitions remain comfortable.
```

Reports page: THIS WEEK + PAST REPORTS (all stored permanently).

## 10. Reminders

Optional, never blocks V1: configurable Monday/Wednesday/Friday times in
Settings, delivered by Firebase Cloud Messaging when push is implemented.

## 11. Settings

Weight unit (LB / KG) · Large Text (ON by default / OFF) · AI Coach (ON/OFF) ·
Rest timer (60 / 75 / 90 s) · Workout reminders (Mon/Wed/Fri times) · Machine
weight increments per exercise.

## 12. Design system

Mobile first. Large typography (Large Text ON by default), simple cards, high
contrast, white background, dark text. Color semantics: **green = complete,
blue = AI, orange = caution, red = safety warning only**. Avoid tiny icons,
dense dashboards, unnecessary animations, complicated menus. Keyboard
navigation, screen-reader labels, accessible contrast, large tap targets
throughout.

## 13. Error handling

Never silently fail. Errors are understandable and actionable, e.g. "Your
workout is saved locally. We will sync when your connection returns."

## 14. Data integrity

- Demo/seed data exists only behind dev flags and emulator runs — never mixed
  into production history.
- AI output storage (audit trail) per `docs/AI-SAFETY.md`.
- Historical workout data is preserved forever (AGENTS.md rules 10–12).

## 15. Final acceptance criteria

1. Opens on a phone (iPhone-first).
2. Recognizes today's workout (or RECOVERY DAY).
3. START WORKOUT shows the correct exercises.
4. Previous machine weight is visible per exercise.
5. Today's weight and reps are enterable with big controls.
6. Exercises can be checked off; progress saves immediately.
7. Reload keeps the workout intact.
8. Returning days later shows real history.
9. Progress charts render from real data.
10. Gemini analyzes real history and suggests a conservative next resistance
    with a stated reason.
11. Accept/reject works and is recorded.
12. Weekly report generates from real Firestore data and is stored permanently.
13. Works well on iPhone; installable as a PWA.
14. Firestore rules prevent any cross-user read (tested).
15. All tests pass; `npm run check` green.
16. Deployment to Firebase Hosting succeeds.
