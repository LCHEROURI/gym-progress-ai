import { useEffect, useState } from "react";
import { isAppleStandalone, isStandalone } from "./useInstallPrompt";

const THANKS_MS = 6000;
const THANKED_KEY = "gpa-install-thanked";

/** iOS Safari installs manually and never fires `appinstalled`; thank once on
 * the first Home Screen launch instead. Storage-safe for Safari private mode. */
function alreadyThanked(): boolean {
  try {
    return localStorage.getItem(THANKED_KEY) === "1";
  } catch {
    return true;
  }
}

function markThanked(): void {
  try {
    localStorage.setItem(THANKED_KEY, "1");
  } catch {
    // storage unavailable: the one-time toast is simply skipped
  }
}

/**
 * Thank-you toast shown when the browser reports `appinstalled`, or on the
 * first Home Screen launch after a manual (iOS) install. Auto-dismisses so it
 * never blocks the workout flow.
 */
export default function InstallToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onInstalled = () => {
      markThanked();
      setVisible(true);
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  useEffect(() => {
    if ((isStandalone() || isAppleStandalone()) && !alreadyThanked()) {
      markThanked();
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), THANKS_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;
  return (
    <div className="installToast" role="status">
      <p>Thanks for installing Gym Progress AI!</p>
      <p>It now opens full screen from your Home Screen.</p>
      <button
        type="button"
        className="secondaryButton"
        onClick={() => setVisible(false)}
      >
        DISMISS
      </button>
    </div>
  );
}
