import { lazy, Suspense } from "react";
import { useAuthSession } from "./auth/useAuthSession";
import LoginPage from "./screens/LoginPage";
import InstallToast from "./install/InstallToast";
import BuildStatus from "./pwa/BuildStatus";

const WorkoutFlow = lazy(() => import("./screens/WorkoutFlow"));

export default function App() {
  const { user, state, error, retry } = useAuthSession();
  const signedOut = state === "ready" && !user;
  return (
    <main className={signedOut ? "landingShell" : undefined}>
      <header className="appBar">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 9v6M7.5 6.5v11M16.5 6.5v11M20 9v6M7.5 12h9" />
        </svg>
        <h1>Gym Progress AI</h1>
        <BuildStatus />
      </header>
      {state === "loading" && <p>Loading…</p>}
      {state === "error" && (
        <section aria-labelledby="auth-error-title">
          <h2 id="auth-error-title">Sign-in unavailable</h2>
          <p className="landingError" role="alert">
            {error ?? "Could not reach sign-in. Check your connection and try again."}
          </p>
          <button className="secondaryButton" type="button" onClick={retry}>
            Try again
          </button>
        </section>
      )}
      {state === "ready" && !user && <LoginPage />}
      {state === "ready" && user && (
        <Suspense fallback={<p>Loading your workout…</p>}>
          <WorkoutFlow uid={user.uid} />
        </Suspense>
      )}
      <InstallToast />
    </main>
  );
}
