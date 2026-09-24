import { useAuthSession } from "./auth/useAuthSession";
import LoginPage from "./screens/LoginPage";
import TodayScreen from "./screens/TodayScreen";

export default function App() {
  const { user, state } = useAuthSession();
  return (
    <main>
      <h1>Gym Progress AI</h1>
      {state === "loading" && <p>Loading…</p>}
      {state === "ready" && !user && <LoginPage />}
      {state === "ready" && user && <TodayScreen today={new Date()} />}
    </main>
  );
}
