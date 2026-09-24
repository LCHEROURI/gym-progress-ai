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
      throw new Error(authErrorMessage((e as { code?: string }).code));
    }
  }, []);

  const signOut = useCallback(async () => {
    const { auth } = initFirebase(parseEnv(import.meta.env));
    await firebaseSignOut(auth);
  }, []);

  return { user, state, error, signIn, signOut };
}
