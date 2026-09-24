import { useCallback, useEffect, useState } from "react";
import { getInstallStatus } from "./installStatus";

/** The deferred install prompt captured from `beforeinstallprompt`. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function isStandalone(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches
  );
}

/** iOS Safari Home Screen mode (apple-mobile-web-app-capable). */
function isAppleStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * Captures the browser's deferred PWA install prompt so the app can offer its
 * own one-tap install button. The button only appears while the browser is
 * actually offering installation (Chrome/Edge; iOS Safari installs via Add to
 * Home Screen and never fires this event).
 */
export function useInstallPrompt(): {
  canInstall: boolean;
  installed: boolean;
  install: () => Promise<void>;
} {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installedThisSession, setInstalledThisSession] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Defer the browser's own prompt so the app can show its own button.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setInstalledThisSession(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    const captured = deferred;
    setDeferred(null); // one-shot: a captured prompt cannot be reused
    await captured.prompt();
    await captured.userChoice;
  }, [deferred]);

  const installed =
    getInstallStatus({
      standalone: isStandalone(),
      appleStandalone: isAppleStandalone(),
      installedThisSession,
    }) === "installed";

  return { canInstall: deferred !== null && !installed, installed, install };
}
