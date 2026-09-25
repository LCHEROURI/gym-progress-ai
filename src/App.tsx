import { lazy, Suspense } from "react";
import { useAuthSession } from "./auth/useAuthSession";
import LoginPage from "./screens/LoginPage";
import InstallToast from "./install/InstallToast";

const WorkoutFlow = lazy(() => import("./screens/WorkoutFlow"));

export default function App() {
  const { user, state } = useAuthSession();
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
      </header>
      {state === "loading" && <p>Loading…</p>}
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
