import { useState } from "react";
import { currentInstallEnv, detectIosBrowser } from "./iosBrowser";
import { isAppleStandalone } from "./useInstallPrompt";

const DISMISS_KEY = "gpa-install-nudge-dismissed";

/** First visit returns false and remembers; dismissals persist. */
function alreadyDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    // storage unavailable: don't nag on every page
    return true;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // storage unavailable: the banner simply returns next visit
  }
}

/**
 * One-time install nudge on the TODAY screen for iOS visitors (every iOS
 * browser installs manually through a Share menu). Hidden off iOS, once
 * installed, and after dismissal — full per-browser steps live in Settings.
 */
export default function IosNudgeBanner() {
  const [dismissed, setDismissed] = useState(alreadyDismissed);
  if (dismissed) return null;
  const env = currentInstallEnv();
  if (detectIosBrowser(env) === null) return null;
  if (env.standalone || isAppleStandalone()) return null;
  return (
    <div className="nudgeBanner" role="note" aria-label="Install app">
      <p>Get the app: open Share and tap &ldquo;Add to Home Screen&rdquo;, then Add.</p>
      <button
        type="button"
        className="nudgeDismiss"
        onClick={() => {
          markDismissed();
          setDismissed(true);
        }}
      >
        DISMISS
      </button>
    </div>
  );
}
