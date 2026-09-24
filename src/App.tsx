import { useAuthSession } from "./auth/useAuthSession";
import LoginPage from "./screens/LoginPage";
import WorkoutFlow from "./screens/WorkoutFlow";
import InstallToast from "./install/InstallToast";

export default function App() {
  const { user, state } = useAuthSession();
  return (
    <main>
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
      {state === "ready" && user && <WorkoutFlow uid={user.uid} />}
      <InstallToast />
    </main>
  );
}
