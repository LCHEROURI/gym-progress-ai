/**
 * App Check initialization.
 *
 * Why this exists: the client calls Gemini directly through `firebase/ai`
 * (see src/coach/chat.ts), which means any browser holding the web app config
 * can drive a billable request. App Check is the control that closes that, and
 * it only works if the client asks for a token — which is all this module does.
 *
 * Three rules, in priority order:
 *
 *  1. **Never block boot.** A security control that can take the app down is
 *     worse than the threat it mitigates. Every failure path here resolves,
 *     none of them throw; a missing site key or a blocked reCAPTCHA degrades to
 *     "no token" and the app runs exactly as it did before.
 *
 *  2. **Opt in, not required.** Without `VITE_APP_CHECK_SITE_KEY` there is no
 *     provider to register, so nothing is attempted. Local dev, the emulator
 *     suite, and CI need no console configuration to stay green. A hard
 *     failure on a missing key would make the app unrunnable in every
 *     environment that has not been registered yet — including this one.
 *
 *  3. **Start before Firestore.** Firestore reads the token at request time, so
 *     initialization is awaited inside `initAuth` before the Firestore instance
 *     exists. A late token costs one rejected request, not correctness.
 *
 * The `/__boot` endpoint is deliberately NOT App Check-enforced; see the
 * comment on `reportBootFailure` in functions/src/index.ts for why a pre-React
 * failure structurally cannot present a token.
 */
import type { FirebaseApp } from "firebase/app";
import type { AppEnv } from "../shared/env";

/**
 * Outcome of the attempt, for tests and for one honest console line. Only
 * `active` means a token is actually being attached to outgoing requests.
 */
export type AppCheckStatus = "active" | "disabled" | "emulator" | "failed";

let status: AppCheckStatus = "disabled";

/** Last outcome, for the settings screen and for tests. */
export function appCheckStatus(): AppCheckStatus {
  return status;
}

/**
 * Registers the reCAPTCHA v3 provider and begins automatic token refresh.
 *
 * Returns the outcome instead of throwing. `firebase/app-check` is imported
 * dynamically so the SDK stays out of the signed-out landing chunk — the same
 * reason `initAuth` in ./firebase.ts splits its imports.
 */
export async function initAppCheck(
  app: FirebaseApp,
  env: Pick<AppEnv, "appCheckSiteKey" | "useEmulator">,
): Promise<AppCheckStatus> {
  if (!env.appCheckSiteKey) {
    status = "disabled";
    return status;
  }
  // The emulators do not implement App Check, and a reCAPTCHA prompt during
  // emulator-driven testing is a hang, not a signal. Skipping is honest: the
  // emulator is not the attack surface App Check defends.
  if (env.useEmulator) {
    status = "emulator";
    return status;
  }

  try {
    const { initializeAppCheck, ReCaptchaV3Provider } = await import("firebase/app-check");
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(env.appCheckSiteKey),
      // Refresh ahead of expiry so a long-lived PWA tab does not start failing
      // its first Firestore write after an hour of being open on the gym floor.
      isTokenAutoRefreshEnabled: true,
    });
    status = "active";
  } catch (error) {
    // A blocked reCAPTCHA script, an ad blocker, a CSP change, or an
    // unregistered site key all land here. None of them should be fatal, and
    // none of them are worth a stack trace in front of a user mid-workout.
    console.warn("[app-check] initialization failed; continuing without a token:", error);
    status = "failed";
  }
  return status;
}
