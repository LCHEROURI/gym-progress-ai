import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import type { AppEnv } from "../shared/env";
import { initAppCheck } from "./app-check";

export interface FirebaseAuthServices {
  app: FirebaseApp;
  auth: Auth;
  observeAuthState: (
    onUser: (user: { uid: string; email: string | null } | null) => void,
    onError: (error: Error) => void,
  ) => () => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

export interface FirebaseServices extends FirebaseAuthServices {
  db: Firestore;
}

let authPromise: Promise<FirebaseAuthServices> | null = null;
let servicesPromise: Promise<FirebaseServices> | null = null;

/** Load only Auth for the signed-out app; keep Firestore out of the landing chunk. */
export function initAuth(env: AppEnv): Promise<FirebaseAuthServices> {
  if (!authPromise) {
    authPromise = Promise.all([import("firebase/app"), import("firebase/auth")])
      .then(async ([appSdk, authSdk]) => {
        const app =
          appSdk.getApps()[0] ??
          appSdk.initializeApp({
            apiKey: env.apiKey,
            authDomain: env.authDomain,
            projectId: env.projectId,
            storageBucket: env.storageBucket,
            messagingSenderId: env.messagingSenderId,
            appId: env.appId,
          });
        // App Check first, Auth and Firestore second. The token is attached at
        // request time, so anything that goes over the network has to be created
        // after this resolves. It is awaited but cannot reject: see ./app-check.
        await initAppCheck(app, env);
        const auth = authSdk.getAuth(app);
        if (env.useEmulator) {
          authSdk.connectAuthEmulator(auth, "http://127.0.0.1:9099", {
            disableWarnings: true,
          });
        }
        return {
          app,
          auth,
          observeAuthState: (
            onUser: (user: { uid: string; email: string | null } | null) => void,
            onError: (error: Error) => void,
          ) =>
            authSdk.onAuthStateChanged(
              auth,
              (user) => onUser(user ? { uid: user.uid, email: user.email } : null),
              onError,
            ),
          signIn: () =>
            authSdk.signInWithPopup(auth, new authSdk.GoogleAuthProvider()).then(() => undefined),
          signOut: () => authSdk.signOut(auth),
        };
      })
      .catch((error: unknown) => {
        authPromise = null;
        throw error;
      });
  }
  return authPromise;
}

/** Load Firestore only after the signed-in workout area is entered. */
export function initFirebase(env: AppEnv): Promise<FirebaseServices> {
  if (!servicesPromise) {
    const pendingServices = initAuth(env).then(async (authServices) => {
      const { app } = authServices;
      const firestoreSdk = await import("firebase/firestore");
      let db: Firestore;
      try {
        // Offline-first: autosaves persist locally and sync when the network returns.
        db = firestoreSdk.initializeFirestore(app, {
          localCache: firestoreSdk.persistentLocalCache({
            tabManager: firestoreSdk.persistentMultipleTabManager(),
          }),
        });
      } catch {
        db = firestoreSdk.getFirestore(app);
      }
      if (env.useEmulator) {
        firestoreSdk.connectFirestoreEmulator(db, "127.0.0.1", 8080);
      }
      return { ...authServices, db };
    });
    servicesPromise = pendingServices.catch((error: unknown) => {
      servicesPromise = null;
      throw error;
    });
  }
  return servicesPromise;
}
