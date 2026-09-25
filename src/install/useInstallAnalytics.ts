import { useEffect } from "react";
import type { FirebaseServices } from "../data/firebase";
import {
  recordInstallEvent,
  type InstallEventInput,
} from "../data/install-events";
import { bindInstallEventRecorder } from "./install-analytics";
import { isAppleStandalone, isStandalone } from "./useInstallPrompt";

const INSTALLED_RECORDED = "gpa-install-recorded";

/** First call returns true and remembers; later calls return false. */
function claimFirstInstallRecord(): boolean {
  try {
    if (localStorage.getItem(INSTALLED_RECORDED) === "1") return false;
    localStorage.setItem(INSTALLED_RECORDED, "1");
    return true;
  } catch {
    // storage unavailable: skip rather than record on every launch
    return false;
  }
}

/**
 * Records the install funnel (`prompt_offered` → `prompt_result` → `installed`)
 * to Firestore for observability. Append-only and fire-and-forget: failures are
 * swallowed and never touch the install flow.
 */
export function useInstallAnalytics(services: FirebaseServices | null, uid: string): void {
  useEffect(() => {
    if (!services) return;
    const record = (input: InstallEventInput) => {
      void recordInstallEvent({ db: services.db }, uid, input).catch(() => undefined);
    };
    bindInstallEventRecorder(record);
    const onPrompt = () => record({ type: "prompt_offered" });
    const onInstalled = () => {
      if (claimFirstInstallRecord()) {
        record({ type: "installed", method: "browser_prompt" });
      }
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // Manual (iOS) install: `appinstalled` never fires, detect first launch.
    if ((isStandalone() || isAppleStandalone()) && claimFirstInstallRecord()) {
      record({ type: "installed", method: "home_screen" });
    }
    return () => {
      bindInstallEventRecorder(null);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [services, uid]);
}
