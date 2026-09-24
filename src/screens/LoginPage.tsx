import { useState } from "react";
import { useAuthSession } from "../auth/useAuthSession";
import IosNudgeBanner from "../install/IosNudgeBanner";

export default function LoginPage() {
  const { signIn } = useAuthSession();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onClick = () => {
    setBusy(true);
    setMessage(null);
    void signIn()
      .catch((e: unknown) =>
        setMessage(e instanceof Error ? e.message : "Could not sign in. Please try again."),
      )
      .finally(() => setBusy(false));
  };

  return (
    <section>
      <IosNudgeBanner />
      {message && <p role="alert">{message}</p>}
      <button type="button" onClick={onClick} disabled={busy}>
        {busy ? "Signing in…" : "Continue with Google"}
      </button>
    </section>
  );
}
