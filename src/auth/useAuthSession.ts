import { useCallback, useEffect, useState } from "react";
import { initAuth } from "../data/firebase";
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
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void initAuth(parseEnv(import.meta.env))
      .then((authServices) => {
        if (cancelled) return;
        unsubscribe = authServices.observeAuthState(
          (nextUser) => {
            setUser(nextUser);
            setState("ready");
          },
          () => {
            setState("error");
            setError("Could not reach sign-in. Check your connection and try again.");
          },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setState("error");
          setError("Could not reach sign-in. Check your connection and try again.");
        }
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const signIn = useCallback(async () => {
    try {
      const authServices = await initAuth(parseEnv(import.meta.env));
      await authServices.signIn();
    } catch (e) {
      throw new Error(authErrorMessage((e as { code?: string }).code));
    }
  }, []);

  const signOut = useCallback(async () => {
    const authServices = await initAuth(parseEnv(import.meta.env));
    await authServices.signOut();
  }, []);

  return { user, state, error, signIn, signOut };
}
