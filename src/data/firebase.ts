import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import type { AppEnv } from "../shared/env";

let cached: { app: ReturnType<typeof initializeApp>; auth: Auth; db: Firestore } | null = null;

export function initFirebase(env: AppEnv): {
  app: ReturnType<typeof initializeApp>;
  auth: Auth;
  db: Firestore;
} {
  if (cached) return cached;
  const theApp =
    getApps()[0] ??
    initializeApp({
      apiKey: env.apiKey,
      authDomain: env.authDomain,
      projectId: env.projectId,
      storageBucket: env.storageBucket,
      messagingSenderId: env.messagingSenderId,
      appId: env.appId,
    });
  const auth = getAuth(theApp);
  let db: Firestore;
  try {
    // Offline-first: every autosave lands on disk and syncs when the network returns.
    db = initializeFirestore(theApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    db = getFirestore(theApp);
  }
  if (env.useEmulator) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  cached = { app: theApp, auth, db };
  return cached;
}
