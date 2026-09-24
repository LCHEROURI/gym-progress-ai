import { useAuthSession } from "./auth/useAuthSession";
import LoginPage from "./screens/LoginPage";

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
