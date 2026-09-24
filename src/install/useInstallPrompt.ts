import { useCallback, useEffect, useState } from "react";

/** The deferred install prompt captured from `beforeinstallprompt`. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches
  );
}

/**
 * Captures the browser's deferred PWA install prompt so the app can offer its
 * own one-tap install button. The button only appears while the browser is
 * actually offering installation (Chrome/Edge; iOS Safari installs via Add to
 * Home Screen and never fires this event).
 */
export function useInstallPrompt(): {
  canInstall: boolean;
  install: () => Promise<void>;
} {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Defer the browser's own prompt so the app can show its own button.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
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

  return { canInstall: deferred !== null && !isStandalone(), install };
}
