# Gym Progress AI

A mobile-first personal gym companion. One clipboard-style screen shows today's
workout; weights, reps, and difficulty save the instant you tap; and a Gemini
coach suggests your next weight from your real history — **suggestions only,
you always decide**.

Built on the Google ecosystem only: React + TypeScript + Vite + Firebase
(Auth, Firestore, Hosting, Functions, Cloud Scheduler, optional Messaging) +
Google Gemini through server-side Genkit flows.

Agents: read [`AGENTS.md`](AGENTS.md) (constitution) and [`WORKFLOW.md`](WORKFLOW.md)
(full procedure) before touching this repository.

---

## Identity map — one name, one thing

| Thing | Name | Location |
|---|---|---|
| This application's repository + directory | `gym-progress-ai` | `~/gym-progress-ai` (standalone git repo) |
| GitHub remote (private) | `gym-progress-ai` | `LCHEROURI/gym-progress-ai` |
| Firebase / Google Cloud project | `gym-progress-ai-lcherouri` | provisioned in Phase 2 (README §3) — the plain id `gym-progress-ai` was globally taken; repo and directory keep their name |
| Repo template + workflow constitution | `universal-vibe-coding-bootstrap` | `LCHEROURI/universal-vibe-coding-bootstrap` |
| Unrelated playground (never touched here) | `webapp-starter` | inside the `cook-with-freebuff` checkout |

Nothing here lives inside another repository. Full paths in every report.

## 1. Application purpose

See a real, physical gym routine (Mon/Wed/Fri) digitized as a large-print
clipboard: check exercises off, enter machine weights and reps with big
controls, see last time's numbers, get a conservative AI weight suggestion with
a reason, track progress, read history, and receive a weekly AI report.

## 2. Architecture

See `docs/ARCHITECTURE.md` for the full design and diagrams. Summary:

- **Client** — Vite + React + TypeScript PWA. Local-first: Firestore offline
  persistence + write-through autosave + a SAVED / SYNCING / OFFLINE indicator.
- **Server** — Firebase Cloud Functions (2nd gen) running Genkit flows for
  Gemini. All AI is server-side; the API key never reaches the browser.
- **Context pipeline** — intent → targeted Firestore retrieval → deterministic
  calculations in plain code → Gemini interprets the computed facts →
  structured answer. Gemini never computes critical totals.

## 3. Firebase setup

1. Create the Firebase project `gym-progress-ai-lcherouri` (Firebase console or
   `firebase projects:create gym-progress-ai-lcherouri`).
2. Upgrade to the **Blaze** plan — Cloud Functions and Cloud Scheduler require
   it. At single-user volume the cost is effectively zero.
3. Enable **Authentication → Google** sign-in.
4. Create the **Firestore** database (production mode; rules ship in this repo).
5. Register a **Web app** and copy its config into `.env.local` (section 9).
6. Enable **App Check** (reCAPTCHA v3 provider) and register the web app.
7. When the project exists, record it in `apps.yml` (the registry row is added
   only once its facts are real — never invented in advance).
8. Deploy: `npm run deploy` (Hosting + Functions + Rules + Indexes), on
   explicit authorization only.

## 4. Gemini setup

1. Create a Gemini API key in Google AI Studio (or use Vertex AI).
2. Store it in **Secret Manager** as `GEMINI_API_KEY`; the Functions runtime
   reads it via `defineSecret`. Never in client code, `.env.local`, or git.
3. Model names live in one config table (`functions/src/ai/models.ts`),
   overridable by environment variable — never hardcoded at call sites.

## 5. Local development

```bash
npm install
npm run dev        # Vite dev server (http://localhost:5173)
npm run check      # typecheck → lint → test → build
```

Copy `.env.example` to `.env.local` and fill in the web-app config values.

## 6. Emulator setup

```bash
npm run emulators          # Auth + Firestore + Functions emulators
npm run test:emulator      # rules + integration tests against the emulators
```

Emulator development never touches production data. Demo seeds run only under
the emulators or explicit dev flags — never in production.

## 7. Testing

```bash
npm test                   # Vitest units (node + jsdom)
npm run test:emulator      # Firestore rules + Functions integration
npm run check              # the full green gate
```

The complete matrix lives in `docs/TEST-PLAN.md`.

## 8. Deployment

```bash
npm run check              # must be green first
npm run deploy             # firebase deploy (Hosting, Functions, Rules, Indexes)
```

Deployment happens only on explicit instruction — never automatically. CI
includes the reusable Firebase Hosting workflow (OIDC deployer) from the
bootstrap template.

## 9. Environment variables

`.env.local` (client, non-secret — values from the Firebase web app):

| Name | Purpose |
|---|---|
| `VITE_FIREBASE_API_KEY` | web API key (referrer-restricted) |
| `VITE_FIREBASE_AUTH_DOMAIN` | auth domain |
| `VITE_FIREBASE_PROJECT_ID` | `gym-progress-ai-lcherouri` |
| `VITE_FIREBASE_STORAGE_BUCKET` | storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | sender id |
| `VITE_FIREBASE_APP_ID` | web app id |
| `VITE_USE_EMULATOR` | `1` = point the SDKs at the emulators |

Secrets (server only — Secret Manager, never `.env.local`):

| Name | Purpose |
|---|---|
| `GEMINI_API_KEY` | Gemini access for the Genkit flows |

## 10. Troubleshooting

- **Sign-in popup shows "The requested action is invalid."** — the web API
  key's HTTP-referrer allowlist is missing the Firebase auth-handler origin:
  add `https://gym-progress-ai-lcherouri.firebaseapp.com/*` plus explicit
  `http://localhost:5173/*` and `http://localhost:5173` forms. Bare
  `http://localhost:*/*` port wildcards do not match.
- **API returns 401 while sign-in looks fine** — the server cannot verify ID
  tokens (missing/invalid server credentials); check the Functions/Secret
  Manager setup, then the browser network trail.
- **"Offline" chip stuck** — Firestore offline persistence is working; writes
  sync when connectivity returns. A refresh never loses entered data.
- **AI says "I don't have enough workout history yet."** — correct behavior
  under thin data; the app never fabricates history.
- **`Universal bootstrap check` fails in CI** — a required safety file or
  marker is missing; run `bash scripts/verify-bootstrap.sh` locally to see
  which one.

---

## Repository infrastructure (universal bootstrap)

This repository was created from `LCHEROURI/universal-vibe-coding-bootstrap`
so the safety constitution exists before any application code. Preserved as-is:

- `AGENTS.md` — universal constitution + this project's rules (merged below the
  template's marker line, as the template prescribes).
- `WORKFLOW.md` — the full 43-section safety workflow; governs every
  substantive, security-sensitive, or deployment-adjacent task.
- `BOOTSTRAP_PROMPT.md`, `NEW_APP_SETUP.md` — session-start prompt and setup
  screens.
- `scripts/` — `verify-bootstrap.sh` (CI verifier), `install-bootstrap.sh`,
  `create-repo-from-template.sh`, `configure-firebase-app.sh`.
- `.github/workflows/bootstrap-check.yml` — runs the verifier on every push/PR
  to `main`; `.github/workflows/firebase-hosting-reusable.yml` — OIDC-based
  Hosting deploy workflow for later phases.
- `skills/progressive-distillation/SKILL.md` — reflection workflow for
  meaningful failures and discoveries.
- `apps.yml` — central app registry (the `gym-progress-ai` row is added when
  the Firebase project exists).

Boundary rule (from the constitution): a directory name, preview URL, Firebase
project, or prior conversation never establishes repository identity — always
verify the Git root and remote first.
