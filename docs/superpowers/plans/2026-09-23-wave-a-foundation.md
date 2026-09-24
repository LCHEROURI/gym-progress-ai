# Wave A — Foundation (Phases 2–4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Gym Progress AI a working Google sign-in on `gym-progress-ai-lcherouri` and default-deny Firestore rules proven by emulator tests — the foundation every later wave stands on.

**Architecture:** A Vite + React + TypeScript PWA signs in with Google via Firebase Auth (configured declaratively in `firebase.json` and pushed with `deploy --only auth`), and talks only to Firestore paths its owner rule allows. Emulator-first: every auth/rules behavior is demonstrated against the Firebase Emulator Suite before any production path exists.

**Tech Stack:** Vite 6, React 19, TypeScript 5.7 (strict), firebase ^11 (web SDK), Zod 3, Vitest 3 + Testing Library + jsdom, `@firebase/rules-unit-testing`, Firebase CLI (`npx -y firebase-tools@latest`), Node 22, npm.

## Requirements (PRD)

**Problem:** A personal gym app must know who the lifter is before it can hold their history, and it must prove no one else can read that history.

**Goals:**
1. The owner signs in with Google (the recommended default provider) on web.
2. Every Firestore path is owner-only; everything else is denied by default.
3. A fresh checkout runs `npm run check` green and `npm run test:emulator` green.

**Requirements:**
- R1: Google Sign-In is the only V1 provider. Anonymous access is forbidden (PROJECT-SPEC §14; AGENTS.md rule 5). Email/password may come later.
- R2: `localhost` (host name only — never `http://localhost:PORT`) is an authorized sign-in domain.
- R3: Sign-in failures show honest, actionable copy (PROJECT-SPEC §13).
- R4: Firestore rules: default deny; `request.auth.uid == uid` on every `users/{uid}` path; AI/derived collections (`aiRecommendations`, `weeklyReports`, `personalRecords`, `exerciseStats`) are read-only for the owner and writable only server-side (AGENTS.md rule 3; DATA-MODEL rules sketch).
- R5: Session writes validate `status` against `not_started | in_progress | completed | abandoned` (DATA-MODEL enums).
- R6: Secrets never enter git (`.env.local` gitignored; `.env.example` holds names only).
- R7: The universal bootstrap gate keeps passing on every commit (`scripts/verify-bootstrap.sh`).

**Success criteria (mapped):**
- PROJECT-SPEC §15.14 ("Firestore rules prevent another user from reading my data (tested)") → Task 6 tests `cross-user read denied`, `unauthenticated denied`.
- PROJECT-SPEC §15.15 ("All tests pass; npm run check green") → Tasks 3–6 gates.
- PROJECT-SPEC §15.1–3 (app opens, recognizes today's workout, start) → Waves B–C plans (out of scope here).
- Brief Phases 2–4 → Tasks 1–2 (Phase 2), Tasks 3–5 (Phase 3), Task 6 (Phase 4).

## Global Constraints

- Firebase project id `gym-progress-ai-lcherouri` (plain `gym-progress-ai` is globally taken); repo/directory stay `gym-progress-ai` (AGENTS.md identity map).
- TypeScript strict; no `any` without a written reason beside it (AGENTS.md rule 2).
- Zod validates every external boundary (AGENTS.md rule 2).
- Components use controlled inputs with `useState`/reducers; no form libraries (AGENTS.md rule 2).
- Component tests carry `// @vitest-environment jsdom`; default environment is node (AGENTS.md rule 4).
- `npm run check` = typecheck → lint → test → build must pass before any task is called done (AGENTS.md rule 4).
- `bash scripts/verify-bootstrap.sh` must print `PASS` on every commit (AGENTS.md rule 7; CI runs it on push).
- Commit steps run only with the user's explicit commit authorization (AGENTS.md authorization gates); stop at the gate otherwise.
- `deploy --only auth` (Task 2) and `deploy --only firestore:rules` (Task 6) are the only deployments in this plan; nothing else deploys.
- No billing changes (project is on the Spark plan; Cloud Functions need Blaze in Wave D — out of scope here).
- Every number sent to Gemini is computed in deterministic code; missing data stays missing (AGENTS.md rules 11 — applies from Wave D on, listed here because prompts/tests must never drift).

## File Structure

| Path | Responsibility |
|---|---|
| `docs/superpowers/plans/2026-09-23-wave-a-foundation.md` | this plan |
| `.firebaserc` | maps `default` → `gym-progress-ai-lcherouri` |
| `firebase.json` | auth provider config, firestore rules/indexes paths, emulator ports |
| `.env.example` | the seven non-secret client env names |
| `.env.local` | real web-app config (gitignored, never committed) |
| `package.json` | merged toolchain: Vite/React/TS/Vitest + the template's `test` script |
| `vite.config.ts` | React plugin + Vitest include patterns |
| `tsconfig.json` | strict TS for browser + tests |
| `index.html`, `src/main.tsx`, `src/App.tsx` | app shell |
| `src/shared/env.ts` | `parseEnv` — Zod-validated env loading |
| `src/data/firebase.ts` | `initFirebase` — SDK init + emulator wiring |
| `src/auth/errors.ts` | `SIGN_IN_*` copy + `authErrorMessage` |
| `src/auth/useAuthSession.ts` | auth state hook |
| `src/screens/LoginPage.tsx` | Google sign-in screen |
| `firestore.rules` | default-deny + owner rules + session status enum |
| `firestore.indexes.json` | empty index manifest (queries come in Wave B) |
| `tests/firestore.rules.test.ts` | emulator rules suite |
| `src/**/​*.test.ts(x)` | unit/component tests beside their sources |

---

### Task 1: Save this plan + Firebase foundation (APIs, project wiring, Firestore database)

**Files:**
- Create: `docs/superpowers/plans/2026-09-23-wave-a-foundation.md` (this document)
- Create: `.firebaserc`, `firebase.json`, `.env.example`
- Cloud: enable `firestore.googleapis.com`; create the `(default)` Firestore database

**Interfaces:**
- Consumes: nothing (first task).
- Produces: repo project-wiring (`.firebaserc`) that Tasks 2–6 rely on so every firebase-tools call resolves `gym-progress-ai-lcherouri` without `--project` flags.

- [ ] **Step 1: Save this plan document**

Write this file to `docs/superpowers/plans/2026-09-23-wave-a-foundation.md` (the content above and below this line is the document).

- [ ] **Step 2: Enable the Cloud Firestore API**

Run: `gcloud services enable firestore.googleapis.com --project gym-progress-ai-lcherouri`
Expected: exit 0 (an operations/*/done response). This unblocks Task 1 Step 5 — the 403 "Cloud Firestore API has not been used in project … or it is disabled" was measured on 2026-09-23.

- [ ] **Step 3: Create `.firebaserc`**

```json
{
  "projects": {
    "default": "gym-progress-ai-lcherouri"
  }
}
```

- [ ] **Step 4: Create `firebase.json`**

Auth block format is the `firebase-auth-basics` skill's (Google only; anonymous deliberately omitted — R1; `authorizedDomains` bare host names — R2):

```json
{
  "auth": {
    "authorizedDomains": ["localhost"],
    "providers": {
      "googleSignIn": {
        "oAuthBrandDisplayName": "Gym Progress AI",
        "supportEmail": "cherouri@gmail.com"
      }
    }
  },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

- [ ] **Step 5: Create the `(default)` Firestore database**

Run: `npx -y firebase-tools@latest firestore:databases:create "(default)" --location nam5`
Expected: exit 0, database created. (The earlier `projects/null` failure was the missing `.firebaserc` from Step 3 — measured 2026-09-23.)

Run: `npx -y firebase-tools@latest firestore:databases:list`
Expected: one row, `"(default)"`, location `nam5`, state `ACTIVE`.

- [ ] **Step 6: Create `.env.example`**

```env
# Client config — copy to .env.local and fill from:
#   npx -y firebase-tools@latest apps:sdkconfig WEB <appId>
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
# 1 = point the SDKs at the local emulators
VITE_USE_EMULATOR=0
```

- [ ] **Step 7: Verify the task**

Run: `bash scripts/verify-bootstrap.sh`
Expected: `PASS: universal bootstrap verified at /Users/laredjchehrouri/gym-progress-ai`

Run: `git status --short`
Expected: only the four new files (`docs/superpowers/…`, `.firebaserc`, `firebase.json`, `.env.example`).

- [ ] **Step 8: Commit (requires the user's commit authorization)**

```bash
git add .firebaserc firebase.json .env.example docs/superpowers/plans/2026-09-23-wave-a-foundation.md
git commit -m "chore: wire Firebase foundation for gym-progress-ai-lcherouri"
```

---

### Task 2: Google Sign-In activation + web app registration + local env

**Files:**
- Modify: none (cloud config deploy + `.env.local`, which is gitignored)
- Test: none unit — verification is the measured cloud state in Steps 2 and 5

**Interfaces:**
- Consumes: `firebase.json` auth block + `.firebaserc` from Task 1.
- Produces: a working Google provider on the project (needed by Task 5's sign-in flow) and `.env.local` consumed by Task 4's `parseEnv`.

- [ ] **Step 1: Deploy the auth configuration (this is the skill-mandated enablement step)**

Run: `npx -y firebase-tools@latest deploy --only auth`
Expected: `Deploy complete!` — per the `firebase-auth-basics` skill this is REQUIRED after configuring `firebase.json`, and it auto-generates the OAuth clients for the app platforms. This is a config-only deploy to a project with no live app surface.

- [ ] **Step 2: Verify the Google provider is enabled (read-only REST probe)**

Run:
```bash
TOKEN=$(gcloud auth print-access-token)
curl -s -H "Authorization: Bearer $TOKEN" "https://identitytoolkit.googleapis.com/v2/projects/gym-progress-ai-lcherouri/defaultSupportedIdpConfigs" | python3 -c "import sys,json; d=json.load(sys.stdin); print([{k: c.get(k) for k in (\"name\",\"enabled\")} for c in d.get(\"defaultSupportedIdpConfigs\", [])])"
```
Expected: a list containing `{'name': '…/defaultSupportedIdpConfigs/google.com', 'enabled': True}`. (Probe `v2` first: the `v1` path measured 404 on 2026-09-23 while `identitytoolkit.googleapis.com` itself is enabled.)

- [ ] **Step 3: Register the web app**

Run: `npx -y firebase-tools@latest apps:create WEB "Gym Progress AI Web"`
Expected: `App created` plus an `App Id` of the form `1:777425611767:web:…`. Record the id.

- [ ] **Step 4: Write `.env.local` from the app config (values never printed)**

Run:
```bash
npx -y firebase-tools@latest apps:sdkconfig WEB <appId> > /tmp/gym-web.json
node -e "const fs=require('node:fs');const c=JSON.parse(fs.readFileSync('/tmp/gym-web.json','utf8'));const m={VITE_FIREBASE_API_KEY:c.apiKey,VITE_FIREBASE_AUTH_DOMAIN:c.authDomain,VITE_FIREBASE_PROJECT_ID:c.projectId,VITE_FIREBASE_STORAGE_BUCKET:c.storageBucket,VITE_FIREBASE_MESSAGING_SENDER_ID:c.messagingSenderId,VITE_FIREBASE_APP_ID:c.appId,VITE_USE_EMULATOR:'0'};fs.writeFileSync('.env.local',Object.entries(m).map(([k,v])=>k+'='+v).join('\n')+'\n');console.log('wrote .env.local with names:',Object.keys(m).join(','))"
```
Expected: `wrote .env.local with names: VITE_FIREBASE_API_KEY,…VITE_USE_EMULATOR` (names only in the transcript).

- [ ] **Step 5: Verify the task**

Run: `git check-ignore .env.local`
Expected: prints `.env.local` (proves the secret file cannot be committed — R6).

Run: `npx -y firebase-tools@latest apps:list`
Expected: one WEB row `Gym Progress AI Web` under `gym-progress-ai-lcherouri`.

Run: `grep -oE "^[A-Z_]+" .env.local | sort`
Expected: exactly the seven names from `.env.example`.

- [ ] **Step 6: No commit**

`.env.local` is gitignored; cloud state is not a repo artifact. Report the deployed auth config in the task summary instead.

---

### Task 3: Vite + React + TypeScript toolchain merged into the template `package.json`

**Files:**
- Modify: `package.json` (keep `type: module` and the template's `test` script semantics)
- Create: `vite.config.ts`, `tsconfig.json`, `.eslintrc.json`, `index.html`, `src/main.tsx`, `src/App.tsx`
- Test: `src/App.test.tsx`
- Modify: `.gitignore` (append missing entries if the scan in Step 2 finds them absent)

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces: `App(): ReactElement` (default export of `src/App.tsx`) consumed by Task 5, and the `npm run check` gate all later tasks extend.

- [ ] **Step 1: Replace `package.json` with the merged toolchain**

```json
{
  "name": "gym-progress-ai",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:emulator": "RUN_EMULATOR_TESTS=1 vitest run --no-file-parallelism tests/firestore.rules.test.ts",
    "check": "npm run typecheck && npm run lint && npm run test && npm run build",
    "emulators": "npx -y firebase-tools@latest emulators:start --only auth,firestore,ui"
  },
  "dependencies": {
    "firebase": "^11.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@vitejs/plugin-react": "^4.4.0",
    "eslint": "^8.57.1",
    "eslint-plugin-react-hooks": "^5.0.0",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.2.7"
  }
}
```

Run: `npm install`
Expected: exit 0. (The existing `scripts/bootstrap-scripts.test.ts` keeps passing under the same `vitest run`.)

- [ ] **Step 2: Check `.gitignore` covers build and secret artifacts**

Run: `grep -cE "^(node_modules/|dist/|\.env\*\.local)$" .gitignore`
Expected: `3`. If lower, append exactly these lines and re-run:

```
node_modules/
dist/
.env*.local
```

- [ ] **Step 3: Write the failing smoke test**

`src/App.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders the app heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Gym Progress AI");
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — `Failed to resolve import "./App"` (module does not exist yet).

- [ ] **Step 5: Write the minimal implementation**

`src/App.tsx`:

```tsx
export default function App() {
  return (
    <main>
      <h1>Gym Progress AI</h1>
    </main>
  );
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Gym Progress AI</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`vite.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
  },
});
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "incremental": true
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

`.eslintrc.json`:

```json
{
  "root": true,
  "env": { "browser": true, "es2022": true },
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint", "react-hooks"],
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended", "plugin:react-hooks/recommended"],
  "ignorePatterns": ["dist", "node_modules"]
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS — 1 test, 0 failures.

- [ ] **Step 7: Run the full gate**

Run: `npm run check`
Expected: typecheck exit 0, lint 0 problems, `vitest run` all suites green (including `scripts/bootstrap-scripts.test.ts`), `vite build` exit 0.

- [ ] **Step 8: Commit (requires the user's commit authorization)**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json .eslintrc.json index.html src/ .gitignore
git commit -m "feat: add Vite + React + TypeScript toolchain with smoke test"
```

---

### Task 4: Env schema + Firebase client init (TDD)

**Files:**
- Create: `src/shared/env.ts`, `src/data/firebase.ts`
- Test: `src/shared/env.test.ts`

**Interfaces:**
- Consumes: `.env.local` names from Task 2.
- Produces:
  - `parseEnv(raw: Record<string, string | undefined>): AppEnv` (throws `EnvError` listing missing names)
  - `type AppEnv = { apiKey: string; authDomain: string; projectId: string; storageBucket: string; messagingSenderId: string; appId: string; useEmulator: boolean }`
  - `initFirebase(env: AppEnv): { auth: Auth; db: Firestore }` — memoized; attaches emulators when `useEmulator`

- [ ] **Step 1: Write the failing tests**

`src/shared/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "./env";

const complete = {
  VITE_FIREBASE_API_KEY: "k",
  VITE_FIREBASE_AUTH_DOMAIN: "a.example",
  VITE_FIREBASE_PROJECT_ID: "gym-progress-ai-lcherouri",
  VITE_FIREBASE_STORAGE_BUCKET: "b",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "1",
  VITE_FIREBASE_APP_ID: "app",
  VITE_USE_EMULATOR: "0",
};

describe("parseEnv", () => {
  it("parses a complete environment", () => {
    const env = parseEnv(complete);
    expect(env.projectId).toBe("gym-progress-ai-lcherouri");
    expect(env.useEmulator).toBe(false);
  });

  it("reads VITE_USE_EMULATOR=1 as true", () => {
    expect(parseEnv({ ...complete, VITE_USE_EMULATOR: "1" }).useEmulator).toBe(true);
  });

  it("throws EnvError naming every missing key", () => {
    try {
      parseEnv({ VITE_FIREBASE_API_KEY: "k" });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      expect((e as EnvError).missing).toContain("VITE_FIREBASE_PROJECT_ID");
      expect((e as EnvError).missing).toContain("VITE_FIREBASE_APP_ID");
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/shared/env.test.ts`
Expected: FAIL — `Cannot find module './env'`.

- [ ] **Step 3: Write the minimal implementation**

`src/shared/env.ts`:

```ts
import { z } from "zod";

export class EnvError extends Error {
  constructor(readonly missing: string[]) {
    super(`Missing environment configuration: ${missing.join(", ")}`);
    this.name = "EnvError";
  }
}

const schema = z.object({
  apiKey: z.string().min(1),
  authDomain: z.string().min(1),
  projectId: z.string().min(1),
  storageBucket: z.string().min(1),
  messagingSenderId: z.string().min(1),
  appId: z.string().min(1),
  useEmulator: z.boolean(),
});

export type AppEnv = z.infer<typeof schema>;

const KEYS: Record<string, string> = {
  VITE_FIREBASE_API_KEY: "apiKey",
  VITE_FIREBASE_AUTH_DOMAIN: "authDomain",
  VITE_FIREBASE_PROJECT_ID: "projectId",
  VITE_FIREBASE_STORAGE_BUCKET: "storageBucket",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "messagingSenderId",
  VITE_FIREBASE_APP_ID: "appId",
};

export function parseEnv(raw: Record<string, string | undefined>): AppEnv {
  const missing = Object.keys(KEYS).filter((k) => !raw[k]);
  if (missing.length > 0) throw new EnvError(missing);
  const flat = Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [v, raw[k]]));
  return schema.parse({
    ...flat,
    useEmulator: raw.VITE_USE_EMULATOR === "1",
  });
}
```

`src/data/firebase.ts`:

```ts
import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import type { Auth } from "firebase/auth";
import type { AppEnv } from "../shared/env";

let cached: { auth: Auth; db: Firestore } | null = null;

export function initFirebase(env: AppEnv): { auth: Auth; db: Firestore } {
  if (cached) return cached;
  const app = getApps()[0] ?? initializeApp({
    apiKey: env.apiKey,
    authDomain: env.authDomain,
    projectId: env.projectId,
    storageBucket: env.storageBucket,
    messagingSenderId: env.messagingSenderId,
    appId: env.appId,
  });
  const auth = getAuth(app);
  const db: Firestore = getFirestore(app);
  if (env.useEmulator) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  cached = { auth, db };
  return cached;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/shared/env.test.ts`
Expected: PASS — 3 tests, 0 failures.

- [ ] **Step 5: Run the full gate**

Run: `npm run check`
Expected: all four stages exit 0.

- [ ] **Step 6: Commit (requires the user's commit authorization)**

```bash
git add src/shared/env.ts src/shared/env.test.ts src/data/firebase.ts
git commit -m "feat: validate client env with Zod and init Firebase with emulator support"
```

---

### Task 5: `useAuthSession` + Google sign-in screen (TDD with mocked `firebase/auth`)

**Files:**
- Create: `src/auth/errors.ts`, `src/auth/useAuthSession.ts`, `src/screens/LoginPage.tsx`
- Test: `src/auth/useAuthSession.test.ts`, `src/screens/LoginPage.test.tsx`
- Modify: `src/App.tsx` (render LoginPage while signed out)

**Interfaces:**
- Consumes: `initFirebase` from Task 4.
- Produces:
  - `authErrorMessage(code?: string): string` and copy constants `SIGN_IN_CANCELLED`, `SIGN_IN_BLOCKED`, `SIGN_IN_FAILED`, `PROVIDER_DISABLED`
  - `useAuthSession(): { user: { uid: string; email: string | null } | null; state: "loading" | "ready" | "error"; error: string | null; signIn: () => Promise<void>; signOut: () => Promise<void> }`
  - `LoginPage(): ReactElement` — renders the "Continue with Google" button

- [ ] **Step 1: Write the failing tests**

`src/auth/useAuthSession.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const authState = vi.hoisted(() => ({ current: null as ((u: unknown) => void) | null }));
vi.mock("firebase/auth", () => ({
  getAuth: () => ({}),
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => void) => {
    authState.current = cb;
    return () => {};
  },
  signInWithPopup: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
  GoogleAuthProvider: class {},
}));
vi.mock("../data/firebase", () => ({
  initFirebase: () => ({ auth: {}, db: {} }),
}));

import { useAuthSession } from "./useAuthSession";

beforeEach(() => {
  authState.current = null;
});

describe("useAuthSession", () => {
  it("settles to ready with the user", async () => {
    const { result } = renderHook(() => useAuthSession());
    expect(result.current.state).toBe("loading");
    act(() => authState.current?.({ uid: "u1", email: "e@x" }));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.user?.uid).toBe("u1");
  });

  it("settles to ready with null user when signed out", async () => {
    const { result } = renderHook(() => useAuthSession());
    act(() => authState.current?.(null));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.user).toBeNull();
  });

  it("signIn surfaces mapped copy on auth/popup-closed-by-user", async () => {
    const { signInWithPopup } = await import("firebase/auth");
    vi.mocked(signInWithPopup).mockRejectedValueOnce({ code: "auth/popup-closed-by-user" });
    const { result } = renderHook(() => useAuthSession());
    await act(async () => {
      await expect(result.current.signIn()).rejects.toThrow("Sign-in was cancelled.");
    });
  });
});
```

`src/screens/LoginPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const signIn = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../auth/useAuthSession", () => ({
  useAuthSession: () => ({ user: null, state: "ready", error: null, signIn, signOut: vi.fn() }),
}));

import LoginPage from "./LoginPage";

describe("LoginPage", () => {
  it("offers Google sign-in", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });

  it("calls signIn and shows busy state", async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("button", { name: "Signing in…" })).toBeDisabled();
    expect(signIn).toHaveBeenCalledOnce();
  });

  it("shows the mapped message when sign-in fails", async () => {
    signIn.mockRejectedValueOnce(new Error("Sign-in was cancelled."));
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign-in was cancelled.");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/auth src/screens`
Expected: FAIL — `Cannot find module './useAuthSession'` and `Cannot find module './LoginPage'`.

- [ ] **Step 3: Write the minimal implementation**

`src/auth/errors.ts`:

```ts
export const SIGN_IN_CANCELLED = "Sign-in was cancelled.";
export const SIGN_IN_BLOCKED =
  "Sign in is blocked — add this site's host name to the Firebase project's Authorized Domains (host name only, no protocol or port), then retry.";
export const PROVIDER_DISABLED =
  "Google sign-in is not enabled in this Firebase project — enable Authentication → Sign-in method → Google, then reload.";
export const SIGN_IN_FAILED = "Could not sign in. Please try again.";

export function authErrorMessage(code?: string): string {
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/popup-blocked":
      return SIGN_IN_CANCELLED;
    case "auth/unauthorized-domain":
      return SIGN_IN_BLOCKED;
    case "auth/operation-not-allowed":
    case "auth/admin-restricted-operation":
      return PROVIDER_DISABLED;
    default:
      return SIGN_IN_FAILED;
  }
}
```

`src/auth/useAuthSession.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { initFirebase } from "../data/firebase";
import { parseEnv } from "../shared/env";
import { authErrorMessage } from "./errors";

export interface AuthSession {
  user: { uid: string; email: string | null } | null;
  state: "loading" | "ready" | "error";
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuthSession(): AuthSession {
  const [user, setUser] = useState<{ uid: string; email: string | null } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { auth } = initFirebase(parseEnv(import.meta.env));
    return onAuthStateChanged(
      auth,
      (u: User | null) => {
        setUser(u ? { uid: u.uid, email: u.email } : null);
        setState("ready");
      },
      () => {
        setState("error");
        setError("Could not reach sign-in. Check your connection and try again.");
      },
    );
  }, []);

  const signIn = useCallback(async () => {
    const { auth } = initFirebase(parseEnv(import.meta.env));
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      const code = (e as { code?: string }).code;
      throw new Error(authErrorMessage(code));
    }
  }, []);

  const signOut = useCallback(async () => {
    const { auth } = initFirebase(parseEnv(import.meta.env));
    await firebaseSignOut(auth);
  }, []);

  return { user, state, error, signIn, signOut };
}
```

`src/screens/LoginPage.tsx`:

```tsx
import { useState } from "react";
import { useAuthSession } from "../auth/useAuthSession";

export default function LoginPage() {
  const { signIn } = useAuthSession();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onClick = () => {
    setBusy(true);
    setMessage(null);
    void signIn()
      .catch((e: unknown) => setMessage(e instanceof Error ? e.message : "Could not sign in. Please try again."))
      .finally(() => setBusy(false));
  };

  return (
    <main>
      <h1>Gym Progress AI</h1>
      {message && <p role="alert">{message}</p>}
      <button type="button" onClick={onClick} disabled={busy}>
        {busy ? "Signing in…" : "Continue with Google"}
      </button>
    </main>
  );
}
```

`src/App.tsx` (replace from Task 3):

```tsx
import LoginPage from "./screens/LoginPage";
import { useAuthSession } from "./auth/useAuthSession";

export default function App() {
  const { user, state } = useAuthSession();
  return (
    <main>
      <h1>Gym Progress AI</h1>
      {state === "loading" && <p>Loading…</p>}
      {state === "ready" && !user && <LoginPage />}
      {state === "ready" && user && <p>Signed in as {user.email ?? user.uid}</p>}
    </main>
  );
}
```

Note for the executor: `App.test.tsx` from Task 3 still passes because the heading remains `h1` "Gym Progress AI"; add `vi.mock("./auth/useAuthSession", …)` returning `{ user: null, state: "ready", error: null, signIn: vi.fn(), signOut: vi.fn() }` if the hook's firebase import surfaces in that test's module graph.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/auth src/screens src/App.test.tsx`
Expected: PASS — 7 tests, 0 failures.

- [ ] **Step 5: Run the full gate**

Run: `npm run check`
Expected: all four stages exit 0.

- [ ] **Step 6: Manual smoke against the emulator (proves the popup path end-to-end)**

Run: `npm run emulators` (leave running), then `VITE_USE_EMULATOR=1 npm run dev`, open `http://localhost:5173`, click "Continue with Google".
Expected: the Auth Emulator sign-in sheet appears (fake Google account picker); choosing one lands on "Signed in as …".

- [ ] **Step 7: Commit (requires the user's commit authorization)**

```bash
git add src/auth src/screens src/App.tsx
git commit -m "feat: add Google sign-in with useAuthSession and LoginPage"
```

---

### Task 6: Firestore rules + emulator rules-test harness (TDD)

**Files:**
- Create: `firestore.rules`, `firestore.indexes.json`
- Test: `tests/firestore.rules.test.ts`
- Modify: `package.json` (add devDependency `@firebase/rules-unit-testing`)

**Interfaces:**
- Consumes: `.firebaserc` + `firebase.json` from Task 1; emulator config ports 8080/9099.
- Produces: `firestore.rules` deployed in Step 7 — the enforcement every Wave B–D repository call relies on.

- [ ] **Step 1: Add the rules-testing dependency**

Run: `npm install --save-dev @firebase/rules-unit-testing@^4.0.1`
Expected: exit 0.

- [ ] **Step 2: Create empty index and rules stubs**

`firestore.indexes.json`:

```json
{ "indexes": [], "fieldOverrides": [] }
```

`firestore.rules` (deny-all stub so the allow-tests are genuinely red first):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{allPaths=**} { allow read, write: if false; }
  }
}
```

- [ ] **Step 3: Write the failing rules tests**

`tests/firestore.rules.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

const enabled = process.env.RUN_EMULATOR_TESTS === "1";

describe.skipIf(!enabled)("firestore.rules", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "demo-gym-progress-ai",
      firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  const session = {
    templateId: "mon-strength-bike",
    workoutType: "strength_bike",
    scheduledDate: "2026-09-28",
    status: "in_progress",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it("lets an owner write their own session", async () => {
    const db = env.authenticatedContext("u1").firestore();
    await assertSucceeds(db.doc("users/u1/workoutSessions/s1").set(session));
  });

  it("rejects a session with an unknown status", async () => {
    const db = env.authenticatedContext("u1").firestore();
    await assertFails(
      db.doc("users/u1/workoutSessions/s2").set({ ...session, status: "finished" }),
    );
  });

  it("denies cross-user reads", async () => {
    const owner = env.authenticatedContext("u1").firestore();
    await assertSucceeds(owner.doc("users/u1/workoutSessions/s1").set(session));
    const intruder = env.authenticatedContext("u2").firestore();
    await assertFails(intruder.doc("users/u1/workoutSessions/s1").get());
  });

  it("denies unauthenticated access", async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(anon.doc("users/u1/workoutSessions/s1").get());
    await assertFails(anon.doc("users/u1/settings/profile").set({ weightUnit: "lb" }));
  });

  it("denies client writes to server-derived and AI collections", async () => {
    const db = env.authenticatedContext("u1").firestore();
    await assertFails(db.doc("users/u1/exerciseStats/leg-press").set({ lastWeight: 70 }));
    await assertFails(db.doc("users/u1/personalRecords/pr1").set({ exerciseKey: "leg-press" }));
    await assertFails(db.doc("users/u1/aiRecommendations/r1").set({ suggestedWeight: 75 }));
    await assertFails(db.doc("users/u1/weeklyReports/w1").set({ cardioMinutes: 42 }));
  });

  it("denies unrelated paths", async () => {
    const db = env.authenticatedContext("u1").firestore();
    await assertFails(db.doc("secrets/s1").set({ x: 1 }));
    await assertFails(db.doc("users").set({ x: 1 }));
  });
});
```

- [ ] **Step 4: Run the tests to verify the allow-cases fail**

Run: `npm run emulators` (leave running), then `npm run test:emulator`
Expected: FAIL — `lets an owner write their own session` and `denies cross-user reads` (deny-all stub), while the deny-cases pass. This is the red half of the cycle.

- [ ] **Step 5: Implement `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function owns(uid) { return signedIn() && request.auth.uid == uid; }
    function validStatus() {
      return request.resource.data.status in ["not_started", "in_progress", "completed", "abandoned"];
    }

    match /users/{uid} {
      allow read, write: if owns(uid);
      match /settings/{doc} { allow read, write: if owns(uid); }
      match /workoutTemplates/{id} { allow read, write: if owns(uid); }
      match /exerciseStats/{key} { allow read: if owns(uid); allow write: if false; }
      match /personalRecords/{id} { allow read: if owns(uid); allow write: if false; }
      match /aiRecommendations/{id} { allow read: if owns(uid); allow write: if false; }
      match /weeklyReports/{id} { allow read: if owns(uid); allow write: if false; }
      match /workoutSessions/{sid} {
        allow read: if owns(uid);
        allow create, update: if owns(uid) && validStatus();
        match /exercises/{eid} {
          allow read, write: if owns(uid);
          match /sets/{setId} { allow read, write: if owns(uid); }
        }
      }
    }
    match /{allPaths=**} { allow read, write: if false; }
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:emulator`
Expected: PASS — 6 tests, 0 failures (the deny-cases still pass — regression armor).

- [ ] **Step 7: Deploy the rules (the plan's second and last deploy; gated)**

Run: `npx -y firebase-tools@latest deploy --only firestore:rules`
Expected: `Deploy complete!` — required for the acceptance criterion "Firestore Security Rules prevent another user from reading my data" on the real project.

- [ ] **Step 8: Run the full gate + bootstrap gate**

Run: `npm run check && bash scripts/verify-bootstrap.sh`
Expected: four stages exit 0 and `PASS: universal bootstrap verified`.

- [ ] **Step 9: Commit (requires the user's commit authorization)**

```bash
git add firestore.rules firestore.indexes.json tests/firestore.rules.test.ts package.json package-lock.json
git commit -m "feat: add default-deny Firestore rules with emulator rules suite"
```

---

## Self-Review (checklist, run against the text above)

**1. Spec coverage**
- Brief Phase 2 "Firebase project configuration" → Tasks 1–2 (APIs, `.firebaserc`, `firebase.json`, Firestore DB, auth providers, web app, env) ✓
- Brief Phase 3 "Authentication" → Tasks 3–5 (toolchain, env, `useAuthSession`, `LoginPage`, emulator smoke) ✓
- Brief Phase 4 "Firestore schema + Security Rules" → Task 6 (rules + enum validation + emulator suite) ✓; full field-shape validation of every collection stays with Wave B's repository layer (DATA-MODEL says "exact validation … alongside its tests" at Phase 4 for enums — covered by `validStatus()`; numeric range checks are listed here as explicit non-goals so the gap is stated, not hidden)
- PROJECT-SPEC §15.14–15 → Tasks 5–6 gates ✓
- `firebase-auth-basics` workflow (auth block, `deploy --only auth`, authorized-domains rule) → Task 2 + Task 5 error copy ✓
- Gap report: email/password auth, App Check registration, `apps.yml` row, and Blaze/Functions remain out of plan (Waves B/D/E) by design.

**2. Placeholder scan** — the save-time command below is the evidence; expected exit 1 (no matches):
`grep -nE "TBD|TODO|implement later|fill in|appropriate error handling|add validation|handle edge cases|Similar to Task" docs/superpowers/plans/2026-09-23-wave-a-foundation.md`

**3. Type consistency** — `parseEnv(raw): AppEnv` defined in Task 4 and consumed in Task 5's hook; `initFirebase(env): { auth, db }` defined Task 4, consumed Task 5; `useAuthSession(): AuthSession` defined and consumed in Task 5 (`App`/`LoginPage`); `SIGN_IN_*`/`authErrorMessage` defined Task 5; `validStatus()` used only inside `firestore.rules` Task 6; emulator ports (9099 auth / 8080 firestore) identical in `firebase.json` (Task 1), `initFirebase` (Task 4), and the rules test (Task 6).

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-23-wave-a-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended in the skill)** — a fresh subagent per task with review between tasks. (Not available in this environment; equivalent = one task per checkpointed batch.)

**2. Inline Execution** — execute tasks in this session with checkpoints after each task's gate.

Default here: Inline Execution, Tasks 1–2 first (cloud foundation + Google sign-in enabled), then Tasks 3–6 as the code batch.
