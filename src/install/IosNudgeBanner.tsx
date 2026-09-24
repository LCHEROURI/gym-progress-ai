import { useEffect, useState } from "react";
import InstallStepsSheet from "./InstallStepsSheet";
import { trackInstallEvent } from "./install-analytics";
import { currentInstallEnv, currentLanguages, detectIosBrowser } from "./iosBrowser";
import { installCopy } from "./i18n";
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
 * browser installs manually through a Share menu), in the device's language.
 * Hidden off iOS, once installed, and after dismissal. Tapping the text opens
 * the full per-browser steps in a sheet (they also live in Settings).
 */
export default function IosNudgeBanner() {
  const [dismissed, setDismissed] = useState(alreadyDismissed);
  const [stepsOpen, setStepsOpen] = useState(false);
  const env = currentInstallEnv();
  const visible =
    !dismissed &&
    detectIosBrowser(env) !== null &&
    !env.standalone &&
    !isAppleStandalone();

  // Observability: one nudge_shown per actual display (fire-and-forget).
  useEffect(() => {
    if (visible) trackInstallEvent({ type: "nudge_shown" });
  }, [visible]);

  if (!visible) return null;
  const copy = installCopy(currentLanguages());
  return (
    <>
      <div className="nudgeBanner" role="note" aria-label="Install app">
        <button
          type="button"
          className="nudgeOpen"
          dir="auto"
          onClick={() => setStepsOpen(true)}
        >
          {copy.nudge}
        </button>
        <button
          type="button"
          className="nudgeDismiss"
          onClick={() => {
            trackInstallEvent({ type: "nudge_dismissed" });
            markDismissed();
            setDismissed(true);
          }}
        >
          {copy.dismiss}
        </button>
      </div>
      {stepsOpen && <InstallStepsSheet onClose={() => setStepsOpen(false)} />}
    </>
  );
}
